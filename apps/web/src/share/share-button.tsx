import { Share } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { Button } from '~/components/ui/button'
import { cnEvent } from '~/lib/crowsnest'
import { cn } from '~/lib/utils'
import { canSend, makeClip, save, send, type Shot } from './clip'

type State =
  | { step: 'idle' }
  | { step: 'making'; done: number }
  | { step: 'ready'; file: File }
  | { step: 'failed' }

const IDLE: State = { step: 'idle' }
// One clip at a time per place ("lab", "room"), kept outside React: a button that started one may
// be gone before it is done (a room's result card lasts eight seconds).
const jobs = new Map<string, State>()
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function set(place: string, state: State): void {
  jobs.set(place, state)
  for (const listener of listeners) listener()
}

async function go(place: string, shot: () => Shot | null): Promise<void> {
  const state = jobs.get(place) ?? IDLE
  if (state.step === 'making') return
  if (state.step === 'ready') {
    if (await send(state.file)) set(place, IDLE)
    return
  }
  const footage = shot()
  if (!footage) return
  set(place, { step: 'making', done: 0 })
  const file = await makeClip(footage, (done) => set(place, { step: 'making', done }))
  if (!file) return set(place, { step: 'failed' })
  cnEvent('clip', { place, delivered: footage.delivered })
  if (!canSend(file)) {
    save(file)
    return set(place, IDLE)
  }
  // The share sheet needs a tap that is still warm. If the encode outlived it, ask for another.
  set(place, (await send(file)) ? IDLE : { step: 'ready', file })
}

/**
 * Makes a clip of a run and hands it over: to the share sheet on a phone, to the downloads folder
 * anywhere else. `shot` is asked for the footage at the moment of the tap.
 */
export function ShareButton({
  place,
  shot,
  icon = false,
  className,
}: {
  /** Which clip this button is for; buttons for the same place show the same progress. */
  place: string
  shot: () => Shot | null
  /** Just the glyph, for a corner of the arena. */
  icon?: boolean
  className?: string
}) {
  const state = useSyncExternalStore(
    subscribe,
    () => jobs.get(place) ?? IDLE,
    () => IDLE
  )
  const percent = state.step === 'making' ? Math.round(state.done * 100) : 0
  const label =
    state.step === 'making'
      ? `Making the clip ${percent}%`
      : state.step === 'ready'
        ? 'Send the clip'
        : state.step === 'failed'
          ? 'This browser can’t make clips'
          : 'Share'
  const quiet = state.step !== 'ready' && 'border-input bg-transparent shadow-none'

  return (
    <Button
      size={icon ? 'icon' : 'sm'}
      variant={state.step === 'ready' ? 'default' : 'outline'}
      aria-label={icon ? label : undefined}
      disabled={state.step === 'making' || state.step === 'failed'}
      onClick={() => void go(place, shot)}
      className={cn('tabular', icon && 'size-8 shrink-0', quiet, className)}>
      {!icon ? (
        label
      ) : state.step === 'making' ? (
        <span className="text-[11px] font-medium">{percent}</span>
      ) : (
        <Share />
      )}
    </Button>
  )
}
