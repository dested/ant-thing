import type { Puzzle } from '@app/sim'
import { useEffect, useState } from 'react'
import { z } from 'zod'

const spaceSchema = z.object({
  step: z.number(),
  cols: z.number(),
  rows: z.number(),
  open: z.instanceof(Uint8Array),
  goal: z.instanceof(Uint8Array),
  solvable: z.boolean(),
  /** The planner's shortest solution, every lattice step: x, y, angle triples. */
  path: z.array(z.number()),
  /** The same, thinned to a ghost every few steps. */
  route: z.array(z.number()),
})
export type Space = z.infer<typeof spaceSchema>

/** The puzzle's configuration space, computed once a view asks for it. Null until it is ready. */
export function useSpace(puzzle: Puzzle, wanted: boolean): Space | null {
  const [found, setFound] = useState<{ puzzle: Puzzle; space: Space | null } | null>(null)
  const [asked, setAsked] = useState(false)
  if (wanted && !asked) setAsked(true)

  useEffect(() => {
    if (!asked) return
    const worker = new Worker(new URL('./space.worker.ts', import.meta.url), { type: 'module' })
    worker.addEventListener('message', (event: MessageEvent<unknown>) => {
      const parsed = spaceSchema.safeParse(event.data)
      setFound({ puzzle, space: parsed.success ? parsed.data : null })
      worker.terminate()
    })
    worker.postMessage(puzzle)
    return () => worker.terminate()
  }, [puzzle, asked])

  return found && found.puzzle === puzzle ? found.space : null
}
