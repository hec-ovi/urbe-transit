import type { AtlasBlueprint, GroundSurface, StreetEdge, Vec2 } from '../src/types/atlas'

/** Two staggered intersections share a middle edge shorter than their endpoint reservations. */
export function shortJunctionAtlas(middleLength = 8, curbs = false): AtlasBlueprint {
  const points: Record<string, Vec2> = { a: [0, 0], b: [0, middleLength], south: [0, -80], north: [0, 88], west: [-80, 0], east: [80, middleLength] }
  const links = [['middle', 'a', 'b'], ['south', 'south', 'a'], ['north', 'b', 'north'], ['west', 'west', 'a'], ['east', 'b', 'east']]
  const edges: StreetEdge[] = links.map(([id, from, to]) => ({ id, from, to, class: 'street', path: [points[from], points[to]], width: 7, sidewalk: { left: 5, right: 3 }, level: 0,
    elevationProfile: [{ distance: 0, level: 0 }, { distance: Math.hypot(points[to][0] - points[from][0], points[to][1] - points[from][1]), level: 0 }],
    crossSection: { runId: id, profileId: 'street', shoulders: { left: 0, right: 0 }, lanes: [{ direction: 'backward', width: 3.5, offset: 1.75 }, { direction: 'forward', width: 3.5, offset: -1.75 }], sidewalks: {
      left: { profileId: 'left', bands: { curb: .15, border: .35, furnishing: 1, walking: 3, frontage: .5 } },
      right: { profileId: 'right', bands: { curb: .15, border: .35, furnishing: .5, walking: 1.5, frontage: .5 } },
    } },
  }))
  const footprint: Vec2[] = [[-20, 15], [-10, 15], [-10, 25], [-20, 25]]
  const eastFootprint: Vec2[] = [[10, -15], [20, -15], [20, -5], [10, -5]]
  return { meta: { seed: 'short-junction', bounds: { min: [-100, -100], max: [100, 100] } },
    districts: [{ id: 'district', kind: 'residential', tier: 'poor', boundary: [[-100, -100], [100, -100], [100, 100], [-100, 100]], center: [0, 0], maxFloors: 1 }],
    parcels: [{ id: 'building', districtId: 'district', type: 'residential', tier: 'poor', footprint, access: { edgeId: 'middle', point: [-6.5, 5] }, envelope: { minFloors: 1, maxFloors: 1, floorHeight: 3, maxHeight: 3 } },
      { id: 'east-building', districtId: 'district', type: 'residential', tier: 'poor', footprint: eastFootprint, access: { edgeId: 'middle', point: [5.25, 2.5] }, envelope: { minFloors: 1, maxFloors: 1, floorHeight: 3, maxHeight: 3 } }],
    streets: { nodes: Object.entries(points).map(([id, position]) => { const edgeIds = edges.filter((edge) => edge.from === id || edge.to === id).map((edge) => edge.id); return { id, position, edgeIds, connections: [{ level: 0, edgeIds }] } }), edges, crossings: [] },
    transit: { busStops: [], busRoutes: [], trainStations: [], trainLines: [], subwayStations: [], subwayLines: [] },
    volumetric: { buildings: [{ parcelId: 'building', footprint, height: 3 }, { parcelId: 'east-building', footprint: eastFootprint, height: 3 }], ground: rectangularCover(edges, curbs) },
  }
}

function rectangularCover(edges: StreetEdge[], curbs: boolean): GroundSurface[] {
  const strips = edges.flatMap((edge) => {
    const [a, b] = edge.path, length = Math.hypot(b[0] - a[0], b[1] - a[1]), normal = [-(b[1] - a[1]) / length, (b[0] - a[0]) / length]
    const surfaces: ('roadway' | 'curb' | 'sidewalk')[] = curbs ? ['roadway', 'curb', 'sidewalk'] : ['roadway', 'sidewalk']
    return surfaces.map((surface) => {
      const sideWidth = (side: 'left' | 'right'): number => surface === 'sidewalk' ? edge.sidewalk[side] : surface === 'curb' ? edge.crossSection!.sidewalks[side].bands.curb : 0
      const left = edge.width / 2 + sideWidth('left'), right = edge.width / 2 + sideWidth('right')
      const points = [a, b].flatMap((point) => [[point[0] + normal[0] * left, point[1] + normal[1] * left], [point[0] - normal[0] * right, point[1] - normal[1] * right]])
      return { surface, min: [Math.min(...points.map((p) => p[0])), Math.min(...points.map((p) => p[1]))], max: [Math.max(...points.map((p) => p[0])), Math.max(...points.map((p) => p[1]))] }
    })
  })
  const xs = [...new Set([-100, 100, ...strips.flatMap((strip) => [strip.min[0], strip.max[0]])])].sort((a, b) => a - b)
  const ys = [...new Set([-100, 100, ...strips.flatMap((strip) => [strip.min[1], strip.max[1]])])].sort((a, b) => a - b)
  const ground: GroundSurface[] = []
  for (let i = 1; i < xs.length; i++) for (let j = 1; j < ys.length; j++) {
    const x = (xs[i - 1] + xs[i]) / 2, y = (ys[j - 1] + ys[j]) / 2
    const covers = strips.filter((strip) => x > strip.min[0] && x < strip.max[0] && y > strip.min[1] && y < strip.max[1])
    const surface = covers.some((strip) => strip.surface === 'roadway') ? 'roadway' : covers.some((strip) => strip.surface === 'curb') ? 'curb' : covers.length ? 'sidewalk' : 'open'
    ground.push({ surface, bottom: surface === 'roadway' ? -.2 : 0, top: surface === 'roadway' ? 0 : .15, polygon: [[xs[i - 1], ys[j - 1]], [xs[i], ys[j - 1]], [xs[i], ys[j]], [xs[i - 1], ys[j]]] })
  }
  return ground
}
