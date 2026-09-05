import type { V2 } from '../core/vec'
import { add2, dist2, norm2, perp2, scale2, sub2 } from '../core/vec'
import { lineIntersection } from './offset'

/** A snapped vertex differs by at most half a cell on each axis. Geometry itself stays unchanged. */
export function gridPrecisionCover(polygon: V2[], grid: number): V2[] {
  const radius = grid / Math.SQRT2
  const area = polygon.reduce((sum, p, i) => { const q = polygon[(i + 1) % polygon.length]; return sum + p[0] * q[1] - q[0] * p[1] }, 0)
  const offset = area > 0 ? radius : -radius
  return polygon.flatMap((p, i) => {
    const before = norm2(sub2(p, polygon[(i + polygon.length - 1) % polygon.length]))
    const after = norm2(sub2(polygon[(i + 1) % polygon.length], p))
    const a = add2(p, scale2(perp2(before), offset)), b = add2(p, scale2(perp2(after), offset))
    const intersection = lineIntersection(a, before, b, after)
    return intersection && dist2(intersection, p) <= grid + 1e-10 ? [intersection] : [a, b]
  })
}
