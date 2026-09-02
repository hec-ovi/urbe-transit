import type { V2 } from '../core/vec'
import { segmentSegmentDistance } from '../core/polygon'
import type { AtlasBlueprint } from '../types/atlas'

/**
 * Headroom a link leaves over the street surface it flies over: a lorry (4.5 m) plus the margin
 * a footbridge keeps over one. A highway deck runs at level 8, so a link over one starts at 13.5.
 */
export const MIN_CROSSING_CLEARANCE = 5.5

interface Band {
  /** Height of this street's surface: 0 at grade, 8 on a highway deck. */
  level: number
  /** Half the ground the street occupies, carriageway plus both sidewalks. */
  half: number
  path: readonly V2[]
}

/** The street ground under a link, and how high that ground runs. */
export class StreetBands {
  private readonly bands: Band[]

  constructor(atlas: AtlasBlueprint) {
    this.bands = atlas.streets.edges.map((e) => ({
      level: e.level ?? 0,
      half: (e.width + e.sidewalk.left + e.sidewalk.right) / 2,
      path: e.path,
    }))
  }

  /** Highest street surface the ground track a-b passes over; null when it passes over none. */
  levelUnder(a: V2, b: V2): number | null {
    let top: number | null = null
    for (const s of this.bands) {
      if (top !== null && s.level <= top) continue
      for (let i = 1; i < s.path.length; i++) {
        if (segmentSegmentDistance(a, b, s.path[i - 1], s.path[i]) <= s.half) {
          top = s.level
          break
        }
      }
    }
    return top
  }

  /** Lowest underside a link crossing this track may take; -Infinity when it crosses no street. */
  floorOver(a: V2, b: V2): number {
    const level = this.levelUnder(a, b)
    return level === null ? -Infinity : level + MIN_CROSSING_CLEARANCE
  }
}
