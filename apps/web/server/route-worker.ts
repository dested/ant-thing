// Runs the planner off the server's event loop: a publish can take a second or two of pure CPU.
import { findRoute, puzzleSchema } from '@app/sim'

declare const self: Worker

self.onmessage = (event: MessageEvent<unknown>) => {
  const parsed = puzzleSchema.safeParse(event.data)
  self.postMessage({ solvable: parsed.success && findRoute(parsed.data).solvable })
}
