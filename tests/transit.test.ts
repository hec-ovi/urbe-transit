import { describe, expect, it } from 'vitest'
import { generate, transitVehiclesAt } from '../src'
import { buildFixtureAtlas } from '../fixtures/atlas.fixture'
import { distToPath } from './helpers'
import type { AtlasBlueprint } from '../src/types/atlas'

function atlasWithRampBus(): AtlasBlueprint {
  const atlas = buildFixtureAtlas()
  const ramp = atlas.streets.edges.find((edge) => edge.id === 'e0')!
  ramp.elevationProfile = [
    { distance: 0, level: 0 },
    { distance: 60, level: 8 },
    { distance: 120, level: 8 },
  ]
  const edges = new Map(atlas.streets.edges.map((edge) => [edge.id, edge]))
  for (const node of atlas.streets.nodes) {
    const groups = new Map<number, string[]>()
    for (const edgeId of node.edgeIds) {
      const edge = edges.get(edgeId)!
      const level = edge.from === node.id ? edge.elevationProfile[0].level : edge.elevationProfile.at(-1)!.level
      groups.set(level, [...(groups.get(level) ?? []), edgeId])
    }
    node.connections = [...groups].map(([level, edgeIds]) => ({ level, edgeIds }))
  }
  atlas.transit.busStops = [
    { id: 'ramp-low', edgeId: 'e0', position: [20, 0], districtId: 'd2' },
    { id: 'ramp-high', edgeId: 'e0', position: [100, 0], districtId: 'd2' },
  ]
  atlas.transit.busRoutes = [{ id: 'ramp-bus', stopIds: ['ramp-low', 'ramp-high'], edgeIds: ['e0'] }]
  return atlas
}

const atlas = buildFixtureAtlas()
const out = generate(atlas, { seed: 'alpha' })
const routes = out.networks.transit.routes

describe('transit routes', () => {
  it('covers every atlas line', () => {
    expect(routes.filter((r) => r.kind === 'bus')).toHaveLength(atlas.transit.busRoutes.length)
    expect(routes.filter((r) => r.kind === 'subway')).toHaveLength(atlas.transit.subwayLines.length)
    expect(routes.filter((r) => r.kind === 'train')).toHaveLength(atlas.transit.trainLines.length)
  })

  it('templates are monotonic with dwell', () => {
    for (const r of routes) {
      let prev = -1
      r.template.forEach((t, i) => {
        expect(t.depart).toBeGreaterThanOrEqual(t.arrive)
        expect(t.arrive).toBeGreaterThanOrEqual(prev)
        prev = t.depart
        expect(r.stops[i]).toBeDefined()
      })
      expect(r.template).toHaveLength(r.stops.length)
    }
  })

  it('stop shape distances are non-decreasing and inside the shape', () => {
    for (const r of routes) {
      let prev = -1e-9
      for (const s of r.stops) {
        expect(s.shapeDist).toBeGreaterThanOrEqual(prev)
        prev = s.shapeDist
      }
    }
  })

  it('service periods stay inside the day span and never overlap', () => {
    for (const r of routes) {
      let prevEnd = -1
      for (const p of r.service) {
        expect(p.start).toBeGreaterThanOrEqual(prevEnd)
        expect(p.end).toBeGreaterThan(p.start)
        expect(p.headway).toBeGreaterThan(0)
        expect(p.phase).toBeGreaterThanOrEqual(0)
        expect(p.phase).toBeLessThan(p.headway)
        prevEnd = p.end
      }
      expect(r.service[0].start).toBeGreaterThanOrEqual(18000)
      expect(r.service[r.service.length - 1].end).toBeLessThanOrEqual(90000)
    }
  })

  it('subway runs below ground, bus and surface train at grade', () => {
    for (const r of routes) {
      const ys = new Set(r.shape.map((p) => p[1]))
      if (r.kind === 'subway') for (const y of ys) expect(y).toBeLessThan(0)
      if (r.kind === 'bus') for (const y of ys) expect(y).toBe(0)
    }
  })

  it('keeps a bus on the exact street ramp instead of flattening its route', () => {
    const rampRoutes = generate(atlasWithRampBus(), { seed: 'ramp' }).networks.transit.routes
    const bus = rampRoutes.find((route) => route.kind === 'bus')!
    expect(new Set(bus.shape.map((point) => point[1]))).toEqual(new Set([0, 8]))
    expect(bus.stops[0].y).toBeCloseTo(20 * (8 / 60), 9)
    expect(bus.stops[1].y).toBe(8)
    expect(bus.shape.some((point) => point[0] === 60 && point[1] === 8)).toBe(true)
  })
})

describe('vehicle positions at time t (closed form)', () => {
  it('peak time puts vehicles of every mode on their shapes', () => {
    const t = 8 * 3600 + 900
    const vehicles = transitVehiclesAt(routes, t)
    expect(vehicles.length).toBeGreaterThan(0)
    const kinds = new Set(vehicles.map((v) => v.kind))
    expect(kinds).toContain('bus')
    expect(kinds).toContain('subway')
    for (const v of vehicles) {
      const route = routes.find((r) => r.id === v.routeId)!
      expect(distToPath(v.position, route.shape)).toBeLessThan(0.5)
    }
  })

  it('is pure math: identical queries give identical fleets', () => {
    const t = 12 * 3600
    expect(JSON.stringify(transitVehiclesAt(routes, t))).toBe(JSON.stringify(transitVehiclesAt(routes, t)))
  })

  it('before first departure there are no vehicles', () => {
    expect(transitVehiclesAt(routes, 3600)).toHaveLength(0)
  })
})
