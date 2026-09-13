import type { V2 } from '../core/vec'
import { OrderedSpatialIndex } from '../core/ordered-spatial-index'
import { PlanComponents } from './plan-components'
import { gridPrecisionCover } from './grid-cover'
import { PlanSlices } from './plan-slices'
import type { Interval, Region, Segment } from './plan-slices'

const EPS = 1e-7

/** Exact planar area containment by vertical arrangement slabs, including internal holes. */
export class PlanCover {
  private readonly boundaries: Segment[]
  private readonly boundaryIndex: OrderedSpatialIndex<Segment>
  private readonly eventIndex: OrderedSpatialIndex<V2>
  private readonly events: V2[]
  private readonly regions: Region[]
  private readonly exclusions: Region[]
  private readonly limit?: Region
  private readonly slices: PlanSlices
  private components?: PlanComponents

  constructor(readonly polygons: V2[][], readonly excluded: V2[][] = [], coordinateGrid = 0, subject?: V2[]) {
    if (coordinateGrid > 0) this.polygons = polygons.flatMap((polygon) => gridPrecisionCover(polygon, coordinateGrid))
    this.limit = subject && region(subject)
    this.regions = this.polygons.map(region).filter((shape) => !this.limit || overlaps(shape, this.limit))
    this.exclusions = excluded.map(region).filter((shape) => !this.limit || overlaps(shape, this.limit))
    this.boundaries = uniqueSegments([...this.regions, ...this.exclusions].flatMap((shape) => shape.edges).filter((edge) => !this.limit || overlaps(region(edge), this.limit)))
    this.boundaryIndex = new OrderedSpatialIndex(this.boundaries, segmentBounds)
    this.events = arrangementEvents(this.boundaries, this.boundaryIndex)
    this.eventIndex = new OrderedSpatialIndex(this.events, point => ({ minX: point[0], minZ: point[1], maxX: point[0], maxZ: point[1] }))
    this.slices = new PlanSlices(this.regions, this.exclusions, this.events)
  }

  mayConnect(a: V2, b: V2): boolean {
    this.components ??= new PlanComponents(this.polygons, EPS)
    return this.components.mayConnect(a, b)
  }

  contains(subject: V2[]): boolean {
    const bounds = region(subject), boundary = bounds.edges
    if (this.limit && (bounds.min.some((value, i) => value < this.limit!.min[i] - EPS) || bounds.max.some((value, i) => value > this.limit!.max[i] + EPS))) return false
    const cuts = [...this.eventIndex.query({ minX: bounds.min[0], minZ: bounds.min[1], maxX: bounds.max[0], maxZ: bounds.max[1] }).filter((point) => insideBounds(point, bounds)).map((point) => point[0]), ...subject.map((p) => p[0])]
    for (const a of boundary) for (const b of this.boundaryIndex.query(segmentBounds(a))) {
      const point = intersection(a, b)
      if (point && point[0] > bounds.min[0] && point[0] < bounds.max[0]) cuts.push(point[0])
    }
    cuts.sort((a, b) => a - b)
    for (let i = 1; i < cuts.length; i++) {
      if (cuts[i] - cuts[i - 1] < EPS) continue
      const x = (cuts[i] + cuts[i - 1]) / 2
      const wanted = slices(boundary, x)
      const section = this.slices.at(x), covered = merge(section.covered), forbidden = section.excluded
      for (const [low, high] of wanted) {
        if (!covered.some(([a, b]) => a <= low + EPS && b >= high - EPS)) return false
        if (forbidden.some(([a, b]) => Math.min(high, b) - Math.max(low, a) > EPS)) return false
      }
    }
    return cuts.length > 1
  }

  /** First fully covered translation, bounded by exact vertex/edge contacts. */
  firstTranslation(shape: V2[], direction: V2, length: number): number | undefined {
    const cuts = [0, length]
    const add = (point: V2, movement: V2, segment: Segment): void => {
      const [a, b] = segment, sx = b[0] - a[0], sy = b[1] - a[1]
      const denominator = sx * movement[1] - sy * movement[0]
      if (Math.abs(denominator) < EPS) return
      const t = -(sx * (point[1] - a[1]) - sy * (point[0] - a[0])) / denominator
      if (t <= 0 || t >= length) return
      const px = point[0] + movement[0] * t - a[0], py = point[1] + movement[1] * t - a[1]
      const along = (px * sx + py * sy) / (sx * sx + sy * sy)
      if (along >= -EPS && along <= 1 + EPS) cuts.push(t)
    }
    for (const edge of this.boundaries) for (const point of shape) add(point, direction, edge)
    const reverse: V2 = [-direction[0], -direction[1]]
    for (const edge of edges(shape)) for (const [point] of this.boundaries) add(point, reverse, edge)
    cuts.sort((a, b) => a - b)
    for (let i = 1; i < cuts.length; i++) {
      if (cuts[i] - cuts[i - 1] < EPS) continue
      const at = (cuts[i] + cuts[i - 1]) / 2
      if (this.contains(shape.map((p) => [p[0] + direction[0] * at, p[1] + direction[1] * at]))) return cuts[i - 1]
    }
    return undefined
  }
}

function edges(polygon: V2[]): Segment[] {
  return polygon.map((p, i) => [p, polygon[(i + 1) % polygon.length]])
}

function region(polygon: V2[]): Region {
  return { edges: edges(polygon), min: [Math.min(...polygon.map((p) => p[0])), Math.min(...polygon.map((p) => p[1]))], max: [Math.max(...polygon.map((p) => p[0])), Math.max(...polygon.map((p) => p[1]))] }
}

function overlaps(a: Region, b: Region): boolean {
  return a.min[0] <= b.max[0] && b.min[0] <= a.max[0] && a.min[1] <= b.max[1] && b.min[1] <= a.max[1]
}

function insideBounds(p: V2, bounds: Region): boolean {
  return p[0] > bounds.min[0] && p[0] < bounds.max[0] && p[1] >= bounds.min[1] && p[1] <= bounds.max[1]
}

function uniqueSegments(segments: Segment[]): Segment[] {
  const unique = new Map<string, Segment>()
  for (const [a, b] of segments) {
    const ordered = a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]) ? [a, b] : [b, a]
    unique.set(JSON.stringify(ordered), [a, b])
  }
  return [...unique.values()]
}

function arrangementEvents(boundaries: Segment[], spatial: OrderedSpatialIndex<Segment>): V2[] {
  const events = new Map<string, V2>()
  for (const segment of boundaries) for (const point of segment) events.set(JSON.stringify(point), point)
  const ordered = boundaries.map((edge, index) => ({ edge, index, min: Math.min(edge[0][0], edge[1][0]) })).sort((a, b) => a.min - b.min || a.index - b.index)
  const identities = new Map(ordered.map((entry, order) => [entry.edge, { ...entry, order }]))
  for (let order = 0; order < ordered.length; order++) {
    const edge = ordered[order]
    const previous = spatial.query(segmentBounds(edge.edge)).map(candidate => identities.get(candidate)!).filter(candidate => candidate.order < order).sort((a, b) => a.order - b.order)
    for (const candidate of previous) {
      const point = intersection(boundaries[Math.max(edge.index, candidate.index)], boundaries[Math.min(edge.index, candidate.index)])
      if (point) events.set(JSON.stringify(point), point)
    }
  }
  return [...events.values()]
}

function intersection([[ax, ay], [bx, by]]: Segment, [[cx, cy], [dx, dy]]: Segment): V2 | null {
  if (Math.max(ax, bx) < Math.min(cx, dx) || Math.max(cx, dx) < Math.min(ax, bx) || Math.max(ay, by) < Math.min(cy, dy) || Math.max(cy, dy) < Math.min(ay, by)) return null
  const ux = bx - ax, uy = by - ay, vx = dx - cx, vy = dy - cy
  const det = ux * vy - uy * vx
  if (Math.abs(det) < EPS) return null
  const t = ((cx - ax) * vy - (cy - ay) * vx) / det
  const s = ((cx - ax) * uy - (cy - ay) * ux) / det
  return t >= 0 && t <= 1 && s >= 0 && s <= 1 ? [ax + ux * t, ay + uy * t] : null
}

function slices(boundaries: Segment[], x: number): Interval[] {
  const ys: number[] = []
  for (const [[ax, ay], [bx, by]] of boundaries) {
    if ((ax <= x && bx > x) || (bx <= x && ax > x)) ys.push(ay + (by - ay) * (x - ax) / (bx - ax))
  }
  ys.sort((a, b) => a - b)
  const result: Interval[] = []
  for (let i = 1; i < ys.length; i += 2) result.push([ys[i - 1], ys[i]])
  return result
}

function merge(intervals: Interval[]): Interval[] {
  const result: Interval[] = []
  for (const [a, b] of intervals.sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
    const last = result.at(-1)
    if (last && a <= last[1] + EPS) last[1] = Math.max(last[1], b)
    else result.push([a, b])
  }
  return result
}

function segmentBounds([[ax, ay], [bx, by]]: Segment) {
  return { minX: Math.min(ax, bx), minZ: Math.min(ay, by), maxX: Math.max(ax, bx), maxZ: Math.max(ay, by) }
}
