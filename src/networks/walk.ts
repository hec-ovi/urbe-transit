import type { V2, V3 } from '../core/vec'
import { dist2, drop } from '../core/vec'
import { arcLengths, pointAt, projectArc } from '../core/polygon'
import type { AtlasBlueprint, Station } from '../types/atlas'
import type { Link, WalkEdge, WalkNode } from '../types/output'
import { StreetIndex, heading } from './street-util'
import type { SignalIndex } from './signals'
import { edgeLevelAtPoint, liftStreetPath } from './elevation'
import { ConnectionsError } from '../core/errors'
import { WalkGround } from './walk-ground'
import { WalkingApproaches } from './walk-approaches'
import { WalkingJunctions } from './walk-junctions'
import { WalkingReservations } from './walk-reservations'
import { JunctionReservations } from './junction-reservations'

const CORNER_WIDTH = 2
const CROSSING_WIDTH = 3
/** A crossing end farther than this from every corner stays unconnected (atlas guarantees closer). */
const SNAP_RANGE = 8
const STATION_ACCESS_WIDTH = 1.2
const PLATFORM_PATH_WIDTH = 2

interface SidewalkRun { edgeId: string; side: 'left' | 'right'; edge: WalkEdge }

/** Sidewalk graph: offset centerlines, corner arcs, signal-synced crossings, access and link edges. */
export class WalkBuilder {
  private readonly streets: StreetIndex
  private readonly nodes: WalkNode[] = []
  private readonly nodesById = new Map<string, WalkNode>()
  private readonly edges: WalkEdge[] = []
  /** Corner candidates per street node, with their bearing seen from the intersection. */
  private readonly corners = new Map<string, { nodeId: string; angle: number; edgeId: string }[]>()
  private readonly sidewalkRuns: SidewalkRun[] = []
  private readonly approaches: WalkingApproaches
  private readonly junctions?: WalkingJunctions
  private readonly crossingReservations: JunctionReservations

  constructor(
    private readonly atlas: AtlasBlueprint,
    private readonly signalIndex: SignalIndex,
    private readonly links: Link[],
  ) {
    this.streets = new StreetIndex(atlas)
    const ground = atlas.volumetric.ground ? new WalkGround(atlas.volumetric.ground) : undefined
    const reservations = new WalkingReservations(atlas.streets.construction?.planningReservations)
    this.crossingReservations = new JunctionReservations(atlas)
    this.approaches = new WalkingApproaches(this.streets, ground, reservations, this.crossingReservations)
    if (atlas.streets.edges.some((edge) => this.approaches.authored(edge))) this.junctions = new WalkingJunctions(this.streets, this.approaches, ground, reservations, this.crossingReservations)
  }

  build(): { nodes: WalkNode[]; edges: WalkEdge[] } {
    this.buildSidewalks()
    this.buildCornerArcs()
    this.buildCrossings()
    this.buildAccessPoints()
    this.buildLinkEdges()
    return { nodes: this.nodes, edges: this.edges }
  }

  private addNode(n: Omit<WalkNode, 'id'>, authoredId?: string): string {
    const id = authoredId ?? `w${this.nodes.length}`
    const node = { id, ...n }
    this.nodes.push(node)
    this.nodesById.set(id, node)
    return id
  }

  private addEdge(e: Omit<WalkEdge, 'id'>): WalkEdge {
    const edge = { id: `we${this.edges.length}`, ...e }
    this.edges.push(edge)
    return edge
  }

  private buildSidewalks(): void {
    for (const e of this.atlas.streets.edges) {
      if (this.junctions?.consumed.has(e.id)) continue
      for (const { side, width: sw, path: trimmed } of this.approaches.edge(e)) {
        if (trimmed.length < 2) continue
        const path3 = liftStreetPath(e, trimmed)
        const a = this.addNode({ x: trimmed[0][0], y: path3[0][1], z: trimmed[0][1], kind: 'corner' }, this.junctions?.port(e, side, e.from))
        const bIdx = trimmed.length - 1
        const b = this.addNode({ x: trimmed[bIdx][0], y: path3.at(-1)![1], z: trimmed[bIdx][1], kind: 'corner' }, this.junctions?.port(e, side, e.to))
        const edge = this.addEdge({ from: a, to: b, kind: 'sidewalk', width: sw, path: path3.map(drop), path3, level: Math.max(...path3.map((point) => point[1])), ...(this.approaches.authored(e) ? { edgeId: e.id, side } : {}) })
        if (this.approaches.authored(e)) this.sidewalkRuns.push({ edgeId: e.id, side, edge })
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
    if (this.junctions) {
      for (const connector of this.junctions.connect().connectors) {
        const edge = this.addEdge({ from: connector.from.id, to: connector.to.id, kind: 'sidewalk', width: connector.width, path3: connector.path3, path: connector.path3.map(drop), level: Math.max(...connector.path3.map((point) => point[1])) })
        for (const leg of connector.via) {
          const source = this.streets.edges.get(leg.edgeId)!
          this.sidewalkRuns.push({ edgeId: leg.edgeId, side: source.from === leg.fromNodeId ? 'right' : 'left', edge })
        }
      }
      return
    }
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
        const street = seg.edgeId ? this.streets.edges.get(seg.edgeId) : undefined
        const modern = street && this.approaches.authored(street)
        const a = modern ? this.authoredCrossingEnd(seg.from, c.nodeId, seg.edgeId!) : this.crossingEndNode(seg.from, c.nodeId)
        const b = modern ? this.authoredCrossingEnd(seg.to, c.nodeId, seg.edgeId!) : this.crossingEndNode(seg.to, c.nodeId)
        const signal = this.signalIndex.crossingRef.get(`${c.nodeId}:${i}`)
        const level = this.nodeLevel(c.nodeId)
        const path = (seg.edgeId && this.crossingReservations.crossingPath(c.nodeId, seg.edgeId)) || [seg.from, seg.to]
        this.addEdge({ from: a, to: b, kind: 'crossing', width: modern ? seg.width ?? CROSSING_WIDTH : CROSSING_WIDTH, path, path3: this.flatPath(path, level), level, ...(signal ? { signal } : {}) })
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

  /** Authored crossings keep their exact endpoints and attach to the named street, not another arm. */
  private authoredCrossingEnd(p: V2, streetNodeId: string, edgeId: string): string {
    const y = this.nodeLevel(streetNodeId)
    const id = this.addNode({ x: p[0], y, z: p[1], kind: 'crossing-end' })
    const landing = this.crossingReservations.landing(streetNodeId, edgeId, p)
    this.connectStreetAccess(id, [p[0], y, p[1]], edgeId, landing?.side, undefined, landing?.polygon)
    return id
  }

  /** Split a walking run at its projection so entries join the path without cutting a block corner. */
  private connectStreetAccess(fromId: string, point: V3, edgeId: string, side?: 'left' | 'right', prefix?: V3[], landing?: V2[]): void {
    let best: { run: SidewalkRun; arc: number; point: V2; distance: number; connection: V3[] } | null = null
    for (const run of this.sidewalkRuns) {
      if (run.edgeId !== edgeId || (side && run.side !== side)) continue
      const arcs = arcLengths(run.edge.path)
      const arc = projectArc(run.edge.path, arcs, drop(point))
      const projected = pointAt(run.edge.path, arcs, arc)
      const distance = dist2(projected, drop(point))
      if (best && distance >= best.distance - 1e-9) continue
      const street = this.streets.edges.get(edgeId)!
      const target: V3 = arc < 1e-7 ? run.edge.path3[0] : arcs.at(-1)! - arc < 1e-7 ? run.edge.path3.at(-1)! : [projected[0], edgeLevelAtPoint(street, projected), projected[1]]
      const connection = this.junctions?.access(point, target, Math.min(CORNER_WIDTH, run.edge.width), edgeId, landing)
      if (connection) best = { run, arc, point: projected, distance, connection }
    }
    if (!best) throw new ConnectionsError('E_ATLAS_INVALID', `access on ${edgeId} has no proved full-width walking connection`, `atlas.streets.edges.${edgeId}`)
    const run = best.run, edge = run.edge
    const arcs = arcLengths(edge.path), total = arcs.at(-1)!
    let target: string
    if (best.arc < 1e-7) target = edge.from
    else if (total - best.arc < 1e-7) target = edge.to
    else {
      const street = this.streets.edges.get(edgeId)!
      const y = edgeLevelAtPoint(street, best.point)
      const split: V3 = [best.point[0], y, best.point[1]]
      target = this.addNode({ x: split[0], y, z: split[2], kind: 'sidewalk' })
      const before = edge.path3.filter((_, i) => arcs[i] < best!.arc - 1e-7)
      const after = edge.path3.filter((_, i) => arcs[i] > best!.arc + 1e-7)
      const nextPath3 = [split, ...after]
      const next = this.addEdge({ from: target, to: edge.to, kind: 'sidewalk', width: edge.width, path3: nextPath3, path: nextPath3.map(drop), level: Math.max(...nextPath3.map((p) => p[1])), ...(edge.edgeId ? { edgeId: edge.edgeId, side: edge.side } : {}) })
      for (const alias of this.sidewalkRuns.filter((candidate) => candidate.edge === edge)) this.sidewalkRuns.push({ ...alias, edge: next })
      edge.to = target
      edge.path3 = [...before, split]
      edge.path = edge.path3.map(drop)
      edge.level = Math.max(...edge.path3.map((p) => p[1]))
    }
    const path3 = [...(prefix ?? [point])]
    const end = this.point3(target)
    const width = Math.min(CORNER_WIDTH, edge.width)
    if (dist2(drop(path3.at(-1)!), drop(end)) > 1e-7 || Math.abs(path3.at(-1)![1] - end[1]) > 1e-7) {
      path3.push(...best.connection.slice(1, -1), end)
    }
    else if (path3.length === 1) path3.push(end)
    this.addEdge({ from: fromId, to: target, kind: 'access', width, path3, path: path3.map(drop), level: Math.max(...path3.map((p) => p[1])) })
  }

  private buildAccessPoints(): void {
    for (const s of this.atlas.transit.busStops) {
      const edge = this.streets.edges.get(s.edgeId)!
      const y = edgeLevelAtPoint(edge, s.position)
      const id = this.addNode({ x: s.position[0], y, z: s.position[1], kind: 'stop', ref: s.id })
      if (this.approaches.authored(edge)) this.connectStreetAccess(id, [s.position[0], y, s.position[1]], s.edgeId)
      else this.connectNearest(id, [s.position[0], y, s.position[1]])
    }
    for (const st of [...this.atlas.transit.trainStations, ...this.atlas.transit.subwayStations]) {
      this.buildStationAccess(st)
    }
    for (const p of this.atlas.parcels) {
      const edge = this.streets.edges.get(p.access.edgeId)!
      const y = edgeLevelAtPoint(edge, p.access.point)
      const id = this.addNode({ x: p.access.point[0], y, z: p.access.point[1], kind: 'entry', ref: p.id })
      if (this.approaches.authored(edge)) this.connectStreetAccess(id, [p.access.point[0], y, p.access.point[1]], p.access.edgeId)
      else this.connectNearest(id, [p.access.point[0], y, p.access.point[1]])
    }
  }

  /** Access edge to the nearest sidewalk-side node; prefix is prepended to the edge path. */
  private connectNearest(fromId: string, p: V3, prefix?: V3[]): void {
    let modern: { edgeId: string; distance: number } | undefined
    for (const run of this.sidewalkRuns) {
      const arcs = arcLengths(run.edge.path)
      const point = pointAt(run.edge.path, arcs, projectArc(run.edge.path, arcs, drop(p)))
      const street = this.streets.edges.get(run.edgeId)!
      if (Math.abs(edgeLevelAtPoint(street, point) - p[1]) > 1e-6) continue
      const distance = dist2(point, drop(p))
      if (!modern || distance < modern.distance - 1e-9) modern = { edgeId: run.edgeId, distance }
    }
    if (modern) {
      this.connectStreetAccess(fromId, p, modern.edgeId, undefined, prefix)
      return
    }
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
      const bay = station.entranceBays?.[access.entranceIndex]
      if (bay) {
        const path: V3[] = [...bay.approach].reverse().map((p) => [p[0], first[1], p[1]])
        this.connectStreetAccess(current, path.at(-1)!, bay.edgeId, bay.side, path)
      } else this.connectNearest(current, first)
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
    const n = this.nodesById.get(nodeId)!
    return [n.x, n.z]
  }

  private point3(nodeId: string): V3 {
    const n = this.nodesById.get(nodeId)!
    return [n.x, n.y, n.z]
  }

  private flatPath(path: V2[], level: number): V3[] {
    return path.map((point) => [point[0], level, point[1]])
  }
}
