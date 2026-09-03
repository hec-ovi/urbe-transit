import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { generate, ConnectionsError } from '../src'
import { buildFixtureAtlas } from '../fixtures/atlas.fixture'
import { wireDensityPerClass } from './helpers'

const atlas = buildFixtureAtlas()

/** The fixture alley in the shape atlas 0.3 emits: no carriageway, the whole ground is sidewalk. */
function atlasWithPedestrianAlley() {
  const a = buildFixtureAtlas()
  const alley = a.streets.edges.find((e) => e.id === 'e18')!
  alley.width = 0
  alley.sidewalk = { left: 2.5, right: 2.5 }
  return a
}

describe('generate: determinism', () => {
  it('same seed and atlas give a byte-identical document', () => {
    const a = generate(buildFixtureAtlas(), { seed: 'alpha' })
    const b = generate(buildFixtureAtlas(), { seed: 'alpha' })
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('keeps the 0.9.0 document byte-identical across additive package releases', () => {
    const json = JSON.stringify(generate(buildFixtureAtlas(), { seed: 'legacy-byte-contract' }))
    expect(JSON.parse(json).meta.version).toBe('0.9.0')
    expect(createHash('sha256').update(json).digest('hex')).toBe(
      '471d73b4ff00ebb480f54ab811ccf4e1aa73310324dcb31d743129416513b322',
    )
  })

  it('a different seed changes the result', () => {
    const a = generate(atlas, { seed: 'alpha' })
    const b = generate(atlas, { seed: 'omega' })
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b))
  })
})

describe('generate: street classes', () => {
  it('takes a pedestrian alley with no carriageway: no lanes, still the top wire class', () => {
    const pedestrian = atlasWithPedestrianAlley()
    const out = generate(pedestrian, { seed: 'alpha' })
    expect(out.networks.road.lanes.some((l) => l.edgeId === 'e18')).toBe(false)
    const density = wireDensityPerClass(pedestrian, out.links.filter((l) => l.kind === 'wire'))
    expect(density.alley).toBeGreaterThan(density.street)
    // Its ground is all sidewalk: one walkable band per side, both off the centerline.
    const bands = out.networks.walk.edges.filter((e) => e.kind === 'sidewalk' && e.width === 2.5)
    expect(bands.length).toBeGreaterThan(0)
  })

  it('a class it does not know drives and wires by its carriageway width', () => {
    const exotic = buildFixtureAtlas()
    const narrow = exotic.streets.edges.find((e) => e.id === 'e7')!
    narrow.class = 'boulevard' as never
    const out = generate(exotic, { seed: 'alpha' })
    expect(out.networks.road.lanes.some((l) => l.edgeId === 'e7')).toBe(true)
    expect(out.links.some((l) => l.kind === 'wire')).toBe(true)
  })
})

describe('generate: closed error set', () => {
  it('rejects an invalid atlas with E_ATLAS_INVALID', () => {
    const broken = buildFixtureAtlas()
    broken.streets.edges[0].from = 'missing'
    expect(() => generate(broken, { seed: 's' })).toThrowError(
      expect.objectContaining({ name: 'ConnectionsError', code: 'E_ATLAS_INVALID' }),
    )
  })

  it('rejects a street edge with no ground at all', () => {
    const groundless = buildFixtureAtlas()
    const edge = groundless.streets.edges.find((e) => e.id === 'e18')!
    edge.width = 0
    edge.sidewalk = { left: 0, right: 0 }
    expect(() => generate(groundless, { seed: 's' })).toThrowError(
      expect.objectContaining({ code: 'E_ATLAS_INVALID', path: 'atlas.streets.edges' }),
    )
  })

  it('rejects a missing or incomplete street elevation profile', () => {
    const missing = buildFixtureAtlas()
    delete (missing.streets.edges[0] as Partial<typeof missing.streets.edges[0]>).elevationProfile
    expect(() => generate(missing, { seed: 's' })).toThrowError(
      expect.objectContaining({ code: 'E_ATLAS_INVALID', path: expect.stringContaining('elevationProfile') }),
    )

    const incomplete = buildFixtureAtlas()
    incomplete.streets.edges[0].elevationProfile.at(-1)!.distance -= 1
    expect(() => generate(incomplete, { seed: 's' })).toThrowError(
      expect.objectContaining({ code: 'E_ATLAS_INVALID', path: expect.stringContaining('elevationProfile') }),
    )
  })

  it('rejects node topology that disagrees with edge endpoint height', () => {
    const broken = buildFixtureAtlas()
    const node = broken.streets.nodes.find((candidate) => candidate.id === 'n0')!
    const deck = node.connections.find((group) => group.edgeIds.includes('e0'))!
    deck.level = 0
    expect(() => generate(broken, { seed: 's' })).toThrowError(
      expect.objectContaining({ code: 'E_ATLAS_INVALID', path: expect.stringContaining('connections') }),
    )
  })

  it('rejects invalid params with E_PARAMS_INVALID', () => {
    expect(() => generate(atlas, { seed: '' })).toThrowError(
      expect.objectContaining({ code: 'E_PARAMS_INVALID' }),
    )
    expect(() => generate(atlas, { seed: 's', links: { bridge: { density: 2 } } })).toThrowError(
      expect.objectContaining({ code: 'E_PARAMS_INVALID' }),
    )
  })

  it('exports the error class', () => {
    expect(new ConnectionsError('E_PARAMS_INVALID', 'x').code).toBe('E_PARAMS_INVALID')
  })
})

describe('generate: toggles', () => {
  it('a disabled kind yields no entities and no layer, never an error', () => {
    const out = generate(atlas, {
      seed: 'alpha',
      toggles: { bridges: false, wires: false, subway: false, airPaths: false },
    })
    expect(out.links.some((l) => l.kind === 'bridge' || l.kind === 'wire')).toBe(false)
    expect(out.networks.transit.routes.some((r) => r.kind === 'subway')).toBe(false)
    expect(out.networks.air.corridors).toHaveLength(0)
    const ids = out.layers.map((l) => l.id)
    expect(ids).not.toContain('links.bridges')
    expect(ids).not.toContain('links.wires')
    expect(ids).not.toContain('transit.subway')
    expect(ids).not.toContain('air')
  })

  it('layers list only what the export contains', () => {
    const out = generate(atlas, { seed: 'alpha' })
    for (const layer of out.layers) {
      expect([
        'links.bridges', 'links.acTubes', 'links.wires', 'links.tunnels',
        'walk', 'road', 'signals', 'transit.bus', 'transit.subway', 'transit.train', 'air',
      ]).toContain(layer.id)
    }
    expect(out.layers.map((l) => l.id)).toContain('walk')
    expect(out.layers.map((l) => l.id)).toContain('road')
  })
})
