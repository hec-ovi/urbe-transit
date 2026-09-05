import type { GroundSurface, Vec2 } from '../types/atlas'
import { add2, dist2, norm2, perp2, scale2, sub2 } from '../core/vec'
import { PlanCover } from './plan-cover'
import { gridPrecisionCover } from './grid-cover'

/** Spatially bounded views of the actual paving owner, including rounded outside junctions. */
export class WalkGround {
  private readonly regions: { polygon: Vec2[]; min: Vec2; max: Vec2 }[]

  constructor(ground: GroundSurface[]) {
    this.regions = ground.filter((g) => g.surface === 'sidewalk').map(({ polygon }) => ({
      polygon,
      min: [Math.min(...polygon.map((p) => p[0])), Math.min(...polygon.map((p) => p[1]))],
      max: [Math.max(...polygon.map((p) => p[0])), Math.max(...polygon.map((p) => p[1]))],
    }))
  }

  around(center: Vec2, radius: number): Vec2[][] {
    const min = [center[0] - radius, center[1] - radius], max = [center[0] + radius, center[1] + radius]
    return this.regions.flatMap((region) => {
      if (region.max[0] < min[0] || region.max[1] < min[1] || region.min[0] > max[0] || region.min[1] > max[1]) return []
      let polygon = region.polygon
      for (const axis of [0, 1] as const) {
        polygon = clip(polygon, axis, min[axis], 1)
        polygon = clip(polygon, axis, max[axis], -1)
      }
      return polygon.length >= 3 ? [gridPrecisionCover(polygon, .001)] : []
    })
  }

  /** Each run starts after its complete width clears the junction's actual paving boundary. */
  trim(path: Vec2[], width: number): Vec2[] {
    let result = this.trimStart(path, width)
    if (result.length >= 2) result = this.trimStart([...result].reverse(), width).reverse()
    return result
  }

  private trimStart(path: Vec2[], width: number): Vec2[] {
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], length = dist2(a, b)
      if (length < 1e-7) continue
      const direction = norm2(sub2(b, a)), normal = perp2(direction), radius = width / 2
      const square: Vec2[] = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => add2(a, add2(scale2(direction, radius * x), scale2(normal, radius * y))))
      const center = scale2(add2(a, b), .5)
      const cover = new PlanCover(this.around(center, length / 2 + width * 2))
      if (cover.contains(square)) return path.slice(i - 1)
      const interval = cover.translations(square, direction, length)[0]
      if (interval) return [add2(a, scale2(direction, interval[0])), ...path.slice(i)]
    }
    return []
  }
}

/** A half-plane clip preserves even-odd coverage of concave polygons and disconnected slices. */
function clip(polygon: Vec2[], axis: 0 | 1, value: number, sign: number): Vec2[] {
  const result: Vec2[] = []
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length]
    const aInside = sign * (a[axis] - value) >= 0, bInside = sign * (b[axis] - value) >= 0
    if (aInside) result.push(a)
    if (aInside !== bInside) {
      const t = (value - a[axis]) / (b[axis] - a[axis])
      result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
    }
  }
  return result
}
