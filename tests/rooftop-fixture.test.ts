import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { generateRooftopSpans, type RooftopSpanRequest } from '../src'

const fixturePath = resolve('fixtures/rooftop-spans.request.json')
const fixtureBytes = (): Buffer => readFileSync(fixturePath)
const loadFixture = (): RooftopSpanRequest => JSON.parse(fixtureBytes().toString('utf8')) as RooftopSpanRequest

describe('generateRooftopSpans: Exterior handoff fixture', () => {
  it('fits selected real attachments while retaining a quiet roof', () => {
    const request = loadFixture()
    const output = generateRooftopSpans(request)
    expect(output.spans).toHaveLength(2)
    expect(output.spans.length).toBeLessThanOrEqual(request.params!.maxSpans!)
    expect(output.spans.some((span) => span.a.buildingId === 'p135' && span.b.buildingId === 'p136')).toBe(true)
    expect(request.volumes.some((volume) => volume.buildingId === 'p111')).toBe(true)
    expect(request.attachments.some((ref) => ref.buildingId === 'p111')).toBe(false)
    expect(JSON.stringify(generateRooftopSpans(loadFixture()))).toBe(JSON.stringify(output))
    expect(createHash('sha256').update(fixtureBytes()).digest('hex')).toBe(
      'ff71ee4b6754868a21c395dffc96fc0064423a13fa39828e490db654b657b64e',
    )
    expect(createHash('sha256').update(JSON.stringify(output)).digest('hex')).toBe(
      '32c7c2634de7f0ae47d9c5f360e18de176e9be279d46ea55c334325fc5f17333',
    )
  })
})
