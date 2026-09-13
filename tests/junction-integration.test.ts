import { expect, it } from 'vitest'
import { generate } from '../src'
import type { Vec2 } from '../src/types/atlas'
import { shortJunctionAtlas } from './section-junction.fixture'

const params = { seed: 'short-junction', toggles: { bridges: false, acTubes: false, wires: false, tunnels: false, bus: false, subway: false, train: false, airPaths: false } }

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

it('joins both consumed street sides and their building access through full-width authored paving', () => {
  const atlas = shortJunctionAtlas()
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

it('rejects absent paving for required walking bands instead of treating them as empty barriers', () => {
  const atlas = shortJunctionAtlas()
  atlas.parcels = []
  atlas.volumetric.buildings = []
  atlas.volumetric.ground = []
  expect(() => generate(atlas, params)).toThrowError(expect.objectContaining({ code: 'E_ATLAS_INVALID' }))
})

it('retains a covered quarter-metre middle run between disjoint endpoint reservations', () => {
  const atlas = shortJunctionAtlas(10.25)
  atlas.parcels = []
  atlas.volumetric.buildings = []
  const runs = generate(atlas, params).networks.walk.edges.filter((edge) => edge.edgeId === 'middle')
  expect(runs).toHaveLength(2)
  for (const run of runs) {
    expect(Math.hypot(run.path.at(-1)![0] - run.path[0][0], run.path.at(-1)![1] - run.path[0][1])).toBeCloseTo(.25, 8)
    expect(run.width).toBe(run.side === 'left' ? 3 : 1.5)
  }
})

it('rejects an interior paving gap even when both walking endpoint caps are covered', () => {
  const atlas = shortJunctionAtlas(30)
  atlas.parcels = []
  atlas.volumetric.buildings = []
  const baseline = generate(atlas, params).networks.walk.edges.find((edge) => edge.edgeId === 'middle' && edge.side === 'left')!
  expect(baseline.path).toEqual([[-6.5, 5], [-6.5, 25]])
  atlas.volumetric.ground = atlas.volumetric.ground!.flatMap((cell) => {
    const [[x0, y0], [x1], [, y1]] = cell.polygon
    if (cell.surface !== 'sidewalk' || x0 >= -6.5 || x1 <= -6.5 || y0 >= 14 || y1 <= 16) return [cell]
    return [[y0, 14], [14, 16], [16, y1]].map(([a, b]) => ({ ...cell, surface: a === 14 ? 'open' as const : 'sidewalk' as const, polygon: [[x0, a], [x1, a], [x1, b], [x0, b]] as Vec2[] }))
  })
  expect(() => generate(atlas, params)).toThrowError(expect.objectContaining({ code: 'E_ATLAS_INVALID', path: 'atlas.streets.edges.middle' }))
})
