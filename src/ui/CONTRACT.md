# CONTRACT: Links preview

Purpose: displays an Atlas blueprint and generated Connections layers with seed, visibility, clock and viewport controls.

## Input

`AppView(input, actions)` in [views/AppView.ts](views/AppView.ts) takes [PreviewInput and PreviewActions](schema.ts): Atlas, generated output, seed/source labels, a generation callback and a computed-frame callback. The [root controller](../preview.ts) owns generation and signal/vehicle queries. Presentation owns only display state.

[layout.json](layout.json) defines the page and controls through [LayoutNode](schema.ts): tag, attributes, text or binding, named action/event, children and component slots. [ui/layout.ts](ui/layout.ts) creates each declared element. Field labels, slider limits, presets and button actions come from JSON.

## Output and components

- `AppView.el`: DOM page; `fit()` sizes the map, `showMessage(message)` shows a dismissible notice, `dispose()` releases clock frames and notification timers.
- `MapView(atlas, output, frameAt, onViewportChange?)`: canvas block, [components/MapView.ts](components/MapView.ts). `setVisible`, `setTime`, `resize`, `zoom`, `resetView`, `render`; viewport callback gives scale and center. `data-visible-layers` exposes visibility.
- `LayerPanel(layers, onChange)`: one reusable `Toggle` per layer, all visible initially; emits the visible set. `setAll(enabled)` and `visibleLayers` expose state.
- `TimeBar(initialSeconds, onChange)`: slider, readout, presets and Play/Pause; emits seconds. `dispose()` cancels playback.
- `ToastManager.show(message)`: dismissible notice; `dispose()` clears its timers.

## Errors and rules

- The browser entry uses the fixture when its optional Atlas file is absent, malformed or rejected. A regeneration error leaves the last successful preview visible and displays the message.
- Missing Canvas 2D support leaves an unpainted canvas without throwing.
- Display controls do not mutate Atlas or generated output. Time and visibility changes do not regenerate geometry. Corners are square.

## Dependencies

[Root contract](../../CONTRACT.md), browser DOM and Canvas 2D. No runtime dependency packages or sibling imports.
