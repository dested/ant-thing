import type { Puzzle } from '@app/sim'
import { coreCount, type Rules } from './race'
import { raceEventSchema, type RaceJob } from './race.worker'

export interface Trial {
  /** Which bar of the chart this colony counts toward. */
  group: number
  puzzle: Puzzle
  rules: Rules
  seed: number
}

export interface TrialResult {
  group: number
  delivered: boolean
  seconds: number
}

/**
 * Run colonies headless, one per core at a time, and report each as it ends. Returns the way to
 * stop early. The same worker the race uses; here only the endings matter.
 */
export function runTrials(
  trials: readonly Trial[],
  warm: number,
  cap: number,
  onResult: (result: TrialResult) => void
): () => void {
  const workers: Worker[] = []
  let next = 0
  const deal = (worker: Worker): void => {
    const trial = trials[next]
    if (!trial) return
    const job: RaceJob = {
      id: next,
      puzzle: trial.puzzle,
      seed: trial.seed,
      rules: trial.rules,
      warm,
      cap,
    }
    next++
    worker.postMessage(job)
  }
  const stop = (): void => {
    for (const worker of workers) worker.terminate()
    workers.length = 0
  }
  for (let n = 0; n < Math.min(coreCount(), trials.length); n++) {
    const worker = new Worker(new URL('./race.worker.ts', import.meta.url), { type: 'module' })
    worker.addEventListener('message', (event: MessageEvent<unknown>) => {
      const parsed = raceEventSchema.safeParse(event.data)
      if (!parsed.success || !parsed.data.over) return
      const trial = trials[parsed.data.id]
      if (trial)
        onResult({
          group: trial.group,
          delivered: parsed.data.delivered,
          seconds: parsed.data.time,
        })
      deal(worker)
    })
    workers.push(worker)
    deal(worker)
  }
  return stop
}
