import { armKey, compare, EndpointGraph } from './EndpointGraph'
import type { Components } from './Components'
import type { BoundaryStep, BoundaryTraversal, JunctionComplex } from './schema'

/** Traverses the boundary of the graph ribbon, retaining each internal edge side. */
export class BoundaryWalker {
  constructor(private readonly graph: EndpointGraph, private readonly components: Components) {}

  complex(groupIds: string[]): JunctionComplex {
    const graph = this.graph
    const arms = groupIds.flatMap(id => graph.groups.get(id)!).map(armKey).sort(compare)
    const edgeIds = [...new Set(arms.map(key => graph.arms.get(key)!.edgeId))].sort(compare)
    const isInternal = (key: string): boolean => this.components.internal.has(graph.arms.get(key)!.edgeId)
    const external = arms.filter(key => !isInternal(key))
    const visited = new Set<string>()
    const internalVisited = new Set<string>()
    const boundaries: BoundaryStep[][] = []
    for (const start of external) {
      if (visited.has(start)) continue
      const boundary: BoundaryStep[] = []
      let from = start
      do {
        visited.add(from)
        let to = graph.next.get(from)!
        const via: BoundaryTraversal[] = []
        while (isInternal(to)) {
          internalVisited.add(to)
          via.push(this.traverse(to))
          to = graph.next.get(graph.twin.get(to)!)!
        }
        const fromRef = graph.ref(from), toRef = graph.ref(to)
        const fromPort = graph.arms.get(from)!.ports.left
        const toPort = graph.arms.get(to)!.ports.right
        boundary.push({
          from: fromRef, to: toRef, via,
          connection: fromPort !== null && toPort !== null && (from !== to || via.length > 0) ? {
            id: `jc:${JSON.stringify([from, to])}`,
            from: { id: fromPort, arm: fromRef, side: 'left' },
            to: { id: toPort, arm: toRef, side: 'right' },
            via,
          } : null,
        })
        from = to
      } while (from !== start)
      boundaries.push(boundary)
    }
    const closedBoundaries: BoundaryTraversal[][] = []
    for (const start of arms.filter(isInternal)) {
      if (internalVisited.has(start)) continue
      const boundary: BoundaryTraversal[] = []
      let cursor = start
      do {
        internalVisited.add(cursor)
        boundary.push(this.traverse(cursor))
        cursor = graph.next.get(graph.twin.get(cursor)!)!
      } while (cursor !== start)
      closedBoundaries.push(boundary)
    }
    return {
      id: `jx:${JSON.stringify(groupIds)}`,
      groupIds: [...groupIds],
      nodeIds: [...new Set(groupIds.map(id => graph.groups.get(id)![0].nodeId))].sort(compare),
      edgeIds,
      internalEdgeIds: edgeIds.filter(id => this.components.internal.has(id)),
      boundaries,
      closedBoundaries,
    }
  }

  private traverse(key: string): BoundaryTraversal {
    const from = this.graph.arms.get(key)!, to = this.graph.arms.get(this.graph.twin.get(key)!)!
    return {
      edgeId: from.edgeId,
      fromNodeId: from.nodeId, toNodeId: to.nodeId,
      fromGroupId: from.groupId, toGroupId: to.groupId,
    }
  }
}
