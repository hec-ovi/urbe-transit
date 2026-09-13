import { arcLengths, offsetPolyline, pointAt, projectArc, trimPolyline } from '../core/polygon'
import type { StreetEdge, Vec2 } from '../types/atlas'
import { offsetStreetPath } from './offset'
import { walkingBand } from './sections'
import type { StreetIndex } from './street-util'
import type { WalkGround } from './walk-ground'
import type { WalkingReservations } from './walk-reservations'
import type { JunctionReservations } from './junction-reservations'

export interface WalkingApproach {
  side: 'left' | 'right'
  width: number
  path: Vec2[]
  endpoints: [Vec2, Vec2]
}

/** Plans each endpoint separately so overlapping junction clearances remain explicit. */
export class WalkingApproaches {
  private readonly byEdge = new Map<string, WalkingApproach[]>()
  private readonly clearances = new Map<string, number>()

  constructor(private readonly streets: StreetIndex, private readonly ground?: WalkGround, private readonly reservations?: WalkingReservations, private readonly junctions?: JunctionReservations) {}

  authored(edge: StreetEdge): boolean { return !!edge.crossSection || !!this.reservations?.has(edge.id) || !!this.junctions?.has(edge) }

  edge(edge: StreetEdge): WalkingApproach[] {
    const known = this.byEdge.get(edge.id)
    if (known) return known
    const modern = this.authored(edge)
    const authority = modern ? edge.id : undefined
    const start = this.junctions?.setback(edge, edge.from) ?? this.streets.setback(edge.from, authority)
    const end = this.junctions?.setback(edge, edge.to) ?? this.streets.setback(edge.to, authority)
    const sourceArcs = arcLengths(edge.path), length = sourceArcs.at(-1)!
    this.clearances.set(`${edge.id}:${edge.from}`, Math.min(length, start))
    this.clearances.set(`${edge.id}:${edge.to}`, Math.min(length, end))
    const result: WalkingApproach[] = []
    for (const side of ['right', 'left'] as const) {
      const band = walkingBand(edge, side)
      if (band.width <= 0) continue
      const path = this.reservations?.has(edge.id) ? this.reservedPath(edge, side, band, [start, end]) : (modern ? offsetStreetPath : offsetPolyline)(edge.path, band.offset)
      if (this.junctions?.isInternal(edge.id)) {
        result.push({ side, width: band.width, path: [], endpoints: [path[0], path.at(-1)!] })
        continue
      }
      const arcs = arcLengths(path), total = arcs.at(-1)!
      const [startDistance, endDistance] = this.sourceCuts(edge, side, path, band.offset, [start, end])
      const a = modern && edge.level === 0 && this.ground ? this.ground.clearance(path, band.width, startDistance) : startDistance
      const b = modern && edge.level === 0 && this.ground ? this.ground.clearance([...path].reverse(), band.width, endDistance) : endDistance
      if (modern) {
        const first = a >= total ? length : projectArc(edge.path, sourceArcs, pointAt(path, arcs, a))
        const last = b >= total ? length : length - projectArc(edge.path, sourceArcs, pointAt(path, arcs, total - b))
        this.clearances.set(`${edge.id}:${edge.from}`, Math.max(this.clearance(edge.id, edge.from), first))
        this.clearances.set(`${edge.id}:${edge.to}`, Math.max(this.clearance(edge.id, edge.to), last))
      }
      const trimmed = trimPolyline(path, a, b, modern ? .001 : .5)
      result.push({ side, width: band.width, path: trimmed, endpoints: [trimmed[0] ?? path[0], trimmed.at(-1) ?? path.at(-1)!] })
    }
    this.byEdge.set(edge.id, result)
    return result
  }

  clearance(edgeId: string, nodeId: string): number { return this.clearances.get(`${edgeId}:${nodeId}`) ?? 0 }

  private reservedPath(edge: StreetEdge, side: 'left' | 'right', band: { offset: number; width: number }, defaults: [number, number]): Vec2[] {
    const reservations = this.reservations!
    if (!this.junctions?.has(edge) || this.junctions.isInternal(edge.id)) return reservations.candidate(edge, side, band.offset, band.width)
    let selected: Vec2[] = []
    for (const path of reservations.candidates(edge, side, band.offset)) {
      selected = path
      const [start, end] = this.sourceCuts(edge, side, path, band.offset, defaults)
      const regular = trimPolyline(path, start, end, .001)
      if (reservations.covers(edge.id, side, regular, band.width)) return path
    }
    return selected
  }

  private sourceCuts(edge: StreetEdge, side: 'left' | 'right', path: Vec2[], offset: number, defaults: [number, number]): [number, number] {
    return [
      this.junctions?.walkingSetback(edge, edge.from, side, path, offset) ?? defaults[0],
      this.junctions?.walkingSetback(edge, edge.to, side, path, offset) ?? defaults[1],
    ]
  }
}
