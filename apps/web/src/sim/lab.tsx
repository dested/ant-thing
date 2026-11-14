import { Maximize, Minus, Pause, Play, Plus } from 'lucide-react'
import { useState } from 'react'
import { LIMITS, type Puzzle } from '@app/sim'
import { Button } from '~/components/ui/button'
import { Chip, Segmented } from '~/components/ui/segmented'
import { Slider } from '~/components/ui/slider'
import { Switch } from '~/components/ui/switch'
import { cn } from '~/lib/utils'
import { RATES, type Finish, type Mode, type Session, type Snapshot } from './session'
import { Stage, useSnapshot } from './stage'

const MODES: readonly { value: Mode; label: string }[] = [
  { value: 'watch', label: 'Watch' },
  { value: 'ant', label: 'Be an ant' },
  { value: 'hands', label: 'Move it yourself' },
]

const SPEEDS = RATES.map(rate => ({ value: rate, label: `${rate}×` }))

export function clock(seconds: number): string {
  const s = Math.floor(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** A puzzle, running: the arena on the left, its instruments on the right. */
export function Lab({
  puzzle,
  title,
  seed,
  onFinish,
  children,
}: {
  puzzle: Puzzle
  title: string
  seed?: number
  onFinish?: (finish: Finish) => void
  children?: React.ReactNode
}) {
  const [session, setSession] = useState<Session | null>(null)
  const snap = useSnapshot(session)

  return (
    <section className="grid lg:h-[calc(100svh-3rem)] lg:min-h-[34rem] lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="relative aspect-[3/2] min-h-0 overflow-hidden lg:aspect-auto">
        <Stage
          puzzle={puzzle}
          seed={seed}
          onSession={setSession}
          onFinish={onFinish}
          className={cn(
            'absolute inset-0 size-full',
            snap.mode === 'ant' ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'
          )}
        />
        {session && <Overlay session={session} snap={snap} />}
      </div>
      <Panel session={session} snap={snap} title={title}>
        {children}
      </Panel>
    </section>
  )
}

function Overlay({ session, snap }: { session: Session; snap: Snapshot }) {
  return (
    <>
      <div className="absolute bottom-3 left-3 flex flex-col overflow-hidden rounded-md border border-input bg-popover">
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => session.zoomBy(1.5)}
          className="flex size-8 cursor-pointer items-center justify-center hover:bg-accent">
          <Plus className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => session.zoomBy(1 / 1.5)}
          className="flex size-8 cursor-pointer items-center justify-center border-t border-input hover:bg-accent">
          <Minus className="size-4" />
        </button>
        {snap.zoomed && snap.mode !== 'ant' && (
          <button
            type="button"
            aria-label="Show the whole arena"
            onClick={() => session.fit()}
            className="flex size-8 cursor-pointer items-center justify-center border-t border-input hover:bg-accent">
            <Maximize className="size-4" />
          </button>
        )}
      </div>
      {snap.mode === 'ant' && !snap.delivered && (
        <Button
          size="lg"
          variant={snap.biting ? 'outline' : 'default'}
          onClick={() => session.toggleBite()}
          className="absolute bottom-4 left-1/2 min-w-28 -translate-x-1/2">
          {snap.biting ? 'Let go' : 'Bite'}
        </Button>
      )}
      {snap.delivered && (
        <div className="absolute top-4 left-1/2 flex -translate-x-1/2 items-center gap-4 rounded-md border border-input bg-popover py-2 pr-2 pl-4">
          <p className="font-display text-lg font-bold whitespace-nowrap">
            Delivered in <span className="tabular">{clock(snap.deliveredAt)}</span>
          </p>
          <Button size="sm" onClick={() => session.restart()}>
            New colony
          </Button>
        </div>
      )}
    </>
  )
}

function Row({ label, value, dot }: { label: string; value: string | number; dot?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-1.5 last:border-b-0">
      <dt className="flex items-center gap-2 text-sm text-muted-foreground">
        {dot && <span className={cn('size-2 rounded-full', dot)} />}
        {label}
      </dt>
      <dd className="tabular text-sm font-medium">{value}</dd>
    </div>
  )
}

function Knob({
  label,
  value,
  shown,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  shown: string
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm">{label}</span>
        <span className="tabular text-sm font-medium">{shown}</span>
      </div>
      <Slider
        aria-label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        onValueChange={next => onChange(next)}
      />
    </div>
  )
}

function Panel({
  session,
  snap,
  title,
  children,
}: {
  session: Session | null
  snap: Snapshot
  title: string
  children?: React.ReactNode
}) {
  const live = session !== null
  return (
    <aside className="flex flex-col gap-5 border-t p-5 lg:overflow-y-auto lg:border-t-0 lg:border-l">
      <div>
        <h1 className="font-display text-2xl leading-tight font-bold">{title}</h1>
        <p
          className={cn(
            'tabular font-display mt-1 text-6xl leading-none font-extrabold',
            snap.warming && 'text-foreground/30'
          )}>
          {clock(snap.time)}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="icon"
          variant="outline"
          disabled={!live}
          aria-label={snap.running ? 'Pause' : 'Play'}
          onClick={() => session?.setRunning(!snap.running)}
          className="size-8 shrink-0 border-input bg-transparent shadow-none">
          {snap.running ? <Pause /> : <Play />}
        </Button>
        <Segmented
          label="Speed"
          value={snap.rate}
          options={SPEEDS}
          onChange={rate => session?.setRate(rate)}
          className="flex-1"
        />
      </div>

      <Segmented
        label="Who moves the load"
        value={snap.mode}
        options={MODES}
        onChange={mode => session?.setMode(mode)}
        className="w-full"
      />

      <dl className="border-y">
        <Row label="Carrying" value={snap.carriers} />
        <Row label="Pulling" value={snap.pullers} />
        <Row label="Lifting" value={snap.lifters} dot="bg-lifter" />
        <Row label="Know the way" value={snap.informed} dot="bg-marker" />
        <Row label="Colony" value={snap.seed || ''} />
      </dl>

      <div className="flex gap-2">
        <Chip pressed={snap.roles} onChange={on => session?.setView('roles', on)}>
          Roles
        </Chip>
        <Chip pressed={snap.scent} onChange={on => session?.setView('scent', on)}>
          Scent
        </Chip>
        <Chip pressed={snap.trace} onChange={on => session?.setView('trace', on)}>
          Path
        </Chip>
      </div>

      <div className="flex flex-col gap-3">
        <Knob
          label="Ants"
          value={snap.ants}
          shown={String(snap.ants)}
          min={LIMITS.minAnts}
          max={LIMITS.maxAnts}
          step={10}
          onChange={count => session?.setAnts(count)}
        />
        <Knob
          label="Conformity"
          value={snap.conformity}
          shown={snap.conformity.toFixed(2)}
          min={0}
          max={5}
          step={0.05}
          onChange={value => session?.setRule('conformity', value)}
        />
        <Knob
          label="Newcomer leads for"
          value={snap.informedTime}
          shown={`${snap.informedTime.toFixed(0)} s`}
          min={0}
          max={40}
          step={1}
          onChange={value => session?.setRule('informedTime', value)}
        />
        <label className="flex items-center justify-between gap-4 text-sm">
          Scent trails
          <Switch checked={snap.scentRule} onCheckedChange={on => session?.setRule('scent', on)} />
        </label>
      </div>

      <div className="mt-auto flex gap-2">
        <Button
          variant="outline"
          disabled={!live}
          onClick={() => session?.restart()}
          className="flex-1 border-input bg-transparent shadow-none">
          New colony
        </Button>
        {!snap.standard && (
          <Button
            variant="outline"
            onClick={() => session?.resetRules()}
            className="flex-1 border-input bg-transparent shadow-none">
            Reset rules
          </Button>
        )}
      </div>
      {children}
    </aside>
  )
}
