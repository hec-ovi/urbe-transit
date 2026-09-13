import type { V2 } from '../core/vec'
import { add2, dist2, norm2, perp2, scale2, sub2 } from '../core/vec'
import { lineIntersection } from './offset'

/** Original land plus bounded edge and corner uncertainty, with union ownership through tight bends. */
export function gridPrecisionCover(polygon: V2[], grid: number): V2[][] {
  const radius = grid / Math.SQRT2
  const area = polygon.reduce((sum, p, i) => { const q = polygon[(i + 1) % polygon.length]; return sum + p[0] * q[1] - q[0] * p[1] }, 0)
  const offset = area > 0 ? radius : -radius
  const pieces: V2[][] = [polygon]
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i], next = polygon[(i + 1) % polygon.length]
    const before = norm2(sub2(p, polygon[(i + polygon.length - 1) % polygon.length]))
    const after = norm2(sub2(next, p))
    const a = add2(p, scale2(perp2(before), offset)), b = add2(p, scale2(perp2(after), offset))
    const intersection = lineIntersection(a, before, b, after)
    pieces.push([p, next, add2(next, scale2(perp2(after), offset)), b])
    if (Math.abs(before[0] * after[1] - before[1] * after[0]) > 1e-10) pieces.push(intersection && dist2(intersection, p) <= grid + 1e-10 ? [p, a, intersection, b] : [p, a, b])
  }
  return pieces
}
