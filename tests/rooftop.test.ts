import { expect, it } from 'vitest'
import requestSchema from '../schemas/rooftop-span-request.schema.json'
import outputSchema from '../schemas/rooftop-span-output.schema.json'
import spanSchema from '../schemas/rooftop-span.schema.json'
import { generateRooftopSpans, type RooftopSpanRequest } from '../src'
import { boxVolume, directional, omni, twoRoofRequest } from './rooftop-fixtures'

it('pairs directional attachments only when both headings face the partner', () => {
  const request = twoRoofRequest()
  request.attachments = [
    directional('building-a', 'east', [0, 20, 0], [1, 0, 0]),
    directional('building-b', 'west', [40, 20, 0], [-1, 0, 0]),
  ]
  expect(generateRooftopSpans(request).spans).toHaveLength(1)

  request.attachments[1] = directional('building-b', 'west', [40, 20, 0], [1, 0, 0])
  expect(generateRooftopSpans(request).spans).toHaveLength(0)
})

it('applies stable subset caps without making a taller endpoint mandatory', () => {
  const request: RooftopSpanRequest = {
    ...twoRoofRequest(),
    attachments: [
      omni('building-a', 'a', [0, 20, 0]),
      omni('building-b', 'b-high', [40, 30, 0]),
      omni('building-c', 'c', [80, 20, 0]),
      omni('building-d', 'd', [120, 20, 0]),
    ],
    volumes: [
      boxVolume('a-solid', 'building', -2, -2, 2, 2, 0, 12, 'building-a'),
      boxVolume('b-solid', 'building', 38, -2, 42, 2, 0, 20, 'building-b'),
      boxVolume('c-solid', 'building', 78, -2, 82, 2, 0, 12, 'building-c'),
      boxVolume('d-solid', 'building', 118, -2, 122, 2, 0, 12, 'building-d'),
    ],
    params: { ...twoRoofRequest().params, maxDistance: 45, maxSpans: 1 },
  }
  const selected = generateRooftopSpans(request)
  expect(selected.spans).toHaveLength(1)
  expect(generateRooftopSpans({ ...request, params: { ...request.params, maxSpans: 0 } }).spans).toEqual([])
  expect(generateRooftopSpans({ ...request, params: { ...request.params, selectionRatio: 0 } }).spans).toEqual([])
})

it('accepts quiet roofs and no feasible pair as normal empty results', () => {
  const quiet = twoRoofRequest()
  quiet.attachments = []
  expect(generateRooftopSpans(quiet).spans).toEqual([])

  const distant = twoRoofRequest()
  distant.params = { ...distant.params, maxDistance: 10 }
  expect(generateRooftopSpans(distant).spans).toEqual([])
})

it('recomputes the complete catenary when either stable endpoint moves', () => {
  const base = twoRoofRequest()
  const original = generateRooftopSpans(base).spans[0]

  const movedB = twoRoofRequest()
  movedB.attachments[1].attachment.position = [42, 23, 3]
  const afterB = generateRooftopSpans(movedB).spans[0]
  expect(afterB.id).toBe(original.id)
  expect(afterB.path).not.toEqual(original.path)
  expect(afterB.path.at(-1)).toEqual([42, 23, 3])
  expect(afterB.catenary).not.toEqual(original.catenary)

  const movedA = twoRoofRequest()
  movedA.attachments[0].attachment.position = [-2, 22, -4]
  movedA.volumes[0].footprint = [[-4, -6], [0, -6], [0, -2], [-4, -2]]
  const afterA = generateRooftopSpans(movedA).spans[0]
  expect(afterA.id).toBe(original.id)
  expect(afterA.path).not.toEqual(original.path)
  expect(afterA.path[0]).toEqual([-2, 22, -4])
  expect(afterA.catenary).not.toEqual(original.catenary)
})

it('publishes path points and metrics from the authoritative catenary', () => {
  const request = twoRoofRequest(), before = structuredClone(request)
  const output = generateRooftopSpans(request), span = output.spans[0]
  expect(request).toEqual(before)
  expect(output.meta).toEqual({ seed: request.seed, schemaVersion: '1.0.0', generatorVersion: '0.10.1' })
  expect(Object.keys(output).sort()).toEqual([...outputSchema.required].sort())
  expect(Object.keys(span).sort()).toEqual([...spanSchema.required].sort())
  expect(Object.keys(request).sort()).toEqual(Object.keys(requestSchema.properties).sort())
  expect(Object.keys(request.params!).sort()).toEqual(Object.keys(requestSchema.$defs.params.properties).sort())
  request.attachments.reverse(); request.volumes.reverse()
  expect(generateRooftopSpans(request)).toEqual(output)
  const curve = span.catenary
  for (let index = 0; index < span.path.length; index++) {
    const distance = curve.horizontalDistance * index / (span.path.length - 1)
    const expectedY = curve.scale * Math.cosh((distance - curve.horizontalOffset) / curve.scale) + curve.verticalOffset
    expect(span.path[index][1]).toBeCloseTo(expectedY, 10)
  }
  expect(span.path[0]).toEqual(span.a.position)
  expect(span.path.at(-1)).toEqual(span.b.position)
  expect(span.length).toBeGreaterThan(Math.hypot(40, 0))
  expect(span.slack).toBeCloseTo(span.length - 40, 10)
  expect(span.sag).toBeGreaterThan(0)
  expect(span.thickness).toBe(0.04)
})
it('rejects a thin obstacle between every emitted path sample', () => {
  const request = twoRoofRequest()
  request.params = { ...request.params, pathSegments: 2 }
  const baseline = generateRooftopSpans(request).spans[0]
  expect(baseline.path.map((point) => point[0])).toEqual([0, 20, 40])

  const curve = baseline.catenary
  const x = 10
  const y = curve.scale * Math.cosh((x - curve.horizontalOffset) / curve.scale) + curve.verticalOffset
  request.volumes.push(boxVolume('between-samples', 'equipment', 9.95, -0.1, 10.05, 0.1, y - 0.02, y + 0.02))
  expect(generateRooftopSpans(request).spans).toEqual([])
})

it('protects attachment roof-plane clearance from low reserved geometry', () => {
  const request = twoRoofRequest()
  request.attachments[0].attachment.clearanceRadius = 1
  request.volumes.push(boxVolume('roof-access', 'access', -0.1, 0.85, 0.1, 1.05, 0, 2, 'building-a'))
  expect(generateRooftopSpans(request).spans).toEqual([])
})

it('reports an incomplete attachment-owner scene through E_ROOFTOP_INPUT_INVALID', () => {
  const request = twoRoofRequest()
  request.volumes = []
  expect(() => generateRooftopSpans(request)).toThrowError(expect.objectContaining({
    name: 'ConnectionsError', code: 'E_ROOFTOP_INPUT_INVALID', message: expect.any(String), path: 'request.attachments[0].buildingId',
  }))
})
