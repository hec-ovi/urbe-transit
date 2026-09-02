import { describe, expect, it } from 'vitest'
import { generate } from '../src'
import { buildFixtureAtlas } from '../fixtures/atlas.fixture'
import { MIN_CROSSING_CLEARANCE } from '../src/links/clearance'
import { soffitOverStreets } from './helpers'

/** The fixture road between the two facing corpo towers, put on a deck like a highway. */
function raisedRoadAtlas() {
  const atlas = buildFixtureAtlas()
  atlas.streets.edges.find((e) => e.id === 'e4')!.level = 8
  return atlas
}

describe('clearance: a link flies over the street', () => {
  it('every bridge and AC tube clears the street it crosses', () => {
    const atlas = buildFixtureAtlas()
    const out = generate(atlas, { seed: 'alpha' })
    const crossing = soffitOverStreets(atlas, out).filter((c) => c.level !== null)
    expect(crossing.length).toBeGreaterThan(0)
    for (const c of crossing) {
      expect(c.soffit - c.level!, `${c.id} over a street at ${c.level}`).toBeGreaterThanOrEqual(MIN_CROSSING_CLEARANCE)
    }
  })

  it('nothing spans a street at ground level, whatever the params ask for', () => {
    const atlas = buildFixtureAtlas()
    const out = generate(atlas, { seed: 'alpha', links: { bridge: { minBase: 0 }, acTube: { minBase: 0 } } })
    const crossing = soffitOverStreets(atlas, out).filter((c) => c.level !== null)
    expect(crossing.length).toBeGreaterThan(0)
    for (const c of crossing) expect(c.soffit).toBeGreaterThanOrEqual(MIN_CROSSING_CLEARANCE)
  })

  it('a link over a deck starts above the deck, not through it', () => {
    const atlas = raisedRoadAtlas()
    let seen = 0
    for (const seed of ['alpha', 'beta', 'gamma', 'delta', 'epsilon']) {
      const out = generate(atlas, { seed, links: { bridge: { minBase: 4 }, acTube: { minBase: 4 } } })
      for (const c of soffitOverStreets(atlas, out).filter((x) => x.level === 8)) {
        seen++
        expect(c.soffit, `${seed} ${c.id}`).toBeGreaterThanOrEqual(8 + MIN_CROSSING_CLEARANCE)
      }
    }
    expect(seen).toBeGreaterThan(0)
  })

  it('a tunnel passes under the deck and under the street', () => {
    const out = generate(raisedRoadAtlas(), { seed: 'alpha' })
    for (const t of out.links.filter((l) => l.kind === 'tunnel')) {
      expect(Math.max(...t.path.map((p) => p[1])) + t.crossSection.height / 2).toBeLessThan(0)
    }
  })
})
