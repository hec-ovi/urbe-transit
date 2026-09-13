import type { AtlasBlueprint, GroundSurface, Vec2 } from '../src/types/atlas'
import { shortJunctionAtlas } from './section-junction.fixture'

/** A rotated junction detours around a hole; detached paving crosses its search-box corner. */
export function croppedPavingAtlas(): AtlasBlueprint {
  const atlas = shortJunctionAtlas()
  atlas.parcels = []
  atlas.volumetric.buildings = []
  const source = atlas.volumetric.ground!
  const xs = [...new Set([...source.flatMap(g => g.polygon.map(p => p[0])), -12, -6.5, -4, 15, 35])].sort((a, b) => a - b)
  const ys = [...new Set([...source.flatMap(g => g.polygon.map(p => p[1])), 6, 8, 10, 13, 15, 35])].sort((a, b) => a - b)
  atlas.volumetric.ground = xs.slice(1).flatMap((x1, i) => ys.slice(1).map((y1, j): GroundSurface => {
    const x0 = xs[i], y0 = ys[j], x = (x0 + x1) / 2, y = (y0 + y1) / 2
    const owner = source.find(g => x > g.polygon[0][0] && x < g.polygon[1][0] && y > g.polygon[0][1] && y < g.polygon[2][1])!
    const hole = x > -6.5 && x < -4 && y > 8 && y < 10
    const walk = (x > -12 && x < -3.5 && y > 6 && y < 13) || (x > 15 && x < 35 && y > 15 && y < 35)
    return { ...owner, surface: hole ? 'open' : walk ? 'sidewalk' : owner.surface, polygon: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] }
  }))
  return atlas
}

export function rotatePavingAtlas(atlas: AtlasBlueprint): void {
  const angle = .3
  const rotate = ([x, y]: Vec2): Vec2 => [Math.cos(angle) * x - Math.sin(angle) * y, Math.sin(angle) * x + Math.cos(angle) * y]
  for (const ground of atlas.volumetric.ground!) ground.polygon = ground.polygon.map(rotate)
  for (const edge of atlas.streets.edges) edge.path = edge.path.map(rotate)
  for (const node of atlas.streets.nodes) node.position = rotate(node.position)
}
