import { pointInPolygon, segmentPointDistance } from '../core/polygon'
import type { V2 } from '../core/vec'
import { CatenaryCurve } from './catenary'
import type { RooftopAttachmentRef, RooftopVolume } from './types'

type Interval = [number, number]

const EPS = 1e-9
const RESERVED_KINDS = new Set(['opening', 'access', 'equipment', 'reservation'])
const cross = (a: V2, b: V2): number => a[0] * b[1] - a[1] * b[0]
const sub = (a: V2, b: V2): V2 => [a[0] - b[0], a[1] - b[1]]
const dot = (a: V2, b: V2): number => a[0] * b[0] + a[1] * b[1]

function addParameter(values: number[], value: number): void {
  if (Number.isFinite(value) && value >= -EPS && value <= 1 + EPS) {
    values.push(Math.max(0, Math.min(1, value)))
  }
}

function uniqueSorted(values: number[]): number[] {
  values.sort((a, b) => a - b)
  return values.filter((value, index) => index === 0 || Math.abs(value - values[index - 1]) > EPS)
}

function pointOnTrack(start: V2, delta: V2, parameter: number): V2 {
  return [start[0] + delta[0] * parameter, start[1] + delta[1] * parameter]
}

/** Exact intervals of a finite track inside the radius capsule around one polygon edge. */
function capsuleIntervals(start: V2, end: V2, a: V2, b: V2, radius: number): Interval[] {
  const delta = sub(end, start)
  const edge = sub(b, a)
  const edgeLength = Math.hypot(edge[0], edge[1])
  const trackLength2 = dot(delta, delta)
  const candidates = [0, 1]

  for (const center of [a, b]) {
    const offset = sub(start, center)
    const linear = 2 * dot(offset, delta)
    const constant = dot(offset, offset) - radius * radius
    const discriminant = linear * linear - 4 * trackLength2 * constant
    if (trackLength2 > EPS && discriminant >= -EPS) {
      const root = Math.sqrt(Math.max(0, discriminant))
      addParameter(candidates, (-linear - root) / (2 * trackLength2))
      addParameter(candidates, (-linear + root) / (2 * trackLength2))
    }
  }

  if (edgeLength > EPS) {
    const crossStart = cross(edge, sub(start, a))
    const crossDelta = cross(edge, delta)
    if (Math.abs(crossDelta) > EPS) {
      addParameter(candidates, (radius * edgeLength - crossStart) / crossDelta)
      addParameter(candidates, (-radius * edgeLength - crossStart) / crossDelta)
    }
    const projectionStart = dot(sub(start, a), edge)
    const projectionDelta = dot(delta, edge)
    if (Math.abs(projectionDelta) > EPS) {
      addParameter(candidates, -projectionStart / projectionDelta)
      addParameter(candidates, (edgeLength * edgeLength - projectionStart) / projectionDelta)
    }
  }

  const knots = uniqueSorted(candidates)
  const ranges: Interval[] = []
  for (let index = 1; index < knots.length; index++) {
    const low = knots[index - 1]
    const high = knots[index]
    const midpoint = pointOnTrack(start, delta, (low + high) / 2)
    if (segmentPointDistance(a, b, midpoint) <= radius + EPS) ranges.push([low, high])
  }
  for (const knot of knots) {
    const point = pointOnTrack(start, delta, knot)
    if (segmentPointDistance(a, b, point) <= radius + EPS) ranges.push([knot, knot])
  }
  return ranges
}

function boundaryParameters(start: V2, end: V2, a: V2, b: V2): number[] {
  const track = sub(end, start)
  const edge = sub(b, a)
  const offset = sub(a, start)
  const denominator = cross(track, edge)
  if (Math.abs(denominator) > EPS) {
    const alongTrack = cross(offset, edge) / denominator
    const alongEdge = cross(offset, track) / denominator
    return alongTrack >= -EPS && alongTrack <= 1 + EPS && alongEdge >= -EPS && alongEdge <= 1 + EPS
      ? [Math.max(0, Math.min(1, alongTrack))]
      : []
  }
  if (Math.abs(cross(offset, track)) > EPS) return []
  const length2 = dot(track, track)
  if (length2 <= EPS) return []
  return [dot(sub(a, start), track) / length2, dot(sub(b, start), track) / length2]
    .filter((value) => value >= -EPS && value <= 1 + EPS)
    .map((value) => Math.max(0, Math.min(1, value)))
}

function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return []
  intervals.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const merged: Interval[] = [[...intervals[0]]]
  for (let index = 1; index < intervals.length; index++) {
    const current = intervals[index]
    const previous = merged[merged.length - 1]
    if (current[0] <= previous[1] + EPS) previous[1] = Math.max(previous[1], current[1])
    else merged.push([...current])
  }
  return merged
}

/** Exact track parameter intervals in a polygon expanded by radius. */
function polygonIntervals(start: V2, end: V2, polygon: readonly V2[], radius: number): Interval[] {
  const delta = sub(end, start)
  const boundary = [0, 1]
  const intervals: Interval[] = []
  for (let index = 0; index < polygon.length; index++) {
    const a = polygon[index]
    const b = polygon[(index + 1) % polygon.length]
    boundary.push(...boundaryParameters(start, end, a, b))
    intervals.push(...capsuleIntervals(start, end, a, b, radius))
  }

  const knots = uniqueSorted(boundary)
  for (let index = 1; index < knots.length; index++) {
    const low = knots[index - 1]
    const high = knots[index]
    if (pointInPolygon(pointOnTrack(start, delta, (low + high) / 2), polygon)) intervals.push([low, high])
  }
  return mergeIntervals(intervals)
}

function pointPolygonDistance(point: V2, polygon: readonly V2[]): number {
  if (pointInPolygon(point, polygon)) return 0
  let distance = Infinity
  for (let index = 0; index < polygon.length; index++) {
    distance = Math.min(distance, segmentPointDistance(polygon[index], polygon[(index + 1) % polygon.length], point))
  }
  return distance
}

/**
 * Uses an axis-expanded prism, a conservative superset of a round cable against the requested
 * clearance. Any accepted curve is therefore clear even at polygon corners.
 */
export function curveMeetsVolume(curve: CatenaryCurve, cableRadius: number, volume: RooftopVolume): boolean {
  const margin = cableRadius + (volume.clearance ?? 0)
  const start: V2 = [curve.start[0], curve.start[2]]
  const end: V2 = [curve.end[0], curve.end[2]]
  const intervals = polygonIntervals(start, end, volume.footprint, margin)
  const bottom = volume.bottom - margin
  const top = volume.top + margin
  for (const [low, high] of intervals) {
    const heights = curve.heightRange(
      low * curve.definition.horizontalDistance,
      high * curve.definition.horizontalDistance,
    )
    if (heights[1] >= bottom - EPS && heights[0] <= top + EPS) return true
  }
  return false
}

/** Attachment clearance is a roof-plane disk against unrelated reserved footprints. */
export function attachmentClearanceBlocked(
  endpoint: RooftopAttachmentRef,
  cableRadius: number,
  volumes: readonly RooftopVolume[],
): boolean {
  const point: V2 = [endpoint.attachment.position[0], endpoint.attachment.position[2]]
  return volumes.some((volume) =>
    RESERVED_KINDS.has(volume.kind) &&
    pointPolygonDistance(point, volume.footprint) <=
      endpoint.attachment.clearanceRadius + cableRadius + (volume.clearance ?? 0) + EPS,
  )
}
