import { describe, expect, it } from 'vitest'
import { generateRooftopSpans } from '../src'
import { boxVolume, twoRoofRequest } from './rooftop-fixtures'

describe('generateRooftopSpans: continuous collision proof', () => {
  it('rejects a catenary through an intervening building and accepts vertical separation', () => {
    const blocked = twoRoofRequest()
    blocked.volumes.push(boxVolume('middle-building', 'building', 18, -3, 22, 3, 0, 25, 'middle'))
    expect(generateRooftopSpans(blocked).spans).toEqual([])

    const clear = twoRoofRequest()
    clear.volumes.push(boxVolume('high-reservation', 'reservation', 18, -3, 22, 3, 30, 35))
    expect(generateRooftopSpans(clear).spans).toHaveLength(1)
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

  it('rejects a curve that sags into its endpoint roof instead of clipping it', () => {
    const request = twoRoofRequest()
    request.attachments[0].attachment.position = [0, 12.1, 0]
    expect(generateRooftopSpans(request).spans).toEqual([])
  })
})
