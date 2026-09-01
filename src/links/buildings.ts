import { dist2, type V2, type V3 } from '../core/vec'
import { segmentMeetsPolygon, segmentPointDistance } from '../core/polygon'
import { BuildingFaces } from '../atlas/faces'
import type { AtlasBlueprint, Parcel } from '../types/atlas'

/** Bounding circle of a footprint, for cheap pair and obstruction prefilters. */
export interface Bounds {
  c: V2
  r: number
}

/** Faces, height and bounding circle per building, plus the shared obstruction test. */
export class BuildingIndex {
  readonly parcels: readonly Parcel[]
  private readonly facesById = new Map<string, BuildingFaces>()
  private readonly heightById = new Map<string, number>()
  private readonly boundsById = new Map<string, Bounds>()

  constructor(atlas: AtlasBlueprint) {
    this.parcels = atlas.parcels
    for (const p of atlas.parcels) {
      this.facesById.set(p.id, new BuildingFaces(p))
      const c: V2 = [
        p.footprint.reduce((s, v) => s + v[0], 0) / p.footprint.length,
        p.footprint.reduce((s, v) => s + v[1], 0) / p.footprint.length,
      ]
      this.boundsById.set(p.id, { c, r: Math.max(...p.footprint.map((v) => dist2(c, v))) })
    }
    for (const b of atlas.volumetric.buildings) this.heightById.set(b.parcelId, b.height)
  }

  faces(id: string): BuildingFaces {
    return this.facesById.get(id)!
  }

  height(id: string): number {
    return this.heightById.get(id)!
  }

  bounds(id: string): Bounds {
    return this.boundsById.get(id)!
  }

  /** Buildings whose bounding circle comes within `reach` of the polyline. */
  near(path: V2[], reach: number): string[] {
    const out: string[] = []
    for (const p of this.parcels) {
      const b = this.boundsById.get(p.id)!
      for (let i = 1; i < path.length; i++) {
        if (segmentPointDistance(path[i - 1], path[i], b.c) <= b.r + reach) {
          out.push(p.id)
          break
        }
      }
    }
    return out
  }

  /** True when the link's ground track crosses a third building that reaches its lowest point. */
  blocks(aId: string, bId: string, path: V3[]): boolean {
    const start = path[0]
    const end = path[path.length - 1]
    const track: [V2, V2] = [[start[0], start[2]], [end[0], end[2]]]
    const minY = Math.min(...path.map((p) => p[1]))
    for (const p of this.parcels) {
      if (p.id === aId || p.id === bId) continue
      if (this.heightById.get(p.id)! + 1 < minY) continue
      const b = this.boundsById.get(p.id)!
      if (segmentPointDistance(track[0], track[1], b.c) > b.r + 1) continue
      if (segmentMeetsPolygon(track[0], track[1], p.footprint)) return true
    }
    return false
  }
}
