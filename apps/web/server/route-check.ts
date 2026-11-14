import { join } from 'node:path'
import { z } from 'zod'
import type { Puzzle } from '@app/sim'

const reply = z.object({ solvable: z.boolean() })

let tail: Promise<unknown> = Promise.resolve()
let waiting = 0

/** Thrown when too many checks are queued: the caller should ask the visitor to try again shortly. */
export class RouteCheckBusy extends Error {}

/**
 * Whether the planner can get the load to the nest. Runs in a worker thread, one check at a time,
 * so a burst of publishes can't starve the web server.
 */
export function checkSolvable(puzzle: Puzzle): Promise<boolean> {
  if (waiting >= 6)
    return Promise.reject(new RouteCheckBusy('Too many puzzles are being checked right now.'))
  waiting++
  const run = tail.then(
    () =>
      new Promise<boolean>((resolve, reject) => {
        const worker = new Worker(join(import.meta.dir, 'route-worker.ts'))
        const timer = setTimeout(() => {
          worker.terminate()
          reject(new RouteCheckBusy('Checking this puzzle took too long.'))
        }, 30_000)
        worker.onmessage = (event: MessageEvent<unknown>) => {
          clearTimeout(timer)
          worker.terminate()
          const parsed = reply.safeParse(event.data)
          resolve(parsed.success && parsed.data.solvable)
        }
        worker.onerror = (event) => {
          clearTimeout(timer)
          worker.terminate()
          reject(new Error(event.message))
        }
        worker.postMessage(puzzle)
      })
  )
  const done = (): void => {
    waiting--
  }
  run.then(done, done)
  tail = run.catch(() => undefined)
  return run
}
