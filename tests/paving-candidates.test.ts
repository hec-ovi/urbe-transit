import { expect, it } from 'vitest'
import { generate } from '../src'
import type { AtlasBlueprint, Vec2 } from '../src/types/atlas'
import { shortJunctionAtlas } from './section-junction.fixture'
import { croppedPavingAtlas, rotatePavingAtlas } from './cropped-paving.fixture'

const params = { seed: 'paving-candidates', toggles: { bridges: false, acTubes: false, wires: false, tunnels: false, bus: false, subway: false, train: false, airPaths: false } }

function subdivide(atlas: AtlasBlueprint): void {
  atlas.volumetric.ground = atlas.volumetric.ground!.flatMap(ground => {
    if (ground.surface !== 'sidewalk') return [ground]
    const [[x0, y0], [x1], [, y1]] = ground.polygon
    const xs = [x0, (x0 + x1) / 2, x1], ys = [y0, (y0 + y1) / 2, y1]
    return [0, 1].flatMap(i => [0, 1].map(j => ({ ...ground, polygon: [[xs[i], ys[j]], [xs[i + 1], ys[j]], [xs[i + 1], ys[j + 1]], [xs[i], ys[j + 1]]] as Vec2[] })))
  })
}

it('retains public movement output when final paving is divided into shared cells', () => {
  const atlas = shortJunctionAtlas(), expected = generate(atlas, params)
  subdivide(atlas)
  expect(generate(atlas, params)).toEqual(expected)
})

it('retains valid routing when touching owners use different collinear subdivisions', () => {
  const atlas = shortJunctionAtlas(), expected = generate(atlas, params)
  subdivide(atlas)
  const polygon = atlas.volumetric.ground!.find(ground => ground.surface === 'sidewalk' && ground.polygon.some(([x, y]) => Math.abs(x) < 10 && Math.abs(y) < 10))!.polygon
  const [a, b] = polygon
  polygon.splice(1, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])
  expect(generate(atlas, params)).toEqual(expected)
})

it('retains the hole detour when a query window cuts shared paving subdivisions', () => {
  const atlas = croppedPavingAtlas(), divided = structuredClone(atlas)
  subdivide(divided)
  rotatePavingAtlas(atlas)
  rotatePavingAtlas(divided)
  const movement = (input: AtlasBlueprint) => JSON.parse(JSON.stringify(generate(input, params).networks.walk,
    (_key, value) => typeof value === 'number' ? Math.round(value * 1e8) / 1e8 : value))
  const expected = movement(atlas)
  expect(expected.edges.find((edge: { path: Vec2[] }) => edge.path.length > 2)?.path).toHaveLength(4)
  expect(movement(divided)).toEqual(expected)
})

it('rejects a missing paving cell across a required full-width run', () => {
  const atlas = shortJunctionAtlas(30)
  atlas.parcels = []
  atlas.volumetric.buildings = []
  subdivide(atlas)
  const missing = atlas.volumetric.ground!.find(ground => ground.surface === 'sidewalk' && ground.polygon.some(([x]) => x < -6.5) && ground.polygon.some(([x]) => x >= -6.5) && ground.polygon.some(([, y]) => y < 15) && ground.polygon.some(([, y]) => y > 15))!
  missing.surface = 'open'
  expect(() => generate(atlas, params)).toThrowError(expect.objectContaining({ code: 'E_ATLAS_INVALID', path: 'atlas.streets.edges.middle' }))
})
