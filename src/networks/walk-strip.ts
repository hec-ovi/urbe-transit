import type { V2 } from '../core/vec'
import { add2, dist2, norm2, perp2, scale2, sub2 } from '../core/vec'
import { polygonArea } from '../core/polygon'
import { lineIntersection } from './offset'

/** Convex pieces of a complete constant-width polyline strip, with mitered joins and butt ends. */
export function walkingStrip(path: V2[], width: number): V2[][] {
  const pieces: V2[][] = []
  const directions = path.slice(1).map((point, i) => norm2(sub2(point, path[i])))
  for (let i = 1; i < path.length; i++) {
    if (dist2(path[i - 1], path[i]) < 1e-7) continue
    const side = scale2(perp2(directions[i - 1]), width / 2)
    pieces.push([add2(path[i - 1], side), add2(path[i], side), sub2(path[i], side), sub2(path[i - 1], side)])
  }
  for (let i = 1; i < path.length - 1; i++) for (const sign of [-1, 1]) {
    const before = directions[i - 1], after = directions[i]
    const a = add2(path[i], scale2(perp2(before), sign * width / 2))
    const b = add2(path[i], scale2(perp2(after), sign * width / 2))
    const miter = lineIntersection(a, before, b, after)
    if (!miter) continue
    const join = [path[i], a, miter, b]
    if (polygonArea(join) > 1e-10) pieces.push(join)
  }
  return pieces
}
