import { Maximize, Minus, Pause, Play, Plus } from 'lucide-react'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { LIMITS, type Puzzle } from '@app/sim'
import { Button } from '~/components/ui/button'
import { Chip, Segmented } from '~/components/ui/segmented'
import { Slider } from '~/components/ui/slider'
import { Switch } from '~/components/ui/switch'
import { cn } from '~/lib/utils'
import { RaceBoard } from '~/race/board'
import { coreCount, Race, raceSize, type RaceStats } from '~/race/race'
import { clock } from './clock'
import type { ViewOptions } from './renderer'
import { RATES, WARM_SECONDS, type Finish, type Mode, type Session, type Snapshot } from './session'
import { Stage, useSnapshot } from './stage'

const MODES: readonly { value: Mode; label: string }[] = [
  { value: 'watch', label: 'Watch' },
  { value: 'ant', label: 'Be an ant' },
  { value: 'hands', label: 'Move it yourself' },
]

const VIEWS: readonly { key: keyof ViewOptions; label: string }[] = [
  { key: 'roles', label: 'Roles' },
  { key: 'scent', label: 'Scent' },
  { key: 'trace', label: 'Path' },
  { key: 'pulls', label: 'Pulls' },
  { key: 'forces', label: 'Forces' },
  { key: 'traffic', label: 'Traffic' },
]

const SPEEDS = RATES.map((rate) => ({ value: rate, label: rate === 0 ? 'Max' : `${rate}×` }))

/** Sim seconds a racing colony gets before it is called off. */
const RACE_CAP = 1800

/** What every visitor's runs of a puzzle add up to. */
export interface Tally {
  antRuns: number
  antMedian: number | null
  antBest: number | null
  handRuns: number
  handBest: number | null
}

/** A puzzle, running: the arena on the left, its instruments on the right. */
export function Lab({
  puzzle,
  title,
  seed,
  tally,
  onFinish,
  children,
}: {
  puzzle: Puzzle
  title: string
  seed?: number
  tally?: Tally
  onFinish?: (finish: Finish) => void
  children?: React.ReactNode
}) {
  const [session, setSession] = useState<Session | null>(null)
  const [race, setRace] = useState<Race | null>(null)
  const snap = useSnapshot(session)
  const cores = coreCount()

  // A race is this puzzle, these rules, many seeds at once, one colony per core.
  const startRace = (): void => {
    if (!session) return
    race?.stop()
    session.setRunning(false)
    const { puzzle: now, rules } = session.setup()
    const next = new Race(
      now,
      rules,
      raceSize(cores),
      WARM_SECONDS,
      RACE_CAP,
      1 + Math.floor(Math.random() * 1e9)
    )
    next.start()
    setRace(next)
  }
  const endRace = useCallback(
    (seed?: number): void => {
      race?.stop()
      setRace(null)
      if (seed === undefined) session?.setRunning(true)
      else session?.restart(seed)
    },
    [race, session]
  )
  useEffect(() => () => race?.stop(), [race])

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
            race && 'invisible',
            snap.mode === 'ant' ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'
          )}
        />
        {race ? (
          <RaceBoard race={race} onPick={endRace} className="absolute inset-0 size-full" />
        ) : (
          session && <Overlay session={session} snap={snap} />
        )}
      </div>
      {race ? (
        <RacePanel race={race} title={title} onAgain={startRace} onBack={() => endRace()} />
      ) : (
        <Panel
          session={session}
          snap={snap}
          title={title}
          tally={tally}
          raceLabel={`Race ${raceSize(cores)} colonies`}
          onRace={startRace}>
          {children}
        </Panel>
      )}
    </section>
  )
}

/** Delivery times as a dot per colony, stacked where they fall together. */
function Times({ times }: { times: readonly number[] }) {
  const WIDTH = 280
  const DOT = 7
  const longest = times[times.length - 1] ?? 0
  const span = Math.max(300, Math.ceil(longest / 300) * 300)
  const stacks = new Map<number, number>()
  const dots = times.map((time) => {
    const bin = Math.min(Math.floor(WIDTH / DOT) - 1, Math.floor((time / span) * (WIDTH / DOT)))
    const level = stacks.get(bin) ?? 0
    stacks.set(bin, level + 1)
    return { time, x: bin * DOT + DOT / 2, level }
  })
  const rows = Math.max(3, ...stacks.values())
  const base = rows * DOT + 2
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${base + 16}`}
      role="img"
      aria-label={`Delivery times of ${times.length} colonies`}
      className="w-full">
      <line x1={0} x2={WIDTH} y1={base} y2={base} className="stroke-border" />
      {dots.map((dot, n) => (
        <circle
          key={n}
          cx={dot.x}
          cy={base - dot.level * DOT - DOT / 2}
          r={DOT / 2 - 0.75}
          className="fill-load stroke-background">
          <title>{clock(dot.time)}</title>
        </circle>
      ))}
      <text x={0} y={base + 12} className="fill-muted-foreground text-[10px]">
        0:00
      </text>
      <text x={WIDTH} y={base + 12} textAnchor="end" className="fill-muted-foreground text-[10px]">
        {clock(span)}
      </text>
    </svg>
  )
}

function RacePanel({
  race,
  title,
  onAgain,
  onBack,
}: {
  race: Race
  title: string
  onAgain: () => void
  onBack: () => void
}) {
  const stats: RaceStats = useSyncExternalStore(race.subscribe, race.snapshot, race.snapshot)
  const out = stats.done - stats.delivered
  return (
    <aside className="flex flex-col gap-5 border-t p-5 lg:overflow-y-auto lg:border-t-0 lg:border-l">
      <div>
        <h1 className="font-display text-2xl leading-tight font-bold">{title}</h1>
        <p className="tabular mt-1 font-display text-6xl leading-none font-extrabold">
          {stats.delivered}
          <span className="text-foreground/30">/{stats.total}</span>
        </p>
      </div>

      <dl className="border-y">
        <Row label="Delivered" value={`${stats.delivered} of ${stats.total}`} />
        {out > 0 && <Row label={`Called off at ${clock(RACE_CAP)}`} value={out} />}
        <Row label="Typical" value={stats.median === null ? '' : clock(stats.median)} />
        <Row label="Fastest" value={stats.best === null ? '' : clock(stats.best)} />
        <Row label="Speed" value={`${Math.round(stats.pace).toLocaleString('en-US')}×`} />
        <Row label="Cores" value={stats.cores} />
      </dl>

      {stats.times.length > 0 && <Times times={stats.times} />}

      <div className="mt-auto flex gap-2">
        <Button
          variant="outline"
          onClick={onAgain}
          className="flex-1 border-input bg-transparent shadow-none">
          Race again
        </Button>
        <Button
          variant="outline"
          onClick={onBack}
          className="flex-1 border-input bg-transparent shadow-none">
          One colony
        </Button>
      </div>
    </aside>
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
        onValueChange={(next) => onChange(next)}
      />
    </div>
  )
}

function Panel({
  session,
  snap,
  title,
  tally,
  raceLabel,
  onRace,
  children,
}: {
  session: Session | null
  snap: Snapshot
  title: string
  tally?: Tally
  raceLabel: string
  onRace: () => void
  children?: React.ReactNode
}) {
  const live = session !== null
  return (
    <aside className="flex flex-col gap-5 border-t p-5 lg:overflow-y-auto lg:border-t-0 lg:border-l">
      <div>
        <h1 className="font-display text-2xl leading-tight font-bold">{title}</h1>
        <p
          className={cn(
            'tabular mt-1 font-display text-6xl leading-none font-extrabold',
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
          onChange={(rate) => session?.setRate(rate)}
          className="flex-1"
        />
      </div>

      <Segmented
        label="Who moves the load"
        value={snap.mode}
        options={MODES}
        onChange={(mode) => session?.setMode(mode)}
        className="w-full"
      />

      <dl className="border-y">
        <Row label="Carrying" value={snap.carriers} />
        <Row label="Pulling" value={snap.pullers} />
        <Row label="Lifting" value={snap.lifters} dot="bg-lifter" />
        <Row label="Know the way" value={snap.informed} dot="bg-marker" />
        <Row label="Colony" value={snap.seed || ''} />
        <Row label="Speed" value={snap.running ? `${Math.round(snap.pace)}×` : 'Paused'} />
      </dl>

      <div className="grid grid-cols-3 gap-2">
        {VIEWS.map((view) => (
          <Chip
            key={view.key}
            pressed={snap.view[view.key]}
            onChange={(on) => session?.setView(view.key, on)}>
            {view.label}
          </Chip>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <Knob
          label="Ants"
          value={snap.ants}
          shown={String(snap.ants)}
          min={LIMITS.minAnts}
          max={LIMITS.maxAnts}
          step={10}
          onChange={(count) => session?.setAnts(count)}
        />
        <Knob
          label="Conformity"
          value={snap.conformity}
          shown={snap.conformity.toFixed(2)}
          min={0}
          max={5}
          step={0.05}
          onChange={(value) => session?.setRule('conformity', value)}
        />
        <Knob
          label="Newcomer leads for"
          value={snap.informedTime}
          shown={`${snap.informedTime.toFixed(0)} s`}
          min={0}
          max={40}
          step={1}
          onChange={(value) => session?.setRule('informedTime', value)}
        />
        <label className="flex items-center justify-between gap-4 text-sm">
          Scent trails
          <Switch
            checked={snap.scentRule}
            onCheckedChange={(on) => session?.setRule('scent', on)}
          />
        </label>
      </div>

      {tally && tally.antRuns + tally.handRuns > 0 && (
        <dl className="border-y">
          <Row label="Colonies delivered" value={tally.antRuns.toLocaleString('en-US')} />
          {tally.antMedian !== null && (
            <Row label="Typical colony" value={clock(tally.antMedian)} />
          )}
          {tally.antBest !== null && <Row label="Fastest colony" value={clock(tally.antBest)} />}
          {tally.handBest !== null && <Row label="Fastest by hand" value={clock(tally.handBest)} />}
        </dl>
      )}

      <Button
        variant="outline"
        disabled={!live}
        onClick={onRace}
        className="mt-auto border-input bg-transparent shadow-none">
        {raceLabel}
      </Button>
      <div className="flex gap-2">
        <Button
          variant="outline"
          disabled={!live}
          onClick={() => session?.restart()}
          className="flex-1 border-input bg-transparent shadow-none">
          New colony
        </Button>
        {snap.changed && (
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
