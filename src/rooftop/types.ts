import type { V2, V3 } from '../core/vec'

export interface OmnidirectionalAttachment {
  id: string
  position: V3
  orientation: 'omnidirectional'
  clearanceRadius: number
}

export interface DirectionalAttachment {
  id: string
  position: V3
  orientation: 'directional'
  normal: V3
  clearanceRadius: number
}

export type RooftopAttachment = OmnidirectionalAttachment | DirectionalAttachment

export interface RooftopAttachmentRef {
  buildingId: string
  attachment: RooftopAttachment
}

export type RooftopVolumeKind =
  | 'building'
  | 'facade'
  | 'roof'
  | 'opening'
  | 'access'
  | 'equipment'
  | 'reservation'

export interface RooftopVolume {
  id: string
  kind: RooftopVolumeKind
  buildingId?: string
  footprint: V2[]
  bottom: number
  top: number
  clearance?: number
}

export interface RooftopRange {
  min: number
  max: number
}

export interface RooftopSpanParams {
  minDistance?: number
  maxDistance?: number
  selectionRatio?: number
  maxSpans?: number
  maxPerAttachment?: number
  thickness?: RooftopRange
  slackRatio?: RooftopRange
  directionToleranceDegrees?: number
  pathSegments?: number
}

export interface RooftopSpanRequest {
  seed: string
  attachments: RooftopAttachmentRef[]
  volumes: RooftopVolume[]
  params?: RooftopSpanParams
}

export interface ResolvedRooftopSpanParams {
  minDistance: number
  maxDistance: number
  selectionRatio: number
  maxSpans: number
  maxPerAttachment: number
  thickness: RooftopRange
  slackRatio: RooftopRange
  directionToleranceDegrees: number
  pathSegments: number
}

export interface RooftopSpanEndpoint {
  buildingId: string
  attachmentId: string
  position: V3
}

export interface CatenaryDefinition {
  type: 'catenary'
  groundOrigin: V2
  horizontalDirection: V2
  horizontalDistance: number
  scale: number
  horizontalOffset: number
  verticalOffset: number
  domain: [0, number]
}

export interface RooftopSpan {
  id: string
  a: RooftopSpanEndpoint
  b: RooftopSpanEndpoint
  catenary: CatenaryDefinition
  path: V3[]
  /** Cable diameter in meters. */
  thickness: number
  /** Maximum vertical distance below the straight endpoint chord. */
  sag: number
  /** Catenary length minus straight endpoint distance. */
  slack: number
  slackRatio: number
  /** Exact catenary arc length. */
  length: number
}

export interface RooftopSpanOutput {
  meta: { seed: string; schemaVersion: string; generatorVersion: string }
  spans: RooftopSpan[]
}
