import type { Puzzle } from '@app/sim'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { Segmented } from '~/components/ui/segmented'
import { useTRPC } from '~/lib/trpc'
import { clock } from '~/sim/clock'
import { PuzzleThumb } from '~/sim/thumb'

type Sort = 'played' | 'new'

const SORTS: readonly { value: Sort; label: string }[] = [
  { value: 'played', label: 'Most played' },
  { value: 'new', label: 'Newest' },
]

interface Card {
  id: string
  title: string
  puzzle: Puzzle
  antRuns: number
  antBest: number | null
}

function Tile({ card }: { card: Card }) {
  return (
    <li>
      <Link to={card.id === 'piano-movers' ? '/' : `/p/${card.id}`} className="group block">
        <PuzzleThumb puzzle={card.puzzle} className="aspect-[3/2] w-full" />
        <span className="mt-2 block font-display text-xl leading-tight font-bold group-hover:underline">
          {card.title}
        </span>
        {card.antRuns > 0 && (
          <span className="tabular block text-sm text-muted-foreground">
            {card.antRuns.toLocaleString('en-US')} {card.antRuns === 1 ? 'colony' : 'colonies'}{' '}
            delivered
            {card.antBest !== null && `, fastest ${clock(card.antBest)}`}
          </span>
        )}
      </Link>
    </li>
  )
}

export function PuzzlesPage() {
  const trpc = useTRPC()
  const [sort, setSort] = useState<Sort>('played')
  const { data, isError } = useQuery(trpc.puzzles.list.queryOptions({ sort, page: 0 }))

  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-4xl font-extrabold">Puzzles</h1>
        <Link to="/build" className="text-sm font-medium underline underline-offset-4">
          Build your own
        </Link>
      </div>
      {isError && (
        <p className="mt-6 text-destructive">
          The puzzles couldn’t be loaded. Reload the page to try again.
        </p>
      )}
      <ul className="mt-6 grid gap-x-5 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
        {data?.presets.map((card) => (
          <Tile key={card.id} card={card} />
        ))}
      </ul>

      <div className="mt-14 flex flex-wrap items-end justify-between gap-4">
        <h2 className="font-display text-3xl font-extrabold">Built by visitors</h2>
        <Segmented label="Order" value={sort} options={SORTS} onChange={setSort} />
      </div>
      {data && data.community.length === 0 ? (
        <p className="mt-6 text-muted-foreground">
          Nobody has published one yet.{' '}
          <Link to="/build" className="font-medium text-foreground underline underline-offset-4">
            Build the first
          </Link>
        </p>
      ) : (
        <ul className="mt-6 grid gap-x-5 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
          {data?.community.map((card) => (
            <Tile key={card.id} card={card} />
          ))}
        </ul>
      )}
    </div>
  )
}
