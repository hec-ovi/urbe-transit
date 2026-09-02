/**
 * Consumed subset of the atlas CityBlueprint, mirrored from ../atlas/schema/blueprint.ts (v0.8).
 * Units: meters. Ground plane XZ, +Y up; 2D points are [x, z]; heights along +Y.
 * Polygons: CCW rings, first point not repeated.
 */

export type Vec2 = [x: number, z: number]
export type Polygon = Vec2[]
export type Polyline = Vec2[]

/** Additive list; a class this box does not know falls back on carriageway width. */
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
  /** Carriageway width, sidewalks excluded; 0 on a pedestrian class such as `alley`. */
  width: number
  /** Per side, 0 = none. Left/right relative to path direction. */
  sidewalk: { left: number; right: number }
  /** Surface height above the ground plane: 0 at grade, 8 on a highway deck. Absent reads as 0. */
  level?: number
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
  /** Platform height: 0 at grade, -12 for a subway. Entrances stay at grade. */
  level?: number
  /** Plan footprint of the platform. */
  platform?: Polygon
  /** Vertical extent of the platform box: floor and ceiling. */
  box?: { bottom: number; top: number }
  /** One per entrance, in entrance order; empty for a station at grade. */
  shafts?: Shaft[]
}

/** The way down from an entrance to the platform: a vertical footprint plus its passage. */
export interface Shaft {
  footprint: Polygon
  top: number
  bottom: number
  /** Platform-level link from the shaft foot to the platform; absent when the shaft lands on it. */
  passage?: Polygon
}

export interface RailLine {
  id: string
  stationIds: string[]
  path: Polyline
  underground: boolean
  /** Track height: 0 at grade, -12 for a subway. Absent reads as the mode default. */
  level?: number
}

export interface BuildingVolume {
  parcelId: string
  footprint: Polygon
  /** Representative height within the parcel envelope. */
  height: number
}
