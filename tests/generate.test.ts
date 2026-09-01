import { describe, expect, it } from 'vitest'
import { generate, ConnectionsError } from '../src'
import { buildFixtureAtlas } from '../fixtures/atlas.fixture'

const atlas = buildFixtureAtlas()

describe('generate: determinism', () => {
  it('same seed and atlas give a byte-identical document', () => {
    const a = generate(buildFixtureAtlas(), { seed: 'alpha' })
    const b = generate(buildFixtureAtlas(), { seed: 'alpha' })
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('a different seed changes the result', () => {
    const a = generate(atlas, { seed: 'alpha' })
    const b = generate(atlas, { seed: 'omega' })
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b))
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
