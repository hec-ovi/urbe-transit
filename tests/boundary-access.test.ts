import { expect, it } from 'vitest'
import { generate } from '../src'
import { boundaryAccessAtlas } from './boundary-access.fixture'

const params = { seed: 'boundary-access', toggles: { bridges: false, acTubes: false, wires: false, tunnels: false, bus: false, subway: false, train: false, airPaths: false } }

// Published street, parcel access and nearby ground from Atlas urbe-tiny, with isolated endpoint groups.
it('joins a parcel at the sidewalk boundary through its complete declared access width', () => {
  const atlas = boundaryAccessAtlas()
  const out = generate(atlas, params)
  const entry = out.networks.walk.nodes.find(node => node.kind === 'entry')!
  const access = out.networks.walk.edges.find(edge => edge.kind === 'access' && edge.from === entry.id)!
  expect(access.width).toBe(2)
  expect(access.path3[0]).toEqual([198.666, 0, 228.757])
  expect(access.path3.at(-1)).toEqual([200.05857185807662, 0, 231.13024549954167])
  expect(out.networks.walk.edges.some(edge => edge.kind === 'sidewalk' && (edge.from === access.to || edge.to === access.to))).toBe(true)
})

it('rejects an entrance whose paving carries its centerline but not the complete access width', () => {
  expect(() => generate(boundaryAccessAtlas(true), params)).toThrowError(expect.objectContaining({
    code: 'E_ATLAS_INVALID', path: 'atlas.streets.edges.e5', message: 'access on e5 has no proved full-width walking connection',
  }))
})
