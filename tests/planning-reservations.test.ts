import { expect, it } from 'vitest'
import { generate } from '../src'
import type { StreetPlanningReservations, Vec2 } from '../src/types/atlas'
import { bentAtlas } from './bent-atlas.fixture'
import input from './fixtures/asymmetric-bend.input.json'
import innerBend from './fixtures/inner-bend.json'
import concaveBand from './fixtures/concave-band.json'
import nearParallelBand from './fixtures/near-parallel-band.json'

const params = { seed: 'planning-reservations', toggles: { bridges: false, acTubes: false, wires: false, tunnels: false, bus: false, subway: false, train: false, airPaths: false } }

function distanceToSource(point: Vec2, path: Vec2[]): number {
  return Math.min(...path.slice(1).map((b, i) => {
    const a = path[i], x = b[0] - a[0], y = b[1] - a[1]
    const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * x + (point[1] - a[1]) * y) / (x * x + y * y)))
    return Math.hypot(point[0] - a[0] - t * x, point[1] - a[1] - t * y)
  }))
}

it('walks the exact asymmetric bent reservation at its declared widths and heights', () => {
  const atlas = bentAtlas(), out = generate(atlas, params)
  expect(out).toEqual(generate(structuredClone(atlas), params))
  const runs = out.networks.walk.edges.filter((edge) => edge.edgeId === 'e0')
  expect(runs).toHaveLength(2)
  for (const run of runs) {
    const bands = atlas.streets.edges[0].crossSection!.sidewalks[run.side!].bands
    const radius = 3.5 + bands.curb + bands.border + bands.furnishing + bands.walking / 2
    expect(run.width).toBe(bands.walking)
    expect(run.path3.every((point) => point[1] === 0)).toBe(true)
    for (const point of run.path) expect(Math.abs(distanceToSource(point, atlas.streets.edges[0].path) - radius)).toBeLessThanOrEqual(.001)
  }
  expect(runs.find((run) => run.side === 'right')!.path.length).toBeGreaterThan(input.edges[0].path.length)
})

it.each([innerBend, nearParallelBand])('fits snapped inner-corner boundaries on $edge.id at the declared width', (fixture) => {
  const atlas = bentAtlas([fixture.edge], fixture.planning)
  const street = atlas.streets.edges[0]
  const runs = generate(atlas, params).networks.walk.edges.filter((edge) => edge.edgeId === street.id)
  expect(runs).toHaveLength(2)
  for (const run of runs) {
    const band = street.crossSection!.sidewalks[run.side!].bands
    const radius = street.width / 2 + band.curb + band.border + band.furnishing + band.walking / 2
    expect(run.width).toBe(band.walking)
    for (const point of run.path) expect(Math.abs(distanceToSource(point, street.path) - radius)).toBeLessThanOrEqual(.001 + 1e-9)
  }
})

it('retains exact concave band interiors when allowing bounded source-coordinate uncertainty', () => {
  const atlas = bentAtlas([concaveBand.edge], concaveBand.planning)
  const runs = generate(atlas, params).networks.walk.edges.filter((edge) => edge.edgeId === concaveBand.edge.id)
  expect(runs).toHaveLength(2)
  expect(runs.map((run) => run.width)).toEqual([3.5, 3.5])
})

it('rejects a walking reservation that cannot carry the original width even when final paving is broad', () => {
  const atlas = bentAtlas()
  const reservation = atlas.streets.construction!.planningReservations!.edges[0].sides.right
  reservation.walking = reservation.walking.map((polygon) => polygon.map(([x, y]) => [x - 30, y]))
  expect(() => generate(atlas, params)).toThrowError(expect.objectContaining({ code: 'E_ATLAS_INVALID', path: 'atlas.streets.edges.e0' }))
})

it('rejects unsupported reservation metadata, missing ownership and malformed polygons', () => {
  for (const mutate of [
    (planning: StreetPlanningReservations) => { planning.model.coordinateGrid = .01 },
    (planning: StreetPlanningReservations) => { planning.edges = [] },
    (planning: StreetPlanningReservations) => { planning.edges[0].sides.left.walking[0].reverse() },
  ]) {
    const atlas = bentAtlas()
    mutate(atlas.streets.construction!.planningReservations!)
    expect(() => generate(atlas, params)).toThrowError(expect.objectContaining({ code: 'E_ATLAS_INVALID' }))
  }
})
