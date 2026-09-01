import type { V2, V3 } from '../core/vec'
import { dist2, dist3, lift, norm2, sub2 } from '../core/vec'
import { arcLengths, projectArc } from '../core/polygon'
import type { Rng } from '../core/rng'
import type { AtlasBlueprint, RailLine } from '../types/atlas'
import type { ResolvedParams } from '../types/params'
import type { RouteStop, ServicePeriod, TransitKind, TransitRoute } from '../types/output'

interface ModeSpec {
  /** Commercial speed m/s, stops and signals folded in. */
  speed: number
  dwell: number
  /** Clockface headway choices in seconds. */
  peak: number[]
  midday: number[]
  evening: number[]
  y: number
}

const MODES: Record<TransitKind, ModeSpec> = {
  bus: { speed: 5.8, dwell: 15, peak: [300, 420, 600], midday: [600, 900], evening: [1200, 1800], y: 0 },
  subway: { speed: 9.7, dwell: 30, peak: [180, 240, 300], midday: [420, 600], evening: [600, 900], y: -12 },
  train: { speed: 13.9, dwell: 45, peak: [600, 900], midday: [1200, 1800], evening: [1800], y: 0 },
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
        const shape2 = this.chainBusShape(r.edgeIds)
        const stops = this.atlas.transit.busStops.filter((s) => r.stopIds.includes(s.id))
        const ordered = r.stopIds.map((id) => stops.find((s) => s.id === id)!)
        routes.push(this.makeRoute(`R${r.id}`, 'bus', r.id, shape2, ordered.map((s) => ({ id: s.id, p: s.position }))))
      }
    }
    if (t.subway) for (const line of this.atlas.transit.subwayLines) routes.push(this.makeRailRoute(line, 'subway'))
    if (t.train) for (const line of this.atlas.transit.trainLines) routes.push(this.makeRailRoute(line, 'train'))
    return { routes }
  }

  private makeRailRoute(line: RailLine, kind: TransitKind): TransitRoute {
    const stations = [...this.atlas.transit.trainStations, ...this.atlas.transit.subwayStations]
    const ordered = line.stationIds.map((id) => stations.find((s) => s.id === id)!)
    const y = line.underground ? MODES.subway.y : MODES[kind].y
    return this.makeRoute(`R${line.id}`, kind, line.id, line.path, ordered.map((s) => ({ id: s.id, p: s.position })), y)
  }

  /** Orient the atlas edge sequence into one continuous polyline. */
  private chainBusShape(edgeIds: string[]): V2[] {
    const edges = new Map(this.atlas.streets.edges.map((e) => [e.id, e]))
    const out: V2[] = []
    let cursor: string | null = null
    for (const id of edgeIds) {
      const e = edges.get(id)!
      let path = e.path
      let end = e.to
      if (cursor === null) {
        // Orient the first edge toward the second.
        const nxt = edgeIds.length > 1 ? edges.get(edgeIds[1])! : null
        if (nxt && (e.from === nxt.from || e.from === nxt.to)) {
          path = [...e.path].reverse()
          end = e.from
        }
      } else if (e.to === cursor) {
        path = [...e.path].reverse()
        end = e.from
      }
      for (const p of path) {
        const last = out[out.length - 1]
        if (!last || dist2(last, p) > 1e-9) out.push(p)
      }
      cursor = end
    }
    return out
  }

  /** Out-and-back loop: shape doubles back, stops mirror, template from commercial speed and dwell. */
  private makeRoute(id: string, kind: TransitKind, lineId: string, shape2: V2[], stopPts: { id: string; p: V2 }[], yOverride?: number): TransitRoute {
    const mode = MODES[kind]
    const y = yOverride ?? mode.y
    const arcs = arcLengths(shape2)
    const total = arcs[arcs.length - 1]
    const back = [...shape2].reverse().slice(1)
    const shape: V3[] = [...shape2, ...back].map((p) => lift(p, y))

    const outStops: RouteStop[] = stopPts.map((s) => ({
      stopId: s.id, x: s.p[0], y, z: s.p[1], shapeDist: projectArc(shape2, arcs, s.p),
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
