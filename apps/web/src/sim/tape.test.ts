import { describe, expect, test } from 'bun:test'
import { NEST, requirePreset, World } from '@app/sim'
import { Tape } from './tape'

const puzzle = { ...requirePreset('piano-movers').puzzle, ants: 60 }

function run(steps: number): { world: World; tape: Tape; poses: number[][] } {
  const world = new World(puzzle, 7)
  world.prewarm(20)
  const tape = new Tape()
  const poses: number[][] = []
  for (let n = 0; n < steps; n++) {
    world.step()
    const before = tape.length
    tape.step(world)
    if (tape.length > before) poses.push([world.x, world.y, world.a, world.time])
  }
  return { world, tape, poses }
}

describe('tape', () => {
  test('a frame shows the run as it stood', () => {
    const { world, tape, poses } = run(600)
    expect(tape.length).toBe(100)
    const ghost = new World(puzzle, 7)
    const at = 40
    tape.show(at, ghost, world.trace)
    const pose = poses[at]
    if (!pose) throw new Error('no pose')
    expect(ghost.x).toBeCloseTo(pose[0] ?? 0, 6)
    expect(ghost.y).toBeCloseTo(pose[1] ?? 0, 6)
    expect(ghost.a).toBeCloseTo(pose[2] ?? 0, 6)
    expect(tape.timeAt(at)).toBeCloseTo(pose[3] ?? 0, 6)
    // The path stops where the frame does.
    expect(ghost.trace.length).toBeLessThan(world.trace.length)
    expect(ghost.trace.length % 3).toBe(0)
  })

  test('the last frame puts every ant where she is', () => {
    const { world, tape } = run(600)
    tape.keep(world)
    const ghost = new World(puzzle, 7)
    tape.show(tape.length - 1, ghost, world.trace)
    world.ants.forEach((ant, n) => {
      const shown = ghost.ants[n]
      if (!shown) throw new Error('no ant')
      expect(shown.state === NEST).toBe(ant.state === NEST)
      expect(Math.abs(shown.x - ant.x)).toBeLessThan(0.07)
      expect(Math.abs(shown.y - ant.y)).toBeLessThan(0.07)
      expect(Math.cos(shown.h - ant.h)).toBeGreaterThan(0.999)
    })
  })

  test('half way between two frames is half way between their poses', () => {
    const { world, tape, poses } = run(600)
    const ghost = new World(puzzle, 7)
    tape.show(50.5, ghost, world.trace)
    const a = poses[50]
    const b = poses[51]
    if (!a || !b) throw new Error('no pose')
    expect(ghost.x).toBeCloseTo(((a[0] ?? 0) + (b[0] ?? 0)) / 2, 6)
    expect(ghost.a).toBeCloseTo(((a[2] ?? 0) + (b[2] ?? 0)) / 2, 6)
  })

  test('a copy is safe from what the run does next', () => {
    const { world, tape } = run(120)
    const copy = tape.copy()
    const length = copy.length
    for (let n = 0; n < 60; n++) {
      world.step()
      tape.step(world)
    }
    tape.clear()
    expect(copy.length).toBe(length)
    expect(tape.length).toBe(0)
  })
})
