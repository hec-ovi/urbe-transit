import { describe, expect, it } from 'vitest'
import { generate, type AtlasBlueprint, type ConnectionsParams } from '../src'
import { buildFixtureAtlas } from '../fixtures/atlas.fixture'

const params: ConnectionsParams = {
  seed: 'city-link-scale',
  toggles: { wires: false, bus: false, subway: false, train: false, airPaths: false },
  links: { bridge: { density: 1 }, acTube: { density: 1 }, tunnel: { density: 1 } },
}

function sparseCity(count: number): AtlasBlueprint {
  const atlas = buildFixtureAtlas()
  const length = 53_029 * 250
  const source = atlas.parcels[0]
  atlas.meta.bounds = { min: [-20, 0], max: [60, length] }
  atlas.streets = {
    nodes: [
      { id: 'start', position: [0, 0], edgeIds: ['avenue'], connections: [{ level: 0, edgeIds: ['avenue'] }] },
      { id: 'end', position: [0, length], edgeIds: ['avenue'], connections: [{ level: 0, edgeIds: ['avenue'] }] },
    ],
    edges: [{
      id: 'avenue', from: 'start', to: 'end', class: 'road', path: [[0, 0], [0, length]],
      width: 10, sidewalk: { left: 3, right: 3 }, level: 0,
      elevationProfile: [{ distance: 0, level: 0 }, { distance: length, level: 0 }],
    }],
    crossings: [],
  }
  atlas.transit = { busStops: [], busRoutes: [], subwayStations: [], subwayLines: [], trainStations: [], trainLines: [] }
  atlas.parcels = Array.from({ length: count }, (_, index) => {
    const z = index < 2 ? 50 + index * 30 : index * 250
    return {
      ...source, id: `p${index}`, footprint: [[20, z], [40, z], [40, z + 20], [20, z + 20]],
      access: { edgeId: 'avenue', point: [6.5, z + 10] },
    }
  })
  atlas.volumetric = { buildings: atlas.parcels.map(p => ({ parcelId: p.id, footprint: p.footprint, height: 60 })) }
  return atlas
}

describe('generate: city-scale link lookup', () => {
  it('retains exact local links and every entry with 53,029 eligible buildings', () => {
    const local = generate(sparseCity(2), params)
    expect(local.links.length).toBeGreaterThan(0)
    const city = generate(sparseCity(53_029), params)
    expect(city.links).toEqual(local.links)
    expect(city.apertures).toEqual(local.apertures)
    expect(city.linkRefs).toEqual(local.linkRefs)
    expect(city.networks.walk.nodes.filter(node => node.kind === 'entry')).toHaveLength(53_029)
  }, 30_000)
})
