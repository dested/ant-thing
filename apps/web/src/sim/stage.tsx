import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { Puzzle } from '@app/sim'
import { IDLE, Session, type Finish, type Snapshot } from './session'

declare global {
  interface Window {
    /** The lab's session, for poking at from the console in dev. */
    __session?: Session
  }
}

const never = (): (() => void) => () => {}
const idle = (): Snapshot => IDLE

/** The session's readouts, a few times a second. IDLE on the server and before the canvas mounts. */
export function useSnapshot(session: Session | null): Snapshot {
  return useSyncExternalStore(session?.subscribe ?? never, session?.snapshot ?? idle, idle)
}

/**
 * The arena: one canvas that fills its box, and the session that drives it. The session only
 * exists in the browser, so the parent gets it through `onSession` once the canvas is up.
 */
export function Stage({
  puzzle,
  seed,
  onSession,
  onFinish,
  className,
}: {
  puzzle: Puzzle
  seed?: number
  onSession: (session: Session | null) => void
  onFinish?: (finish: Finish) => void
  className?: string
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const next = new Session(puzzle, seed)
    const detach = next.attach(el)
    setSession(next)
    onSession(next)
    if (import.meta.env.DEV) window.__session = next
    return () => {
      detach()
      setSession(null)
      onSession(null)
    }
  }, [puzzle, seed, onSession])

  useEffect(() => {
    if (session) session.onFinish = onFinish ?? null
  }, [session, onFinish])

  return (
    <canvas
      ref={canvas}
      className={className}
      aria-label="The arena, seen from above: ants carrying the load toward the nest"
    />
  )
}
