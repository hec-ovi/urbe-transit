import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { generate } from '../src'
import type { AtlasBlueprint } from '../src/types/atlas'
import { linkGround, soffitOverStreets, straddledStreet, wireDensityPerClass } from './helpers'
import { MIN_CROSSING_CLEARANCE } from '../src/links/clearance'

/**
 * Two-box pipeline check against every committed atlas sample, smallest to largest. Skipped only
 * when the atlas repo is absent: a sample that fails validation is a failure here, not a skip.
 */
const dir = resolve(process.env.ATLAS_SAMPLES ?? '../atlas/samples')
const SAMPLES = ['city-urbe-tiny', 'city-urbe-small', 'city-urbe']
const load = (name: string) => JSON.parse(readFileSync(resolve(dir, `${name}.json`), 'utf8')) as AtlasBlueprint
const present = SAMPLES.every((s) => existsSync(resolve(dir, `${s}.json`)))

describe.skipIf(!present).each(SAMPLES)('atlas sample pipeline: %s', (name) => {
  const atlas = load(name)
  const out = generate(atlas, { seed: 'urbe-x' })

  it('generates every layer over the real blueprint, deterministically', () => {
    const kinds = new Set(out.links.map((l) => l.kind))
    for (const k of ['bridge', 'ac-tube', 'wire', 'tunnel']) expect(kinds).toContain(k)
    expect(out.linkRefs).toHaveLength(out.links.length)
    // Two sidewalk ends per sidewalked street edge, before corners, crossings and entries.
    expect(out.networks.walk.nodes.length).toBeGreaterThan(atlas.streets.edges.length)
    expect(out.networks.road.lanes.length).toBeGreaterThan(0)
    expect(out.networks.air.corridors.length).toBeGreaterThan(0)
    expect(JSON.stringify(generate(load(name), { seed: 'urbe-x' }))).toBe(JSON.stringify(out))
  }, 120000)

  it('carries exactly the transit the blueprint feeds it', () => {
    const t = atlas.transit
    const fed = t.busRoutes.length + t.trainLines.length + t.subwayLines.length
    expect(out.networks.transit.routes).toHaveLength(fed)
  })

  it('alleys are first-class: top wire density, no car lanes', () => {
    const alleys = atlas.streets.edges.filter((e) => e.class === 'alley')
    expect(alleys.length).toBeGreaterThan(0)
    const laneEdges = new Set(out.networks.road.lanes.map((l) => l.edgeId))
    for (const a of alleys) expect(laneEdges.has(a.id), `${a.id} has lanes`).toBe(false)

    const density = wireDensityPerClass(atlas, out.links.filter((l) => l.kind === 'wire'))
    const others = Object.entries(density).filter(([cls]) => cls !== 'alley')
    for (const [cls, d] of others) expect(density.alley, `alley vs ${cls}`).toBeGreaterThan(d)
    expect(density.highway ?? 0).toBe(0)
  }, 120000)

  it('carries real bridges and AC tubes, every one flying clear of the street it crosses', () => {
    for (const kind of ['bridge', 'ac-tube'] as const) {
      expect(out.links.filter((l) => l.kind === kind).length, `${kind} count`).toBeGreaterThan(0)
    }
    const crossing = soffitOverStreets(atlas, out).filter((c) => c.level !== null)
    expect(crossing.length).toBeGreaterThan(0)
    for (const c of crossing) {
      expect(c.soffit - c.level!, `${c.id} over a street at ${c.level}`).toBeGreaterThanOrEqual(MIN_CROSSING_CLEARANCE)
    }
  }, 120000)

  it('every wire spans one real street of the blueprint', () => {
    for (const w of out.links.filter((l) => l.kind === 'wire')) {
      expect(straddledStreet(atlas, ...linkGround(w)), `${w.id} spans no street`).not.toBeNull()
    }
  }, 120000)
})
