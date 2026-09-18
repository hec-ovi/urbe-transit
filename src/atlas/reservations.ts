import { ConnectionsError } from '../core/errors'
import type { AtlasBlueprint, Vec2 } from '../types/atlas'

/** The one accepted street reservation model; every consumed city publishes it. */
const STREET_RESERVATION_VERSION = '2.1.0'

/** Exact planning polygons arrive as data; their source model is descriptive metadata. */
export function validatePlanningReservations(atlas: AtlasBlueprint): void {
  const planning = atlas.streets.construction?.planningReservations
  if (planning === undefined) return
  const path = 'atlas.streets.construction.planningReservations'
  const fail: (message: string, at?: string) => never = (message, at = path) => { throw new ConnectionsError('E_ATLAS_INVALID', message, at) }
  const model = planning?.model
  if (planning?.version !== STREET_RESERVATION_VERSION || model?.id !== 'atlas-directed-corridors' || model.version !== planning.version || model.authority !== 'edge-local-planning' || model.units !== 'metres' || model.coordinateGrid !== .001) fail('unsupported street reservation model')
  if (!Array.isArray(planning.edges)) fail('street reservations need an edge array')
  const source = new Map(atlas.streets.edges.map((edge) => [edge.id, edge]))
  const seen = new Set<string>()
  const polygons = (value: unknown, required: boolean, at: string): void => {
    if (!Array.isArray(value) || (required ? value.length === 0 : value.length > 0)) fail('reservation polygons disagree with the declared width', at)
    for (const polygon of value) {
      if (!Array.isArray(polygon) || polygon.length < 3 || polygon.some((point: unknown) => !Array.isArray(point) || point.length !== 2 || point.some((n: unknown) => typeof n !== 'number' || !Number.isFinite(n)))) fail('reservation polygons need finite points', at)
      const area = polygon.reduce((sum: number, point: Vec2, i: number) => { const next = polygon[(i + 1) % polygon.length]; return sum + point[0] * next[1] - next[0] * point[1] }, 0)
      if (!(area > 0)) fail('reservation polygons must have positive counter-clockwise area', at)
    }
  }
  for (const reservation of planning.edges) {
    const edge = source.get(reservation?.edgeId)
    if (!edge || seen.has(reservation.edgeId)) fail('street reservation edge references must be complete and unique')
    seen.add(edge.id)
    const at = `${path}.edges.${edge.id}`
    polygons(reservation.roadway, edge.width > 0, `${at}.roadway`)
    for (const side of ['left', 'right'] as const) {
      const geometry = reservation.sides?.[side]
      const section = edge.crossSection?.sidewalks[side]
      const bands = section?.bands
      polygons(geometry?.sidewalk, edge.sidewalk[side] > 0, `${at}.sides.${side}.sidewalk`)
      polygons(geometry?.walking, (bands?.walking ?? edge.sidewalk[side]) > 0, `${at}.sides.${side}.walking`)
      const pavedWidth = section?.geometry?.pavedWidth ?? (bands ? bands.border + bands.furnishing + bands.walking + bands.frontage : edge.sidewalk[side])
      polygons(geometry?.paved, pavedWidth > 0, `${at}.sides.${side}.paved`)
      for (const role of ['gutter-lip', 'gutter', 'curb', 'border', 'furnishing', 'frontage'] as const) {
        const interval = section?.geometry?.intervals.find((interval) => interval.role === role)
        const width = interval ? interval.end - interval.start : role === 'gutter-lip' || role === 'gutter' ? 0 : bands?.[role] ?? 0
        polygons(geometry?.bands?.[role], width > 0, `${at}.sides.${side}.bands.${role}`)
      }
    }
  }
  if (seen.size !== source.size) fail('street reservations must cover every source edge')
}
