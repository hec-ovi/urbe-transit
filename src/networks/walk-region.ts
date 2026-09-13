import type { V2 } from '../core/vec'
import { add2, dist2, norm2, perp2, scale2, sub2 } from '../core/vec'
import type { StreetEdge } from '../types/atlas'
import { lineIntersection, offsetStreetPath } from './offset'
import { PlanCover } from './plan-cover'
import { segmentPointDistance } from '../core/polygon'
import { walkingStrip } from './walk-strip'
import { accessCandidates } from './access-candidates'

/** Pedestrian junction routing stays inside sidewalk land and outside every meeting roadway. */
export class WalkRegion {
  private readonly cover: PlanCover
  private readonly candidates: V2[]
  private readonly boundaries: V2[][]
  private readonly landOnLeft: boolean

  constructor(edges: StreetEdge[], width: number, paving?: V2[][], planning?: { sidewalks: V2[][]; roads: V2[][] }, candidateBoundaries?: V2[][]) {
    const sidewalks = paving ?? planning?.sidewalks ?? edges.flatMap((edge) => (['left', 'right'] as const).flatMap((side) => {
      if (edge.sidewalk[side] <= 0) return []
      const sign = side === 'right' ? 1 : -1
      const inner = sign * edge.width / 2
      const outer = inner + sign * edge.sidewalk[side]
      return [strip(edge.path, inner, outer)]
    }))
    const roads = paving ? [] : planning?.roads ?? edges.filter((edge) => edge.width > 0).map((edge) => strip(edge.path, -edge.width / 2, edge.width / 2))
    this.cover = new PlanCover(sidewalks, roads, paving || planning ? .001 : 0)
    const clearance = width * Math.SQRT1_2
    const boundaries = candidateBoundaries ?? sidewalks
    this.boundaries = boundaries
    this.landOnLeft = !!paving
    this.candidates = [...boundaries.flatMap((polygon) => routeCandidates(insetVertices(polygon, clearance, !!paving), width / 20)), ...roads.flatMap((polygon) => routeCandidates(insetVertices(polygon, -clearance), width / 20))]
  }

  route(a: V2, b: V2, width: number, hints: V2[] = [], endCaps: 'square' | 'butt' = 'square'): V2[] | null {
    const fits = (x: V2, y: V2): boolean => dist2(x, y) < 1e-7 || this.cover.contains(sweptPath(x, y, width, endCaps === 'square' || x !== a, endCaps === 'square' || y !== b))
    const complete = (path: V2[]): boolean => walkingStrip(path, width).every(piece => this.cover.contains(piece))
    if (fits(a, b)) return [a, b]
    if (!this.cover.mayConnect(a, b)) return null
    for (const hint of hints) if (fits(a, hint) && fits(hint, b) && complete([a, hint, b])) return [a, hint, b]
    const entries = endCaps === 'butt' ? [a, b].flatMap(point => accessCandidates(point, width, this.boundaries, this.landOnLeft)) : []
    const points = [a, b, ...hints, ...this.candidates, ...entries]
    const distance = points.map(() => Infinity)
    const previous = points.map(() => -1)
    const visited = new Set<number>()
    distance[0] = 0
    while (visited.size < points.length) {
      let current = -1
      for (let i = 0; i < points.length; i++) if (!visited.has(i) && (current < 0 || distance[i] < distance[current])) current = i
      if (current < 0 || !Number.isFinite(distance[current])) return null
      if (current === 1) {
        const path: V2[] = []
        for (let i = current; i >= 0; i = previous[i]) path.unshift(points[i])
        return complete(path) ? path : null
      }
      visited.add(current)
      for (let next = 0; next < points.length; next++) {
        if (visited.has(next)) continue
        const nextDistance = distance[current] + dist2(points[current], points[next])
        if (nextDistance >= distance[next] || !fits(points[current], points[next])) continue
        distance[next] = nextDistance
        previous[next] = current
      }
    }
    return null
  }
}

/** Reduces only search candidates; every accepted swept path is checked against the exact cover. */
function routeCandidates(points: V2[], tolerance: number): V2[] {
  if (points.length <= 3) return points
  let split = 1
  for (let i = 2; i < points.length; i++) if (dist2(points[0], points[i]) > dist2(points[0], points[split])) split = i
  const simplify = (path: V2[]): V2[] => {
    if (path.length <= 2) return path
    let best = tolerance, index = -1
    for (let i = 1; i < path.length - 1; i++) {
      const distance = segmentPointDistance(path[0], path.at(-1)!, path[i])
      if (distance > best) { best = distance; index = i }
    }
    return index < 0 ? [path[0], path.at(-1)!] : [...simplify(path.slice(0, index + 1)).slice(0, -1), ...simplify(path.slice(index))]
  }
  return [...simplify(points.slice(0, split + 1)).slice(0, -1), ...simplify([...points.slice(split), points[0]]).slice(0, -1)]
}

function strip(path: V2[], a: number, b: number): V2[] {
  return [...offsetStreetPath(path, a), ...offsetStreetPath(path, b).reverse()]
}

/** Interior caps reserve turning space; authored access boundaries keep their exact endpoints. */
function sweptPath(a: V2, b: V2, width: number, capStart: boolean, capEnd: boolean): V2[] {
  const direction = norm2(sub2(b, a))
  const side = scale2(perp2(direction), width / 2)
  const start = capStart ? sub2(a, scale2(direction, width / 2)) : a
  const end = capEnd ? add2(b, scale2(direction, width / 2)) : b
  return [add2(start, side), add2(end, side), sub2(end, side), sub2(start, side)]
}

function insetVertices(polygon: V2[], inset: number, landOnLeft = false): V2[] {
  const area = polygon.reduce((sum, p, i) => { const q = polygon[(i + 1) % polygon.length]; return sum + p[0] * q[1] - q[0] * p[1] }, 0)
  const offset = landOnLeft || area > 0 ? -inset : inset
  return polygon.map((point, i) => {
    const before = norm2(sub2(point, polygon[(i + polygon.length - 1) % polygon.length]))
    const after = norm2(sub2(polygon[(i + 1) % polygon.length], point))
    const a = add2(point, scale2(perp2(before), offset))
    const b = add2(point, scale2(perp2(after), offset))
    return lineIntersection(a, before, b, after) ?? a
  })
}
