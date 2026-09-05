import type { StreetClass, StreetEdge } from '../types/atlas'

const LANES_PER_DIR: Record<StreetClass, number> = { alley: 0, street: 1, road: 2, highway: 3 }

export interface DrivingLane {
  direction: 'f' | 'b'
  index: number
  width: number
  /** Offset to the right in this lane's driving direction. */
  offset: number
}

/** Index zero is the outermost right-hand driving lane, regardless of Atlas array order. */
export function drivingLanes(edge: StreetEdge): DrivingLane[] {
  if (edge.class === 'alley' || edge.width <= 0) return []
  const section = edge.crossSection
  if (section) return (['f', 'b'] as const).flatMap((direction) => {
    const lanes = section.lanes.filter((lane) => lane.direction === (direction === 'f' ? 'forward' : 'backward'))
      .map((lane) => ({ width: lane.width, offset: direction === 'f' ? -lane.offset : lane.offset }))
      .sort((a, b) => b.offset - a.offset)
    return lanes.map((lane, index) => ({ ...lane, direction, index }))
  })
  const perDir = LANES_PER_DIR[edge.class] ?? 1
  const width = edge.width / (2 * perDir)
  return (['f', 'b'] as const).flatMap((direction) => Array.from({ length: perDir }, (_, index) => ({
    direction, index, width, offset: edge.width / 2 - width * (index + 0.5),
  })))
}

/** Signed right offset and clear width of one pedestrian walking band. */
export function walkingBand(edge: StreetEdge, side: 'left' | 'right'): { offset: number; width: number } {
  const bands = edge.crossSection?.sidewalks[side].bands
  const width = bands?.walking ?? edge.sidewalk[side]
  const inset = bands ? bands.curb + bands.border + bands.furnishing : 0
  return { width, offset: (side === 'right' ? 1 : -1) * (edge.width / 2 + inset + width / 2) }
}
