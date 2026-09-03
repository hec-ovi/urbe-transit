# Changelog

0.10.0: additive post-exterior rooftop antenna span fitting from stable attachment refs and an explicit generic obstacle scene. Seeded directional pairing stays sparse and permits quiet roofs. Accepted cables publish a true catenary, rendering path, thickness, sag, slack and length. Complete-curve collision uses exact ground intervals and analytic height bounds, including endpoint and obstacle clearance. The original connections document remains byte-identical at format 0.9.0; rooftop documents use schema 1.0.0.

0.9.0: road lanes, sidewalks, turns and buses preserve every atlas elevation-profile breakpoint in authoritative 3D paths. Link clearance reads the highest local profile value under its complete width. Transfers follow atlas node connection groups. Underground station entrances copy their exact stairs, passages and platform handoffs into the walk graph. Invalid profiles, topology and access paths fail closed.

0.8: collision and clearance checks use the complete swept width of bridges, tubes, tunnels and wires. Link edges cannot clip stations, third buildings or highway decks, and collinear boundary contact is detected.

0.7: links stay outside station platform boxes, entrance shafts and platform passages in plan and height. Bridges may cross above grade platforms, while tunnels route around station shafts.

0.6: an AC tube is 2.0 by 2.4 m, so the player it is walkable for can stand up inside it. The contract publishes the cross section of every link kind and holds every walkable-inside link to standing room.

0.5: the movement networks carry height. Every lane and walk edge holds the level of the street it runs on, turn connections stay inside one level, and a node whose streets sit at different levels is a grade separation with no light on the deck. Rail lines ride at the level the blueprint gives them.

0.4: aperture bases on one building admit a floor stack of its family's floor heights inside the parcel envelope, so exterior can always pin a floor to every base. A base that would leave no legal floor count is refused and the link takes the next one up.

0.3: bridges and AC tubes fly over the street, never through it: a link crossing a street keeps its underside 5.5 m above that street's surface, so one crossing a highway deck starts at 13.5 m. Street `level` is read from the blueprint.

0.2.1: a street edge carries lanes when it has a carriageway and is valid when its carriageway plus sidewalks are positive, so atlas alleys (carriageway 0, all sidewalk) generate as pedestrian ground with the top wire density. The pipeline test runs over every committed atlas sample.

0.2: wires cross streets overhead, facade to facade, anchored in a 4 to 8 m band; density follows the street class, so alleys and narrow short streets carry several per block and avenues none. Atlas street classes read additively, with `alley` as the top wire class and no car lanes.

0.1: deterministic generator for inter-building links (bridges, AC tubes, wires, tunnels) with exact miter-cut apertures, walk graph with signal-synced crossings, lane graph, transit timetables with closed-form vehicle positions, air corridors; fixture city, contract tests, 2D layer preview.
