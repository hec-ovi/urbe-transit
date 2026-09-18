# Coordination issues

Proposals only. Available calls and document versions are in [CONTRACT.md](../CONTRACT.md).

## Atlas link plan required by the builder

Proposed `build({plan, attachments, obstacles, materials, design, seed})` accepts an authorized, versioned plan. Atlas owns placement and paths; Links fits geometry within the supplied space. Atlas, Links, Exterior, Interior, Engine and Quests must agree on these records before implementation:

| Record | Required fields and units | Use |
| --- | --- | --- |
| Plan | `schemaVersion`, stable `planId`, `atlasSeed`, shared-dimension version; meters, +Y up, XZ ground, CCW footprints | Version and source identity |
| Link | Stable `linkId`, `kind` (bridge, duct, tunnel, street wire, rooftop cable), both building IDs, district/type/tier refs, allowed design family | Geometry and quest refs |
| Endpoint | Stable `endpointId`, building/parcel ID, face ID/index, frame origin `[x,y,z]`, unit U/V/outward normal, exact attachment position, axis direction | Both miter cuts derive from the same face planes |
| Opening | Stable `openingId`, link and endpoint IDs, face-local U, absolute base Y, clear width/height, exact cut loop or authorized cut volume, frame allowance, complete reserved facade cells/grid phase when required | Exterior carves this opening; Interior preserves it |
| Connection floor | At each walkable opening: stable `floorId`, floor index, absolute finished-floor Y equal to opening base, slab bottom/top, headroom, receiving landing and circulation reservation | Exterior pins the slab; Interior keeps the connection floor and route clear |
| Duct walking | Independent `inside` and `over` flags; each enabled route has endpoint/handoff IDs, surface Y, clear width and headroom | A top walk may need a different opening/floor from an inside walk |
| Wire/cable anchor | Stable attachment ID, mounting frame/position, directional normal or omnidirectional orientation, clearance radius, allowed thickness/slack, support/port refs | Mounts require no opening or connection floor unless a separate route explicitly requires one |
| Span reservation | Ordered 3D route/control geometry, complete swept envelope (cross section, bottom/top, end cuts), allowed bends/support locations, crossed street IDs and highest road surface under full width | 5.5 m bridge/duct clearance; one-street wires with 4 to 8 m anchors; tunnels below streets |
| Navigation | Atlas walk node/edge IDs, exact 3D portals at both ends, movement permissions, receiving indoor handoff IDs, route width and 2.1 m headroom / 0.9 m clear-width minimum | Engine and Simulation continue at identical handoffs |
| Scene | Versioned complete obstacles/reservations with IDs, owners, closed geometry, elevations and margins: other buildings, facade/roof equipment, access, doors, station shafts/platforms/passages, highways and supports | Full-volume rejection, including obstacles between rendered cable samples |
| Highway opening | Structure/edge IDs, full deck/barrier/support/clearance envelope and affected building openings; floor/slab interruptions with exact elevations | Atlas authorizes the hole; Exterior/Interior preserve it; highway builder ownership needs agreement |
| Materials/design | Catalog version and delivery mode, material keys per surface role, real tile/panel dimensions and joint/grid settings, era and enabled link families | Fitted textured assets; missing-key errors identify the key |

Proposed result: versioned models and material bindings, fitted endpoint/support geometry, collision and clearance bounds, and source plan/link/opening/floor IDs. This adds a Materials dependency and asset delivery agreement with Engine. Publish the build schema after the stage's open decision is resolved.

## Bent corridors under the 2.1.0 fan step

Connections consumes street planning reservations 2.1.0. Its fans are inscribed 15 degree chords, so at each chord midpoint a band measures `cos(7.5 degrees)` (0.9914) of its authored width: a 2 m walking band publishes 1.983 m there. A full-width walking strip cannot fit a bent street edge, and `generate` would report `E_ATLAS_INVALID: walking strip leaves its planning reservation`. Straight corridors are exact, and every edge in the current tiny sample is straight, so nothing exercises this today. Decide whether Atlas circumscribes its bend fans, publishes the achievable band width, or keeps cities on straight edges.

## Boundary proposals

- Move link selection, aperture/floor placement, lane/walk topology, turns, signals and transit/air planning to Atlas through an orchestrator migration. Preserve `generate`, `links`, `apertures`, `linkRefs`, `networks` and `layers` until Exterior, Interior, Engine, Simulation and Quests can consume the agreed replacement.
- Shared dimensions need one authority: local floor families, 4 m link base grid, profile sizes and clearance rules. Introducing the common list affects Atlas, Links, Exterior, Interior, Streets and Materials; no sibling runtime import is added here.
- Base input admission is partial: arbitrary missing nested collections can throw native errors, some numeric ranges admit invalid values, and Atlas metadata versions are not checked. Agree supported versions and full validation of the consumed schema before tightening accepted inputs. Affects Atlas and every direct Links caller.
- `maxBase` is accepted for every kind but used only for wires. Propose a wire-only parameter in the next request schema; existing callers retain their input shape.
- Street wires publish a sampled parabola and polyline length; rooftop spans publish an exact catenary. Tunnels use a straight pair at the caller's base without independently requiring that base below streets. The physical builder needs approved cable curves and tunnel envelopes without changing saved geometry. Affects Atlas and Engine.
- Generated records are mutable JavaScript objects and may share references with inputs/constants. Ownership/freeze semantics for immutable runtime snapshots need agreement without changing serialized results. Affects all direct callers.

## Open stage decisions

1. Behavior when an optional link cannot fit a small city.
2. Agreement and publication of the physical build schema.
3. Whether Links accepts only finalized Atlas plans and emits models, materials and clearance.
4. Whether Atlas approves rooftop span pairs before the post-Exterior fitting pass.
5. Whether an infeasible planned link returns a conflict to Atlas or may be omitted.
6. Whether Links remains separate from Streets.
