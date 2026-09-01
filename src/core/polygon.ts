import type { V2 } from './vec'
import { add2, dist2, lerp2, norm2, perp2, scale2, sub2 } from './vec'

/** Ray-cast point-in-polygon on the ground plane. */
export function pointInPolygon(p: V2, poly: V2[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]
    const [xj, zj] = poly[j]
    if (zi > p[1] !== zj > p[1] && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

export function polygonArea(poly: V2[]): number {
  let a = 0
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1])
  }
  return Math.abs(a) / 2
}

export function polylineLength(path: V2[]): number {
  let l = 0
  for (let i = 1; i < path.length; i++) l += dist2(path[i - 1], path[i])
  return l
}

/** Cumulative arc length at each vertex. */
export function arcLengths(path: V2[]): number[] {
  const out = [0]
  for (let i = 1; i < path.length; i++) out.push(out[i - 1] + dist2(path[i - 1], path[i]))
  return out
}

/** Point at arc length s along the polyline, clamped to its ends. */
export function pointAt(path: V2[], arcs: number[], s: number): V2 {
  if (s <= 0) return path[0]
  const total = arcs[arcs.length - 1]
  if (s >= total) return path[path.length - 1]
  let i = 1
  while (arcs[i] < s) i++
  const seg = arcs[i] - arcs[i - 1]
  return lerp2(path[i - 1], path[i], seg < 1e-12 ? 0 : (s - arcs[i - 1]) / seg)
}

/** Arc length of the closest point on the polyline to p. */
export function projectArc(path: V2[], arcs: number[], p: V2): number {
  let best = 0
  let bestD = Infinity
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]
    const b = path[i]
    const ab = sub2(b, a)
    const segLen2 = ab[0] * ab[0] + ab[1] * ab[1]
    const t = segLen2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / segLen2))
    const q = lerp2(a, b, t)
    const d = dist2(p, q)
    if (d < bestD) {
      bestD = d
      best = arcs[i - 1] + t * Math.sqrt(segLen2)
    }
  }
  return best
}

/** Offset a polyline sideways: positive d to the right of travel direction. Miter joins, clamped. */
export function offsetPolyline(path: V2[], d: number): V2[] {
  const out: V2[] = []
  for (let i = 0; i < path.length; i++) {
    const prev = path[Math.max(0, i - 1)]
    const next = path[Math.min(path.length - 1, i + 1)]
    const dir = norm2(sub2(next, prev))
    out.push(add2(path[i], scale2(perp2(dir), d)))
  }
  return out
}

/** Trim both ends of a polyline by arc length; empty result if too short. */
export function trimPolyline(path: V2[], startCut: number, endCut: number): V2[] {
  const arcs = arcLengths(path)
  const total = arcs[arcs.length - 1]
  if (total - startCut - endCut < 0.5) return []
  const s0 = startCut
  const s1 = total - endCut
  const out: V2[] = [pointAt(path, arcs, s0)]
  for (let i = 0; i < path.length; i++) {
    if (arcs[i] > s0 && arcs[i] < s1) out.push(path[i])
  }
  out.push(pointAt(path, arcs, s1))
  return out
}
