import type { Rng } from '../core/rng'
import type { AtlasBlueprint } from '../types/atlas'
import type { ResolvedParams } from '../types/params'
import type { Aperture, Link, LinkRef } from '../types/output'
import { BuildingIndex } from './buildings'
import { LinkRegistry } from './registry'
import { LinkPlanner } from './planner'
import { WirePlanner } from './wires'

/**
 * Every inter-building link. Bridges, AC tubes and tunnels pair facing buildings; wires follow
 * the street grid instead, so they run in their own planner over the same registry.
 * Kind order fixes which kind claims a face first; each kind draws from its own rng stream.
 */
export function planLinks(
  atlas: AtlasBlueprint,
  params: ResolvedParams,
  rng: Rng,
): { links: Link[]; apertures: Aperture[]; refs: LinkRef[] } {
  const buildings = new BuildingIndex(atlas)
  const registry = new LinkRegistry(buildings)
  const facing = new LinkPlanner(atlas, params, buildings, registry)
  const { bridges, acTubes, wires, tunnels } = params.toggles

  if (bridges) facing.plan('bridge', 'bridge', rng.fork('links:bridge'))
  if (acTubes) facing.plan('acTube', 'ac-tube', rng.fork('links:acTube'))
  if (wires) new WirePlanner(atlas, params, buildings, registry).plan(rng.fork('links:wire'))
  if (tunnels) facing.plan('tunnel', 'tunnel', rng.fork('links:tunnel'))

  return registry.result()
}
