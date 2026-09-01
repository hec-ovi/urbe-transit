import type { LayerId } from '../types/output'

/** One color per toggleable layer, shared by panel swatches and map painters. */
export const LAYER_COLORS: Record<LayerId, string> = {
  'links.bridges': '#ff9a3c',
  'links.acTubes': '#3ce0e0',
  'links.wires': '#e8d44d',
  'links.tunnels': '#b06ef0',
  walk: '#5fd068',
  road: '#9aa4b2',
  signals: '#ffd23f',
  'transit.bus': '#f05a5a',
  'transit.subway': '#4d8df0',
  'transit.train': '#2fa87a',
  air: '#7fd4ff',
}
