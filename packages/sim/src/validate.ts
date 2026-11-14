import { emptyQuad, hyp, overlaps, placeRect, segmentPoly } from './geom'
import { NEST_R, WALL_T, type Puzzle } from './puzzle'
import { buildShape, isConnected } from './shape'

/**
 * The cheap checks every puzzle must pass before it is run or published. Returns what is wrong, in
 * words the builder can act on, or null. Whether it can be solved at all is `findRoute`'s job.
 */
export function checkPuzzle(puzzle: Puzzle): string | null {
  const { w, h, walls, load, nest } = puzzle
  if (!isConnected(load.cells)) return 'The load is in more than one piece. Join the pieces or erase the stray cells.'
  for (const [x1, y1, x2, y2] of walls) {
    if (Math.min(x1, x2) < 0 || Math.max(x1, x2) > w || Math.min(y1, y2) < 0 || Math.max(y1, y2) > h) {
      return 'A wall runs outside the arena. Drag its ends back inside.'
    }
  }
  if (nest.x < 12 || nest.y < 12 || nest.x > w - 12 || nest.y > h - 12) {
    return 'The nest is outside the arena. Move it inside.'
  }
  const polys = [
    ...walls.map(([x1, y1, x2, y2]) => segmentPoly(x1, y1, x2, y2, WALL_T)),
    segmentPoly(-30, -30, -30, h + 30, 60),
    segmentPoly(w + 30, -30, w + 30, h + 30, 60),
    segmentPoly(-30, -30, w + 30, -30, 60),
    segmentPoly(-30, h + 30, w + 30, h + 30, 60),
  ]
  for (const [x1, y1, x2, y2] of walls) {
    const dx = x2 - x1
    const dy = y2 - y1
    const len2 = dx * dx + dy * dy
    const t = len2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((nest.x - x1) * dx + (nest.y - y1) * dy) / len2))
    if (hyp(nest.x - (x1 + dx * t), nest.y - (y1 + dy * t)) < WALL_T / 2 + 10) {
      return 'The nest is inside a wall. Move one of them.'
    }
  }
  const shape = buildShape(load.cells, load.cell)
  const c = Math.cos(load.a)
  const s = Math.sin(load.a)
  const piece = emptyQuad()
  for (const r of shape.rects) {
    placeRect(piece, r.x0, r.y0, r.x1, r.y1, load.x, load.y, c, s)
    for (const poly of polys) {
      if (overlaps(piece, poly, 0.6)) return 'The load starts inside a wall or over the edge. Move it into open floor.'
    }
  }
  if (hyp(load.x - nest.x, load.y - nest.y) < shape.radius + NEST_R + 20) {
    return 'The load starts on top of the nest. Move them apart.'
  }
  return null
}

/** The least sim time a delivery can take: the straight-line distance at a given speed. */
export function fastestPossible(puzzle: Puzzle, speed: number): number {
  const shape = buildShape(puzzle.load.cells, puzzle.load.cell)
  const gap = hyp(puzzle.load.x - puzzle.nest.x, puzzle.load.y - puzzle.nest.y) - shape.radius - NEST_R
  return Math.max(0, gap) / speed
}
