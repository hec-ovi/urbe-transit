# Box map

- root (connections): deterministic movement networks over Atlas lanes and explicit sidewalk intervals, exact walking reservations with complete spatial queries, boundary access strips with inward entry candidates, original paving boundary candidates, physical crossing cuts and elevation authority, contract in CONTRACT.md. Depends on Atlas, nested junction topology and Exterior's stable external attachments for the rooftop pass.
- src/networks/junctions: merges overlapping street endpoints and preserves ordered sidewalk boundary connections, contract in src/networks/junctions/CONTRACT.md. Depends on root's Atlas graph and caller-owned paving proofs.
- src/rooftop: deterministic post-exterior antenna span fitter with spatial queries over complete city attachment and obstacle scenes, contract in src/rooftop/CONTRACT.md. Depends on Connections primitives, its request contract and Exterior's stable attachment shape.
- src/ui: preview box (2D layer map, pan and zoom, layer toggles). Presentation only, contract in src/ui/CONTRACT.md. Depends on root's output document.
