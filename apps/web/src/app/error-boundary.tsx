import { Link, isRouteErrorResponse, useRouteError } from 'react-router'
import { buttonVariants } from '~/components/ui/button'

// Root route ErrorBoundary. React Router renders this in place of the layout
// when a loader/render throws OR when no route matches (a 404). It carries its
// own slim header so the page still looks intentional. The matching HTTP status
// is set server-side from `routerContext.statusCode` (see entry-server.tsx).
export function RouteErrorBoundary() {
  const error = useRouteError()
  const isNotFound = isRouteErrorResponse(error) && error.status === 404

  const title = isNotFound ? 'Nothing here' : 'Something went wrong'
  const message = isNotFound
    ? 'There is no page at this address.'
    : isRouteErrorResponse(error)
      ? `${error.status} ${error.statusText}`
      : error instanceof Error
        ? error.message
        : 'An unexpected error occurred.'

  return (
    <>
      <header className="flex h-12 items-center border-b px-5">
        <Link to="/" className="font-display text-lg font-extrabold">
          Ant Movers
        </Link>
      </header>
      <main className="mx-auto flex max-w-3xl flex-col items-start gap-4 px-5 py-16">
        <h1 className="font-display text-5xl leading-none font-extrabold">{title}</h1>
        <p className="text-muted-foreground">{message}</p>
        {import.meta.env.DEV && error instanceof Error && error.stack && (
          <pre className="max-w-full overflow-auto rounded-md bg-muted p-4 text-xs text-muted-foreground">
            {error.stack}
          </pre>
        )}
        <Link to="/" className={buttonVariants()}>
          Back to the ants
        </Link>
      </main>
    </>
  )
}
