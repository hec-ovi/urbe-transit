import { describe, expect, it } from 'vitest'
import { generate } from '../src'
import { buildFixtureAtlas } from '../fixtures/atlas.fixture'
import { admissibleFloors } from '../src/links/stack'
import { pinnedFloors } from './helpers'

/**
 * The 1000 m ladder's parcel p1: a residential envelope of 31.9 m that has to land 6 to 11 floors.
 * Its aperture bases left no stack of residential floor heights that could pin them all, so
 * exterior refused the parcel. Rebuilt here on the fixture's facing downtown pair, which links.
 */
const LADDER_ENVELOPE = { minFloors: 6, maxFloors: 11, floorHeight: 2.9, maxHeight: 31.9 }

function rung1000P1Atlas() {
  const atlas = buildFixtureAtlas()
  for (const id of ['p2', 'p3']) {
    const p = atlas.parcels.find((x) => x.id === id)!
    p.type = 'residential'
    p.envelope = { ...LADDER_ENVELOPE }
    atlas.volumetric.buildings.find((b) => b.parcelId === id)!.height = 23.2
  }
  return atlas
}

/**
 * The other half of the same failure: an envelope with no slack. A 19.2 m hotel that has to land
 * exactly 6 floors can carry a bridge at 12 m and none at 8 m, where the 3.2 m aperture floor eats
 * the slack the six floors need.
 */
function tightEnvelopeAtlas() {
  const atlas = buildFixtureAtlas()
  for (const id of ['p0', 'p1']) {
    const p = atlas.parcels.find((x) => x.id === id)!
    p.type = 'hotel'
    p.envelope = { minFloors: 6, maxFloors: 6, floorHeight: 3.2, maxHeight: 19.2 }
    atlas.volumetric.buildings.find((b) => b.parcelId === id)!.height = 19.2
  }
  return atlas
}

/** Every building carrying an aperture admits a floor count its envelope allows. */
function expectStackable(atlas: ReturnType<typeof buildFixtureAtlas>, out: ReturnType<typeof generate>, label: string): number {
  let pinnedCount = 0
  for (const [id, bases] of pinnedFloors(out)) {
    const parcel = atlas.parcels.find((p) => p.id === id)!
    pinnedCount += bases.length
    const range = admissibleFloors(parcel, bases)
    const at = `${label} ${id}: bases ${bases.map((b) => b.base.toFixed(2)).join(', ')}`
    expect(range, `${at} admit no stack at all`).not.toBeNull()
    expect(range!.hi, `${at} admit at most ${range!.hi} floors`).toBeGreaterThanOrEqual(parcel.envelope.minFloors)
    expect(range!.lo, `${at} need at least ${range!.lo} floors`).toBeLessThanOrEqual(parcel.envelope.maxFloors)
  }
  return pinnedCount
}

describe('aperture stack: every building can still be built', () => {
  it('leaves a floor stack on every building of the fixture city', () => {
    const atlas = buildFixtureAtlas()
    expect(expectStackable(atlas, generate(atlas, { seed: 'alpha' }), 'fixture')).toBeGreaterThan(0)
  })

  it('a tight envelope takes the base it can build and refuses the one it cannot', () => {
    const atlas = tightEnvelopeAtlas()
    let pinned = 0
    for (const seed of ['alpha', 'beta', 'gamma', 'delta', 'epsilon']) {
      pinned += expectStackable(atlas, generate(atlas, { seed }), seed)
    }
    expect(pinned).toBeGreaterThan(4)
  })

  it('rung-1000:p1 keeps its 6 to 11 residential floors under every seed', () => {
    const atlas = rung1000P1Atlas()
    let pinned = 0
    for (const seed of ['alpha', 'beta', 'gamma', 'delta', 'epsilon']) {
      const out = generate(atlas, { seed })
      expectStackable(atlas, out, seed)
      for (const [id, bases] of pinnedFloors(out)) {
        if (atlas.parcels.find((p) => p.id === id)!.envelope.maxHeight === LADDER_ENVELOPE.maxHeight) pinned += bases.length
      }
    }
    expect(pinned, 'the ladder envelope still carries its links').toBeGreaterThan(4)
  })

  it('a wire anchor pins no floor: it cuts no hole', () => {
    const atlas = buildFixtureAtlas()
    const out = generate(atlas, { seed: 'alpha' })
    const anchored = out.apertures.filter((a) => a.kind === 'wire-anchor')
    expect(anchored.length).toBeGreaterThan(0)
    const pinned = pinnedFloors(out)
    for (const a of anchored) {
      expect((pinned.get(a.buildingId) ?? []).some((b) => b.base === a.base && b.height === a.height)).toBe(false)
    }
  })
})
