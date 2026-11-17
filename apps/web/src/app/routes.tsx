import { data, type LoaderFunctionArgs, type RouteObject } from 'react-router'
import { clientsContext } from '~/lib/router-context'
import type { Draft } from '~/editor/draft'
import { AdminPage } from './admin'
import { BuildPage } from './build'
import { RouteErrorBoundary } from './error-boundary'
import { HomePage } from './home'
import { Layout } from './layout'
import { PeoplePage } from './people'
import { PuzzlePage } from './puzzle'
import { PuzzlesPage } from './puzzles'

// Loaders read the typed context in ~/lib/router-context.ts, which
// entry-server.tsx (SSR) and index.tsx (browser) fill, so no loader branches
// on where it runs.

// The home puzzle runs from code; its numbers are a nice-to-have, so a failed prefetch is ignored.
async function homeLoader({ context }: LoaderFunctionArgs): Promise<null> {
  const { queryClient, trpc } = context.get(clientsContext)
  await Promise.all([
    queryClient.prefetchQuery(trpc.puzzles.get.queryOptions({ id: 'piano-movers' })),
    queryClient.prefetchQuery(trpc.people.stats.queryOptions()),
  ])
  return null
}

// The room's record is a nice-to-have too: the page is the socket.
async function peopleLoader({ context }: LoaderFunctionArgs): Promise<null> {
  const { queryClient, trpc } = context.get(clientsContext)
  await queryClient.prefetchQuery(trpc.people.stats.queryOptions())
  return null
}

async function puzzlesLoader({ context }: LoaderFunctionArgs): Promise<null> {
  const { queryClient, trpc } = context.get(clientsContext)
  await queryClient.prefetchQuery(trpc.puzzles.list.queryOptions({ sort: 'played', page: 0 }))
  return null
}

async function puzzleLoader({ context, params }: LoaderFunctionArgs): Promise<{ id: string }> {
  const { queryClient, trpc } = context.get(clientsContext)
  const id = params.id ?? ''
  const found = await queryClient.fetchQuery(trpc.puzzles.get.queryOptions({ id }))
  if (!found) throw data('No puzzle here', { status: 404 })
  return { id }
}

// /build?from=<id> opens the editor on a copy of that puzzle. Without it the editor uses its own draft.
async function buildLoader({
  context,
  request,
}: LoaderFunctionArgs): Promise<{ from: Draft | null }> {
  const id = new URL(request.url).searchParams.get('from')
  if (!id) return { from: null }
  const { queryClient, trpc } = context.get(clientsContext)
  const found = await queryClient.fetchQuery(trpc.puzzles.get.queryOptions({ id }))
  return { from: found ? { title: '', puzzle: found.puzzle } : null }
}

export const routes: RouteObject[] = [
  {
    id: 'root',
    path: '/',
    Component: Layout,
    ErrorBoundary: RouteErrorBoundary,
    children: [
      { index: true, Component: HomePage, loader: homeLoader },
      { path: 'people', Component: PeoplePage, loader: peopleLoader },
      { path: 'puzzles', Component: PuzzlesPage, loader: puzzlesLoader },
      { path: 'p/:id', Component: PuzzlePage, loader: puzzleLoader },
      { path: 'build', Component: BuildPage, loader: buildLoader },
      { path: 'admin', Component: AdminPage },
    ],
  },
]
