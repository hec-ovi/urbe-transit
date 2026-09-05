import { armKey, compare, EndpointGraph } from './EndpointGraph'

/** Only a real consumed edge joins two original transfer groups. */
export class Components {
  readonly internal = new Set<string>()
  readonly groups = new Map<string, string[]>()

  constructor(graph: EndpointGraph) {
    const parents = new Map([...graph.groups.keys()].map(id => [id, id]))
    const root = (id: string): string => {
      let current = id
      while (parents.get(current) !== current) current = parents.get(current)!
      while (id !== current) {
        const next = parents.get(id)!
        parents.set(id, current)
        id = next
      }
      return current
    }
    for (const arm of graph.arms.values()) {
      const other = graph.arms.get(graph.twin.get(armKey(arm))!)!
      const edge = graph.edges.get(arm.edgeId)!
      if (arm.clearance + other.clearance < edge.length - 0.001) continue
      this.internal.add(edge.id)
      const a = root(arm.groupId), b = root(other.groupId)
      if (a !== b) parents.set(compare(a, b) < 0 ? b : a, compare(a, b) < 0 ? a : b)
    }
    for (const id of [...graph.groups.keys()].sort(compare)) {
      const group = this.groups.get(root(id)) ?? []
      group.push(id)
      this.groups.set(root(id), group)
    }
  }
}
