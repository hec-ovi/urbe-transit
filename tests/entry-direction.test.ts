import { expect, it } from 'vitest'
import { generate } from '../src'
import type { AtlasBlueprint } from '../src/types/atlas'
import fixture from './entry-direction.fixture.json'

// Published Atlas junction, planning queries and paving, with one boundary parcel entry.
it('enters inward from a paving boundary before turning toward a distant walking handoff', () => {
  const atlas = structuredClone(fixture) as unknown as AtlasBlueprint
  const out = generate(atlas, { seed: 'boundary-entry', toggles: { bridges: false, acTubes: false, wires: false, tunnels: false, bus: false, subway: false, train: false, airPaths: false } })
  const entry = out.networks.walk.nodes.find(node => node.kind === 'entry')!
  const access = out.networks.walk.edges.find(edge => edge.kind === 'access' && edge.from === entry.id)!
  expect(access.width).toBe(2)
  expect(access.path[0]).toEqual([347.032, 217])
  expect(access.path.length).toBeGreaterThan(2)
  expect(access.path[1][0]).toBe(347.032)
  expect(access.path[1][1]).toBeGreaterThan(217)
  expect(access.path.at(-1)![0]).toBeLessThan(347.032)
  expect(out.networks.walk.edges.some(edge => edge.kind === 'sidewalk' && (edge.from === access.to || edge.to === access.to))).toBe(true)
})
