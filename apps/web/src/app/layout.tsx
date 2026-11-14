import { Link, NavLink, Outlet, ScrollRestoration } from 'react-router'
import { KickoffRibbon } from '~/components/kickoff-ribbon'

export function Layout() {
  return (
    <>
      <KickoffRibbon />
      <header className="border-b">
        <nav className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-4">
          <Link to="/" className="font-display font-semibold">
            Ant Thing
          </Link>
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              isActive
                ? 'text-sm text-foreground'
                : 'text-sm text-muted-foreground hover:text-foreground'
            }>
            Dashboard
          </NavLink>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">
        <Outlet />
      </main>
      <ScrollRestoration />
    </>
  )
}
