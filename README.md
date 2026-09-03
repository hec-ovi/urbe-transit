# urbe-transit

Everything that links or moves through a generated city. From an atlas blueprint and a seed it computes the inter-building links (bridges, walkable AC tubes, wires, underground tunnels) with the exact aperture each building has to carve, and every movement network: sidewalks with signal synced crossings, car lanes, bus, subway and train routes with timetables, and air corridors. A separate post-exterior entry fits selected rooftop antenna cables over explicit building and reservation geometry.

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

Rooftop cables use their own additive entry and do not change the atlas pass:

```ts
import { generateRooftopSpans } from './src'
const rooftop = generateRooftopSpans(request)
```

The request follows `schemas/rooftop-span-request.schema.json`: stable building-local attachment records, a seed, a complete set of generic building, facade, roof, opening, access, equipment and reservation prisms, plus optional distance, selection ratio, cap, cable and path limits. `fixtures/rooftop-spans.request.json` is a current Exterior handoff with two accepted spans and one quiet roof.

## Out

One document (`schemas/output.schema.json`):

- **links**: kind, both endpoints (building, floor, face, aperture), centerline path, cross section, walkable flag, length. Bridges, tubes and tunnels join facing buildings and fly at least 5.5 m over the exact local street or ramp height under their complete width; wires hang across a street from facade to facade, thick over alleys and narrow streets, absent over avenues
- **apertures**: per building opening with face index, position along the face, absolute base, size, and the exact cut polygon on the face plane. The miter cut is closed form, so a diagonal tube meets an angled wall with zero gap. The bases on one building always admit a floor stack of its type's floor heights, so the exterior can pin a floor to every one of them. Wire anchors are mounting footprints and carve no holes.
- **linkRefs**: building id to building id with kind, for the quest layer
- **networks**: walk graph over sidewalks, corners, crossings and exact station stairs; road lane graph with speed, direction, lane changes and turns; signal controllers; transit routes and headway service; air corridors. Walk edges, lanes, turns and bus routes carry authoritative 3D paths that preserve every atlas ramp breakpoint. Transfers follow atlas node connection groups, and subway access copies each published stair, passage and platform handoff.
- **layers**: manifest of the preview layers present

Anything the toggles ask for that the blueprint cannot feed comes back as an empty layer, never an error. `CONTRACT.md` carries the invariants (face convention, aperture bounds, signal cycle arithmetic, timetable ordering) and the closed error set.

The rooftop result follows `schemas/rooftop-span-output.schema.json`. It may be empty. Every span carries stable endpoint refs, true 3D catenary coefficients and a derived rendering path, thickness, sag, slack and exact length. Directional fittings must face each other. Continuous collision checks use exact polygon overlap intervals and analytic curve height bounds, including cable radius, obstacle margins and attachment clearance. A failed span is omitted rather than clipped.

Package release 0.10.0 keeps the original connections document format at 0.9.0 byte-for-byte. The rooftop document has its own schema version 1.0.0 and reports generator release 0.10.0 separately.

## Layout

- `src/` generator: links, apertures, networks. `src/rooftop/` is the isolated antenna span fitter. `src/ui/` is the preview with views, widgets and components.
- `schemas/` output JSON Schemas, `src/types/atlas.ts` the consumed atlas subset.
- `fixtures/` standalone fixture atlas, `tests/` contract tests.

## In the urbe family

It reads [atlas](https://github.com/hec-ovi/urbe-atlas) and feeds three consumers: [simulation](https://github.com/hec-ovi/urbe-population) walks and rides its networks, [engine](https://github.com/hec-ovi/urbe-engine) drives street traffic and pedestrian signals from them, and [exterior](https://github.com/hec-ovi/buildingforge) carves the apertures it specifies into each building. The full picture lives in [urbe](https://github.com/hec-ovi/urbe).
