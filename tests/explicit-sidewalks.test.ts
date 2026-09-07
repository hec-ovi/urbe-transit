import { describe, expect, it } from 'vitest'
import { generate } from '../src'
import type { AtlasBlueprint, StreetEdge } from '../src/types/atlas'
import source from './explicit-sidewalk.fixture.json'

/** One exact public Atlas module-city edge, with empty surrounding city collections. */
function atlas(): AtlasBlueprint {
  const edge = structuredClone(source) as StreetEdge
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

describe('explicit sidewalk geometry admission', () => {
  it('places both walking bands at their published intervals while preserving carriageway lanes', () => {
    const input = atlas(), before = structuredClone(input)
    const output = generate(input, { seed: 'explicit-sidewalk' })
    expect(input).toEqual(before)
    expect(output).toEqual(generate(before, { seed: 'explicit-sidewalk' }))
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

  it('rejects a contradictory gutter reservation instead of accepting the legacy band total', () => {
    const input = atlas()
    input.streets.edges[0].sidewalk.left -= .3
    expect(() => generate(input, { seed: 'explicit-sidewalk' })).toThrowError(expect.objectContaining({ code: 'E_ATLAS_INVALID', path: 'atlas.streets.edges.e0.crossSection' }))
  })

  it('rejects an authored walking interval that disagrees with the side dimensions', () => {
    const input = atlas()
    input.streets.edges[0].crossSection!.sidewalks.left.geometry!.intervals.find((interval) => interval.role === 'walking')!.start -= .3
    expect(() => generate(input, { seed: 'explicit-sidewalk' })).toThrowError(expect.objectContaining({ code: 'E_ATLAS_INVALID', path: 'atlas.streets.edges.e0.crossSection' }))
  })
})
