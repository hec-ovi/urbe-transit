# Box map

| Box | Purpose | Inputs / outputs | Dependencies |
| --- | --- | --- | --- |
| [Root](../CONTRACT.md) | Computes links and movement networks | [Atlas](../src/types/atlas.ts), [params](../schemas/params.schema.json) / [output](../schemas/output.schema.json) | Atlas, Exterior floor families and 4.5 m generation policy, junctions, rooftop |
| [Junctions](../src/networks/junctions/CONTRACT.md) | Connects original street sides | [Request and result](../src/networks/junctions/schema.ts) | Root routing, Atlas identities |
| [Rooftop](../src/rooftop/CONTRACT.md) | Fits cables around scene obstacles | [Request](../schemas/rooftop-span-request.schema.json) / [result](../schemas/rooftop-span-output.schema.json) | Root geometry, Exterior attachments |
| [Preview](../src/ui/CONTRACT.md) | Displays generated layers | [Presentation input](../src/ui/schema.ts) / DOM and canvas | Root output, [preview controller](../src/preview.ts) |

- [API skill](../SKILL.md): calls, defaults and worked example.
- [Issues](ISSUES.md): proposed Atlas link plan and decisions for the orchestrator.
- `REQUIREMENTS.md`, `TASKS.md`: local user brief and task status, gitignored.
