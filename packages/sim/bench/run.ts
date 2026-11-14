// Headless trials: how often, and how fast, does a colony deliver the load?
//   bun bench/run.ts --puzzle piano-movers --seeds 32 --max 900 --jobs 16 [--ants n] [--set key=value,...] [--json]
//   bun bench/run.ts --puzzle piano-movers --seed 3 --max 300 --log 5      one run, a line every 5 s
import { DT, World } from '../src/index'
import { parseArgs } from './args'

const argv = process.argv.slice(2)
const args = parseArgs(argv)

interface Result {
  seed: number
  solved: boolean
  time: number
}

function runOne(seed: number, log: number): Result {
  const world = new World(args.puzzle, seed, args.params)
  world.prewarm(args.prewarm)
  const steps = Math.round(args.max / DT)
  const gap = log > 0 ? Math.round(log / DT) : 0
  for (let i = 1; i <= steps && !world.delivered; i++) {
    world.step()
    if (gap && i % gap === 0) {
      const s = world.stats
      console.log(
        `t=${world.time.toFixed(0).padStart(4)} x=${world.x.toFixed(0).padStart(4)} y=${world.y.toFixed(0).padStart(4)} a=${((world.a * 180) / Math.PI).toFixed(0).padStart(4)} v=${Math.hypot(world.vx, world.vy).toFixed(1).padStart(5)} w=${world.w.toFixed(2).padStart(5)} carry=${s.carriers} pull=${s.pullers} inf=${s.informed}`
      )
    }
  }
  return { seed, solved: world.delivered, time: world.delivered ? world.deliveredAt : args.max }
}

const from = args.values.get('from')
if (from !== undefined) {
  // Child mode: run a slice of seeds, print JSON lines.
  const a = Number(from)
  const b = Number(args.values.get('to') ?? a)
  for (let seed = a; seed <= b; seed++) console.log(JSON.stringify(runOne(seed, 0)))
  process.exit(0)
}

const logEvery = Number(args.values.get('log') ?? 0)
if (logEvery > 0) {
  const r = runOne(args.seed, logEvery)
  console.log(r.solved ? `delivered at ${r.time.toFixed(1)}s` : `not delivered in ${args.max}s`)
  process.exit(0)
}

const jobs = Math.max(1, Math.min(Number(args.values.get('jobs') ?? 16), args.seeds))
const first = args.seed
const per = Math.ceil(args.seeds / jobs)
const passthrough = argv.filter((a, i) => {
  const prev = argv[i - 1]
  return !['--jobs', '--seeds', '--seed', '--json'].includes(a) && !(prev && ['--jobs', '--seeds', '--seed'].includes(prev))
})
const started = performance.now()
const children: Promise<Result[]>[] = []
for (let j = 0; j < jobs; j++) {
  const a = first + j * per
  const b = Math.min(first + args.seeds - 1, a + per - 1)
  if (a > b) break
  const proc = Bun.spawn(['bun', import.meta.path, ...passthrough, '--from', String(a), '--to', String(b)], { stdout: 'pipe', stderr: 'inherit' })
  children.push(
    new Response(proc.stdout).text().then((text) =>
      text
        .split('\n')
        .filter((l) => l.startsWith('{'))
        .map((l): Result => {
          const o: unknown = JSON.parse(l)
          if (typeof o !== 'object' || o === null) throw new Error('bad line')
          const r = o as Record<string, unknown>
          return { seed: Number(r.seed), solved: r.solved === true, time: Number(r.time) }
        })
    )
  )
}
const results = (await Promise.all(children)).flat().sort((a, b) => a.seed - b.seed)
const solved = results.filter((r) => r.solved).map((r) => r.time).sort((a, b) => a - b)
const q = (f: number): number => solved[Math.min(solved.length - 1, Math.floor(f * solved.length))] ?? Number.NaN
const summary = {
  puzzle: args.puzzleId,
  ants: args.puzzle.ants,
  params: args.params,
  runs: results.length,
  solved: solved.length,
  rate: results.length ? solved.length / results.length : 0,
  median: q(0.5),
  p25: q(0.25),
  p75: q(0.75),
  fastest: solved[0] ?? Number.NaN,
  maxSeconds: args.max,
  wallSeconds: (performance.now() - started) / 1000,
}
if (args.flags.has('json')) {
  console.log(JSON.stringify({ ...summary, results }))
} else {
  console.log(
    `${summary.puzzle} ants=${summary.ants} ${JSON.stringify(summary.params)}\n  solved ${summary.solved}/${summary.runs} (${(summary.rate * 100).toFixed(0)}%)  median ${summary.median.toFixed(0)}s  p25 ${summary.p25.toFixed(0)}s  p75 ${summary.p75.toFixed(0)}s  fastest ${summary.fastest.toFixed(0)}s  [${summary.wallSeconds.toFixed(1)}s wall]`
  )
  console.log('  ' + results.map((r) => (r.solved ? r.time.toFixed(0) : '-')).join(' '))
}
