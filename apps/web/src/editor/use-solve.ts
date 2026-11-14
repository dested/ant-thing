import type { Puzzle } from '@app/sim'
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'

const replySchema = z.object({
  id: z.number(),
  problem: z.string().nullable(),
  solvable: z.boolean(),
  path: z.array(z.number()),
})

export interface Solve {
  /** True while the planner is still working on the latest change. */
  checking: boolean
  problem: string | null
  solvable: boolean
  path: number[]
}

const START: Solve = { checking: true, problem: null, solvable: false, path: [] }

/**
 * Runs the planner on every change to the puzzle, a moment after the change settles. A check that
 * is still running when the puzzle changes again is thrown away with its worker.
 */
export function useSolve(puzzle: Puzzle): Solve {
  const [solve, setSolve] = useState<Solve>(START)
  const worker = useRef<Worker | null>(null)
  const busy = useRef(false)
  const latest = useRef(0)

  useEffect(() => {
    setSolve((s) => (s.checking ? s : { ...s, checking: true }))
    const timer = window.setTimeout(() => {
      if (busy.current && worker.current) {
        worker.current.terminate()
        worker.current = null
      }
      if (!worker.current) {
        const next = new Worker(new URL('./solve.worker.ts', import.meta.url), { type: 'module' })
        next.addEventListener('message', (event: MessageEvent<unknown>) => {
          const parsed = replySchema.safeParse(event.data)
          if (!parsed.success || parsed.data.id !== latest.current) return
          busy.current = false
          setSolve({
            checking: false,
            problem: parsed.data.problem,
            solvable: parsed.data.solvable,
            path: parsed.data.path,
          })
        })
        worker.current = next
      }
      latest.current++
      busy.current = true
      worker.current.postMessage({ id: latest.current, puzzle })
    }, 350)
    return () => window.clearTimeout(timer)
  }, [puzzle])

  useEffect(
    () => () => {
      worker.current?.terminate()
      worker.current = null
    },
    []
  )

  return solve
}
