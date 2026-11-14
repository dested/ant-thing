import { Link } from 'react-router'
import { buttonVariants } from '~/components/ui/button'

// Placeholder: the kickoff (.claude/skills/kickoff) replaces this page with the
// product's real `/` (marketing page, the app itself, a redirect, the game).
export function HomePage() {
  return (
    <section className="flex min-h-[50vh] flex-col items-start justify-center gap-6">
      <h1 className="font-display text-5xl font-bold tracking-tight">Ant Thing</h1>
      <Link to="/dashboard" className={buttonVariants({ size: 'lg' })}>
        Open dashboard
      </Link>
    </section>
  )
}
