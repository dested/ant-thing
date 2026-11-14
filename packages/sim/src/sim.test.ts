import { describe, expect, test } from 'bun:test'
import {
  buildShape,
  CARRY,
  checkPuzzle,
  DT,
  findRoute,
  isConnected,
  NEST,
  overlaps,
  preset,
  PRESETS,
  puzzleSchema,
  tCells,
  World,
  type Puzzle,
} from './index'

const piano = preset('piano-movers')?.puzzle
const open = preset('open-field')?.puzzle
if (!piano || !open) throw new Error('presets missing')

describe('shape', () => {
  test('the T is three overlapping bars with grip points all the way round', () => {
    const shape = buildShape(tCells(), 14)
    expect(shape.rects.length).toBe(3)
    expect(shape.cellCount).toBe(72)
    // Perimeter 2 * (22 + 12) cells plus the inner notches, two grip points per cell edge.
    expect(shape.sites.length).toBeGreaterThan(130)
    expect(isConnected(tCells())).toBe(true)
    expect(
      isConnected([
        [0, 0],
        [2, 0],
      ])
    ).toBe(false)
  })
})

describe('puzzles', () => {
  test('every preset passes the schema and can be solved by the planner', () => {
    for (const p of PRESETS) {
      expect(puzzleSchema.safeParse(p.puzzle).success).toBe(true)
      expect(findRoute(p.puzzle).solvable).toBe(true)
    }
  }, 60_000)

  test('every preset passes the cheap checks, and the checks catch a load in a wall', () => {
    for (const p of PRESETS) expect(checkPuzzle(p.puzzle)).toBeNull()
    expect(checkPuzzle({ ...piano, load: { ...piano.load, x: 490, y: 100 } })).toContain(
      'inside a wall'
    )
    expect(
      checkPuzzle({
        ...open,
        load: {
          ...open.load,
          cells: [
            [0, 0],
            [5, 5],
          ],
        },
      })
    ).toContain('more than one piece')
    expect(checkPuzzle({ ...open, nest: { x: 2000, y: 10 } })).toContain('nest')
  })

  test('a sealed arena is reported unsolvable', () => {
    const sealed: Puzzle = { ...open, walls: [[520, 0, 520, 700]] }
    expect(findRoute(sealed).solvable).toBe(false)
  })
})

describe('world', () => {
  test('a seed replays exactly', () => {
    const a = new World(piano, 7)
    const b = new World(piano, 7)
    a.prewarm(20)
    b.prewarm(20)
    for (let i = 0; i < 1200; i++) {
      a.step()
      b.step()
    }
    expect([a.x, a.y, a.a]).toEqual([b.x, b.y, b.a])
    expect(a.stats).toEqual(b.stats)
    const c = new World(piano, 8)
    c.prewarm(20)
    for (let i = 0; i < 1200; i++) c.step()
    expect(c.x).not.toBe(a.x)
  }, 60_000)

  test('the colony delivers across an open field', () => {
    const w = new World(open, 3)
    w.prewarm(60)
    for (let i = 0; i < 400 / DT && !w.delivered; i++) w.step()
    expect(w.delivered).toBe(true)
    expect(w.deliveredAt).toBeLessThan(400)
  }, 60_000)

  test('the load never sinks into a wall', () => {
    const w = new World(piano, 5)
    w.prewarm(60)
    for (let i = 0; i < 240 / DT; i++) {
      w.step()
      if (i % 20 !== 0) continue
      for (const piece of w.pieces)
        for (const wall of w.walls) expect(overlaps(piece, wall, 1)).toBe(false)
    }
    expect(w.deepest).toBeLessThan(1)
  }, 60_000)

  test('no free ant stays wedged in a corner', () => {
    // Scent used to pass through walls: ants pressed toward it and piled up where a wall meets the edge.
    const w = new World(piano, 2)
    w.prewarm(45)
    for (let i = 0; i < 200 / DT; i++) w.step()
    const looks: { x: number; y: number; free: boolean }[][] = []
    for (let look = 0; look < 3; look++) {
      looks.push(
        w.ants.map((a) => ({ x: a.x, y: a.y, free: a.state !== CARRY && a.state !== NEST }))
      )
      for (let i = 0; i < 4 / DT; i++) w.step()
    }
    let stuck = 0
    w.ants.forEach((_, i) => {
      const [a, b, c] = [looks[0]?.[i], looks[1]?.[i], looks[2]?.[i]]
      if (!a || !b || !c || !a.free || !b.free || !c.free) return
      if (Math.hypot(a.x - b.x, a.y - b.y) < 10 && Math.hypot(a.x - c.x, a.y - c.y) < 10) stuck++
    })
    expect(stuck).toBeLessThanOrEqual(1)
  }, 60_000)

  test('with no conformity the load goes nowhere', () => {
    const w = new World(open, 3, { conformity: 0 })
    w.prewarm(60)
    for (let i = 0; i < 120 / DT && !w.delivered; i++) w.step()
    expect(w.delivered).toBe(false)
  }, 60_000)
})
