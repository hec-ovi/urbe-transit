import type { AtlasBlueprint, JunctionApproach, Vec2 } from '../src/types/atlas'
import { shortJunctionAtlas } from './section-junction.fixture'
import { bentAtlas } from './bent-atlas.fixture'
import rotated from './fixtures/rotated-crossing.json'
import earlyBend from './fixtures/early-bend-crossing.json'

/** A shared source junction whose four crossing fields lie beyond its two original nodes. */
export function physicalCrossingAtlas(): AtlasBlueprint {
  const atlas = shortJunctionAtlas(8, true)
  const approaches: JunctionApproach[] = []
  const junctionId = 'physical-a-b'
  for (const edge of atlas.streets.edges.filter((edge) => edge.id !== 'middle')) {
    const nodeId = ['a', 'b'].includes(edge.from) ? edge.from : edge.to
    const [start, end] = edge.path, length = Math.hypot(end[0] - start[0], end[1] - start[1])
    const direction = [(end[0] - start[0]) / length, (end[1] - start[1]) / length]
    const distance = nodeId === edge.from ? 15 : length - 15
    const at = (s: number, offset: number): Vec2 => [start[0] + direction[0] * s - direction[1] * offset, start[1] + direction[1] * s + direction[0] * offset]
    const station: [number, number] = [distance - 1.5, distance + 1.5]
    const field = (right: number, left: number): Vec2[] => [at(station[0], right), at(station[1], right), at(station[1], left), at(station[0], left)]
    const cut = nodeId === edge.from ? station[0] : station[1]
    approaches.push({ nodeId, groupId: `${nodeId}:connection:0`, edgeId: edge.id, distance, station, field: field(-3.5, 3.5), landings: { left: field(3.5, 6.5), right: field(-5.25, -3.5) }, cut: { left: at(cut, 3.5), right: at(cut, -3.5) } })
    const crossing = atlas.streets.crossings.find((crossing) => crossing.nodeId === nodeId)
    const segment = { edgeId: edge.id, width: 3, from: at(distance, 6.5), to: at(distance, -5.25) }
    if (crossing) crossing.segments.push(segment)
    else atlas.streets.crossings.push({ nodeId, junctionId, segments: [segment] })
  }
  atlas.streets.construction = { junctions: [{ id: junctionId, groupIds: ['a:connection:0', 'b:connection:0'], nodeIds: ['a', 'b'], internalEdgeIds: ['middle'], approaches }] }
  return atlas
}

/** A crossing beyond a bend, so source and walking arc distances differ. */
export function bentCrossingAtlas(): AtlasBlueprint {
  const atlas = bentAtlas(), edge = atlas.streets.edges[0]
  const distance = 55, station: [number, number] = [53.5, 56.5], scale = Math.SQRT1_2
  const at = (s: number, offset: number): Vec2 => [50 + (s - 40 - offset) * scale, 10 + (s - 40 + offset) * scale]
  const field = (right: number, left: number): Vec2[] => [at(station[0], right), at(station[1], right), at(station[1], left), at(station[0], left)]
  const id = 'bent-junction', groupId = `${edge.from}:connection:0`
  atlas.streets.construction!.junctions = [{ id, groupIds: [groupId], nodeIds: [edge.from], internalEdgeIds: [], approaches: [{
    groupId, nodeId: edge.from, edgeId: edge.id, distance, station, field: field(-3.5, 3.5),
    landings: { left: field(3.5, 5.875), right: field(-7.5, -3.5) }, cut: { left: at(station[0], 3.5), right: at(station[0], -3.5) },
  }] }]
  atlas.streets.crossings = [{ junctionId: id, nodeId: edge.from, segments: [{ edgeId: edge.id, width: 3, from: at(distance, 5.875), to: at(distance, -7.5) }] }]
  return atlas
}

/** Captured public planner output, with only the surrounding empty city fields supplied. */
export function rotatedCrossingAtlas(): AtlasBlueprint {
  return plannerAtlas(rotated, 'rotated-crossing')
}

/** Captured early-bend source with distinct connector and carriageway anchors. */
export function earlyBendCrossingAtlas(): AtlasBlueprint {
  return plannerAtlas(earlyBend as unknown as typeof rotated, 'early-bend-crossing')
}

function plannerAtlas(fixture: typeof rotated, seed: string): AtlasBlueprint {
  const { input, plan, boundary } = structuredClone(fixture)
  return {
    meta: { seed, bounds: { min: [Math.min(...boundary.map((p) => p[0])), Math.min(...boundary.map((p) => p[1]))], max: [Math.max(...boundary.map((p) => p[0])), Math.max(...boundary.map((p) => p[1]))] } },
    districts: [], parcels: [],
    streets: { nodes: input.nodes, edges: input.edges, crossings: plan.crossings, construction: { planningReservations: input.reservations, junctions: plan.junctions } },
    volumetric: { buildings: [], ground: input.ground },
    transit: { busStops: [], busRoutes: [], trainStations: [], trainLines: [], subwayStations: [], subwayLines: [] },
  } as unknown as AtlasBlueprint
}
