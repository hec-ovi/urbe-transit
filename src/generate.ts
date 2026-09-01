import { Rng } from './core/rng'
import { validateAtlas } from './atlas/validate'
import { planLinks } from './links/plan'
import { buildSignals } from './networks/signals'
import { WalkBuilder } from './networks/walk'
import { RoadBuilder } from './networks/road'
import { TransitBuilder } from './networks/transit'
import { buildAir } from './networks/air'
import type { AtlasBlueprint } from './types/atlas'
import { resolveParams, type ConnectionsParams } from './types/params'
import type { ConnectionsOutput, LayerId } from './types/output'
import { VERSION } from './version'

const LAYER_NAMES: Record<LayerId, string> = {
  'links.bridges': 'Bridges',
  'links.acTubes': 'AC tubes',
  'links.wires': 'Wires',
  'links.tunnels': 'Tunnels',
  walk: 'Walk paths',
  road: 'Car lanes',
  signals: 'Traffic lights',
  'transit.bus': 'Bus',
  'transit.subway': 'Subway',
  'transit.train': 'Train',
  air: 'Air paths',
}

/** The whole box: atlas blueprint + params in, one deterministic connections document out. */
export function generate(atlas: AtlasBlueprint, params: ConnectionsParams): ConnectionsOutput {
  const resolved = resolveParams(params)
  validateAtlas(atlas)
  const rng = new Rng(`${resolved.seed}::${atlas.meta.seed}`)

  const { links, apertures, refs } = planLinks(atlas, resolved, rng)
  const signalIndex = buildSignals(atlas)
  const walk = new WalkBuilder(atlas, signalIndex, links).build()
  const road = new RoadBuilder(atlas, signalIndex).build()
  const transit = new TransitBuilder(atlas, resolved, rng).build()
  const air = resolved.toggles.airPaths ? buildAir(atlas) : { corridors: [] }

  const layers: { id: LayerId; name: string }[] = []
  const layerIf = (id: LayerId, present: boolean) => {
    if (present) layers.push({ id, name: LAYER_NAMES[id] })
  }
  layerIf('links.bridges', links.some((l) => l.kind === 'bridge'))
  layerIf('links.acTubes', links.some((l) => l.kind === 'ac-tube'))
  layerIf('links.wires', links.some((l) => l.kind === 'wire'))
  layerIf('links.tunnels', links.some((l) => l.kind === 'tunnel'))
  layerIf('walk', walk.edges.length > 0)
  layerIf('road', road.lanes.length > 0)
  layerIf('signals', signalIndex.signals.length > 0)
  layerIf('transit.bus', transit.routes.some((r) => r.kind === 'bus'))
  layerIf('transit.subway', transit.routes.some((r) => r.kind === 'subway'))
  layerIf('transit.train', transit.routes.some((r) => r.kind === 'train'))
  layerIf('air', air.corridors.length > 0)

  return {
    meta: { seed: resolved.seed, atlasSeed: atlas.meta.seed, version: VERSION },
    links,
    apertures,
    linkRefs: refs,
    networks: { walk, road, signals: signalIndex.signals, transit, air },
    layers,
  }
}
