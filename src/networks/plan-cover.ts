import type { V2 } from '../core/vec'

type Interval = [number, number]
type Segment = [V2, V2]
const EPS = 1e-7

/** Exact planar area containment by vertical arrangement slabs, including internal holes. */
export class PlanCover {
  private readonly boundaries: Segment[]
  private readonly events: number[]

  constructor(readonly polygons: V2[][], readonly excluded: V2[][] = []) {
    this.boundaries = [...polygons, ...excluded].flatMap(edges)
    this.events = arrangementEvents(this.boundaries)
  }

  contains(subject: V2[]): boolean {
    const boundary = edges(subject)
    const min = Math.min(...subject.map((p) => p[0]))
    const max = Math.max(...subject.map((p) => p[0]))
    const cuts = [...this.events.filter((x) => x > min && x < max), ...subject.map((p) => p[0])]
    for (const a of boundary) for (const b of this.boundaries) {
      const x = intersectionX(a, b)
      if (x !== null && x > min && x < max) cuts.push(x)
    }
    cuts.sort((a, b) => a - b)
    for (let i = 1; i < cuts.length; i++) {
      if (cuts[i] - cuts[i - 1] < EPS) continue
      const x = (cuts[i] + cuts[i - 1]) / 2
      const wanted = slices(subject, x)
      const covered = merge(this.polygons.flatMap((polygon) => slices(polygon, x)))
      const forbidden = this.excluded.flatMap((polygon) => slices(polygon, x))
      for (const [low, high] of wanted) {
        if (!covered.some(([a, b]) => a <= low + EPS && b >= high - EPS)) return false
        if (forbidden.some(([a, b]) => Math.min(high, b) - Math.max(low, a) > EPS)) return false
      }
    }
    return cuts.length > 1
  }

  /** Translation intervals with complete cover, bounded by exact vertex/edge contacts. */
  translations(shape: V2[], direction: V2, length: number): Interval[] {
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
    const intervals: Interval[] = []
    for (let i = 1; i < cuts.length; i++) {
      if (cuts[i] - cuts[i - 1] < EPS) continue
      const at = (cuts[i] + cuts[i - 1]) / 2
      if (this.contains(shape.map((p) => [p[0] + direction[0] * at, p[1] + direction[1] * at]))) intervals.push([cuts[i - 1], cuts[i]])
    }
    return merge(intervals)
  }
}

function edges(polygon: V2[]): Segment[] {
  return polygon.map((p, i) => [p, polygon[(i + 1) % polygon.length]])
}

function arrangementEvents(boundaries: Segment[]): number[] {
  const values = boundaries.map(([p]) => p[0])
  for (let i = 0; i < boundaries.length; i++) for (let j = 0; j < i; j++) {
    const x = intersectionX(boundaries[i], boundaries[j])
    if (x !== null) values.push(x)
  }
  return [...new Set(values)].sort((a, b) => a - b)
}

function intersectionX([[ax, ay], [bx, by]]: Segment, [[cx, cy], [dx, dy]]: Segment): number | null {
  const ux = bx - ax, uy = by - ay, vx = dx - cx, vy = dy - cy
  const det = ux * vy - uy * vx
  if (Math.abs(det) < EPS) return null
  const t = ((cx - ax) * vy - (cy - ay) * vx) / det
  const s = ((cx - ax) * uy - (cy - ay) * ux) / det
  return t >= 0 && t <= 1 && s >= 0 && s <= 1 ? ax + ux * t : null
}

function slices(polygon: V2[], x: number): Interval[] {
  const ys: number[] = []
  for (const [[ax, ay], [bx, by]] of edges(polygon)) {
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
