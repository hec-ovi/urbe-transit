# Changelog

0.7: nothing this box builds enters a station. A link is refused where its solid overlaps a platform box, an entrance shaft or a platform passage, in plan and in height, so a bridge still flies over a platform at grade and a tunnel goes around a shaft instead of through it.

0.6: an AC tube is 2.0 by 2.4 m, so the player it is walkable for can stand up inside it. The contract publishes the cross section of every link kind and holds every walkable-inside link to standing room.

0.5: the movement networks carry height. Every lane and walk edge holds the level of the street it runs on, turn connections stay inside one level, and a node whose streets sit at different levels is a grade separation with no light on the deck. Rail lines ride at the level the blueprint gives them.

0.4: aperture bases on one building admit a floor stack of its family's floor heights inside the parcel envelope, so exterior can always pin a floor to every base. A base that would leave no legal floor count is refused and the link takes the next one up.

0.3: bridges and AC tubes fly over the street, never through it: a link crossing a street keeps its underside 5.5 m above that street's surface, so one crossing a highway deck starts at 13.5 m. Street `level` is read from the blueprint.

0.2.1: a street edge carries lanes when it has a carriageway and is valid when its carriageway plus sidewalks are positive, so atlas alleys (carriageway 0, all sidewalk) generate as pedestrian ground with the top wire density. The pipeline test runs over every committed atlas sample.

0.2: wires cross streets overhead, facade to facade, anchored in a 4 to 8 m band; density follows the street class, so alleys and narrow short streets carry several per block and avenues none. Atlas street classes read additively, with `alley` as the top wire class and no car lanes.

0.1: deterministic generator for inter-building links (bridges, AC tubes, wires, tunnels) with exact miter-cut apertures, walk graph with signal-synced crossings, lane graph, transit timetables with closed-form vehicle positions, air corridors; fixture city, contract tests, 2D layer preview.
0.0: scaffold, contract pending.
