import { describe, expect, it } from 'vitest'
import { generate } from '../src'
import { buildFixtureAtlas } from '../fixtures/atlas.fixture'
import type { AtlasBlueprint, Vec2 } from '../src/types/atlas'
import { stationApproach, stationVolumes } from './helpers'

/** The corridor between the two facing corpo towers, where the fixture runs links p0 to p1. */
const CORRIDOR: Vec2 = [163, 120]

const rect = (p: Vec2, w: number, d: number): Vec2[] => [
  [p[0] - w / 2, p[1] - d / 2], [p[0] + w / 2, p[1] - d / 2], [p[0] + w / 2, p[1] + d / 2], [p[0] - w / 2, p[1] + d / 2],
]

/** A subway shaft sunk right through that corridor, from the street down to the platform. */
function shaftOnCorridor(): AtlasBlueprint {
  const atlas = buildFixtureAtlas()
  const st = atlas.transit.subwayStations[1]
  st.shafts = [...(st.shafts ?? []), { footprint: rect(CORRIDOR, 6, 6), top: 0, bottom: -12 }]
  return atlas
}

/** A platform at grade under the same corridor: 0 to 3 m, which a bridge overhead clears. */
function platformOnCorridor(): AtlasBlueprint {
  const atlas = buildFixtureAtlas()
  atlas.transit.trainStations[0].platform = rect(CORRIDOR, 20, 20)
  atlas.transit.trainStations[0].position = CORRIDOR
  return atlas
}

/** A thin shaft that misses a tunnel centerline but clips the edge of its swept section. */
function shaftOnTunnelEdge(): AtlasBlueprint {
  const atlas = buildFixtureAtlas()
  const target = generate(atlas, { seed: 'alpha' }).links.find((l) => l.kind === 'tunnel')!
  const a = target.path[0]
  const b = target.path[target.path.length - 1]
  const dx = b[0] - a[0]
  const dz = b[2] - a[2]
  const len = Math.hypot(dx, dz)
  const mid: Vec2 = [(a[0] + b[0]) / 2, (a[2] + b[2]) / 2]
  const offset = target.crossSection.width / 2 + 0.05
  const center: Vec2 = [mid[0] - (dz / len) * offset, mid[1] + (dx / len) * offset]
  atlas.transit.subwayStations[0].shafts = [
    ...(atlas.transit.subwayStations[0].shafts ?? []),
    { footprint: rect(center, 0.2, 0.2), top: 0, bottom: -12 },
  ]
  return atlas
}

const throughCorridor = (out: ReturnType<typeof generate>) =>
  out.links.filter((l) => Math.abs(l.path[0][0] - CORRIDOR[0]) < 12 && Math.abs(l.path[0][2] - CORRIDOR[1]) < 22).length

describe('station volumes are kept clear', () => {
  it('the fixture publishes a box and a shaft per underground entrance', () => {
    const atlas = buildFixtureAtlas()
    const volumes = stationVolumes(atlas)
    expect(volumes.filter((v) => v.kind === 'platform').length).toBe(5)
    expect(volumes.filter((v) => v.kind === 'shaft').length).toBe(3)
    for (const s of atlas.transit.subwayStations) expect(s.shafts).toHaveLength(s.entrances.length)
    for (const s of atlas.transit.trainStations) expect(s.shafts).toHaveLength(0)
  })

  it('no link enters a platform, a shaft or a passage', () => {
    const atlas = buildFixtureAtlas()
    const met = stationApproach(atlas, generate(atlas, { seed: 'alpha' }))
    for (const m of met) expect(m.distance, `${m.kind} ${m.linkId} in ${m.volume}`).toBeGreaterThan(0)
  })

  it('a shaft sunk across a link corridor clears it, under every seed', () => {
    const atlas = shaftOnCorridor()
    let checked = 0
    for (const seed of ['alpha', 'beta', 'gamma', 'delta', 'epsilon']) {
      for (const m of stationApproach(atlas, generate(atlas, { seed }))) {
        checked++
        expect(m.distance, `${seed} ${m.kind} ${m.linkId} in ${m.volume}`).toBeGreaterThan(0)
      }
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('a station cannot clip the edge of a swept link section', () => {
    const atlas = shaftOnTunnelEdge()
    const met = stationApproach(atlas, generate(atlas, { seed: 'alpha' }))
    for (const m of met) expect(m.distance, `${m.kind} ${m.linkId} in ${m.volume}`).toBeGreaterThan(0)
  })

  it('a platform at grade does not evict what flies over it', () => {
    const base = throughCorridor(generate(buildFixtureAtlas(), { seed: 'alpha' }))
    const withPlatform = throughCorridor(generate(platformOnCorridor(), { seed: 'alpha' }))
    expect(base).toBeGreaterThan(0)
    expect(withPlatform).toBe(base)
  })
})
