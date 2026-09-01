import type { V2 } from '../core/vec'
import { add2, lerp2, norm2, scale2, sub2 } from '../core/vec'
import { offsetPolyline, trimPolyline } from '../core/polygon'
import type { AtlasBlueprint, StreetClass } from '../types/atlas'
import type { Lane, LaneConnection } from '../types/output'
import { StreetIndex, heading, wrap180 } from './street-util'
import type { SignalIndex } from './signals'

const LANES_PER_DIR: Record<StreetClass, number> = { street: 1, road: 2, highway: 3 }
/** m/s: 30, 50, 100 km/h. */
const SPEED: Record<StreetClass, number> = { street: 8.33, road: 13.9, highway: 27.8 }
const VIA_SAMPLES = 6

/** Lane graph: per-direction offset centerlines, adjacency, turn connections through intersections. */
export class RoadBuilder {
  private readonly streets: StreetIndex
  private readonly lanes: Lane[] = []
  /** Arriving/departing lanes per street node. */
  private readonly arriving = new Map<string, Lane[]>()
  private readonly departing = new Map<string, Lane[]>()
  private readonly laneCount = new Map<string, number>()

  constructor(
    private readonly atlas: AtlasBlueprint,
    private readonly signalIndex: SignalIndex,
  ) {
    this.streets = new StreetIndex(atlas)
  }

  build(): { lanes: Lane[] } {
    for (const e of this.atlas.streets.edges) this.buildEdgeLanes(e.id)
    this.connectIntersections()
    return { lanes: this.lanes }
  }

  private buildEdgeLanes(edgeId: string): void {
    const e = this.streets.edges.get(edgeId)!
    const perDir = LANES_PER_DIR[e.class]
    const laneWidth = e.width / (2 * perDir)
    this.laneCount.set(edgeId, perDir)
    for (const dir of ['f', 'b'] as const) {
      const path = dir === 'f' ? e.path : [...e.path].reverse()
      const [startNode, endNode] = dir === 'f' ? [e.from, e.to] : [e.to, e.from]
      for (let i = 0; i < perDir; i++) {
        const off = e.width / 2 - laneWidth * (i + 0.5)
        const offsetPath = offsetPolyline(path, off)
        const trimmed = trimPolyline(offsetPath, this.streets.setback(startNode), this.streets.setback(endNode))
        if (trimmed.length < 2) continue
        const id = `${edgeId}${dir}${i}`
        const lane: Lane = {
          id, edgeId, index: i, speed: SPEED[e.class], width: laneWidth, path: trimmed, next: [],
          ...(i + 1 < perDir ? { left: { laneId: `${edgeId}${dir}${i + 1}`, change: true } } : {}),
          ...(i > 0 ? { right: { laneId: `${edgeId}${dir}${i - 1}`, change: true } } : {}),
        }
        this.lanes.push(lane)
        this.arriving.set(endNode, [...(this.arriving.get(endNode) ?? []), lane])
        this.departing.set(startNode, [...(this.departing.get(startNode) ?? []), lane])
      }
    }
  }

  private connectIntersections(): void {
    for (const node of this.atlas.streets.nodes) {
      const arrive = this.arriving.get(node.id) ?? []
      const depart = this.departing.get(node.id) ?? []
      for (const inLane of arrive) {
        const inEnd = inLane.path[inLane.path.length - 1]
        const inDir = norm2(sub2(inEnd, inLane.path[inLane.path.length - 2]))
        for (const outLane of depart) {
          if (outLane.edgeId === inLane.edgeId) continue
          const outStart = outLane.path[0]
          const outDir = norm2(sub2(outLane.path[1], outStart))
          const delta = wrap180(heading(outDir) - heading(inDir))
          const turn = Math.abs(delta) <= 30 ? 's' : Math.abs(delta) >= 150 ? 't' : delta < 0 ? 'r' : 'l'
          if (turn === 't') continue
          if (!this.laneMayTurn(inLane, outLane, turn)) continue
          const signal = this.signalIndex.approachRef.get(`${node.id}:${inLane.edgeId}`)
          const conn: LaneConnection = {
            laneId: outLane.id,
            turn,
            via: bezier(inEnd, controlPoint(inEnd, inDir, outStart, outDir), outStart),
            ...(signal ? { signal } : {}),
          }
          inLane.next.push(conn)
        }
      }
    }
  }

  /** Straight from any lane to the matching index; right turns from the rightmost, left from the leftmost. */
  private laneMayTurn(inLane: Lane, outLane: Lane, turn: 's' | 'l' | 'r'): boolean {
    const inMax = (this.laneCount.get(inLane.edgeId) ?? 1) - 1
    const outMax = (this.laneCount.get(outLane.edgeId) ?? 1) - 1
    if (turn === 's') return outLane.index === Math.min(inLane.index, outMax)
    if (turn === 'r') return inLane.index === 0 && outLane.index === 0
    return inLane.index === inMax && outLane.index === outMax
  }
}

function controlPoint(a: V2, aDir: V2, b: V2, bDir: V2): V2 {
  // Intersection of the two lane direction lines; falls back to the midpoint for parallel lanes.
  const det = aDir[0] * -bDir[1] - aDir[1] * -bDir[0]
  if (Math.abs(det) < 1e-6) return lerp2(a, b, 0.5)
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const t = (dx * -bDir[1] - dz * -bDir[0]) / det
  if (t < 0 || t > 60) return lerp2(a, b, 0.5)
  return add2(a, scale2(aDir, t))
}

function bezier(a: V2, c: V2, b: V2): V2[] {
  const out: V2[] = []
  for (let i = 0; i < VIA_SAMPLES; i++) {
    const t = i / (VIA_SAMPLES - 1)
    out.push(lerp2(lerp2(a, c, t), lerp2(c, b, t), t))
  }
  return out
}
