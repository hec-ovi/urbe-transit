import type { AtlasBlueprint } from '../types/atlas'
import type { AirCorridor } from '../types/output'

/** One flight direction per altitude layer (head-on conflicts impossible by construction). */
const LAYER_OUT = 120
const LAYER_BACK = 150
const WIDTH = 12
const SPEED = 33

/** Corridors follow the major road grid: highways, or roads where the city has none. */
export function buildAir(atlas: AtlasBlueprint): { corridors: AirCorridor[] } {
  const majors = atlas.streets.edges.filter((e) => e.class === 'highway')
  const carriers = majors.length > 0 ? majors : atlas.streets.edges.filter((e) => e.class === 'road')
  const corridors: AirCorridor[] = []
  for (const e of carriers) {
    corridors.push({ id: `air${corridors.length}`, altitude: LAYER_OUT, path: e.path, width: WIDTH, speed: SPEED })
    corridors.push({ id: `air${corridors.length}`, altitude: LAYER_BACK, path: [...e.path].reverse(), width: WIDTH, speed: SPEED })
  }
  return { corridors }
}
