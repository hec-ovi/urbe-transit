# Box map

- root (connections): deterministic generator, contract in CONTRACT.md. Depends on atlas.
- src/rooftop: deterministic post-exterior antenna span fitter over caller-supplied attachments and obstacle volumes, contract in src/rooftop/CONTRACT.md. Depends only on Connections primitives and its request contract.
- src/ui: preview box (2D layer map, pan and zoom, layer toggles). Presentation only, contract in src/ui/CONTRACT.md. Depends on root's output document.
