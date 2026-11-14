import { PRESETS } from '@app/sim'
import { Link } from 'react-router'
import { PuzzleThumb } from '~/sim/thumb'

export function PuzzlesPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <h1 className="font-display text-4xl font-extrabold">Puzzles</h1>
      <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {PRESETS.map(p => (
          <li key={p.id}>
            <Link to={p.id === 'piano-movers' ? '/' : `/p/${p.id}`} className="group block">
              <PuzzleThumb puzzle={p.puzzle} className="w-full rounded-sm" />
              <span className="font-display mt-2 block text-xl font-bold group-hover:underline">{p.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
