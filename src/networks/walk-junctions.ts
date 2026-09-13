import { arcLengths } from '../core/polygon'
import { dist2, drop } from '../core/vec'
import { ConnectionsError } from '../core/errors'
import type { StreetEdge, Vec2, Vec3 } from '../types/atlas'
import { liftStreetPath } from './elevation'
import { buildJunctionTopology, connectJunctions, JunctionTopologyError } from './junctions'
import type { ConnectedJunctions, JunctionInput, JunctionPort, JunctionRouteRequest } from './junctions'
import { lineIntersection } from './offset'
import type { StreetIndex } from './street-util'
import type { WalkingApproaches } from './walk-approaches'
import type { WalkGround } from './walk-ground'
import { WalkRegion } from './walk-region'
import type { WalkingReservations } from './walk-reservations'
import type { JunctionReservations } from './junction-reservations'

/** Adapter between original Atlas movement identities and contracted pedestrian junction regions. */
export class WalkingJunctions {
  readonly consumed = new Set<string>()
  private readonly ports: Record<string, JunctionPort> = {}
  private readonly input: JunctionInput
  private unresolved?: { message: string; path: string }

  constructor(private readonly streets: StreetIndex, approaches: WalkingApproaches, private readonly ground?: WalkGround, private readonly reservations?: WalkingReservations, junctions?: JunctionReservations) {
    const edges = [...streets.edges.values()]
    for (const edge of edges) for (const approach of approaches.edge(edge)) {
      const path3 = liftStreetPath(edge, approach.path.length >= 2 ? approach.path : approach.endpoints)
      this.ports[this.port(edge, approach.side, edge.from)] = { position: path3[0], width: approach.width }
      this.ports[this.port(edge, approach.side, edge.to)] = { position: path3.at(-1)!, width: approach.width }
    }
    this.input = {
      nodes: [...streets.nodes.values()].map(({ id }) => ({ id })),
      edges: edges.map((edge) => ({ id: edge.id, from: edge.from, to: edge.to, length: arcLengths(edge.path).at(-1)! })),
      endpoints: edges.flatMap((edge) => [edge.from, edge.to].map((nodeId) => {
        const group = streets.connection(nodeId, edge.id)
        const left = this.port(edge, nodeId === edge.from ? 'left' : 'right', nodeId)
        const right = this.port(edge, nodeId === edge.from ? 'right' : 'left', nodeId)
        return { edgeId: edge.id, nodeId, groupId: junctions?.group(nodeId, edge.id) ?? JSON.stringify([nodeId, [...group.edgeIds].sort()]), tangent: streets.dirFrom(edge, nodeId), clearance: approaches.clearance(edge.id, nodeId), ports: { left: this.ports[left] ? left : null, right: this.ports[right] ? right : null } }
      })),
    }
    try {
      for (const complex of buildJunctionTopology(this.input).complexes) for (const id of complex.internalEdgeIds) this.consumed.add(id)
      for (const edge of edges) if (!this.consumed.has(edge.id)) for (const approach of approaches.edge(edge)) {
        if (approach.path.length < 2) throw new ConnectionsError('E_ATLAS_INVALID', `street ${edge.id} has no full-width walking run`, `atlas.streets.edges.${edge.id}`)
        if (reservations && !reservations.covers(edge.id, approach.side, approach.path, approach.width)) {
          throw new ConnectionsError('E_ATLAS_INVALID', `street ${edge.id} ${approach.side} walking strip leaves its planning reservation`, `atlas.streets.edges.${edge.id}`)
        }
        if (approaches.authored(edge) && edge.level === 0 && ground && !ground.covers(approach.path, approach.width)) {
          throw new ConnectionsError('E_ATLAS_INVALID', `street ${edge.id} ${approach.side} walking strip leaves authored paving`, `atlas.streets.edges.${edge.id}`)
        }
      }
    } catch (error) { this.rethrow(error) }
  }

  port(edge: StreetEdge, side: 'left' | 'right', nodeId: string): string { return `walk:${JSON.stringify([edge.id, nodeId, side])}` }

  connect(): ConnectedJunctions {
    try { return connectJunctions({ ...this.input, ports: this.ports, maximumConnectorWidth: 2, route: (request) => this.route(request) }) }
    catch (error) { return this.rethrow(error) }
  }

  /** An approach joins a junction route through paving, including a consumed street's side. */
  access(a: Vec3, b: Vec3, width: number, edgeId: string, landing?: Vec2[]): Vec3[] | null {
    if (dist2(drop(a), drop(b)) < 1e-7) return [a, b]
    if (a[1] === 0 && b[1] === 0 && this.ground?.covers([drop(a), drop(b)], width)) return [a, b]
    const source = this.streets.edges.get(edgeId)!
    const ids = new Set([source.id, ...this.streets.connection(source.from, edgeId).edgeIds, ...this.streets.connection(source.to, edgeId).edgeIds])
    const arms = [...ids].map((id) => this.streets.edges.get(id)!)
    const center: Vec2 = [(a[0] + b[0]) / 2, (a[2] + b[2]) / 2]
    const radius = dist2(drop(a), drop(b)) / 2 + Math.max(...arms.map((edge) => edge.width / 2 + Math.max(edge.sidewalk.left, edge.sidewalk.right))) * 2
    const rawPaving = a[1] === 0 && b[1] === 0 ? this.ground?.around(center, radius) : undefined
    const paving = rawPaving && landing ? [...rawPaving, landing] : rawPaving
    const rawBoundaries = rawPaving ? this.ground?.boundaryAround(center, radius) : undefined
    const boundaries = rawBoundaries && landing ? [...rawBoundaries, landing] : rawBoundaries
    const path = new WalkRegion(arms, width, paving, this.reservations?.region(arms), boundaries).route(drop(a), drop(b), width, [], 'butt')
    if (!path) return null
    const arcs = arcLengths(path), total = arcs.at(-1)!
    return path.map((p, i) => i === 0 ? a : i === path.length - 1 ? b : [p[0], a[1] + (b[1] - a[1]) * arcs[i] / total, p[1]])
  }

  private route(request: JunctionRouteRequest): Vec3[] | null {
    const a = this.ports[request.fromPortId].position, b = this.ports[request.toPortId].position
    const nodes = request.complex.nodeIds.map((id) => this.streets.nodes.get(id)!)
    const points: Vec2[] = [drop(a), drop(b), ...nodes.map((node) => node.position)]
    const min = [Math.min(...points.map((p) => p[0])), Math.min(...points.map((p) => p[1]))]
    const max = [Math.max(...points.map((p) => p[0])), Math.max(...points.map((p) => p[1]))]
    const center: Vec2 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2]
    const arms = request.complex.edgeIds.map((id) => this.streets.edges.get(id)!)
    const margin = Math.max(...arms.map((edge) => edge.width / 2 + Math.max(edge.sidewalk.left, edge.sidewalk.right)))
    const radius = Math.max(max[0] - min[0], max[1] - min[1]) / 2 + margin * 2
    const paving = a[1] === 0 && b[1] === 0 ? this.ground?.around(center, radius) : undefined
    const boundaries = paving ? this.ground?.boundaryAround(center, radius) : undefined
    const region = new WalkRegion(arms, request.width, paving, this.reservations?.region(arms), boundaries)
    const from = this.input.endpoints.find((endpoint) => Object.values(endpoint.ports).includes(request.fromPortId))!
    const to = this.input.endpoints.find((endpoint) => Object.values(endpoint.ports).includes(request.toPortId))!
    const hint = lineIntersection(drop(a), from.tangent, drop(b), to.tangent)
    const hints = hint && dist2(hint, center) <= radius ? [hint] : []
    const route = region.route(drop(a), drop(b), request.width, hints)
    if (!route) {
      this.unresolved = { message: `junction paving cannot join ${from.edgeId}@${from.nodeId} to ${to.edgeId}@${to.nodeId} at ${request.width} m`, path: `nodes.${request.complex.nodeIds.join('+')}` }
      return null
    }
    const arcs = arcLengths(route), total = arcs.at(-1)!
    return route.map((point, i) => i === 0 ? a : i === route.length - 1 ? b : [point[0], a[1] + (b[1] - a[1]) * (total > 0 ? arcs[i] / total : 0), point[1]])
  }

  private rethrow(error: unknown): never {
    if (error instanceof JunctionTopologyError) throw new ConnectionsError('E_ATLAS_INVALID', this.unresolved?.message ?? error.message, `atlas.streets.${this.unresolved?.path ?? error.path}`)
    throw error
  }
}
