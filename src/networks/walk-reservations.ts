import type { EdgePlanningReservations, StreetEdge, StreetPlanningReservations, Vec2 } from '../types/atlas'
import { offsetStreetPath } from './offset'
import { roundedWalkingPath } from './curved-offset'
import { PlanCover } from './plan-cover'
import { walkingStrip } from './walk-strip'
import { centerMiterOnWalkingBand, centerOnWalkingBand } from './walk-band-center'

/** Exact serialized reservations own band conformance; offset paths are only candidates. */
export class WalkingReservations {
  private readonly byEdge = new Map<string, EdgePlanningReservations>()
  private readonly coversBySide = new Map<string, PlanCover>()
  private readonly grid: number
  readonly present: boolean

  constructor(planning?: StreetPlanningReservations) {
    this.present = !!planning
    this.grid = planning?.model.coordinateGrid ?? .001
    for (const edge of planning?.edges ?? []) this.byEdge.set(edge.edgeId, edge)
  }

  has(edgeId: string): boolean { return this.byEdge.has(edgeId) }

  candidate(edge: StreetEdge, side: 'left' | 'right', offset: number, width: number): Vec2[] {
    let selected: Vec2[] = []
    for (const path of this.candidates(edge, side, offset)) {
      selected = path
      if (this.covers(edge.id, side, path, width)) return path
    }
    return selected
  }

  /** Ordered geometric candidates, each subject to the caller's complete regular-run proof. */
  *candidates(edge: StreetEdge, side: 'left' | 'right', offset: number): Generator<Vec2[]> {
    yield offsetStreetPath(edge.path, offset)
    const walking = this.byEdge.get(edge.id)!.sides[side].walking
    yield centerMiterOnWalkingBand(edge.path, offset, walking, this.grid)
    // Refine candidate geometry below input precision; the reservation proof remains unchanged.
    for (let chordError = this.grid / 4; chordError >= this.grid / 256; chordError /= 4) {
      const curved = roundedWalkingPath(edge.path, offset, chordError)
      yield centerOnWalkingBand(curved, edge.path, walking, this.grid)
    }
  }

  covers(edgeId: string, side: 'left' | 'right', path: Vec2[], width: number): boolean {
    const reservation = this.byEdge.get(edgeId)
    if (!reservation) return true
    const key = JSON.stringify([edgeId, side])
    let cover = this.coversBySide.get(key)
    if (!cover) {
      cover = new PlanCover(reservation.sides[side].walking, [], this.grid)
      this.coversBySide.set(key, cover)
    }
    const pieces = walkingStrip(path, width)
    return pieces.length > 0 && pieces.every((piece) => cover.contains(piece))
  }

  region(edges: StreetEdge[]): { sidewalks: Vec2[][]; roads: Vec2[][] } | undefined {
    if (!this.present) return undefined
    const reservations = edges.map((edge) => this.byEdge.get(edge.id)!)
    return {
      sidewalks: reservations.flatMap((edge) => [...edge.sides.left.sidewalk, ...edge.sides.right.sidewalk]),
      roads: reservations.flatMap((edge) => edge.roadway),
    }
  }
}
