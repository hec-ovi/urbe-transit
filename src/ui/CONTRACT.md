# CONTRACT: connections/ui

Purpose: 2D preview of a connections export over its atlas: pan and zoom map, every layer toggleable, a clock that drives signal states and vehicle positions.

Presentation only, no business logic; it consumes `generate()` output and the closed-form utilities (`signalStateAt`, `transitVehiclesAt`).

## Views
- `AppView(atlas, initialSeed)`: root layout. Seed input plus Generate button rebuild the document; `fit()` sizes the canvas. Property `el`.
- `MapView(atlas, output)`: canvas map. Methods `setVisible(set)`, `setTime(seconds)`, `resize(w, h)`, `render()`. Wheel zooms, drag pans. Mirrors visible layers to `data-visible-layers` on its element.

## Widgets
- `LayerPanel(layers, onChange)`: one toggle per export layer, all on at start. Event: `onChange(visibleSet)`. Property `visibleLayers`.
- `TimeBar(initialSeconds, onChange)`: slider 00:00-24:00, HH:MM readout, Play advances a minute per frame. Event: `onChange(seconds)`. Property `time`.

## Components
- `Toggle(label, color, checked, onChange)`: checkbox row with a color swatch.

Square corners throughout (styles.css).
