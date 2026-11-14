// The editor's "is there a way through?" check, off the main thread.
import { checkPuzzle, findRoute, puzzleSchema } from '@app/sim'

export interface SolveReply {
  id: number
  problem: string | null
  solvable: boolean
  /** The planner's route as x, y, angle triples (thinned), when there is one. */
  path: number[]
}

self.addEventListener('message', (event: MessageEvent<unknown>) => {
  const data = event.data
  if (typeof data !== 'object' || data === null || !('id' in data) || !('puzzle' in data)) return
  const id = typeof data.id === 'number' ? data.id : 0
  const parsed = puzzleSchema.safeParse(data.puzzle)
  let reply: SolveReply
  if (!parsed.success) {
    reply = { id, problem: 'This puzzle is outside the limits. Undo the last change.', solvable: false, path: [] }
  } else {
    const problem = checkPuzzle(parsed.data)
    if (problem) {
      reply = { id, problem, solvable: false, path: [] }
    } else {
      const route = findRoute(parsed.data)
      const path: number[] = []
      const every = Math.max(1, Math.floor(route.path.length / 3 / 60))
      for (let n = 0; n < route.path.length / 3; n += every) {
        path.push(route.path[n * 3] ?? 0, route.path[n * 3 + 1] ?? 0, route.path[n * 3 + 2] ?? 0)
      }
      reply = { id, problem: null, solvable: route.solvable, path }
    }
  }
  self.postMessage(reply)
})
