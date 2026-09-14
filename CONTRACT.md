# CONTRACT: Links (connections)

Purpose: computes interbuilding links, apertures and movement networks from Atlas, and fits rooftop cables from supplied scene geometry.

Release 0.10.1. Public entry: [src/index.ts](src/index.ts). All calls are synchronous, deterministic and perform no IO.

## Inputs and outputs

| Call | Input schema | Output schema |
| --- | --- | --- |
| `generate(atlas, params)` | [Atlas subset](src/types/atlas.ts), [parameters](schemas/params.schema.json) | [Connections document](schemas/output.schema.json), version 0.9.0 |
| `generateRooftopSpans(request)` | [Rooftop request](schemas/rooftop-span-request.schema.json) | [Rooftop document](schemas/rooftop-span-output.schema.json), schema 1.0.0, generator 0.10.1 |
| `signalStateAt(signal, seconds)` | Generated [Signal](src/types/output.ts), seconds from midnight | Phase state string, periodic over `signal.cycle` |
| `transitVehiclesAt(routes, seconds)` | Generated [TransitRoute[]](src/types/output.ts), seconds from midnight | [VehiclePosition[]](src/networks/transit.ts), empty outside service |

Meters, +Y up, XZ ground; points `[x,z]` or `[x,y,z]`, polygons CCW. Timetables may extend past midnight. Callers treat results as snapshots and check document versions. Helpers take valid generated records. No HTTP or CLI wrapper is shipped.

## Geometry and paths

- [Links](schemas/link.schema.json) carry IDs, building/face/aperture refs, centerline, cross section, walking flags and length. [Apertures](schemas/aperture.schema.json) carry face-local U, absolute base and face-plane cuts. `floor` is advisory; receiving floors align to `base`. Wire anchors are mounting footprints, not holes.
- Profiles: bridge 4 x 3.2 m (inside walking), AC tube 2 x 2.4 m (inside and top), tunnel 3 x 2.8 m (inside), wire diameter 0.10 m (neither). Miter cuts meet both face planes. Above-ground apertures fit the building envelope; non-wire bases admit floors at the greater of the hard family minimum and 4.5 m (4 m clear plus 0.5 m allowance), retaining family maximum heights. Basement gaps use the same bounds. Bases are equal or separated by at least 2.5 m.
- Bridges and tubes select candidates on a 4.5 m grid and clear the highest street elevation under their full width by 5.5 m. Full-width checks exclude station volumes and third buildings above ground. Tunnel bases come from `links.tunnel.minBase` (default -4.5 m); infeasible explicit bases produce no tunnel, without moving the requested base. Street wires cross one street with equal-height anchors (default 4 to 8 m) and a sampled parabolic sag of 3% of span. Geometry is JSON, without materials or model assets.
- `linkRefs` maps each link to its buildings and kind. [Networks](schemas/networks.schema.json) contain walking, road, signal, transit and air data; `layers` lists present preview layers. Disabling optional link, transit or air kinds removes those layers; walking, road and signals are always computed. An infeasible optional selection may be empty.
- Lane, sidewalk and bus `path3` preserves Atlas elevation knots; `path` is its XZ projection. Transfers respect node connection groups. Authored lane widths/directions/offsets and walking bands remain authoritative. Planning reservations and final paving constrain full-width walking at the published 1 mm coordinate precision. Physical crossing cuts, terminal strips and roadway anchors retain source ownership. Station approaches and underground access retain exact endpoints and public refs.
- Signal phases cover every controlled index; cycle equals summed durations. Transit templates are ordered and service periods stay within the requested day.
- [Rooftop spans](schemas/rooftop-span.schema.json) carry stable attachment refs, exact catenary coefficients, rendering samples, thickness, sag, slack and arc length. Seeded selection obeys distance, heading, ratio and count limits; quiet roofs are valid. Moving either endpoint recomputes the curve. Continuous curve/radius checks exclude touching obstacles and endpoint clearance conflicts. Samples do not determine collision.

## Errors

Declared validation errors are [ConnectionsError](src/core/errors.ts) with `code`, `message`, optional `path`. Closed code set:

- `E_ATLAS_INVALID`: invalid consumed Atlas references, dimensions, elevations, topology, reservations or required walking connections.
- `E_PARAMS_INVALID`: invalid seed, toggle, link limit or timetable ordering.
- `E_ROOFTOP_INPUT_INVALID`: malformed rooftop fields, IDs, prisms, ranges or missing attachment-owner building volumes.

The rooftop caller supplies the complete scene, including unrelated reachable buildings and reservations; validation cannot discover an omitted building. Admission gaps for arbitrary malformed base inputs are recorded in [ISSUES.md](docs/ISSUES.md).

## Dependencies

- [Atlas](../atlas/CONTRACT.md), [street construction](../atlas/src/streets/construction/CONTRACT.md), [corridor reservations](../atlas/src/streets/construction/corridors/CONTRACT.md), [crossings](../atlas/src/streets/crossings/CONTRACT.md), [station entrances](../atlas/src/transit/reservations/CONTRACT.md): blueprint data only.
- [Exterior](../exterior/CONTRACT.md): [attachments](../exterior/schemas/external-attachment.schema.json) and [floor families](../exterior/schemas/floor-constants.json), locally represented without a runtime import.
- Internal [junction topology](src/networks/junctions/CONTRACT.md) and [rooftop fitting](src/rooftop/CONTRACT.md). No runtime package dependencies.
