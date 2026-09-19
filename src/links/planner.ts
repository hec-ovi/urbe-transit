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
import { DEFAULT_FLOOR_HEIGHT } from './stack'

interface Candidate {
  a: string
  b: string
  faceA: Face
  faceB: Face
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

const BASE_GRID = DEFAULT_FLOOR_HEIGHT
/** Clear band kept between the top of a link cut and the roof it attaches under. */
const ROOF_HEAD_ROOM = 2
/** Peer rule: a bridge or an ac-tube joins roofs at most this far apart, two floors. */
const PEER_ROOF_GAP = 9
/** Peer rule: a bridge or an ac-tube starts at least this high over the ground. */
const PEER_MIN_BASE = 9
const U_FRACTIONS = [0.5, 0.32, 0.68]

const KEY_BY_KIND: Record<FacingKind, FacingKindKey> = { bridge: 'bridge', 'ac-tube': 'acTube', tunnel: 'tunnel' }

/** Face stations of one candidate: where on each face the link would land. */
interface Station {
  uA: number
  uB: number
}

/**
 * Picks facing building pairs per kind, places bases on a grid, builds exact geometry.
 * A bridge or an ac-tube only joins peers: roofs within two floors of each other, one base at
 * least 9 m over the ground, level on both facades. A pair outside that band takes no link.
 */
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

  plan(kind: FacingKind, rng: Rng): void {
    const limits = this.params.links[KEY_BY_KIND[kind]]
    const candidates = this.collectCandidates(kind, limits.minLength, limits.maxLength)
    candidates.sort((x, y) => y.score - x.score || x.a.localeCompare(y.a) || x.b.localeCompare(y.b))
    let budget = Math.ceil(limits.density * candidates.length)
    for (const c of candidates) {
      if (budget <= 0) break
      if (this.registry.count(kind, c.a) >= limits.maxPerBuilding) continue
      if (this.registry.count(kind, c.b) >= limits.maxPerBuilding) continue
      if (this.tryBuild(c, kind, rng)) budget--
    }
  }

  /** Facing building pairs within span range, scored by district, tier and span. */
  private collectCandidates(kind: FacingKind, minLen: number, maxLen: number): Candidate[] {
    const out: Candidate[] = []
    const parcels = this.atlas.parcels.filter((p) => this.eligible(kind, p))
    const order = new Map(parcels.map((parcel, index) => [parcel.id, index]))
    for (let i = 0; i < parcels.length; i++) {
      const a = parcels[i]
      for (const b of this.buildings.neighbours(a.id, maxLen)) {
        const j = order.get(b.id)
        if (j === undefined || j <= i) continue
        if (kind !== 'tunnel' && Math.abs(this.buildings.height(a.id) - this.buildings.height(b.id)) > PEER_ROOF_GAP) continue
        const ba = this.buildings.bounds(a.id)
        const bb = this.buildings.bounds(b.id)
        if (dist2(ba.c, bb.c) - ba.r - bb.r > maxLen) continue
        const pair = this.bestFacingPair(a, b, minLen, maxLen)
        if (!pair) continue
        const dw = (DISTRICT_W[kind][this.districtKind.get(a.districtId)!] + DISTRICT_W[kind][this.districtKind.get(b.districtId)!]) / 2
        const tw = (TIER_W[kind][a.tier] + TIER_W[kind][b.tier]) / 2
        if (dw < 0.2) continue
        const score = 0.45 * dw + 0.2 * tw + 0.35 * (1 - pair.span / maxLen)
        out.push({ a: a.id, b: b.id, faceA: pair.faceA, faceB: pair.faceB, score })
      }
    }
    return out
  }

  private eligible(kind: FacingKind, p: Parcel): boolean {
    if (!this.buildings.stands(p.id)) return false
    if (kind === 'tunnel') return TUNNEL_TYPES.has(p.type) || p.tier === 'high_rich'
    return this.buildings.height(p.id) >= this.minBase(kind) + CROSS_SECTIONS[kind].height + ROOF_HEAD_ROOM
  }

  /** Lowest base this kind may start at: a peer link clears the ground, a tunnel keeps its own. */
  private minBase(kind: FacingKind): number {
    const { minBase } = this.params.links[KEY_BY_KIND[kind]]
    return kind === 'tunnel' ? minBase : Math.max(minBase, PEER_MIN_BASE)
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

  private tryBuild(c: Candidate, kind: FacingKind, rng: Rng): boolean {
    const cross = CROSS_SECTIONS[kind]
    const stations: Station[] = U_FRACTIONS.map((frac) => ({
      uA: c.faceA.length * frac,
      uB: c.faceB.length * (1 - frac),
    }))
    const bases = kind === 'tunnel'
      ? [this.minBase(kind)]
      : this.baseCandidates(c, kind, rng, Math.max(this.minBase(kind), this.clearanceFloor(c, stations, cross.width / 2)))
    for (const { uA, uB } of stations) {
      for (const base of bases) {
        // One base for both ends: the link runs level, so each facade takes the same elevation.
        const centre = base + cross.height / 2
        const geo = buildLinkGeometry(
          this.buildings.faces(c.a), c.faceA, uA, centre,
          this.buildings.faces(c.b), c.faceB, uB, centre,
          kind as ApertureKind, cross,
        )
        if (!geo) continue
        if (kind !== 'tunnel' && !(this.underRoof(c.a, geo.apertureA) && this.underRoof(c.b, geo.apertureB))) continue
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

  /** True when the whole cut, miter stretch included, stays a head room under the building's roof. */
  private underRoof(id: string, aperture: { base: number; height: number }): boolean {
    return aperture.base + aperture.height <= this.buildings.height(id) - ROOF_HEAD_ROOM + 1e-9
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

  /** Grid bases both buildings can take, from the floor up to the lower roof, tried from a
   *  seeded start. */
  private baseCandidates(c: Candidate, kind: FacingKind, rng: Rng, floor: number): number[] {
    const cross = CROSS_SECTIONS[kind]
    const ceiling = Math.min(this.buildings.height(c.a), this.buildings.height(c.b)) - cross.height - ROOF_HEAD_ROOM
    const grid: number[] = []
    for (let v = Math.ceil(floor / BASE_GRID) * BASE_GRID; v <= ceiling; v += BASE_GRID) grid.push(v)
    if (grid.length === 0) return []
    const start = rng.int(0, grid.length - 1)
    return grid.map((_, i) => grid[(start + i) % grid.length])
  }
}
