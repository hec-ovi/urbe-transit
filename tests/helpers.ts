import type { AtlasBlueprint, StreetEdge } from '../src/types/atlas'
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

const side = (a: P2, b: P2, p: P2): number => Math.sign((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]))

/** The street whose centerline the ground segment a-b crosses, if any: the street it spans. */
export function straddledStreet(atlas: AtlasBlueprint, a: P2, b: P2): StreetEdge | null {
  for (const e of atlas.streets.edges) {
    for (let i = 1; i < e.path.length; i++) {
      const [p, q] = [e.path[i - 1], e.path[i]]
      if (side(a, b, p) !== side(a, b, q) && side(p, q, a) !== side(p, q, b)) return e
    }
  }
  return null
}

/** Total centerline length per street class. */
export function streetLengthPerClass(atlas: AtlasBlueprint): Record<string, number> {
  const out: Record<string, number> = {}
  for (const e of atlas.streets.edges) {
    let len = 0
    for (let i = 1; i < e.path.length; i++) len += Math.hypot(e.path[i][0] - e.path[i - 1][0], e.path[i][1] - e.path[i - 1][1])
    out[e.class] = (out[e.class] ?? 0) + len
  }
  return out
}

/** Ground endpoints of a link: where it leaves one facade and where it lands on the other. */
export const linkGround = (l: Link): [P2, P2] => {
  const end = l.path[l.path.length - 1]
  return [[l.path[0][0], l.path[0][2]], [end[0], end[2]]]
}

/** Wires per 100 m of street centerline, per class; a class with no wire reads 0. */
export function wireDensityPerClass(atlas: AtlasBlueprint, wires: readonly Link[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const w of wires) {
    const street = straddledStreet(atlas, ...linkGround(w))
    if (street) counts[street.class] = (counts[street.class] ?? 0) + 1
  }
  const lengths = streetLengthPerClass(atlas)
  const out: Record<string, number> = {}
  for (const cls of Object.keys(lengths)) out[cls] = ((counts[cls] ?? 0) / lengths[cls]) * 100
  return out
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

/**
 * Per above-ground link: the highest street surface its ground track passes over (null when it
 * passes over none) and its underside, which is the lower of its two aperture bases.
 */
export function soffitOverStreets(
  atlas: AtlasBlueprint,
  out: { links: readonly Link[]; apertures: readonly { id: string; base: number }[] },
): { id: string; level: number | null; soffit: number }[] {
  const base = new Map(out.apertures.map((a) => [a.id, a.base]))
  const res: { id: string; level: number | null; soffit: number }[] = []
  for (const l of out.links) {
    if (l.kind !== 'bridge' && l.kind !== 'ac-tube') continue
    const [a, b] = linkGround(l)
    let level: number | null = null
    for (const e of atlas.streets.edges) {
      const half = (e.width + e.sidewalk.left + e.sidewalk.right) / 2
      for (let i = 1; i < e.path.length; i++) {
        if (segDist(a, b, e.path[i - 1], e.path[i]) <= half) {
          level = Math.max(level ?? -Infinity, e.level ?? 0)
          break
        }
      }
    }
    res.push({ id: l.id, level, soffit: Math.min(base.get(l.a.apertureId)!, base.get(l.b.apertureId)!) })
  }
  return res
}
