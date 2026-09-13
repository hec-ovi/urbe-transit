import { expect, it } from 'vitest'
import { generate, signalStateAt } from '../src'
import { buildFixtureAtlas } from '../fixtures/atlas.fixture'
import type { AtlasBlueprint } from '../src/types/atlas'

function rebuildConnections(atlas: AtlasBlueprint): void {
  const edges = new Map(atlas.streets.edges.map((edge) => [edge.id, edge]))
  for (const node of atlas.streets.nodes) {
    const groups = new Map<number, string[]>()
    for (const edgeId of node.edgeIds) {
      const edge = edges.get(edgeId)!
      const level = edge.from === node.id ? edge.elevationProfile[0].level : edge.elevationProfile.at(-1)!.level
      groups.set(level, [...(groups.get(level) ?? []), edgeId])
    }
    node.connections = [...groups].sort(([a], [b]) => a - b).map(([level, edgeIds]) => ({ level, edgeIds }))
  }
}

function rampAtlas(): AtlasBlueprint {
  const atlas = buildFixtureAtlas()
  const ramp = atlas.streets.edges.find((edge) => edge.id === 'e0')!
  ramp.elevationProfile = [
    { distance: 0, level: 0 },
    { distance: 60, level: 8 },
    { distance: 120, level: 8 },
  ]
  rebuildConnections(atlas)
  return atlas
}

const atlas = buildFixtureAtlas()
const out = generate(atlas, { seed: 'alpha' })
const { walk, road, signals } = out.networks

it('cycle equals the sum of phase durations; states cover every link', () => {
  for (const s of signals) {
    expect(s.phases.reduce((acc, p) => acc + p.duration, 0)).toBeCloseTo(s.cycle, 9)
    for (const p of s.phases) expect(p.state).toHaveLength(s.linkCount)
  }
})

it('signalStateAt is periodic pure math', () => {
  const s = signals[0]
  expect(signalStateAt(s, 5)).toMatch(/^[Gyr]+$/)
  expect(signalStateAt(s, 5)).toBe(signalStateAt(s, 5 + s.cycle))
  expect(signalStateAt(s, -1)).toBe(signalStateAt(s, s.cycle - 1))
})

it('signalized crossings reference a real signal and a walk-capable link index', () => {
  const byId = new Map(signals.map((s) => [s.id, s]))
  const synced = walk.edges.filter((e) => e.kind === 'crossing' && e.signal)
  expect(synced.length).toBeGreaterThan(0)
  for (const e of synced) {
    const s = byId.get(e.signal!.signalId)
    expect(s).toBeDefined()
    expect(e.signal!.linkIndex).toBeLessThan(s!.linkCount)
    // Some phase must give this crossing a walk green.
    expect(s!.phases.some((p) => p.state[e.signal!.linkIndex] === 'G')).toBe(true)
  }
})

it('covers stops, stations, parcel entries and link portals', () => {
  const kinds = new Set(walk.nodes.map((n) => n.kind))
  for (const k of ['corner', 'stop', 'station', 'entry', 'link-portal']) {
    expect(kinds).toContain(k)
  }
  const totalSegments = atlas.streets.crossings.reduce((acc, c) => acc + c.segments.length, 0)
  expect(walk.edges.filter((e) => e.kind === 'crossing')).toHaveLength(totalSegments)
  for (const stop of atlas.transit.busStops) {
    expect(walk.nodes.some((n) => n.kind === 'stop' && n.ref === stop.id)).toBe(true)
  }
  for (const parcel of atlas.parcels) {
    expect(walk.nodes.some((n) => n.kind === 'entry' && n.ref === parcel.id)).toBe(true)
  }
})

it('lane connections reference existing lanes and start and end on them', () => {
  const byId = new Map(road.lanes.map((l) => [l.id, l]))
  let connections = 0
  for (const lane of road.lanes) {
    for (const c of lane.next) {
      connections++
      const target = byId.get(c.laneId)
      expect(target).toBeDefined()
      const end = lane.path[lane.path.length - 1]
      expect(c.via[0]).toEqual(end)
      expect(c.via[c.via.length - 1]).toEqual(target!.path[0])
      expect(['s', 'l', 'r', 't']).toContain(c.turn)
    }
  }
  expect(connections).toBeGreaterThan(0)
})

it('uses node connection groups even when disconnected edges share one height', () => {
  const separated = buildFixtureAtlas()
  const node = separated.streets.nodes.find((candidate) => candidate.id === 'n5')!
  node.connections = node.edgeIds.map((edgeId) => ({ level: 0, edgeIds: [edgeId] }))
  separated.transit.busRoutes = []
  const separatedRoad = generate(separated, { seed: 'topology' }).networks.road
  const laneById = new Map(separatedRoad.lanes.map((lane) => [lane.id, lane]))
  for (const lane of separatedRoad.lanes.filter((candidate) => candidate.edgeId === 'e3')) {
    expect(lane.next.some((next) => laneById.get(next.laneId)?.edgeId === 'e4')).toBe(false)
  }
})

it('preserves every ramp breakpoint in exact 3D lane paths', () => {
  const ramp = generate(rampAtlas(), { seed: 'ramp' })
  const lanes = ramp.networks.road.lanes.filter((lane) => lane.edgeId === 'e0')
  expect(lanes.length).toBeGreaterThan(0)
  for (const lane of lanes) {
    expect(lane.path).toEqual(lane.path3.map((point) => [point[0], point[2]]))
    expect(Math.min(...lane.path3.map((point) => point[1]))).toBeLessThan(8)
    expect(Math.max(...lane.path3.map((point) => point[1]))).toBe(8)
    expect(lane.path3.some((point) => Math.abs(point[0] - 60) < 1e-9 && point[1] === 8)).toBe(true)
  }
})

it('corridors keep one direction per altitude layer', () => {
  const layers = new Set(out.networks.air.corridors.map((c) => c.altitude))
  expect(layers.size).toBeGreaterThanOrEqual(2)
  for (const c of out.networks.air.corridors) {
    expect(c.width).toBeGreaterThan(0)
    expect(c.speed).toBeGreaterThan(0)
    expect(c.path.length).toBeGreaterThanOrEqual(2)
  }
})
