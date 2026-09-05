import { ConnectionsError } from '../core/errors'
import { arcLengths, pointAt, projectArc } from '../core/polygon'
import { dist2 } from '../core/vec'
import { offsetStreetPath } from '../networks/offset'
import { walkingBand } from '../networks/sections'
import type { Station, StreetEdge, Vec2 } from '../types/atlas'

const point = (value: unknown): value is Vec2 => Array.isArray(value) && value.length === 2 && value.every((v) => typeof v === 'number' && Number.isFinite(v))

/** Optional entrance land has an exact graph owner and an exact walking-band approach. */
export function validateEntranceBays(station: Station, streets: Map<string, StreetEdge>): void {
  const bays = station.entranceBays
  if (bays === undefined) return
  const path = `atlas.transit.stations.${station.id}.entranceBays`
  const fail = (message: string): never => { throw new ConnectionsError('E_ATLAS_INVALID', message, path) }
  if (!Array.isArray(bays) || bays.length !== station.entrances.length) fail('entrance bays must match station entrances')
  for (let i = 0; i < bays.length; i++) {
    const bay = bays[i], street = streets.get(bay?.edgeId)
    if (!street || !['left', 'right'].includes(bay.side)) fail('entrance bay needs an existing street side')
    if (!Number.isFinite(bay.distance) || bay.distance < 0 || bay.distance > arcLengths(street!.path).at(-1)! + 1e-6) fail('entrance bay has an invalid street distance')
    if (!Array.isArray(bay.approach) || bay.approach.length < 2 || !bay.approach.every(point)) fail('entrance bay needs a finite approach path')
    if (!Array.isArray(bay.footprint) || bay.footprint.length < 3 || !bay.footprint.every(point) || !Array.isArray(bay.shaft) || bay.shaft.length < 3 || !bay.shaft.every(point)) fail('entrance bay needs land and shaft polygons')
    if (dist2(bay.approach.at(-1)!, station.entrances[i]) > 1e-6) fail('entrance bay approach must end at its station entrance')
    const band = walkingBand(street!, bay.side), run = offsetStreetPath(street!.path, band.offset), arcs = arcLengths(run)
    const anchor = pointAt(run, arcs, projectArc(run, arcs, bay.approach[0]))
    if (band.width <= 0 || dist2(anchor, bay.approach[0]) > .002) fail('entrance bay approach must start on its walking band')
  }
}
