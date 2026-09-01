import { dot2, norm2, sub2 } from '../core/vec'
import type { AtlasBlueprint } from '../types/atlas'
import type { Signal, SignalRef } from '../types/output'
import { StreetIndex, heading, wrap180 } from './street-util'

const GREEN = 27
const YELLOW = 3
const CYCLE = 2 * (GREEN + YELLOW)
/** Green-wave pacing: offsets follow travel time at this speed across the city. */
const WAVE_SPEED = 13.9

export interface SignalIndex {
  signals: Signal[]
  /** Signal ref for a crossing segment: key `${nodeId}:${segmentIndex}`. */
  crossingRef: Map<string, SignalRef>
  /** Signal ref for a vehicle approach: key `${nodeId}:${edgeId}`. */
  approachRef: Map<string, SignalRef>
}

/**
 * Fixed-time two-group controllers at busy intersections. State string layout: one char per
 * incident edge (approach), then one per crossing segment. Walk sync is by construction:
 * a crossing is G exactly while the roadway it spans has the red.
 */
export function buildSignals(atlas: AtlasBlueprint): SignalIndex {
  const streets = new StreetIndex(atlas)
  const crossingsByNode = new Map(atlas.streets.crossings.map((c) => [c.nodeId, c]))
  const signals: Signal[] = []
  const crossingRef = new Map<string, SignalRef>()
  const approachRef = new Map<string, SignalRef>()

  for (const node of atlas.streets.nodes) {
    const edges = node.edgeIds.map((id) => streets.edges.get(id)!).filter(Boolean)
    const hasMajor = edges.some((e) => e.class === 'road' || e.class === 'highway')
    if (!(edges.length >= 3 && hasMajor) && edges.length < 4) continue

    const bearings = edges.map((e) => heading(streets.dirFrom(e, node.id)))
    const inGroupA = bearings.map((b) => Math.abs(wrap180((b - bearings[0]) * 2)) / 2 < 45)
    const segments = crossingsByNode.get(node.id)?.segments ?? []
    /** Group of the roadway each crossing spans: the most perpendicular incident edge. */
    const crossingGroupA = segments.map((seg) => {
      const s = norm2(sub2(seg.to, seg.from))
      let best = 0
      let bestDot = Infinity
      edges.forEach((e, i) => {
        const d = Math.abs(dot2(s, streets.dirFrom(e, node.id)))
        if (d < bestDot - 1e-9) {
          bestDot = d
          best = i
        }
      })
      return inGroupA[best]
    })

    const state = (aGo: 'G' | 'y' | 'r', bGo: 'G' | 'y' | 'r'): string =>
      inGroupA.map((a) => (a ? aGo : bGo)).join('') +
      crossingGroupA.map((a) => (a ? (bGo === 'G' ? 'G' : 'r') : aGo === 'G' ? 'G' : 'r')).join('')

    const id = `S${node.id}`
    signals.push({
      id,
      nodeId: node.id,
      cycle: CYCLE,
      offset: Math.round((node.position[0] + node.position[1]) / WAVE_SPEED) % CYCLE,
      phases: [
        { duration: GREEN, state: state('G', 'r') },
        { duration: YELLOW, state: state('y', 'r') },
        { duration: GREEN, state: state('r', 'G') },
        { duration: YELLOW, state: state('r', 'y') },
      ],
      linkCount: edges.length + segments.length,
    })
    edges.forEach((e, i) => approachRef.set(`${node.id}:${e.id}`, { signalId: id, linkIndex: i }))
    segments.forEach((_, i) => crossingRef.set(`${node.id}:${i}`, { signalId: id, linkIndex: edges.length + i }))
  }
  return { signals, crossingRef, approachRef }
}

/** State string of a signal at simulation time t (seconds); pure math, no state. */
export function signalStateAt(signal: Signal, t: number): string {
  let tt = (t + signal.offset) % signal.cycle
  if (tt < 0) tt += signal.cycle
  for (const p of signal.phases) {
    if (tt < p.duration) return p.state
    tt -= p.duration
  }
  return signal.phases[signal.phases.length - 1].state
}
