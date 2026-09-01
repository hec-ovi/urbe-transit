# Changelog

0.2.1: a street edge carries lanes when it has a carriageway and is valid when its carriageway plus sidewalks are positive, so atlas alleys (carriageway 0, all sidewalk) generate as pedestrian ground with the top wire density. The pipeline test runs over every committed atlas sample.

0.2: wires cross streets overhead, facade to facade, anchored in a 4 to 8 m band; density follows the street class, so alleys and narrow short streets carry several per block and avenues none. Atlas street classes read additively, with `alley` as the top wire class and no car lanes.

0.1: deterministic generator for inter-building links (bridges, AC tubes, wires, tunnels) with exact miter-cut apertures, walk graph with signal-synced crossings, lane graph, transit timetables with closed-form vehicle positions, air corridors; fixture city, contract tests, 2D layer preview.
0.0: scaffold, contract pending.
