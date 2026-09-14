import { expect, it } from 'vitest'
import { generate, ConnectionsError, type ConnectionsParams } from '../src'
import { buildFixtureAtlas } from '../fixtures/atlas.fixture'
import { boundaryAccessAtlas } from './boundary-access.fixture'

it('returns the versioned document deterministically without mutating the request', () => {
  const atlas = buildFixtureAtlas(), before = structuredClone(atlas)
  const result = generate(atlas, { seed: 'alpha' })
  expect(atlas).toEqual(before)
  expect(result).toEqual(generate(before, { seed: 'alpha' }))
  expect(result).not.toEqual(generate(before, { seed: 'omega' }))
  expect(result.meta).toEqual({ version: '0.9.0', seed: 'alpha', atlasSeed: atlas.meta.seed })
  expect(Object.keys(result).sort()).toEqual(['apertures', 'layers', 'linkRefs', 'links', 'meta', 'networks'])
  expect(new Set(result.links.map(link => link.kind))).toEqual(new Set(['bridge', 'ac-tube', 'wire', 'tunnel']))
  expect(result.layers.map(layer => layer.id)).toEqual([
    'links.bridges', 'links.acTubes', 'links.wires', 'links.tunnels', 'walk', 'road', 'signals',
    'transit.bus', 'transit.subway', 'transit.train', 'air',
  ])
})

it('honors every optional toggle while retaining the base movement networks', () => {
  const output = generate(buildFixtureAtlas(), { seed: 'alpha', toggles: {
    bridges: false, acTubes: false, wires: false, tunnels: false,
    bus: false, subway: false, train: false, airPaths: false,
  } })
  expect(output.links).toEqual([])
  expect(output.apertures).toEqual([])
  expect(output.linkRefs).toEqual([])
  expect(output.networks.transit.routes).toEqual([])
  expect(output.networks.air.corridors).toEqual([])
  expect(output.layers.map(layer => layer.id)).toEqual(['walk', 'road', 'signals'])
})

it('applies per-kind limits and the wire anchor band', () => {
  const limits = { minLength: 6, maxLength: 45, minBase: 8, maxPerBuilding: 1, density: 1 }
  const params: ConnectionsParams = { seed: 'alpha', links: {
    bridge: limits, acTube: limits, tunnel: { ...limits, minBase: -6 },
    wire: { ...limits, minBase: 12, maxBase: 20 },
  } }
  const output = generate(buildFixtureAtlas(), params)
  expect(output.links.length).toBeGreaterThan(0)
  for (const link of output.links) {
    for (const end of [link.a, link.b]) expect(output.links.filter(other => other.kind === link.kind && [other.a.buildingId, other.b.buildingId].includes(end.buildingId))).toHaveLength(1)
  }
  const anchors = output.apertures.filter(ap => ap.kind === 'wire-anchor')
  expect(anchors.length).toBeGreaterThan(0)
  for (const ap of anchors) { expect(ap.base).toBeGreaterThanOrEqual(12); expect(ap.base + ap.height).toBeLessThanOrEqual(20) }
  for (const key of ['bridge', 'acTube', 'wire', 'tunnel'] as const) params.links![key] = { ...params.links![key], density: 0 }
  expect(generate(buildFixtureAtlas(), params).links).toEqual([])
})

it('accepts pedestrian and unfamiliar street classes using their dimensions', () => {
  const atlas = buildFixtureAtlas()
  const alley = atlas.streets.edges.find(edge => edge.class === 'alley')!
  alley.width = 0
  const unfamiliar = atlas.streets.edges.find(edge => edge.class === 'street')!
  unfamiliar.class = 'boulevard' as never
  const output = generate(atlas, { seed: 'alpha' })
  expect(output.networks.road.lanes.some(lane => lane.edgeId === alley.id)).toBe(false)
  expect(output.networks.road.lanes.some(lane => lane.edgeId === unfamiliar.id)).toBe(true)
})

it('reports an unbuildable required access through E_ATLAS_INVALID with its source path', () => {
  const atlas = boundaryAccessAtlas(true)
  expect(() => generate(atlas, { seed: 'alpha' })).toThrowError(expect.objectContaining({
    name: 'ConnectionsError', code: 'E_ATLAS_INVALID', message: expect.any(String), path: expect.any(String),
  }))
})

it('reports invalid parameters through the exported error class', () => {
  try { generate(buildFixtureAtlas(), { seed: '' }) }
  catch (error) {
    expect(error).toBeInstanceOf(ConnectionsError)
    expect(error).toMatchObject({ code: 'E_PARAMS_INVALID', path: 'params.seed', message: expect.any(String) })
    return
  }
  throw new Error('Expected invalid seed to fail')
})
