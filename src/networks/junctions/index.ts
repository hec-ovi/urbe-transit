import { BoundaryWalker } from './BoundaryWalker'
import { Components } from './Components'
import { compare, EndpointGraph } from './EndpointGraph'
import { JunctionTopologyError } from './schema'
import type { ConnectedJunctions, JunctionInput, JunctionRoutingInput, JunctionTopology, Position } from './schema'

export type * from './schema'
export { JunctionTopologyError } from './schema'

export function buildJunctionTopology(input: JunctionInput): JunctionTopology {
  const graph = new EndpointGraph(input)
  const components = new Components(graph)
  const walker = new BoundaryWalker(graph, components)
  return { complexes: [...components.groups.values()]
    .sort((a, b) => compare(a[0], b[0]))
    .map(groups => walker.complex(groups)) }
}

const finitePosition = (point: Position): boolean => Array.isArray(point) && point.length === 3 && point.every(Number.isFinite)
const equalPosition = (a: Position, b: Position): boolean => a.every((value, i) => value === b[i])

export function connectJunctions(input: JunctionRoutingInput): ConnectedJunctions {
  if (!input || !Number.isFinite(input.maximumConnectorWidth) || input.maximumConnectorWidth <= 0 || typeof input.route !== 'function'
    || !input.ports || typeof input.ports !== 'object' || Array.isArray(input.ports)) {
    throw new JunctionTopologyError('E_JUNCTION_INPUT', 'A positive connector width and route callback are required', 'routing')
  }
  const topology = buildJunctionTopology(input)
  for (const [id, port] of Object.entries(input.ports)) {
    if (!id || !port || !finitePosition(port.position) || !Number.isFinite(port.width) || port.width <= 0) {
      throw new JunctionTopologyError('E_JUNCTION_INPUT', 'Ports need finite positions and positive widths', `ports.${id}`)
    }
  }
  for (const endpoint of input.endpoints) {
    for (const id of [endpoint.ports.left, endpoint.ports.right]) {
      if (id !== null && !Object.hasOwn(input.ports, id)) {
        throw new JunctionTopologyError('E_JUNCTION_INPUT', 'Referenced walking port is absent', `ports.${id}`)
      }
    }
  }
  const connectors: ConnectedJunctions['connectors'] = []
  for (const complex of topology.complexes) {
    const hasWalkingPorts = input.endpoints.some(endpoint => complex.groupIds.includes(endpoint.groupId)
      && (endpoint.ports.left !== null || endpoint.ports.right !== null))
    if (!complex.boundaries.length && hasWalkingPorts) {
      throw new JunctionTopologyError('E_JUNCTION_UNRESOLVED', 'Consumed component has no external walking attachment', complex.id)
    }
    const closedWalkingBoundary = complex.closedBoundaries.some(boundary => boundary.some(leg => input.endpoints.some(endpoint =>
      endpoint.edgeId === leg.edgeId && (endpoint.groupId === leg.fromGroupId && endpoint.ports.right !== null
        || endpoint.groupId === leg.toGroupId && endpoint.ports.left !== null))))
    if (closedWalkingBoundary) {
      throw new JunctionTopologyError('E_JUNCTION_UNRESOLVED', 'Closed internal walking boundary needs an explicit attachment', complex.id)
    }
    for (const step of complex.boundaries.flat()) {
      const connection = step.connection
      if (!connection) continue
      const from = connection && input.ports[connection.from.id]
      const to = connection && input.ports[connection.to.id]
      if (!from || !to) throw new JunctionTopologyError('E_JUNCTION_INPUT', 'Referenced walking port is absent', connection.id)
      const width = Math.min(input.maximumConnectorWidth, from.width, to.width)
      const path3 = input.route({
        fromPortId: connection.from.id, toPortId: connection.to.id, width,
        complex: { nodeIds: [...complex.nodeIds], edgeIds: [...complex.edgeIds] },
        internalEdgeIds: [...complex.internalEdgeIds],
        via: connection.via.map(leg => ({ ...leg })),
      })
      if (!path3 || path3.length < 2 || !path3.every(finitePosition)
        || !equalPosition(path3[0], from.position) || !equalPosition(path3.at(-1)!, to.position)) {
        throw new JunctionTopologyError('E_JUNCTION_UNRESOLVED', 'No full-width route preserves both walking ports', connection.id)
      }
      connectors.push({ ...connection, complexId: complex.id, width, path3: path3.map(point => [...point]) })
    }
  }
  return { ...topology, connectors }
}
