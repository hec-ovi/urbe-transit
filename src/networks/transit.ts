import type { V2, V3 } from '../core/vec'
import { dist3, lift, norm2, sub2 } from '../core/vec'
import type { Rng } from '../core/rng'
import type { AtlasBlueprint, RailLine } from '../types/atlas'
import type { ResolvedParams } from '../types/params'
import type { RouteStop, ServicePeriod, TransitKind, TransitRoute } from '../types/output'
import { edgeLevelAtPoint, liftStreetPath } from './elevation'

interface ModeSpec {
  /** Commercial speed m/s, stops and signals folded in. */
  speed: number
  dwell: number
  /** Clockface headway choices in seconds. */
  peak: number[]
  midday: number[]
  evening: number[]
}

const MODES: Record<TransitKind, ModeSpec> = {
  bus: { speed: 5.8, dwell: 15, peak: [300, 420, 600], midday: [600, 900], evening: [1200, 1800] },
  subway: { speed: 9.7, dwell: 30, peak: [180, 240, 300], midday: [420, 600], evening: [600, 900] },
  train: { speed: 13.9, dwell: 45, peak: [600, 900], midday: [1200, 1800], evening: [1800] },
}

const PEAKS: [number, number][] = [[25200, 32400], [57600, 68400]]

/** Routes with out-and-back shapes, trip templates and headway service, from atlas line topology. */
export class TransitBuilder {
  constructor(
    private readonly atlas: AtlasBlueprint,
    private readonly params: ResolvedParams,
    private readonly rng: Rng,
  ) {}

  build(): { routes: TransitRoute[] } {
    const routes: TransitRoute[] = []
    const t = this.params.toggles
    if (t.bus) {
      for (const r of this.atlas.transit.busRoutes) {
        const shape = this.chainBusShape(r.edgeIds)
        const stops = this.atlas.transit.busStops.filter((s) => r.stopIds.includes(s.id))
        const ordered = r.stopIds.map((id) => stops.find((s) => s.id === id)!)
        routes.push(this.makeRoute(`R${r.id}`, 'bus', r.id, shape, ordered.map((stop) => {
          const edge = this.atlas.streets.edges.find((candidate) => candidate.id === stop.edgeId)!
          return { id: stop.id, p: [stop.position[0], edgeLevelAtPoint(edge, stop.position), stop.position[1]] }
        })))
      }
    }
    if (t.subway) for (const line of this.atlas.transit.subwayLines) routes.push(this.makeRailRoute(line, 'subway'))
    if (t.train) for (const line of this.atlas.transit.trainLines) routes.push(this.makeRailRoute(line, 'train'))
    return { routes }
  }

  private makeRailRoute(line: RailLine, kind: TransitKind): TransitRoute {
    const stations = [...this.atlas.transit.trainStations, ...this.atlas.transit.subwayStations]
    const ordered = line.stationIds.map((id) => stations.find((s) => s.id === id)!)
    const shape = line.path.map((point) => lift(point, line.level))
    return this.makeRoute(`R${line.id}`, kind, line.id, shape, ordered.map((station) => ({ id: station.id, p: lift(station.position, station.level) })))
  }

  /** Orient the atlas edge sequence into one continuous polyline. */
  private chainBusShape(edgeIds: string[]): V3[] {
    const edges = new Map(this.atlas.streets.edges.map((e) => [e.id, e]))
    const out: V3[] = []
    let cursor: string | null = null
    for (const id of edgeIds) {
      const e = edges.get(id)!
      let path = liftStreetPath(e, e.path)
      let end = e.to
      if (cursor === null) {
        // Orient the first edge toward the second.
        const nxt = edgeIds.length > 1 ? edges.get(edgeIds[1])! : null
        if (nxt && (e.from === nxt.from || e.from === nxt.to)) {
          path = [...path].reverse()
          end = e.from
        }
      } else if (e.to === cursor) {
        path = [...path].reverse()
        end = e.from
      }
      for (const p of path) {
        const last = out[out.length - 1]
        if (!last || dist3(last, p) > 1e-9) out.push(p)
      }
      cursor = end
    }
    return out
  }

  /** Out-and-back loop: shape doubles back, stops mirror, template from commercial speed and dwell. */
  private makeRoute(id: string, kind: TransitKind, lineId: string, oneWay: V3[], stopPts: { id: string; p: V3 }[]): TransitRoute {
    const mode = MODES[kind]
    const arcs = arcLengths3(oneWay)
    const total = arcs[arcs.length - 1]
    const back = [...oneWay].reverse().slice(1)
    const shape: V3[] = [...oneWay, ...back]

    const outStops: RouteStop[] = stopPts.map((s) => ({
      stopId: s.id, x: s.p[0], y: s.p[1], z: s.p[2], shapeDist: projectArc3Plan(oneWay, arcs, s.p),
    }))
    const backStops: RouteStop[] = [...outStops].reverse().slice(1).map((s) => ({ ...s, shapeDist: 2 * total - s.shapeDist }))
    const stops = [...outStops, ...backStops]

    const template: { arrive: number; depart: number }[] = []
    let clock = 0
    stops.forEach((s, i) => {
      if (i > 0) clock += Math.max(0, s.shapeDist - stops[i - 1].shapeDist) / mode.speed
      const arrive = Math.round(clock)
      const last = i === stops.length - 1
      if (!last) clock += mode.dwell
      template.push({ arrive, depart: last ? arrive : Math.round(clock) })
    })

    return { id, kind, lineId, stops, shape, template, service: this.makeService(kind, id) }
  }

  private makeService(kind: TransitKind, routeId: string): ServicePeriod[] {
    const mode = MODES[kind]
    const rng = this.rng.fork(`transit:${routeId}`)
    const { dayStart, dayEnd } = this.params.timetable
    const peakHeadway = rng.pick(mode.peak)
    const middayHeadway = rng.pick(mode.midday)
    const eveningHeadway = rng.pick(mode.evening)
    const bounds = [dayStart, PEAKS[0][0], PEAKS[0][1], PEAKS[1][0], PEAKS[1][1], dayEnd]
    const headways = [middayHeadway, peakHeadway, middayHeadway, peakHeadway, eveningHeadway]
    const out: ServicePeriod[] = []
    for (let i = 0; i < headways.length; i++) {
      const start = Math.max(bounds[i], dayStart)
      const end = Math.min(bounds[i + 1], dayEnd)
      if (end <= start) continue
      const headway = headways[i]
      out.push({ start, end, headway, phase: rng.int(0, Math.max(0, headway / 60 - 1)) * 60 })
    }
    return out
  }
}

function arcLengths3(path: V3[]): number[] {
  const out = [0]
  for (let i = 1; i < path.length; i++) out.push(out[i - 1] + dist3(path[i - 1], path[i]))
  return out
}

/** 3D route distance at the closest ground-plane projection of a stop. */
function projectArc3Plan(path: V3[], arcs: number[], point: V3): number {
  let best = 0
  let bestDistance = Infinity
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]
    const b = path[i]
    const dx = b[0] - a[0]
    const dz = b[2] - a[2]
    const length2 = dx * dx + dz * dz
    const t = length2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[2] - a[2]) * dz) / length2))
    const x = a[0] + dx * t
    const z = a[2] + dz * t
    const distance = Math.hypot(point[0] - x, point[2] - z)
    if (distance < bestDistance) {
      bestDistance = distance
      best = arcs[i - 1] + t * (arcs[i] - arcs[i - 1])
    }
  }
  return best
}

export interface VehiclePosition {
  routeId: string
  kind: TransitKind
  position: V3
  /** Ground-plane travel direction. */
  heading: V2
}

/** Every vehicle on every route at simulation time t (seconds from midnight); pure math. */
export function transitVehiclesAt(routes: TransitRoute[], t: number): VehiclePosition[] {
  const out: VehiclePosition[] = []
  for (const route of routes) {
    const duration = route.template[route.template.length - 1].arrive
    if (duration <= 0) continue
    for (const period of route.service) {
      const first = period.start + period.phase
      const kMin = Math.max(0, Math.ceil((t - duration - first) / period.headway))
      for (let k = kMin; ; k++) {
        const dep = first + k * period.headway
        if (dep > t || dep >= period.end) break
        const placed = vehicleAt(route, t - dep)
        if (placed) out.push({ routeId: route.id, kind: route.kind, ...placed })
      }
    }
  }
  return out
}

function vehicleAt(route: TransitRoute, elapsed: number): { position: V3; heading: V2 } | null {
  const tpl = route.template
  if (elapsed < 0 || elapsed > tpl[tpl.length - 1].arrive) return null
  let i = 0
  while (i < tpl.length - 1 && elapsed > tpl[i].depart) i++
  let dist: number
  if (elapsed <= tpl[i].depart && elapsed >= tpl[i].arrive) {
    dist = route.stops[i].shapeDist
  } else {
    const a = tpl[i - 1]
    const b = tpl[i]
    const frac = b.arrive === a.depart ? 1 : (elapsed - a.depart) / (b.arrive - a.depart)
    dist = route.stops[i - 1].shapeDist + frac * (route.stops[i].shapeDist - route.stops[i - 1].shapeDist)
  }
  return pointOnShape(route.shape, dist)
}

function pointOnShape(shape: V3[], dist: number): { position: V3; heading: V2 } {
  let acc = 0
  for (let i = 1; i < shape.length; i++) {
    const seg = dist3(shape[i - 1], shape[i])
    if (acc + seg >= dist || i === shape.length - 1) {
      const t = seg < 1e-9 ? 0 : Math.min(1, Math.max(0, (dist - acc) / seg))
      const a = shape[i - 1]
      const b = shape[i]
      return {
        position: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
        heading: norm2(sub2([b[0], b[2]], [a[0], a[2]])),
      }
    }
    acc += seg
  }
  const last = shape[shape.length - 1]
  return { position: last, heading: [1, 0] }
}
