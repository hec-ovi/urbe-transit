import type { AtlasBlueprint, Vec2 } from '../src/types/atlas'
import fixture from './fixtures/boundary-access.json'

export function boundaryAccessAtlas(narrow = false): AtlasBlueprint {
  const atlas = structuredClone(fixture) as unknown as AtlasBlueprint
  if (!narrow) return atlas
  const a = atlas.parcels[0].access.point, b: Vec2 = [200.05857185807662, 231.13024549954167]
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]), forward = [(b[0] - a[0]) / length, (b[1] - a[1]) / length]
  const lateral = [-forward[1], forward[0]]
  // Two missing paving rectangles leave the entrance centerline in a 1.5 m channel.
  for (const [low, high] of [[.75, 3], [-3, -.75]]) {
    atlas.volumetric.ground = atlas.volumetric.ground!.flatMap(ground => {
      if (ground.surface !== 'sidewalk') return [ground]
      let inside = ground.polygon
      const pieces: Vec2[][] = []
      for (const [axis, value, sign] of [[lateral, low, 1], [lateral, high, -1], [forward, -.1, 1], [forward, .75, -1]] as [number[], number, number][]) {
        const distance = (p: Vec2): number => sign * ((p[0] - a[0]) * axis[0] + (p[1] - a[1]) * axis[1] - value)
        pieces.push(clip(inside, p => -distance(p)))
        inside = clip(inside, distance)
      }
      return pieces.filter(polygon => polygon.length >= 3 && area(polygon) > 1e-6).map(polygon => ({ ...ground, polygon }))
    })
  }
  return atlas
}

function clip(polygon: Vec2[], distance: (p: Vec2) => number): Vec2[] {
  return polygon.flatMap((a, i) => {
    const b = polygon[(i + 1) % polygon.length], da = distance(a), db = distance(b)
    const points: Vec2[] = da >= 0 ? [a] : []
    if ((da >= 0) !== (db >= 0)) points.push([a[0] + (b[0] - a[0]) * da / (da - db), a[1] + (b[1] - a[1]) * da / (da - db)])
    return points
  })
}

function area(polygon: Vec2[]): number {
  return Math.abs(polygon.reduce((sum, a, i) => { const b = polygon[(i + 1) % polygon.length]; return sum + a[0] * b[1] - b[0] * a[1] }, 0)) / 2
}
