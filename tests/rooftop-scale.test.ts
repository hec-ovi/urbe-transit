import { describe, expect, it } from 'vitest'
import { generateRooftopSpans } from '../src'
import { boxVolume, omni, twoRoofRequest } from './rooftop-fixtures'

describe('generateRooftopSpans: complete city scenes', () => {
  it('admits 53,029 owners and attachments without changing an isolated feasible span', () => {
    const request = twoRoofRequest()
    const expected = generateRooftopSpans(request)
    request.params!.maxSpans = 4096
    // Equal X coordinates exercise both spatial axes, rather than a single sorted sweep.
    for (let index = 2; index < 53_029; index++) {
      const id = `quiet-${index}`, z = index * 200
      request.attachments.push(omni(id, 'mast', [1000, 20, z]))
      request.volumes.push(boxVolume(`${id}-solid`, 'building', 998, z - 2, 1002, z + 2, 0, 12, id))
    }
    expect(generateRooftopSpans(request)).toEqual(expected)

    // Validation still examines the complete scene, including a remote final record.
    request.volumes.at(-1)!.id = request.volumes[0].id
    expect(() => generateRooftopSpans(request)).toThrowError(expect.objectContaining({
      code: 'E_ROOFTOP_INPUT_INVALID', path: 'request.volumes[53028].id',
    }))
  }, 15_000)

  it('tests a distant-centered obstacle whose thin end intersects between rendered samples', () => {
    const request = twoRoofRequest()
    request.params!.pathSegments = 2
    const { catenary } = generateRooftopSpans(request).spans[0]
    const y = catenary.scale * Math.cosh((10 - catenary.horizontalOffset) / catenary.scale) + catenary.verticalOffset
    request.volumes.push(boxVolume('long-reservation', 'reservation', 9.99, -100_000, 10.01, 0.1, y - 0.01, y + 0.01))
    expect(generateRooftopSpans(request).spans).toEqual([])
  })

  it('includes obstacle clearance and endpoint disks in spatial queries', () => {
    const request = twoRoofRequest()
    const obstacle = boxVolume('offset-solid', 'building', 19.99, 0.03, 20.01, 0.04, 0, 25)
    request.volumes.push(obstacle)
    expect(generateRooftopSpans(request).spans).toHaveLength(1)
    obstacle.clearance = 0.02
    expect(generateRooftopSpans(request).spans).toEqual([])

    request.volumes.pop()
    request.attachments[0].attachment.clearanceRadius = 200
    request.attachments[1].attachment.position[0] = 500
    request.volumes[1].footprint = [[498, -2], [502, -2], [502, 2], [498, 2]]
    request.params!.maxDistance = 600
    expect(generateRooftopSpans(request).spans).toHaveLength(1)
    request.volumes.push(boxVolume('remote-access', 'access', -0.1, 199, 0.1, 200, 0, 2))
    expect(generateRooftopSpans(request).spans).toEqual([])
  })
})
