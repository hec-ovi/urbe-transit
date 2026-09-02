import type { V2, V3 } from '../core/vec'
import { segmentMeetsPolygon } from '../core/polygon'
import { bbox, overlaps, type Box } from '../core/box'
import type { AtlasBlueprint } from '../types/atlas'

/** One solid a station occupies: a plan footprint between two heights. */
interface Volume {
  footprint: V2[]
  bottom: number
  top: number
  bounds: Box
}

/** Plan track and vertical extent of a link solid: its section swept along its path. */
export function linkSolid(path: readonly V3[], height: number): { a: V2; b: V2; bottom: number; top: number } {
  const ys = path.map((p) => p[1])
  const end = path[path.length - 1]
  return {
    a: [path[0][0], path[0][2]],
    b: [end[0], end[2]],
    bottom: Math.min(...ys) - height / 2,
    top: Math.max(...ys) + height / 2,
  }
}

/**
 * Everything a station occupies below and at the street: the platform box, the shaft under every
 * entrance, and the passage that joins them. Nothing this box builds may enter one.
 */
export class StationVolumes {
  private readonly volumes: Volume[] = []

  constructor(atlas: AtlasBlueprint) {
    for (const s of [...atlas.transit.subwayStations, ...atlas.transit.trainStations]) {
      if (!s.box) continue
      this.add(s.platform, s.box.bottom, s.box.top)
      for (const shaft of s.shafts ?? []) {
        this.add(shaft.footprint, shaft.bottom, shaft.top)
        // A passage runs at platform level, from the foot of its shaft to the platform.
        this.add(shaft.passage, s.box.bottom, s.box.top)
      }
    }
  }

  private add(footprint: V2[] | undefined, bottom: number, top: number): void {
    if (!footprint || footprint.length < 3 || !(top > bottom)) return
    this.volumes.push({ footprint, bottom, top, bounds: bbox(footprint) })
  }

  /** True when a solid spanning a to b between `bottom` and `top` enters a station. */
  hits(a: V2, b: V2, bottom: number, top: number): boolean {
    const track = bbox([a, b])
    for (const v of this.volumes) {
      if (bottom >= v.top || top <= v.bottom) continue
      if (!overlaps(track, v.bounds)) continue
      if (segmentMeetsPolygon(a, b, v.footprint)) return true
    }
    return false
  }
}
