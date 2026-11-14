import { hyp } from './geom'
import { WALL_T, type Wall } from './puzzle'

/** Scent values are times in seconds; this means "no scent here". */
export const UNKNOWN = 999
/** Distances beyond this are not tracked by the wall field. */
const FAR = 40
/** Marks older than this (in their own units) have evaporated. The load moves, so its marks go fast. */
export const HOME_CAP = 400
export const FOOD_CAP = 50

/**
 * The two grids ants read with their bodies:
 * a distance-to-wall field (so an ant can feel a wall and slide along it), and
 * two scent fields holding "seconds since an ant left the nest / left the load" (lower is closer).
 */
export class Fields {
  readonly w: number
  readonly h: number

  readonly sres = 4
  readonly sw: number
  readonly sh: number
  readonly sdf: Float32Array

  readonly gres = 8
  readonly gw: number
  readonly gh: number
  readonly home: Float32Array
  readonly food: Float32Array
  /** Per scent cell, which of its 3×3 neighbours can be smelled from it (nine bits): scent stops at walls. */
  private readonly open: Uint16Array

  constructor(w: number, h: number, walls: readonly Wall[]) {
    this.w = w
    this.h = h
    this.sw = Math.ceil(w / this.sres) + 1
    this.sh = Math.ceil(h / this.sres) + 1
    this.sdf = new Float32Array(this.sw * this.sh)
    this.gw = Math.ceil(w / this.gres)
    this.gh = Math.ceil(h / this.gres)
    this.home = new Float32Array(this.gw * this.gh).fill(UNKNOWN)
    this.food = new Float32Array(this.gw * this.gh).fill(UNKNOWN)
    this.open = new Uint16Array(this.gw * this.gh)
    this.buildSdf(walls)
    this.buildOpen()
  }

  /** A neighbour cell can be smelled when neither it nor the point halfway to it is inside a wall. */
  private buildOpen(): void {
    const { gw, gh, gres, open } = this
    for (let j = 0; j < gh; j++) {
      for (let i = 0; i < gw; i++) {
        const cx = (i + 0.5) * gres
        const cy = (j + 0.5) * gres
        let mask = 0
        let bit = 1
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const ii = i + di
            const jj = j + dj
            if (ii >= 0 && jj >= 0 && ii < gw && jj < gh) {
              const nx = (ii + 0.5) * gres
              const ny = (jj + 0.5) * gres
              const self = di === 0 && dj === 0
              if (self || (this.dist(nx, ny) > 0 && this.dist((cx + nx) / 2, (cy + ny) / 2) > 0))
                mask |= bit
            }
            bit <<= 1
          }
        }
        open[j * gw + i] = mask
      }
    }
  }

  private buildSdf(walls: readonly Wall[]): void {
    const { sw, sh, sres, sdf, w, h } = this
    for (let j = 0; j < sh; j++) {
      const y = j * sres
      for (let i = 0; i < sw; i++) {
        const x = i * sres
        sdf[j * sw + i] = Math.min(FAR, x, w - x, y, h - y)
      }
    }
    const half = WALL_T / 2
    for (const [x1, y1, x2, y2] of walls) {
      let dx = x2 - x1
      let dy = y2 - y1
      const len = hyp(dx, dy)
      if (len < 1e-6) {
        dx = 1
        dy = 0
      } else {
        dx /= len
        dy /= len
      }
      const mx = (x1 + x2) / 2
      const my = (y1 + y2) / 2
      const hl = len / 2 + half
      const reach = hl + FAR
      const i0 = Math.max(0, Math.floor((mx - reach) / sres))
      const i1 = Math.min(sw - 1, Math.ceil((mx + reach) / sres))
      const j0 = Math.max(0, Math.floor((my - reach) / sres))
      const j1 = Math.min(sh - 1, Math.ceil((my + reach) / sres))
      for (let j = j0; j <= j1; j++) {
        const py = j * sres - my
        for (let i = i0; i <= i1; i++) {
          const px = i * sres - mx
          const along = Math.abs(px * dx + py * dy) - hl
          const across = Math.abs(-px * dy + py * dx) - half
          const d =
            along > 0 || across > 0
              ? hyp(Math.max(along, 0), Math.max(across, 0))
              : Math.max(along, across)
          const k = j * sw + i
          if (d < (sdf[k] ?? FAR)) sdf[k] = d
        }
      }
    }
  }

  /** Distance to the nearest wall or arena edge (negative inside a wall), bilinear. */
  dist(x: number, y: number): number {
    const fx = x / this.sres
    const fy = y / this.sres
    const i = Math.floor(fx)
    const j = Math.floor(fy)
    if (i < 0 || j < 0 || i >= this.sw - 1 || j >= this.sh - 1) return -1
    const tx = fx - i
    const ty = fy - j
    const k = j * this.sw + i
    const a = this.sdf[k] ?? 0
    const b = this.sdf[k + 1] ?? 0
    const c = this.sdf[k + this.sw] ?? 0
    const d = this.sdf[k + this.sw + 1] ?? 0
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty
  }

  private cell(x: number, y: number): number {
    const i = Math.floor(x / this.gres)
    const j = Math.floor(y / this.gres)
    if (i < 0 || j < 0 || i >= this.gw || j >= this.gh) return -1
    return j * this.gw + i
  }

  /** Scent at a point: the lowest value in the 3×3 cells around it that no wall hides (about an antenna's reach). */
  read(grid: Float32Array, x: number, y: number): number {
    const i = Math.floor(x / this.gres)
    const j = Math.floor(y / this.gres)
    if (i < 0 || j < 0 || i >= this.gw || j >= this.gh) return UNKNOWN
    const k = j * this.gw + i
    const mask = this.open[k] ?? 0
    let best = UNKNOWN
    let bit = 1
    for (let dj = -1; dj <= 1; dj++) {
      const row = k + dj * this.gw
      for (let di = -1; di <= 1; di++) {
        if (mask & bit) {
          const v = grid[row + di] ?? UNKNOWN
          if (v < best) best = v
        }
        bit <<= 1
      }
    }
    return best
  }

  /** True when a wall stands at a point or halfway to it: nothing is smelled or felt across it. */
  hidden(x: number, y: number, px: number, py: number): boolean {
    return this.dist(px, py) < 1 || this.dist((x + px) / 2, (y + py) / 2) < 1
  }

  /** Lay scent: keep the lower (fresher) of what's there and what this ant carries. */
  mark(grid: Float32Array, x: number, y: number, value: number): void {
    const k = this.cell(x, y)
    if (k < 0) return
    if (value < (grid[k] ?? UNKNOWN)) grid[k] = value
  }

  /** Scent goes stale: every value drifts upward, and past its cap it is gone. */
  age(seconds: number, homeRate: number, foodRate: number): void {
    const dh = seconds * homeRate
    const df = seconds * foodRate
    const { home, food } = this
    for (let k = 0; k < home.length; k++) {
      const a = home[k] ?? UNKNOWN
      if (a < UNKNOWN) home[k] = a + dh > HOME_CAP ? UNKNOWN : a + dh
      const b = food[k] ?? UNKNOWN
      if (b < UNKNOWN) food[k] = b + df > FOOD_CAP ? UNKNOWN : b + df
    }
  }

  /**
   * The direction in which a scent falls fastest around a point, from eight probes.
   * Returns false when there is nothing to smell. Writes the unit vector to `out`.
   */
  downhill(
    grid: Float32Array,
    x: number,
    y: number,
    radius: number,
    out: { x: number; y: number }
  ): boolean {
    const here = this.read(grid, x, y)
    let gx = 0
    let gy = 0
    let found = 0
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4
      const cx = Math.cos(a)
      const cy = Math.sin(a)
      const px = x + cx * radius
      const py = y + cy * radius
      if (this.hidden(x, y, px, py)) continue
      const v = this.read(grid, px, py)
      if (v >= UNKNOWN) continue
      const base = here >= UNKNOWN ? v + 2 : here
      const drop = base - v
      gx += cx * drop
      gy += cy * drop
      found++
    }
    const len = hyp(gx, gy)
    if (found < 2 || len < 1e-4) return false
    out.x = gx / len
    out.y = gy / len
    return true
  }
}
