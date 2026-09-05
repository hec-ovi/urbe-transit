import { JunctionTopologyError } from './schema'
import type { ArmRef, JunctionEdge, JunctionEndpoint, JunctionInput } from './schema'

export const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0
export const armKey = (arm: ArmRef): string => JSON.stringify([arm.groupId, arm.edgeId])

export class EndpointGraph {
  readonly edges = new Map<string, JunctionEdge>()
  readonly arms = new Map<string, JunctionEndpoint>()
  readonly groups = new Map<string, JunctionEndpoint[]>()
  readonly twin = new Map<string, string>()
  readonly next = new Map<string, string>()

  constructor(input: JunctionInput) {
    const invalid = (message: string, path: string): never => {
      throw new JunctionTopologyError('E_JUNCTION_INPUT', message, path)
    }
    if (!input || !Array.isArray(input.nodes) || !Array.isArray(input.edges) || !Array.isArray(input.endpoints)) {
      invalid('Nodes, edges and endpoints must be arrays', 'input')
    }
    const nodes = new Set<string>()
    for (const [i, node] of input.nodes.entries()) {
      if (!node || typeof node.id !== 'string' || !node.id || nodes.has(node.id)) invalid('Node IDs must be unique and nonempty', `nodes[${i}]`)
      nodes.add(node.id)
    }
    for (const [i, edge] of input.edges.entries()) {
      if (!edge || typeof edge.id !== 'string' || !edge.id || this.edges.has(edge.id)) invalid('Edge IDs must be unique and nonempty', `edges[${i}]`)
      if (!nodes.has(edge.from) || !nodes.has(edge.to) || edge.from === edge.to) {
        invalid('Edge endpoints must name two distinct nodes', `edges[${i}]`)
      }
      if (!Number.isFinite(edge.length) || edge.length <= 0) invalid('Edge length must be positive', `edges[${i}]`)
      this.edges.set(edge.id, edge)
    }
    const edgeArms = new Map<string, JunctionEndpoint[]>()
    for (const [i, arm] of input.endpoints.entries()) {
      if (!arm) invalid('An endpoint must be a record', `endpoints[${i}]`)
      const edge = this.edges.get(arm.edgeId)
      const path = `endpoints[${i}]`
      if (!edge || arm.nodeId !== edge.from && arm.nodeId !== edge.to) invalid('Endpoint is not incident to its edge', path)
      if (typeof arm.groupId !== 'string' || !arm.groupId) invalid('Connection group ID is required', path)
      if (!Number.isFinite(arm.clearance) || arm.clearance < 0) invalid('Clearance must be nonnegative', path)
      if (!Array.isArray(arm.tangent) || arm.tangent.length !== 2 || !arm.tangent.every(Number.isFinite) || Math.hypot(...arm.tangent) === 0) {
        invalid('Outward tangent must be finite and nonzero', path)
      }
      if (!arm.ports || !['left', 'right'].every(side => {
        const port = arm.ports[side as 'left' | 'right']
        return port === null || typeof port === 'string' && port.length > 0
      })) invalid('Ports must be nonempty IDs or null', path)
      const key = armKey(arm)
      if (this.arms.has(key)) invalid('An edge occurs twice in one group', path)
      const group = this.groups.get(arm.groupId) ?? []
      if (group.length && group[0].nodeId !== arm.nodeId) invalid('A group belongs to one node', path)
      group.push(arm)
      this.groups.set(arm.groupId, group)
      this.arms.set(key, arm)
      const incident = edgeArms.get(arm.edgeId) ?? []
      if (incident.some(other => other.nodeId === arm.nodeId)) invalid('An endpoint belongs to exactly one group', path)
      incident.push(arm)
      edgeArms.set(arm.edgeId, incident)
    }
    for (const edge of this.edges.values()) {
      const pair = edgeArms.get(edge.id)
      if (!pair || pair.length !== 2) invalid('Every edge needs exactly two endpoints', `edges.${edge.id}`)
      this.twin.set(armKey(pair![0]), armKey(pair![1]))
      this.twin.set(armKey(pair![1]), armKey(pair![0]))
    }
    for (const arms of this.groups.values()) {
      arms.sort((a, b) => Math.atan2(a.tangent[1], a.tangent[0]) - Math.atan2(b.tangent[1], b.tangent[0]) || compare(a.edgeId, b.edgeId))
      for (let i = 0; i < arms.length; i++) this.next.set(armKey(arms[i]), armKey(arms[(i + 1) % arms.length]))
    }
  }

  ref(key: string): ArmRef {
    const { edgeId, nodeId, groupId } = this.arms.get(key)!
    return { edgeId, nodeId, groupId }
  }
}
