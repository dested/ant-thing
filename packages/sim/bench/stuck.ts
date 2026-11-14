// Counts free ants that go nowhere: `bun bench/stuck.ts [--puzzle id] [--seeds n] [--at seconds]`.
// An ant is stuck when three looks, four seconds apart, find her free and within 10 units of the same spot.
import { CARRY, DT, NEST, World } from '../src'
import { parseArgs } from './args'

const args = parseArgs(process.argv.slice(2))
const puzzle = args.puzzle
const at = Number(process.argv[process.argv.indexOf('--at') + 1]) || 240
let worst = 0
let total = 0
for (let seed = 1; seed <= args.seeds; seed++) {
  const world = new World(puzzle, seed)
  world.prewarm(45)
  for (let t = 0; t < at / DT; t++) world.step()
  const looks: { x: number; y: number; free: boolean }[][] = []
  for (let look = 0; look < 3; look++) {
    looks.push(
      world.ants.map((a) => ({ x: a.x, y: a.y, free: a.state !== CARRY && a.state !== NEST }))
    )
    for (let t = 0; t < 4 / DT; t++) world.step()
  }
  let stuck = 0
  const where: string[] = []
  world.ants.forEach((_, i) => {
    const [a, b, c] = [looks[0]?.[i], looks[1]?.[i], looks[2]?.[i]]
    if (!a || !b || !c || !a.free || !b.free || !c.free) return
    if (Math.hypot(a.x - b.x, a.y - b.y) < 10 && Math.hypot(a.x - c.x, a.y - c.y) < 10) {
      stuck++
      if (where.length < 6) where.push(`${a.x.toFixed(0)},${a.y.toFixed(0)}`)
    }
  })
  total += stuck
  worst = Math.max(worst, stuck)
  console.log(`seed ${seed}: ${stuck} stuck ${where.join(' ')}`)
}
console.log(`total ${total} over ${args.seeds} seeds, worst ${worst}`)
