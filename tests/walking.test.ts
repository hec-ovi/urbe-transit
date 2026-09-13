import { expect, it } from 'vitest'
import { generate } from '../src'
import type { Vec2 } from '../src/types/atlas'
import { crossingAtlas } from './crossing.fixture'
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

it('preserves crossing anchors and both walking handoffs from the published plan', () => {
  const atlas = crossingAtlas()
  const { walk } = generate(atlas, params).networks
  const source = atlas.streets.crossings[0].segments[0]
  const crossing = walk.edges.find(edge => edge.kind === 'crossing')!
  expect(crossing.path).toEqual([source.from, source.roadway!.from, source.roadway!.to, source.to])
  expect(crossing.path3).toEqual(crossing.path.map(([x, z]) => [x, 0, z]))
  expect(crossing.width).toBe(source.width)
  for (const id of [crossing.from, crossing.to]) expect(walk.edges.some(edge => edge.kind === 'access' && edge.from === id)).toBe(true)
})
