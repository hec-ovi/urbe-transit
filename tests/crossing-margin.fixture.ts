import type { AtlasBlueprint, GroundSurface, StreetEdge, StreetPlanningReservations, Vec2 } from '../src/types/atlas'
import { physicalCrossingAtlas } from './physical-crossing.fixture'
// Captured through Atlas's public StreetCorridors.reservations entry point.
import planning from './fixtures/physical-junction-reservations.json'

/** A physical curb return leaves an unmarked road margin inside one authored crossing connector. */
export function crossingMarginAtlas(ordinaryRoadGap = false): AtlasBlueprint {
  const atlas = physicalCrossingAtlas()
  atlas.streets.construction!.planningReservations = structuredClone(planning) as unknown as StreetPlanningReservations
  for (const approach of atlas.streets.construction!.junctions![0].approaches) {
    const edge = atlas.streets.edges.find((edge) => edge.id === approach.edgeId)!
    const half = (side: 'left' | 'right'): [number, number] => {
      const bands = edge.crossSection!.sidewalks[side].bands
      const inner = edge.width / 2 + bands.curb + bands.border + bands.furnishing
      return side === 'left' ? [inner, inner + bands.walking / 2] : [-inner - bands.walking / 2, -inner]
    }
    approach.walkingLandings = { left: rectangle(edge, approach.station, half('left')), right: rectangle(edge, approach.station, half('right')) }
  }
  const connector = atlas.streets.construction!.junctions![0].approaches[0].landings.left
  atlas.volumetric.ground = roadMargin(atlas.volumetric.ground!, bounds(connector), 'curb')
  if (ordinaryRoadGap) atlas.volumetric.ground = roadMargin(atlas.volumetric.ground, [[30, 13], [32, 16]], 'sidewalk')
  return atlas
}

/** A connected road margin intrudes 0.8 mm into a terminal's straight walking boundary. */
export function terminalIntrusionAtlas(): AtlasBlueprint {
  const atlas = crossingMarginAtlas()
  const terminal = atlas.streets.construction!.junctions![0].approaches[0].walkingLandings!.left
  const [min, max] = bounds(terminal)
  atlas.volumetric.ground = roadMargin(atlas.volumetric.ground!, [[max[0] - .0008, min[1] - 1], [max[0] + 1, max[1] + 1]], 'sidewalk')
  return atlas
}

function rectangle(edge: StreetEdge, station: [number, number], band: [number, number]): Vec2[] {
  const [a, b] = edge.path, length = Math.hypot(b[0] - a[0], b[1] - a[1])
  const at = (s: number, offset: number): Vec2 => [a[0] + ((b[0] - a[0]) * s - (b[1] - a[1]) * offset) / length, a[1] + ((b[1] - a[1]) * s + (b[0] - a[0]) * offset) / length]
  return [at(station[0], band[0]), at(station[1], band[0]), at(station[1], band[1]), at(station[0], band[1])]
}

function bounds(points: Vec2[]): [Vec2, Vec2] {
  return [[Math.min(...points.map((p) => p[0])), Math.min(...points.map((p) => p[1]))], [Math.max(...points.map((p) => p[0])), Math.max(...points.map((p) => p[1]))]]
}

/** Partitions rectangular fixture owners at a local road-margin boundary without overlaps. */
function roadMargin(ground: GroundSurface[], [min, max]: [Vec2, Vec2], role: GroundSurface['surface']): GroundSurface[] {
  return ground.flatMap((surface) => {
    if (surface.surface !== role) return [surface]
    const [a, b] = bounds(surface.polygon)
    const axes = ([0, 1] as const).map((axis) => [...new Set([a[axis], b[axis], Math.max(a[axis], Math.min(b[axis], min[axis])), Math.max(a[axis], Math.min(b[axis], max[axis]))])].sort((x, y) => x - y))
    return axes[0].slice(1).flatMap((x, i) => axes[1].slice(1).map((y, j) => {
      const x0 = axes[0][i], y0 = axes[1][j], cx = (x + x0) / 2, cy = (y + y0) / 2
      const road = cx > min[0] && cx < max[0] && cy > min[1] && cy < max[1]
      return { ...surface, ...(road ? { surface: 'roadway' as const, bottom: -.2, top: 0 } : {}), polygon: [[x0, y0], [x, y0], [x, y], [x0, y]] as Vec2[] }
    }))
  })
}
