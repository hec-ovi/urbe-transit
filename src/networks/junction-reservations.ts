import type { AtlasBlueprint, JunctionApproach, StreetEdge, Vec2 } from '../types/atlas'
import { ConnectionsError } from '../core/errors'
import { arcLengths, pointAt, pointInPolygon, segmentPointDistance } from '../core/polygon'
import { dot2, norm2, sub2 } from '../core/vec'
import { WalkGround } from './walk-ground'
import { PlanCover } from './plan-cover'
import { walkingStrip } from './walk-strip'
import { sourceCutDistance } from './source-cut'

/** Exact source junction cuts and crossing-only pedestrian landing authority. */
export class JunctionReservations {
  private readonly internal = new Set<string>()
  private readonly approaches = new Map<string, JunctionApproach>()
  private readonly groups = new Map<string, string>()
  private readonly crossingPaths = new Map<string, Vec2[]>()

  constructor(atlas: AtlasBlueprint) {
    const junctions = atlas.streets.construction?.junctions
    if (junctions === undefined) return
    const path = 'atlas.streets.construction.junctions'
    const fail: (message: string) => never = (message) => { throw new ConnectionsError('E_ATLAS_INVALID', message, path) }
    if (!Array.isArray(junctions) || !atlas.volumetric.ground) fail('physical junctions need an array and final ground ownership')
    const edges = new Map(atlas.streets.edges.map((edge) => [edge.id, edge]))
    const sourceGroups = new Map<string, { nodeId: string; level: number; edgeIds: string[] }>()
    for (const node of atlas.streets.nodes) node.connections.forEach((group, i) => {
      const id = `${node.id}:connection:${i}`
      sourceGroups.set(id, { nodeId: node.id, ...group })
      for (const edgeId of group.edgeIds) this.groups.set(key(node.id, edgeId), id)
    })
    const polygon = (points: unknown): points is Vec2[] => Array.isArray(points) && points.length >= 3 && points.every(point) && points.reduce((sum, p, i) => { const q = points[(i + 1) % points.length]; return sum + p[0] * q[1] - q[0] * p[1] }, 0) > 0
    const ids = new Set<string>(), ownedGroups = new Map<string, string>()
    const road = new WalkGround(atlas.volumetric.ground!, ['roadway'])
    const pedestrian = new WalkGround(atlas.volumetric.ground!, ['sidewalk', 'curb'])
    const crossingGround = new WalkGround(atlas.volumetric.ground!, ['roadway', 'sidewalk', 'curb', 'gutter'])
    const planning = new Map(atlas.streets.construction?.planningReservations?.edges.map((edge) => [edge.edgeId, edge]))
    for (const junction of junctions) {
      if (!junction || typeof junction.id !== 'string' || ids.has(junction.id) || !Array.isArray(junction.groupIds) || !junction.groupIds.length || !Array.isArray(junction.nodeIds) || !Array.isArray(junction.internalEdgeIds) || !Array.isArray(junction.approaches)) fail('physical junction identity or collections are invalid')
      ids.add(junction.id)
      for (const groupId of junction.groupIds) {
        if (!sourceGroups.has(groupId) || sourceGroups.get(groupId)!.level !== 0 || ownedGroups.has(groupId) || !junction.nodeIds.includes(sourceGroups.get(groupId)!.nodeId)) fail('physical junction group references must retain grade connectivity')
        ownedGroups.set(groupId, junction.id)
      }
      for (const edgeId of junction.internalEdgeIds) {
        const edge = edges.get(edgeId)
        if (!edge || this.internal.has(edgeId) || !junction.groupIds.includes(this.groups.get(key(edge.from, edgeId))!) || !junction.groupIds.includes(this.groups.get(key(edge.to, edgeId))!)) fail('physical junction internal edges must retain both original endpoint groups')
        this.internal.add(edgeId)
      }
      for (const approach of junction.approaches) {
        const edge = edges.get(approach?.edgeId), at = key(approach?.nodeId, approach?.edgeId)
        if (!edge || (edge.from !== approach.nodeId && edge.to !== approach.nodeId) || this.approaches.has(at) || junction.internalEdgeIds.includes(edge.id) || this.groups.get(at) !== approach.groupId || !junction.groupIds.includes(approach.groupId)) fail('physical junction approach references are invalid')
        const arcs = arcLengths(edge.path), length = arcs.at(-1)!
        if (!Number.isFinite(approach.distance) || !Array.isArray(approach.station) || approach.station.length !== 2 || !approach.station.every(Number.isFinite) || approach.station[0] < 0 || approach.station[1] > length || !(approach.station[1] > approach.station[0]) || Math.abs(approach.distance - (approach.station[0] + approach.station[1]) / 2) > .001) fail('physical junction approach stations are invalid')
        if (!polygon(approach.field) || !polygon(approach.landings?.left) || !polygon(approach.landings?.right) || !point(approach.cut?.left) || !point(approach.cut?.right)) fail('physical crossing fields and landings need finite counter-clockwise polygons')
        const ground = approach.walkingLandings === undefined ? pedestrian : crossingGround
        if (!road.coversPolygon(approach.field) || !ground.coversPolygon(approach.landings.left) || !ground.coversPolygon(approach.landings.right)) fail('physical crossing field or landing leaves its final ground owner')
        const direction = norm2(sub2(pointAt(edge.path, arcs, approach.station[1]), pointAt(edge.path, arcs, approach.station[0])))
        if (approach.walkingLandings !== undefined) for (const side of ['left', 'right'] as const) {
          const terminal = approach.walkingLandings?.[side], reservation = planning.get(edge.id)?.sides[side].walking
          const name = `crossing terminal ${junction.id}/${edge.id}/${side}`
          if (!polygon(terminal) || terminal.length !== 4 || !reservation) fail(`${name} needs a quad and its named walking reservation`)
          if (!new PlanCover(reservation, [], .001, terminal).contains(terminal)) fail(`${name} leaves its named walking band`)
          if (!pedestrian.coversPolygon(terminal)) fail(`${name} leaves pedestrian ground`)
          const span = approach.station[1] - approach.station[0]
          if (Math.abs(dot2(sub2(terminal[1], terminal[0]), direction) - span) > .001 || Math.abs(dot2(sub2(terminal[2], terminal[3]), direction) - span) > .001) fail('crossing terminal quad must retain source-directed station order')
        }
        const crossing = atlas.streets.crossings.find((crossing) => crossing.junctionId === junction.id && crossing.nodeId === approach.nodeId)?.segments.find((segment) => segment.edgeId === edge.id)
        if (!crossing || !point(crossing.from) || !point(crossing.to) || !Number.isFinite(crossing.width ?? 3) || Math.abs((crossing.width ?? 3) - (approach.station[1] - approach.station[0])) > .001 || !this.onLanding(crossing.from, approach) || !this.onLanding(crossing.to, approach) || this.onLanding(crossing.from, approach) === this.onLanding(crossing.to, approach)) fail('physical junction approach has no matching pedestrian crossing')
        let traversal = [crossing.from, crossing.to]
        if (crossing.roadway !== undefined) {
          const anchors = crossing.roadway
          if (!point(anchors?.from) || !point(anchors?.to) || !meets(anchors.from, approach.field) || !meets(anchors.to, approach.field) || !meets(anchors.from, approach.landings[this.onLanding(crossing.from, approach)!]) || !meets(anchors.to, approach.landings[this.onLanding(crossing.to, approach)!])) fail('crossing roadway anchors must retain their ordered connector seams')
          traversal = [crossing.from, anchors.from, anchors.to, crossing.to]
        }
        const cover = new PlanCover([approach.field, approach.landings.left, approach.landings.right], [], .001)
        if (!walkingStrip(traversal, crossing.width ?? 3).every((piece) => cover.contains(piece))) fail(`complete crossing ${junction.id}/${edge.id} leaves its field and landings`)
        this.crossingPaths.set(at, traversal)
        this.approaches.set(at, approach)
      }
      for (const groupId of junction.groupIds) {
        const group = sourceGroups.get(groupId)!
        if (group.level !== 0) continue
        for (const edgeId of group.edgeIds) {
          const edge = edges.get(edgeId)!
          if (edge.width > 0 && edge.class !== 'alley' && edge.class !== 'highway' && edge.sidewalk.left > 0 && edge.sidewalk.right > 0 && !junction.internalEdgeIds.includes(edgeId) && !this.approaches.has(key(group.nodeId, edgeId))) fail('physical junction is missing an eligible external crossing approach')
        }
      }
    }
    for (const crossing of atlas.streets.crossings) if (crossing.junctionId) {
      if (!ids.has(crossing.junctionId)) fail('crossing references a missing physical junction')
      for (const segment of crossing.segments) {
        const at = key(crossing.nodeId, segment.edgeId!)
        if (!this.approaches.has(at) || ownedGroups.get(this.groups.get(at)!) !== crossing.junctionId) fail('crossing references a missing physical approach')
      }
    }
  }

  isInternal(edgeId: string): boolean { return this.internal.has(edgeId) }

  has(edge: StreetEdge): boolean { return this.internal.has(edge.id) || this.approaches.has(key(edge.from, edge.id)) || this.approaches.has(key(edge.to, edge.id)) }

  setback(edge: StreetEdge, nodeId: string): number | undefined {
    if (this.internal.has(edge.id)) return arcLengths(edge.path).at(-1)!
    const approach = this.approaches.get(key(nodeId, edge.id))
    return approach ? nodeId === edge.from ? approach.station[1] : arcLengths(edge.path).at(-1)! - approach.station[0] : undefined
  }

  walkingSetback(edge: StreetEdge, nodeId: string, side: 'left' | 'right', path: Vec2[], offset: number): number | undefined {
    const approach = this.approaches.get(key(nodeId, edge.id))
    if (!approach) return undefined
    const from = nodeId === edge.from
    const terminal = approach.walkingLandings?.[side]
    const cut: [Vec2, Vec2] | undefined = terminal && (from ? [terminal[1], terminal[2]] : [terminal[0], terminal[3]])
    const distance = sourceCutDistance(edge.path, path, approach.station[from ? 1 : 0], approach.distance, offset, cut)
    if (distance === undefined) throw new ConnectionsError('E_ATLAS_INVALID', 'walking band cannot meet its source crossing cut', 'atlas.streets.construction.junctions')
    return from ? distance : arcLengths(path).at(-1)! - distance
  }

  group(nodeId: string, edgeId: string): string | undefined { return this.groups.get(key(nodeId, edgeId)) }

  crossingPath(nodeId: string, edgeId: string): Vec2[] | undefined { return this.crossingPaths.get(key(nodeId, edgeId)) }

  landing(nodeId: string, edgeId: string, point: Vec2): { side: 'left' | 'right'; polygon: Vec2[] } | undefined {
    const approach = this.approaches.get(key(nodeId, edgeId))
    const side = approach && this.onLanding(point, approach)
    return approach && side ? { side, polygon: approach.landings[side] } : undefined
  }

  private onLanding(p: Vec2, approach: JunctionApproach): 'left' | 'right' | undefined {
    return (['left', 'right'] as const).find((side) => {
      const polygon = (approach.walkingLandings ?? approach.landings)[side]
      return meets(p, polygon)
    })
  }
}

function key(nodeId: string, edgeId: string): string { return JSON.stringify([nodeId, edgeId]) }
function point(value: unknown): value is Vec2 { return Array.isArray(value) && value.length === 2 && value.every((n) => typeof n === 'number' && Number.isFinite(n)) }
function meets(point: Vec2, polygon: Vec2[]): boolean { return pointInPolygon(point, polygon) || polygon.some((a, i) => segmentPointDistance(a, polygon[(i + 1) % polygon.length], point) <= .001) }
