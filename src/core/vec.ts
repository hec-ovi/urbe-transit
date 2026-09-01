/** Ground-plane [x, z] and world [x, y, z] vector math. +Y is up. */

export type V2 = [number, number]
export type V3 = [number, number, number]

export const add2 = (a: V2, b: V2): V2 => [a[0] + b[0], a[1] + b[1]]
export const sub2 = (a: V2, b: V2): V2 => [a[0] - b[0], a[1] - b[1]]
export const scale2 = (a: V2, s: number): V2 => [a[0] * s, a[1] * s]
export const dot2 = (a: V2, b: V2): number => a[0] * b[0] + a[1] * b[1]
export const len2 = (a: V2): number => Math.hypot(a[0], a[1])
export const dist2 = (a: V2, b: V2): number => Math.hypot(a[0] - b[0], a[1] - b[1])
export const norm2 = (a: V2): V2 => {
  const l = len2(a)
  return l < 1e-12 ? [0, 0] : [a[0] / l, a[1] / l]
}
/** Right-hand perpendicular of a direction in the [x, z] plane. */
export const perp2 = (a: V2): V2 => [a[1], -a[0]]
export const lerp2 = (a: V2, b: V2, t: number): V2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

export const add3 = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const scale3 = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s]
export const dot3 = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const len3 = (a: V3): number => Math.hypot(a[0], a[1], a[2])
export const dist3 = (a: V3, b: V3): number => len3(sub3(a, b))
export const norm3 = (a: V3): V3 => {
  const l = len3(a)
  return l < 1e-12 ? [0, 0, 0] : [a[0] / l, a[1] / l, a[2] / l]
}
export const cross3 = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]

/** Lift a ground point to world space at height y. */
export const lift = (p: V2, y: number): V3 => [p[0], y, p[1]]
/** Drop a world point to the ground plane. */
export const drop = (p: V3): V2 => [p[0], p[2]]
