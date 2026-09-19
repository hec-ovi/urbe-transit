---
name: connections
description: Compute Links geometry, building apertures and movement paths from an Atlas blueprint, or fit rooftop cables from attachment and obstacle records using this repository's TypeScript library.
---

# Links API

Release 0.11.1. Computes deterministic link geometry and movement networks, plus rooftop catenaries, through pure synchronous library calls in `src/index.ts`.

## City request

Call `generate(atlas, params)`. Supply the complete [Atlas subset](src/types/atlas.ts), including elevations, transfer groups, building envelopes and station access. Each parcel footprint is used as given, so a standing footprint that covers a merged neighbour's lot is fine: facades and cuts follow that ring. Street planning reservations, when present, are model 2.1.0 (`atlas-directed-corridors`, 1 mm grid). [Parameters](schemas/params.schema.json):

- `seed`: required nonempty string.
- `toggles`: `bridges`, `acTubes`, `wires`, `tunnels`, `airPaths`, `bus`, `subway`, `train`; each defaults to `true`. Walking, roads and signals are always computed.
- `links`: per-kind overrides, defaults below. Lengths and bases are meters, count is per building, density is a candidate fraction. `maxBase` affects wires only.

| Kind key | minLength | maxLength | minBase | maxBase | maxPerBuilding | density |
| --- | --- | --- | --- | --- | --- | --- |
| bridge | 8 | 45 | 9 | unused | 2 | 0.5 |
| acTube | 6 | 40 | 9 | unused | 3 | 0.4 |
| wire | 6 | 26 | 4 | 8 | 10 | 0.9 |
| tunnel | 10 | 120 | -4.5 | unused | 1 | 0.3 |

- Peer rule: a bridge or an ac-tube joins roofs at most 9 m apart, starts at least 9 m over the ground (a lower `minBase` does not lower that) and runs level, one base on both facades. A pair outside the band takes no link. Wires and tunnels are unaffected.
- `buildings`: optional map from parcel id to `{roof, stands}`, the roof elevation in meters of the building that stands there. Ends attach 2 m under that roof, 1 m for a wire anchor; `stands: false` gives that parcel no links; a parcel left out keeps the Atlas envelope height. Every link then reports `heightSource: 'roof'`.
- `timetable.dayStart=18000`, `dayEnd=90000`, seconds from midnight (05:00 to 01:00 next day). Start must precede end.

Returns [Connections output](schemas/output.schema.json): `meta`, `links`, `apertures`, `linkRefs`, `networks`, `layers`; document version 0.9.0. Geometry is JSON paths, sections and cuts, without model or material assets. Receiving floors use aperture `base`; `floor` is advisory. Wire anchors reserve mounting space without carving a hole. Infeasible optional selections may be empty.

## Rooftop request

Call `generateRooftopSpans(request)` with [this schema](schemas/rooftop-span-request.schema.json):

- `seed`: required nonempty string.
- `attachments`: required array of `{buildingId, attachment: {id, position, orientation, clearanceRadius, normal?}}`. Position is `[x,y,z]` in meters. Directional records require a horizontal unit normal; omnidirectional records omit it.
- `volumes`: required complete scene of `{id, kind, buildingId?, footprint, bottom, top, clearance?}`. Footprints are simple CCW XZ polygons, heights are absolute meters, clearance defaults to 0. Every attachment needs its owner's building volume. Include reachable buildings, facades, roofs, openings, access, equipment and reservations.
- Optional `params`: `minDistance=5`, `maxDistance=100`, `selectionRatio=0.35`, `maxSpans=12`, `maxPerAttachment=1`, `thickness={min:0.025,max:0.05}` meters, `slackRatio={min:1.003,max:1.018}`, `directionToleranceDegrees=30`, `pathSegments=24`.

Returns [rooftop output](schemas/rooftop-span-output.schema.json): `meta` (schema 1.0.0, generator 0.11.1) and `spans`. Each span carries exact anchors, catenary coefficients, rendering path, thickness, sag, slack, slack ratio and arc length. Collision checks the continuous curve; touching or unproved spans are omitted. Empty output is valid. Resubmit the full scene when an attachment moves.

## Errors and time queries

Catch `ConnectionsError`: `code`, `message`, optional `path`. The declared closed codes are `E_ATLAS_INVALID`, `E_PARAMS_INVALID`, `E_ROOFTOP_INPUT_INVALID`; [CONTRACT.md](CONTRACT.md) describes admission limits. Keep source requests and IDs when reporting a conflict.

`signalStateAt(signal, seconds)` returns a phase state string. `transitVehiclesAt(routes, seconds)` returns `{routeId, kind, position, heading}[]`. Both take valid generated records and perform stateless time queries.

## Worked example

Copy into a TypeScript caller in the repository root (a bundler resolves imports):

```ts
import { generate, generateRooftopSpans, signalStateAt, transitVehiclesAt } from './src/index'
import { buildFixtureAtlas } from './fixtures/atlas.fixture'
import rooftopRequest from './fixtures/rooftop-spans.request.json'
import type { RooftopSpanRequest } from './src/index'

const city = generate(buildFixtureAtlas(), { seed: 'alpha' })
const rooftop = generateRooftopSpans(rooftopRequest as RooftopSpanRequest)
const state = city.networks.signals.map(signal => signalStateAt(signal, 28800))
const vehicles = transitVehiclesAt(city.networks.transit.routes, 28800)
console.log(city.meta.version, city.linkRefs, rooftop.spans, state, vehicles)
```
