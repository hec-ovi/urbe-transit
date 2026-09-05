import { ConnectionsError } from '../core/errors'
import type { StreetEdge } from '../types/atlas'

const EPS = 1e-6
const nonnegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0

/** Authored section dimensions are authority, never hints for class-based reconstruction. */
export function validateCrossSection(edge: StreetEdge): void {
  const section = edge.crossSection
  if (section === undefined) return
  const path = `atlas.streets.edges.${edge.id}.crossSection`
  const fail = (message: string): never => { throw new ConnectionsError('E_ATLAS_INVALID', message, path) }
  if (!section || typeof section.runId !== 'string' || typeof section.profileId !== 'string' || !Array.isArray(section.lanes)) fail('street section needs run, profile and lanes')
  if (edge.class === 'highway') fail('highways use their highway geometry authority')
  if (!nonnegative(section.shoulders?.left) || !nonnegative(section.shoulders?.right)) fail('street shoulders must be finite non-negative widths')
  let cursor = edge.width / 2 - section.shoulders.left
  const directions = new Set<string>()
  for (const lane of section.lanes) {
    if (!lane || !nonnegative(lane.width) || lane.width <= 0 || !Number.isFinite(lane.offset) || !['forward', 'backward'].includes(lane.direction)) fail('street lane has invalid dimensions or direction')
    if (Math.abs(lane.offset - (cursor - lane.width / 2)) > EPS) fail('street lanes must tile the carriageway from left to right')
    cursor -= lane.width
    directions.add(lane.direction)
  }
  if (Math.abs(cursor + edge.width / 2 - section.shoulders.right) > EPS) fail('street lane and shoulder widths must equal the carriageway')
  if (edge.class === 'alley' ? section.lanes.length > 0 : edge.width > 0 && directions.size !== 2) fail('road sections need both directions; alleys have no car lanes')
  for (const side of ['left', 'right'] as const) {
    const sidewalk = section.sidewalks?.[side]
    if (!sidewalk || typeof sidewalk.profileId !== 'string') fail('street section needs both sidewalk profiles')
    let total = 0
    for (const role of ['curb', 'border', 'furnishing', 'walking', 'frontage'] as const) {
      const width = sidewalk.bands?.[role]
      if (!nonnegative(width)) fail('street sidewalk bands must be finite non-negative widths')
      total += width
    }
    if (Math.abs(total - edge.sidewalk[side]) > EPS) fail('street sidewalk bands must equal the side total')
  }
}
