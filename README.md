# Links (connections)

Release 0.10.0. Computes interbuilding link geometry, building apertures and movement networks from an Atlas blueprint, plus rooftop cables from explicit attachments and obstacles. Both library calls are synchronous, deterministic and have no IO.

```ts
import { generate, generateRooftopSpans } from './src/index'
const city = generate(atlasBlueprint, { seed: 'alpha' })
const rooftop = generateRooftopSpans(rooftopRequest)
```

Results are JSON geometry and paths. Materials and model assets are outside the available API. Connections documents use version 0.9.0; rooftop documents use schema 1.0.0 and generator version 0.10.0.

## Run

```sh
npm ci
npm test
npm run build
npm run dev
```

The 2D preview provides seed, layer, clock, pan and zoom controls. `ATLAS_BLUEPRINT` selects a blueprint file; its default is `../atlas/samples/city-urbe.json`. An unavailable or rejected file selects the bundled fixture. Tests use local fixtures only.

## API

[SKILL.md](SKILL.md) provides fields, defaults and a copyable example. [CONTRACT.md](CONTRACT.md) defines schemas, guarantees and errors. [docs/INDEX.md](docs/INDEX.md) maps the implementation; [docs/ISSUES.md](docs/ISSUES.md) lists the proposed Atlas handoff and decisions requiring coordination.
