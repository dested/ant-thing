import type { Puzzle } from '@app/sim'
import { useEffect, useRef, useState } from 'react'
import { Button } from '~/components/ui/button'
import { coreCount, type Rules } from '~/race/race'
import { runTrials, type Trial } from '~/race/trials'
import { clock } from '~/sim/clock'
import { WARM_SECONDS } from '~/sim/session'

export interface Point {
  value: number
  runs: number
  delivered: number
  /** Delivery times in seconds, sorted. */
  times: number[]
}

interface Live {
  runs: number
  delivered: number
}

const W = 640
const H = 250
const LEFT = 40
const TOP = 22
const BOTTOM = 46
const PLOT = H - TOP - BOTTOM

const share = (delivered: number, runs: number): number => (runs > 0 ? delivered / runs : 0)
const percent = (fraction: number): string => `${Math.round(fraction * 100)}%`

function median(sorted: readonly number[]): number | null {
  const mid = sorted[sorted.length >> 1]
  return mid === undefined ? null : mid
}

/**
 * How often colonies deliver as one rule changes. The grey bars were run for the page (the red one
 * is the setting the page uses); the visitor can run the same experiment on their own cores and
 * see it land on top as dots.
 */
export function SweepChart({
  title,
  axis,
  points,
  cap,
  standard,
  format,
  setup,
}: {
  title: string
  axis: string
  points: readonly Point[]
  cap: number
  /** The value the page itself runs with. */
  standard: number
  format: (value: number) => string
  /** The puzzle and rules for one value of the knob. */
  setup: (value: number) => { puzzle: Puzzle; rules: Rules }
}) {
  const [live, setLive] = useState<Live[] | null>(null)
  const [running, setRunning] = useState(false)
  const [hover, setHover] = useState(-1)
  const stop = useRef<(() => void) | null>(null)
  useEffect(() => () => stop.current?.(), [])

  const band = (W - LEFT) / Math.max(1, points.length)
  const thick = Math.min(24, band * 0.5)
  const y = (fraction: number): number => TOP + PLOT * (1 - fraction)
  const total = live?.reduce((sum, bar) => sum + bar.runs, 0) ?? 0
  const each = coreCount() >= 6 ? 24 : 12

  const run = (): void => {
    stop.current?.()
    const first = 1 + Math.floor(Math.random() * 900_000)
    const trials: Trial[] = []
    // Dealt round-robin, so every bar fills at the same pace.
    for (let n = 0; n < each; n++) {
      points.forEach((point, group) =>
        trials.push({ group, seed: first + n, ...setup(point.value) })
      )
    }
    const tally: Live[] = points.map(() => ({ runs: 0, delivered: 0 }))
    setLive(tally)
    setRunning(true)
    let done = 0
    stop.current = runTrials(trials, WARM_SECONDS, cap, (result) => {
      const bar = tally[result.group]
      if (!bar) return
      bar.runs++
      if (result.delivered) bar.delivered++
      done++
      setLive(tally.map((b) => ({ ...b })))
      if (done === trials.length) setRunning(false)
    })
  }
  const halt = (): void => {
    stop.current?.()
    stop.current = null
    setRunning(false)
  }

  const shown = points[hover]
  const shownLive = live?.[hover]

  return (
    <figure className="flex flex-col gap-3">
      <h3 className="font-display text-xl leading-tight font-bold">{title}</h3>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} className="w-full">
          {[0, 0.5, 1].map((tick) => (
            <g key={tick}>
              <line x1={LEFT} x2={W} y1={y(tick)} y2={y(tick)} className="stroke-border" />
              <text
                x={LEFT - 8}
                y={y(tick) + 4}
                textAnchor="end"
                className="tabular fill-muted-foreground text-[12px]">
                {percent(tick)}
              </text>
            </g>
          ))}
          {points.map((point, n) => {
            const cx = LEFT + band * (n + 0.5)
            const top = y(share(point.delivered, point.runs))
            const tall = y(0) - top
            const r = Math.min(4, tall)
            const mine = live?.[n]
            return (
              <g key={point.value}>
                {tall > 0 && (
                  <path
                    d={`M${cx - thick / 2},${y(0)} V${top + r} q0,${-r} ${r},${-r} H${cx + thick / 2 - r} q${r},0 ${r},${r} V${y(0)} Z`}
                    className={point.value === standard ? 'fill-load' : 'fill-muted-foreground'}
                    opacity={hover >= 0 && hover !== n ? 0.55 : 1}
                  />
                )}
                <text
                  x={cx}
                  y={top - 6}
                  textAnchor="middle"
                  className="tabular fill-foreground text-[12px] font-medium">
                  {percent(share(point.delivered, point.runs))}
                </text>
                {mine && mine.runs > 0 && (
                  <circle
                    cx={cx + thick / 2 + 9}
                    cy={y(share(mine.delivered, mine.runs))}
                    r={5}
                    strokeWidth={2}
                    className="fill-lifter stroke-background"
                  />
                )}
                <text
                  x={cx}
                  y={y(0) + 16}
                  textAnchor="middle"
                  className={`tabular text-[12px] ${point.value === standard ? 'fill-foreground font-bold' : 'fill-muted-foreground'}`}>
                  {format(point.value)}
                </text>
                <rect
                  x={cx - band / 2}
                  y={TOP}
                  width={band}
                  height={PLOT + 20}
                  fill="transparent"
                  tabIndex={0}
                  role="img"
                  aria-label={`${axis} ${format(point.value)}: ${point.delivered} of ${point.runs} colonies delivered`}
                  onPointerEnter={() => setHover(n)}
                  onPointerLeave={() => setHover(-1)}
                  onFocus={() => setHover(n)}
                  onBlur={() => setHover(-1)}
                  className="outline-none"
                />
              </g>
            )
          })}
          <text
            x={(LEFT + W) / 2}
            y={H - 6}
            textAnchor="middle"
            className="fill-foreground text-[12px] font-medium">
            {axis}
          </text>
        </svg>
        {shown && (
          <div
            role="status"
            style={{ left: `${((LEFT + band * (hover + 0.5)) / W) * 100}%` }}
            className="pointer-events-none absolute top-0 z-10 w-max -translate-x-1/2 rounded-md border border-input bg-popover px-2.5 py-1.5 text-sm">
            <p className="tabular font-bold">
              {shown.delivered} of {shown.runs} delivered
            </p>
            {median(shown.times) !== null && (
              <p className="tabular text-muted-foreground">
                typical {clock(median(shown.times) ?? 0)}
              </p>
            )}
            {shownLive && shownLive.runs > 0 && (
              <p className="tabular text-muted-foreground">
                here {shownLive.delivered} of {shownLive.runs}
              </p>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <span className="flex items-center gap-2">
          <span className="size-2.5 rounded-[2px] bg-muted-foreground" />
          {points[0]?.runs ?? 0} colonies a bar, up to {clock(cap)} each
        </span>
        <span className="flex items-center gap-2">
          <span className="size-2.5 rounded-[2px] bg-load" />
          This page’s setting
        </span>
        {live && (
          <span className="tabular flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-lifter" />
            This machine, {total} of {points.length * each} colonies
          </span>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={running ? halt : run}
          className="ml-auto border-input bg-transparent shadow-none">
          {running ? 'Stop' : live ? 'Run it again' : 'Run it on this machine'}
        </Button>
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th>{axis}</th>
            <th>Colonies</th>
            <th>Delivered</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.value}>
              <td>{format(point.value)}</td>
              <td>{point.runs}</td>
              <td>{point.delivered}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
