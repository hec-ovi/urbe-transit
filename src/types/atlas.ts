/**
 * Consumed subset of the atlas CityBlueprint, mirrored from ../atlas/schema/blueprint.ts (v0.2).
 * Units: meters. Ground plane XZ, +Y up; 2D points are [x, z]; heights along +Y.
 * Polygons: CCW rings, first point not repeated.
 */

export type Vec2 = [x: number, z: number]
export type Polygon = Vec2[]
export type Polyline = Vec2[]

/** Additive list: `alley` arrives with atlas pedestrian alleys, and consumers fall back on width. */
export type StreetClass = 'alley' | 'street' | 'road' | 'highway'
export type DistrictKind = 'downtown' | 'commercial' | 'residential' | 'industrial' | 'mixed'
export type WealthTier = 'poor' | 'mid' | 'rich' | 'high_rich'

export type ParcelType =
  | 'residential'
  | 'hotel'
  | 'offices'
  | 'corpo'
  | 'hospital'
  | 'clinic'
  | 'police'
  | 'military'
  | 'factory'
  | 'commerce'
  | 'mall'
  | 'restaurant'
  | 'coffee_shop'

export interface AtlasBlueprint {
  meta: { seed: string; bounds: { min: Vec2; max: Vec2 } }
  districts: District[]
  streets: StreetGraph
  parcels: Parcel[]
  transit: Transit
  volumetric: { buildings: BuildingVolume[] }
}

export interface District {
  id: string
  kind: DistrictKind
  tier: WealthTier
  boundary: Polygon
  center: Vec2
  maxFloors: number
}

export interface StreetGraph {
  nodes: StreetNode[]
  edges: StreetEdge[]
  crossings: Crossing[]
}

export interface StreetNode {
  id: string
  position: Vec2
  edgeIds: string[]
}

export interface StreetEdge {
  id: string
  class: StreetClass
  from: string
  to: string
  /** Centerline from `from` to `to`; curves are polylines. */
  path: Polyline
  /** Carriageway width, sidewalks excluded. */
  width: number
  /** Per side, 0 = none. Left/right relative to path direction. */
  sidewalk: { left: number; right: number }
}

export interface Crossing {
  nodeId: string
  /** Each segment spans the roadway from one sidewalk to another. */
  segments: { from: Vec2; to: Vec2 }[]
}

export interface Parcel {
  id: string
  districtId: string
  type: ParcelType
  tier: WealthTier
  footprint: Polygon
  access: { edgeId: string; point: Vec2 }
  envelope: {
    minFloors: number
    maxFloors: number
    /** Nominal only; real per-floor elevations are owned by exterior. */
    floorHeight: number
    maxHeight: number
  }
}

export interface Transit {
  busStops: BusStop[]
  busRoutes: BusRoute[]
  trainStations: Station[]
  trainLines: RailLine[]
  subwayStations: Station[]
  subwayLines: RailLine[]
}

export interface BusStop {
  id: string
  edgeId: string
  position: Vec2
  districtId: string
}

export interface BusRoute {
  id: string
  stopIds: string[]
  /** Ordered street edges driven, terminal to terminal. */
  edgeIds: string[]
}

export interface Station {
  id: string
  position: Vec2
  districtId: string
  entrances: Vec2[]
}

export interface RailLine {
  id: string
  stationIds: string[]
  path: Polyline
  underground: boolean
}

export interface BuildingVolume {
  parcelId: string
  footprint: Polygon
  /** Representative height within the parcel envelope. */
  height: number
}
