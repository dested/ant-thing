// The numbers behind the page's charts: the piano-movers puzzle, the same seeds under every condition.
//   bun bench/science.ts [--seeds 96] [--max 1800] [--jobs 20] > ../../apps/web/src/science/data.json
import { z } from 'zod'

const argv = process.argv.slice(2)
const arg = (name: string, fallback: number): number => {
  const at = argv.indexOf(`--${name}`)
  return at >= 0 ? Number(argv[at + 1]) : fallback
}
const seeds = arg('seeds', 96)
const max = arg('max', 1800)
const jobs = arg('jobs', 20)

const summarySchema = z.object({
  runs: z.number(),
  solved: z.number(),
  results: z.array(z.object({ seed: z.number(), solved: z.boolean(), time: z.number() })),
})

interface Point {
  value: number
  runs: number
  delivered: number
  /** Delivery times in seconds, sorted. */
  times: number[]
}

async function trial(extra: string[]): Promise<Omit<Point, 'value'>> {
  const proc = Bun.spawn(
    [
      'bun',
      `${import.meta.dir}/run.ts`,
      '--puzzle',
      'piano-movers',
      '--seed',
      '1000',
      '--seeds',
      String(seeds),
      '--max',
      String(max),
      '--jobs',
      String(jobs),
      '--json',
      ...extra,
    ],
    { stdout: 'pipe', stderr: 'inherit' }
  )
  const text = await new Response(proc.stdout).text()
  const summary = summarySchema.parse(JSON.parse(text))
  const times = summary.results
    .filter((r) => r.solved)
    .map((r) => Math.round(r.time))
    .sort((a, b) => a - b)
  return { runs: summary.runs, delivered: summary.solved, times }
}

async function sweep(values: number[], flags: (value: number) => string[]): Promise<Point[]> {
  const points: Point[] = []
  for (const value of values) {
    const started = performance.now()
    const point = { value, ...(await trial(flags(value))) }
    points.push(point)
    console.error(
      `${flags(value).join(' ')}: ${point.delivered}/${point.runs} in ${((performance.now() - started) / 1000).toFixed(0)}s`
    )
  }
  return points
}

const conformity = await sweep([0, 0.1, 0.25, 0.5, 1, 2, 3, 5], (v) => ['--set', `conformity=${v}`])
const ants = await sweep([25, 50, 100, 200, 400, 800], (v) => ['--ants', String(v)])
const informedTime = await sweep([0, 2, 5, 10, 20, 40], (v) => ['--set', `informedTime=${v}`])
// Where a newcomer thinks home is: the scent alone, or the straight line alone (with scent off the
// compass weight no longer matters: she has only her own home vector).
const [scentOnly] = await sweep([0], () => ['--set', 'compass=0'])
const [lineOnly] = await sweep([0], () => ['--set', 'scent=false'])

console.log(
  JSON.stringify(
    {
      puzzle: 'piano-movers',
      seeds,
      cap: max,
      conformity,
      ants,
      informedTime,
      home: { scentOnly, lineOnly },
    },
    null,
    1
  )
)
