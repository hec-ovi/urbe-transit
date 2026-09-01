/**
 * Deterministic fixture in the atlas v0.2 blueprint shape (consumed subset).
 * A 4x3 street grid with a highway row, a road row, curved and straight streets,
 * three districts, facing building pairs for every link kind, and all transit modes.
 */
import type { AtlasBlueprint, Crossing, Parcel, StreetEdge, StreetNode, Vec2 as V2 } from '../src/types/atlas'

const COLS = [0, 120, 240, 360]
const ROWS = [0, 120, 240]

interface EdgeSpec {
  id: string
  from: number
  to: number
  cls: StreetEdge['class']
  width: number
  sw: number
  path?: V2[]
}

const EDGE_SPECS: EdgeSpec[] = [
  { id: 'e0', from: 0, to: 1, cls: 'highway', width: 20, sw: 0 },
  { id: 'e1', from: 1, to: 2, cls: 'highway', width: 20, sw: 0 },
  { id: 'e2', from: 2, to: 3, cls: 'highway', width: 20, sw: 0 },
  { id: 'e3', from: 4, to: 5, cls: 'road', width: 14, sw: 3 },
  { id: 'e4', from: 5, to: 6, cls: 'road', width: 14, sw: 3 },
  { id: 'e5', from: 6, to: 7, cls: 'road', width: 14, sw: 3 },
  { id: 'e6', from: 8, to: 9, cls: 'street', width: 8, sw: 2.5 },
  { id: 'e7', from: 9, to: 10, cls: 'street', width: 8, sw: 2.5 },
  { id: 'e8', from: 10, to: 11, cls: 'street', width: 8, sw: 2.5, path: [[240, 240], [280, 255], [320, 252], [360, 240]] },
  { id: 'e9', from: 0, to: 4, cls: 'street', width: 8, sw: 2.5 },
  { id: 'e10', from: 4, to: 8, cls: 'street', width: 8, sw: 2.5 },
  { id: 'e11', from: 1, to: 5, cls: 'road', width: 12, sw: 3 },
  { id: 'e12', from: 5, to: 9, cls: 'road', width: 12, sw: 3 },
  { id: 'e13', from: 2, to: 6, cls: 'street', width: 8, sw: 2.5 },
  { id: 'e14', from: 6, to: 10, cls: 'street', width: 8, sw: 2.5 },
  { id: 'e15', from: 3, to: 7, cls: 'street', width: 8, sw: 2.5 },
  { id: 'e16', from: 7, to: 11, cls: 'street', width: 8, sw: 2.5 },
]

interface ParcelSpec {
  id: string
  districtId: string
  type: Parcel['type']
  tier: Parcel['tier']
  rect: [number, number, number, number]
  accessEdge: string
  accessPoint: V2
  floors: [number, number]
  floorHeight: number
  volHeight: number
}

const PARCEL_SPECS: ParcelSpec[] = [
  { id: 'p0', districtId: 'd0', type: 'corpo', tier: 'high_rich', rect: [150, 90, 190, 110], accessEdge: 'e4', accessPoint: [170, 111.5], floors: [20, 40], floorHeight: 3.5, volHeight: 120 },
  { id: 'p1', districtId: 'd0', type: 'corpo', tier: 'high_rich', rect: [150, 130, 190, 150], accessEdge: 'e4', accessPoint: [170, 128.5], floors: [20, 40], floorHeight: 3.5, volHeight: 100 },
  { id: 'p2', districtId: 'd0', type: 'offices', tier: 'rich', rect: [210, 90, 250, 110], accessEdge: 'e4', accessPoint: [230, 111.5], floors: [12, 24], floorHeight: 3.2, volHeight: 60 },
  { id: 'p3', districtId: 'd0', type: 'offices', tier: 'rich', rect: [210, 130, 250, 150], accessEdge: 'e4', accessPoint: [230, 128.5], floors: [12, 24], floorHeight: 3.2, volHeight: 68 },
  { id: 'p4', districtId: 'd0', type: 'hotel', tier: 'rich', rect: [60, 130, 100, 150], accessEdge: 'e3', accessPoint: [80, 128.5], floors: [10, 18], floorHeight: 3, volHeight: 45 },
  { id: 'p5', districtId: 'd0', type: 'mall', tier: 'mid', rect: [60, 85, 110, 110], accessEdge: 'e3', accessPoint: [85, 111.5], floors: [2, 4], floorHeight: 4.5, volHeight: 14 },
  { id: 'p6', districtId: 'd1', type: 'residential', tier: 'poor', rect: [60, 190, 95, 220], accessEdge: 'e6', accessPoint: [77, 233.75], floors: [3, 6], floorHeight: 2.8, volHeight: 12 },
  { id: 'p7', districtId: 'd1', type: 'residential', tier: 'poor', rect: [105, 190, 140, 220], accessEdge: 'e6', accessPoint: [122, 233.75], floors: [3, 6], floorHeight: 2.8, volHeight: 12 },
  { id: 'p8', districtId: 'd1', type: 'residential', tier: 'mid', rect: [150, 190, 185, 220], accessEdge: 'e7', accessPoint: [167, 233.75], floors: [3, 6], floorHeight: 2.8, volHeight: 14 },
  { id: 'p9', districtId: 'd1', type: 'commerce', tier: 'mid', rect: [210, 190, 240, 215], accessEdge: 'e7', accessPoint: [225, 233.75], floors: [1, 3], floorHeight: 3.5, volHeight: 8 },
  { id: 'p10', districtId: 'd2', type: 'factory', tier: 'mid', rect: [20, 40, 60, 80], accessEdge: 'e9', accessPoint: [6.5, 60], floors: [1, 3], floorHeight: 5, volHeight: 12 },
  { id: 'p11', districtId: 'd2', type: 'factory', tier: 'mid', rect: [70, 40, 110, 80], accessEdge: 'e9', accessPoint: [6.5, 70], floors: [1, 3], floorHeight: 5, volHeight: 12 },
  { id: 'p12', districtId: 'd2', type: 'police', tier: 'mid', rect: [300, 20, 340, 60], accessEdge: 'e15', accessPoint: [353.5, 40], floors: [3, 6], floorHeight: 3.2, volHeight: 15 },
  { id: 'p13', districtId: 'd0', type: 'hospital', tier: 'rich', rect: [300, 90, 345, 115], accessEdge: 'e5', accessPoint: [320, 128.5], floors: [5, 10], floorHeight: 3.4, volHeight: 28 },
]

function nodes(): StreetNode[] {
  const out: StreetNode[] = []
  for (let r = 0; r < ROWS.length; r++) {
    for (let c = 0; c < COLS.length; c++) {
      const idx = r * COLS.length + c
      out.push({ id: `n${idx}`, position: [COLS[c], ROWS[r]], edgeIds: [] })
    }
  }
  for (const e of EDGE_SPECS) {
    out[e.from].edgeIds.push(e.id)
    out[e.to].edgeIds.push(e.id)
  }
  return out
}

function edges(ns: StreetNode[]): StreetEdge[] {
  return EDGE_SPECS.map((s) => ({
    id: s.id,
    class: s.cls,
    from: `n${s.from}`,
    to: `n${s.to}`,
    path: s.path ?? [ns[s.from].position, ns[s.to].position],
    width: s.width,
    sidewalk: { left: s.sw, right: s.sw },
  }))
}

/** Crossing segments across each sidewalked approach of the four inner intersections. */
function crossings(ns: StreetNode[], es: StreetEdge[]): Crossing[] {
  const byId = new Map(es.map((e) => [e.id, e]))
  const out: Crossing[] = []
  for (const nodeIdx of [5, 6, 9, 10]) {
    const n = ns[nodeIdx]
    let setback = 0
    for (const eid of n.edgeIds) setback = Math.max(setback, byId.get(eid)!.width / 2)
    setback += 1.5
    const segments: Crossing['segments'] = []
    for (const eid of n.edgeIds) {
      const e = byId.get(eid)!
      if (e.sidewalk.left <= 0 || e.sidewalk.right <= 0) continue
      const other = e.from === n.id ? byId.get(eid)!.path[1] : e.path[e.path.length - 2]
      const dx = other[0] - n.position[0]
      const dz = other[1] - n.position[1]
      const len = Math.hypot(dx, dz)
      const dir: V2 = [dx / len, dz / len]
      const at: V2 = [n.position[0] + dir[0] * setback, n.position[1] + dir[1] * setback]
      const half = e.width / 2 + e.sidewalk.left / 2
      segments.push({
        from: [at[0] + dir[1] * half, at[1] - dir[0] * half],
        to: [at[0] - dir[1] * half, at[1] + dir[0] * half],
      })
    }
    out.push({ nodeId: n.id, segments })
  }
  return out
}

function parcels(): Parcel[] {
  return PARCEL_SPECS.map((s) => {
    const [x0, z0, x1, z1] = s.rect
    return {
      id: s.id,
      districtId: s.districtId,
      type: s.type,
      tier: s.tier,
      footprint: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]] as V2[],
      access: { edgeId: s.accessEdge, point: s.accessPoint },
      envelope: {
        minFloors: s.floors[0],
        maxFloors: s.floors[1],
        floorHeight: s.floorHeight,
        maxHeight: s.floors[1] * s.floorHeight,
      },
    }
  })
}

export function buildFixtureAtlas(): AtlasBlueprint {
  const ns = nodes()
  const es = edges(ns)
  return {
    meta: { seed: 'fixture-city-1', bounds: { min: [0, 0], max: [380, 300] } },
    districts: [
      { id: 'd0', kind: 'downtown', tier: 'high_rich', boundary: [[50, 60], [360, 60], [360, 180], [50, 180]], center: [200, 120], maxFloors: 40 },
      { id: 'd1', kind: 'residential', tier: 'poor', boundary: [[0, 180], [360, 180], [360, 300], [0, 300]], center: [180, 240], maxFloors: 8 },
      { id: 'd2', kind: 'industrial', tier: 'mid', boundary: [[0, 0], [360, 0], [360, 60], [0, 60]], center: [180, 30], maxFloors: 6 },
    ],
    streets: { nodes: ns, edges: es, crossings: crossings(ns, es) },
    parcels: parcels(),
    transit: {
      busStops: [
        { id: 's0', edgeId: 'e3', position: [90, 111.5], districtId: 'd0' },
        { id: 's1', edgeId: 'e4', position: [200, 111.5], districtId: 'd0' },
        { id: 's2', edgeId: 'e5', position: [330, 111.5], districtId: 'd0' },
        { id: 's3', edgeId: 'e12', position: [128.5, 180], districtId: 'd1' },
      ],
      busRoutes: [
        { id: 'bus0', stopIds: ['s0', 's1', 's2'], edgeIds: ['e3', 'e4', 'e5'] },
        { id: 'bus1', stopIds: ['s1', 's3'], edgeIds: ['e4', 'e12'] },
      ],
      trainStations: [
        { id: 't0', position: [60, 8], districtId: 'd2', entrances: [[60, 20]] },
        { id: 't1', position: [300, 8], districtId: 'd2', entrances: [[300, 20]] },
      ],
      trainLines: [{ id: 'tr0', stationIds: ['t0', 't1'], path: [[60, 8], [300, 8]], underground: false }],
      subwayStations: [
        { id: 'st0', position: [100, 100], districtId: 'd0', entrances: [[100, 111.5]] },
        { id: 'st1', position: [250, 130], districtId: 'd0', entrances: [[250, 128.5]] },
        { id: 'st2', position: [120, 230], districtId: 'd1', entrances: [[122, 233.75]] },
      ],
      subwayLines: [{ id: 'sub0', stationIds: ['st0', 'st1', 'st2'], path: [[100, 100], [250, 130], [120, 230]], underground: true }],
    },
    volumetric: {
      buildings: PARCEL_SPECS.map((s) => {
        const [x0, z0, x1, z1] = s.rect
        return { parcelId: s.id, footprint: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]] as V2[], height: s.volHeight }
      }),
    },
  }
}
