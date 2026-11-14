import { z } from 'zod'
import { Rng } from './rng'

/** Wall thickness, in sim units (an ant is 12 units long). */
export const WALL_T = 14
/** The load counts as delivered when any part of it comes this close to the nest. */
export const NEST_R = 34

export const LIMITS = {
  minW: 400,
  maxW: 2400,
  minH: 300,
  maxH: 1600,
  maxWalls: 400,
  maxCells: 600,
  grid: 40,
  minCell: 8,
  maxCell: 24,
  minAnts: 10,
  maxAnts: 3000,
} as const

const coord = z
  .number()
  .finite()
  .min(-50)
  .max(LIMITS.maxW + 50)
const cellIndex = z
  .number()
  .int()
  .min(0)
  .max(LIMITS.grid - 1)

/** A puzzle: an arena, wall segments, one load built from grid cells, a nest and a colony size. */
export const puzzleSchema = z.object({
  v: z.literal(1),
  w: z.number().int().min(LIMITS.minW).max(LIMITS.maxW),
  h: z.number().int().min(LIMITS.minH).max(LIMITS.maxH),
  /** Segments [x1, y1, x2, y2]; every wall is WALL_T thick with square caps. */
  walls: z.array(z.tuple([coord, coord, coord, coord])).max(LIMITS.maxWalls),
  load: z.object({
    /** Cell size in units. */
    cell: z.number().int().min(LIMITS.minCell).max(LIMITS.maxCell),
    /** Filled cells [cx, cy] on a grid. */
    cells: z
      .array(z.tuple([cellIndex, cellIndex]))
      .min(1)
      .max(LIMITS.maxCells),
    /** Start pose: the shape's centroid and its rotation in radians. */
    x: coord,
    y: coord,
    a: z.number().finite().min(-10).max(10),
  }),
  nest: z.object({ x: coord, y: coord }),
  ants: z.number().int().min(LIMITS.minAnts).max(LIMITS.maxAnts),
})

export type Puzzle = z.infer<typeof puzzleSchema>
export type Wall = Puzzle['walls'][number]

function bar(x0: number, y0: number, w: number, h: number): [number, number][] {
  const out: [number, number][] = []
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) out.push([x, y])
  return out
}

/** The T from the experiment: a long stem, a big crossbar on one end and a small one on the other. */
export function tCells(): [number, number][] {
  return [...bar(0, 0, 2, 12), ...bar(2, 5, 18, 2), ...bar(20, 3, 2, 6)]
}

/** A wall along x = `x` from y0 to y1 with a gap [g0, g1]. */
function slitWall(x: number, h: number, g0: number, g1: number): Wall[] {
  return [
    [x, 0, x, g0],
    [x, g1, x, h],
  ]
}

/** A post: a wall with no length, which the wall thickness turns into a square peg. */
function post(x: number, y: number): Wall {
  return [x, y, x, y]
}

/**
 * The inner walls of a perfect maze (one route between any two cells), carved depth-first from a seed.
 * Cells are `cw` by `ch`; the arena edge is the outer wall. Runs of wall in a line come back as one segment.
 */
export function mazeWalls(
  cols: number,
  rows: number,
  cw: number,
  ch: number,
  seed: number
): Wall[] {
  const rng = new Rng(seed)
  const at = (c: number, r: number): number => r * cols + c
  const seen = new Uint8Array(cols * rows)
  // open[k] bit 0: no wall on the right of cell k; bit 1: no wall below it.
  const open = new Uint8Array(cols * rows)
  const stack: [number, number][] = [[0, 0]]
  seen[0] = 1
  while (stack.length > 0) {
    const top = stack[stack.length - 1]
    if (!top) break
    const [c, r] = top
    const next: [number, number][] = []
    if (c > 0 && !seen[at(c - 1, r)]) next.push([c - 1, r])
    if (c < cols - 1 && !seen[at(c + 1, r)]) next.push([c + 1, r])
    if (r > 0 && !seen[at(c, r - 1)]) next.push([c, r - 1])
    if (r < rows - 1 && !seen[at(c, r + 1)]) next.push([c, r + 1])
    const pick = next[Math.floor(rng.next() * next.length)]
    if (!pick) {
      stack.pop()
      continue
    }
    const [nc, nr] = pick
    if (nc !== c) open[at(Math.min(c, nc), r)] = (open[at(Math.min(c, nc), r)] ?? 0) | 1
    else open[at(c, Math.min(r, nr))] = (open[at(c, Math.min(r, nr))] ?? 0) | 2
    seen[at(nc, nr)] = 1
    stack.push([nc, nr])
  }
  const walls: Wall[] = []
  for (let c = 0; c < cols - 1; c++) {
    let from = -1
    for (let r = 0; r <= rows; r++) {
      const solid = r < rows && ((open[at(c, r)] ?? 0) & 1) === 0
      if (solid && from < 0) from = r
      if (!solid && from >= 0) {
        walls.push([(c + 1) * cw, from * ch, (c + 1) * cw, r * ch])
        from = -1
      }
    }
  }
  for (let r = 0; r < rows - 1; r++) {
    let from = -1
    for (let c = 0; c <= cols; c++) {
      const solid = c < cols && ((open[at(c, r)] ?? 0) & 2) === 0
      if (solid && from < 0) from = c
      if (!solid && from >= 0) {
        walls.push([from * cw, (r + 1) * ch, c * cw, (r + 1) * ch])
        from = -1
      }
    }
  }
  return walls.map(([x1, y1, x2, y2]) => [
    Math.round(x1),
    Math.round(y1),
    Math.round(x2),
    Math.round(y2),
  ])
}

/** A sofa: a thick bar with a bite out of one long side, the shape that turns a corner best. */
export function sofaCells(
  length: number,
  depth: number,
  notchLength: number,
  notchDepth: number
): [number, number][] {
  const start = Math.floor((length - notchLength) / 2)
  return bar(0, 0, length, depth).filter(
    ([x, y]) => !(x >= start && x < start + notchLength && y >= depth - notchDepth)
  )
}

/** A deep U lying on its side, mouth to the right. */
export function hookCells(): [number, number][] {
  return [...bar(0, 0, 2, 15), ...bar(2, 0, 12, 2), ...bar(2, 13, 12, 2)]
}

export interface Preset {
  id: string
  title: string
  puzzle: Puzzle
}

const piano: Puzzle = {
  v: 1,
  w: 1040,
  h: 700,
  walls: [...slitWall(490, 700, 280, 420), ...slitWall(710, 700, 280, 420)],
  load: { cell: 14, cells: tCells(), x: 250, y: 250, a: 0 },
  nest: { x: 1022, y: 350 },
  ants: 400,
}

const open: Puzzle = {
  v: 1,
  w: 1040,
  h: 700,
  walls: [],
  load: { cell: 14, cells: bar(0, 0, 8, 8), x: 220, y: 350, a: 0.3 },
  nest: { x: 1022, y: 350 },
  ants: 160,
}

const wall: Puzzle = {
  v: 1,
  w: 1040,
  h: 700,
  walls: [
    [560, 180, 560, 325],
    [560, 375, 560, 520],
  ],
  load: { cell: 14, cells: bar(0, 0, 9, 9), x: 240, y: 350, a: 0 },
  nest: { x: 1022, y: 350 },
  ants: 220,
}

const doorway: Puzzle = {
  v: 1,
  w: 1040,
  h: 700,
  walls: slitWall(560, 700, 300, 400),
  load: { cell: 14, cells: bar(0, 0, 16, 3), x: 260, y: 200, a: 1.2 },
  nest: { x: 1022, y: 350 },
  ants: 220,
}

const chicane: Puzzle = {
  v: 1,
  w: 1040,
  h: 700,
  walls: [
    [400, 0, 400, 440],
    [660, 260, 660, 700],
  ],
  load: { cell: 14, cells: [...bar(0, 0, 12, 3), ...bar(0, 3, 3, 7)], x: 190, y: 380, a: 0 },
  nest: { x: 1022, y: 350 },
  ants: 240,
}

// A hallway with two corners, one each way. The blocks beside it are sealed off.
const sofa: Puzzle = {
  v: 1,
  w: 1040,
  h: 700,
  walls: [
    [0, 167, 433, 167],
    [433, 167, 433, 700],
    [607, 0, 607, 533],
    [607, 533, 1040, 533],
  ],
  load: { cell: 14, cells: sofaCells(19, 6, 9, 4), x: 190, y: 80, a: 0 },
  nest: { x: 1022, y: 620 },
  ants: 300,
}

// The load starts hooked over a wall: the only way out is to carry it away from the nest first.
const hook: Puzzle = {
  v: 1,
  w: 1040,
  h: 700,
  walls: [[463, 287, 463, 413]],
  load: { cell: 14, cells: hookCells(), x: 474, y: 350, a: 0 },
  nest: { x: 1022, y: 350 },
  ants: 300,
}

const maze: Puzzle = {
  v: 1,
  w: 1040,
  h: 700,
  walls: mazeWalls(6, 4, 1040 / 6, 175, 11),
  load: { cell: 14, cells: [...bar(0, 2, 6, 2), ...bar(2, 0, 2, 6)], x: 87, y: 88, a: 0 },
  nest: { x: 953, y: 612 },
  ants: 500,
}

function pegRows(): Wall[] {
  const out: Wall[] = []
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 4; col++) {
      out.push(post(400 + col * 110 + (row % 2) * 55, 50 + row * 100))
    }
  }
  return out
}

const pegs: Puzzle = {
  v: 1,
  w: 1040,
  h: 700,
  walls: pegRows(),
  load: { cell: 14, cells: bar(0, 0, 11, 2), x: 200, y: 350, a: 1.5708 },
  nest: { x: 1022, y: 350 },
  ants: 260,
}

export const PRESETS: Preset[] = [
  { id: 'piano-movers', title: 'Piano movers', puzzle: piano },
  { id: 'open-field', title: 'Open field', puzzle: open },
  { id: 'the-wall', title: 'The wall', puzzle: wall },
  { id: 'doorway', title: 'Doorway', puzzle: doorway },
  { id: 'chicane', title: 'Chicane', puzzle: chicane },
  { id: 'sofa', title: 'Sofa in the hallway', puzzle: sofa },
  { id: 'the-hook', title: 'The hook', puzzle: hook },
  { id: 'peg-forest', title: 'Peg forest', puzzle: pegs },
  { id: 'maze', title: 'Maze', puzzle: maze },
]

export function preset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id)
}

/** A built-in puzzle that must exist (the home page's, the tests'). */
export function requirePreset(id: string): Preset {
  const found = preset(id)
  if (!found) throw new Error(`No built-in puzzle is named "${id}"`)
  return found
}
