import type { QueryClient } from '@tanstack/react-query'
import type { TRPCOptionsProxy } from '@trpc/tanstack-react-query'
import { createContext, RouterContextProvider } from 'react-router'
import { getBrowserClients } from '~/lib/trpc'
import type { AppRouter } from '../../server/router'

// Typed React Router context that every loader reads with `context.get(...)`,
// the same on both sides. SSR: entry-server.tsx fills a provider per request
// (tRPC calls the router directly).
// Browser: createBrowserRouter's getContext calls browserContext() once per
// navigation or fetcher call.

export type LoaderClients = {
  queryClient: QueryClient
  trpc: TRPCOptionsProxy<AppRouter>
}

/** queryClient + tRPC options proxy, for `queryClient.prefetchQuery(trpc.x.queryOptions())`. */
export const clientsContext = createContext<LoaderClients>()

export function browserContext(): RouterContextProvider {
  const { queryClient, trpc } = getBrowserClients()
  const context = new RouterContextProvider()
  context.set(clientsContext, { queryClient, trpc })
  return context
}

// Signed out is a 200 with no data. An error (a 429, a 5xx, the network) says
// nothing about the session, so it never reads as signed out: that bounced
// people to /sign-in mid-click (handback, 2026-11-03). One retry, then the
// route error boundary.
