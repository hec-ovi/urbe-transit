import type { V2 } from '../core/vec'
import { add2, norm2, perp2, scale2, sub2 } from '../core/vec'

/** Exact line intersection; no intersection when the directions are parallel. */
export function lineIntersection(a: V2, ad: V2, b: V2, bd: V2): V2 | null {
  const det = ad[0] * bd[1] - ad[1] * bd[0]
  if (Math.abs(det) < 1e-10) return null
  const delta = sub2(b, a)
  const t = (delta[0] * bd[1] - delta[1] * bd[0]) / det
  return add2(a, scale2(ad, t))
}

/** Parallel segment offsets with their exact miter intersection at each bend. */
export function offsetStreetPath(path: V2[], rightOffset: number): V2[] {
  return path.map((point, i) => {
    const before = norm2(sub2(path[i], path[Math.max(0, i - 1)]))
    const after = norm2(sub2(path[Math.min(path.length - 1, i + 1)], path[i]))
    if (i === 0) return add2(point, scale2(perp2(after), rightOffset))
    if (i === path.length - 1) return add2(point, scale2(perp2(before), rightOffset))
    const a = add2(point, scale2(perp2(before), rightOffset))
    const b = add2(point, scale2(perp2(after), rightOffset))
    return lineIntersection(a, before, b, after) ?? a
  })
}
