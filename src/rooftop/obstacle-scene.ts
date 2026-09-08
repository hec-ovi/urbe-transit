import { attachmentClearanceBlocked, curveMeetsVolume } from './collision'
import type { CatenaryCurve } from './catenary'
import { SpatialIndex, type Bounds } from './spatial-index'
import type { RooftopAttachmentRef, RooftopVolume } from './types'

/** Broad-phase bounds only select candidates; continuous collision remains authoritative. */
export class ObstacleScene {
  private readonly index: SpatialIndex<RooftopVolume>

  constructor(volumes: readonly RooftopVolume[]) {
    this.index = new SpatialIndex(volumes, volume => {
      const bounds = { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity }
      for (const [x, z] of volume.footprint) {
        bounds.minX = Math.min(bounds.minX, x)
        bounds.maxX = Math.max(bounds.maxX, x)
        bounds.minZ = Math.min(bounds.minZ, z)
        bounds.maxZ = Math.max(bounds.maxZ, z)
      }
      return expand(bounds, volume.clearance ?? 0)
    })
  }

  blocksAttachment(endpoint: RooftopAttachmentRef, cableRadius: number): boolean {
    const [x, , z] = endpoint.attachment.position
    const bounds = expand({ minX: x, maxX: x, minZ: z, maxZ: z }, endpoint.attachment.clearanceRadius + cableRadius)
    return attachmentClearanceBlocked(endpoint, cableRadius, this.index.query(bounds))
  }

  blocksCurve(curve: CatenaryCurve, cableRadius: number): boolean {
    const bounds = expand({
      minX: Math.min(curve.start[0], curve.end[0]),
      maxX: Math.max(curve.start[0], curve.end[0]),
      minZ: Math.min(curve.start[2], curve.end[2]),
      maxZ: Math.max(curve.start[2], curve.end[2]),
    }, cableRadius)
    return this.index.query(bounds).some(volume => curveMeetsVolume(curve, cableRadius, volume))
  }
}

function expand(bounds: Bounds, radius: number): Bounds {
  // Broad-phase padding covers coordinate arithmetic and the continuous solver's comparison tolerance.
  const margin = radius + 1e-7 + 1e-9 * Math.max(
    Math.abs(bounds.minX), Math.abs(bounds.maxX), Math.abs(bounds.minZ), Math.abs(bounds.maxZ), radius,
  )
  return { minX: bounds.minX - margin, minZ: bounds.minZ - margin, maxX: bounds.maxX + margin, maxZ: bounds.maxZ + margin }
}
