import type { V2 } from '../core/vec'
import { dist2, drop } from '../core/vec'
import { offsetPolyline, trimPolyline } from '../core/polygon'
import type { AtlasBlueprint } from '../types/atlas'
import type { Link, WalkEdge, WalkNode } from '../types/output'
import { StreetIndex, heading } from './street-util'
import type { SignalIndex } from './signals'

const CORNER_WIDTH = 2
const CROSSING_WIDTH = 3
/** A crossing end farther than this from every corner stays unconnected (atlas guarantees closer). */
const SNAP_RANGE = 8

/** Sidewalk graph: offset centerlines, corner arcs, signal-synced crossings, access and link edges. */
export class WalkBuilder {
  private readonly streets: StreetIndex
  private readonly nodes: WalkNode[] = []
  private readonly edges: WalkEdge[] = []
  /** Corner candidates per street node, with their bearing seen from the intersection. */
  private readonly corners = new Map<string, { nodeId: string; angle: number; edgeId: string }[]>()

  constructor(
    private readonly atlas: AtlasBlueprint,
    private readonly signalIndex: SignalIndex,
    private readonly links: Link[],
  ) {
    this.streets = new StreetIndex(atlas)
  }

  build(): { nodes: WalkNode[]; edges: WalkEdge[] } {
    this.buildSidewalks()
    this.buildCornerArcs()
    this.buildCrossings()
    this.buildAccessPoints()
    this.buildLinkEdges()
    return { nodes: this.nodes, edges: this.edges }
  }

  private addNode(n: Omit<WalkNode, 'id'>): string {
    const id = `w${this.nodes.length}`
    this.nodes.push({ id, ...n })
    return id
  }

  private addEdge(e: Omit<WalkEdge, 'id'>): void {
    this.edges.push({ id: `we${this.edges.length}`, ...e })
  }

  private buildSidewalks(): void {
    for (const e of this.atlas.streets.edges) {
      for (const side of ['right', 'left'] as const) {
        const sw = e.sidewalk[side]
        if (sw <= 0) continue
        const sign = side === 'right' ? 1 : -1
        const offset = offsetPolyline(e.path, sign * (e.width / 2 + sw / 2))
        const trimmed = trimPolyline(offset, this.streets.setback(e.from), this.streets.setback(e.to))
        if (trimmed.length < 2) continue
        const a = this.addNode({ x: trimmed[0][0], z: trimmed[0][1], kind: 'corner' })
        const bIdx = trimmed.length - 1
        const b = this.addNode({ x: trimmed[bIdx][0], z: trimmed[bIdx][1], kind: 'corner' })
        this.addEdge({ from: a, to: b, kind: 'sidewalk', width: sw, path: trimmed, level: e.level ?? 0 })
        this.registerCorner(e.from, a, trimmed[0], e.id)
        this.registerCorner(e.to, b, trimmed[bIdx], e.id)
      }
    }
  }

  private registerCorner(streetNodeId: string, walkNodeId: string, p: V2, edgeId: string): void {
    const center = this.streets.nodes.get(streetNodeId)!.position
    const list = this.corners.get(streetNodeId) ?? []
    list.push({ nodeId: walkNodeId, angle: heading([p[0] - center[0], p[1] - center[1]]), edgeId })
    this.corners.set(streetNodeId, list)
  }

  /** Around each intersection, join angularly adjacent sidewalk ends of different streets. */
  private buildCornerArcs(): void {
    for (const [, list] of [...this.corners.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      if (list.length < 2) continue
      const sorted = [...list].sort((x, y) => x.angle - y.angle || x.nodeId.localeCompare(y.nodeId))
      for (let i = 0; i < sorted.length; i++) {
        const a = sorted[i]
        const b = sorted[(i + 1) % sorted.length]
        if (a.edgeId === b.edgeId || a.nodeId === b.nodeId) continue
        const pa = this.point(a.nodeId)
        const pb = this.point(b.nodeId)
        this.addEdge({ from: a.nodeId, to: b.nodeId, kind: 'sidewalk', width: CORNER_WIDTH, path: [pa, pb], level: this.cornerLevel(a.edgeId, b.edgeId) })
      }
    }
  }

  private buildCrossings(): void {
    for (const c of this.atlas.streets.crossings) {
      c.segments.forEach((seg, i) => {
        const a = this.crossingEndNode(seg.from, c.nodeId)
        const b = this.crossingEndNode(seg.to, c.nodeId)
        const signal = this.signalIndex.crossingRef.get(`${c.nodeId}:${i}`)
        this.addEdge({ from: a, to: b, kind: 'crossing', width: CROSSING_WIDTH, path: [seg.from, seg.to], level: this.nodeLevel(c.nodeId), ...(signal ? { signal } : {}) })
      })
    }
  }

  /** A coincident corner is reused; otherwise a new end node, tied to the nearest corner. */
  private crossingEndNode(p: V2, streetNodeId: string): string {
    const list = this.corners.get(streetNodeId) ?? []
    let best: string | null = null
    let bestD = SNAP_RANGE
    for (const c of list) {
      const d = dist2(p, this.point(c.nodeId))
      if (d < bestD - 1e-9) {
        bestD = d
        best = c.nodeId
      }
    }
    if (best && bestD <= 0.5) return best
    const id = this.addNode({ x: p[0], z: p[1], kind: 'crossing-end' })
    if (best) this.addEdge({ from: id, to: best, kind: 'sidewalk', width: CORNER_WIDTH, path: [p, this.point(best)], level: this.nodeLevel(streetNodeId) })
    return id
  }

  private buildAccessPoints(): void {
    for (const s of this.atlas.transit.busStops) {
      const id = this.addNode({ x: s.position[0], z: s.position[1], kind: 'stop', ref: s.id })
      this.connectNearest(id, s.position)
    }
    for (const st of [...this.atlas.transit.trainStations, ...this.atlas.transit.subwayStations]) {
      const id = this.addNode({ x: st.position[0], z: st.position[1], kind: 'station', ref: st.id })
      for (const entrance of st.entrances) this.connectNearest(id, entrance, [st.position, entrance])
      if (st.entrances.length === 0) this.connectNearest(id, st.position)
    }
    for (const p of this.atlas.parcels) {
      const id = this.addNode({ x: p.access.point[0], z: p.access.point[1], kind: 'entry', ref: p.id })
      this.connectNearest(id, p.access.point)
    }
  }

  /** Access edge to the nearest sidewalk-side node; prefix is prepended to the edge path. */
  private connectNearest(fromId: string, p: V2, prefix?: V2[]): void {
    let best: WalkNode | null = null
    let bestD = Infinity
    for (const n of this.nodes) {
      if (n.kind !== 'corner' && n.kind !== 'crossing-end') continue
      const d = dist2(p, [n.x, n.z])
      if (d < bestD - 1e-9) {
        bestD = d
        best = n
      }
    }
    if (!best) return
    const path = [...(prefix ?? [p]), [best.x, best.z] as V2]
    this.addEdge({ from: fromId, to: best.id, kind: 'access', width: CORNER_WIDTH, path, level: 0 })
  }

  /** Walkable inter-building links join the graph as portal-to-portal edges. */
  private buildLinkEdges(): void {
    for (const link of this.links) {
      if (!link.walkable.over && !link.walkable.inside) continue
      const a2 = drop(link.path[0])
      const b2 = drop(link.path[link.path.length - 1])
      const a = this.addNode({ x: a2[0], z: a2[1], kind: 'link-portal', ref: link.id })
      const b = this.addNode({ x: b2[0], z: b2[1], kind: 'link-portal', ref: link.id })
      this.addEdge({
        from: a, to: b, kind: 'link', width: link.crossSection.width,
        path: link.path.map(drop), linkId: link.id,
        level: Math.min(link.path[0][1], link.path[link.path.length - 1][1]) - link.crossSection.height / 2,
      })
    }
  }

  /** Walking level at a street node: the lowest street meeting there, the one at grade. */
  private nodeLevel(streetNodeId: string): number {
    const n = this.streets.nodes.get(streetNodeId)
    if (!n) return 0
    const levels = n.edgeIds.map((id) => this.streets.edges.get(id)?.level ?? 0)
    return levels.length === 0 ? 0 : Math.min(...levels)
  }

  /** A corner arc joins two sidewalks; it sits on the lower of the two. */
  private cornerLevel(edgeA: string, edgeB: string): number {
    return Math.min(this.streets.edges.get(edgeA)?.level ?? 0, this.streets.edges.get(edgeB)?.level ?? 0)
  }

  private point(nodeId: string): V2 {
    const n = this.nodes[Number(nodeId.slice(1))]
    return [n.x, n.z]
  }
}
