/** Seeded deterministic PRNG (xmur3 hash + mulberry32). Fork by label for order-independent streams. */
export class Rng {
  private state: number

  constructor(private readonly seed: string) {
    let h = 1779033703 ^ seed.length
    for (let i = 0; i < seed.length; i++) {
      h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
      h = (h << 13) | (h >>> 19)
    }
    this.state = h >>> 0
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0
    let t = this.state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1))
  }

  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length - 1)]
  }

  /** Independent stream for a subsystem; call order elsewhere never affects it. */
  fork(label: string): Rng {
    return new Rng(`${this.seed}/${label}`)
  }
}
