import type { SidewalkIntervalRole, SidewalkSection } from '../types/atlas'

const EPS = 1e-6
const nonnegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0
const ROLES: SidewalkIntervalRole[] = ['gutter-lip', 'gutter', 'curb', 'border', 'furnishing', 'walking', 'frontage']

/** Explicit intervals must tile the authored side and agree with every physical dimension. */
export function validateSidewalkGeometry(side: SidewalkSection, width: number, fail: (message: string) => never): void {
  const geometry = side.geometry!
  if (!geometry || geometry.version !== '1.0.0') fail('unsupported sidewalk geometry version')
  const edge = geometry.edge, gutter = edge?.gutter, lip = gutter?.lip
  if (!nonnegative(edge?.curbRise) || !nonnegative(gutter?.width) || !nonnegative(lip?.width) || !nonnegative(lip?.height) || lip?.side !== 'road') fail('sidewalk edge geometry needs finite non-negative dimensions')
  if (lip.width >= gutter.width || lip.height > edge.curbRise) fail('sidewalk gutter lip must fit its gutter and curb rise')
  const paved = side.bands.border + side.bands.furnishing + side.bands.walking + side.bands.frontage
  if (!nonnegative(geometry.pavedWidth) || Math.abs(geometry.pavedWidth - paved) > EPS || !nonnegative(geometry.totalWidth) || Math.abs(geometry.totalWidth - (paved + side.bands.curb + gutter.width)) > EPS || Math.abs(geometry.totalWidth - width) > EPS) fail('sidewalk geometry totals disagree with its bands or side width')
  if (!Array.isArray(geometry.intervals) || geometry.intervals.length !== ROLES.length) fail('sidewalk geometry needs every ordered interval')
  let cursor = 0
  for (const [i, role] of ROLES.entries()) {
    const interval = geometry.intervals[i]
    const span = role === 'gutter-lip' ? lip.width : role === 'gutter' ? gutter.width - lip.width : side.bands[role]
    const top = role === 'gutter-lip' ? lip.height : role === 'gutter' ? 0 : edge.curbRise
    if (!interval || interval.role !== role || !nonnegative(interval.start) || !nonnegative(interval.end) || !nonnegative(interval.top) || Math.abs(interval.start - cursor) > EPS || Math.abs(interval.end - (cursor + span)) > EPS || Math.abs(interval.top - top) > EPS) fail('sidewalk intervals must match ordered edge and band dimensions')
    cursor += span
  }
}
