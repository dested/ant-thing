import type { Fields } from './field'
import { hyp, type Poly } from './geom'
import { WALL_T, type Puzzle } from './puzzle'

/** A person is fenced as a disc this wide (an ant is 12 units long). */
export const PERSON_R = 9
/** How far from a free grip point a person can take hold. */
export const PERSON_REACH = 36
/** Where a holder stands, out from her grip point. */
export const PERSON_STAND = 11
/** Walking speed, units per sim second: the same as an ant's. */
export const PERSON_SPEED = 85
/** Ground friction per person in the room, in pulls: everyone pulling one way gets 1 / (1 + this) of the top speed. */
export const PERSON_WEIGHT = 0.5

/** Somebody at the load who is steered from outside the world (a visitor in a room). */
export interface Person {
  x: number
  y: number
  /** Facing, radians. */
  h: number
  /** Grip point index while holding, else -1. */
  site: number
  /** Her pull: a vector no longer than 1. */
  px: number
  py: number
  /** Distance walked, for drawing. */
  gait: number
}

/** Push a point out of the walls until it stands `r` clear of them. */
export function clear(f: Fields, p: { x: number; y: number }, r: number): void {
  for (let i = 0; i < 3; i++) {
    const d = f.dist(p.x, p.y)
    if (d >= r) return
    let gx = f.dist(p.x + 2, p.y) - f.dist(p.x - 2, p.y)
    let gy = f.dist(p.x, p.y + 2) - f.dist(p.x, p.y - 2)
    const gl = hyp(gx, gy)
    if (gl < 1e-6) return
    gx /= gl
    gy /= gl
    p.x += gx * (r - d)
    p.y += gy * (r - d)
  }
}

/**
 * Walk a point toward (x, y) in short steps, sliding along walls: it never ends up through one.
 * The browser runs this for its own person every frame and the server runs it on what the browser reports.
 */
export function walkTo(f: Fields, p: { x: number; y: number }, x: number, y: number): void {
  const dx = x - p.x
  const dy = y - p.y
  const len = hyp(dx, dy)
  if (len < 1e-6) return
  const steps = Math.ceil(len / 3)
  const sx = dx / steps
  const sy = dy / steps
  for (let i = 0; i < steps; i++) {
    const bx = p.x
    const by = p.y
    p.x += sx
    p.y += sy
    clear(f, p, PERSON_R)
    // Still in a wall after the push (a tight corner): stay where she was.
    if (f.dist(p.x, p.y) < PERSON_R * 0.5) {
      p.x = bx
      p.y = by
      return
    }
  }
}

/**
 * The walls a load has to get through on its way to the nest: each x where upright walls close off
 * most of the arena's height, nearest the load first. (The piano-movers puzzle has two.)
 */
export function gateLines(puzzle: Puzzle): number[] {
  const covered = new Map<number, number>()
  for (const [x1, y1, x2, y2] of puzzle.walls) {
    if (Math.abs(x1 - x2) > 1) continue
    covered.set(x1, (covered.get(x1) ?? 0) + Math.abs(y2 - y1))
  }
  const toward = Math.sign(puzzle.nest.x - puzzle.load.x) || 1
  return [...covered]
    .filter(([x, length]) => length >= puzzle.h * 0.5 && (x - puzzle.load.x) * toward > 0)
    .map(([x]) => x)
    .sort((a, b) => (a - b) * toward)
}

/** How many of those walls the whole load is past. */
export function gatesPassed(
  puzzle: Puzzle,
  gates: readonly number[],
  pieces: readonly Poly[]
): number {
  const toward = Math.sign(puzzle.nest.x - puzzle.load.x) || 1
  let passed = 0
  for (const gate of gates) {
    const line = gate + (toward * WALL_T) / 2
    let through = true
    for (const piece of pieces) {
      for (const point of piece.pts) if ((point.x - line) * toward < 0) through = false
    }
    if (!through) break
    passed++
  }
  return passed
}
