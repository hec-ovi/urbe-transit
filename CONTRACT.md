# CONTRACT: connections

Purpose: deterministically computes inter-building links (bridges, AC tubes, wires, tunnels), building apertures for them, and all movement networks (NPC walk paths, car lanes, bus, train, subway, air paths).

Status: draft, schemas pending research.

## In (must cover)
- atlas world blueprint
- seed
- feature toggles per link kind (air tunnels, underground tunnels, wires, bridges)

## Out (must cover)
- link layer: each link with endpoints (building id, floor, face), geometry, kind
- aperture list per building: exact position, dimensions, kind (consumed by exterior)
- path networks: sidewalks with crossings and light sync, car lanes with speeds, transit routes with timetables, air paths
- link references: building id to building id with kind

## Errors
Closed set, to be defined.

## Depends on
- ../atlas/CONTRACT.md
