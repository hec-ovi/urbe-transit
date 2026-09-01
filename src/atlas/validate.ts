import { ConnectionsError } from '../core/errors'
import { polygonArea } from '../core/polygon'
import type { AtlasBlueprint } from '../types/atlas'

function fail(message: string, path: string): never {
  throw new ConnectionsError('E_ATLAS_INVALID', message, path)
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
    if (!Array.isArray(e.path) || e.path.length < 2) fail(`edge ${e.id} path needs 2+ points`, 'atlas.streets.edges')
    if (!(e.width > 0)) fail(`edge ${e.id} width must be positive`, 'atlas.streets.edges')
  }
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
  }
  const stationIds = new Set([
    ...(atlas.transit?.trainStations ?? []).map((s) => s.id),
    ...(atlas.transit?.subwayStations ?? []).map((s) => s.id),
  ])
  for (const line of [...(atlas.transit?.trainLines ?? []), ...(atlas.transit?.subwayLines ?? [])]) {
    if (line.stationIds.length < 2) fail(`line ${line.id} needs 2+ stations`, 'atlas.transit')
    for (const id of line.stationIds) if (!stationIds.has(id)) fail(`line ${line.id} references missing station ${id}`, 'atlas.transit')
    if (!Array.isArray(line.path) || line.path.length < 2) fail(`line ${line.id} path needs 2+ points`, 'atlas.transit')
  }
}
