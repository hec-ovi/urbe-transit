import { dist2, dot2, norm2, sub2 } from '../core/vec'
import type { Rng } from '../core/rng'
import type { Face } from '../atlas/faces'
import type { AtlasBlueprint, DistrictKind, Parcel, WealthTier } from '../types/atlas'
import type { ResolvedParams, FacingKindKey } from '../types/params'
import type { ApertureKind, LinkKind } from '../types/output'
import { buildLinkGeometry, CROSS_SECTIONS } from './geometry'
import { StreetBands } from './clearance'
import { linkSolid, StationVolumes } from './stations'
import type { BuildingIndex } from './buildings'
import type { LinkRegistry } from './registry'

interface Candidate {
  a: string
  b: string
  faceA: Face
  faceB: Face
  span: number
  score: number
}

type FacingKind = 'bridge' | 'ac-tube' | 'tunnel'

const DISTRICT_W: Record<FacingKind, Record<DistrictKind, number>> = {
  bridge: { downtown: 1, commercial: 0.8, mixed: 0.5, industrial: 0.25, residential: 0.1 },
  'ac-tube': { industrial: 1, downtown: 0.7, commercial: 0.6, mixed: 0.4, residential: 0.15 },
  tunnel: { downtown: 1, commercial: 0.7, mixed: 0.5, industrial: 0.4, residential: 0.2 },
}

const TIER_W: Record<FacingKind, Record<WealthTier, number>> = {
  bridge: { poor: 0.2, mid: 0.5, rich: 0.8, high_rich: 1 },
  'ac-tube': { poor: 0.5, mid: 0.5, rich: 0.5, high_rich: 0.5 },
  tunnel: { poor: 0.2, mid: 0.5, rich: 0.8, high_rich: 1 },
}

/** Building types whose basements justify an underground tunnel. */
const TUNNEL_TYPES = new Set(['corpo', 'military', 'police', 'hospital', 'mall'])

const BASE_GRID = 4
const U_FRACTIONS = [0.5, 0.32, 0.68]

/** Face stations of one candidate: where on each face the link would land. */
interface Station {
  uA: number
  uB: number
}

/** Picks facing building pairs per kind, places bases on a grid, builds exact geometry. */
export class LinkPlanner {
  private readonly districtKind = new Map<string, DistrictKind>()
  private readonly bands: StreetBands
  private readonly stations: StationVolumes

  constructor(
    private readonly atlas: AtlasBlueprint,
    private readonly params: ResolvedParams,
    private readonly buildings: BuildingIndex,
    private readonly registry: LinkRegistry,
  ) {
    for (const d of atlas.districts) this.districtKind.set(d.id, d.kind)
    this.bands = new StreetBands(atlas)
    this.stations = new StationVolumes(atlas)
  }

  plan(key: FacingKindKey, kind: FacingKind, rng: Rng): void {
    const limits = this.params.links[key]
    const candidates = this.collectCandidates(kind, limits.minLength, limits.maxLength)
    candidates.sort((x, y) => y.score - x.score || x.a.localeCompare(y.a) || x.b.localeCompare(y.b))
    let budget = Math.ceil(limits.density * candidates.length)
    for (const c of candidates) {
      if (budget <= 0) break
      if (this.registry.count(kind, c.a) >= limits.maxPerBuilding) continue
      if (this.registry.count(kind, c.b) >= limits.maxPerBuilding) continue
      if (this.tryBuild(c, key, kind, rng)) budget--
    }
  }

  /** Facing building pairs within span range, scored by district, tier and span. */
  private collectCandidates(kind: FacingKind, minLen: number, maxLen: number): Candidate[] {
    const out: Candidate[] = []
    const parcels = this.atlas.parcels.filter((p) => this.eligible(kind, p))
    for (let i = 0; i < parcels.length; i++) {
      for (let j = i + 1; j < parcels.length; j++) {
        const a = parcels[i]
        const b = parcels[j]
        const ba = this.buildings.bounds(a.id)
        const bb = this.buildings.bounds(b.id)
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

  private eligible(kind: FacingKind, p: Parcel): boolean {
    const h = this.buildings.height(p.id)
    switch (kind) {
      case 'bridge':
        return h >= this.params.links.bridge.minBase + CROSS_SECTIONS.bridge.height + 3
      case 'ac-tube':
        return h >= this.params.links.acTube.minBase + CROSS_SECTIONS['ac-tube'].height + 2
      case 'tunnel':
        return TUNNEL_TYPES.has(p.type) || p.tier === 'high_rich'
    }
  }

  /** The face pair of two buildings that oppose each other most directly, if any. */
  private bestFacingPair(a: Parcel, b: Parcel, minLen: number, maxLen: number): { faceA: Face; faceB: Face; span: number } | null {
    const fa = this.buildings.faces(a.id)
    const fb = this.buildings.faces(b.id)
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

  private tryBuild(c: Candidate, key: FacingKindKey, kind: FacingKind, rng: Rng): boolean {
    const cross = CROSS_SECTIONS[kind]
    const stations: Station[] = U_FRACTIONS.map((frac) => ({
      uA: c.faceA.length * frac,
      uB: c.faceB.length * (1 - frac),
    }))
    const floor = kind === 'tunnel' ? -Infinity : this.clearanceFloor(c, stations, cross.width / 2)
    const bases = this.baseCandidates(c, key, kind, rng, floor)
    for (const { uA, uB } of stations) {
      for (const [baseA, baseB] of bases) {
        const geo = buildLinkGeometry(
          this.buildings.faces(c.a), c.faceA, uA, baseA + cross.height / 2,
          this.buildings.faces(c.b), c.faceB, uB, baseB + cross.height / 2,
          kind as ApertureKind, cross,
        )
        if (!geo) continue
        // The lower aperture base is the link's underside: the miter cut reaches its lowest there.
        if (Math.min(geo.apertureA.base, geo.apertureB.base) < floor - 1e-9) continue
        if (!this.registry.fits(geo.apertureA) || !this.registry.fits(geo.apertureB)) continue
        const solid = linkSolid(geo.path, cross.width, cross.height)
        if (this.stations.hits(solid.a, solid.b, solid.bottom, solid.top, solid.halfWidth)) continue
        if (kind !== 'tunnel' && this.buildings.blocks(c.a, c.b, geo.path, cross.width, cross.height)) continue
        this.registry.add(kind as LinkKind, c.a, c.b, geo)
        return true
      }
    }
    return false
  }

  /** Lowest underside the streets under this pair allow, over every station the pair can use. */
  private clearanceFloor(c: Candidate, stations: readonly Station[], halfWidth: number): number {
    let floor = -Infinity
    for (const { uA, uB } of stations) {
      const a = this.buildings.faces(c.a).pointOn(c.faceA, uA, 0)
      const b = this.buildings.faces(c.b).pointOn(c.faceB, uB, 0)
      floor = Math.max(floor, this.bands.floorOver([a[0], a[2]], [b[0], b[2]], halfWidth))
    }
    return floor
  }

  /** Grid bases inside both buildings' feasible ranges, tried from a seeded start; the first
   *  entry of a pair is occasionally one step lower, for a diagonal. */
  private baseCandidates(c: Candidate, key: FacingKindKey, kind: FacingKind, rng: Rng, floor: number): [number, number][] {
    const limits = this.params.links[key]
    if (kind === 'tunnel') return [[limits.minBase, limits.minBase]]
    const cross = CROSS_SECTIONS[kind]
    const top = (id: string) => this.buildings.height(id) - cross.height - 2
    const ceiling = Math.min(top(c.a), top(c.b))
    const grid: number[] = []
    for (let v = Math.ceil(Math.max(limits.minBase, floor) / BASE_GRID) * BASE_GRID; v <= ceiling; v += BASE_GRID) grid.push(v)
    if (grid.length === 0) return []
    const start = rng.int(0, grid.length - 1)
    const stepUp = rng.next() < 0.25
    const out: [number, number][] = []
    for (let i = 0; i < grid.length; i++) {
      const base = grid[(start + i) % grid.length]
      if (stepUp && base + BASE_GRID <= top(c.b)) out.push([base, base + BASE_GRID])
      out.push([base, base])
    }
    return out
  }
}
