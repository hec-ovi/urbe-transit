import type { V2 } from '../core/vec'
import { add2, norm2, perp2, scale2, sub2 } from '../core/vec'
import { lineIntersection } from './offset'

/** Rounded offset candidate; published reservation geometry decides whether its full strip fits. */
export function roundedWalkingPath(path: V2[], rightOffset: number, maximumChordError: number): V2[] {
  const radius = Math.abs(rightOffset)
  const step = radius > 0 ? 2 * Math.acos(Math.max(-1, 1 - maximumChordError / radius)) : Math.PI
  return path.flatMap((point, i) => {
    const before = norm2(sub2(point, path[Math.max(0, i - 1)]))
    const after = norm2(sub2(path[Math.min(path.length - 1, i + 1)], point))
    if (i === 0) return [add2(point, scale2(perp2(after), rightOffset))]
    if (i === path.length - 1) return [add2(point, scale2(perp2(before), rightOffset))]
    const a = add2(point, scale2(perp2(before), rightOffset))
    const b = add2(point, scale2(perp2(after), rightOffset))
    const turn = Math.atan2(before[0] * after[1] - before[1] * after[0], before[0] * after[0] + before[1] * after[1])
    if (turn * rightOffset <= 0) return [lineIntersection(a, before, b, after) ?? a]
    const angle = Math.atan2(a[1] - point[1], a[0] - point[0])
    const count = Math.max(1, Math.ceil(Math.abs(turn) / step))
    return Array.from({ length: count + 1 }, (_, j): V2 => {
      if (j === 0) return a
      if (j === count) return b
      const at = angle + turn * j / count
      return [point[0] + radius * Math.cos(at), point[1] + radius * Math.sin(at)]
    })
  })
}
