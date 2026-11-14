import { preset, type Puzzle } from '@app/sim'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useLoaderData } from 'react-router'
import { useTRPC } from '~/lib/trpc'
import { Lab } from '~/sim/lab'
import type { Finish } from '~/sim/session'

/** The same puzzle object for as long as its contents don't change, however often the query refetches. */
function useSteady(puzzle: Puzzle | undefined): Puzzle | undefined {
  const [kept, setKept] = useState(puzzle)
  if (kept !== puzzle && JSON.stringify(kept) !== JSON.stringify(puzzle)) {
    setKept(puzzle)
    return puzzle
  }
  return kept
}

/**
 * A puzzle by id, running, with everyone's numbers beside it. A built-in runs from code, so it
 * still works when the numbers can't be fetched.
 */
export function PuzzleLab({ id }: { id: string }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { data } = useQuery(trpc.puzzles.get.queryOptions({ id }))
  const record = useMutation(
    trpc.puzzles.record.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: trpc.puzzles.get.queryKey({ id }) }),
    })
  )
  const report = useMutation(trpc.puzzles.report.mutationOptions())
  const builtIn = preset(id)
  const puzzle = useSteady(builtIn?.puzzle ?? data?.puzzle)
  if (!puzzle) return null

  const onFinish = (finish: Finish): void => {
    if (finish.standard)
      record.mutate({ id, kind: finish.kind, seconds: finish.seconds, seed: finish.seed })
  }

  return (
    <Lab
      puzzle={puzzle}
      title={builtIn?.title ?? data?.title ?? ''}
      tally={data ?? undefined}
      onFinish={onFinish}>
      <div className="flex items-center justify-between gap-4 text-sm">
        <Link
          to={`/build?from=${encodeURIComponent(id)}`}
          className="font-medium underline underline-offset-4">
          Edit this puzzle
        </Link>
        {!builtIn &&
          (report.isSuccess ? (
            <span className="text-muted-foreground">Reported</span>
          ) : (
            <button
              type="button"
              disabled={report.isPending}
              onClick={() => report.mutate({ id })}
              className="cursor-pointer text-muted-foreground underline underline-offset-4 hover:text-foreground">
              Report
            </button>
          ))}
      </div>
    </Lab>
  )
}

export function PuzzlePage() {
  const { id } = useLoaderData<{ id: string }>()
  return <PuzzleLab key={id} id={id} />
}
