// One colony at a time, headless, as fast as this core will step it. The page starts one of these
// per core and deals colonies out to them.
import { DT, puzzleSchema, World } from '@app/sim'
import { z } from 'zod'

export const rulesSchema = z.object({
  conformity: z.number().optional(),
  informedTime: z.number().optional(),
  scent: z.boolean().optional(),
  compass: z.number().optional(),
})
export type Rules = z.infer<typeof rulesSchema>

const jobSchema = z.object({
  id: z.number(),
  puzzle: puzzleSchema,
  seed: z.number(),
  rules: rulesSchema,
  /** Seconds of trail-laying before the clock starts. */
  warm: z.number(),
  /** Sim seconds after which the colony is called off. */
  cap: z.number(),
})
export type RaceJob = z.infer<typeof jobSchema>

export const raceEventSchema = z.object({
  id: z.number(),
  over: z.boolean(),
  delivered: z.boolean(),
  time: z.number(),
  x: z.number(),
  y: z.number(),
  a: z.number(),
})
export type RaceEvent = z.infer<typeof raceEventSchema>

/** Milliseconds of stepping between reports. */
const SLICE = 30

let running = 0
let resume: (() => void) | null = null
// A message to ourselves is the one way to yield without the 4 ms a nested timeout costs.
const channel = new MessageChannel()
channel.port1.onmessage = () => resume?.()

function run(job: RaceJob): void {
  running = job.id
  const world = new World(job.puzzle, job.seed, job.rules)
  world.prewarm(job.warm)
  const cap = Math.round(job.cap / DT)
  let steps = 0
  const slice = (): void => {
    if (running !== job.id) return
    const start = performance.now()
    while (!world.delivered && steps < cap) {
      world.step()
      steps++
      if ((steps & 15) === 0 && performance.now() - start > SLICE) break
    }
    const over = world.delivered || steps >= cap
    const event: RaceEvent = {
      id: job.id,
      over,
      delivered: world.delivered,
      time: world.delivered ? world.deliveredAt : world.time,
      x: world.x,
      y: world.y,
      a: world.a,
    }
    self.postMessage(event)
    if (over) return
    resume = slice
    channel.port2.postMessage(0)
  }
  slice()
}

self.addEventListener('message', (event: MessageEvent<unknown>) => {
  const job = jobSchema.safeParse(event.data)
  if (job.success) run(job.data)
  else running = 0
})
