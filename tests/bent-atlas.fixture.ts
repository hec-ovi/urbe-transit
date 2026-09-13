import type { AtlasBlueprint, StreetEdge, StreetPlanningReservations } from '../src/types/atlas'
// Public fixture from Atlas's street construction/corridors contract, mirrored for standalone gates.
import input from './fixtures/asymmetric-bend.input.json'
import expected from './fixtures/asymmetric-bend.expected.json'

export function bentAtlas(source: unknown = input.edges, reservation: unknown = expected): AtlasBlueprint {
  const edges = structuredClone(source) as StreetEdge[]
  const planning = structuredClone(reservation) as StreetPlanningReservations
  const edge = edges[0], geometry = planning.edges[0]
  return {
    meta: { seed: 'asymmetric-bend', bounds: { min: [-20, -20], max: [100, 100] } }, districts: [], parcels: [],
    streets: { edges, nodes: [
      { id: edge.from, position: edge.path[0], edgeIds: [edge.id], connections: [{ level: 0, edgeIds: [edge.id] }] },
      { id: edge.to, position: edge.path.at(-1)!, edgeIds: [edge.id], connections: [{ level: 0, edgeIds: [edge.id] }] },
    ], crossings: [], construction: { planningReservations: planning } },
    volumetric: { buildings: [], ground: [
      ...geometry.roadway.map((polygon) => ({ polygon, surface: 'roadway' as const, bottom: -.2, top: 0 })),
      ...[...geometry.sides.left.sidewalk, ...geometry.sides.right.sidewalk].map((polygon) => ({ polygon, surface: 'sidewalk' as const, bottom: 0, top: .15 })),
    ] },
    transit: { busStops: [], busRoutes: [], trainStations: [], trainLines: [], subwayStations: [], subwayLines: [] },
  }
}
