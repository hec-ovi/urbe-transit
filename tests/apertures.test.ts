import { describe, expect, it } from 'vitest'
import { generate } from '../src'
import { buildFixtureAtlas } from '../fixtures/atlas.fixture'
import { faceLength, facePlaneDistance } from './helpers'

const atlas = buildFixtureAtlas()
const out = generate(atlas, { seed: 'alpha' })

describe('apertures: exact placement', () => {
  it('every cut polygon vertex lies exactly in its face plane', () => {
    for (const ap of out.apertures) {
      for (const v of ap.cut.polygon) {
        expect(facePlaneDistance(atlas, ap.buildingId, ap.face, v)).toBeLessThan(1e-6)
      }
    }
  })

  it('base and height are the exact vertical extent of the cut', () => {
    for (const ap of out.apertures) {
      const ys = ap.cut.polygon.map((v) => v[1])
      expect(ap.base).toBeCloseTo(Math.min(...ys), 9)
      expect(ap.base + ap.height).toBeCloseTo(Math.max(...ys), 9)
    }
  })

  it('apertures stay inside their face bounds', () => {
    for (const ap of out.apertures) {
      expect(ap.u - ap.width / 2).toBeGreaterThanOrEqual(0)
      expect(ap.u + ap.width / 2).toBeLessThanOrEqual(faceLength(atlas, ap.buildingId, ap.face))
    }
  })

  it('above-ground apertures stay inside the building envelope', () => {
    for (const ap of out.apertures) {
      if (ap.kind === 'tunnel') continue
      const parcel = atlas.parcels.find((p) => p.id === ap.buildingId)!
      expect(ap.base).toBeGreaterThanOrEqual(0)
      expect(ap.base + ap.height).toBeLessThanOrEqual(parcel.envelope.maxHeight)
    }
  })
})

describe('apertures: building-level invariants', () => {
  it('on one building, two bases are equal or at least 2.5 m apart', () => {
    const byBuilding = new Map<string, number[]>()
    for (const ap of out.apertures) {
      byBuilding.set(ap.buildingId, [...(byBuilding.get(ap.buildingId) ?? []), ap.base])
    }
    for (const bases of byBuilding.values()) {
      for (let i = 0; i < bases.length; i++) {
        for (let j = i + 1; j < bases.length; j++) {
          const gap = Math.abs(bases[i] - bases[j])
          expect(gap < 1e-6 || gap >= 2.5).toBe(true)
        }
      }
    }
  })

  it('apertures on one face never overlap', () => {
    const byFace = new Map<string, { lo: number; hi: number }[]>()
    for (const ap of out.apertures) {
      const key = `${ap.buildingId}:${ap.face}`
      const span = { lo: ap.u - ap.width / 2, hi: ap.u + ap.width / 2 }
      for (const other of byFace.get(key) ?? []) {
        expect(span.lo >= other.hi || span.hi <= other.lo).toBe(true)
      }
      byFace.set(key, [...(byFace.get(key) ?? []), span])
    }
  })

  it('every aperture belongs to an existing link and vice versa', () => {
    const linkIds = new Set(out.links.map((l) => l.id))
    for (const ap of out.apertures) expect(linkIds.has(ap.linkId)).toBe(true)
    const apIds = new Set(out.apertures.map((a) => a.id))
    for (const l of out.links) {
      expect(apIds.has(l.a.apertureId)).toBe(true)
      expect(apIds.has(l.b.apertureId)).toBe(true)
    }
  })
})
