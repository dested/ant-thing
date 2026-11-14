import type { LoaderFunctionArgs, RouteObject } from 'react-router'
import { clientsContext } from '~/lib/router-context'
import { DashboardPage } from './dashboard'
import { RouteErrorBoundary } from './error-boundary'
import { HomePage } from './home'
import { Layout } from './layout'

// Loaders read the typed context in ~/lib/router-context.ts, which
// entry-server.tsx (SSR) and index.tsx (browser) fill, so no loader branches
// on where it runs.

async function dashboardLoader({ context }: LoaderFunctionArgs): Promise<null> {
  // Warm the page's queries so the dashboard renders with data.
  const { queryClient, trpc } = context.get(clientsContext)
  await queryClient.prefetchQuery(trpc.posts.list.queryOptions()) // demo
  return null
}

export const routes: RouteObject[] = [
  {
    id: 'root',
    path: '/',
    Component: Layout,
    ErrorBoundary: RouteErrorBoundary,
    children: [
      { index: true, Component: HomePage },
      { path: 'dashboard', Component: DashboardPage, loader: dashboardLoader },
    ],
  },
]
