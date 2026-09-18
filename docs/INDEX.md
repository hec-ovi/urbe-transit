# Box map

| Box | Purpose | Inputs / outputs | Dependencies |
| --- | --- | --- | --- |
| [Root](../CONTRACT.md) | Computes links, apertures, movement networks and rooftop cables | [Atlas](../src/types/atlas.ts), [params](../schemas/params.schema.json) / [output](../schemas/output.schema.json); [rooftop request](../schemas/rooftop-span-request.schema.json) / [rooftop result](../schemas/rooftop-span-output.schema.json) | Atlas, Exterior floor families and 4.5 m generation policy, junctions, rooftop |
| [Junctions](../src/networks/junctions/CONTRACT.md) | Connects original street sides | [Request and result](../src/networks/junctions/schema.ts) | Root routing, Atlas identities |
| [Rooftop](../src/rooftop/CONTRACT.md) | Fits cables around scene obstacles | [Request](../schemas/rooftop-span-request.schema.json) / [result](../schemas/rooftop-span-output.schema.json) | Root geometry, Exterior attachments |
| [Preview](../src/ui/CONTRACT.md) | Displays generated layers | [Presentation input](../src/ui/schema.ts) / DOM and canvas | Root output, [preview controller](../src/preview.ts) |

- [README](../README.md): how to run the library and 2D preview.
- [API skill](../SKILL.md): calls, defaults and worked example.
- [Changelog](../CHANGELOG.md): present-state release notes.
- [Issues](ISSUES.md): open Atlas handoff and coordination questions.
