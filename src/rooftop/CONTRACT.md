# CONTRACT: rooftop spans

Purpose: fits a restrained deterministic subset of antenna cables between stable rooftop attachments.

## In

`generateRooftopSpans(request)` takes [the request schema](../../schemas/rooftop-span-request.schema.json). The caller supplies the complete attachment and closed vertical-prism obstacle scene. No sibling runtime state is read.

## Out

[The output schema](../../schemas/rooftop-span-output.schema.json) contains zero or more [spans](../../schemas/rooftop-span.schema.json). Each span gives stable endpoint refs, exact catenary coefficients, a derived rendering path, thickness, sag, slack and length.

## Error

`E_ROOFTOP_INPUT_INVALID`: the request fails schema, identity, polygon, range or owner-volume completeness checks.

## Invariants

- Pair priority and shape depend only on stable refs and seed.
- Directional attachments face their partner within tolerance.
- Selection obeys distance, ratio, endpoint-use and total caps. Empty output is valid.
- Collision is proved over the continuous catenary against exact ground overlap intervals and analytic height bounds. Samples never decide acceptance.
- A touching or unproved span is omitted without clipping.

## Depends on

Connections' shared deterministic RNG, vector, polygon, error and version primitives.
