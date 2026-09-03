# CONTRACT: connections/ui

Purpose: 2D preview of a connections export over its atlas: pan and zoom map, every layer toggleable, a clock that drives signal states and vehicle positions.

Presentation only, no business logic; it consumes `generate()` output and the closed-form utilities (`signalStateAt`, `transitVehiclesAt`).

## Views
- `AppView(atlas, initialSeed, source?)`: root layout. Seed input plus Generate button rebuild the document; `fit()` sizes the canvas. Property: `el`.
- `MapView(atlas, output, onViewportChange?)`: canvas map. Methods: `setVisible(set)`, `setTime(seconds)`, `resize(w, h)`, `zoom(factor)`, `resetView()`, `render()`. Wheel and keyboard zoom, pointer drag pans. Mirrors visible layers to `data-visible-layers` on its element.

## Widgets
- `LayerPanel(layers, onChange)`: one toggle per export layer, all on at start. Event: `onChange(visibleSet)`. Method: `setAll(enabled)`. Property: `visibleLayers`.
- `TimeBar(initialSeconds, onChange)`: slider 00:00-24:00, HH:MM readout, Play advances a minute per frame. Event: `onChange(seconds)`. Property `time`.

## Components
- `Toggle(label, color, checked, onChange)`: checkbox row with a color swatch. Method: `setChecked(checked)`.
- `ToastManager.show(message, options?)`: dismissible status message with `info`, `success` or `warning` state.

## Out

A mounted DOM page with source and seed controls, one toggle per published layer, a simulation clock, viewport status, notifications and a 2D canvas. The canvas paints the Atlas base plus only the selected Connections layers at the selected time.

## Errors

- The preview entrypoint catches an unavailable, malformed or contract-invalid Atlas sample and mounts the fixture city.
- Direct `AppView` construction may propagate `E_ATLAS_INVALID` or `E_PARAMS_INVALID` from the root contract.
- An unavailable Canvas 2D context leaves the canvas unpainted and does not throw.

## Invariants

- The UI does not alter Atlas or Connections data and contains no network, link or timetable rules.
- Every `output.layers` entry has one toggle and starts visible. Visibility changes only painting and the observable `data-visible-layers` value.
- Clock changes redraw signal and vehicle state through the root utilities without regenerating the output.
- Square corners throughout (`styles.css`).

## Depends on

- [Root Connections contract](../../CONTRACT.md): `generate`, `signalStateAt`, `transitVehiclesAt`, Atlas input and Connections output.
- Browser DOM and Canvas 2D. The Vite development route supplies the optional Atlas sample.
