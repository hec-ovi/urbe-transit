import type {
  DirectionalAttachment,
  RooftopAttachmentRef,
  RooftopSpanRequest,
  RooftopVolume,
} from '../src'

export function boxVolume(
  id: string,
  kind: RooftopVolume['kind'],
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number,
  bottom: number,
  top: number,
  buildingId?: string,
): RooftopVolume {
  return {
    id,
    kind,
    ...(buildingId === undefined ? {} : { buildingId }),
    footprint: [[minX, minZ], [maxX, minZ], [maxX, maxZ], [minX, maxZ]],
    bottom,
    top,
  }
}

export function omni(buildingId: string, id: string, position: [number, number, number]): RooftopAttachmentRef {
  return {
    buildingId,
    attachment: { id, position, orientation: 'omnidirectional', clearanceRadius: 0.5 },
  }
}

export function directional(
  buildingId: string,
  id: string,
  position: [number, number, number],
  normal: [number, number, number],
): RooftopAttachmentRef {
  const attachment: DirectionalAttachment = {
    id,
    position,
    orientation: 'directional',
    normal,
    clearanceRadius: 0.5,
  }
  return { buildingId, attachment }
}

export function twoRoofRequest(): RooftopSpanRequest {
  return {
    seed: 'rooftop-contract',
    attachments: [omni('building-a', 'mast-a:external:0', [0, 20, 0]), omni('building-b', 'mast-b:external:0', [40, 20, 0])],
    volumes: [
      boxVolume('building-a-solid', 'building', -2, -2, 2, 2, 0, 12, 'building-a'),
      boxVolume('building-b-solid', 'building', 38, -2, 42, 2, 0, 12, 'building-b'),
    ],
    params: {
      minDistance: 5,
      maxDistance: 60,
      selectionRatio: 1,
      maxSpans: 1,
      maxPerAttachment: 1,
      thickness: { min: 0.04, max: 0.04 },
      slackRatio: { min: 1.01, max: 1.01 },
      directionToleranceDegrees: 20,
      pathSegments: 4,
    },
  }
}
