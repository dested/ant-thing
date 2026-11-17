import { Link, NavLink, Outlet, ScrollRestoration } from 'react-router'

export function Layout() {
  return (
    <>
      <header className="flex h-12 items-center gap-6 border-b px-5">
        <Link to="/" className="font-display text-lg font-extrabold">
          Ant Movers
        </Link>
        <nav className="flex items-center gap-5 text-sm font-medium">
          {[
            { to: '/people', label: 'People' },
            { to: '/puzzles', label: 'Puzzles' },
            { to: '/build', label: 'Build' },
          ].map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                isActive
                  ? 'underline underline-offset-4'
                  : 'hover:underline hover:underline-offset-4'
              }>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <a
          href="https://github.com/dested/ant-thing"
          className="ml-auto text-sm font-medium hover:underline hover:underline-offset-4">
          Source
        </a>
      </header>
      <main>
        <Outlet />
      </main>
      <ScrollRestoration />
    </>
  )
}
