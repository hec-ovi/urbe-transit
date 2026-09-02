import type { V2, V3 } from '../core/vec'
import { dist2, drop } from '../core/vec'
import { offsetPolyline, trimPolyline } from '../core/polygon'
import type { AtlasBlueprint, Station } from '../types/atlas'
import type { Link, WalkEdge, WalkNode } from '../types/output'
import { StreetIndex, heading } from './street-util'
import type { SignalIndex } from './signals'
import { edgeLevelAtPoint, liftStreetPath } from './elevation'

const CORNER_WIDTH = 2
const CROSSING_WIDTH = 3
/** A crossing end farther than this from every corner stays unconnected (atlas guarantees closer). */
const SNAP_RANGE = 8
const STATION_ACCESS_WIDTH = 1.2
const PLATFORM_PATH_WIDTH = 2

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
        const path3 = liftStreetPath(e, trimmed)
        const a = this.addNode({ x: trimmed[0][0], y: path3[0][1], z: trimmed[0][1], kind: 'corner' })
        const bIdx = trimmed.length - 1
        const b = this.addNode({ x: trimmed[bIdx][0], y: path3.at(-1)![1], z: trimmed[bIdx][1], kind: 'corner' })
        this.addEdge({ from: a, to: b, kind: 'sidewalk', width: sw, path: path3.map(drop), path3, level: Math.max(...path3.map((point) => point[1])) })
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
    for (const [streetNodeId, list] of [...this.corners.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const groups = this.streets.nodes.get(streetNodeId)!.connections
      for (const group of groups) {
        const sameSurface = list.filter((corner) => group.edgeIds.includes(corner.edgeId))
        if (sameSurface.length < 2) continue
        const sorted = [...sameSurface].sort((x, y) => x.angle - y.angle || x.nodeId.localeCompare(y.nodeId))
        for (let i = 0; i < sorted.length; i++) {
          const a = sorted[i]
          const b = sorted[(i + 1) % sorted.length]
          if (a.edgeId === b.edgeId || a.nodeId === b.nodeId) continue
          const pa = this.point(a.nodeId)
          const pb = this.point(b.nodeId)
          const path3 = [this.point3(a.nodeId), this.point3(b.nodeId)]
          this.addEdge({ from: a.nodeId, to: b.nodeId, kind: 'sidewalk', width: CORNER_WIDTH, path: [pa, pb], path3, level: Math.max(...path3.map((point) => point[1])) })
        }
      }
    }
  }

  private buildCrossings(): void {
    for (const c of this.atlas.streets.crossings) {
      c.segments.forEach((seg, i) => {
        const a = this.crossingEndNode(seg.from, c.nodeId)
        const b = this.crossingEndNode(seg.to, c.nodeId)
        const signal = this.signalIndex.crossingRef.get(`${c.nodeId}:${i}`)
        const level = this.nodeLevel(c.nodeId)
        this.addEdge({ from: a, to: b, kind: 'crossing', width: CROSSING_WIDTH, path: [seg.from, seg.to], path3: this.flatPath([seg.from, seg.to], level), level, ...(signal ? { signal } : {}) })
      })
    }
  }

  /** A coincident corner is reused; otherwise a new end node, tied to the nearest corner. */
  private crossingEndNode(p: V2, streetNodeId: string): string {
    const ground = this.streets.groundConnection(streetNodeId)
    const list = (this.corners.get(streetNodeId) ?? []).filter((corner) => ground.edgeIds.includes(corner.edgeId))
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
    const level = ground.level
    const id = this.addNode({ x: p[0], y: level, z: p[1], kind: 'crossing-end' })
    if (best) {
      const path3 = [[p[0], level, p[1]], this.point3(best)] as V3[]
      this.addEdge({ from: id, to: best, kind: 'sidewalk', width: CORNER_WIDTH, path: [p, this.point(best)], path3, level: Math.max(...path3.map((point) => point[1])) })
    }
    return id
  }

  private buildAccessPoints(): void {
    for (const s of this.atlas.transit.busStops) {
      const edge = this.streets.edges.get(s.edgeId)!
      const y = edgeLevelAtPoint(edge, s.position)
      const id = this.addNode({ x: s.position[0], y, z: s.position[1], kind: 'stop', ref: s.id })
      this.connectNearest(id, [s.position[0], y, s.position[1]])
    }
    for (const st of [...this.atlas.transit.trainStations, ...this.atlas.transit.subwayStations]) {
      this.buildStationAccess(st)
    }
    for (const p of this.atlas.parcels) {
      const edge = this.streets.edges.get(p.access.edgeId)!
      const y = edgeLevelAtPoint(edge, p.access.point)
      const id = this.addNode({ x: p.access.point[0], y, z: p.access.point[1], kind: 'entry', ref: p.id })
      this.connectNearest(id, [p.access.point[0], y, p.access.point[1]])
    }
  }

  /** Access edge to the nearest sidewalk-side node; prefix is prepended to the edge path. */
  private connectNearest(fromId: string, p: V3, prefix?: V3[]): void {
    let best: WalkNode | null = null
    let bestD = Infinity
    for (const n of this.nodes) {
      if (n.kind !== 'corner' && n.kind !== 'crossing-end') continue
      const d = dist2([p[0], p[2]], [n.x, n.z])
      if (d < bestD - 1e-9) {
        bestD = d
        best = n
      }
    }
    if (!best) return
    const path3 = [...(prefix ?? [p]), [best.x, best.y, best.z] as V3]
    this.addEdge({
      from: fromId,
      to: best.id,
      kind: 'access',
      width: CORNER_WIDTH,
      path: path3.map(drop),
      path3,
      level: Math.max(...path3.map((point) => point[1])),
    })
  }

  /** Exact atlas station routes: sidewalk entrance, stairs/passage, then platform center. */
  private buildStationAccess(station: Station): void {
    const center3: V3 = [station.position[0], station.level, station.position[1]]
    const center = this.addNode({ x: center3[0], y: center3[1], z: center3[2], kind: 'station', ref: station.id })
    if (station.accessPaths.length === 0) {
      for (const entrance of station.entrances) {
        const p: V3 = [entrance[0], station.level, entrance[1]]
        const entranceNode = this.addNode({ x: p[0], y: p[1], z: p[2], kind: 'station-entrance', ref: station.id })
        this.connectNearest(entranceNode, p)
        this.addEdge({ from: entranceNode, to: center, kind: 'platform', width: PLATFORM_PATH_WIDTH, path: [drop(p), drop(center3)], path3: [p, center3], level: station.level, stationId: station.id })
      }
      if (station.entrances.length === 0) this.connectNearest(center, center3)
      return
    }

    for (const access of [...station.accessPaths].sort((a, b) => a.entranceIndex - b.entranceIndex)) {
      const first = access.segments[0].path[0]
      let current = this.addNode({ x: first[0], y: first[1], z: first[2], kind: 'station-entrance', ref: station.id })
      this.connectNearest(current, first)
      access.segments.forEach((segment, segmentIndex) => {
        const end = segment.path.at(-1)!
        const last = segmentIndex === access.segments.length - 1
        const next = this.addNode({
          x: end[0], y: end[1], z: end[2],
          kind: last ? 'station-handoff' : 'station-access',
          ref: station.id,
        })
        this.addEdge({
          from: current,
          to: next,
          kind: segment.kind,
          width: STATION_ACCESS_WIDTH,
          path: segment.path.map(drop),
          path3: segment.path,
          level: Math.max(...segment.path.map((point) => point[1])),
          stationId: station.id,
          accessIndex: access.entranceIndex,
        })
        current = next
      })
      this.addEdge({
        from: current,
        to: center,
        kind: 'platform',
        width: PLATFORM_PATH_WIDTH,
        path: [drop(access.platformHandoff), drop(center3)],
        path3: [access.platformHandoff, center3],
        level: station.level,
        stationId: station.id,
        accessIndex: access.entranceIndex,
      })
    }
  }

  /** Walkable inter-building links join the graph as portal-to-portal edges. */
  private buildLinkEdges(): void {
    for (const link of this.links) {
      if (!link.walkable.over && !link.walkable.inside) continue
      const a2 = drop(link.path[0])
      const b2 = drop(link.path[link.path.length - 1])
      const verticalOffset = link.walkable.inside ? -link.crossSection.height / 2 : link.crossSection.height / 2
      const path3 = link.path.map((point): V3 => [point[0], point[1] + verticalOffset, point[2]])
      const a = this.addNode({ x: a2[0], y: path3[0][1], z: a2[1], kind: 'link-portal', ref: link.id })
      const b = this.addNode({ x: b2[0], y: path3.at(-1)![1], z: b2[1], kind: 'link-portal', ref: link.id })
      this.addEdge({
        from: a, to: b, kind: 'link', width: link.crossSection.width,
        path: link.path.map(drop), path3, linkId: link.id,
        level: Math.max(...path3.map((point) => point[1])),
      })
    }
  }

  /** Walking level at a street node: the lowest street meeting there, the one at grade. */
  private nodeLevel(streetNodeId: string): number {
    const n = this.streets.nodes.get(streetNodeId)
    if (!n) return 0
    return n.connections.length === 0 ? 0 : this.streets.groundConnection(streetNodeId).level
  }

  private point(nodeId: string): V2 {
    const n = this.nodes[Number(nodeId.slice(1))]
    return [n.x, n.z]
  }

  private point3(nodeId: string): V3 {
    const n = this.nodes[Number(nodeId.slice(1))]
    return [n.x, n.y, n.z]
  }

  private flatPath(path: V2[], level: number): V3[] {
    return path.map((point) => [point[0], level, point[1]])
  }
}
