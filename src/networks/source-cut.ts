import type { Vec2 } from '../types/atlas'
import { arcLengths, pointAt } from '../core/polygon'
import { add2, dist2, dot2, norm2, perp2, scale2, sub2 } from '../core/vec'

/** Intersects the published physical cut, or a compatibility station plane, with a fitted walking line. */
export function sourceCutDistance(source: Vec2[], path: Vec2[], station: number, fieldCenter: number, offset: number, cut?: [Vec2, Vec2]): number | undefined {
  const sourceArcs = arcLengths(source), arcs = arcLengths(path)
  const segment = Math.max(1, sourceArcs.findIndex((distance) => distance >= fieldCenter))
  const direction = norm2(sub2(source[segment], source[segment - 1]))
  const center = pointAt(source, sourceArcs, station)
  const target = add2(center, scale2(perp2(direction), offset))
  const normal = cut ? norm2(perp2(sub2(cut[1], cut[0]))) : direction
  const origin = cut?.[0] ?? center
  let best: { arc: number; distance: number } | undefined
  for (let i = 1; i < path.length; i++) {
    const a = dot2(sub2(path[i - 1], origin), normal), b = dot2(sub2(path[i], origin), normal)
    if (Math.abs(b - a) < 1e-10) continue
    const t = -a / (b - a)
    if (t < 0 || t > 1) continue
    const point = add2(path[i - 1], scale2(sub2(path[i], path[i - 1]), t))
    const distance = dist2(point, target)
    if (!best || distance < best.distance) best = { arc: arcs[i - 1] + (arcs[i] - arcs[i - 1]) * t, distance }
  }
  return best?.arc
}
