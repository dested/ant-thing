import type { RouteObject } from 'react-router'
import { RouteErrorBoundary } from './error-boundary'
import { HomePage } from './home'
import { Layout } from './layout'
import { PuzzlePage, puzzleLoader } from './puzzle'
import { PuzzlesPage } from './puzzles'

// Loaders read the typed context in ~/lib/router-context.ts, which
// entry-server.tsx (SSR) and index.tsx (browser) fill, so no loader branches
// on where it runs.

export const routes: RouteObject[] = [
  {
    id: 'root',
    path: '/',
    Component: Layout,
    ErrorBoundary: RouteErrorBoundary,
    children: [
      { index: true, Component: HomePage },
      { path: 'puzzles', Component: PuzzlesPage },
      { path: 'p/:id', Component: PuzzlePage, loader: puzzleLoader },
    ],
  },
]
