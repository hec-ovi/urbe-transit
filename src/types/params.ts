import { ConnectionsError } from '../core/errors'

/** Mirrors schemas/params.schema.json. */
export interface ConnectionsParams {
  seed: string
  toggles?: Partial<Toggles>
  links?: Partial<Record<LinkKindKey, Partial<LinkLimits>>>
  timetable?: { dayStart?: number; dayEnd?: number }
}

export interface Toggles {
  bridges: boolean
  acTubes: boolean
  wires: boolean
  tunnels: boolean
  airPaths: boolean
  bus: boolean
  subway: boolean
  train: boolean
}

export type LinkKindKey = 'bridge' | 'acTube' | 'wire' | 'tunnel'
/** Kinds selected by facing building pairs, as opposed to wires, which follow streets. */
export type FacingKindKey = 'bridge' | 'acTube' | 'tunnel'

export interface LinkLimits {
  minLength: number
  maxLength: number
  minBase: number
  /** Top of the anchor band; wires only, other kinds attach anywhere above `minBase`. */
  maxBase?: number
  maxPerBuilding: number
  density: number
}

export interface ResolvedParams {
  seed: string
  toggles: Toggles
  links: Record<LinkKindKey, LinkLimits>
  timetable: { dayStart: number; dayEnd: number }
}

const LINK_DEFAULTS: Record<LinkKindKey, LinkLimits> = {
  bridge: { minLength: 8, maxLength: 45, minBase: 8, maxPerBuilding: 2, density: 0.5 },
  acTube: { minLength: 6, maxLength: 40, minBase: 6, maxPerBuilding: 3, density: 0.4 },
  // Wire lengths are the facade-to-facade span across a street, and the base pair is the anchor band.
  wire: { minLength: 6, maxLength: 26, minBase: 4, maxBase: 8, maxPerBuilding: 10, density: 0.9 },
  tunnel: { minLength: 10, maxLength: 120, minBase: -4, maxPerBuilding: 1, density: 0.3 },
}

/** Overrides with an explicit `undefined` keep the default instead of erasing it. */
function defined<T extends object>(o: T | undefined): Partial<T> {
  return Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => v !== undefined)) as Partial<T>
}

export function resolveParams(params: ConnectionsParams): ResolvedParams {
  if (typeof params !== 'object' || params === null) {
    throw new ConnectionsError('E_PARAMS_INVALID', 'params must be an object', 'params')
  }
  if (typeof params.seed !== 'string' || params.seed.length === 0) {
    throw new ConnectionsError('E_PARAMS_INVALID', 'seed must be a non-empty string', 'params.seed')
  }
  const toggles: Toggles = {
    bridges: true, acTubes: true, wires: true, tunnels: true,
    airPaths: true, bus: true, subway: true, train: true,
    ...params.toggles,
  }
  for (const [k, v] of Object.entries(toggles)) {
    if (typeof v !== 'boolean') throw new ConnectionsError('E_PARAMS_INVALID', `toggle must be boolean`, `params.toggles.${k}`)
  }
  const links = {} as Record<LinkKindKey, LinkLimits>
  for (const kind of Object.keys(LINK_DEFAULTS) as LinkKindKey[]) {
    const merged = { ...LINK_DEFAULTS[kind], ...defined(params.links?.[kind]) }
    for (const [k, v] of Object.entries(merged)) {
      if (typeof v !== 'number' || Number.isNaN(v)) {
        throw new ConnectionsError('E_PARAMS_INVALID', `must be a number`, `params.links.${kind}.${k}`)
      }
    }
    if (merged.density < 0 || merged.density > 1) {
      throw new ConnectionsError('E_PARAMS_INVALID', 'density must be in [0, 1]', `params.links.${kind}.density`)
    }
    if (merged.minLength > merged.maxLength) {
      throw new ConnectionsError('E_PARAMS_INVALID', 'minLength exceeds maxLength', `params.links.${kind}`)
    }
    if (merged.maxBase !== undefined && merged.maxBase < merged.minBase) {
      throw new ConnectionsError('E_PARAMS_INVALID', 'maxBase is below minBase', `params.links.${kind}.maxBase`)
    }
    links[kind] = merged
  }
  const timetable = { dayStart: 18000, dayEnd: 90000, ...params.timetable }
  if (typeof timetable.dayStart !== 'number' || typeof timetable.dayEnd !== 'number' || timetable.dayStart >= timetable.dayEnd) {
    throw new ConnectionsError('E_PARAMS_INVALID', 'dayStart must precede dayEnd', 'params.timetable')
  }
  return { seed: params.seed, toggles, links, timetable }
}
