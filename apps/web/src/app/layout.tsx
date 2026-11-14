import { Link, Outlet, ScrollRestoration } from 'react-router'

export function Layout() {
  return (
    <>
      <header className="flex h-12 items-center gap-6 border-b px-5">
        <Link to="/" className="font-display text-lg font-extrabold">
          Ant Movers
        </Link>
      </header>
      <main>
        <Outlet />
      </main>
      <ScrollRestoration />
    </>
  )
}
