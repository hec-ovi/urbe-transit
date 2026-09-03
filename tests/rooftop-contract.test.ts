import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ConnectionsError, generateRooftopSpans, type RooftopSpanRequest } from '../src'
import { boxVolume, twoRoofRequest } from './rooftop-fixtures'

const schema = (name: string) => JSON.parse(readFileSync(resolve('schemas', name), 'utf8')) as Record<string, any>

describe('generateRooftopSpans: public contract', () => {
  it('publishes linked request, span and output schemas covering every emitted field', () => {
    const requestSchema = schema('rooftop-span-request.schema.json')
    const spanSchema = schema('rooftop-span.schema.json')
    const outputSchema = schema('rooftop-span-output.schema.json')
    const request = twoRoofRequest()
    const output = generateRooftopSpans(request)
    const span = output.spans[0]

    expect(requestSchema.required.sort()).toEqual(['attachments', 'seed', 'volumes'])
    expect(Object.keys(requestSchema.properties).sort()).toEqual(Object.keys(request).sort())
    expect(Object.keys(requestSchema.$defs.params.properties).sort()).toEqual(Object.keys(request.params!).sort())
    expect(Object.keys(requestSchema.$defs.attachmentRef.properties).sort()).toEqual(
      Object.keys(request.attachments[0]).sort(),
    )
    expect(outputSchema.properties.spans.items.$ref).toBe('urbe/connections/rooftop-span')
    expect(Object.keys(output).sort()).toEqual([...outputSchema.required].sort())
    expect(Object.keys(span).sort()).toEqual([...spanSchema.required].sort())
    expect(Object.keys(span.catenary).sort()).toEqual([...spanSchema.$defs.catenary.required].sort())
    expect(requestSchema.$defs.attachmentRef.properties.attachment.oneOf).toHaveLength(2)
    expect(requestSchema.$defs.volume.properties.kind.enum).toEqual([
      'building', 'facade', 'roof', 'opening', 'access', 'equipment', 'reservation',
    ])
  })

  it('is byte-identical for the same values even when input arrays arrive in another order', () => {
    const request = twoRoofRequest()
    const reordered = {
      ...twoRoofRequest(),
      attachments: [...request.attachments].reverse(),
      volumes: [...request.volumes].reverse(),
    }
    expect(JSON.stringify(generateRooftopSpans(request))).toBe(JSON.stringify(generateRooftopSpans(reordered)))
  })

  it('rejects every invalid boundary shape through the closed rooftop error', () => {
    const invalid: unknown[] = [
      null,
      { ...twoRoofRequest(), extra: true },
      { ...twoRoofRequest(), seed: '' },
      { ...twoRoofRequest(), attachments: 'not-an-array' },
      {
        ...twoRoofRequest(),
        attachments: [{ ...twoRoofRequest().attachments[0], attachment: { ...twoRoofRequest().attachments[0].attachment, extra: true } }],
      },
      {
        ...twoRoofRequest(),
        attachments: [{
          buildingId: 'building-a',
          attachment: {
            id: 'directional', position: [0, 20, 0], orientation: 'directional', normal: [2, 0, 0], clearanceRadius: 1,
          },
        }],
      },
      { ...twoRoofRequest(), volumes: [{ ...twoRoofRequest().volumes[0], unexpected: true }] },
      { ...twoRoofRequest(), params: { ...twoRoofRequest().params, unexpected: true } },
      {
        ...twoRoofRequest(),
        volumes: [{
          ...boxVolume('clockwise', 'building', -2, -2, 2, 2, 0, 12, 'building-a'),
          footprint: [[-2, 2], [2, 2], [2, -2], [-2, -2]],
        }],
      },
      { ...twoRoofRequest(), params: { thickness: { min: 0, max: 0.1 } } },
    ]
    for (const request of invalid) {
      expect(() => generateRooftopSpans(request as RooftopSpanRequest)).toThrowError(
        expect.objectContaining({ name: 'ConnectionsError', code: 'E_ROOFTOP_INPUT_INVALID' }),
      )
    }
  })

  it('exports the expanded error type without changing the existing error class', () => {
    expect(new ConnectionsError('E_ROOFTOP_INPUT_INVALID', 'x').code).toBe('E_ROOFTOP_INPUT_INVALID')
  })
})
