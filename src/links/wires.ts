import { norm2, perp2, scale2, sub2, type V2 } from '../core/vec'
import { arcLengths, pointAt, segmentPointDistance, segmentsIntersect, trimPolyline } from '../core/polygon'
import { bbox, grow, overlaps, type Box } from '../core/box'
import type { Rng } from '../core/rng'
import { StreetIndex } from '../networks/street-util'
import type { AtlasBlueprint, StreetEdge } from '../types/atlas'
import type { LinkLimits, ResolvedParams } from '../types/params'
import { buildLinkGeometry, CROSS_SECTIONS } from './geometry'
import type { BuildingIndex } from './buildings'
import { castFacade, type FacadeHit } from './facades'
import type { LinkRegistry } from './registry'
import { linkSolid, StationVolumes } from './stations'

/** Spacing of candidate anchor stations along a street, meters. */
const ANCHOR_SPACING = 8
/** Along-street offset of the far anchor: 0 spans straight across, the rest criss-cross. */
const CROSS_OFFSETS = [0, 5, -5, 8]
/** Vertical spacing of the anchor tiers; above the base-separation invariant with room to spare. */
const LEVEL_STEP = 3
/** Facade-to-facade span that counts as fully narrow. */
const NARROW_SPAN = 12
const SHORT_BLOCK = 40
const LONG_BLOCK = 160
/** Roof clearance above an anchor. */
const HEAD_ROOM = 1

/** Weight per atlas street class. The list is additive, so an unknown class falls back on width. */
const CLASS_WEIGHT: Record<string, number> = {
  alley: 1,
  street: 0.7,
  road: 0.15,
  highway: 0,
}

function weightByWidth(width: number): number {
  if (width <= 6) return 1
  if (width <= 9) return 0.7
  if (width <= 12) return 0.15
  return 0
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v))

/**
 * Wires span facade to facade overhead across a street, biased hard to narrow and short ones:
 * several per short block on alleys and streets, few on roads, none on avenues and highways.
 * Both anchors of a wire sit at the same height, which keeps every anchor base on a building
 * either identical or a full tier apart (the aperture base-separation invariant).
 */
export class WirePlanner {
  private readonly streets: StreetIndex
  private readonly limits: LinkLimits
  private readonly levels: number[]
  private readonly boxes = new Map<string, Box>()
  private readonly stations: StationVolumes

  constructor(
    private readonly atlas: AtlasBlueprint,
    params: ResolvedParams,
    private readonly buildings: BuildingIndex,
    private readonly registry: LinkRegistry,
  ) {
    this.streets = new StreetIndex(atlas)
    this.limits = params.links.wire
    this.levels = anchorLevels(this.limits)
    for (const e of atlas.streets.edges) this.boxes.set(e.id, bbox(e.path))
    this.stations = new StationVolumes(atlas)
  }

  plan(rng: Rng): void {
    if (this.levels.length === 0) return
    for (const edge of this.atlas.streets.edges) {
      const weight = this.streetWeight(edge)
      if (weight <= 0) continue
      this.planEdge(edge, weight, rng.fork(edge.id))
    }
  }

  /** How much wire a street earns: narrow and short scores high, wide and long scores zero. */
  private streetWeight(edge: StreetEdge): number {
    const cls = CLASS_WEIGHT[edge.class] ?? weightByWidth(edge.width)
    if (cls <= 0) return 0
    const span = edge.width + edge.sidewalk.left + edge.sidewalk.right
    if (span > this.limits.maxLength) return 0
    const narrow = clamp01((this.limits.maxLength - span) / (this.limits.maxLength - NARROW_SPAN))
    const arcs = arcLengths(edge.path)
    const length = arcs[arcs.length - 1]
    const short = clamp01((LONG_BLOCK - length) / (LONG_BLOCK - SHORT_BLOCK))
    return cls * (0.35 + 0.65 * narrow) * (0.4 + 0.6 * short)
  }

  private planEdge(edge: StreetEdge, weight: number, rng: Rng): void {
    const path = trimPolyline(edge.path, this.streets.setback(edge.from), this.streets.setback(edge.to))
    if (path.length < 2) return
    const arcs = arcLengths(path)
    const length = arcs[arcs.length - 1]
    const stations = Math.floor(length / ANCHOR_SPACING)
    const count = Math.min(stations, Math.round(stations * weight * this.limits.density))
    if (count < 1) return

    const reach = this.limits.maxLength
    const candidates = this.buildings.near(path, reach)
    if (candidates.length < 2) return
    const neighbours = this.neighbourStreets(edge, path, reach)
    const minHalf = edge.width / 2

    for (let i = 0; i < count; i++) {
      const s = (i + 0.5) * (length / count) + (rng.next() * 2 - 1) * 2
      const first = rng.int(0, CROSS_OFFSETS.length - 1)
      const sign = rng.next() < 0.5 ? 1 : -1
      const a = this.anchor(path, arcs, s, 1, candidates, minHalf, reach)
      if (!a) continue
      // The far anchor slides along the street, so neighbouring wires criss-cross; a station that
      // cannot land its offset anchor falls back to the next offset before it is given up.
      for (let k = 0; k < CROSS_OFFSETS.length; k++) {
        const offset = CROSS_OFFSETS[(first + k) % CROSS_OFFSETS.length] * sign
        const b = this.anchor(path, arcs, s + offset, -1, candidates, minHalf, reach)
        if (!b || a.buildingId === b.buildingId) continue
        if (crossesAny(neighbours, a.point, b.point)) continue
        if (this.tryBuild(a, b, rng)) break
      }
    }
  }

  /** Street centerlines close enough that a wire on this edge could reach over them. */
  private neighbourStreets(edge: StreetEdge, path: V2[], reach: number): V2[][] {
    const box = grow(bbox(path), reach)
    const out: V2[][] = []
    for (const other of this.atlas.streets.edges) {
      if (other.id === edge.id || !overlaps(box, this.boxes.get(other.id)!)) continue
      const close = other.path.some((p) => path.some((q, i) => i > 0 && segmentPointDistance(path[i - 1], q, p) <= reach))
      if (close) out.push(other.path)
    }
    return out
  }

  /** Cast across the street from arc length `s` to the first facade on the given side. */
  private anchor(
    path: V2[], arcs: number[], s: number, side: 1 | -1,
    candidates: readonly string[], minHalf: number, reach: number,
  ): FacadeHit | null {
    const total = arcs[arcs.length - 1]
    const at = Math.max(0.5, Math.min(total - 0.5, s))
    const origin = pointAt(path, arcs, at)
    const ahead = pointAt(path, arcs, Math.min(total, at + 0.5))
    const behind = pointAt(path, arcs, Math.max(0, at - 0.5))
    const dir = scale2(perp2(norm2(sub2(ahead, behind))), side)
    return castFacade(origin, dir, candidates, this.buildings, minHalf, reach)
  }

  private tryBuild(a: FacadeHit, b: FacadeHit, rng: Rng): boolean {
    const span = a.distance + b.distance
    if (span < this.limits.minLength || span > this.limits.maxLength) return false
    if (this.registry.count('wire', a.buildingId) >= this.limits.maxPerBuilding) return false
    if (this.registry.count('wire', b.buildingId) >= this.limits.maxPerBuilding) return false
    const start = rng.int(0, this.levels.length - 1)
    for (let k = 0; k < this.levels.length; k++) {
      const level = this.levels[(start + k) % this.levels.length]
      if (this.buildings.height(a.buildingId) < level + HEAD_ROOM) continue
      if (this.buildings.height(b.buildingId) < level + HEAD_ROOM) continue
      const geo = buildLinkGeometry(
        this.buildings.faces(a.buildingId), a.face, a.u, level,
        this.buildings.faces(b.buildingId), b.face, b.u, level,
        'wire-anchor', CROSS_SECTIONS.wire,
      )
      if (!geo) continue
      if (!this.registry.fits(geo.apertureA) || !this.registry.fits(geo.apertureB)) continue
      const solid = linkSolid(geo.path, CROSS_SECTIONS.wire.height)
      if (this.stations.hits(solid.a, solid.b, solid.bottom, solid.top)) continue
      if (this.buildings.blocks(a.buildingId, b.buildingId, geo.path)) continue
      this.registry.add('wire', a.buildingId, b.buildingId, geo)
      return true
    }
    return false
  }
}

/** True when the wire's ground track crosses one of these centerlines: it would span two streets. */
function crossesAny(streets: readonly V2[][], a: V2, b: V2): boolean {
  for (const path of streets) {
    for (let i = 1; i < path.length; i++) {
      if (segmentsIntersect(a, b, path[i - 1], path[i])) return true
    }
  }
  return false
}

/** Anchor tiers inside the height band, spaced so two tiers never break base separation. */
function anchorLevels(limits: LinkLimits): number[] {
  const radius = CROSS_SECTIONS.wire.height / 2
  const lo = limits.minBase + radius + 0.5
  const hi = (limits.maxBase ?? limits.minBase) - radius
  const out: number[] = []
  for (let y = lo; y <= hi + 1e-9; y += LEVEL_STEP) out.push(y)
  return out
}
