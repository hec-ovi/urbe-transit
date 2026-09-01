import type { AtlasBlueprint } from '../../types/atlas'
import type { ConnectionsOutput, LayerId, LinkKind, TransitKind } from '../../types/output'
import { signalStateAt } from '../../networks/signals'
import { transitVehiclesAt } from '../../networks/transit'
import { LAYER_COLORS } from '../colors'

export interface Frame {
  ctx: CanvasRenderingContext2D
  /** World [x,z] to screen. */
  toScreen: (x: number, z: number) => [number, number]
  scale: number
}

type P2 = [number, number]

function stroke(f: Frame, path: readonly P2[], color: string, width: number, dash: number[] = []): void {
  strokeBatch(f, [path], color, width, dash)
}

/** One canvas stroke for many polylines of the same style; the big layers depend on this. */
function strokeBatch(f: Frame, paths: readonly (readonly P2[])[], color: string, width: number, dash: number[] = []): void {
  const { ctx } = f
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(0.5, width * f.scale)
  ctx.setLineDash(dash.map((d) => d * f.scale))
  ctx.beginPath()
  for (const path of paths) {
    path.forEach(([x, z], i) => {
      const [sx, sy] = f.toScreen(x, z)
      if (i === 0) ctx.moveTo(sx, sy)
      else ctx.lineTo(sx, sy)
    })
  }
  ctx.stroke()
  ctx.setLineDash([])
}

function dot(f: Frame, x: number, z: number, color: string, r: number): void {
  const [sx, sy] = f.toScreen(x, z)
  const rr = r * Math.min(1.6, Math.max(0.3, f.scale))
  f.ctx.fillStyle = color
  f.ctx.fillRect(sx - rr, sy - rr, rr * 2, rr * 2)
}

const DISTRICT_FILL: Record<string, string> = {
  downtown: '#1a2233',
  commercial: '#222030',
  residential: '#1c2a1e',
  industrial: '#2a241c',
  mixed: '#242430',
}

/** Ground truth beneath the toggleable layers: districts, streets, building footprints. */
export function paintAtlas(f: Frame, atlas: AtlasBlueprint): void {
  const { ctx } = f
  for (const d of atlas.districts) {
    ctx.fillStyle = DISTRICT_FILL[d.kind] ?? '#202020'
    ctx.beginPath()
    d.boundary.forEach(([x, z], i) => {
      const [sx, sy] = f.toScreen(x, z)
      if (i === 0) ctx.moveTo(sx, sy)
      else ctx.lineTo(sx, sy)
    })
    ctx.closePath()
    ctx.fill()
  }
  for (const e of atlas.streets.edges) stroke(f, e.path, '#3a3f47', e.width)
  for (const p of atlas.parcels) {
    ctx.fillStyle = '#2d3038'
    ctx.beginPath()
    p.footprint.forEach(([x, z], i) => {
      const [sx, sy] = f.toScreen(x, z)
      if (i === 0) ctx.moveTo(sx, sy)
      else ctx.lineTo(sx, sy)
    })
    ctx.closePath()
    ctx.fill()
  }
}

export function paintLinks(f: Frame, out: ConnectionsOutput, kind: LinkKind, layer: LayerId): void {
  const color = LAYER_COLORS[layer]
  for (const link of out.links) {
    if (link.kind !== kind) continue
    const path2 = link.path.map((p) => [p[0], p[2]] as P2)
    stroke(f, path2, color, Math.max(link.crossSection.width, 1.2), kind === 'tunnel' ? [3, 2] : [])
    dot(f, path2[0][0], path2[0][1], color, 2.5)
    dot(f, path2[path2.length - 1][0], path2[path2.length - 1][1], color, 2.5)
  }
}

export function paintWalk(f: Frame, out: ConnectionsOutput, t: number): void {
  const signals = new Map(out.networks.signals.map((s) => [s.id, s]))
  const plain: P2[][] = []
  const links: P2[][] = []
  const crossings = new Map<string, P2[][]>()
  for (const e of out.networks.walk.edges) {
    if (e.kind === 'crossing') {
      let color = '#e0e0e0'
      if (e.signal) {
        const s = signals.get(e.signal.signalId)!
        color = signalStateAt(s, t)[e.signal.linkIndex] === 'G' ? '#7dff8a' : '#ff6b6b'
      }
      crossings.set(color, [...(crossings.get(color) ?? []), e.path])
    } else if (e.kind === 'link') {
      links.push(e.path)
    } else {
      plain.push(e.path)
    }
  }
  strokeBatch(f, plain, LAYER_COLORS.walk, 1.4)
  strokeBatch(f, links, LAYER_COLORS.walk, 1.4, [4, 2])
  for (const [color, paths] of crossings) strokeBatch(f, paths, color, 3)
}

export function paintRoad(f: Frame, out: ConnectionsOutput): void {
  const lanes = out.networks.road.lanes
  strokeBatch(f, lanes.map((l) => l.path), LAYER_COLORS.road, 0.4)
  strokeBatch(f, lanes.flatMap((l) => l.next.map((c) => c.via)), '#5c6570', 0.3)
  for (const lane of lanes) {
    // Direction tick at the lane midpoint.
    const mid = lane.path[Math.floor(lane.path.length / 2)]
    dot(f, mid[0], mid[1], LAYER_COLORS.road, 1.2)
  }
}

export function paintSignals(f: Frame, out: ConnectionsOutput, atlas: AtlasBlueprint, t: number): void {
  const nodes = new Map(atlas.streets.nodes.map((n) => [n.id, n]))
  for (const s of out.networks.signals) {
    const n = nodes.get(s.nodeId)!
    const state = signalStateAt(s, t)
    const anyGreen = state.includes('G')
    dot(f, n.position[0], n.position[1], anyGreen ? LAYER_COLORS.signals : '#c25050', 3)
  }
}

export function paintTransit(f: Frame, out: ConnectionsOutput, kind: TransitKind, layer: LayerId, t: number): void {
  const color = LAYER_COLORS[layer]
  const routes = out.networks.transit.routes.filter((r) => r.kind === kind)
  for (const r of routes) {
    stroke(f, r.shape.map((p) => [p[0], p[2]] as P2), color, 1.4, kind === 'subway' ? [5, 3] : [])
    for (const s of r.stops) dot(f, s.x, s.z, color, 2.2)
  }
  for (const v of transitVehiclesAt(routes, t)) dot(f, v.position[0], v.position[2], '#ffffff', 2.6)
}

export function paintAir(f: Frame, out: ConnectionsOutput): void {
  for (const c of out.networks.air.corridors) {
    stroke(f, c.path, LAYER_COLORS.air, c.altitude > 130 ? 0.8 : 1.6, [6, 4])
  }
}
