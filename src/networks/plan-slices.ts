import type { V2 } from '../core/vec'

export type Segment = [V2, V2]
export type Interval = [number, number]
export type Region = { edges: Segment[]; min: V2; max: V2 }
type Slice = [Segment, Segment]
type Slab = { covered: Slice[]; excluded: Slice[] }

/** Reuses active source edges inside each exact arrangement slab for one immutable cover. */
export class PlanSlices {
  private readonly stations: number[]
  private readonly slabs = new Map<number, Slab>()

  constructor(private readonly regions: Region[], private readonly exclusions: Region[], events: V2[]) {
    this.stations = [...new Set([...events.map(point => point[0]), ...[...regions, ...exclusions].flatMap(region => region.edges.map(([a]) => a[0]))])].sort((a, b) => a - b)
  }

  at(x: number): { covered: Interval[]; excluded: Interval[] } {
    let low = 0, high = this.stations.length
    while (low < high) {
      const middle = (low + high) >>> 1
      if (this.stations[middle] <= x) low = middle + 1
      else high = middle
    }
    const index = low - 1
    if (index < 0 || index + 1 >= this.stations.length) return { covered: [], excluded: [] }
    let slab = this.slabs.get(index)
    if (!slab) {
      const sample = (this.stations[index] + this.stations[index + 1]) / 2
      slab = { covered: this.prepare(this.regions, sample), excluded: this.prepare(this.exclusions, sample) }
      this.slabs.set(index, slab)
    }
    const evaluate = (slices: Slice[]): Interval[] => slices.map(([a, b]) => [ordinate(a, x), ordinate(b, x)])
    return { covered: evaluate(slab.covered), excluded: evaluate(slab.excluded) }
  }

  private prepare(regions: Region[], x: number): Slice[] {
    return regions.flatMap(region => {
      if (region.min[0] > x || region.max[0] <= x) return []
      const edges = region.edges.filter(([[ax], [bx]]) => (ax <= x && bx > x) || (bx <= x && ax > x))
      edges.sort((a, b) => ordinate(a, x) - ordinate(b, x))
      const slices: Slice[] = []
      for (let i = 1; i < edges.length; i += 2) slices.push([edges[i - 1], edges[i]])
      return slices
    })
  }
}

function ordinate([[ax, ay], [bx, by]]: Segment, x: number): number {
  return ay + (by - ay) * (x - ax) / (bx - ax)
}
