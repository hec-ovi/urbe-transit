import { expect, it } from 'vitest'
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
const out = generate(atlas, { seed: 'alpha', timetable: { dayStart: 25200, dayEnd: 75600 } })
const routes = out.networks.transit.routes

it('covers every atlas line with ordered templates and service inside the requested day', () => {
  expect(routes.filter((r) => r.kind === 'bus')).toHaveLength(atlas.transit.busRoutes.length)
  expect(routes.filter((r) => r.kind === 'subway')).toHaveLength(atlas.transit.subwayLines.length)
  expect(routes.filter((r) => r.kind === 'train')).toHaveLength(atlas.transit.trainLines.length)
  for (const r of routes) {
    let previousDeparture = -1
    r.template.forEach((t, i) => {
      expect(t.depart).toBeGreaterThanOrEqual(t.arrive)
      expect(t.arrive).toBeGreaterThanOrEqual(previousDeparture)
      previousDeparture = t.depart
      expect(r.stops[i]).toBeDefined()
    })
    expect(r.template).toHaveLength(r.stops.length)

    let previousEnd = -1
    for (const p of r.service) {
      expect(p.start).toBeGreaterThanOrEqual(previousEnd)
      expect(p.end).toBeGreaterThan(p.start)
      expect(p.headway).toBeGreaterThan(0)
      expect(p.phase).toBeGreaterThanOrEqual(0)
      expect(p.phase).toBeLessThan(p.headway)
      previousEnd = p.end
    }
    expect(r.service[0].start).toBeGreaterThanOrEqual(25200)
    expect(r.service.at(-1)!.end).toBeLessThanOrEqual(75600)
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

it('places each service at its published first departure and runs none before it', () => {
  for (const route of routes) {
    const first = route.service[0]
    const vehicles = transitVehiclesAt([route], first.start + first.phase)
    expect(vehicles).toHaveLength(1)
    expect(vehicles[0]).toMatchObject({ routeId: route.id, kind: route.kind })
    expect(distToPath(vehicles[0].position, route.shape)).toBeLessThan(0.5)
    expect(vehicles[0].heading).toHaveLength(2)
  }
  expect(transitVehiclesAt(routes, 3600)).toHaveLength(0)
})
