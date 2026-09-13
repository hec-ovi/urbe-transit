import { SpatialIndex } from '../core/spatial-index'
import type { Bounds } from '../core/spatial-index'
import type { V2 } from '../core/vec'

type Piece = { id: number; bounds: Bounds }

/** Disjoint bounding-box components rule out a path; overlap never proves one. */
export class PlanComponents {
  private readonly spatial: SpatialIndex<Piece>
  private readonly parents: number[]

  constructor(polygons: V2[][], precision: number) {
    const pieces = polygons.map((polygon, id) => ({ id, bounds: {
      minX: Math.min(...polygon.map(point => point[0])) - precision,
      minZ: Math.min(...polygon.map(point => point[1])) - precision,
      maxX: Math.max(...polygon.map(point => point[0])) + precision,
      maxZ: Math.max(...polygon.map(point => point[1])) + precision,
    } }))
    this.parents = pieces.map(piece => piece.id)
    this.spatial = new SpatialIndex(pieces, piece => piece.bounds)
    for (const piece of pieces) for (const other of this.spatial.query(piece.bounds)) {
      if (other.id >= piece.id) continue
      const a = this.root(piece.id), b = this.root(other.id)
      if (a !== b) this.parents[a] = b
    }
  }

  mayConnect(a: V2, b: V2): boolean {
    const at = (point: V2) => this.spatial.query({ minX: point[0], minZ: point[1], maxX: point[0], maxZ: point[1] })
    const origins = new Set(at(a).map(piece => this.root(piece.id)))
    return at(b).some(piece => origins.has(this.root(piece.id)))
  }

  private root(id: number): number {
    let root = id
    while (this.parents[root] !== root) root = this.parents[root]
    while (this.parents[id] !== root) {
      const next = this.parents[id]
      this.parents[id] = root
      id = next
    }
    return root
  }
}
