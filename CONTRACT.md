# CONTRACT: connections

Purpose: deterministically computes inter-building links (bridges, AC tubes, wires, tunnels) with exact building apertures, and every movement network (sidewalk walk graph with signal-synced crossings, car lanes, bus, subway and train routes with timetables, air corridors) from an atlas blueprint.

Status: stable. Schemas below are the coupling surface.

## Entry point
`generate(atlas, params) -> output` (library, `src/index.ts`; pure, synchronous, no IO).
Same inputs give a byte-identical output document. No LLM, no randomness outside the seed.

Preview: `npm run dev` serves a 2D pan and zoom map over the fixture atlas with every layer toggleable. `npm test` runs the contract tests.

## In
- atlas blueprint: `CityBlueprint` per ../atlas/CONTRACT.md (authority: ../atlas/schema/blueprint.ts). The consumed subset is mirrored at [src/types/atlas.ts](src/types/atlas.ts); the fixture city (`fixtures/atlas.fixture.ts`) stands in when atlas is absent.
- params: [schemas/params.schema.json](schemas/params.schema.json). Seed, per-kind toggles (an ancient city runs with tunnels only, or nothing), link limits, day span.

Conventions (project wide): units meters, ground plane XZ, +Y up, 2D points [x, z], 3D points [x, y, z], polygons CCW.

## Out
One document: [schemas/output.schema.json](schemas/output.schema.json)
- `links`: [schemas/link.schema.json](schemas/link.schema.json). Each link: kind, both endpoints (building, floor, face, aperture), centerline path, cross section, walkable flags, length.
- `apertures`: [schemas/aperture.schema.json](schemas/aperture.schema.json). Per building opening: face index, center u along the face, absolute vertical base, width, height, and the exact cut polygon on the face plane (closed-form miter cut, so a diagonal tube closes with zero gap). Floor index is advisory only; exterior aligns a floor plate to each base and carves the cut. Wire anchors are mounting footprints, not holes: exterior keeps the region clear and emits an anchor node.
- `linkRefs`: building id to building id with kind, for quests.
- `networks`: [schemas/networks.schema.json](schemas/networks.schema.json). Walk graph (sidewalks, corners, crossings with signal references), road lane graph (per-lane speed, direction, lane-change adjacency, turn connections), signal controllers (cycle, offset, phases with per-link state strings; walk phases share the string), transit routes (shape, stops with shape distance, trip template, headway service periods; vehicle position at any time t is closed-form), air corridors (fixed altitude, one direction per layer).
- `layers`: manifest of the toggleable preview layers present.

## Errors
Closed set, thrown as `ConnectionsError { code, message, path }`:
- `E_ATLAS_INVALID`: blueprint fails schema or topology checks (dangling ids, footprint not counter-clockwise, degenerate geometry).
- `E_PARAMS_INVALID`: params fail schema or range checks.

Anything the toggles request that the atlas cannot feed (subway on, no stations) yields that layer empty, never an error.

## Invariants
- Determinism: identical atlas and params, identical output.
- Face convention: face i of a building is the vertical quad over footprint segment i to i+1; the outward normal points away from the footprint interior. Face-local frame: U along the segment from vertex i, V along +Y.
- Every aperture lies on its face within bounds, inside the building envelope; every cut polygon vertex lies exactly in the face plane. On one building, two aperture bases are either equal or at least 2.5 m apart, and apertures never overlap.
- Link paths terminate exactly on the two face planes; `linkRefs` matches `links` one to one. An above-ground link never passes through a third building's volume.
- Signal cycle equals the sum of its phase durations; every crossing and turn connection references an existing signal and a link index inside its state string.
- Trip template offsets are non-decreasing with depart >= arrive; service periods do not overlap and stay inside the day span.

## Depends on
- ../atlas/CONTRACT.md (blueprint shape pending there; this box's atlas-blueprint schema is the consumed subset and the sync point)
