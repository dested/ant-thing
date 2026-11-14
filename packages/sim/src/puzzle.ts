import { z } from 'zod'

/** Wall thickness, in sim units (an ant is 12 units long). */
export const WALL_T = 14
/** The load counts as delivered when any part of it comes this close to the nest. */
export const NEST_R = 34

export const LIMITS = {
  minW: 400,
  maxW: 1600,
  minH: 300,
  maxH: 1000,
  maxWalls: 160,
  maxCells: 400,
  grid: 40,
  minCell: 8,
  maxCell: 24,
  minAnts: 10,
  maxAnts: 800,
} as const

const coord = z.number().finite().min(-50).max(LIMITS.maxW + 50)
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
    cells: z.array(z.tuple([cellIndex, cellIndex])).min(1).max(LIMITS.maxCells),
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

export const PRESETS: Preset[] = [
  { id: 'piano-movers', title: 'Piano movers', puzzle: piano },
  { id: 'open-field', title: 'Open field', puzzle: open },
  { id: 'the-wall', title: 'The wall', puzzle: wall },
  { id: 'doorway', title: 'Doorway', puzzle: doorway },
  { id: 'chicane', title: 'Chicane', puzzle: chicane },
]

export function preset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id)
}
