import { expect, it } from 'vitest'
import { generate, signalStateAt } from '../src'
import { buildFixtureAtlas } from '../fixtures/atlas.fixture'

const atlas = buildFixtureAtlas()
const out = generate(atlas, { seed: 'alpha' })
const { walk, road, signals } = out.networks

it('publishes signal cycles, periodic states and the signals its crossings reference', () => {
  for (const s of signals) {
    expect(s.phases.reduce((acc, p) => acc + p.duration, 0)).toBeCloseTo(s.cycle, 9)
    for (const p of s.phases) expect(p.state).toHaveLength(s.linkCount)
  }
  const first = signals[0]
  expect(signalStateAt(first, 5)).toMatch(/^[Gyr]+$/)
  expect(signalStateAt(first, 5)).toBe(signalStateAt(first, 5 + first.cycle))
  expect(signalStateAt(first, -1)).toBe(signalStateAt(first, first.cycle - 1))

  const byId = new Map(signals.map((s) => [s.id, s]))
  const synced = walk.edges.filter((e) => e.kind === 'crossing' && e.signal)
  expect(synced.length).toBeGreaterThan(0)
  for (const e of synced) {
    const s = byId.get(e.signal!.signalId)!
    expect(s).toBeDefined()
    expect(e.signal!.linkIndex).toBeLessThan(s.linkCount)
    // Some phase must give this crossing a walk green.
    expect(s.phases.some((p) => p.state[e.signal!.linkIndex] === 'G')).toBe(true)
  }
})

it('covers stops, stations, parcel entries and link portals', () => {
  const kinds = new Set(walk.nodes.map((n) => n.kind))
  for (const k of ['corner', 'stop', 'station', 'entry', 'link-portal']) expect(kinds).toContain(k)
  const totalSegments = atlas.streets.crossings.reduce((acc, c) => acc + c.segments.length, 0)
  expect(walk.edges.filter((e) => e.kind === 'crossing')).toHaveLength(totalSegments)
  for (const stop of atlas.transit.busStops) {
    expect(walk.nodes.some((n) => n.kind === 'stop' && n.ref === stop.id)).toBe(true)
  }
  for (const parcel of atlas.parcels) {
    expect(walk.nodes.some((n) => n.kind === 'entry' && n.ref === parcel.id)).toBe(true)
  }
})

it('joins lanes only through their own endpoints and their node connection group', () => {
  const byId = new Map(road.lanes.map((l) => [l.id, l]))
  let connections = 0
  for (const lane of road.lanes) {
    for (const c of lane.next) {
      connections++
      const target = byId.get(c.laneId)
      expect(target).toBeDefined()
      expect(c.via[0]).toEqual(lane.path[lane.path.length - 1])
      expect(c.via[c.via.length - 1]).toEqual(target!.path[0])
      expect(['s', 'l', 'r', 't']).toContain(c.turn)
    }
  }
  expect(connections).toBeGreaterThan(0)

  // Disconnected edges sharing one height stay separate: the node connection groups decide.
  const separated = buildFixtureAtlas()
  const node = separated.streets.nodes.find((candidate) => candidate.id === 'n5')!
  node.connections = node.edgeIds.map((edgeId) => ({ level: 0, edgeIds: [edgeId] }))
  separated.transit.busRoutes = []
  const separatedRoad = generate(separated, { seed: 'topology' }).networks.road
  const separatedById = new Map(separatedRoad.lanes.map((lane) => [lane.id, lane]))
  for (const lane of separatedRoad.lanes.filter((candidate) => candidate.edgeId === 'e3')) {
    expect(lane.next.some((next) => separatedById.get(next.laneId)?.edgeId === 'e4')).toBe(false)
  }
})

it('publishes air corridors with a width, a speed and at least two altitudes', () => {
  expect(new Set(out.networks.air.corridors.map((c) => c.altitude)).size).toBeGreaterThanOrEqual(2)
  for (const c of out.networks.air.corridors) {
    expect(c.width).toBeGreaterThan(0)
    expect(c.speed).toBeGreaterThan(0)
    expect(c.path.length).toBeGreaterThanOrEqual(2)
  }
})
