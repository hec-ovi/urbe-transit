import type { AtlasBlueprint } from '../src/types/atlas'

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
