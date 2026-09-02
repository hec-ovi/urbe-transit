import { ConnectionsError } from '../core/errors'
import { arcLengths, pointInPolygon, polygonArea, segmentPointDistance } from '../core/polygon'
import type { AtlasBlueprint, Station, StreetEdge, Vec2, Vec3 } from '../types/atlas'
import { edgeLevelAtNode } from '../networks/elevation'

const EPS = 1e-6

function fail(message: string, path: string): never {
  throw new ConnectionsError('E_ATLAS_INVALID', message, path)
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const validV2 = (value: unknown): value is Vec2 => Array.isArray(value) && value.length === 2 && value.every(finite)
const validV3 = (value: unknown): value is Vec3 => Array.isArray(value) && value.length === 3 && value.every(finite)
const sameV3 = (a: Vec3, b: Vec3): boolean => a.every((value, i) => Math.abs(value - b[i]) <= EPS)

function pointMeetsPolygon(point: Vec2, polygon: Vec2[]): boolean {
  if (pointInPolygon(point, polygon)) return true
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    if (segmentPointDistance(polygon[j], polygon[i], point) <= EPS) return true
  }
  return false
}

function validateElevationProfile(edge: StreetEdge): void {
  const path = `atlas.streets.edges.${edge.id}.elevationProfile`
  const profile = edge.elevationProfile
  if (!Array.isArray(profile) || profile.length < 2) fail(`edge ${edge.id} needs a complete elevation profile`, path)
  const total = arcLengths(edge.path).at(-1)!
  if (Math.abs(profile[0].distance) > EPS) fail(`edge ${edge.id} elevation profile must start at distance 0`, path)
  if (Math.abs(profile.at(-1)!.distance - total) > EPS) fail(`edge ${edge.id} elevation profile must end at path length`, path)
  let previous = -Infinity
  for (const knot of profile) {
    if (!finite(knot?.distance) || !finite(knot?.level)) fail(`edge ${edge.id} elevation profile must be finite`, path)
    if (knot.distance <= previous) fail(`edge ${edge.id} elevation distances must increase`, path)
    previous = knot.distance
    if (knot.level < -EPS || knot.level > edge.level + EPS) fail(`edge ${edge.id} elevation leaves its declared range`, path)
  }
  if (!finite(edge.level) || edge.level < 0) fail(`edge ${edge.id} level must be a non-negative maximum`, path)
}

function validateNodeConnections(atlas: AtlasBlueprint, edges: Map<string, StreetEdge>): void {
  for (const node of atlas.streets.nodes) {
    const path = `atlas.streets.nodes.${node.id}.connections`
    if (!Array.isArray(node.connections) || node.connections.length < 1) fail(`node ${node.id} needs connection groups`, path)
    const seen = new Set<string>()
    for (const group of node.connections) {
      if (!finite(group?.level) || !Array.isArray(group.edgeIds) || group.edgeIds.length < 1) fail(`node ${node.id} has an invalid connection group`, path)
      for (const edgeId of group.edgeIds) {
        const edge = edges.get(edgeId)
        if (!edge || !node.edgeIds.includes(edgeId)) fail(`node ${node.id} connection references non-incident edge ${edgeId}`, path)
        if (edge.from !== node.id && edge.to !== node.id) fail(`node ${node.id} lists edge ${edgeId} that does not end there`, path)
        if (seen.has(edgeId)) fail(`node ${node.id} connection repeats edge ${edgeId}`, path)
        seen.add(edgeId)
        if (Math.abs(edgeLevelAtNode(edge, node.id) - group.level) > EPS) fail(`node ${node.id} connection level disagrees with edge ${edgeId}`, path)
      }
    }
    if (seen.size !== node.edgeIds.length || node.edgeIds.some((id) => !seen.has(id))) fail(`node ${node.id} connections must partition its incident edges`, path)
  }
}

function validateStation(station: Station): void {
  const path = `atlas.transit.stations.${station.id}`
  if (!validV2(station.position) || !finite(station.level)) fail(`station ${station.id} has an invalid position or level`, path)
  if (!Array.isArray(station.platform) || station.platform.length < 3 || polygonArea(station.platform) < 1) fail(`station ${station.id} needs a platform`, path)
  if (!finite(station.box?.bottom) || !finite(station.box?.top) || station.box.top <= station.box.bottom || Math.abs(station.box.bottom - station.level) > EPS) {
    fail(`station ${station.id} has an invalid platform box`, path)
  }
  if (!Array.isArray(station.entrances) || station.entrances.some((entrance) => !validV2(entrance))) fail(`station ${station.id} has invalid entrances`, path)
  if (!Array.isArray(station.shafts) || !Array.isArray(station.accessPaths)) fail(`station ${station.id} needs shaft and access path arrays`, path)

  if (station.level >= 0) {
    if (station.shafts.length > 0 || station.accessPaths.length > 0) fail(`grade station ${station.id} cannot publish underground access`, path)
    return
  }
  if (station.shafts.length !== station.entrances.length || station.accessPaths.length !== station.entrances.length) {
    fail(`underground station ${station.id} needs one shaft and access path per entrance`, path)
  }
  const accessIndexes = new Set<number>()
  for (const access of station.accessPaths) {
    const accessPath = `${path}.accessPaths`
    if (!Number.isInteger(access.entranceIndex) || access.entranceIndex < 0 || access.entranceIndex >= station.entrances.length || accessIndexes.has(access.entranceIndex)) {
      fail(`station ${station.id} has an invalid access entrance index`, accessPath)
    }
    accessIndexes.add(access.entranceIndex)
    if (!Array.isArray(access.segments) || access.segments.length < 1 || access.segments[0].kind !== 'stairs') fail(`station ${station.id} access must start with stairs`, accessPath)
    let previous: Vec3 | null = null
    for (const segment of access.segments) {
      if ((segment.kind !== 'stairs' && segment.kind !== 'passage') || !Array.isArray(segment.path) || segment.path.length < 2 || segment.path.some((point) => !validV3(point))) {
        fail(`station ${station.id} has an invalid access segment`, accessPath)
      }
      if (previous && !sameV3(previous, segment.path[0])) fail(`station ${station.id} access segments do not join`, accessPath)
      previous = segment.path.at(-1)!
    }
    const entrance = station.entrances[access.entranceIndex]
    if (!sameV3(access.segments[0].path[0], [entrance[0], 0, entrance[1]])) fail(`station ${station.id} access does not start at its entrance`, accessPath)
    if (!validV3(access.platformHandoff) || !sameV3(previous!, access.platformHandoff)) fail(`station ${station.id} access does not end at its handoff`, accessPath)
    if (Math.abs(access.platformHandoff[1] - station.level) > EPS || !pointMeetsPolygon([access.platformHandoff[0], access.platformHandoff[2]], station.platform)) {
      fail(`station ${station.id} handoff must lie on its platform`, accessPath)
    }
  }
}

/** Structural and referential checks on the consumed atlas subset. */
export function validateAtlas(atlas: AtlasBlueprint): void {
  if (typeof atlas !== 'object' || atlas === null) fail('blueprint must be an object', 'atlas')
  if (typeof atlas.meta?.seed !== 'string') fail('missing seed', 'atlas.meta.seed')
  if (!atlas.meta.bounds?.min || !atlas.meta.bounds?.max) fail('missing bounds', 'atlas.meta.bounds')

  const nodeIds = new Set<string>()
  for (const n of atlas.streets?.nodes ?? []) {
    if (nodeIds.has(n.id)) fail(`duplicate node id ${n.id}`, 'atlas.streets.nodes')
    nodeIds.add(n.id)
  }
  const edgeIds = new Set<string>()
  for (const e of atlas.streets?.edges ?? []) {
    if (edgeIds.has(e.id)) fail(`duplicate edge id ${e.id}`, 'atlas.streets.edges')
    edgeIds.add(e.id)
    if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) fail(`edge ${e.id} references a missing node`, 'atlas.streets.edges')
    if (!Array.isArray(e.path) || e.path.length < 2 || e.path.some((point) => !validV2(point))) fail(`edge ${e.id} path needs 2+ finite points`, 'atlas.streets.edges')
    // Carriageway may be zero: a pedestrian class (alley) is all sidewalk. What an edge must
    // have is ground to stand on, carriageway plus sidewalks.
    if (!(e.width >= 0)) fail(`edge ${e.id} carriageway width must not be negative`, 'atlas.streets.edges')
    const left = e.sidewalk?.left
    const right = e.sidewalk?.right
    if (!(left >= 0) || !(right >= 0)) fail(`edge ${e.id} sidewalk widths must not be negative`, 'atlas.streets.edges')
    if (!(e.width + left + right > 0)) fail(`edge ${e.id} has no ground: carriageway and sidewalks are all zero`, 'atlas.streets.edges')
    validateElevationProfile(e)
  }
  const edgeById = new Map(atlas.streets.edges.map((edge) => [edge.id, edge]))
  validateNodeConnections(atlas, edgeById)
  for (const c of atlas.streets?.crossings ?? []) {
    if (!nodeIds.has(c.nodeId)) fail(`crossing references missing node ${c.nodeId}`, 'atlas.streets.crossings')
  }

  const districtIds = new Set((atlas.districts ?? []).map((d) => d.id))
  const parcelIds = new Set<string>()
  for (const p of atlas.parcels ?? []) {
    if (parcelIds.has(p.id)) fail(`duplicate parcel id ${p.id}`, 'atlas.parcels')
    parcelIds.add(p.id)
    if (!districtIds.has(p.districtId)) fail(`parcel ${p.id} references missing district`, 'atlas.parcels')
    if (!Array.isArray(p.footprint) || p.footprint.length < 3) fail(`parcel ${p.id} footprint needs 3+ points`, 'atlas.parcels')
    if (polygonArea(p.footprint) < 1) fail(`parcel ${p.id} footprint is degenerate`, 'atlas.parcels')
    if (!edgeIds.has(p.access?.edgeId)) fail(`parcel ${p.id} access references missing edge`, 'atlas.parcels')
    if (!(p.envelope?.maxHeight > 0)) fail(`parcel ${p.id} envelope maxHeight must be positive`, 'atlas.parcels')
  }

  const volumeParcels = new Set((atlas.volumetric?.buildings ?? []).map((b) => b.parcelId))
  for (const p of atlas.parcels ?? []) {
    if (!volumeParcels.has(p.id)) fail(`parcel ${p.id} has no volumetric building`, 'atlas.volumetric.buildings')
  }

  const stopIds = new Set<string>()
  for (const s of atlas.transit?.busStops ?? []) {
    stopIds.add(s.id)
    if (!edgeIds.has(s.edgeId)) fail(`bus stop ${s.id} references missing edge`, 'atlas.transit.busStops')
  }
  for (const r of atlas.transit?.busRoutes ?? []) {
    for (const id of r.stopIds) if (!stopIds.has(id)) fail(`bus route ${r.id} references missing stop ${id}`, 'atlas.transit.busRoutes')
    for (const id of r.edgeIds) if (!edgeIds.has(id)) fail(`bus route ${r.id} references missing edge ${id}`, 'atlas.transit.busRoutes')
    if (r.stopIds.length < 2) fail(`bus route ${r.id} needs 2+ stops`, 'atlas.transit.busRoutes')
    for (let i = 1; i < r.edgeIds.length; i++) {
      const previous = edgeById.get(r.edgeIds[i - 1])!
      const current = edgeById.get(r.edgeIds[i])!
      const shared = [previous.from, previous.to].find((nodeId) => current.from === nodeId || current.to === nodeId)
      const node = shared ? atlas.streets.nodes.find((candidate) => candidate.id === shared) : undefined
      if (!node || !node.connections.some((group) => group.edgeIds.includes(previous.id) && group.edgeIds.includes(current.id))) {
        fail(`bus route ${r.id} crosses disconnected edges ${previous.id} and ${current.id}`, 'atlas.transit.busRoutes')
      }
    }
  }
  const stationIds = new Set([
    ...(atlas.transit?.trainStations ?? []).map((s) => s.id),
    ...(atlas.transit?.subwayStations ?? []).map((s) => s.id),
  ])
  for (const station of [...(atlas.transit?.trainStations ?? []), ...(atlas.transit?.subwayStations ?? [])]) validateStation(station)
  for (const line of [...(atlas.transit?.trainLines ?? []), ...(atlas.transit?.subwayLines ?? [])]) {
    if (line.stationIds.length < 2) fail(`line ${line.id} needs 2+ stations`, 'atlas.transit')
    for (const id of line.stationIds) if (!stationIds.has(id)) fail(`line ${line.id} references missing station ${id}`, 'atlas.transit')
    if (!Array.isArray(line.path) || line.path.length < 2) fail(`line ${line.id} path needs 2+ points`, 'atlas.transit')
    if (!finite(line.level) || !finite(line.width) || line.width <= 0) fail(`line ${line.id} has an invalid level or width`, 'atlas.transit')
  }
}
