# urbe-transit

Everything that links or moves through a generated city. From an atlas blueprint and a seed it computes the inter-building links (bridges, walkable AC tubes, wires, underground tunnels) with the exact aperture each building has to carve, and every movement network: sidewalks with signal synced crossings, car lanes, bus, subway and train routes with timetables, and air corridors.

Pure and synchronous, no IO, no randomness outside the seed. Same blueprint and params, byte-identical output.

## Run

```
npm install
npm test          # contract tests
npm run dev       # 2D preview over the fixture city, every layer toggleable
npm run build     # typecheck and bundle
```

The preview clock drives the traffic signals and the vehicles, so a route's position at any time is visible on the map. A bundled fixture city stands in when atlas is absent, and the preview loads a real blueprint from `ATLAS_BLUEPRINT` when one is pointed at it (default: `../atlas/samples/city-urbe.json`). The pipeline test reads every sample in `ATLAS_SAMPLES` (default: `../atlas/samples`) and skips itself when that directory is absent.

## In

```ts
import { generate } from './src'
const output = generate(atlasBlueprint, { seed: 'alpha' })
```

An atlas `CityBlueprint` (the consumed subset is mirrored at `src/types/atlas.ts`) plus params: seed, per-kind toggles, link limits, day span. Toggles go down to nothing, so an ancient city runs with tunnels only.

## Out

One document (`schemas/output.schema.json`):

- **links**: kind, both endpoints (building, floor, face, aperture), centerline path, cross section, walkable flag, length. Bridges, tubes and tunnels join facing buildings and fly at least 5.5 m over the exact local street or ramp height under their complete width; wires hang across a street from facade to facade, thick over alleys and narrow streets, absent over avenues
- **apertures**: per building opening with face index, position along the face, absolute base, size, and the exact cut polygon on the face plane. The miter cut is closed form, so a diagonal tube meets an angled wall with zero gap. The bases on one building always admit a floor stack of its type's floor heights, so the exterior can pin a floor to every one of them. Wire anchors are mounting footprints and carve no holes.
- **linkRefs**: building id to building id with kind, for the quest layer
- **networks**: walk graph over sidewalks, corners, crossings and exact station stairs; road lane graph with speed, direction, lane changes and turns; signal controllers; transit routes and headway service; air corridors. Walk edges, lanes, turns and bus routes carry authoritative 3D paths that preserve every atlas ramp breakpoint. Transfers follow atlas node connection groups, and subway access copies each published stair, passage and platform handoff.
- **layers**: manifest of the preview layers present

Anything the toggles ask for that the blueprint cannot feed comes back as an empty layer, never an error. `CONTRACT.md` carries the invariants (face convention, aperture bounds, signal cycle arithmetic, timetable ordering) and the closed error set.

## Layout

- `src/` generator: links, apertures, networks. `src/ui/` preview with views, widgets and components.
- `schemas/` output JSON Schemas, `src/types/atlas.ts` the consumed atlas subset.
- `fixtures/` standalone fixture atlas, `tests/` contract tests.

## In the urbe family

It reads [atlas](../atlas) and feeds three consumers: [simulation](../simulation) walks and rides its networks, [engine](../engine) drives street traffic and pedestrian signals from them, and [exterior](../exterior) carves the apertures it specifies into each building. The full picture lives in [urbe](..).
