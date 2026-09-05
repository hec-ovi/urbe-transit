# CONTRACT: junction topology

Purpose: preserves street-side connections through overlapping junction endpoints.

Gate: `npx vitest run --config src/networks/junctions/vitest.config.ts` from the Connections root.

## In

- `buildJunctionTopology(input)`: nodes, graph edges and grouped endpoints, [schema.ts](schema.ts). Each endpoint supplies its outward tangent, clearance along the edge, and outward-relative walking port IDs. A null port marks a boundary barrier.
- `connectJunctions(input)`: the same graph, a port map, positive `maximumConnectorWidth`, and caller-owned full-width paving router, [schema.ts](schema.ts). Each port gives its exact 3D position and width. The router receives both port IDs, required width, original complex node and edge IDs, and directed internal-edge traces. It returns a proved path or null.

Clearances include the complete covered walking interval and the caller's roadway setback. An endpoint with no covered interval consumes the complete edge. Groups have stable unique IDs and preserve Atlas's level-separated connection partition.

## Out

- `JunctionTopology`, [schema.ts](schema.ts): complexes with original group, node and consumed edge IDs; ordered boundary cycles; same-side connector demands with directed traces through consumed edges.
- `ConnectedJunctions`, [schema.ts](schema.ts): topology plus routed connections with exact 3D paths and width `min(maximumConnectorWidth, from.width, to.width)`. The caller proves each complete path inside authored paving, outside roadway.

## Invariants

- Clearances meeting within Atlas's 1 mm coordinate tolerance consume the edge's middle run. Its endpoint groups merge; its original edge ID and directed boundary traces remain present.
- Boundary order follows each group's counter-clockwise arm order, crossing consumed edges to the next group. Distant endpoints are never angle-sorted around an invented center.
- Every external arm occurs once in a boundary cycle. Every consumed directed half-edge occurs once in a boundary trace or closed interior boundary. A side with no port remains a boundary barrier; no pairing jumps over it.
- Each connector joins the left port of one outward arm to the right port of the next. Original groups remain distinct except through a consumed edge. Equal height or spatial overlap alone never joins disconnected groups.
- A same-arm boundary step with no consumed-edge trace is an open terminal, with no connector. A same-arm step around consumed edges still requires its proved route.
- Walking joins boundary steps with both ports present. Null sides remain barriers; highway-only complexes have no walking output. A referenced port ID must exist. A consumed complex or closed inner boundary containing walking ports needs an external attachment. Routing preserves exact port positions and width. An unproved route fails the complete operation. No failed connection is silently dropped.
- Ordering and generated IDs depend on stable input identities and geometry, not collection order. Inputs are not mutated.

## Errors

`JunctionTopologyError`, [schema.ts](schema.ts), has a closed code set:

- `E_JUNCTION_INPUT`: invalid IDs, incidence, group partition, dimensions, tangents or missing referenced ports.
- `E_JUNCTION_UNRESOLVED`: a demanded walking connection lacks a proved full-width route, a returned path changes either endpoint or contains invalid points, or a consumed walking component has no external attachment.

## Dependencies

- [Connections](../../../CONTRACT.md): movement port IDs and caller-owned geometry routing.
- [Atlas](../../../../atlas/CONTRACT.md): street graph identity, connection partition and 1 mm geometry grid. No sibling runtime imports.
