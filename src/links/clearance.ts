import type { V2 } from '../core/vec'
import { arcLengths, segmentPointDistance, segmentSegmentDistance } from '../core/polygon'
import type { AtlasBlueprint, ElevationPoint } from '../types/atlas'
import { profileLevelAt } from '../networks/elevation'

/**
 * Headroom a link leaves over the street surface it flies over: a lorry (4.5 m) plus the margin
 * a footbridge keeps over one. A highway deck runs at level 8, so a link over one starts at 13.5.
 */
export const MIN_CROSSING_CLEARANCE = 5.5

interface Band {
  /** Half the ground the street occupies, carriageway plus both sidewalks. */
  half: number
  path: readonly V2[]
  arcs: number[]
  profile: ElevationPoint[]
}

/** The street ground under a link, and how high that ground runs. */
export class StreetBands {
  private readonly bands: Band[]

  constructor(atlas: AtlasBlueprint) {
    this.bands = atlas.streets.edges.map((e) => ({
      half: (e.width + e.sidewalk.left + e.sidewalk.right) / 2,
      path: e.path,
      arcs: arcLengths(e.path),
      profile: e.elevationProfile,
    }))
  }

  /** Highest street surface the ground track a-b passes over; null when it passes over none. */
  levelUnder(a: V2, b: V2, halfWidth = 0): number | null {
    let top: number | null = null
    for (const s of this.bands) {
      for (let i = 1; i < s.path.length; i++) {
        const radius = s.half + halfWidth
        if (segmentSegmentDistance(a, b, s.path[i - 1], s.path[i]) > radius) continue
        const ranges = capsuleRanges(s.path[i - 1], s.path[i], a, b, radius)
        const segmentLength = s.arcs[i] - s.arcs[i - 1]
        for (const [lo, hi] of ranges) {
          const from = s.arcs[i - 1] + lo * segmentLength
          const to = s.arcs[i - 1] + hi * segmentLength
          let level = Math.max(profileLevelAt(s.profile, from), profileLevelAt(s.profile, to))
          for (const knot of s.profile) {
            if (knot.distance > from && knot.distance < to) level = Math.max(level, knot.level)
          }
          top = Math.max(top ?? -Infinity, level)
        }
      }
    }
    return top
  }

  /** Lowest underside a link crossing this track may take; -Infinity when it crosses no street. */
  floorOver(a: V2, b: V2, halfWidth = 0): number {
    const level = this.levelUnder(a, b, halfWidth)
    return level === null ? -Infinity : level + MIN_CROSSING_CLEARANCE
  }
}

const EPS = 1e-9

/** Exact parameter intervals of p0-p1 lying in the radius capsule around a-b. */
function capsuleRanges(p0: V2, p1: V2, a: V2, b: V2, radius: number): [number, number][] {
  const dx = p1[0] - p0[0]
  const dz = p1[1] - p0[1]
  const candidates = [0, 1]
  const add = (value: number): void => {
    if (value > EPS && value < 1 - EPS && Number.isFinite(value)) candidates.push(value)
  }

  for (const center of [a, b]) {
    const ox = p0[0] - center[0]
    const oz = p0[1] - center[1]
    const aa = dx * dx + dz * dz
    const bb = 2 * (ox * dx + oz * dz)
    const cc = ox * ox + oz * oz - radius * radius
    const discriminant = bb * bb - 4 * aa * cc
    if (aa > EPS && discriminant >= 0) {
      const root = Math.sqrt(Math.max(0, discriminant))
      add((-bb - root) / (2 * aa))
      add((-bb + root) / (2 * aa))
    }
  }

  const abx = b[0] - a[0]
  const abz = b[1] - a[1]
  const abLength = Math.hypot(abx, abz)
  const cross0 = abx * (p0[1] - a[1]) - abz * (p0[0] - a[0])
  const crossDelta = abx * dz - abz * dx
  if (abLength > EPS && Math.abs(crossDelta) > EPS) {
    add((radius * abLength - cross0) / crossDelta)
    add((-radius * abLength - cross0) / crossDelta)
  }

  candidates.sort((x, y) => x - y)
  const knots = candidates.filter((value, i) => i === 0 || Math.abs(value - candidates[i - 1]) > EPS)
  const ranges: [number, number][] = []
  for (let i = 1; i < knots.length; i++) {
    const lo = knots[i - 1]
    const hi = knots[i]
    const mid = (lo + hi) / 2
    const point: V2 = [p0[0] + dx * mid, p0[1] + dz * mid]
    if (segmentPointDistance(a, b, point) <= radius + EPS) ranges.push([lo, hi])
  }
  for (const knot of knots) {
    const point: V2 = [p0[0] + dx * knot, p0[1] + dz * knot]
    if (segmentPointDistance(a, b, point) <= radius + EPS && !ranges.some(([lo, hi]) => knot >= lo - EPS && knot <= hi + EPS)) {
      ranges.push([knot, knot])
    }
  }
  return ranges
}
