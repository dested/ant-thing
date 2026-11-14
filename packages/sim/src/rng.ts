/** Seeded PRNG (mulberry32). Every random draw in the sim comes from one of these, so a seed replays a run. */
export class Rng {
  private s: number
  private spare: number | null = null

  constructor(seed: number) {
    this.s = seed >>> 0 || 0x9e3779b9
  }

  /** Uniform in [0, 1). */
  next(): number {
    let t = (this.s += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  range(a: number, b: number): number {
    return a + (b - a) * this.next()
  }

  /** Standard normal (Box-Muller, cached pair). */
  gauss(): number {
    if (this.spare !== null) {
      const v = this.spare
      this.spare = null
      return v
    }
    let u = 0
    while (u < 1e-12) u = this.next()
    const r = Math.sqrt(-2 * Math.log(u))
    const th = 2 * Math.PI * this.next()
    this.spare = r * Math.sin(th)
    return r * Math.cos(th)
  }

  /** Exponential with the given mean. */
  exp(mean: number): number {
    let u = 0
    while (u < 1e-12) u = this.next()
    return -Math.log(u) * mean
  }
}
