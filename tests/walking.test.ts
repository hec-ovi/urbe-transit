import { expect, it } from 'vitest'
import { generate } from '../src'
import type { AtlasBlueprint, StreetEdge, Vec2 } from '../src/types/atlas'
import { shortJunctionAtlas } from './section-junction.fixture'
import explicitSidewalkEdge from './explicit-sidewalk.fixture.json'
import reservedStreet from './fixtures/reserved-street.json'

const walkOnly = (seed: string) => ({ seed, toggles: { bridges: false, acTubes: false, wires: false, tunnels: false, bus: false, subway: false, train: false, airPaths: false } })

/** One exact public Atlas module-city edge, with empty surrounding city collections. */
function explicitSidewalkAtlas(): AtlasBlueprint {
  const edge = structuredClone(explicitSidewalkEdge) as StreetEdge
  return {
    meta: { seed: 'explicit-sidewalk', bounds: { min: [0, 0], max: [200, 100] } },
    districts: [], parcels: [], volumetric: { buildings: [] },
    streets: {
      edges: [edge], crossings: [],
      nodes: [edge.from, edge.to].map((id, i) => ({ id, position: edge.path[i], edgeIds: [edge.id], connections: [{ level: 0, edgeIds: [edge.id] }] })),
    },
    transit: { busStops: [], busRoutes: [], trainStations: [], trainLines: [], subwayStations: [], subwayLines: [] },
  }
}

/** Separating-axis proof for the complete square-capped path strip against an authored cell. */
function intersectsCell(a: Vec2, b: Vec2, width: number, cell: Vec2[]): boolean {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1])
  if (length < 1e-9) return false
  const direction: Vec2 = [(b[0] - a[0]) / length, (b[1] - a[1]) / length], normal: Vec2 = [-direction[1], direction[0]]
  const center = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  for (const axis of [direction, normal, [1, 0], [0, 1]]) {
    const p = center[0] * axis[0] + center[1] * axis[1]
    const half = (length + width) / 2 * Math.abs(direction[0] * axis[0] + direction[1] * axis[1]) + width / 2 * Math.abs(normal[0] * axis[0] + normal[1] * axis[1])
    const projected = cell.map((point) => point[0] * axis[0] + point[1] * axis[1])
    if (p + half <= Math.min(...projected) + 1e-6 || p - half >= Math.max(...projected) - 1e-6) return false
  }
  return true
}

/** One published Atlas street with its planning reservations, along +X so bands section in Z. */
function reservedStreetAtlas(): AtlasBlueprint {
  return structuredClone(reservedStreet) as unknown as AtlasBlueprint
}

/** Transverse section of a published band at one station, independent of its vertex count. */
function section(polygons: Vec2[][], x: number): [number, number] {
  const cuts: number[] = []
  for (const polygon of polygons) for (const [i, a] of polygon.entries()) {
    const b = polygon[(i + 1) % polygon.length]
    if ((a[0] <= x) !== (b[0] <= x)) cuts.push(a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]))
  }
  cuts.sort((a, b) => a - b)
  return [cuts[0], cuts.at(-1)!]
}

it('joins both consumed street sides and their building access through full-width authored paving', () => {
  const atlas = shortJunctionAtlas()
  const params = walkOnly('short-junction')
  const out = generate(atlas, params)
  expect(out).toEqual(generate(structuredClone(atlas), params))
  const { walk } = out.networks
  const nodes = new Map(walk.nodes.map((node) => [node.id, node]))
  for (const parcel of atlas.parcels) {
    const entry = walk.nodes.find((node) => node.kind === 'entry' && node.ref === parcel.id)!
    const access = walk.edges.find((edge) => edge.from === entry.id && edge.kind === 'access')!
    expect(access.path3[0]).toEqual([parcel.access.point[0], 0, parcel.access.point[1]])
    expect(walk.edges.some((edge) => edge.kind === 'sidewalk' && (edge.from === access.to || edge.to === access.to))).toBe(true)
    expect(access.path.every((point) => point[0] * parcel.access.point[0] > 0)).toBe(true)
  }
  expect(walk.edges.some((edge) => edge.edgeId === 'middle')).toBe(false)
  for (const edge of walk.edges) {
    expect(nodes.has(edge.from) && nodes.has(edge.to)).toBe(true)
    expect(edge.path3[0]).toEqual([nodes.get(edge.from)!.x, nodes.get(edge.from)!.y, nodes.get(edge.from)!.z])
    expect(edge.path3.at(-1)).toEqual([nodes.get(edge.to)!.x, nodes.get(edge.to)!.y, nodes.get(edge.to)!.z])
    for (let i = 1; i < edge.path.length; i++) for (const ground of atlas.volumetric.ground!) {
      if (ground.surface === 'sidewalk') continue
      expect(intersectsCell(edge.path[i - 1], edge.path[i], edge.width, ground.polygon), `${edge.id} leaves paving`).toBe(false)
    }
  }
})

it('accepts published 2.1.0 street reservations and rejects an older model', () => {
  const atlas = reservedStreetAtlas()
  const reservation = atlas.streets.construction!.planningReservations!.edges[0]
  const out = generate(atlas, walkOnly('reserved-street'))
  const runs = out.networks.walk.edges.filter((edge) => edge.kind === 'sidewalk')
  expect(runs).toHaveLength(2)
  for (const run of runs) {
    const middle = (run.path[0][0] + run.path.at(-1)![0]) / 2
    const [low, high] = section(reservation.sides[run.side!].walking, middle)
    expect(high - low).toBeCloseTo(run.width, 9)
    for (const point of run.path) expect(point[1]).toBeCloseTo((low + high) / 2, 9)
  }
  const older = reservedStreetAtlas()
  const planning = older.streets.construction!.planningReservations!
  planning.version = planning.model.version = '1.1.0' as typeof planning.version
  expect(() => generate(older, walkOnly('reserved-street'))).toThrowError(expect.objectContaining({
    name: 'ConnectionsError', code: 'E_ATLAS_INVALID', message: 'unsupported street reservation model',
    path: 'atlas.streets.construction.planningReservations',
  }))
})

it('places both walking bands at their published intervals while preserving carriageway lanes', () => {
  const input = explicitSidewalkAtlas(), before = structuredClone(input)
  const output = generate(input, { seed: 'explicit-sidewalk' })
  expect(input).toEqual(before)
  const walking = output.networks.walk.edges.filter((edge) => edge.edgeId === 'e0')
  expect(walking).toHaveLength(2)
  for (const edge of walking) {
    expect(edge.width).toBe(edge.side === 'left' ? 3 : 2)
    for (const point of edge.path) expect(point[1]).toBeCloseTo(edge.side === 'left' ? 40.5 : 21, 8)
  }
  const lanes = output.networks.road.lanes
  expect(lanes).toHaveLength(4)
  expect(lanes.map((lane) => lane.sourceOffset).sort((a, b) => a! - b!)).toEqual([-5.25, -1.75, 1.75, 5.25])
  expect(lanes.every((lane) => lane.width === 3.5)).toBe(true)
})
