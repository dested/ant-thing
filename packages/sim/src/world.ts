import { Fields, UNKNOWN } from './field'
import { collide, distToPoly, emptyQuad, hyp, placeRect, segmentPoly, wrap, type Contact, type Poly } from './geom'
import { DEFAULT_PARAMS, type Params } from './params'
import { NEST_R, WALL_T, type Puzzle } from './puzzle'
import { Rng } from './rng'
import { buildShape, type Shape } from './shape'

/** Fixed timestep, seconds. */
export const DT = 1 / 60
/** Ant body length in units; the scale everything else is read against. */
export const ANT_LEN = 12

export const SEARCH = 0
export const RETURN = 1
export const CARRY = 2
export const NEST = 3
export const PLAYER = 4

export const PULLER = 1
export const LIFTER = 2

export interface Ant {
  x: number
  y: number
  /** Heading, radians. */
  h: number
  state: number
  /** Personal speed factor. */
  speed: number
  /** Seconds since she left the nest (searching) or the load (returning). */
  trip: number
  /** Whether this trip lays scent. */
  marks: boolean
  /** Seconds before she may bite again, or before she leaves the nest. */
  cool: number
  /** Seconds since she last carried. */
  free: number
  /** Wander turn rate, rad/s. */
  turn: number
  /** Leg phase for drawing. */
  gait: number
  /** Grip point index while carrying, else -1. */
  site: number
  /** Grip point she is heading for, else -1. */
  goal: number
  /** Pull direction while carrying, radians. */
  dir: number
  /** Seconds of knowledge left. */
  informed: number
  /** Her personal error about where home is. */
  err: number
  /** Cached reading of the way home. */
  homeDir: number
  role: number
  /** Seconds on the load. */
  held: number
  /** Where she was when her progress was last checked, and how long ago: an ant who gets nowhere gives up. */
  ax: number
  ay: number
  still: number
  /** Steps in that time on which a wall pushed her back. */
  bumps: number
  /** Seconds left of ignoring every scent after giving up. */
  lost: number
  /** The turn her last sniff chose: -1, 0, 1, or NO_SCENT. */
  steer: number
  /** Tick offset that staggers the expensive checks. */
  phase: number
}

export interface SiteState {
  /** World position and outward normal, refreshed every step. */
  x: number
  y: number
  nx: number
  ny: number
  /** Index of the ant holding it, or -1. */
  occ: number
  /** No room for an ant here (a wall is in the way). */
  blocked: boolean
}

export interface Stats {
  carriers: number
  pullers: number
  lifters: number
  informed: number
  /** Ants out of the nest. */
  out: number
}

const GRAB = 6
const NO_SCENT = 2
/** How close an ant's middle gets to a wall. */
const STANDOFF = 4
/** An ant pressed against a wall who covers less than this in GIVE_UP seconds is stuck. */
const GIVE_UP = 1.2
const GIVE_UP_DIST = 12
const SITE_REACH = 7
const TURN = 7
const SENSE_D = 18
const SENSE_A = 0.6
const SLOP = 0.05
const MARGIN = 1.5
const BETA = 0.4
const ITER = 16

export class World {
  readonly puzzle: Puzzle
  readonly shape: Shape
  readonly fields: Fields
  readonly walls: Poly[]
  readonly params: Params
  readonly ants: Ant[]
  readonly sites: SiteState[]
  readonly pieces: Poly[]
  readonly stats: Stats = { carriers: 0, pullers: 0, lifters: 0, informed: 0, out: 0 }
  /** The load's path: x, y, angle every half second. */
  readonly trace: number[] = []

  /** Where the load touches walls this step, and the sum of every pull on it (force x, y and torque). */
  readonly contacts: Contact[] = []
  readonly net = { x: 0, y: 0, t: 0 }

  private readonly rng: Rng
  private readonly tmp = { x: 0, y: 0 }

  /** Load pose. */
  x: number
  y: number
  a: number
  /** Load velocity from the last step. */
  vx = 0
  vy = 0
  w = 0

  time = 0
  tick = 0
  delivered = false
  deliveredAt = 0
  /** Deepest the load has ever sunk into a wall, in units (a health check: should stay well under 1). */
  deepest = 0
  /** While true the load can't move and nobody may bite (used to let trails form first). */
  frozen = false
  /** Steps of warm-up left. */
  warmup = 0
  hands = false
  private grabOpen = true

  /** The ant you control: where the pointer is, and whether you're holding the bite key. */
  player: { ant: number; tx: number; ty: number; bite: boolean } | null = null
  /** Dragging the load by hand: a grab point in the body frame and where the pointer is. */
  drag: { bx: number; by: number; tx: number; ty: number } | null = null

  constructor(puzzle: Puzzle, seed: number, params: Partial<Params> = {}) {
    this.puzzle = puzzle
    this.params = { ...DEFAULT_PARAMS, ...params }
    this.rng = new Rng(seed)
    this.shape = buildShape(puzzle.load.cells, puzzle.load.cell)
    this.fields = new Fields(puzzle.w, puzzle.h, puzzle.walls)
    const { w, h } = puzzle
    this.walls = [
      ...puzzle.walls.map(([x1, y1, x2, y2]) => segmentPoly(x1, y1, x2, y2, WALL_T)),
      segmentPoly(-30, -30, -30, h + 30, 60),
      segmentPoly(w + 30, -30, w + 30, h + 30, 60),
      segmentPoly(-30, -30, w + 30, -30, 60),
      segmentPoly(-30, h + 30, w + 30, h + 30, 60),
    ]
    this.x = puzzle.load.x
    this.y = puzzle.load.y
    this.a = puzzle.load.a
    this.pieces = this.shape.rects.map(() => emptyQuad())
    this.sites = this.shape.sites.map(() => ({ x: 0, y: 0, nx: 0, ny: 0, occ: -1, blocked: false }))
    this.ants = []
    for (let i = 0; i < puzzle.ants; i++) {
      this.ants.push({
        x: puzzle.nest.x,
        y: puzzle.nest.y,
        h: 0,
        state: NEST,
        speed: this.rng.range(0.8, 1.2),
        trip: 0,
        marks: true,
        cool: (i / puzzle.ants) * 25 + this.rng.range(0, 1.5),
        free: 99,
        turn: 0,
        gait: this.rng.range(0, 6),
        site: -1,
        goal: -1,
        dir: 0,
        informed: 0,
        err: 0,
        homeDir: 0,
        role: 0,
        held: 0,
        ax: puzzle.nest.x,
        ay: puzzle.nest.y,
        still: 0,
        bumps: 0,
        lost: 0,
        steer: NO_SCENT,
        phase: i % 60,
      })
    }
    this.place()
  }

  /** Let the colony find the load and lay trails before the clock starts (all at once). */
  prewarm(seconds: number): void {
    this.startWarmup(seconds)
    while (this.warmup > 0) this.step()
  }

  /** Begin a warm-up that plays out over the next `seconds` of steps: the load is frozen until it ends. */
  startWarmup(seconds: number): void {
    this.frozen = true
    this.grabOpen = false
    this.warmup = Math.max(1, Math.round(seconds / DT))
  }

  /** Hands mode: nobody may bite, so the load only moves when it is dragged. */
  setHands(on: boolean): void {
    this.hands = on
    this.grabOpen = !on && this.warmup <= Math.round(3 / DT)
    if (!on) return
    for (const ant of this.ants) if (ant.state === CARRY) this.letGo(ant, true)
  }

  /** The body-frame point under a world point, or null when it misses the load. */
  gripAt(x: number, y: number): { bx: number; by: number } | null {
    for (const piece of this.pieces) {
      if (distToPoly(piece, x, y) > 0) continue
      const c = Math.cos(this.a)
      const s = Math.sin(this.a)
      const dx = x - this.x
      const dy = y - this.y
      return { bx: c * dx + s * dy, by: -s * dx + c * dy }
    }
    return null
  }

  /** Take over one ant. Returns false when there is no free ant to take. */
  possess(): boolean {
    let pick = -1
    let best = Infinity
    for (let i = 0; i < this.ants.length; i++) {
      const ant = this.ants[i]
      if (!ant || ant.state === NEST || ant.state === CARRY) continue
      const d = hyp(ant.x - this.x, ant.y - this.y)
      if (d < best) {
        best = d
        pick = i
      }
    }
    const ant = this.ants[pick]
    if (!ant) return false
    ant.state = PLAYER
    ant.goal = -1
    this.player = { ant: pick, tx: ant.x, ty: ant.y, bite: false }
    return true
  }

  /** Hand the controlled ant back to the colony. */
  release(): void {
    const p = this.player
    if (!p) return
    const ant = this.ants[p.ant]
    this.player = null
    if (!ant) return
    if (ant.state === CARRY) this.letGo(ant, true)
    ant.state = SEARCH
    ant.trip = 60
    ant.marks = false
  }

  step(): void {
    this.tick++
    if (this.warmup > 0) {
      this.warmup--
      if (this.warmup === Math.round(3 / DT)) this.grabOpen = !this.hands
      if (this.warmup === 0) {
        this.frozen = false
        this.grabOpen = !this.hands
        this.time = 0
        this.trace.length = 0
      }
    }
    if (this.tick % 6 === 0) this.fields.age(6 * DT, this.params.homeAging, this.params.foodAging)
    this.solve()
    this.place()
    this.carry()
    this.walk()
    if (!this.frozen) {
      if (!this.delivered) {
        this.time += DT
        for (const piece of this.pieces) {
          if (distToPoly(piece, this.puzzle.nest.x, this.puzzle.nest.y) <= NEST_R) {
            this.delivered = true
            this.deliveredAt = this.time
            this.frozen = true
            break
          }
        }
      }
      if (this.tick % 30 === 0 && this.trace.length < 30000) this.trace.push(this.x, this.y, this.a)
    }
  }

  /** Refresh the world-space pieces and grip points from the load's pose. */
  private place(): void {
    const c = Math.cos(this.a)
    const s = Math.sin(this.a)
    const { rects, sites } = this.shape
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i]
      const piece = this.pieces[i]
      if (r && piece) placeRect(piece, r.x0, r.y0, r.x1, r.y1, this.x, this.y, c, s)
    }
    const refresh = this.tick % 4 === 0
    for (let i = 0; i < sites.length; i++) {
      const b = sites[i]
      const st = this.sites[i]
      if (!b || !st) continue
      st.x = this.x + c * b.x - s * b.y
      st.y = this.y + s * b.x + c * b.y
      st.nx = c * b.nx - s * b.ny
      st.ny = s * b.nx + c * b.ny
      if (refresh || st.occ >= 0) {
        st.blocked = this.fields.dist(st.x + st.nx * SITE_REACH, st.y + st.ny * SITE_REACH) < 2.5
      }
    }
  }

  /** The way home as this ant reads it, radians. */
  private senseHome(ant: Ant): number {
    const P = this.params
    const nest = this.puzzle.nest
    let px = nest.x - ant.x
    let py = nest.y - ant.y
    const pl = hyp(px, py) || 1
    px /= pl
    py /= pl
    if (P.scent && this.fields.downhill(this.fields.home, ant.x, ant.y, 22, this.tmp)) {
      return Math.atan2(this.tmp.y + py * P.compass, this.tmp.x + px * P.compass)
    }
    return Math.atan2(py, px)
  }

  /** Every carrier decides which way to pull; then the load moves the way the pulls and the walls allow. */
  private solve(): void {
    const P = this.params
    const stats = this.stats
    const k = 1 / P.carrySpeed
    const gt = (P.friction * this.shape.cellCount * k) / (1 + P.lift * stats.lifters)
    const gr = gt * this.shape.rg2
    let a00 = gt
    let a01 = 0
    let a02 = 0
    let a11 = gt
    let a12 = 0
    let a22 = gr
    let b0 = 0
    let b1 = 0
    let b2 = 0
    let carriers = 0
    let pullers = 0
    let lifters = 0
    let informed = 0
    const noise = Math.sqrt(2 * P.noise * DT)
    const player = this.player

    for (const ant of this.ants) {
      if (ant.state !== CARRY) continue
      const st = this.sites[ant.site]
      if (!st) continue
      carriers++
      const rx = st.x - this.x
      const ry = st.y - this.y
      const vsx = this.vx - this.w * ry
      const vsy = this.vy + this.w * rx
      let strength = 1
      if (player && this.ants[player.ant] === ant) {
        ant.dir = Math.atan2(player.ty - st.y, player.tx - st.x)
        strength = P.playerStrength
        informed++
      } else if (ant.informed > 0) {
        const stalled = hyp(vsx, vsy) < P.carrySpeed * 0.08
        ant.informed -= stalled ? DT * P.stallForget : DT
        informed++
        if ((this.tick + ant.phase) % 20 === 0) ant.homeDir = this.senseHome(ant)
        ant.dir += wrap(ant.homeDir + ant.err - ant.dir) * Math.min(1, 8 * DT)
      } else {
        const sp = hyp(vsx, vsy)
        const wgt = Math.min(1, sp / P.vRef)
        if (wgt > 0.02) ant.dir += P.conformity * wgt * Math.sin(Math.atan2(vsy, vsx) - ant.dir) * DT
        ant.dir = wrap(ant.dir + noise * this.rng.gauss())
      }
      const dx = Math.cos(ant.dir)
      const dy = Math.sin(ant.dir)
      if (dx * st.nx + dy * st.ny >= P.pullCone) {
        ant.role = PULLER
        pullers++
        const t = rx * dy - ry * dx
        const ks = k * strength
        a00 += ks * dx * dx
        a01 += ks * dx * dy
        a02 += ks * dx * t
        a11 += ks * dy * dy
        a12 += ks * dy * t
        a22 += ks * t * t
        b0 += strength * dx
        b1 += strength * dy
        b2 += strength * t
      } else {
        ant.role = LIFTER
        lifters++
      }
    }
    stats.carriers = carriers
    stats.pullers = pullers
    stats.lifters = lifters
    stats.informed = informed
    this.net.x = b0
    this.net.y = b1
    this.net.t = b2

    const drag = this.drag
    if (drag) {
      const c = Math.cos(this.a)
      const s = Math.sin(this.a)
      const rx = c * drag.bx - s * drag.by
      const ry = s * drag.bx + c * drag.by
      let ex = drag.tx - (this.x + rx)
      let ey = drag.ty - (this.y + ry)
      const el = hyp(ex, ey)
      if (el > 22) {
        ex *= 22 / el
        ey *= 22 / el
      }
      const kd = gt * 14
      const kdt = kd * DT
      a00 += kdt
      a02 += kdt * -ry
      a11 += kdt
      a12 += kdt * rx
      a22 += kdt * (rx * rx + ry * ry)
      b0 += kd * ex
      b1 += kd * ey
      b2 += kd * (rx * ey - ry * ex)
    }

    if (this.frozen) {
      this.vx = 0
      this.vy = 0
      this.w = 0
      return
    }

    // u = A⁻¹ b: the motion with no walls.
    const det =
      a00 * (a11 * a22 - a12 * a12) - a01 * (a01 * a22 - a12 * a02) + a02 * (a01 * a12 - a11 * a02) || 1e-9
    const i00 = (a11 * a22 - a12 * a12) / det
    const i01 = (a02 * a12 - a01 * a22) / det
    const i02 = (a01 * a12 - a02 * a11) / det
    const i11 = (a00 * a22 - a02 * a02) / det
    const i12 = (a01 * a02 - a00 * a12) / det
    const i22 = (a00 * a11 - a01 * a01) / det
    let u0 = i00 * b0 + i01 * b1 + i02 * b2
    let u1 = i01 * b0 + i11 * b1 + i12 * b2
    let u2 = i02 * b0 + i12 * b1 + i22 * b2

    // Walls: no contact may close faster than its gap allows; overlap is pushed out.
    const contacts = this.contacts
    contacts.length = 0
    for (const piece of this.pieces) for (const wall of this.walls) collide(piece, wall, MARGIN, contacts)
    const n = contacts.length
    for (const ct of contacts) if (-ct.sep > this.deepest) this.deepest = -ct.sep
    if (n > 0) {
      const mu = P.wallFriction
      const jn0 = new Float64Array(n)
      const jn1 = new Float64Array(n)
      const jn2 = new Float64Array(n)
      const wn0 = new Float64Array(n)
      const wn1 = new Float64Array(n)
      const wn2 = new Float64Array(n)
      const kn = new Float64Array(n)
      const jt2 = new Float64Array(n)
      const wt0 = new Float64Array(n)
      const wt1 = new Float64Array(n)
      const wt2 = new Float64Array(n)
      const kt = new Float64Array(n)
      const lo = new Float64Array(n)
      const ln = new Float64Array(n)
      const lt = new Float64Array(n)
      for (let c = 0; c < n; c++) {
        const ct = contacts[c]
        if (!ct) continue
        const rx = ct.x - this.x
        const ry = ct.y - this.y
        const j2 = rx * ct.ny - ry * ct.nx
        jn0[c] = ct.nx
        jn1[c] = ct.ny
        jn2[c] = j2
        const w0 = i00 * ct.nx + i01 * ct.ny + i02 * j2
        const w1 = i01 * ct.nx + i11 * ct.ny + i12 * j2
        const w2 = i02 * ct.nx + i12 * ct.ny + i22 * j2
        wn0[c] = w0
        wn1[c] = w1
        wn2[c] = w2
        kn[c] = ct.nx * w0 + ct.ny * w1 + j2 * w2
        const tx = -ct.ny
        const ty = ct.nx
        const t2 = rx * ty - ry * tx
        jt2[c] = t2
        const v0 = i00 * tx + i01 * ty + i02 * t2
        const v1 = i01 * tx + i11 * ty + i12 * t2
        const v2 = i02 * tx + i12 * ty + i22 * t2
        wt0[c] = v0
        wt1[c] = v1
        wt2[c] = v2
        kt[c] = tx * v0 + ty * v1 + t2 * v2
        lo[c] = ct.sep >= 0 ? -ct.sep / DT : Math.min(30, (Math.max(0, -ct.sep - SLOP) * BETA) / DT)
      }
      for (let it = 0; it < ITER; it++) {
        for (let c = 0; c < n; c++) {
          const nx = jn0[c] ?? 0
          const ny = jn1[c] ?? 0
          const knc = kn[c] ?? 1
          const vn = nx * u0 + ny * u1 + (jn2[c] ?? 0) * u2
          const before = ln[c] ?? 0
          const after = Math.max(0, before + ((lo[c] ?? 0) - vn) / knc)
          const dn = after - before
          ln[c] = after
          u0 += (wn0[c] ?? 0) * dn
          u1 += (wn1[c] ?? 0) * dn
          u2 += (wn2[c] ?? 0) * dn
          if (mu > 0) {
            const vt = -ny * u0 + nx * u1 + (jt2[c] ?? 0) * u2
            const cap = mu * after
            const tb = lt[c] ?? 0
            const ta = Math.max(-cap, Math.min(cap, tb - vt / (kt[c] ?? 1)))
            const dtan = ta - tb
            lt[c] = ta
            u0 += (wt0[c] ?? 0) * dtan
            u1 += (wt1[c] ?? 0) * dtan
            u2 += (wt2[c] ?? 0) * dtan
          }
        }
      }
    }

    this.vx = u0
    this.vy = u1
    this.w = u2
    this.x += u0 * DT
    this.y += u1 * DT
    this.a = wrap(this.a + u2 * DT)
  }

  /** Carriers ride their grip points, and sometimes let go. */
  private carry(): void {
    const P = this.params
    const player = this.player
    const stall = P.carrySpeed * 0.08
    for (const ant of this.ants) {
      if (ant.state !== CARRY) continue
      const st = this.sites[ant.site]
      if (!st) continue
      const pulling = ant.role === PULLER
      const ox = pulling ? Math.cos(ant.dir) : st.nx
      const oy = pulling ? Math.sin(ant.dir) : st.ny
      const nx = st.x + ox * (ANT_LEN * 0.55)
      const ny = st.y + oy * (ANT_LEN * 0.55)
      ant.gait += hyp(nx - ant.x, ny - ant.y)
      ant.x = nx
      ant.y = ny
      ant.h = Math.atan2(-oy, -ox)
      ant.held += DT
      const isPlayer = player !== null && this.ants[player.ant] === ant
      if (st.blocked) {
        this.letGo(ant, true)
        continue
      }
      if (isPlayer) {
        if (!player.bite) this.letGo(ant, true)
        continue
      }
      const rx = st.x - this.x
      const ry = st.y - this.y
      const sp = hyp(this.vx - this.w * ry, this.vy + this.w * rx)
      const rate = (sp < stall && !this.frozen ? P.stallLetGo : 1) / P.holdTime
      if (this.rng.next() < rate * DT) this.letGo(ant, false)
    }
  }

  private letGo(ant: Ant, forced: boolean): void {
    const st = this.sites[ant.site]
    if (st) {
      st.occ = -1
      ant.h = Math.atan2(st.ny, st.nx) + this.rng.range(-1, 1)
    }
    ant.site = -1
    ant.goal = -1
    ant.role = 0
    ant.free = 0
    ant.informed = 0
    ant.ax = ant.x
    ant.ay = ant.y
    ant.still = 0
    const player = this.player
    if (player && this.ants[player.ant] === ant) {
      ant.state = PLAYER
      return
    }
    if (!forced && this.rng.next() < this.params.homeProb) {
      ant.state = RETURN
      ant.trip = 0
      ant.marks = true
      ant.cool = 0
    } else {
      ant.state = SEARCH
      ant.trip = 60
      ant.marks = false
      ant.cool = this.rng.range(1.5, 4)
    }
  }

  private bite(index: number, ant: Ant, site: number): void {
    const st = this.sites[site]
    if (!st) return
    const P = this.params
    st.occ = index
    ant.site = site
    ant.goal = -1
    ant.state = CARRY
    ant.held = 0
    ant.role = LIFTER
    const fresh = ant.free >= P.freshTime && P.informedTime > 0
    ant.informed = fresh ? this.rng.exp(P.informedTime) : 0
    ant.err = this.rng.gauss() * P.informedError
    ant.homeDir = this.senseHome(ant)
    ant.dir = fresh ? ant.homeDir + ant.err : Math.atan2(st.ny, st.nx) + this.rng.range(-1.2, 1.2)
  }

  /** The nearest free grip point with room for an ant, or -1. */
  private nearestSite(x: number, y: number, reach: number): number {
    let best = reach * reach
    let pick = -1
    for (let i = 0; i < this.sites.length; i++) {
      const st = this.sites[i]
      if (!st || st.occ >= 0 || st.blocked) continue
      const dx = st.x + st.nx * 3 - x
      const dy = st.y + st.ny * 3 - y
      const d = dx * dx + dy * dy
      if (d < best) {
        best = d
        pick = i
      }
    }
    return pick
  }

  /** What one antenna smells, `SENSE_D` ahead at an angle. */
  private smell(grid: Float32Array, ant: Ant, ang: number): number {
    const f = this.fields
    const px = ant.x + Math.cos(ang) * SENSE_D
    const py = ant.y + Math.sin(ang) * SENSE_D
    return f.hidden(ant.x, ant.y, px, py) ? UNKNOWN : f.read(grid, px, py)
  }

  /**
   * Steer by three antennae: turn toward whichever side smells closest. NaN when there is nothing to smell.
   * She sniffs every third step and holds the turn in between.
   */
  private follow(grid: Float32Array, ant: Ant, h: number): number {
    if ((this.tick + ant.phase) % 3 === 0) {
      const c = this.smell(grid, ant, h)
      const l = this.smell(grid, ant, h - SENSE_A)
      const r = this.smell(grid, ant, h + SENSE_A)
      if (c >= UNKNOWN && l >= UNKNOWN && r >= UNKNOWN) ant.steer = NO_SCENT
      else if (c <= l && c <= r) ant.steer = 0
      else ant.steer = l < r ? -1 : 1
    }
    return ant.steer === NO_SCENT ? Number.NaN : h + ant.steer * TURN * DT
  }

  /** Every free ant takes a step. */
  private walk(): void {
    const P = this.params
    const f = this.fields
    const nest = this.puzzle.nest
    const near2 = (this.shape.radius + 50) ** 2
    const wander = 3.2 * Math.sqrt(DT)
    let out = 0

    for (let i = 0; i < this.ants.length; i++) {
      const ant = this.ants[i]
      if (!ant) continue
      if (ant.state !== NEST) out++
      if (ant.state === CARRY) continue

      if (ant.state === NEST) {
        ant.cool -= DT
        if (ant.cool > 0) continue
        const toMid = Math.atan2(this.puzzle.h / 2 - nest.y, this.puzzle.w / 2 - nest.x)
        ant.h = toMid + this.rng.range(-1.3, 1.3)
        ant.x = nest.x + Math.cos(ant.h) * 6
        ant.y = nest.y + Math.sin(ant.h) * 6
        ant.state = SEARCH
        ant.trip = 0
        ant.marks = true
        ant.free = 99
        ant.cool = 0
        ant.ax = ant.x
        ant.ay = ant.y
        ant.still = 0
        continue
      }

      if (ant.state === PLAYER) {
        this.walkPlayer(i, ant)
        continue
      }

      if (ant.cool > 0) ant.cool -= DT
      ant.free += DT
      ant.trip += DT
      ant.turn += -ant.turn * 2 * DT + this.rng.gauss() * wander
      let h = ant.h + ant.turn * DT

      // Getting nowhere (a corner, a wall between her and what she smells): turn around and wander a while.
      ant.still += DT
      if (ant.still >= GIVE_UP) {
        if (ant.bumps > 20 && hyp(ant.x - ant.ax, ant.y - ant.ay) < GIVE_UP_DIST) {
          ant.lost = this.rng.range(2, 4)
          ant.cool = Math.max(ant.cool, ant.lost)
          ant.goal = -1
          h = ant.h + Math.PI + this.rng.range(-1, 1)
        }
        ant.ax = ant.x
        ant.ay = ant.y
        ant.still = 0
        ant.bumps = 0
      }
      const lost = ant.lost > 0
      if (lost) ant.lost -= DT

      if (ant.state === SEARCH) {
        const dx = ant.x - this.x
        const dy = ant.y - this.y
        const near = dx * dx + dy * dy < near2
        if (near && this.grabOpen && ant.cool <= 0) {
          if ((this.tick + ant.phase) % 3 === 0) ant.goal = this.nearestSite(ant.x, ant.y, 70)
          const st = this.sites[ant.goal]
          if (st && st.occ < 0 && !st.blocked) {
            const gx = st.x + st.nx * 3 - ant.x
            const gy = st.y + st.ny * 3 - ant.y
            if (gx * gx + gy * gy < GRAB * GRAB) {
              if (this.rng.next() < P.grabRate * DT) {
                this.bite(i, ant, ant.goal)
                continue
              }
            } else {
              const d = wrap(Math.atan2(gy, gx) - h)
              h += Math.max(-TURN * DT, Math.min(TURN * DT, d))
            }
          } else {
            ant.goal = -1
          }
        } else if (!near && !lost) {
          const fh = this.follow(f.food, ant, h)
          if (!Number.isNaN(fh)) h = fh
        }
        if (near && this.rng.next() < P.recruitRate * DT) {
          ant.state = RETURN
          ant.trip = 0
          ant.marks = true
          ant.goal = -1
        } else if (ant.trip > 120 && !near) {
          ant.state = RETURN
          ant.marks = false
        }
        if (ant.marks && ant.state === SEARCH) f.mark(f.home, ant.x, ant.y, ant.trip)
      } else {
        const fh = P.scent && !lost ? this.follow(f.home, ant, h) : Number.NaN
        if (!Number.isNaN(fh)) {
          h = fh
        } else if (!lost) {
          const d = wrap(Math.atan2(nest.y - ant.y, nest.x - ant.x) - h)
          h += Math.max(-TURN * DT, Math.min(TURN * DT, d)) * 0.6
        }
        if (ant.marks) {
          f.mark(f.food, ant.x, ant.y, ant.trip)
          if (ant.trip > 45) ant.marks = false
        }
        const nd = hyp(nest.x - ant.x, nest.y - ant.y)
        if (nd < NEST_R * 0.5) {
          ant.state = NEST
          ant.cool = this.rng.range(0.5, 2.5)
          continue
        }
        if (nd < NEST_R * 2 && !lost) {
          const d = wrap(Math.atan2(nest.y - ant.y, nest.x - ant.x) - h)
          h += Math.max(-TURN * DT, Math.min(TURN * DT, d))
        }
      }

      this.advance(ant, h, P.antSpeed * ant.speed)
    }
    this.stats.out = out
  }

  private walkPlayer(index: number, ant: Ant): void {
    const p = this.player
    if (!p) return
    ant.free += DT
    const dx = p.tx - ant.x
    const dy = p.ty - ant.y
    const d = hyp(dx, dy)
    if (p.bite && this.grabOpen) {
      const site = this.nearestSite(ant.x, ant.y, 16)
      if (site >= 0) {
        this.bite(index, ant, site)
        ant.informed = 0
        return
      }
    }
    if (d < 3) return
    const h = Math.atan2(dy, dx)
    this.advance(ant, h, this.params.antSpeed * 1.3 * Math.min(1, d / 24))
  }

  /** Move an ant one step along `h`, feeling for walls. */
  private advance(ant: Ant, heading: number, speed: number): void {
    const f = this.fields
    let h = heading
    const ahead = f.dist(ant.x + Math.cos(h) * 9, ant.y + Math.sin(h) * 9)
    if (ahead < STANDOFF + 2) {
      const l = f.dist(ant.x + Math.cos(h - 1) * 9, ant.y + Math.sin(h - 1) * 9)
      const r = f.dist(ant.x + Math.cos(h + 1) * 9, ant.y + Math.sin(h + 1) * 9)
      h += (l > r ? -1 : 1) * 10 * DT
    }
    const step = speed * DT
    let x = ant.x + Math.cos(h) * step
    let y = ant.y + Math.sin(h) * step
    const d = f.dist(x, y)
    if (d < STANDOFF) {
      ant.bumps++
      let gx = f.dist(x + 2, y) - f.dist(x - 2, y)
      let gy = f.dist(x, y + 2) - f.dist(x, y - 2)
      const gl = hyp(gx, gy)
      if (gl > 1e-6) {
        gx /= gl
        gy /= gl
        x += gx * (STANDOFF - d)
        y += gy * (STANDOFF - d)
      } else {
        x = ant.x
        y = ant.y
        h += Math.PI * this.rng.range(0.5, 1.5)
      }
    }
    ant.gait += hyp(x - ant.x, y - ant.y)
    ant.x = x
    ant.y = y
    ant.h = wrap(h)
  }
}
