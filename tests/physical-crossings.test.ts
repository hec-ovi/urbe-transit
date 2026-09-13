import { expect, it } from 'vitest'
import { generate } from '../src'
import { bentCrossingAtlas, earlyBendCrossingAtlas, physicalCrossingAtlas, rotatedCrossingAtlas } from './physical-crossing.fixture'
import { crossingMarginAtlas, terminalIntrusionAtlas } from './crossing-margin.fixture'

const params = { seed: 'physical-crossing', toggles: { bridges: false, acTubes: false, wires: false, tunnels: false, bus: false, subway: false, train: false, airPaths: false } }

it('uses source external crossing cuts and preserves both original nodes inside one walking junction', () => {
  const atlas = physicalCrossingAtlas(), out = generate(atlas, params)
  expect(out).toEqual(generate(structuredClone(atlas), params))
  const { walk } = out.networks
  expect(walk.edges.some((edge) => edge.edgeId === 'middle')).toBe(false)
  for (const approach of atlas.streets.construction!.junctions![0].approaches) {
    const source = atlas.streets.edges.find((edge) => edge.id === approach.edgeId)!
    const length = source.elevationProfile.at(-1)!.distance
    const direction = [(source.path[1][0] - source.path[0][0]) / length, (source.path[1][1] - source.path[0][1]) / length]
    for (const run of walk.edges.filter((edge) => edge.edgeId === source.id)) for (const point of run.path) {
      const station = (point[0] - source.path[0][0]) * direction[0] + (point[1] - source.path[0][1]) * direction[1]
      if (approach.nodeId === source.from) expect(station).toBeGreaterThanOrEqual(approach.station[1] - 1e-7)
      else expect(station).toBeLessThanOrEqual(approach.station[0] + 1e-7)
    }
  }
  const crossings = walk.edges.filter((edge) => edge.kind === 'crossing')
  expect(crossings.map((edge) => edge.path)).toEqual(atlas.streets.crossings.flatMap((crossing) => crossing.segments.map((segment) => [segment.from, segment.to])))
  for (const crossing of crossings) for (const nodeId of [crossing.from, crossing.to]) expect(walk.edges.some((edge) => edge.kind === 'access' && edge.from === nodeId)).toBe(true)
})

it('rejects contradictory source groups, field stations and unowned crossing landings', () => {
  for (const mutate of [
    (atlas: ReturnType<typeof physicalCrossingAtlas>) => { atlas.streets.construction!.junctions![0].approaches[0].groupId = 'missing' },
    (atlas: ReturnType<typeof physicalCrossingAtlas>) => { atlas.streets.construction!.junctions![0].approaches[0].station = [-1, 2] },
    (atlas: ReturnType<typeof physicalCrossingAtlas>) => { const landing = atlas.streets.construction!.junctions![0].approaches[0].landings.left; for (const point of landing) point[0] += 200 },
    (atlas: ReturnType<typeof physicalCrossingAtlas>) => { atlas.streets.crossings[0].segments[0].from[1] += 1 },
    (atlas: ReturnType<typeof physicalCrossingAtlas>) => { atlas.streets.construction!.junctions![0].approaches.shift() },
    (atlas: ReturnType<typeof physicalCrossingAtlas>) => { atlas.streets.crossings[0].segments[0].width = NaN },
    (atlas: ReturnType<typeof physicalCrossingAtlas>) => { atlas.streets.construction!.junctions![0].approaches.shift(); atlas.streets.crossings[0].segments.shift() },
    (atlas: ReturnType<typeof physicalCrossingAtlas>) => {
      for (const edge of atlas.streets.edges) { edge.level = 8; for (const knot of edge.elevationProfile) knot.level = 8 }
      for (const node of atlas.streets.nodes) for (const group of node.connections) group.level = 8
    },
  ]) {
    const atlas = physicalCrossingAtlas(); mutate(atlas)
    expect(() => generate(atlas, params)).toThrowError(expect.objectContaining({ code: 'E_ATLAS_INVALID', path: 'atlas.streets.construction.junctions' }))
  }
})

it('allows an authored crossing connector over its road margin while regular walking remains on sidewalk', () => {
  const atlas = crossingMarginAtlas()
  const out = generate(atlas, params)
  expect(out.networks.walk.edges.filter((edge) => edge.kind === 'crossing')).toHaveLength(4)
  expect(() => generate(crossingMarginAtlas(true), params)).toThrowError(expect.objectContaining({ code: 'E_ATLAS_INVALID' }))
  delete atlas.streets.construction!.junctions![0].approaches[0].walkingLandings
  expect(() => generate(atlas, params)).toThrowError(expect.objectContaining({ code: 'E_ATLAS_INVALID', path: 'atlas.streets.construction.junctions' }))
})

it('requires crossing terminal strips to fit their named walking band and exact source authority', () => {
  for (const mutate of [
    (atlas: ReturnType<typeof crossingMarginAtlas>) => { const terminal = atlas.streets.construction!.junctions![0].approaches[0].walkingLandings!.left; for (const point of terminal) point[0] += .5 },
    (atlas: ReturnType<typeof crossingMarginAtlas>) => { delete atlas.streets.construction!.planningReservations },
    (atlas: ReturnType<typeof crossingMarginAtlas>) => { const terminal = atlas.streets.construction!.junctions![0].approaches[0].walkingLandings!.left; terminal.push(terminal.shift()!) },
  ]) {
    const atlas = crossingMarginAtlas(); mutate(atlas)
    expect(() => generate(atlas, params)).toThrowError(expect.objectContaining({ code: 'E_ATLAS_INVALID', path: 'atlas.streets.construction.junctions' }))
  }
})

it('rejects a thin roadway intrusion beyond the crossing coordinate-precision envelope', () => {
  expect(() => generate(terminalIntrusionAtlas(), params)).toThrowError(expect.objectContaining({
    code: 'E_ATLAS_INVALID', message: 'crossing terminal physical-a-b/south/left leaves pedestrian ground',
  }))
})

it('meets the exact terminal cuts in the public rotated Atlas crossing fixture', () => {
  const atlas = rotatedCrossingAtlas(), out = generate(atlas, params)
  const nominalDifferences: number[] = []
  for (const approach of atlas.streets.construction!.junctions![0].approaches) {
    const source = atlas.streets.edges.find((edge) => edge.id === approach.edgeId)!, from = approach.nodeId === source.from
    const dx = source.path[1][0] - source.path[0][0], dy = source.path[1][1] - source.path[0][1], length = Math.hypot(dx, dy)
    for (const side of ['left', 'right'] as const) {
      const terminal = approach.walkingLandings![side], a = terminal[from ? 1 : 0], b = terminal[from ? 2 : 3]
      const normal = [b[1] - a[1], a[0] - b[0]], sign = (normal[0] * dx + normal[1] * dy) * (from ? 1 : -1) >= 0 ? 1 : -1
      const points = out.networks.walk.edges.filter((edge) => edge.edgeId === source.id && edge.side === side).flatMap((edge) => edge.path)
      for (const run of out.networks.walk.edges.filter((edge) => edge.edgeId === source.id && edge.side === side)) {
        expect(run.width).toBe(source.crossSection!.sidewalks[side].bands.walking)
        expect(run.path3.every((point) => point[1] === 0)).toBe(true)
      }
      expect(points.length).toBeGreaterThan(0)
      const distances = points.map((p) => sign * ((p[0] - a[0]) * normal[0] + (p[1] - a[1]) * normal[1]) / Math.hypot(...normal))
      expect(Math.min(...distances)).toBeCloseTo(0, 9)
      expect(Math.min(...distances)).toBeGreaterThanOrEqual(-1e-9)
      const endpoint = points[distances.indexOf(Math.min(...distances))]
      const station = ((endpoint[0] - source.path[0][0]) * dx + (endpoint[1] - source.path[0][1]) * dy) / length
      nominalDifferences.push(Math.abs(station - approach.station[from ? 1 : 0]))
    }
  }
  expect(Math.max(...nominalDifferences)).toBeGreaterThan(.00001)
})

it('cuts bent walking paths at the source field boundary rather than its different arc distance', () => {
  const atlas = bentCrossingAtlas(), out = generate(atlas, params)
  const runs = out.networks.walk.edges.filter((edge) => edge.edgeId === 'e0')
  expect(new Set(runs.map((run) => run.side))).toEqual(new Set(['left', 'right']))
  for (const side of ['left', 'right']) {
    const stations = runs.filter((run) => run.side === side).flatMap((run) => run.path.map(([x, y]) => 40 + (x - 50 + y - 10) * Math.SQRT1_2))
    expect(Math.min(...stations)).toBeCloseTo(56.5, 6)
  }
})

it('preserves exact crossing connector seams at full width in the public early-bend fixture', () => {
  const atlas = earlyBendCrossingAtlas(), out = generate(atlas, params)
  const source = atlas.streets.crossings[0].segments[0]
  const crossing = out.networks.walk.edges.find((edge) => edge.kind === 'crossing')!
  const path = [source.from, source.roadway!.from, source.roadway!.to, source.to]
  expect(crossing.path).toEqual(path)
  expect(crossing.path3).toEqual(path.map(([x, z]) => [x, 0, z]))
  expect(crossing.width).toBe(3)
  delete source.roadway
  expect(() => generate(atlas, params)).toThrowError(expect.objectContaining({ code: 'E_ATLAS_INVALID', message: expect.stringContaining('leaves its field and landings') }))
})
