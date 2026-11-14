import { hookCells, LIMITS, mazeWalls, puzzleSchema, sofaCells, tCells, type Puzzle } from '@app/sim'
import { z } from 'zod'

/** What the editor is working on. Kept in this browser until it is published. */
export const draftSchema = z.object({ title: z.string().max(80), puzzle: puzzleSchema })
export type Draft = z.infer<typeof draftSchema>

const KEY = 'ant-movers:draft'

export function loadDraft(): Draft | null {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = draftSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function saveDraft(draft: Draft): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(draft))
  } catch {
    // Storage is full or blocked: the draft lives on in memory for this visit.
  }
}

type Cells = [number, number][]

function bar(x0: number, y0: number, w: number, h: number): Cells {
  const out: Cells = []
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) out.push([x, y])
  return out
}

function uniq(cells: Cells): Cells {
  const seen = new Set<number>()
  return cells.filter(([x, y]) => {
    const k = y * 64 + x
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/** Move a shape so it sits in the middle of the painter's grid. */
export function centred(cells: Cells): Cells {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of cells) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  const dx = Math.floor((LIMITS.grid - (maxX - minX + 1)) / 2) - minX
  const dy = Math.floor((LIMITS.grid - (maxY - minY + 1)) / 2) - minY
  return cells.map(([x, y]) => [x + dx, y + dy])
}

/** Load shapes to start from. */
export const SHAPES: readonly { id: string; label: string; cells: Cells }[] = [
  { id: 't', label: 'T', cells: tCells() },
  { id: 'bar', label: 'Bar', cells: bar(0, 0, 14, 2) },
  { id: 'block', label: 'Block', cells: bar(0, 0, 8, 8) },
  { id: 'l', label: 'L', cells: uniq([...bar(0, 0, 3, 12), ...bar(0, 9, 10, 3)]) },
  { id: 'u', label: 'U', cells: hookCells() },
  { id: 'plus', label: 'Plus', cells: uniq([...bar(0, 4, 10, 2), ...bar(4, 0, 2, 10)]) },
  { id: 'sofa', label: 'Sofa', cells: sofaCells(19, 6, 9, 4) },
  { id: 'ring', label: 'Ring', cells: uniq([...bar(0, 0, 10, 2), ...bar(0, 8, 10, 2), ...bar(0, 0, 2, 10), ...bar(8, 0, 2, 10)]) },
  { id: 'h', label: 'H', cells: uniq([...bar(0, 0, 2, 12), ...bar(8, 0, 2, 12), ...bar(0, 5, 10, 2)]) },
  { id: 'comb', label: 'Comb', cells: uniq([...bar(0, 0, 14, 2), ...bar(0, 0, 2, 8), ...bar(4, 0, 2, 8), ...bar(8, 0, 2, 8), ...bar(12, 0, 2, 8)]) },
  { id: 'zig', label: 'Zigzag', cells: uniq([...bar(0, 0, 8, 2), ...bar(6, 0, 2, 8), ...bar(6, 6, 8, 2)]) },
  { id: 'spiral', label: 'Spiral', cells: uniq([...bar(0, 0, 12, 2), ...bar(10, 0, 2, 12), ...bar(2, 10, 10, 2), ...bar(2, 4, 2, 8), ...bar(2, 4, 6, 2), ...bar(6, 4, 2, 4)]) },
]

export function blankDraft(): Draft {
  return {
    title: '',
    puzzle: {
      v: 1,
      w: 1040,
      h: 700,
      walls: [
        [520, 0, 520, 270],
        [520, 430, 520, 700],
      ],
      load: { cell: 14, cells: centred(SHAPES[3]?.cells ?? bar(0, 0, 6, 2)), x: 240, y: 350, a: 0 },
      nest: { x: 990, y: 350 },
      ants: 300,
    },
  }
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/** Resize the arena, pulling everything that would fall outside back in. */
export function resized(puzzle: Puzzle, w: number, h: number): Puzzle {
  return {
    ...puzzle,
    w,
    h,
    walls: puzzle.walls.map(([x1, y1, x2, y2]) => [clamp(x1, 0, w), clamp(y1, 0, h), clamp(x2, 0, w), clamp(y2, 0, h)]),
    nest: { x: clamp(puzzle.nest.x, 20, w - 20), y: clamp(puzzle.nest.y, 20, h - 20) },
    load: { ...puzzle.load, x: clamp(puzzle.load.x, 20, w - 20), y: clamp(puzzle.load.y, 20, h - 20) },
  }
}

/** Replace the walls with a fresh maze, load in one corner cell and nest in the opposite one. */
export function withMaze(puzzle: Puzzle, seed: number): Puzzle {
  const cols = clamp(Math.round(puzzle.w / 173), 2, 14)
  const rows = clamp(Math.round(puzzle.h / 175), 2, 10)
  const cw = puzzle.w / cols
  const ch = puzzle.h / rows
  const corridor = Math.min(cw, ch) - 14
  let span = 0
  for (const [x, y] of puzzle.load.cells) {
    for (const [x2, y2] of puzzle.load.cells) span = Math.max(span, Math.hypot(x - x2 + 1, y - y2 + 1) * puzzle.load.cell)
  }
  const cells = span > corridor - 30 ? centred(uniq([...bar(0, 2, 6, 2), ...bar(2, 0, 2, 6)])) : puzzle.load.cells
  return {
    ...puzzle,
    walls: mazeWalls(cols, rows, cw, ch, seed),
    load: { ...puzzle.load, cells, cell: span > corridor - 30 ? 14 : puzzle.load.cell, x: Math.round(cw / 2), y: Math.round(ch / 2), a: 0 },
    nest: { x: Math.round(puzzle.w - cw / 2), y: Math.round(puzzle.h - ch / 2) },
  }
}
