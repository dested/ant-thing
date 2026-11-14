import { Link, NavLink, Outlet, ScrollRestoration } from 'react-router'

export function Layout() {
  return (
    <>
      <header className="flex h-12 items-center gap-6 border-b px-5">
        <Link to="/" className="font-display text-lg font-extrabold">
          Ant Movers
        </Link>
        <nav className="flex items-center gap-5 text-sm font-medium">
          <NavLink
            to="/puzzles"
            className={({ isActive }) => (isActive ? 'underline underline-offset-4' : 'hover:underline hover:underline-offset-4')}>
            Puzzles
          </NavLink>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
      <ScrollRestoration />
    </>
  )
}
