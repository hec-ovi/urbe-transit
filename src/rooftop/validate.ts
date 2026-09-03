import { ConnectionsError } from '../core/errors'
import { segmentsIntersect } from '../core/polygon'
import type { V2, V3 } from '../core/vec'
import type {
  ResolvedRooftopSpanParams,
  RooftopAttachment,
  RooftopAttachmentRef,
  RooftopRange,
  RooftopSpanRequest,
  RooftopVolume,
  RooftopVolumeKind,
} from './types'

const MAX_VALUE = 1_000_000_000
const EPS = 1e-9
const VOLUME_KINDS = new Set<RooftopVolumeKind>([
  'building', 'facade', 'roof', 'opening', 'access', 'equipment', 'reservation',
])

const DEFAULTS: ResolvedRooftopSpanParams = {
  minDistance: 5,
  maxDistance: 100,
  selectionRatio: 0.35,
  maxSpans: 12,
  maxPerAttachment: 1,
  thickness: { min: 0.025, max: 0.05 },
  slackRatio: { min: 1.003, max: 1.018 },
  directionToleranceDegrees: 30,
  pathSegments: 24,
}

const fail = (message: string, path: string): never => {
  throw new ConnectionsError('E_ROOFTOP_INPUT_INVALID', message, path)
}

function objectAt(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail('must be an object', path)
  return value as Record<string, unknown>
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], path: string): void {
  const accepted = new Set(allowed)
  const extra = Object.keys(value).find((key) => !accepted.has(key))
  if (extra !== undefined) fail('unknown property', `${path}.${extra}`)
}

function stringAt(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) fail('must be a non-empty string', path)
  return value as string
}

function numberAt(value: unknown, path: string, min = -MAX_VALUE, max = MAX_VALUE): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    fail(`must be a finite number in [${min}, ${max}]`, path)
  }
  return value as number
}

function integerAt(value: unknown, path: string, min: number, max: number): number {
  const number = numberAt(value, path, min, max)
  if (!Number.isInteger(number)) fail('must be an integer', path)
  return number
}

function pointAt(value: unknown, size: 2 | 3, path: string): V2 | V3 {
  if (!Array.isArray(value) || value.length !== size) fail(`must contain exactly ${size} numbers`, path)
  const point = (value as unknown[]).map((entry, index) => numberAt(entry, `${path}[${index}]`))
  return point as V2 | V3
}

function validateAttachment(value: unknown, path: string): RooftopAttachment {
  const attachment = objectAt(value, path)
  const orientation = attachment.orientation
  if (orientation === 'omnidirectional') {
    exactKeys(attachment, ['id', 'position', 'orientation', 'clearanceRadius'], path)
  } else if (orientation === 'directional') {
    exactKeys(attachment, ['id', 'position', 'orientation', 'normal', 'clearanceRadius'], path)
  } else {
    fail('must be omnidirectional or directional', `${path}.orientation`)
  }

  stringAt(attachment.id, `${path}.id`)
  pointAt(attachment.position, 3, `${path}.position`)
  numberAt(attachment.clearanceRadius, `${path}.clearanceRadius`, Number.MIN_VALUE)

  if (orientation === 'directional') {
    const normal = pointAt(attachment.normal, 3, `${path}.normal`) as V3
    const horizontalLength = Math.hypot(normal[0], normal[2])
    if (Math.abs(normal[1]) > EPS || Math.abs(horizontalLength - 1) > 1e-6) {
      fail('must be a horizontal unit vector', `${path}.normal`)
    }
  }
  return value as RooftopAttachment
}

function validateAttachmentRef(value: unknown, path: string): RooftopAttachmentRef {
  const ref = objectAt(value, path)
  exactKeys(ref, ['buildingId', 'attachment'], path)
  stringAt(ref.buildingId, `${path}.buildingId`)
  validateAttachment(ref.attachment, `${path}.attachment`)
  return value as RooftopAttachmentRef
}

function signedArea(polygon: readonly V2[]): number {
  let twice = 0
  for (let i = 0; i < polygon.length; i++) {
    const next = polygon[(i + 1) % polygon.length]
    twice += polygon[i][0] * next[1] - next[0] * polygon[i][1]
  }
  return twice / 2
}

function validateFootprint(value: unknown, path: string): V2[] {
  if (!Array.isArray(value) || value.length < 3) fail('must contain at least three points', path)
  const polygon = (value as unknown[]).map((point, index) => pointAt(point, 2, `${path}[${index}]`) as V2)
  for (let i = 0; i < polygon.length; i++) {
    const next = polygon[(i + 1) % polygon.length]
    if (Math.hypot(next[0] - polygon[i][0], next[1] - polygon[i][1]) <= EPS) {
      fail('has a zero-length edge or repeats its first point', path)
    }
    for (let j = i + 1; j < polygon.length; j++) {
      const adjacent = j === i + 1 || (i === 0 && j === polygon.length - 1)
      if (adjacent) continue
      if (segmentsIntersect(polygon[i], next, polygon[j], polygon[(j + 1) % polygon.length])) {
        fail('must be a simple polygon', path)
      }
    }
  }
  if (signedArea(polygon) <= EPS) fail('must be a non-zero CCW polygon', path)
  return polygon
}

function validateVolume(value: unknown, path: string): RooftopVolume {
  const volume = objectAt(value, path)
  exactKeys(volume, ['id', 'kind', 'buildingId', 'footprint', 'bottom', 'top', 'clearance'], path)
  stringAt(volume.id, `${path}.id`)
  if (!VOLUME_KINDS.has(volume.kind as RooftopVolumeKind)) fail('unknown volume kind', `${path}.kind`)
  if (volume.buildingId !== undefined) stringAt(volume.buildingId, `${path}.buildingId`)
  validateFootprint(volume.footprint, `${path}.footprint`)
  const bottom = numberAt(volume.bottom, `${path}.bottom`)
  const top = numberAt(volume.top, `${path}.top`)
  if (bottom >= top) fail('bottom must be below top', path)
  if (volume.clearance !== undefined) numberAt(volume.clearance, `${path}.clearance`, 0)
  return value as RooftopVolume
}

function optionalNumber(
  params: Record<string, unknown>,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  return key in params ? numberAt(params[key], `request.params.${key}`, min, max) : fallback
}

function optionalInteger(
  params: Record<string, unknown>,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  return key in params ? integerAt(params[key], `request.params.${key}`, min, max) : fallback
}

function rangeAt(value: unknown, path: string, lower: number, upper: number, exclusiveLower: boolean): RooftopRange {
  const range = objectAt(value, path)
  exactKeys(range, ['min', 'max'], path)
  const min = numberAt(range.min, `${path}.min`, lower, upper)
  const max = numberAt(range.max, `${path}.max`, lower, upper)
  if (exclusiveLower && min <= lower) fail(`must be greater than ${lower}`, `${path}.min`)
  if (min > max) fail('min must not exceed max', path)
  return { min, max }
}

function resolveParams(value: unknown): ResolvedRooftopSpanParams {
  if (value === undefined) return { ...DEFAULTS, thickness: { ...DEFAULTS.thickness }, slackRatio: { ...DEFAULTS.slackRatio } }
  const params = objectAt(value, 'request.params')
  exactKeys(params, [
    'minDistance', 'maxDistance', 'selectionRatio', 'maxSpans', 'maxPerAttachment',
    'thickness', 'slackRatio', 'directionToleranceDegrees', 'pathSegments',
  ], 'request.params')

  const minDistance = optionalNumber(params, 'minDistance', DEFAULTS.minDistance, 0, MAX_VALUE)
  const maxDistance = optionalNumber(params, 'maxDistance', DEFAULTS.maxDistance, Number.MIN_VALUE, MAX_VALUE)
  if (minDistance > maxDistance) fail('minDistance must not exceed maxDistance', 'request.params')

  return {
    minDistance,
    maxDistance,
    selectionRatio: optionalNumber(params, 'selectionRatio', DEFAULTS.selectionRatio, 0, 1),
    maxSpans: optionalInteger(params, 'maxSpans', DEFAULTS.maxSpans, 0, 2048),
    maxPerAttachment: optionalInteger(params, 'maxPerAttachment', DEFAULTS.maxPerAttachment, 1, 4),
    thickness: 'thickness' in params
      ? rangeAt(params.thickness, 'request.params.thickness', 0, 1, true)
      : { ...DEFAULTS.thickness },
    slackRatio: 'slackRatio' in params
      ? rangeAt(params.slackRatio, 'request.params.slackRatio', 1, 1.25, true)
      : { ...DEFAULTS.slackRatio },
    directionToleranceDegrees: optionalNumber(
      params, 'directionToleranceDegrees', DEFAULTS.directionToleranceDegrees, 0, 90,
    ),
    pathSegments: optionalInteger(params, 'pathSegments', DEFAULTS.pathSegments, 2, 128),
  }
}

export function validateRooftopSpanRequest(request: RooftopSpanRequest): ResolvedRooftopSpanParams {
  const root = objectAt(request, 'request')
  exactKeys(root, ['seed', 'attachments', 'volumes', 'params'], 'request')
  stringAt(root.seed, 'request.seed')
  if (!Array.isArray(root.attachments)) fail('must be an array', 'request.attachments')
  const attachmentValues = root.attachments as unknown[]
  if (attachmentValues.length > 2048) fail('must contain at most 2048 entries', 'request.attachments')
  if (!Array.isArray(root.volumes)) fail('must be an array', 'request.volumes')
  const volumeValues = root.volumes as unknown[]
  if (volumeValues.length > 8192) fail('must contain at most 8192 entries', 'request.volumes')

  const refs = attachmentValues.map((entry, index) => validateAttachmentRef(entry, `request.attachments[${index}]`))
  const volumes = volumeValues.map((entry, index) => validateVolume(entry, `request.volumes[${index}]`))

  const refIds = new Set<string>()
  for (let i = 0; i < refs.length; i++) {
    const ref = refs[i]
    const id = `${ref.buildingId}\u0000${ref.attachment.id}`
    if (refIds.has(id)) fail('building and attachment ID pair must be unique', `request.attachments[${i}]`)
    refIds.add(id)
    if (!volumes.some((volume) => volume.kind === 'building' && volume.buildingId === ref.buildingId)) {
      fail('attachment building needs a matching building volume', `request.attachments[${i}].buildingId`)
    }
  }

  const volumeIds = new Set<string>()
  for (let i = 0; i < volumes.length; i++) {
    if (volumeIds.has(volumes[i].id)) fail('volume ID must be unique', `request.volumes[${i}].id`)
    volumeIds.add(volumes[i].id)
  }

  return resolveParams(root.params)
}
