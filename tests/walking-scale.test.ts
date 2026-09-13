import { expect, it } from 'vitest'
import { generate } from '../src'
import type { AtlasBlueprint, GroundSurface, StreetEdge, Vec2 } from '../src/types/atlas'
import source from './explicit-sidewalk.fixture.json'

const rectangle = (x: number, z: number, width: number, depth: number): Vec2[] => [[x, z], [x + width, z], [x + width, z + depth], [x, z + depth]]
const sidewalk = (polygon: Vec2[]): GroundSurface => ({ surface: 'sidewalk', bottom: 0, top: .2, polygon })

function city(): AtlasBlueprint {
  const edge = structuredClone(source) as StreetEdge
  const parcels = [43, 20].map((z, i) => ({
    id: `p${i}`, districtId: 'd0', type: 'residential' as const, tier: 'poor' as const,
    footprint: rectangle(60 + i * 30, i ? 8 : 45, 10, 10),
    access: { edgeId: edge.id, point: [70 + i * 30, z] as Vec2 },
    envelope: { minFloors: 1, maxFloors: 1, floorHeight: 3, maxHeight: 3 },
  }))
  return {
    meta: { seed: 'walking-scale', bounds: { min: [0, 0], max: [10000, 10000] } },
    districts: [{ id: 'd0', kind: 'residential', tier: 'poor', boundary: rectangle(0, 0, 10000, 10000), center: [5000, 5000], maxFloors: 1 }],
    parcels,
    streets: { edges: [edge], crossings: [], nodes: [edge.from, edge.to].map((id, i) => ({ id, position: edge.path[i], edgeIds: [edge.id], connections: [{ level: 0, edgeIds: [edge.id] }] })) },
    transit: { busStops: [], busRoutes: [], trainStations: [], trainLines: [], subwayStations: [], subwayLines: [] },
    volumetric: {
      buildings: parcels.map(parcel => ({ parcelId: parcel.id, footprint: parcel.footprint, height: 3 })),
      ground: [sidewalk(rectangle(0, 37, 10000, 6)), sidewalk(rectangle(0, 20, 10000, 2))],
    },
  }
}

it('retains every nearby walking result with distant paving and long source owners', () => {
  const input = city(), expected = generate(input, { seed: 'walking-scale' })
  input.volumetric.ground!.push(...Array.from({ length: 5000 }, (_, i) => sidewalk(rectangle(300 + (i % 100) * 30, 300 + Math.floor(i / 100) * 30, 20, 20))))
  expect(generate(input, { seed: 'walking-scale' })).toEqual(expected)
  expect(expected.networks.walk.nodes.filter(node => node.kind === 'entry').map(node => node.ref)).toEqual(['p0', 'p1'])
})

it('rejects a required walking strip interrupted beyond coordinate uncertainty', () => {
  const input = city()
  input.volumetric.ground!.splice(0, 1, sidewalk(rectangle(0, 37, 80, 6)), sidewalk(rectangle(80.003, 37, 9919.997, 6)))
  expect(() => generate(input, { seed: 'walking-scale' })).toThrowError(expect.objectContaining({ code: 'E_ATLAS_INVALID', path: 'atlas.streets.edges.e0' }))
})
