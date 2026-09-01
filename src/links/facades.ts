import type { V2 } from '../core/vec'
import { add2, scale2, sub2 } from '../core/vec'
import type { Face } from '../atlas/faces'
import type { BuildingIndex } from './buildings'

export interface FacadeHit {
  buildingId: string
  face: Face
  /** Face-local u of the hit point, measured from the face's first vertex. */
  u: number
  /** Distance from the ray origin to the facade. */
  distance: number
  /** Ground point of the hit. */
  point: V2
}

const cross2 = (a: V2, b: V2): number => a[0] * b[1] - a[1] * b[0]
/** A face slanted more than this against the ray is a corner graze, not a facade across the street. */
const MIN_FACING = 0.2

/**
 * First building facade a ground ray meets, among the given candidates. Only faces that look back
 * at the ray count, so the hit is the street-side wall, never the far wall of the same building.
 */
export function castFacade(
  origin: V2,
  dir: V2,
  candidates: readonly string[],
  buildings: BuildingIndex,
  minDistance: number,
  maxDistance: number,
): FacadeHit | null {
  let best: FacadeHit | null = null
  for (const id of candidates) {
    const b = buildings.bounds(id)
    const toC = sub2(b.c, origin)
    const along = toC[0] * dir[0] + toC[1] * dir[1]
    if (along < -b.r || along > maxDistance + b.r) continue
    for (const face of buildings.faces(id).faces) {
      const facing = face.normal[0] * dir[0] + face.normal[1] * dir[1]
      if (facing > -MIN_FACING) continue
      const e = sub2(face.b, face.a)
      const denom = cross2(dir, e)
      if (Math.abs(denom) < 1e-9) continue
      const toA = sub2(face.a, origin)
      const t = cross2(toA, e) / denom
      if (t < minDistance || t > maxDistance || (best && t >= best.distance)) continue
      const s = cross2(toA, dir) / denom
      if (s < 0 || s > 1) continue
      best = { buildingId: id, face, u: s * face.length, distance: t, point: add2(origin, scale2(dir, t)) }
    }
  }
  return best
}
