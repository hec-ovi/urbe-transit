import { describe, expect, it } from 'vitest'
import { generate } from '../src'
import type { AtlasBlueprint, StreetCrossSection, StreetEdge, Vec2 } from '../src/types/atlas'

function section(width: number, count: number): StreetCrossSection {
  const laneWidth = (width - 1) / count
  const lanes = Array.from({ length: count }, (_, i) => ({ direction: i < count / 2 ? 'backward' as const : 'forward' as const, width: laneWidth, offset: width / 2 - .5 - laneWidth * (i + .5) }))
  return { runId: 'run', profileId: `road-${width}`, lanes, shoulders: { left: .5, right: .5 }, sidewalks: {
    left: { profileId: 'wide', bands: { curb: .15, border: .35, furnishing: 1, walking: 3, frontage: .5 } },
    right: { profileId: 'compact', bands: { curb: .15, border: .35, furnishing: .5, walking: 1.5, frontage: .5 } },
  } }
}

function crossAtlas(): AtlasBlueprint {
  const ends: Vec2[] = [[120, 0], [0, 120], [-120, 0], [0, -120]]
  const edges: StreetEdge[] = ends.map((end, i) => ({ id: `e${i}`, class: 'street', from: 'center', to: `n${i}`, path: [[0, 0], end], width: [7, 14, 7, 21][i], sidewalk: { left: 5, right: 3 }, crossSection: section([7, 14, 7, 21][i], [2, 4, 2, 6][i]), level: 0, elevationProfile: [{ distance: 0, level: 0 }, { distance: 120, level: 0 }] }))
  return { meta: { seed: 'sections', bounds: { min: [-150, -150], max: [150, 150] } }, districts: [], parcels: [], volumetric: { buildings: [] }, streets: {
    nodes: [{ id: 'center', position: [0, 0], edgeIds: edges.map((e) => e.id), connections: [{ level: 0, edgeIds: edges.map((e) => e.id) }] }, ...ends.map((position, i) => ({ id: `n${i}`, position, edgeIds: [`e${i}`], connections: [{ level: 0, edgeIds: [`e${i}`] }] }))], edges,
    crossings: [{ nodeId: 'center', segments: [{ edgeId: 'e0', from: [16, 6.5], to: [16, -5.25], width: 4 }] }],
  }, transit: { busStops: [], busRoutes: [], trainStations: [], trainLines: [], subwayStations: [], subwayLines: [] } }
}

const params = { seed: 'sections', toggles: { bridges: false, acTubes: false, wires: false, tunnels: false, bus: false, subway: false, train: false, airPaths: false } }

/** Independent directed-line coordinates for this straight-arm public fixture. */
function coordinates(edge: StreetEdge, point: Vec2): { along: number; left: number } {
  const [x, z] = edge.path[1], length = Math.hypot(x, z)
  return { along: (point[0] * x + point[1] * z) / length, left: (x * point[1] - z * point[0]) / length }
}

describe('authored street movement', () => {
  it('pairs adjacent street arms even when broad sidewalks extend past their endpoint bearings', () => {
    const atlas = crossAtlas()
    atlas.streets.crossings = []
    for (const edge of atlas.streets.edges) { edge.width = 7; edge.crossSection = section(7, 2) }
    const corners = generate(atlas, params).networks.walk.edges.filter((edge) => edge.kind === 'sidewalk' && !edge.edgeId)
    expect(corners).toHaveLength(4)
    for (const corner of corners) for (const point of corner.path) {
      expect(Math.abs(point[0])).toBeGreaterThan(3.5)
      expect(Math.abs(point[1])).toBeGreaterThan(3.5)
    }
  })

  it('keeps each bent lane parallel to both segments at the miter', () => {
    const atlas = crossAtlas(), edge = atlas.streets.edges[0]
    edge.path = [[0, 0], [60, 0], [120, 60]]
    edge.elevationProfile[1].distance = 60 + Math.hypot(60, 60)
    atlas.streets.nodes.find((node) => node.id === 'n0')!.position = [120, 60]
    const lanes = generate(atlas, params).networks.road.lanes.filter((lane) => lane.edgeId === 'e0')
    for (const spec of edge.crossSection!.lanes) {
      const expected = [60 - spec.offset * Math.tan(Math.PI / 8), spec.offset]
      expect(lanes.some((lane) => lane.path.some((p) => Math.hypot(p[0] - expected[0], p[1] - expected[1]) < 1e-7))).toBe(true)
    }
  })

  it('keeps full alley width when the actual paving uses the published millimetre coordinate grid', () => {
    const atlas = crossAtlas(), edge = atlas.streets.edges[0]
    edge.class = 'alley'; edge.width = 0; edge.sidewalk = { left: 2.5, right: 2.5 }
    edge.crossSection = { runId: 'alley', profileId: 'alley', lanes: [], shoulders: { left: 0, right: 0 }, sidewalks: {
      left: { profileId: 'alley', bands: { curb: 0, border: 0, furnishing: 0, walking: 2.5, frontage: 0 } },
      right: { profileId: 'alley', bands: { curb: 0, border: 0, furnishing: 0, walking: 2.5, frontage: 0 } },
    } }
    const length = Math.hypot(120, 30), normal: Vec2 = [-30 / length * 2.5, 120 / length * 2.5]
    edge.path = [[0, 0], [120, 30]]; edge.elevationProfile[1].distance = length
    atlas.streets.edges = [edge]; atlas.streets.crossings = []
    atlas.streets.nodes = [{ id: 'center', position: [0, 0], edgeIds: ['e0'], connections: [{ level: 0, edgeIds: ['e0'] }] }, { id: 'n0', position: [120, 30], edgeIds: ['e0'], connections: [{ level: 0, edgeIds: ['e0'] }] }]
    const polygon: Vec2[] = [[-normal[0], -normal[1]], [120 - normal[0], 30 - normal[1]], [120 + normal[0], 30 + normal[1]], normal]
    atlas.volumetric.ground = [{ surface: 'sidewalk', polygon: polygon.map((p) => [Math.round(p[0] * 1000) / 1000, Math.round(p[1] * 1000) / 1000]), bottom: 0, top: .15 }]
    const { walk, road } = generate(atlas, params).networks
    expect(road.lanes).toHaveLength(0)
    expect(walk.edges).toHaveLength(2)
    for (const run of walk.edges) {
      expect(run.width).toBe(2.5)
      expect(coordinates(edge, run.path[0]).along).toBeCloseTo(1.5, 7)
      expect(coordinates(edge, run.path.at(-1)!).along).toBeCloseTo(length - 1.5, 7)
    }
  })

  it('keeps unequal directional lane counts and only permits changes across shared lane boundaries', () => {
    const atlas = crossAtlas(), street = atlas.streets.edges[0]
    street.width = 10
    street.crossSection!.lanes = [
      { direction: 'forward', width: 2, offset: 3.5 },
      { direction: 'backward', width: 3, offset: 1 },
      { direction: 'forward', width: 4, offset: -2.5 },
    ]
    atlas.streets.crossings = []
    const lanes = generate(atlas, params).networks.road.lanes.filter((lane) => lane.edgeId === street.id)
    expect(lanes.map((lane) => lane.id)).toEqual(['e0f0', 'e0f1', 'e0b0'])
    expect(lanes.every((lane) => !lane.left && !lane.right)).toBe(true)
    expect(lanes.find((lane) => lane.id === 'e0f0')!.width).toBe(4)
  })

  it('uses 7, 14 and 21 m lane dimensions and directions independent of street class', () => {
    const atlas = crossAtlas(), out = generate(atlas, params)
    expect(out).toEqual(generate(structuredClone(atlas), params))
    for (const edge of atlas.streets.edges) {
      const lanes = out.networks.road.lanes.filter((lane) => lane.edgeId === edge.id)
      expect(lanes).toHaveLength(edge.crossSection!.lanes.length)
      for (const spec of edge.crossSection!.lanes) {
        const lane = lanes.find((candidate) => Math.abs(coordinates(edge, candidate.path[0]).left - spec.offset) < 1e-7)!
        expect(lane.width).toBe(spec.width)
        expect(lane.sourceDirection).toBe(spec.direction)
        expect(lane.sourceOffset).toBe(spec.offset)
        const travel = coordinates(edge, lane.path.at(-1)!).along - coordinates(edge, lane.path[0]).along
        expect(travel > 0).toBe(spec.direction === 'forward')
        for (const point of lane.path) expect(Math.abs(coordinates(edge, point).left) + lane.width / 2).toBeLessThanOrEqual(edge.width / 2 + 1e-7)
      }
    }
    const byId = new Map(out.networks.road.lanes.map((lane) => [lane.id, lane]))
    for (const lane of byId.values()) for (const next of lane.next) {
      expect(next.via3[0]).toEqual(lane.path3.at(-1))
      expect(next.via3.at(-1)).toEqual(byId.get(next.laneId)!.path3[0])
      for (const point of next.via) expect(atlas.streets.edges.some((edge) => { const c = coordinates(edge, point); return c.along >= -1e-7 && Math.abs(c.left) <= edge.width / 2 + 1e-7 })).toBe(true)
    }
  })

  it('preserves one-way direction through reversed source fragments alongside two- and four-lane arms', () => {
    const atlas = crossAtlas()
    atlas.streets.crossings = []
    const directions: ('forward' | 'backward')[][] = [['forward'], ['backward', 'forward'], ['backward'], ['backward', 'backward', 'forward', 'forward']]
    for (const [i, edge] of atlas.streets.edges.entries()) {
      edge.width = directions[i].length * 3.5
      edge.crossSection!.shoulders = { left: 0, right: 0 }
      edge.crossSection!.runId = i % 2 === 0 ? 'one-way' : `run-${i}`
      edge.crossSection!.lanes = directions[i].map((direction, index) => ({ direction, width: 3.5, offset: edge.width / 2 - 3.5 * (index + .5) }))
    }
    const { road } = generate(atlas, params).networks
    for (const [i, edge] of atlas.streets.edges.entries()) {
      const lanes = road.lanes.filter((lane) => lane.edgeId === edge.id)
      expect(lanes).toHaveLength(directions[i].length)
      for (const spec of edge.crossSection!.lanes) {
        const lane = lanes.find((candidate) => Math.abs(coordinates(edge, candidate.path[0]).left - spec.offset) < 1e-7)!
        expect(lane.width).toBe(3.5)
        expect(lane.sourceDirection).toBe(spec.direction)
        expect(lane.sourceOffset).toBe(spec.offset)
        expect(coordinates(edge, lane.path.at(-1)!).along > coordinates(edge, lane.path[0]).along).toBe(spec.direction === 'forward')
      }
    }
    const incoming = road.lanes.find((lane) => lane.id === 'e2b0')!
    const outgoing = road.lanes.find((lane) => lane.id === 'e0f0')!
    const through = incoming.next.find((next) => next.laneId === outgoing.id)!
    expect(through.via3[0]).toEqual(incoming.path3.at(-1))
    expect(through.via3.at(-1)).toEqual(outgoing.path3[0])
    expect(road.lanes.some((lane) => lane.id === 'e2f0' || lane.id === 'e0b0')).toBe(false)
  })

  it('walks each clear band and connects crossings at the actual run instead of a distant corner', () => {
    const atlas = crossAtlas(), { walk } = generate(atlas, params).networks
    const streets = new Map(atlas.streets.edges.map((edge) => [edge.id, edge]))
    for (const edge of walk.edges.filter((edge) => edge.edgeId)) {
      const street = streets.get(edge.edgeId!)!, bands = street.crossSection!.sidewalks[edge.side!].bands
      expect(edge.width).toBe(bands.walking)
      const offset = street.width / 2 + bands.curb + bands.border + bands.furnishing + bands.walking / 2
      for (const point of edge.path) expect(coordinates(street, point).left).toBeCloseTo(edge.side === 'left' ? offset : -offset, 8)
    }
    const crossing = walk.edges.find((edge) => edge.kind === 'crossing')!
    expect(crossing.width).toBe(4)
    expect(crossing.path).toEqual([[16, 6.5], [16, -5.25]])
    const nodes = new Map(walk.nodes.map((node) => [node.id, node]))
    for (const id of [crossing.from, crossing.to]) {
      const access = walk.edges.find((edge) => edge.kind === 'access' && edge.from === id)!
      expect(nodes.get(access.to)!.x).toBe(16)
      expect(walk.edges.some((edge) => edge.kind === 'sidewalk' && (edge.to === access.to || edge.from === access.to))).toBe(true)
    }
  })

  it('rejects contradictory section totals, offsets and direction contracts', () => {
    for (const mutate of [
      (edge: StreetEdge) => { edge.crossSection!.lanes[0].offset += .1 },
      (edge: StreetEdge) => { edge.crossSection!.sidewalks.left.bands.walking += .2 },
      (edge: StreetEdge) => { edge.crossSection!.lanes[0].direction = 'sideways' as 'forward' },
    ]) {
      const atlas = crossAtlas(); mutate(atlas.streets.edges[0])
      expect(() => generate(atlas, params)).toThrowError(expect.objectContaining({ code: 'E_ATLAS_INVALID', path: 'atlas.streets.edges.e0.crossSection' }))
    }
  })

  it('preserves authored station bay approaches and their exact walking-side graph handoff', () => {
    const atlas = crossAtlas()
    const approach: Vec2[] = [[40, 6.5], [40, 9.5]]
    const shaft: Vec2[] = [[36, 9.5], [44, 9.5], [44, 12.5], [36, 12.5]]
    atlas.transit.subwayStations.push({ id: 'station', position: [40, 25], districtId: '', entrances: [[40, 9.5]], level: -12,
      platform: [[35, 20], [45, 20], [45, 30], [35, 30]], box: { bottom: -12, top: -8 },
      shafts: [{ footprint: shaft, top: 0, bottom: -12, passage: [[39, 12.5], [41, 12.5], [41, 25], [39, 25]] }],
      entranceBays: [{ edgeId: 'e0', side: 'left', distance: 40, footprint: [[35, 6.5], [45, 6.5], [45, 13.5], [35, 13.5]], shaft, approach }],
      accessPaths: [{ entranceIndex: 0, segments: [{ kind: 'stairs', path: [[40, 0, 9.5], [40, -12, 12.5]] }, { kind: 'passage', path: [[40, -12, 12.5], [40, -12, 25]] }], platformHandoff: [40, -12, 25] }],
    })
    const { walk } = generate(atlas, params).networks
    const entrance = walk.nodes.find((node) => node.kind === 'station-entrance')!
    const access = walk.edges.find((edge) => edge.kind === 'access' && edge.from === entrance.id)!
    expect(access.path).toEqual([...approach].reverse())
    const sidewalk = walk.edges.find((edge) => edge.edgeId === 'e0' && edge.side === 'left' && edge.to === access.to)!
    expect(sidewalk.path3.at(-1)).toEqual([40, 0, 6.5])
    expect(walk.edges.find((edge) => edge.kind === 'stairs')!.from).toBe(entrance.id)
    atlas.transit.subwayStations[0].entranceBays![0].approach[0][1] += .1
    expect(() => generate(atlas, params)).toThrowError(expect.objectContaining({ code: 'E_ATLAS_INVALID', path: 'atlas.transit.stations.station.entranceBays' }))
  })

  it('preserves every elevation breakpoint with authored lane and walking offsets', () => {
    const atlas = crossAtlas(), street = atlas.streets.edges[0]
    street.level = 8
    street.elevationProfile = [{ distance: 0, level: 0 }, { distance: 60, level: 8 }, { distance: 120, level: 8 }]
    atlas.streets.nodes.find((node) => node.id === 'n0')!.connections[0].level = 8
    const { road, walk } = generate(atlas, params).networks
    for (const path of [...road.lanes.filter((lane) => lane.edgeId === 'e0'), ...walk.edges.filter((edge) => edge.edgeId === 'e0')]) {
      if (Math.min(...path.path3.map((p) => p[0])) >= 60 || Math.max(...path.path3.map((p) => p[0])) <= 60) continue
      expect(path.path3.some((point) => Math.abs(point[0] - 60) < 1e-7 && point[1] === 8)).toBe(true)
      for (const point of path.path3) expect(point[1]).toBeCloseTo(Math.min(8, point[0] * 8 / 60), 8)
    }
  })
})
