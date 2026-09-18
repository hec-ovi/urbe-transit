import { expect, it } from 'vitest'
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
  const station = atlas.transit.subwayStations[0]
  const [path] = station.accessPaths
  const underground = walk.edges.filter((edge) => edge.stationId === station.id && (edge.kind === 'stairs' || edge.kind === 'passage'))
  expect(underground.map((edge) => edge.kind)).toEqual(path.segments.map((segment) => segment.kind))
  expect(underground.map((edge) => edge.path3)).toEqual(path.segments.map((segment) => segment.path))
  expect(underground[0].from).toBe(entrance.id)
  const handoff = walk.nodes.find((node) => node.id === underground.at(-1)!.to)!
  expect([handoff.x, handoff.y, handoff.z]).toEqual(path.platformHandoff)
  const center = walk.nodes.find((node) => node.kind === 'station' && node.ref === station.id)!
  expect(walk.edges.some((edge) => edge.kind === 'platform' && edge.from === handoff.id && edge.to === center.id)).toBe(true)
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

/** Published district avenue: four 3.5 m lanes with an ornamental median between the pairs. */
function avenueAtlas(median = 3.4): AtlasBlueprint {
  const sidewalk = { profileId: 'district', bands: { curb: .2, border: 1, furnishing: 1, walking: 2, frontage: .7 } }
  const edge: StreetEdge = { id: 'avenue', class: 'road', from: 'a', to: 'b', path: [[0, 0], [200, 0]], width: 17.4, sidewalk: { left: 4.9, right: 4.9 }, level: 0,
    elevationProfile: [{ distance: 0, level: 0 }, { distance: 200, level: 0 }],
    crossSection: { runId: 'avenue', profileId: 'avenue', shoulders: { left: 0, right: 0 }, median: { width: median },
      lanes: [6.95, 3.45, -3.45, -6.95].map((offset, i) => ({ direction: i < 2 ? 'backward' as const : 'forward' as const, width: 3.5, offset })),
      sidewalks: { left: sidewalk, right: sidewalk } },
  }
  return { meta: { seed: 'avenue', bounds: { min: [-20, -20], max: [220, 20] } }, districts: [], parcels: [], volumetric: { buildings: [] },
    streets: { edges: [edge], crossings: [], nodes: ([['a', [0, 0]], ['b', [200, 0]]] as [string, Vec2][]).map(([id, position]) => ({ id, position, edgeIds: ['avenue'], connections: [{ level: 0, edgeIds: ['avenue'] }] })) },
    transit: { busStops: [], busRoutes: [], trainStations: [], trainLines: [], subwayStations: [], subwayLines: [] } }
}

it('leaves the authored median between both lane pairs and checks it against the carriageway', () => {
  const lanes = generate(avenueAtlas(), { seed: 'avenue' }).networks.road.lanes
  expect(lanes.map((lane) => lane.sourceOffset).sort((a, b) => a! - b!)).toEqual([-6.95, -3.45, 3.45, 6.95])
  const inner = Math.min(...lanes.map((lane) => Math.abs(lane.sourceOffset!) - lane.width / 2))
  expect(inner * 2).toBeCloseTo(3.4, 9)
  expect(() => generate(avenueAtlas(4), { seed: 'avenue' })).toThrowError(expect.objectContaining({
    name: 'ConnectionsError', code: 'E_ATLAS_INVALID', path: 'atlas.streets.edges.avenue.crossSection',
  }))
})
