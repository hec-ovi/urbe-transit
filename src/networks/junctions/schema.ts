export type Point = [number, number]
export type Position = [number, number, number]
export type JunctionErrorCode = 'E_JUNCTION_INPUT' | 'E_JUNCTION_UNRESOLVED'

export class JunctionTopologyError extends Error {
  constructor(readonly code: JunctionErrorCode, message: string, readonly path: string) {
    super(message)
    this.name = 'JunctionTopologyError'
  }
}

export interface JunctionEndpoint {
  edgeId: string
  nodeId: string
  groupId: string
  tangent: Point
  clearance: number
  /** Relative to the direction away from this node. */
  ports: { left: string | null; right: string | null }
}

export interface JunctionEdge {
  id: string
  from: string
  to: string
  length: number
}

export interface JunctionInput {
  nodes: { id: string }[]
  edges: JunctionEdge[]
  endpoints: JunctionEndpoint[]
}

export interface ArmRef {
  edgeId: string
  nodeId: string
  groupId: string
}

export interface BoundaryTraversal {
  edgeId: string
  fromNodeId: string
  toNodeId: string
  fromGroupId: string
  toGroupId: string
}

export interface WalkingPort {
  id: string
  arm: ArmRef
  side: 'left' | 'right'
}

export interface JunctionConnection {
  id: string
  from: WalkingPort
  to: WalkingPort
  via: BoundaryTraversal[]
}

export interface BoundaryStep {
  from: ArmRef
  to: ArmRef
  via: BoundaryTraversal[]
  /** Null at an open terminal or when either incident side has no walking port. */
  connection: JunctionConnection | null
}

export interface JunctionComplex {
  id: string
  groupIds: string[]
  nodeIds: string[]
  edgeIds: string[]
  internalEdgeIds: string[]
  boundaries: BoundaryStep[][]
  closedBoundaries: BoundaryTraversal[][]
}

export interface JunctionTopology { complexes: JunctionComplex[] }

export interface JunctionPort { position: Position; width: number }

export interface JunctionRouteRequest {
  fromPortId: string
  toPortId: string
  width: number
  complex: { nodeIds: string[]; edgeIds: string[] }
  internalEdgeIds: string[]
  via: BoundaryTraversal[]
}

export interface JunctionRoutingInput extends JunctionInput {
  ports: Readonly<Record<string, JunctionPort>>
  maximumConnectorWidth: number
  /** Returns a proved full-width route on authored paving, outside roadway. */
  route(request: JunctionRouteRequest): Position[] | null
}

export interface ResolvedJunctionConnection extends JunctionConnection {
  width: number
  path3: Position[]
  complexId: string
}

export interface ConnectedJunctions extends JunctionTopology {
  connectors: ResolvedJunctionConnection[]
}
