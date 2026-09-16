import { segmentPointDistance } from '../core/polygon'
import type { V2 } from '../core/vec'

/** Inward stations let an access leave its exact paving boundary before turning. */
export function accessCandidates(point: V2, width: number, boundaries: V2[][], landOnLeft: boolean): V2[] {
  const result = new Map<string, V2>()
  const normals = new Map<string, V2>()
  for (const polygon of boundaries) {
    const area = polygon.reduce((sum, a, i) => { const b = polygon[(i + 1) % polygon.length]; return sum + a[0] * b[1] - b[0] * a[1] }, 0)
    const sign = landOnLeft || area > 0 ? 1 : -1
    for (const [i, a] of polygon.entries()) {
      const b = polygon[(i + 1) % polygon.length], dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz)
      if (length < 1e-7 || segmentPointDistance(a, b, point) > .001) continue
      const normal: V2 = [-sign * dz / length, sign * dx / length]
      normals.set(JSON.stringify(normal), normal)
      for (const depth of [width / 2, width * Math.SQRT1_2]) {
        const candidate: V2 = [point[0] - sign * dz / length * depth, point[1] + sign * dx / length * depth]
        result.set(JSON.stringify(candidate), candidate)
      }
    }
  }
  const directions = [...normals.values()]
  for (let i = 0; i < directions.length; i++) for (let j = i + 1; j < directions.length; j++) {
    const a = directions[i], b = directions[j], denominator = 1 + a[0] * b[0] + a[1] * b[1]
    if (denominator < 1e-6) continue
    for (const depth of [width / 2, width * Math.SQRT1_2]) {
      const candidate: V2 = [point[0] + (a[0] + b[0]) * depth / denominator, point[1] + (a[1] + b[1]) * depth / denominator]
      result.set(JSON.stringify(candidate), candidate)
    }
  }
  return [...result.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1])
}
