import type { V2 } from '../core/vec'
import { add2, dist2, dot2, lerp2, norm2, perp2, scale2, sub2 } from '../core/vec'
import { arcLengths, pointAt, projectArc } from '../core/polygon'
import { lineIntersection, offsetStreetPath } from './offset'

/** Fits both incident segment midlines before intersecting an inner corner. */
export function centerMiterOnWalkingBand(source: V2[], offset: number, polygons: V2[][], grid: number): V2[] {
  const nominal = offsetStreetPath(source, offset)
  const lines = source.slice(1).map((end, i) => {
    const start = source[i], side = scale2(perp2(norm2(sub2(end, start))), offset)
    const points = [1 / 3, 2 / 3].map((t) => {
      const origin = lerp2(start, end, t)
      return centerPoint(add2(origin, side), origin, polygons, grid)
    })
    return { point: points[0], direction: norm2(sub2(points[1], points[0])) }
  })
  return nominal.map((point, i) => {
    const before = lines[Math.max(0, i - 1)], after = lines[Math.min(lines.length - 1, i)]
    const fitted = i === 0 || i === source.length - 1
      ? lineIntersection(before.point, before.direction, point, perp2(before.direction))
      : lineIntersection(before.point, before.direction, after.point, after.direction)
    const normals = [Math.max(0, i - 1), Math.min(source.length - 2, i)].map((j) => perp2(norm2(sub2(source[j + 1], source[j]))))
    if (!fitted) return point
    // Clip the fitting displacement to both incident transverse limits, retaining its geometric direction.
    const delta = sub2(fitted, point)
    const transverse = Math.max(...normals.map((normal) => Math.abs(dot2(delta, normal))))
    return add2(point, scale2(delta, transverse > grid ? grid / transverse : 1))
  })
}

/** Resolves sub-grid center placement from the actual two band boundaries. */
export function centerOnWalkingBand(path: V2[], source: V2[], polygons: V2[][], grid: number): V2[] {
  const arcs = arcLengths(source)
  return path.map((point) => {
    const origin = pointAt(source, arcs, projectArc(source, arcs, point))
    return centerPoint(point, origin, polygons, grid)
  })
}

function centerPoint(point: V2, origin: V2, polygons: V2[][], grid: number): V2 {
  const distance = dist2(origin, point)
  if (distance < 1e-7) return point
  const direction = norm2(sub2(point, origin))
  const selected = sectionIntervals(origin, direction, polygons).find(([a, b]) => a <= distance && b >= distance)
  if (!selected) return point
  const center = (selected[0] + selected[1]) / 2
  return Math.abs(center - distance) <= grid + 1e-9 ? add2(origin, scale2(direction, center)) : point
}

/** Exact line sections through the union, retaining holes and disconnected pieces. */
function sectionIntervals(origin: V2, direction: V2, polygons: V2[][]): [number, number][] {
  const cross = (a: V2, b: V2): number => a[0] * b[1] - a[1] * b[0]
  const intervals = polygons.flatMap((polygon) => {
    const cuts: number[] = []
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length]
      const first = cross(direction, sub2(a, origin)), last = cross(direction, sub2(b, origin))
      if ((first <= 0 && last > 0) || (last <= 0 && first > 0)) cuts.push(cross(sub2(a, origin), sub2(b, a)) / cross(direction, sub2(b, a)))
    }
    cuts.sort((a, b) => a - b)
    const slices: [number, number][] = []
    for (let i = 1; i < cuts.length; i += 2) slices.push([cuts[i - 1], cuts[i]])
    return slices
  }).sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const merged: [number, number][] = []
  for (const interval of intervals) {
    const last = merged.at(-1)
    if (last && interval[0] <= last[1] + 1e-9) last[1] = Math.max(last[1], interval[1])
    else merged.push([...interval])
  }
  return merged
}
