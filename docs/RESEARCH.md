# Research conclusions (2026 survey)

Compact conclusions driving the contract and implementation. Full sources at the end.

## Inter-building links
- No published pair-selection algorithm for procedural cities; real skyway systems (Minneapolis Skyway, Calgary +15) give the rules: links join buildings across one street (span 20-40 m), at a consistent datum floor (2nd-3rd), concentrated in dense commercial districts, grown to keep the network one connected component.
- Adopted selection: candidate pairs = facing buildings under a span cap, both tall enough to share the datum floor, scored by district kind and tier, greedy pass favoring the existing connected component, seeded tie-breaking.
- Exact face cut is closed-form (CAD miter cut): box tube along direction d meeting a wall plane = intersect the four prism corner lines with the plane, giving a sheared quad (stretched 1/cos t along the tilt axis); cylinder gives an exact ellipse (semi-major r/cos t). End-capping the tube with the face plane closes the joint with zero gap. No mesh booleans needed.

## Lane and walk networks
- Reference model is SUMO plus Lanelet2: directed edges with per-lane index, speed, width, lane-change adjacency flags, and explicit lane-to-lane connections with turn direction through intersections. UE5 City Sample (ZoneGraph) confirms polyline lane graphs beat navmesh for procedural cities and cheap crowds.
- Sidewalks derive by offsetting street centerlines by roadWidth/2 + sidewalkWidth/2 per side; corners join the offsets; crosswalks span each approach set back from the corner (SUMO crossing + walkingarea model).
- Signals: SUMO tlLogic is the minimal deterministic schema. Controller = cycle, offset, phase list, each phase a duration plus a state string with one char per controlled link; crossings are extra link indices in the same string, so walk phases sync with vehicle phases by construction. State at time t = phase containing (t + offset) mod cycle.
- Air corridors: games (Cyberpunk 2077 AVs) and UAM literature use the same shape: fixed-altitude polyline corridors, one flight direction per layer, vertical connectors at designated points.

## Transit routes
- TNDP literature: greedy demand-driven construction (RGA and Pair Insertion lineage) is the deterministic reference; 2024-2026 learned methods still use it as baseline. Demand proxy without real data = gravity model over parcels (residential floor area produces, commercial and office floor area attracts, decayed by network distance).
- Atlas owns line topology (ordered stops and, for buses, the driven street edge list); connections owns lane-level route geometry, elevations (subway below ground), timetables and the closed-form vehicle math.
- Stop spacing norms (for validation, atlas places stops): bus 350-600 m, metro 1-2 km; stops at intersections, far side of the signal, paired with crossings.

## Timetables
- GTFS frequencies with exact_times semantics is the right model: per route, a trip template (arrive and depart offsets per stop) plus service periods (start, end, headway, phase). Departures = start + phase + k*headway. Vehicle position at time t is closed-form: find active departures, interpolate elapsed time in the template, map to shape distance, walk the polyline. No simulation state.
- Headway norms: bus 5-15 min peak, 12-30 midday, 30-60 night; metro 2-5 peak, 6-12 midday, 20 night; commuter rail 10-30 peak. Off-peak values clockface (dividing 60). Day span roughly 05:00-01:00.
- Speeds (commercial, stops included): city bus 19-21 km/h, metro 30-40 km/h, commuter rail 45-60 km/h. Dwell: bus 10-20 s, metro 30 s, rail 45-60 s. Bus signal delay about 10 s per signalized intersection.
- Every game timetable system (OpenTTD, Simutrans, CS2 mods) converges on cyclic trip template + headway per period + phase offset. Fleet size per period = ceil(round trip time / headway).

## Sources
- SUMO networks, pedestrians, traffic lights: sumo.dlr.de/docs
- Lanelet2 map framework paper (researchgate 329620184)
- UE5 ZoneGraph quick start (dev.epicgames.com)
- GTFS Schedule reference, frequencies (gtfs.org)
- TNDP: arxiv 2412.12109, 2404.05894; Springer TNDP survey s41062-025-02356-5
- Stop spacing: humantransit.org, transitwiki.org, WMATA stop design guidelines
- Skyways: Plus 15 (Wikipedia), placesjournal.org multilevel-metropolis
- Miter cut geometry: xometry.com tube miter design, Wikipedia miter joint
- Dwell and speeds: TCQSM part 4 (trb.org), USF bus dwell study
- Air corridors: sciencedirect S0376042121000312, S1366554524004502
