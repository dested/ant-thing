import type { Puzzle } from '@app/sim'
import { raceEventSchema, type RaceJob, type Rules } from './race.worker'

export type { Rules }

export type ColonyState = 'waiting' | 'running' | 'delivered' | 'lost'

export interface Colony {
  seed: number
  state: ColonyState
  /** Sim seconds on its clock: the delivery time once delivered. */
  time: number
  x: number
  y: number
  a: number
  /** Where the load has been, as x, y pairs. */
  trail: number[]
}

export interface RaceStats {
  total: number
  /** Colonies that have finished, delivered or not. */
  done: number
  delivered: number
  median: number | null
  best: number | null
  /** Delivery times so far, sorted. */
  times: number[]
  /** Sim seconds per real second, all cores together. */
  pace: number
  cores: number
  over: boolean
}

/** How many colonies run at once: every core but the one the page is drawn on. */
export function coreCount(): number {
  const cores = typeof navigator === 'undefined' ? 4 : navigator.hardwareConcurrency || 4
  return Math.max(1, Math.min(16, cores - 1))
}

/** A race sized so it lasts long enough to watch and not long enough to leave. */
export function raceSize(cores: number): number {
  return cores >= 12 ? 48 : cores >= 6 ? 24 : 12
}

function median(sorted: readonly number[]): number | null {
  if (sorted.length === 0) return null
  const mid = sorted.length >> 1
  const hi = sorted[mid] ?? 0
  return sorted.length % 2 === 1 ? hi : ((sorted[mid - 1] ?? hi) + hi) / 2
}

/**
 * Many colonies on the same puzzle, each a different seed, run headless in workers. The colonies
 * array is mutated in place for the canvas; subscribers get a fresh stats object a few times a second.
 */
export class Race {
  readonly colonies: Colony[]
  readonly cores: number
  private readonly workers: Worker[] = []
  private readonly listeners = new Set<() => void>()
  private stats: RaceStats
  private next = 0
  private simSeconds = 0
  private began = 0
  private ended = 0
  private published = 0

  constructor(
    readonly puzzle: Puzzle,
    private readonly rules: Rules,
    count: number,
    private readonly warm: number,
    private readonly cap: number,
    firstSeed: number,
    cores = coreCount()
  ) {
    this.cores = Math.min(cores, count)
    this.colonies = Array.from({ length: count }, (_, n) => ({
      seed: firstSeed + n,
      state: 'waiting',
      time: 0,
      x: puzzle.load.x,
      y: puzzle.load.y,
      a: puzzle.load.a,
      trail: [puzzle.load.x, puzzle.load.y],
    }))
    this.stats = this.measure()
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  snapshot = (): RaceStats => this.stats

  start(): void {
    if (this.workers.length > 0) return
    this.began = performance.now()
    for (let n = 0; n < this.cores; n++) {
      const worker = new Worker(new URL('./race.worker.ts', import.meta.url), { type: 'module' })
      worker.addEventListener('message', (event: MessageEvent<unknown>) =>
        this.heard(worker, event.data)
      )
      this.workers.push(worker)
      this.deal(worker)
    }
  }

  stop(): void {
    for (const worker of this.workers) worker.terminate()
    this.workers.length = 0
    if (this.ended === 0) this.ended = performance.now()
  }

  private deal(worker: Worker): void {
    const id = this.next
    const colony = this.colonies[id]
    if (!colony) return
    this.next++
    colony.state = 'running'
    const job: RaceJob = {
      id,
      puzzle: this.puzzle,
      seed: colony.seed,
      rules: this.rules,
      warm: this.warm,
      cap: this.cap,
    }
    worker.postMessage(job)
  }

  private heard(worker: Worker, data: unknown): void {
    const parsed = raceEventSchema.safeParse(data)
    if (!parsed.success) return
    const event = parsed.data
    const colony = this.colonies[event.id]
    if (!colony) return
    this.simSeconds += Math.max(0, event.time - colony.time)
    colony.time = event.time
    colony.x = event.x
    colony.y = event.y
    colony.a = event.a
    const t = colony.trail
    const dx = event.x - (t[t.length - 2] ?? event.x)
    const dy = event.y - (t[t.length - 1] ?? event.y)
    if (dx * dx + dy * dy > 16) t.push(event.x, event.y)
    if (event.over) {
      colony.state = event.delivered ? 'delivered' : 'lost'
      this.deal(worker)
      if (this.colonies.every((c) => c.state === 'delivered' || c.state === 'lost')) this.stop()
    }
    const now = performance.now()
    if (event.over || now - this.published > 120) {
      this.published = now
      this.stats = this.measure()
      for (const listener of this.listeners) listener()
    }
  }

  private measure(): RaceStats {
    const times = this.colonies.filter((c) => c.state === 'delivered').map((c) => c.time)
    times.sort((a, b) => a - b)
    const done = this.colonies.filter((c) => c.state === 'delivered' || c.state === 'lost').length
    const elapsed = ((this.ended || performance.now()) - this.began) / 1000
    return {
      total: this.colonies.length,
      done,
      delivered: times.length,
      median: median(times),
      best: times[0] ?? null,
      times,
      pace: this.began > 0 && elapsed > 0.05 ? this.simSeconds / elapsed : 0,
      cores: this.cores,
      over: done === this.colonies.length,
    }
  }
}
