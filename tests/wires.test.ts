import { describe, expect, it } from 'vitest'
import { generate } from '../src'
import { buildFixtureAtlas } from '../fixtures/atlas.fixture'
import { straddledStreet, streetLengthPerClass } from './helpers'

const atlas = buildFixtureAtlas()
const out = generate(atlas, { seed: 'alpha' })
const wires = out.links.filter((l) => l.kind === 'wire')
const aperture = (id: string) => out.apertures.find((a) => a.id === id)!
const ground = (l: (typeof wires)[number]) => ({
  a: [l.path[0][0], l.path[0][2]] as [number, number],
  b: [l.path[l.path.length - 1][0], l.path[l.path.length - 1][2]] as [number, number],
})

/** Wires per 100 m of street centerline, per class. */
function densityPerClass(): Record<string, number> {
  const lengths = streetLengthPerClass(atlas)
  const counts: Record<string, number> = {}
  for (const w of wires) {
    const street = straddledStreet(atlas, ground(w).a, ground(w).b)!
    counts[street.class] = (counts[street.class] ?? 0) + 1
  }
  const out: Record<string, number> = {}
  for (const cls of Object.keys(lengths)) out[cls] = ((counts[cls] ?? 0) / lengths[cls]) * 100
  return out
}

describe('wires: overhead across the street', () => {
  it('every wire spans facade to facade over a street, never over a highway', () => {
    expect(wires.length).toBeGreaterThan(0)
    for (const w of wires) {
      const { a, b } = ground(w)
      const street = straddledStreet(atlas, a, b)
      expect(street, `${w.id} spans no street`).not.toBeNull()
      expect(street!.class).not.toBe('highway')
      expect(aperture(w.a.apertureId).kind).toBe('wire-anchor')
      expect(aperture(w.b.apertureId).kind).toBe('wire-anchor')
      expect(w.a.buildingId).not.toBe(w.b.buildingId)
    }
  })

  it('narrow alleys and streets carry the wires, wide streets few or none', () => {
    const density = densityPerClass()
    expect(density.highway).toBe(0)
    expect(density.alley).toBeGreaterThan(3 * density.street)
    expect(density.street).toBeGreaterThan(density.road)
    const wide = wires.filter((w) => {
      const cls = straddledStreet(atlas, ground(w).a, ground(w).b)!.class
      return cls === 'road' || cls === 'highway'
    })
    expect(wide.length).toBeLessThanOrEqual(wires.length / 4)
  })

  it('anchors sit in the 4 to 8 m band and the span sags at most 3% below them', () => {
    for (const w of wires) {
      for (const id of [w.a.apertureId, w.b.apertureId]) {
        const ap = aperture(id)
        expect(ap.base).toBeGreaterThanOrEqual(4)
        expect(ap.base + ap.height).toBeLessThanOrEqual(8)
      }
      const anchorY = w.path[0][1]
      const { a, b } = ground(w)
      const span = Math.hypot(a[0] - b[0], a[1] - b[1])
      for (const p of w.path) {
        expect(p[1]).toBeLessThanOrEqual(anchorY + 1e-9)
        expect(p[1]).toBeGreaterThanOrEqual(anchorY - 0.03 * span - 1e-9)
      }
    }
  })

  it('the anchor band follows the params', () => {
    const high = generate(atlas, { seed: 'alpha', links: { wire: { minBase: 12, maxBase: 20 } } })
    const raised = high.apertures.filter((a) => a.kind === 'wire-anchor')
    expect(raised.length).toBeGreaterThan(0)
    for (const ap of raised) {
      expect(ap.base).toBeGreaterThanOrEqual(12)
      expect(ap.base + ap.height).toBeLessThanOrEqual(20)
    }
  })

  it('a facade takes several anchors, sharing a tier to the last bit', () => {
    const perBuilding = new Map<string, number[]>()
    for (const w of wires) {
      for (const id of [w.a.apertureId, w.b.apertureId]) {
        const ap = aperture(id)
        perBuilding.set(ap.buildingId, [...(perBuilding.get(ap.buildingId) ?? []), ap.base])
      }
    }
    const shared = [...perBuilding.values()].filter((bases) => bases.length > 1)
    expect(shared.length).toBeGreaterThan(0)
    for (const bases of shared) {
      // Exactly equal, not merely close: exterior mounts one anchor row per tier.
      for (const base of bases) expect(base === bases[0] || Math.abs(base - bases[0]) >= 2.5).toBe(true)
    }
  })

  it('the same seed gives the same wires', () => {
    const again = generate(buildFixtureAtlas(), { seed: 'alpha' }).links.filter((l) => l.kind === 'wire')
    expect(JSON.stringify(again)).toBe(JSON.stringify(wires))
  })
})
