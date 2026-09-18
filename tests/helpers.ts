import type { AtlasBlueprint } from '../src/types/atlas'
import type { Link } from '../src/types/output'

/** Independent face-plane math: unsigned distance of a world point from face `face` of a building. */
export function facePlaneDistance(atlas: AtlasBlueprint, buildingId: string, face: number, p: [number, number, number]): number {
  const fp = atlas.parcels.find((x) => x.id === buildingId)!.footprint
  const a = fp[face]
  const b = fp[(face + 1) % fp.length]
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const len = Math.hypot(dx, dz)
  // Unsigned distance from the vertical plane through segment a-b.
  return Math.abs(((p[0] - a[0]) * dz - (p[2] - a[1]) * dx) / len)
}

export function faceLength(atlas: AtlasBlueprint, buildingId: string, face: number): number {
  const fp = atlas.parcels.find((x) => x.id === buildingId)!.footprint
  const a = fp[face]
  const b = fp[(face + 1) % fp.length]
  return Math.hypot(b[0] - a[0], b[1] - a[1])
}

type P2 = [number, number]

/** Ground endpoints of a link: where it leaves one facade and where it lands on the other. */
export const linkGround = (l: Link): [P2, P2] => {
  const end = l.path[l.path.length - 1]
  return [[l.path[0][0], l.path[0][2]], [end[0], end[2]]]
}

/** Distance from a point to a 3D polyline. */
export function distToPath(p: [number, number, number], path: [number, number, number][]): number {
  let best = Infinity
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]
    const b = path[i]
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const l2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2
    const t = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / l2))
    const q = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t]
    best = Math.min(best, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]))
  }
  return best
}

/** Independent segment-to-segment distance on the ground plane. */
function segDist(a: P2, b: P2, c: P2, d: P2): number {
  const cross = (p: P2, q: P2, r: P2) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]))
  if (cross(a, b, c) !== cross(a, b, d) && cross(c, d, a) !== cross(c, d, b)) return 0
  const toSeg = (p: P2, q: P2, r: P2) => {
    const [dx, dz] = [q[0] - p[0], q[1] - p[1]]
    const l2 = dx * dx + dz * dz
    const t = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((r[0] - p[0]) * dx + (r[1] - p[1]) * dz) / l2))
    return Math.hypot(r[0] - (p[0] + dx * t), r[1] - (p[1] + dz * t))
  }
  return Math.min(toSeg(a, b, c), toSeg(a, b, d), toSeg(c, d, a), toSeg(c, d, b))
}

const inPolygon = (p: P2, poly: readonly P2[]): boolean => {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]
    const [xj, zj] = poly[j]
    if (zi > p[1] !== zj > p[1] && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

/** Plan distance from segment a-b to a polygon; 0 when it meets or enters it. */
export function segmentPolygonDistance(a: P2, b: P2, poly: readonly P2[]): number {
  if (inPolygon(a, poly) || inPolygon(b, poly)) return 0
  let best = Infinity
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [c, d] = [poly[j], poly[i]]
    const dist = segDist(a, b, c, d)
    if (dist === 0) return 0
    best = Math.min(best, dist)
  }
  return best
}
