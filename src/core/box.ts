import type { V2 } from './vec'

/** Axis-aligned ground-plane box, for cheap spatial prefilters. */
export interface Box {
  min: V2
  max: V2
}

export function bbox(points: readonly V2[]): Box {
  const xs = points.map((p) => p[0])
  const zs = points.map((p) => p[1])
  return { min: [Math.min(...xs), Math.min(...zs)], max: [Math.max(...xs), Math.max(...zs)] }
}

export const grow = (b: Box, by: number): Box => ({
  min: [b.min[0] - by, b.min[1] - by],
  max: [b.max[0] + by, b.max[1] + by],
})

export const overlaps = (a: Box, b: Box): boolean =>
  a.min[0] <= b.max[0] && a.max[0] >= b.min[0] && a.min[1] <= b.max[1] && a.max[1] >= b.min[1]
