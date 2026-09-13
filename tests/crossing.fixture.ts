import type { AtlasBlueprint } from '../src'
import fixture from './fixtures/early-bend-crossing.json'

export function crossingAtlas(): AtlasBlueprint {
  const { input, plan, boundary } = structuredClone(fixture)
  return {
    meta: { seed: 'crossing', bounds: { min: [Math.min(...boundary.map(p => p[0])), Math.min(...boundary.map(p => p[1]))], max: [Math.max(...boundary.map(p => p[0])), Math.max(...boundary.map(p => p[1]))] } },
    districts: [], parcels: [],
    streets: { nodes: input.nodes, edges: input.edges, crossings: plan.crossings, construction: { planningReservations: input.reservations, junctions: plan.junctions } },
    volumetric: { buildings: [], ground: input.ground },
    transit: { busStops: [], busRoutes: [], trainStations: [], trainLines: [], subwayStations: [], subwayLines: [] },
  } as unknown as AtlasBlueprint
}
