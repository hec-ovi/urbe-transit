import type { V2, V3 } from '../core/vec'
import { arcLengths, pointAt, projectArc } from '../core/polygon'
import type { ElevationPoint, StreetEdge } from '../types/atlas'

const EPS = 1e-9

/** Linear height interpolation over an atlas elevation profile. */
export function profileLevelAt(profile: readonly ElevationPoint[], distance: number): number {
  if (distance <= profile[0].distance) return profile[0].level
  const last = profile[profile.length - 1]
  if (distance >= last.distance) return last.level
  let i = 1
  while (profile[i].distance < distance) i++
  const a = profile[i - 1]
  const b = profile[i]
  const span = b.distance - a.distance
  const t = span <= EPS ? 0 : (distance - a.distance) / span
  return a.level + (b.level - a.level) * t
}

/** Height of a point beside an edge, projected to that edge's centerline. */
export function edgeLevelAtPoint(edge: StreetEdge, point: V2): number {
  const arcs = arcLengths(edge.path)
  return profileLevelAt(edge.elevationProfile, projectArc(edge.path, arcs, point))
}

/** Endpoint height read from the exact profile, never from the scalar maximum. */
export function edgeLevelAtNode(edge: StreetEdge, nodeId: string): number {
  return nodeId === edge.from
    ? edge.elevationProfile[0].level
    : edge.elevationProfile[edge.elevationProfile.length - 1].level
}

/**
 * Lift a lane or sidewalk plan path onto its source street profile. Profile breakpoints are
 * inserted into the result, so a consumer interpolating the 3D polyline preserves every ramp.
 */
export function liftStreetPath(edge: StreetEdge, path: V2[]): V3[] {
  const sourceArcs = arcLengths(edge.path)
  const pathArcs = arcLengths(path)
  const total = pathArcs[pathArcs.length - 1]
  const candidates: { order: number; point: V2; sourceDistance: number; exactKnot: boolean }[] = path.map((point, i) => ({
    order: pathArcs[i],
    point,
    sourceDistance: projectArc(edge.path, sourceArcs, point),
    exactKnot: false,
  }))

  for (const knot of edge.elevationProfile.slice(1, -1)) {
    const sourcePoint = pointAt(edge.path, sourceArcs, knot.distance)
    const order = projectArc(path, pathArcs, sourcePoint)
    if (order <= EPS || order >= total - EPS) continue
    candidates.push({
      order,
      point: pointAt(path, pathArcs, order),
      sourceDistance: knot.distance,
      exactKnot: true,
    })
  }

  candidates.sort((a, b) => a.order - b.order || Number(b.exactKnot) - Number(a.exactKnot))
  const unique: typeof candidates = []
  for (const candidate of candidates) {
    const previous = unique[unique.length - 1]
    if (previous && Math.abs(previous.order - candidate.order) <= EPS) {
      if (candidate.exactKnot) unique[unique.length - 1] = candidate
      continue
    }
    unique.push(candidate)
  }
  return unique.map(({ point, sourceDistance }) => [point[0], profileLevelAt(edge.elevationProfile, sourceDistance), point[1]])
}
