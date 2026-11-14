import { DEFAULT_PARAMS, PRESETS, type Params, type Puzzle } from '../src/index'

export interface Args {
  puzzle: Puzzle
  puzzleId: string
  seed: number
  seeds: number
  max: number
  prewarm: number
  ants: number | null
  params: Partial<Params>
  flags: Set<string>
  values: Map<string, string>
}

/** Shared flag parsing for the bench tools: --puzzle id --seed n --seeds n --max s --ants n --set key=value,... */
export function parseArgs(argv: string[]): Args {
  const values = new Map<string, string>()
  const flags = new Set<string>()
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a || !a.startsWith('--')) continue
    const next = argv[i + 1]
    if (next !== undefined && !next.startsWith('--')) {
      values.set(a.slice(2), next)
      i++
    } else {
      flags.add(a.slice(2))
    }
  }
  const puzzleId = values.get('puzzle') ?? 'piano-movers'
  const found = PRESETS.find((p) => p.id === puzzleId)
  if (!found) {
    console.error(`Unknown puzzle "${puzzleId}". Known: ${PRESETS.map((p) => p.id).join(', ')}`)
    process.exit(2)
  }
  const params: Partial<Params> = {}
  const set = values.get('set')
  if (set) {
    for (const pair of set.split(',')) {
      const [k, v] = pair.split('=')
      if (!k || v === undefined || !(k in DEFAULT_PARAMS)) {
        console.error(`Unknown param "${pair}". Known: ${Object.keys(DEFAULT_PARAMS).join(', ')}`)
        process.exit(2)
      }
      const key = k as keyof Params
      if (key === 'scent') params.scent = v === 'true' || v === '1'
      else params[key] = Number(v)
    }
  }
  const antsArg = values.get('ants')
  const ants = antsArg ? Number(antsArg) : null
  const puzzle: Puzzle = ants ? { ...found.puzzle, ants } : found.puzzle
  return {
    puzzle,
    puzzleId,
    seed: Number(values.get('seed') ?? 1),
    seeds: Number(values.get('seeds') ?? 20),
    max: Number(values.get('max') ?? 600),
    prewarm: Number(values.get('prewarm') ?? 60),
    ants,
    params,
    flags,
    values,
  }
}
