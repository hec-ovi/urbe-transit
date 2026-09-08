# Box map

- root (connections): deterministic generator and movement networks over Atlas lane, explicit sidewalk interval and elevation authority, contract in CONTRACT.md. Depends on Atlas and Exterior's stable external attachment contract for the rooftop pass.
- src/networks/junctions: merges overlapping street endpoints and preserves ordered sidewalk boundary connections, contract in src/networks/junctions/CONTRACT.md. Depends on root's Atlas graph and caller-owned paving proofs.
- src/rooftop: deterministic post-exterior antenna span fitter with spatial queries over complete city attachment and obstacle scenes, contract in src/rooftop/CONTRACT.md. Depends on Connections primitives, its request contract and Exterior's stable attachment shape.
- src/ui: preview box (2D layer map, pan and zoom, layer toggles). Presentation only, contract in src/ui/CONTRACT.md. Depends on root's output document.
