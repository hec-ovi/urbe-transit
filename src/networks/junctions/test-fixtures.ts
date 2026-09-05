import type { JunctionInput, JunctionPort, Point } from './schema'

export function graphFixture(
  nodes: Record<string, Point>,
  links: { id: string; from: string; to: string; clearance?: number; path?: Point[]; groups?: [string, string]; walking?: boolean }[],
): JunctionInput {
  return {
    nodes: Object.keys(nodes).map(id => ({ id })),
    edges: links.map(link => {
      const path = link.path ?? [nodes[link.from], nodes[link.to]]
      return { id: link.id, from: link.from, to: link.to,
        length: path.slice(1).reduce((sum, point, i) => sum + Math.hypot(point[0] - path[i][0], point[1] - path[i][1]), 0) }
    }),
    endpoints: links.flatMap(link => {
      const path = link.path ?? [nodes[link.from], nodes[link.to]]
      return ([0, 1] as const).map(end => {
        const nodeId = end === 0 ? link.from : link.to
        const [a, b] = end === 0 ? [path[0], path[1]] : [path.at(-1)!, path.at(-2)!]
        return { edgeId: link.id, nodeId, groupId: link.groups?.[end] ?? nodeId,
          tangent: [b[0] - a[0], b[1] - a[1]] as Point, clearance: link.clearance ?? 6,
          ports: link.walking === false ? { left: null, right: null } : { left: `${nodeId}/${link.id}/L`, right: `${nodeId}/${link.id}/R` } }
      })
    }),
  }
}

export function fixturePorts(input: JunctionInput): Record<string, JunctionPort> {
  return Object.fromEntries(input.endpoints.flatMap((endpoint, i) =>
    ([endpoint.ports.left, endpoint.ports.right] as const).flatMap((id, side) =>
      id === null ? [] : [[id, { position: [i * 3, 0.15, side * 2], width: side ? 3.5 : 2.5 }]])))
}

/** Generated Atlas street fragment, seed urbe, size 1000. */
export function atlasN103(): JunctionInput {
  const nodes: Record<string, Point> = {
    n103: [725.771, 167.085], n104: [726.284, 178.633], n105: [726.699, 232.378],
    n113: [792.282, 206.559], n93: [685.17, 169.117], n98: [701.824, 168.284],
  }
  return graphFixture(nodes, [
    { id: 'e8', from: 'n104', to: 'n103', groups: ['n104:grade', 'n103:grade'] },
    { id: 'e9', from: 'n105', to: 'n104', groups: ['n105:grade', 'n104:grade'], path: [nodes.n105, [727.895, 214.973], nodes.n104] },
    { id: 'e29', from: 'n103', to: 'n113', groups: ['n103:grade', 'n113:grade'], path: [nodes.n103, [755.027, 165.621], nodes.n113] },
    { id: 'e207', from: 'n103', to: 'n93', groups: ['n103:grade', 'n93:grade'], path: [nodes.n103, [724.795, 145.066], nodes.n93] },
    { id: 'e214', from: 'n98', to: 'n103', groups: ['n98:grade', 'n103:grade'] },
    { id: 'e10', from: 'n104', to: 'n98', groups: ['n104:deck', 'n98:deck'], walking: false },
    { id: 'e30', from: 'n113', to: 'n104', groups: ['n113:grade', 'n104:deck'], walking: false },
  ])
}
