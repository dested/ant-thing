import { CARRY, LIFTER, NEST, SEARCH, type World } from '@app/sim'

/** Steps between frames at first: ten frames a sim second. */
const EVERY = 6
/** The most memory a tape may hold. When it fills, every other frame is dropped and it records half as often. */
const BUDGET = 24 * 1024 * 1024

const OUT = 1
const CARRYING = 2
const KNOWS = 4
const LIFTS = 8

interface Frame {
  time: number
  x: number
  y: number
  a: number
  /** How many numbers of the world's trace existed by now. */
  trace: number
  /** x, y (sixteenths of a unit) and heading (ten-thousandths of a radian) for every ant. */
  ants: Int16Array
  /** One byte an ant: out of the nest, carrying, knows the way, lifting. */
  marks: Uint8Array
}

const turn = (from: number, to: number, t: number): number => {
  let d = to - from
  if (d > 32768) d -= 62832
  else if (d < -32768) d += 62832
  return (from + d * t) / 10000
}

/**
 * What a run looked like, kept so it can be scrubbed back through and made into a clip: the load's
 * pose and where every ant stood, a few times a second. It is footage, not state. A run can't be
 * resumed from it.
 */
export class Tape {
  private frames: Frame[] = []
  private every = EVERY
  private since = EVERY
  private bytes = 0

  get length(): number {
    return this.frames.length
  }

  /** The run's clock at a frame (fractions are between two frames). */
  timeAt(index: number): number {
    const i = Math.max(0, Math.min(this.frames.length - 1, index))
    const a = this.frames[Math.floor(i)]
    const b = this.frames[Math.ceil(i)]
    if (!a || !b) return 0
    return a.time + (b.time - a.time) * (i - Math.floor(i))
  }

  /** The tape as it stands now, safe from whatever the run records or forgets next. */
  copy(): Tape {
    const tape = new Tape()
    tape.frames = this.frames.slice()
    return tape
  }

  clear(): void {
    this.frames = []
    this.every = EVERY
    this.since = EVERY
    this.bytes = 0
  }

  /** Call after every step of a run that is on the clock. */
  step(world: World): void {
    if (++this.since < this.every) return
    this.since = 0
    this.keep(world)
  }

  /** Keep this moment whatever the rhythm: the frame the load came home on. */
  keep(world: World): void {
    const count = world.ants.length
    const ants = new Int16Array(count * 3)
    const marks = new Uint8Array(count)
    world.ants.forEach((ant, i) => {
      ants[i * 3] = Math.round(ant.x * 16)
      ants[i * 3 + 1] = Math.round(ant.y * 16)
      // Headings wind up over a run: store them inside one turn.
      ants[i * 3 + 2] = Math.round(Math.atan2(Math.sin(ant.h), Math.cos(ant.h)) * 10000)
      marks[i] =
        (ant.state === NEST ? 0 : OUT) |
        (ant.state === CARRY ? CARRYING : 0) |
        (ant.informed > 0 ? KNOWS : 0) |
        (ant.role === LIFTER ? LIFTS : 0)
    })
    this.frames.push({
      time: world.delivered ? world.deliveredAt : world.time,
      x: world.x,
      y: world.y,
      a: world.a,
      trace: world.trace.length,
      ants,
      marks,
    })
    this.bytes += count * 7 + 64
    if (this.bytes > BUDGET) this.thin()
  }

  private thin(): void {
    this.frames = this.frames.filter((_, i) => i % 2 === 0)
    this.bytes = this.frames.reduce((sum, frame) => sum + frame.marks.length * 7 + 64, 0)
    this.every *= 2
  }

  /**
   * Pose a stand-in world as the run stood at a frame, for drawing. `trace` is the run's own path,
   * which the stand-in borrows up to that moment. A fraction blends the two frames around it.
   */
  show(index: number, ghost: World, trace: readonly number[]): void {
    const i = Math.max(0, Math.min(this.frames.length - 1, index))
    const from = this.frames[Math.floor(i)]
    const to = this.frames[Math.ceil(i)]
    if (!from || !to) return
    const t = i - Math.floor(i)
    const u = 1 - t
    ghost.pose(from.x * u + to.x * t, from.y * u + to.y * t, from.a * u + to.a * t)
    ghost.time = from.time * u + to.time * t
    const marks = t < 0.5 ? from.marks : to.marks
    const count = Math.min(ghost.ants.length, marks.length)
    for (let n = 0; n < count; n++) {
      const ant = ghost.ants[n]
      if (!ant) continue
      const mark = marks[n] ?? 0
      const o = n * 3
      // An ant who was in the nest on either side didn't walk the gap between them.
      const both = ((from.marks[n] ?? 0) & (to.marks[n] ?? 0) & OUT) !== 0
      const near = both ? from : t < 0.5 ? from : to
      const far = both ? to : near
      ant.x = ((near.ants[o] ?? 0) * u + (far.ants[o] ?? 0) * t) / 16
      ant.y = ((near.ants[o + 1] ?? 0) * u + (far.ants[o + 1] ?? 0) * t) / 16
      ant.h = turn(near.ants[o + 2] ?? 0, far.ants[o + 2] ?? 0, t)
      ant.state = (mark & OUT) === 0 ? NEST : (mark & CARRYING) !== 0 ? CARRY : SEARCH
      ant.informed = (mark & KNOWS) !== 0 ? 1 : 0
      ant.role = (mark & LIFTS) !== 0 ? LIFTER : 0
      ant.gait = ghost.time * 22 + n * 1.7
    }
    // The path only ever grows, so the stand-in's copy is cut back or topped up, never rebuilt.
    const length = Math.min(trace.length, t < 0.5 ? from.trace : to.trace)
    if (ghost.trace.length > length) ghost.trace.length = length
    for (let n = ghost.trace.length; n < length; n++) ghost.trace.push(trace[n] ?? 0)
  }
}
