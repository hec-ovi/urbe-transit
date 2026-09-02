/** Mirrors schemas/output.schema.json and its referenced schemas. Meters, XZ ground, +Y up. */
import type { V2, V3 } from '../core/vec'

export type LinkKind = 'bridge' | 'ac-tube' | 'wire' | 'tunnel'
export type ApertureKind = 'bridge' | 'ac-tube' | 'wire-anchor' | 'tunnel'

export interface Aperture {
  id: string
  buildingId: string
  /** Advisory floor index; base is authoritative. */
  floor: number
  face: number
  kind: ApertureKind
  u: number
  /** Absolute y of the opening bottom (min y of the cut polygon). */
  base: number
  width: number
  height: number
  shape: 'rect' | 'circle'
  cut: { polygon: V3[]; axisDir: V3 }
  linkId: string
}

export interface LinkEndpoint {
  buildingId: string
  floor: number
  face: number
  apertureId: string
}

export interface Link {
  id: string
  kind: LinkKind
  a: LinkEndpoint
  b: LinkEndpoint
  path: V3[]
  crossSection: { shape: 'rect' | 'circle'; width: number; height: number }
  walkable: { over: boolean; inside: boolean }
  length: number
}

export interface LinkRef {
  linkId: string
  kind: LinkKind
  buildingA: string
  buildingB: string
}

export type WalkNodeKind = 'sidewalk' | 'corner' | 'crossing-end' | 'stop' | 'station' | 'station-entrance' | 'station-access' | 'station-handoff' | 'entry' | 'link-portal'
export type WalkEdgeKind = 'sidewalk' | 'crossing' | 'access' | 'stairs' | 'passage' | 'platform' | 'link'

export interface WalkNode {
  id: string
  x: number
  y: number
  z: number
  kind: WalkNodeKind
  ref?: string
}

export interface SignalRef {
  signalId: string
  linkIndex: number
}

export interface WalkEdge {
  id: string
  from: string
  to: string
  kind: WalkEdgeKind
  width: number
  /** Ground-plan compatibility projection. `path3` is authoritative for traversal. */
  path: V2[]
  /** Exact walking surface. */
  path3: V3[]
  /** Maximum path height, retained for flat-path consumers. */
  level: number
  signal?: SignalRef
  linkId?: string
  stationId?: string
  accessIndex?: number
}

export interface LaneConnection {
  laneId: string
  turn: 's' | 'l' | 'r' | 't'
  via: V2[]
  /** Exact 3D turn path at the atlas node connection level. */
  via3: V3[]
  signal?: SignalRef
}

export interface Lane {
  id: string
  edgeId: string
  index: number
  speed: number
  width: number
  path: V2[]
  /** Exact lane centerline, including ramp breakpoints. */
  path3: V3[]
  /** Maximum lane height, retained for flat-path consumers. */
  level: number
  next: LaneConnection[]
  left?: { laneId: string; change: boolean }
  right?: { laneId: string; change: boolean }
}

export interface Signal {
  id: string
  nodeId: string
  cycle: number
  offset: number
  phases: { duration: number; state: string }[]
  linkCount: number
}

export type TransitKind = 'bus' | 'subway' | 'train'

export interface RouteStop {
  stopId: string
  x: number
  y: number
  z: number
  shapeDist: number
}

export interface ServicePeriod {
  start: number
  end: number
  headway: number
  phase: number
}

export interface TransitRoute {
  id: string
  kind: TransitKind
  lineId: string
  stops: RouteStop[]
  shape: V3[]
  template: { arrive: number; depart: number }[]
  service: ServicePeriod[]
}

export interface AirCorridor {
  id: string
  altitude: number
  path: V2[]
  width: number
  speed: number
}

export interface Networks {
  walk: { nodes: WalkNode[]; edges: WalkEdge[] }
  road: { lanes: Lane[] }
  signals: Signal[]
  transit: { routes: TransitRoute[] }
  air: { corridors: AirCorridor[] }
}

export type LayerId =
  | 'links.bridges'
  | 'links.acTubes'
  | 'links.wires'
  | 'links.tunnels'
  | 'walk'
  | 'road'
  | 'signals'
  | 'transit.bus'
  | 'transit.subway'
  | 'transit.train'
  | 'air'

export interface ConnectionsOutput {
  meta: { seed: string; atlasSeed: string; version: string }
  links: Link[]
  apertures: Aperture[]
  linkRefs: LinkRef[]
  networks: Networks
  layers: { id: LayerId; name: string }[]
}
