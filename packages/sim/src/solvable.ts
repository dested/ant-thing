import { distToPoly, emptyQuad, overlaps, placeRect, segmentPoly, type Poly } from './geom'
import { NEST_R, WALL_T, type Puzzle } from './puzzle'
import { buildShape } from './shape'

export interface Route {
  /** Whether any sequence of slides and turns gets the load to the nest. */
  solvable: boolean
  /** Poses along the shortest such sequence: x, y, angle triples. */
  path: number[]
  /** Lattice states examined. */
  explored: number
}

/**
 * Exhaustive search of the load's configuration space (x, y, angle on a lattice).
 * This is the planner the ants do not have: it is used to check that a puzzle can be solved at all,
 * and to draw the shortest solution next to what the colony actually did. It never steers an ant.
 */
export function findRoute(puzzle: Puzzle, step = 4, turns = 120, budget = 12_000_000): Route {
  const shape = buildShape(puzzle.load.cells, puzzle.load.cell)
  const { w, h } = puzzle
  const walls: Poly[] = [
    ...puzzle.walls.map(([x1, y1, x2, y2]) => segmentPoly(x1, y1, x2, y2, WALL_T)),
    segmentPoly(-30, -30, -30, h + 30, 60),
    segmentPoly(w + 30, -30, w + 30, h + 30, 60),
    segmentPoly(-30, -30, w + 30, -30, 60),
    segmentPoly(-30, h + 30, w + 30, h + 30, 60),
  ]
  const pieces = shape.rects.map(() => emptyQuad())
  const nx = Math.floor(w / step) + 1
  const ny = Math.floor(h / step) + 1
  const total = nx * ny * turns
  if (total > budget) return { solvable: false, path: [], explored: 0 }
  const cos: number[] = []
  const sin: number[] = []
  for (let k = 0; k < turns; k++) {
    cos.push(Math.cos((k * 2 * Math.PI) / turns))
    sin.push(Math.sin((k * 2 * Math.PI) / turns))
  }
  // 0 = unseen, 1 = free and queued, 2 = blocked
  const seen = new Uint8Array(total)
  const parent = new Int32Array(total).fill(-1)
  const queue = new Int32Array(total)

  const place = (i: number, j: number, k: number): void => {
    const c = cos[k] ?? 1
    const s = sin[k] ?? 0
    for (let r = 0; r < pieces.length; r++) {
      const rect = shape.rects[r]
      const piece = pieces[r]
      if (rect && piece) placeRect(piece, rect.x0, rect.y0, rect.x1, rect.y1, i * step, j * step, c, s)
    }
  }
  const free = (i: number, j: number, k: number): boolean => {
    place(i, j, k)
    for (const piece of pieces) for (const wall of walls) if (overlaps(piece, wall, 0.6)) return false
    return true
  }
  const atNest = (): boolean => {
    for (const piece of pieces) if (distToPoly(piece, puzzle.nest.x, puzzle.nest.y) <= NEST_R) return true
    return false
  }

  const si = Math.round(puzzle.load.x / step)
  const sj = Math.round(puzzle.load.y / step)
  const sk = ((Math.round((puzzle.load.a / (2 * Math.PI)) * turns) % turns) + turns) % turns
  // The start may sit a hair off-lattice; take the nearest free state.
  let start = -1
  search: for (let r = 0; r <= 2; r++) {
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        const i = si + di
        const j = sj + dj
        if (i < 0 || j < 0 || i >= nx || j >= ny) continue
        if (free(i, j, sk)) {
          start = (sk * ny + j) * nx + i
          break search
        }
      }
    }
  }
  if (start < 0) return { solvable: false, path: [], explored: 0 }

  let head = 0
  let tail = 0
  queue[tail++] = start
  seen[start] = 1
  let goal = -1
  while (head < tail) {
    const cur = queue[head++] ?? 0
    const i = cur % nx
    const j = Math.floor(cur / nx) % ny
    const k = Math.floor(cur / (nx * ny))
    place(i, j, k)
    if (atNest()) {
      goal = cur
      break
    }
    for (let m = 0; m < 6; m++) {
      const ni = i + (m === 0 ? 1 : m === 1 ? -1 : 0)
      const nj = j + (m === 2 ? 1 : m === 3 ? -1 : 0)
      const nk = (k + (m === 4 ? 1 : m === 5 ? turns - 1 : 0)) % turns
      if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue
      const id = (nk * ny + nj) * nx + ni
      if (seen[id] !== 0) continue
      if (free(ni, nj, nk)) {
        seen[id] = 1
        parent[id] = cur
        queue[tail++] = id
      } else {
        seen[id] = 2
      }
    }
  }
  const path: number[] = []
  if (goal >= 0) {
    const rev: number[] = []
    for (let cur = goal; cur >= 0; cur = parent[cur] ?? -1) rev.push(cur)
    for (let n = rev.length - 1; n >= 0; n--) {
      const cur = rev[n] ?? 0
      path.push((cur % nx) * step, (Math.floor(cur / nx) % ny) * step, (Math.floor(cur / (nx * ny)) * 2 * Math.PI) / turns)
    }
  }
  return { solvable: goal >= 0, path, explored: tail }
}
