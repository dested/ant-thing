import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Button } from '~/components/ui/button'
import { useTRPC } from '~/lib/trpc'
import { cn } from '~/lib/utils'
import { ROOM_PUZZLE } from '@app/sim'
import { ANTS, GROUP_LABEL, median } from '~/people/record'
import { Room, WAITING, type RoomSnapshot, type Status } from '~/people/room'
import { clock } from '~/sim/clock'
import { ShareButton } from '~/share/share-button'
import { sound } from '~/sound/sound'
import { SoundButton } from '~/sound/sound-button'

declare global {
  interface Window {
    /** The room, for poking at from the console in dev. */
    __room?: Room
  }
}

const THROUGH = ['', 'Through the first slit', 'Through the second slit']

const never = (): (() => void) => () => {}
const waiting = (): RoomSnapshot => WAITING

/** What to say, and what the button does, when the room is gone. */
const GONE: Partial<Record<Status, { say: string; act: string }>> = {
  away: { say: 'You were away', act: 'Join again' },
  busy: { say: 'Every room is full', act: 'Try again' },
  lost: { say: 'The rooms can’t be reached', act: 'Try again' },
  stale: { say: 'This page is out of date', act: 'Reload' },
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b py-1.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="tabular text-sm font-medium">{value}</dd>
    </div>
  )
}

/** The typical time to deliver: the colony's, and each size of group's so far. */
function Record({ className }: { className?: string }) {
  const trpc = useTRPC()
  const stats = useQuery({ ...trpc.people.stats.queryOptions(), refetchInterval: 20_000 })
  return (
    <dl className={cn('border-t', className)}>
      <Row label="400 ants, typical" value={ANTS.typical === null ? '' : clock(ANTS.typical)} />
      {stats.data?.groups.map((group) => {
        const typical = median(group.times)
        return (
          <Row
            key={group.key}
            label={`${GROUP_LABEL[group.key]}, typical`}
            value={typical === null ? 'Nobody yet' : clock(typical)}
          />
        )
      })}
    </dl>
  )
}

/** A room: strangers on one load, no talking. The server runs the physics; this page is one pair of hands. */
export function PeoplePage() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [room, setRoom] = useState<Room | null>(null)
  const snap = useSyncExternalStore(room?.subscribe ?? never, room?.snapshot ?? waiting, waiting)

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const next = new Room()
    next.onCue = (cue) => {
      if (cue === 'grab' || cue === 'drop') {
        sound.tick(cue)
        // A tap in the hand on phones that have one (Android).
        if ('vibrate' in navigator) navigator.vibrate(8)
      } else sound.chime(cue)
    }
    const detach = next.attach(el)
    setRoom(next)
    if (import.meta.env.DEV) window.__room = next
    // The load dragging over the floor.
    const rub = setInterval(() => sound.scrape(next.speed, 0), 100)
    return () => {
      clearInterval(rub)
      sound.scrape(0, 0)
      detach()
      setRoom(null)
    }
  }, [])

  const gone = GONE[snap.status]
  const ending = snap.ending
  const together = `${Math.round(snap.together * 100)}%`
  const people = snap.people === 1 ? '1 person' : `${snap.people} people`
  const grab = (
    <Button
      size="lg"
      disabled={snap.status !== 'playing' || (!snap.holding && !snap.canGrab)}
      onClick={() => room?.toggle()}
      className="h-14 min-w-32 text-lg lg:h-10 lg:w-full lg:text-sm">
      {snap.holding ? 'Let go' : 'Grab'}
    </Button>
  )

  return (
    <section className="grid h-[calc(100dvh-3rem)] min-h-[26rem] lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="relative min-h-0 overflow-hidden bg-card">
        <canvas
          ref={canvas}
          className="absolute inset-0 size-full touch-none select-none"
          aria-label="The room, seen from above: people carrying the load toward the nest"
        />

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4 lg:hidden">
          <p
            className={cn(
              'tabular font-display text-5xl leading-none font-extrabold',
              !snap.started && 'text-foreground/30'
            )}>
            {clock(snap.time)}
          </p>
          <dl className="text-right text-sm font-medium">
            <dd className="tabular">{people}</dd>
            <dd className="tabular">{together} together</dd>
          </dl>
        </div>
        <div className="absolute right-4 bottom-4 lg:hidden">{grab}</div>
        <div className="absolute bottom-4 left-4 flex gap-2 lg:hidden">
          <SoundButton className="size-10 bg-popover" />
          {snap.filmed && room && (
            <ShareButton
              place="room"
              icon
              shot={() => room.shot()}
              className="size-10 bg-popover"
            />
          )}
        </div>
        {snap.through > 0 && !ending && (
          <p className="pointer-events-none absolute top-24 left-1/2 -translate-x-1/2 rounded-md border border-input bg-popover px-4 py-2 font-display text-lg font-bold whitespace-nowrap lg:top-4">
            {THROUGH[snap.through] ?? 'Through another wall'}
          </p>
        )}

        {snap.status === 'joining' && (
          <p className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            Finding a room
          </p>
        )}
        {gone && (
          <div className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3 rounded-md border border-input bg-popover p-5">
            <p className="font-display text-2xl font-bold whitespace-nowrap">{gone.say}</p>
            <Button onClick={() => (snap.status === 'stale' ? location.reload() : room?.join())}>
              {gone.act}
            </Button>
          </div>
        )}
        {ending && !gone && (
          <div className="absolute top-1/2 left-1/2 w-72 -translate-x-1/2 -translate-y-1/2 rounded-md border border-input bg-popover p-5">
            <p className="font-display text-4xl leading-none font-extrabold">
              {ending.delivered ? 'Delivered in ' : 'Called off at '}
              <span className="tabular">{clock(ending.seconds)}</span>
            </p>
            <dl className="mt-4 border-t">
              <Row label="People" value={Math.max(1, Math.round(ending.people))} />
              <Row label="Next" value={ending.then} />
              <Row label="Starts in" value={clock(snap.nextIn)} />
            </dl>
            {snap.puzzle === ROOM_PUZZLE && <Record className="mt-4" />}
            {snap.filmed && room && (
              <ShareButton place="room" shot={() => room.shot()} className="mt-4 h-9 w-full" />
            )}
          </div>
        )}
      </div>

      <aside className="hidden flex-col gap-4 overflow-y-auto border-l p-5 lg:flex">
        <div>
          <div className="flex items-start justify-between gap-3">
            <h1 className="font-display text-2xl leading-tight font-bold">
              {snap.title || 'People'}
            </h1>
            <div className="flex gap-2">
              {snap.filmed && room && <ShareButton place="room" icon shot={() => room.shot()} />}
              <SoundButton />
            </div>
          </div>
          <p
            className={cn(
              'tabular mt-1 font-display text-5xl leading-none font-extrabold',
              !snap.started && 'text-foreground/30'
            )}>
            {clock(snap.time)}
          </p>
        </div>
        <dl className="border-t">
          <Row label="Round" value={snap.round || ''} />
          <Row label="In the room" value={snap.people || ''} />
          <Row label="Pulling together" value={together} />
        </dl>
        {snap.puzzle === ROOM_PUZZLE && <Record />}
        <div className="mt-auto">{grab}</div>
      </aside>
    </section>
  )
}
