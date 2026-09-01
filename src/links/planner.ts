import { dist2, dot2, norm2, sub2, type V2 } from '../core/vec'
import { segmentMeetsPolygon, segmentPointDistance } from '../core/polygon'
import type { Rng } from '../core/rng'
import { BuildingFaces, type Face } from '../atlas/faces'
import type { AtlasBlueprint, DistrictKind, Parcel, WealthTier } from '../types/atlas'
import type { ResolvedParams, LinkKindKey } from '../types/params'
import type { Aperture, ApertureKind, Link, LinkKind, LinkRef } from '../types/output'
import { buildLinkGeometry, CROSS_SECTIONS, WALKABLE, type LinkGeometry } from './geometry'

interface Candidate {
  a: string
  b: string
  faceA: Face
  faceB: Face
  span: number
  score: number
}

const KIND_ORDER: [LinkKindKey, LinkKind][] = [
  ['bridge', 'bridge'],
  ['acTube', 'ac-tube'],
  ['wire', 'wire'],
  ['tunnel', 'tunnel'],
]

const DISTRICT_W: Record<LinkKind, Record<DistrictKind, number>> = {
  bridge: { downtown: 1, commercial: 0.8, mixed: 0.5, industrial: 0.25, residential: 0.1 },
  'ac-tube': { industrial: 1, downtown: 0.7, commercial: 0.6, mixed: 0.4, residential: 0.15 },
  wire: { residential: 1, mixed: 0.8, commercial: 0.6, industrial: 0.5, downtown: 0.15 },
  tunnel: { downtown: 1, commercial: 0.7, mixed: 0.5, industrial: 0.4, residential: 0.2 },
}

const TIER_W: Record<LinkKind, Record<WealthTier, number>> = {
  bridge: { poor: 0.2, mid: 0.5, rich: 0.8, high_rich: 1 },
  'ac-tube': { poor: 0.5, mid: 0.5, rich: 0.5, high_rich: 0.5 },
  wire: { poor: 1, mid: 0.7, rich: 0.3, high_rich: 0.1 },
  tunnel: { poor: 0.2, mid: 0.5, rich: 0.8, high_rich: 1 },
}

/** Building types whose basements justify an underground tunnel. */
const TUNNEL_TYPES = new Set(['corpo', 'military', 'police', 'hospital', 'mall'])

const BASE_GRID = 4
const U_FRACTIONS = [0.5, 0.32, 0.68]
/** The base-separation invariant: on one building, bases are equal or at least this far apart. */
const BASE_SEPARATION = 2.5

/** Selects link pairs per kind (skyway heuristics), places bases on a grid, builds exact geometry. */
export class LinkPlanner {
  private readonly faces = new Map<string, BuildingFaces>()
  private readonly heights = new Map<string, number>()
  private readonly districtKind = new Map<string, DistrictKind>()
  /** Bounding circle per parcel for cheap pair and obstruction prefilters. */
  private readonly bounds = new Map<string, { c: V2; r: number }>()
  /** Accepted links per `${kind}:${buildingId}`. */
  private readonly linkCount = new Map<string, number>()
  private readonly usedBases = new Map<string, number[]>()
  private readonly usedFaceSpans = new Map<string, [number, number][]>()

  private readonly links: Link[] = []
  private readonly apertures: Aperture[] = []
  private readonly refs: LinkRef[] = []

  constructor(
    private readonly atlas: AtlasBlueprint,
    private readonly params: ResolvedParams,
    private readonly rng: Rng,
  ) {
    for (const p of atlas.parcels) {
      this.faces.set(p.id, new BuildingFaces(p))
      const c: V2 = [
        p.footprint.reduce((s, v) => s + v[0], 0) / p.footprint.length,
        p.footprint.reduce((s, v) => s + v[1], 0) / p.footprint.length,
      ]
      this.bounds.set(p.id, { c, r: Math.max(...p.footprint.map((v) => dist2(c, v))) })
    }
    for (const b of atlas.volumetric.buildings) this.heights.set(b.parcelId, b.height)
    for (const d of atlas.districts) this.districtKind.set(d.id, d.kind)
  }

  plan(): { links: Link[]; apertures: Aperture[]; refs: LinkRef[] } {
    const t = this.params.toggles
    const enabled: Record<LinkKindKey, boolean> = { bridge: t.bridges, acTube: t.acTubes, wire: t.wires, tunnel: t.tunnels }
    for (const [key, kind] of KIND_ORDER) {
      if (enabled[key]) this.planKind(key, kind)
    }
    return { links: this.links, apertures: this.apertures, refs: this.refs }
  }

  private planKind(key: LinkKindKey, kind: LinkKind): void {
    const limits = this.params.links[key]
    const rng = this.rng.fork(`links:${key}`)
    const candidates = this.collectCandidates(kind, limits.minLength, limits.maxLength)
    candidates.sort((x, y) => y.score - x.score || x.a.localeCompare(y.a) || x.b.localeCompare(y.b))
    let budget = Math.ceil(limits.density * candidates.length)
    for (const c of candidates) {
      if (budget <= 0) break
      if ((this.linkCount.get(`${kind}:${c.a}`) ?? 0) >= limits.maxPerBuilding) continue
      if ((this.linkCount.get(`${kind}:${c.b}`) ?? 0) >= limits.maxPerBuilding) continue
      if (this.tryBuild(c, key, kind, rng)) budget--
    }
  }

  /** Facing building pairs within span range, scored by district, tier and span. */
  private collectCandidates(kind: LinkKind, minLen: number, maxLen: number): Candidate[] {
    const out: Candidate[] = []
    const parcels = this.atlas.parcels.filter((p) => this.eligible(kind, p))
    for (let i = 0; i < parcels.length; i++) {
      for (let j = i + 1; j < parcels.length; j++) {
        const a = parcels[i]
        const b = parcels[j]
        const ba = this.bounds.get(a.id)!
        const bb = this.bounds.get(b.id)!
        if (dist2(ba.c, bb.c) - ba.r - bb.r > maxLen) continue
        const pair = this.bestFacingPair(a, b, minLen, maxLen)
        if (!pair) continue
        const dw = (DISTRICT_W[kind][this.districtKind.get(a.districtId)!] + DISTRICT_W[kind][this.districtKind.get(b.districtId)!]) / 2
        const tw = (TIER_W[kind][a.tier] + TIER_W[kind][b.tier]) / 2
        if (dw < 0.2) continue
        const score = 0.45 * dw + 0.2 * tw + 0.35 * (1 - pair.span / maxLen)
        out.push({ a: a.id, b: b.id, faceA: pair.faceA, faceB: pair.faceB, span: pair.span, score })
      }
    }
    return out
  }

  private eligible(kind: LinkKind, p: Parcel): boolean {
    const h = this.heights.get(p.id)!
    switch (kind) {
      case 'bridge':
        return h >= this.params.links.bridge.minBase + CROSS_SECTIONS.bridge.height + 3
      case 'ac-tube':
        return h >= this.params.links.acTube.minBase + CROSS_SECTIONS['ac-tube'].height + 2
      case 'wire':
        return h >= 8
      case 'tunnel':
        return TUNNEL_TYPES.has(p.type) || p.tier === 'high_rich'
    }
  }

  /** The face pair of two buildings that oppose each other most directly, if any. */
  private bestFacingPair(a: Parcel, b: Parcel, minLen: number, maxLen: number): { faceA: Face; faceB: Face; span: number } | null {
    const fa = this.faces.get(a.id)!
    const fb = this.faces.get(b.id)!
    let best: { faceA: Face; faceB: Face; span: number } | null = null
    for (const faceA of fa.faces) {
      for (const faceB of fb.faces) {
        if (dot2(faceA.normal, faceB.normal) > -0.5) continue
        const between = norm2(sub2(faceB.mid, faceA.mid))
        if (dot2(between, faceA.normal) < 0.6 || -dot2(between, faceB.normal) < 0.6) continue
        const span = dist2(faceA.mid, faceB.mid)
        if (span < minLen || span > maxLen) continue
        if (!best || span < best.span) best = { faceA, faceB, span }
      }
    }
    return best
  }

  private tryBuild(c: Candidate, key: LinkKindKey, kind: LinkKind, rng: Rng): boolean {
    const cross = CROSS_SECTIONS[kind]
    const [baseA, baseB] = this.pickBases(c, key, kind, rng)
    if (baseA === null || baseB === null) return false
    for (const frac of U_FRACTIONS) {
      const uA = c.faceA.length * frac
      const uB = c.faceB.length * (1 - frac)
      const geo = buildLinkGeometry(
        this.faces.get(c.a)!, c.faceA, uA, baseA + cross.height / 2,
        this.faces.get(c.b)!, c.faceB, uB, baseB + cross.height / 2,
        kind === 'wire' ? 'wire-anchor' : (kind as ApertureKind), cross,
      )
      if (!geo) continue
      if (!this.respectsBaseInvariant(c.a, geo.apertureA.base) || !this.respectsBaseInvariant(c.b, geo.apertureB.base)) continue
      if (this.overlapsFace(c.a, c.faceA.index, geo.apertureA) || this.overlapsFace(c.b, c.faceB.index, geo.apertureB)) continue
      if (kind !== 'tunnel' && this.obstructed(c.a, c.b, geo)) continue
      this.accept(c, kind, geo)
      return true
    }
    return false
  }

  /** Grid bases inside both buildings' feasible ranges; occasionally one step apart for a diagonal. */
  private pickBases(c: Candidate, key: LinkKindKey, kind: LinkKind, rng: Rng): [number | null, number | null] {
    const limits = this.params.links[key]
    const cross = CROSS_SECTIONS[kind]
    if (kind === 'tunnel') return [limits.minBase, limits.minBase]
    const top = (id: string) => this.heights.get(id)! - cross.height - 2
    const gridIn = (lo: number, hi: number): number[] => {
      const out: number[] = []
      for (let v = Math.ceil(lo / BASE_GRID) * BASE_GRID; v <= hi; v += BASE_GRID) out.push(v)
      return out
    }
    let lo = limits.minBase
    if (kind === 'wire') lo = Math.max(lo, Math.min(top(c.a), top(c.b)) * 0.6)
    const shared = gridIn(lo, Math.min(top(c.a), top(c.b)))
    if (shared.length === 0) return [null, null]
    const base = rng.pick(shared)
    if (kind !== 'wire' && rng.next() < 0.25) {
      const higher = base + BASE_GRID
      if (higher <= top(c.b)) return [base, higher]
    }
    return [base, base]
  }

  /** True when the link's ground track crosses a third building shorter than nowhere: any
   * intersected footprint whose volume reaches above the link's lowest point blocks it. */
  private obstructed(aId: string, bId: string, geo: LinkGeometry): boolean {
    const start = geo.path[0]
    const end = geo.path[geo.path.length - 1]
    const track: [V2, V2] = [[start[0], start[2]], [end[0], end[2]]]
    const minY = Math.min(...geo.path.map((p) => p[1]))
    for (const p of this.atlas.parcels) {
      if (p.id === aId || p.id === bId) continue
      if (this.heights.get(p.id)! + 1 < minY) continue
      const b = this.bounds.get(p.id)!
      if (segmentPointDistance(track[0], track[1], b.c) > b.r + 1) continue
      if (segmentMeetsPolygon(track[0], track[1], p.footprint)) return true
    }
    return false
  }

  private respectsBaseInvariant(buildingId: string, base: number): boolean {
    const used = this.usedBases.get(buildingId) ?? []
    return used.every((u) => Math.abs(u - base) < 1e-6 || Math.abs(u - base) >= BASE_SEPARATION)
  }

  private overlapsFace(buildingId: string, face: number, ap: { u: number; width: number }): boolean {
    const key = `${buildingId}:${face}`
    const spans = this.usedFaceSpans.get(key) ?? []
    const lo = ap.u - ap.width / 2 - 0.3
    const hi = ap.u + ap.width / 2 + 0.3
    return spans.some(([a, b]) => lo < b && hi > a)
  }

  private accept(c: Candidate, kind: LinkKind, geo: LinkGeometry): void {
    const id = `l${this.links.length}`
    const apA: Aperture = { ...geo.apertureA, id: `${id}a`, linkId: id }
    const apB: Aperture = { ...geo.apertureB, id: `${id}b`, linkId: id }
    this.apertures.push(apA, apB)
    this.links.push({
      id,
      kind,
      a: { buildingId: c.a, floor: apA.floor, face: apA.face, apertureId: apA.id },
      b: { buildingId: c.b, floor: apB.floor, face: apB.face, apertureId: apB.id },
      path: geo.path,
      crossSection: CROSS_SECTIONS[kind],
      walkable: WALKABLE[kind],
      length: geo.length,
    })
    this.refs.push({ linkId: id, kind, buildingA: c.a, buildingB: c.b })
    this.linkCount.set(`${kind}:${c.a}`, (this.linkCount.get(`${kind}:${c.a}`) ?? 0) + 1)
    this.linkCount.set(`${kind}:${c.b}`, (this.linkCount.get(`${kind}:${c.b}`) ?? 0) + 1)
    for (const ap of [apA, apB]) {
      this.usedBases.set(ap.buildingId, [...(this.usedBases.get(ap.buildingId) ?? []), ap.base])
      const key = `${ap.buildingId}:${ap.face}`
      this.usedFaceSpans.set(key, [...(this.usedFaceSpans.get(key) ?? []), [ap.u - ap.width / 2, ap.u + ap.width / 2]])
    }
  }
}
