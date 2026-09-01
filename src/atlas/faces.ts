import type { V2, V3 } from '../core/vec'
import { add2, dist2, dot3, lift, norm2, perp2, scale2, sub2, sub3 } from '../core/vec'
import { pointInPolygon } from '../core/polygon'
import type { Parcel } from '../types/atlas'

/** One vertical building face: the quad over footprint segment i -> i+1. */
export interface Face {
  index: number
  /** Segment start on the ground. */
  a: V2
  b: V2
  length: number
  /** Unit direction a -> b on the ground. */
  dir: V2
  /** Unit outward normal on the ground, away from the footprint interior. */
  normal: V2
  /** Ground midpoint. */
  mid: V2
}

/** Faces of one building, winding-agnostic: normals point away from the interior. */
export class BuildingFaces {
  readonly faces: Face[]

  constructor(readonly parcel: Parcel) {
    const fp = parcel.footprint
    this.faces = fp.map((a, i) => {
      const b = fp[(i + 1) % fp.length]
      const dir = norm2(sub2(b, a))
      let normal = perp2(dir)
      const mid = scale2(add2(a, b), 0.5)
      if (pointInPolygon(add2(mid, scale2(normal, 0.05)), fp)) normal = scale2(normal, -1)
      return { index: i, a, b, length: dist2(a, b), dir, normal, mid }
    })
  }

  /** World point on face f at (u along the segment, y up). */
  pointOn(f: Face, u: number, y: number): V3 {
    return lift(add2(f.a, scale2(f.dir, u)), y)
  }

  /** Signed distance of a world point from the face plane, positive outside. */
  planeDistance(f: Face, p: V3): number {
    return dot3(sub3(p, lift(f.a, 0)), lift(f.normal, 0))
  }

  /** Face-local U of a world point. */
  uOf(f: Face, p: V3): number {
    return dot3(sub3(p, lift(f.a, 0)), lift(f.dir, 0))
  }
}
