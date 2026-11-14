import { initTRPC } from '@trpc/server'
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express'
import type { IncomingHttpHeaders } from 'node:http'
import superjson from 'superjson'

// No accounts in this project (init --no-auth): procedures get an empty context.
export type Context = Record<string, never>

/** The context for every caller (HTTP here, the SSR proxy in entry-server). */
export function contextFor(): Context {
  return {}
}

/** Node's header object as a Fetch `Headers`. */
export function toHeaders(raw: IncomingHttpHeaders): Headers {
  const headers = new Headers()
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v)
    } else {
      headers.set(key, value)
    }
  }
  return headers
}

/** The context for a request's headers: any adapter (Express here, a WebSocket upgrade) ends up here. */
export async function contextFromHeaders(_headers: Headers): Promise<Context> {
  return contextFor()
}

export function createContext({ req }: CreateExpressContextOptions): Promise<Context> {
  return contextFromHeaders(toHeaders(req.headers))
}

// superjson on the wire: procedures return real Dates/Maps/BigInts and the
// client gets them back as such. Every client link must use it too.
const t = initTRPC.context<Context>().create({ transformer: superjson })

export const router = t.router
export const publicProcedure = t.procedure
