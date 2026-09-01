import { dist2, dot2, norm2, sub2 } from '../core/vec'
import type { Rng } from '../core/rng'
import type { Face } from '../atlas/faces'
import type { AtlasBlueprint, DistrictKind, Parcel, WealthTier } from '../types/atlas'
import type { ResolvedParams, FacingKindKey } from '../types/params'
import type { ApertureKind, LinkKind } from '../types/output'
import { buildLinkGeometry, CROSS_SECTIONS } from './geometry'
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

/** Picks facing building pairs per kind, places bases on a grid, builds exact geometry. */
export class LinkPlanner {
  private readonly districtKind = new Map<string, DistrictKind>()

  constructor(
    private readonly atlas: AtlasBlueprint,
    private readonly params: ResolvedParams,
    private readonly buildings: BuildingIndex,
    private readonly registry: LinkRegistry,
  ) {
    for (const d of atlas.districts) this.districtKind.set(d.id, d.kind)
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
    const [baseA, baseB] = this.pickBases(c, key, kind, rng)
    if (baseA === null || baseB === null) return false
    for (const frac of U_FRACTIONS) {
      const uA = c.faceA.length * frac
      const uB = c.faceB.length * (1 - frac)
      const geo = buildLinkGeometry(
        this.buildings.faces(c.a), c.faceA, uA, baseA + cross.height / 2,
        this.buildings.faces(c.b), c.faceB, uB, baseB + cross.height / 2,
        kind as ApertureKind, cross,
      )
      if (!geo) continue
      if (!this.registry.fits(geo.apertureA) || !this.registry.fits(geo.apertureB)) continue
      if (kind !== 'tunnel' && this.buildings.blocks(c.a, c.b, geo.path)) continue
      this.registry.add(kind as LinkKind, c.a, c.b, geo)
      return true
    }
    return false
  }

  /** Grid bases inside both buildings' feasible ranges; occasionally one step apart for a diagonal. */
  private pickBases(c: Candidate, key: FacingKindKey, kind: FacingKind, rng: Rng): [number | null, number | null] {
    const limits = this.params.links[key]
    const cross = CROSS_SECTIONS[kind]
    if (kind === 'tunnel') return [limits.minBase, limits.minBase]
    const top = (id: string) => this.buildings.height(id) - cross.height - 2
    const gridIn = (lo: number, hi: number): number[] => {
      const out: number[] = []
      for (let v = Math.ceil(lo / BASE_GRID) * BASE_GRID; v <= hi; v += BASE_GRID) out.push(v)
      return out
    }
    const shared = gridIn(limits.minBase, Math.min(top(c.a), top(c.b)))
    if (shared.length === 0) return [null, null]
    const base = rng.pick(shared)
    if (rng.next() < 0.25) {
      const higher = base + BASE_GRID
      if (higher <= top(c.b)) return [base, higher]
    }
    return [base, base]
  }
}
