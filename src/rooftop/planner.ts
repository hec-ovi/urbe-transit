import { Rng } from '../core/rng'
import type { V2 } from '../core/vec'
import { CatenaryCurve } from './catenary'
import { attachmentClearanceBlocked, curveMeetsVolume } from './collision'
import type {
  ResolvedRooftopSpanParams,
  RooftopAttachmentRef,
  RooftopRange,
  RooftopSpan,
  RooftopSpanRequest,
} from './types'

interface Candidate {
  key: string
  priority: number
  a: RooftopAttachmentRef
  b: RooftopAttachmentRef
  curve: CatenaryCurve
  thickness: number
}

const compareText = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0
const refKey = (ref: RooftopAttachmentRef): string => JSON.stringify([ref.buildingId, ref.attachment.id])

function canonicalPair(
  first: RooftopAttachmentRef,
  second: RooftopAttachmentRef,
): [RooftopAttachmentRef, RooftopAttachmentRef] {
  return compareText(refKey(first), refKey(second)) <= 0 ? [first, second] : [second, first]
}

function pairKey(a: RooftopAttachmentRef, b: RooftopAttachmentRef): string {
  return JSON.stringify([[a.buildingId, a.attachment.id], [b.buildingId, b.attachment.id]])
}

function pairId(a: RooftopAttachmentRef, b: RooftopAttachmentRef): string {
  const part = (value: string): string => encodeURIComponent(value)
  return `rooftop-span/${part(a.buildingId)}/${part(a.attachment.id)}/${part(b.buildingId)}/${part(b.attachment.id)}`
}

function seededValue(seed: string, key: string, label: string, range: RooftopRange): number {
  return range.min + (range.max - range.min) * new Rng(`${seed}/rooftop/${key}/${label}`).next()
}

function facesPartner(
  endpoint: RooftopAttachmentRef,
  direction: V2,
  minimumDot: number,
): boolean {
  if (endpoint.attachment.orientation === 'omnidirectional') return true
  const normal = endpoint.attachment.normal
  return normal[0] * direction[0] + normal[2] * direction[1] >= minimumDot - 1e-12
}

function directionCompatible(
  a: RooftopAttachmentRef,
  b: RooftopAttachmentRef,
  toleranceDegrees: number,
): boolean {
  const dx = b.attachment.position[0] - a.attachment.position[0]
  const dz = b.attachment.position[2] - a.attachment.position[2]
  const distance = Math.hypot(dx, dz)
  if (distance <= 1e-9) return false
  const direction: V2 = [dx / distance, dz / distance]
  const minimumDot = Math.cos(toleranceDegrees * Math.PI / 180)
  return facesPartner(a, direction, minimumDot) && facesPartner(b, [-direction[0], -direction[1]], minimumDot)
}

function buildCandidate(
  first: RooftopAttachmentRef,
  second: RooftopAttachmentRef,
  request: RooftopSpanRequest,
  params: ResolvedRooftopSpanParams,
): Candidate | null {
  if (first.buildingId === second.buildingId) return null
  const [a, b] = canonicalPair(first, second)
  const key = pairKey(a, b)
  const priority = new Rng(`${request.seed}/rooftop/${key}/selection`).next()
  if (priority >= params.selectionRatio) return null
  if (!directionCompatible(a, b, params.directionToleranceDegrees)) return null

  const start = a.attachment.position
  const end = b.attachment.position
  const horizontalDistance = Math.hypot(end[0] - start[0], end[2] - start[2])
  const straightDistance = Math.hypot(horizontalDistance, end[1] - start[1])
  if (straightDistance < params.minDistance || straightDistance > params.maxDistance || horizontalDistance <= 1e-6) {
    return null
  }

  const thickness = seededValue(request.seed, key, 'thickness', params.thickness)
  const cableRadius = thickness / 2
  if (horizontalDistance <= a.attachment.clearanceRadius + b.attachment.clearanceRadius + thickness) return null
  if (attachmentClearanceBlocked(a, cableRadius, request.volumes)) return null
  if (attachmentClearanceBlocked(b, cableRadius, request.volumes)) return null

  const slackRatio = seededValue(request.seed, key, 'slack', params.slackRatio)
  const curve = new CatenaryCurve(start, end, slackRatio)
  const coefficients = [
    curve.definition.scale,
    curve.definition.horizontalOffset,
    curve.definition.verticalOffset,
    curve.length,
    curve.sag,
  ]
  if (!coefficients.every(Number.isFinite)) return null
  if (request.volumes.some((volume) => curveMeetsVolume(curve, cableRadius, volume))) return null
  return { key, priority, a, b, curve, thickness }
}

function toSpan(candidate: Candidate, pathSegments: number): RooftopSpan {
  const { a, b, curve, thickness } = candidate
  return {
    id: pairId(a, b),
    a: {
      buildingId: a.buildingId,
      attachmentId: a.attachment.id,
      position: [...a.attachment.position],
    },
    b: {
      buildingId: b.buildingId,
      attachmentId: b.attachment.id,
      position: [...b.attachment.position],
    },
    catenary: {
      ...curve.definition,
      groundOrigin: [...curve.definition.groundOrigin],
      horizontalDirection: [...curve.definition.horizontalDirection],
      domain: [...curve.definition.domain],
    },
    path: curve.sample(pathSegments),
    thickness,
    sag: curve.sag,
    slack: curve.length - curve.straightLength,
    slackRatio: curve.length / curve.straightLength,
    length: curve.length,
  }
}

export function planRooftopSpans(
  request: RooftopSpanRequest,
  params: ResolvedRooftopSpanParams,
): RooftopSpan[] {
  if (params.maxSpans === 0 || params.selectionRatio === 0) return []
  const ordered = [...request.attachments].sort((a, b) =>
    a.attachment.position[0] - b.attachment.position[0] || compareText(refKey(a), refKey(b)),
  )
  const candidates: Candidate[] = []
  for (let first = 0; first < ordered.length; first++) {
    for (let second = first + 1; second < ordered.length; second++) {
      if (ordered[second].attachment.position[0] - ordered[first].attachment.position[0] > params.maxDistance) break
      const candidate = buildCandidate(ordered[first], ordered[second], request, params)
      if (candidate !== null) candidates.push(candidate)
    }
  }
  candidates.sort((a, b) => a.priority - b.priority || compareText(a.key, b.key))

  const usage = new Map<string, number>()
  const selected: RooftopSpan[] = []
  for (const candidate of candidates) {
    const aKey = refKey(candidate.a)
    const bKey = refKey(candidate.b)
    if ((usage.get(aKey) ?? 0) >= params.maxPerAttachment) continue
    if ((usage.get(bKey) ?? 0) >= params.maxPerAttachment) continue
    selected.push(toSpan(candidate, params.pathSegments))
    usage.set(aKey, (usage.get(aKey) ?? 0) + 1)
    usage.set(bKey, (usage.get(bKey) ?? 0) + 1)
    if (selected.length >= params.maxSpans) break
  }
  return selected.sort((a, b) => compareText(a.id, b.id))
}
