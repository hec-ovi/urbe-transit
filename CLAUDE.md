# connections: links, transit paths and movement networks

You own this box. You build only what lives in this repo.

## Context (general, do not expand it)
This repo is one isolated layer of a larger build: a seeded, deterministic city world that ends as a playable 3D game (map, buildings, transit, NPCs, quests). Nine layers are built in parallel by separate sessions, each locked to its own repo, coupled only through CONTRACT.md files. Never read another layer's code or tests, only its CONTRACT.md. Your raw requirements are in docs/REQUIREMENTS.md, in the user's own words: they win over any summary here.

## Scope
- From the atlas blueprint, compute every inter-building link: bridges, walkable box-style AC tubes, wires, underground tunnels. Each link selects two buildings, a floor, a face, and emits exact aperture positions and dimensions. Those apertures become constraints the exterior layer must honor.
- Link geometry closes perfectly: a diagonal tube meeting a vertical face gets an exact mathematical cut, no gap.
- Vehicle and NPC movement networks: sidewalk walk paths with crossings synced to traffic lights, car lanes with direction and speed, bus routes with stops and timetables, train and subway lines, air paths. Times, speeds, lane changes, all of it.
- Explicit link references in the output: building A connected to building B, kind bridge (quests use these later).
- Everything exports as toggleable layers over the 2D map, each with its own preview visibility.

## Out of scope
No building geometry, no NPC decision logic (only the path graphs and valid-movement placeholders), no rendering.

## Depends on
../atlas/CONTRACT.md

## Consumers
../exterior, ../simulation, ../engine

## Working order
1. Deep research first: 2026 state of the art on transit network generation, path graphs for crowds and traffic, timetable modeling. Compact conclusions to docs/RESEARCH.md.
2. Draft CONTRACT.md with schemas before code (exterior is blocked on your aperture schema).
3. Implement with tests and the preview.
4. Keep CONTRACT.md and docs/INDEX.md current.

## Hard requirements
- Deterministic: same seed and inputs give identical output. No LLM calls.
- Standalone: runs against a fixture atlas blueprint with no other layer present.
- Preview UI follows src/ui/ with views/, widgets/, components/.

## Coordination
- Read docs/FEEDBACK.md at the start of every session.
- Write blockers and cross-layer questions to docs/ISSUES.md.

## Master requirements (background only)
docs/FULL-REQUIREMENTS.md holds the user's complete raw requirements for the whole project, so you see your surroundings. Read it once for awareness. It never widens your scope: what you build is defined by this file and docs/REQUIREMENTS.md only.
