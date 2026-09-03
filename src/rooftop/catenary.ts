import type { V3 } from '../core/vec'
import type { CatenaryDefinition } from './types'

const solveScale = (horizontalDistance: number, verticalDelta: number, length: number): number => {
  const reducedLength = Math.sqrt(Math.max(0, length * length - verticalDelta * verticalDelta))
  const target = reducedLength / horizontalDistance
  const sinhc = (value: number): number => value === 0 ? 1 : Math.sinh(value) / value

  let low = 0
  let high = 1
  while (sinhc(high) < target) high *= 2
  for (let i = 0; i < 100; i++) {
    const middle = (low + high) / 2
    if (sinhc(middle) < target) low = middle
    else high = middle
  }
  return horizontalDistance / (2 * ((low + high) / 2))
}

/** Exact vertical-plane catenary between two arbitrary world-space endpoints. */
export class CatenaryCurve {
  readonly definition: CatenaryDefinition
  readonly straightLength: number
  readonly length: number
  readonly sag: number

  constructor(
    readonly start: V3,
    readonly end: V3,
    slackRatio: number,
  ) {
    const dx = end[0] - start[0]
    const dz = end[2] - start[2]
    const horizontalDistance = Math.hypot(dx, dz)
    const verticalDelta = end[1] - start[1]
    this.straightLength = Math.hypot(horizontalDistance, verticalDelta)
    const wantedLength = this.straightLength * slackRatio
    const scale = solveScale(horizontalDistance, verticalDelta, wantedLength)
    const horizontalOffset = horizontalDistance / 2 - scale * Math.atanh(verticalDelta / wantedLength)
    const verticalOffset = start[1] - scale * Math.cosh(horizontalOffset / scale)

    this.definition = {
      type: 'catenary',
      groundOrigin: [start[0], start[2]],
      horizontalDirection: [dx / horizontalDistance, dz / horizontalDistance],
      horizontalDistance,
      scale,
      horizontalOffset,
      verticalOffset,
      domain: [0, horizontalDistance],
    }
    this.length = scale * (
      Math.sinh((horizontalDistance - horizontalOffset) / scale) +
      Math.sinh(horizontalOffset / scale)
    )

    const maxSagAt = Math.max(0, Math.min(
      horizontalDistance,
      horizontalOffset + scale * Math.asinh(verticalDelta / horizontalDistance),
    ))
    const chordHeight = start[1] + verticalDelta * (maxSagAt / horizontalDistance)
    this.sag = Math.max(0, chordHeight - this.heightAt(maxSagAt))
  }

  heightAt(horizontalPosition: number): number {
    const { scale, horizontalOffset, verticalOffset } = this.definition
    return scale * Math.cosh((horizontalPosition - horizontalOffset) / scale) + verticalOffset
  }

  pointAt(horizontalPosition: number): V3 {
    const { groundOrigin, horizontalDirection } = this.definition
    return [
      groundOrigin[0] + horizontalDirection[0] * horizontalPosition,
      this.heightAt(horizontalPosition),
      groundOrigin[1] + horizontalDirection[1] * horizontalPosition,
    ]
  }

  /** Exact min and max height on a closed horizontal interval. */
  heightRange(from: number, to: number): [number, number] {
    const low = Math.min(from, to)
    const high = Math.max(from, to)
    const atLow = this.heightAt(low)
    const atHigh = this.heightAt(high)
    const minimumAt = Math.max(low, Math.min(high, this.definition.horizontalOffset))
    return [this.heightAt(minimumAt), Math.max(atLow, atHigh)]
  }

  sample(segments: number): V3[] {
    const path: V3[] = []
    for (let index = 0; index <= segments; index++) {
      if (index === 0) path.push([...this.start])
      else if (index === segments) path.push([...this.end])
      else path.push(this.pointAt(this.definition.horizontalDistance * index / segments))
    }
    return path
  }
}
