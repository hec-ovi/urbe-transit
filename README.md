# connections

Links, transit paths and movement networks for the urbe city world. From an atlas blueprint and a seed, it deterministically computes every inter-building link (bridges, walkable AC tubes, wires, underground tunnels) with the exact aperture each building must carve, plus all movement networks: sidewalks with signal-synced crossings, car lanes, bus, subway and train routes with timetables, and air corridors.

## Use

```ts
import { generate } from './src'
const output = generate(atlasBlueprint, { seed: 'alpha' })
```

Same inputs, byte-identical output. The contract and schemas live in CONTRACT.md and schemas/.

## Commands

- `npm run dev`: 2D preview over the fixture city, every layer toggleable, clock drives signals and vehicles.
- `npm test`: contract tests.
- `npm run build`: typecheck and bundle.

## Layout

- `src/` generator: links, apertures, networks; `src/ui/` preview (views, widgets, components).
- `schemas/` output JSON Schemas; `src/types/atlas.ts` the consumed atlas subset.
- `fixtures/` standalone fixture atlas; `tests/` contract tests.
