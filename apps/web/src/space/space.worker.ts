// Every pose the load can reach, worked out off the main thread: the map the Keyhole view draws on
// and the route the Planner view shows.
import { mapSpace, puzzleSchema } from '@app/sim'

self.addEventListener('message', (event: MessageEvent<unknown>) => {
  const parsed = puzzleSchema.safeParse(event.data)
  const map = parsed.success ? mapSpace(parsed.data) : null
  if (!map) {
    self.postMessage(null)
    return
  }
  // The route is thinned for drawing: a ghost of the load every few lattice steps.
  const path: number[] = []
  const poses = map.path.length / 3
  const every = Math.max(1, Math.floor(poses / 70))
  for (let n = 0; n < poses; n += every) {
    path.push(map.path[n * 3] ?? 0, map.path[n * 3 + 1] ?? 0, map.path[n * 3 + 2] ?? 0)
  }
  self.postMessage({ ...map, route: path }, { transfer: [map.open.buffer, map.goal.buffer] })
})
