# CONTRACT: connections

Purpose: deterministically computes inter-building links (bridges, AC tubes, wires, tunnels) with exact building apertures, and every movement network (sidewalk walk graph with signal-synced crossings, car lanes, bus, subway and train routes with timetables, air corridors) from an atlas blueprint.

Status: v0.9.0 implemented and tested. Schemas below are the coupling surface.

## Entry point
`generate(atlas, params) -> output` (library, `src/index.ts`; pure, synchronous, no IO).
Same inputs give a byte-identical output document. No LLM, no randomness outside the seed.

Preview: `npm run dev` serves a 2D pan and zoom map over the fixture atlas with every layer toggleable. `npm test` runs the contract tests.

## In
- atlas blueprint: `CityBlueprint` per ../atlas/CONTRACT.md (authority: ../atlas/schema/blueprint.ts). The consumed subset is mirrored at [src/types/atlas.ts](src/types/atlas.ts); the fixture city (`fixtures/atlas.fixture.ts`) stands in when atlas is absent.
- params: [schemas/params.schema.json](schemas/params.schema.json). Seed, per-kind toggles (an ancient city runs with tunnels only, or nothing), link limits, day span. For wires the limits read as the street crossing: lengths are the facade-to-facade span, `minBase`/`maxBase` are the anchor height band, `density` is the share of candidate anchor stations along a street that get one.

Each street publishes an `elevationProfile` measured along its centerline. It is the only source for lane, sidewalk and bus height; `level` is only the edge's declared maximum. Street-node `connections` are the only legal transfer groups, including when two disconnected groups happen to have the same height. A station publishes its `platform`, vertical `box`, shafts and one exact 3D `accessPath` per underground entrance.

Street classes come from atlas and the list is additive: `alley` carries the most wire, then `street`, then `road`; `highway` none. A class this box does not know falls back to its carriageway width. An edge with no carriageway is pedestrian ground, all of it sidewalk, and carries no car lanes: that is how an `alley` arrives. An edge is valid when its carriageway plus its two sidewalks are positive; the carriageway alone may be 0.

Conventions (project wide): units meters, ground plane XZ, +Y up, 2D points [x, z], 3D points [x, y, z], polygons CCW.

## Out
One document: [schemas/output.schema.json](schemas/output.schema.json)
- `links`: [schemas/link.schema.json](schemas/link.schema.json). Each link: kind, both endpoints (building, floor, face, aperture), centerline path, cross section, walkable flags, length. Bridges, AC tubes and tunnels pair facing buildings; wires follow the street grid and hang overhead across it. The solid is the cross section swept along the path, closed at both ends by the aperture cuts: bridge 4.0 x 3.2 m (open deck, walking surface at the aperture base), AC tube 2.0 x 2.4 m (closed box, walked over the top or through the inside), tunnel 3.0 x 2.8 m, wire a 0.1 m cable on a catenary.
- `apertures`: [schemas/aperture.schema.json](schemas/aperture.schema.json). Per building opening: face index, center u along the face, absolute vertical base, width, height, and the exact cut polygon on the face plane (closed-form miter cut, so a diagonal tube closes with zero gap). Floor index is advisory only; exterior aligns a floor plate to each base and carves the cut. Wire anchors are mounting footprints, not holes: exterior keeps the region clear and emits an anchor node.
- `linkRefs`: building id to building id with kind, for quests.
- `networks`: [schemas/networks.schema.json](schemas/networks.schema.json). Walk graph with exact 3D paths for sidewalks, crossings, station stairs, passages, platforms and links; road lane graph with exact 3D lanes and turns, speed, direction and lane-change adjacency; signal controllers; transit routes with 3D shapes, stops, trip templates and headway service; air corridors. The 2D `path` fields are compatibility projections of authoritative `path3` fields.
- `layers`: manifest of the toggleable preview layers present.

## Errors
Closed set, thrown as `ConnectionsError { code, message, path }`:
- `E_ATLAS_INVALID`: blueprint fails schema or topology checks (dangling ids, incomplete elevation profile, invalid node connection partition, discontinuous station access, footprint not counter-clockwise, or a street edge with neither carriageway nor sidewalk).
- `E_PARAMS_INVALID`: params fail schema or range checks.

Anything the toggles request that the atlas cannot feed (subway on, no stations) yields that layer empty, never an error.

## Invariants
- Determinism: identical atlas and params, identical output.
- Face convention: face i of a building is the vertical quad over footprint segment i to i+1; the outward normal points away from the footprint interior. Face-local frame: U along the segment from vertex i, V along +Y.
- Every aperture lies on its face within bounds, inside the building envelope; every cut polygon vertex lies exactly in the face plane. On one building, two aperture bases are either equal or at least 2.5 m apart, and apertures never overlap.
- Aperture bases on one building admit a floor stack: exterior pins a floor's walking surface at every base, so the bases plus the floor heights of the parcel type's family leave at least one legal floor count inside the parcel envelope (`minFloors` to `maxFloors` within `maxHeight`). Floor heights and the counting recipe are mirrored from ../exterior/schemas/floor-constants.json in [src/links/stack.ts](src/links/stack.ts). A base that would leave no legal count is refused and the link takes the next one up, or is not built. Wire anchors cut no hole and pin no floor.
- Link paths terminate exactly on the two face planes; `linkRefs` matches `links` one to one. An above-ground link never passes through a third building's volume.
- A bridge or an AC tube flies over every street its complete width overlaps: its underside stands at least 5.5 m above the highest local elevation profile value under the swept link width. One touching a flat 8 m highway deck starts at 13.5 m even when the two centerlines do not cross; one crossing a ramp uses the exact overlapping ramp interval. The underside is the lower aperture base, where the miter cut reaches deepest. A link that cannot clear what it crosses is not built. Tunnels run below every street.
- No link enters a station. A link is refused where its complete swept width overlaps a platform box, an entrance shaft or a platform passage in plan and height. A centerline that clears while the link edge clips is still refused. Height remains part of the test, so a bridge can cross above a platform at grade.
- A link whose `walkable.inside` is set has room to stand in it: 2.1 m of headroom and 0.9 m of width at least. A wire is walkable neither way.
- A wire spans exactly one street: both anchors sit on buildings facing each other across that street's centerline, at the same height inside the anchor band (4 to 8 m by default), and the catenary sags at most 3% of the span below them. Wire count follows the street: several per short block on alleys and narrow streets, few on roads, none on highways.
- Signal cycle equals the sum of its phase durations; every crossing and turn connection references an existing signal and a link index inside its state string.
- Every lane, sidewalk and bus route follows the atlas elevation profile in `path3`, including each ramp breakpoint. Every turn follows one atlas node connection group; equal heights alone never create a transfer. The legacy scalar `level` is the maximum height of the exact path.
- Every underground station entrance joins the walk graph at its published street point. Its stairs and passage copy the atlas access-path segments exactly, consecutive endpoints share one graph node, and the platform handoff joins the station node at the published platform level. No station route is flattened to 2D or inferred from its shaft footprint.
- Trip template offsets are non-decreasing with depart >= arrive; service periods do not overlap and stay inside the day span.

## Depends on
- ../atlas/CONTRACT.md (blueprint v0.15; this box mirrors its consumed movement subset and ignores the additive hydrology document)
