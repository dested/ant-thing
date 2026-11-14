import { initTRPC } from '@trpc/server'
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express'
import type { IncomingHttpHeaders } from 'node:http'
import superjson from 'superjson'
import { whoIs } from './who'

// No accounts in this project (init --no-auth). A caller is known only by `who`: a salted hash of
// the IP, used for rate limits and so one visitor reports a puzzle once.
export interface Context {
  who: string
}

/** The context for every caller (HTTP here, the SSR proxy in entry-server). */
export function contextFor(ip: string): Context {
  return { who: whoIs(ip) }
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

/** The context for a request: any adapter (Express here, a WebSocket upgrade) ends up here. */
export function createContext({ req }: CreateExpressContextOptions): Context {
  return contextFor(req.ip ?? '')
}

// superjson on the wire: procedures return real Dates/Maps/BigInts and the
// client gets them back as such. Every client link must use it too.
const t = initTRPC.context<Context>().create({ transformer: superjson })

export const router = t.router
export const publicProcedure = t.procedure
