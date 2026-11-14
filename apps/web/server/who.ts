import { createHash, timingSafeEqual } from 'node:crypto'
import { env } from './env'

// Salted with a secret that is stable across deploys, so a caller keeps the same id.
const salt = createHash('sha256').update(env.DATABASE_URL).digest('hex')

/** A stable, anonymous id for a caller: a salted hash of the IP. The IP itself is never stored. */
export function whoIs(ip: string): string {
  return createHash('sha256').update(`${salt}:${ip}`).digest('base64url').slice(0, 22)
}

/** Constant-time string equality (for the admin token). */
export function sameSecret(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return timingSafeEqual(ha, hb)
}
