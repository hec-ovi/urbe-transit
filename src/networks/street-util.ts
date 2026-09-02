import type { V2 } from '../core/vec'
import { norm2, sub2 } from '../core/vec'
import type { AtlasBlueprint, StreetEdge, StreetNode } from '../types/atlas'
import { edgeLevelAtNode } from './elevation'

/** Index of the street graph plus per-node intersection setback. */
export class StreetIndex {
  readonly nodes = new Map<string, StreetNode>()
  readonly edges = new Map<string, StreetEdge>()

  constructor(atlas: AtlasBlueprint) {
    for (const n of atlas.streets.nodes) this.nodes.set(n.id, n)
    for (const e of atlas.streets.edges) this.edges.set(e.id, e)
  }

  /** How far geometry pulls back from a node center: half the widest incident street plus clearance. */
  setback(nodeId: string): number {
    const n = this.nodes.get(nodeId)!
    let w = 0
    for (const eid of n.edgeIds) w = Math.max(w, this.edges.get(eid)?.width ?? 0)
    return w / 2 + 1.5
  }

  /** Unit direction of an edge leaving the given node. */
  dirFrom(edge: StreetEdge, nodeId: string): V2 {
    if (edge.from === nodeId) return norm2(sub2(edge.path[1], edge.path[0]))
    const n = edge.path.length
    return norm2(sub2(edge.path[n - 2], edge.path[n - 1]))
  }

  /** Atlas-authoritative transfer group carrying an edge at one endpoint. */
  connection(nodeId: string, edgeId: string): { level: number; edgeIds: string[] } {
    const node = this.nodes.get(nodeId)!
    return node.connections.find((group) => group.edgeIds.includes(edgeId))!
  }

  /** Whether two edges physically meet at this node. */
  connects(nodeId: string, edgeA: string, edgeB: string): boolean {
    const group = this.connection(nodeId, edgeA)
    return group.edgeIds.includes(edgeB)
  }

  /** Exact endpoint height, checked against the node connection during atlas validation. */
  endpointLevel(nodeId: string, edgeId: string): number {
    return edgeLevelAtNode(this.edges.get(edgeId)!, nodeId)
  }

  /** Lowest connection group, where crossings and grade access live. */
  groundConnection(nodeId: string): { level: number; edgeIds: string[] } {
    const groups = this.nodes.get(nodeId)!.connections
    return groups.reduce((lowest, group) => group.level < lowest.level ? group : lowest)
  }
}

/** Heading angle in degrees on the ground plane. */
export function heading(dir: V2): number {
  return (Math.atan2(dir[1], dir[0]) * 180) / Math.PI
}

/** Wrap a degree difference to (-180, 180]. */
export function wrap180(deg: number): number {
  let d = deg % 360
  if (d <= -180) d += 360
  if (d > 180) d -= 360
  return d
}
