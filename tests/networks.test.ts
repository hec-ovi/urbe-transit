import { describe, expect, it } from 'vitest'
import { generate, signalStateAt } from '../src'
import { buildFixtureAtlas } from '../fixtures/atlas.fixture'

const atlas = buildFixtureAtlas()
const out = generate(atlas, { seed: 'alpha' })
const { walk, road, signals } = out.networks

describe('signals', () => {
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
})

describe('walk network', () => {
  it('edges reference existing nodes', () => {
    const ids = new Set(walk.nodes.map((n) => n.id))
    for (const e of walk.edges) {
      expect(ids.has(e.from)).toBe(true)
      expect(ids.has(e.to)).toBe(true)
    }
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
})

describe('road network', () => {
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

  it('lane-change adjacency points at real lanes of the same edge', () => {
    const byId = new Map(road.lanes.map((l) => [l.id, l]))
    for (const lane of road.lanes) {
      for (const adj of [lane.left, lane.right]) {
        if (!adj) continue
        const other = byId.get(adj.laneId)
        expect(other).toBeDefined()
        expect(other!.edgeId).toBe(lane.edgeId)
      }
    }
  })

  it('every drivable edge carries lanes, highways more than streets, alleys none', () => {
    const perEdge = new Map<string, number>()
    for (const lane of road.lanes) perEdge.set(lane.edgeId, (perEdge.get(lane.edgeId) ?? 0) + 1)
    for (const e of atlas.streets.edges) {
      if (e.class === 'alley') expect(perEdge.get(e.id) ?? 0).toBe(0)
      else expect(perEdge.get(e.id) ?? 0).toBeGreaterThan(0)
    }
    expect(perEdge.get('e1')!).toBeGreaterThan(perEdge.get('e7')!)
  })
})

describe('levels: the deck flies over, it does not join', () => {
  const levelOf = new Map(atlas.streets.edges.map((e) => [e.id, e.level ?? 0]))

  it('lanes and sidewalks sit on the surface their street runs on', () => {
    const onDeck = road.lanes.filter((l) => l.level === 8)
    expect(onDeck.length).toBeGreaterThan(0)
    for (const l of road.lanes) expect(l.level, l.id).toBe(levelOf.get(l.edgeId))
    for (const e of walk.edges) expect(Number.isFinite(e.level), e.id).toBe(true)
  })

  it('no turn connection drops from one level to another', () => {
    const byId = new Map(road.lanes.map((l) => [l.id, l]))
    for (const l of road.lanes) {
      for (const c of l.next) expect(byId.get(c.laneId)!.level, `${l.id} -> ${c.laneId}`).toBe(l.level)
    }
  })

  it('a grade-separated node signals the streets at grade, never the deck', () => {
    const byId = new Map(atlas.streets.edges.map((e) => [e.id, e]))
    const mixed = atlas.streets.nodes.filter((n) => new Set(n.edgeIds.map((id) => byId.get(id)!.level ?? 0)).size > 1)
    expect(mixed.length).toBeGreaterThan(0)
    for (const n of mixed) {
      const signal = signals.find((s) => s.nodeId === n.id)
      if (!signal) continue
      const grade = Math.min(...n.edgeIds.map((id) => byId.get(id)!.level ?? 0))
      const controlled = n.edgeIds.filter((id) => (byId.get(id)!.level ?? 0) === grade)
      const crossings = atlas.streets.crossings.find((c) => c.nodeId === n.id)?.segments.length ?? 0
      expect(signal.linkCount).toBe(controlled.length + crossings)
    }
  })

  it('a walkable link joins the graph at the height it flies at', () => {
    const byLink = new Map(out.links.map((l) => [l.id, l]))
    const linkEdges = walk.edges.filter((e) => e.kind === 'link')
    expect(linkEdges.length).toBeGreaterThan(0)
    for (const e of linkEdges) {
      const link = byLink.get(e.linkId!)!
      const low = Math.min(...link.path.map((p) => p[1])) - link.crossSection.height / 2
      expect(e.level, e.id).toBeCloseTo(low, 9)
    }
  })
})

describe('air network', () => {
  it('corridors keep one direction per altitude layer', () => {
    const layers = new Set(out.networks.air.corridors.map((c) => c.altitude))
    expect(layers.size).toBeGreaterThanOrEqual(2)
    for (const c of out.networks.air.corridors) {
      expect(c.width).toBeGreaterThan(0)
      expect(c.speed).toBeGreaterThan(0)
      expect(c.path.length).toBeGreaterThanOrEqual(2)
    }
  })
})
