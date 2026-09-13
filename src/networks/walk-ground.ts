import { OrderedSpatialIndex } from '../core/ordered-spatial-index'
import type { GroundSurface, Vec2 } from '../types/atlas'
import { add2, dist2, norm2, perp2, scale2, sub2 } from '../core/vec'
import { PlanCover } from './plan-cover'
import { arcLengths, pointAt, projectArc } from '../core/polygon'
import { walkingStrip } from './walk-strip'
import { walkingBoundaries } from './walk-boundary'

type GroundRegion = { polygon: Vec2[]; min: Vec2; max: Vec2 }

/** Spatially bounded views of the actual paving owner, including rounded outside junctions. */
export class WalkGround {
  private readonly regions: GroundRegion[]
  private readonly spatial: OrderedSpatialIndex<GroundRegion>
  private boundaries?: OrderedSpatialIndex<GroundRegion>

  constructor(ground: GroundSurface[], surfaces: GroundSurface['surface'][] = ['sidewalk']) {
    this.regions = ground.filter((g) => surfaces.includes(g.surface)).map(({ polygon }) => groundRegion(polygon))
    this.spatial = new OrderedSpatialIndex(this.regions, regionBounds)
  }

  around(center: Vec2, radius: number): Vec2[][] {
    return cropRegions(this.spatial, center, radius)
  }

  /** Search outlines join original seams before a query introduces clipping boundaries. */
  boundaryAround(center: Vec2, radius: number): Vec2[][] {
    this.boundaries ??= new OrderedSpatialIndex(walkingBoundaries(this.regions.map(region => region.polygon)).map(groundRegion), regionBounds)
    return cropRegions(this.boundaries, center, radius)
  }

  /** Proves every segment and join, including interruptions between two valid endpoint caps. */
  covers(path: Vec2[], width: number): boolean {
    const pieces = walkingStrip(path, width)
    if (!pieces.length) return false
    return this.contains(pieces, width)
  }

  coversPolygon(polygon: Vec2[]): boolean { return this.contains([polygon], .001) }

  private contains(pieces: Vec2[][], padding: number): boolean {
    const points = pieces.flat()
    const min = [0, 1].map((axis) => Math.min(...points.map((point) => point[axis])))
    const max = [0, 1].map((axis) => Math.max(...points.map((point) => point[axis])))
    const center: Vec2 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2]
    const cover = new PlanCover(this.around(center, Math.max(max[0] - min[0], max[1] - min[1]) / 2 + padding), [], .001, points)
    return pieces.every((piece) => cover.contains(piece))
  }

  /** First complete covered width after the requested setback, independent of the opposite end. */
  clearance(path: Vec2[], width: number, minimum: number): number {
    const arcs = arcLengths(path), length = arcs.at(-1)!
    if (minimum >= length) return length
    const start = pointAt(path, arcs, minimum)
    const tail = [start, ...path.filter((_, i) => arcs[i] > minimum)]
    const covered = this.trimStart(tail, width)
    return covered.length ? projectArc(path, arcs, covered[0]) : length
  }

  private trimStart(path: Vec2[], width: number): Vec2[] {
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], length = dist2(a, b)
      if (length < 1e-7) continue
      const direction = norm2(sub2(b, a)), normal = perp2(direction), radius = width / 2
      const square: Vec2[] = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => add2(a, add2(scale2(direction, radius * x), scale2(normal, radius * y))))
      if (this.coversPolygon(square)) return path.slice(i - 1)
      const center = scale2(add2(a, b), .5)
      const cover = new PlanCover(this.around(center, length / 2 + width * 2), [], .001)
      if (cover.contains(square)) return path.slice(i - 1)
      const distance = cover.firstTranslation(square, direction, length)
      if (distance !== undefined) return [add2(a, scale2(direction, distance)), ...path.slice(i)]
    }
    return []
  }
}

function groundRegion(polygon: Vec2[]): GroundRegion {
  return {
    polygon,
    min: [Math.min(...polygon.map((p) => p[0])), Math.min(...polygon.map((p) => p[1]))],
    max: [Math.max(...polygon.map((p) => p[0])), Math.max(...polygon.map((p) => p[1]))],
  }
}

function regionBounds(region: GroundRegion) {
  return { minX: region.min[0], minZ: region.min[1], maxX: region.max[0], maxZ: region.max[1] }
}

function cropRegions(regions: OrderedSpatialIndex<GroundRegion>, center: Vec2, radius: number): Vec2[][] {
  const min = [center[0] - radius, center[1] - radius], max = [center[0] + radius, center[1] + radius]
  return regions.query({ minX: min[0], minZ: min[1], maxX: max[0], maxZ: max[1] }).flatMap((region) => {
    let polygon = region.polygon
    for (const axis of [0, 1] as const) {
      polygon = clip(polygon, axis, min[axis], 1)
      polygon = clip(polygon, axis, max[axis], -1)
    }
    return polygon.length >= 3 ? [polygon] : []
  })
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
