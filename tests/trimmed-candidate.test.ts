import { expect, it } from 'vitest'
import { generate } from '../src'
import type { AtlasBlueprint } from '../src/types/atlas'
import fixture from './fixtures/trimmed-candidate.json'

// One published edge and its exact crossing/ground records, with only that edge in each endpoint group.
it('selects a full-width regular walking candidate after its authored terminal cuts', () => {
  const atlas = structuredClone(fixture) as unknown as AtlasBlueprint
  const out = generate(atlas, { seed: 'trimmed-candidate' })
  const street = atlas.streets.edges[0]
  const runs = out.networks.walk.edges.filter((edge) => edge.edgeId === street.id)
  expect(new Set(runs.map((run) => run.side))).toEqual(new Set(['left', 'right']))
  for (const run of runs) {
    expect(run.width).toBe(3.5)
    expect(run.path3).toEqual(run.path.map(([x, z]) => [x, 0, z]))
  }
  for (const junction of atlas.streets.construction!.junctions!) {
    const approach = junction.approaches[0], from = approach.nodeId === street.from
    const dx = street.path[1][0] - street.path[0][0], dz = street.path[1][1] - street.path[0][1]
    for (const side of ['left', 'right'] as const) {
      const terminal = approach.walkingLandings![side], a = terminal[from ? 1 : 0], b = terminal[from ? 2 : 3]
      const normal = [b[1] - a[1], a[0] - b[0]], sign = (normal[0] * dx + normal[1] * dz) * (from ? 1 : -1) >= 0 ? 1 : -1
      const distances = runs.filter((run) => run.side === side).flatMap((run) => run.path.map((p) => sign * ((p[0] - a[0]) * normal[0] + (p[1] - a[1]) * normal[1]) / Math.hypot(...normal)))
      expect(Math.min(...distances)).toBeGreaterThanOrEqual(-1e-9)
      expect(Math.min(...distances)).toBeCloseTo(0, 9)
    }
  }
})
