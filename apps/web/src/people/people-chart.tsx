import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTRPC } from '~/lib/trpc'
import { clock } from '~/sim/clock'
import { ANTS, GROUP_LABEL, median } from './record'

const W = 640
const LEFT = 118
const RIGHT = 84
const TOP = 10
const ROW = 46
const AXIS = 34
const PLOT = W - LEFT - RIGHT

interface Line {
  key: string
  label: string
  /** Delivery times, sim seconds, fastest first. */
  times: readonly number[]
  /** Rounds that ran to an end: delivered, or called off at the cap. */
  finished: number
  people: boolean
}

/** A steady up-and-down scatter so dots that share a time don't hide each other. */
const lift = (n: number): number => (((n * 37) % 11) - 5) * 2.4

/**
 * Every delivery as a dot on one clock: the colony's 96 runs from the bench, and every room of
 * people the server has seen so far, by group size. A tick marks each row's typical time.
 */
export function PeopleChart() {
  const trpc = useTRPC()
  const stats = useQuery({ ...trpc.people.stats.queryOptions(), refetchInterval: 30_000 })
  const [hover, setHover] = useState(-1)

  const lines: Line[] = [
    { key: 'ants', label: '400 ants', times: ANTS.times, finished: ANTS.runs, people: false },
    ...(stats.data?.groups ?? []).map((group) => ({
      key: group.key,
      label: GROUP_LABEL[group.key],
      times: group.times,
      finished: group.delivered + group.calledOff,
      people: true,
    })),
  ]
  const H = TOP + ROW * lines.length + AXIS
  const x = (seconds: number): number => LEFT + PLOT * Math.min(1, seconds / ANTS.cap)
  const ticks = [0, 600, 1200, 1800].filter((tick) => tick <= ANTS.cap)
  const title = 'Minutes to get the load home'
  const shown = lines[hover]
  const abandoned = stats.data?.groups.reduce((sum, group) => sum + group.abandoned, 0) ?? 0

  return (
    <figure className="flex flex-col gap-3">
      <h3 className="font-display text-xl leading-tight font-bold">{title}</h3>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} className="w-full">
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={x(tick)}
                x2={x(tick)}
                y1={TOP}
                y2={TOP + ROW * lines.length}
                className="stroke-border"
              />
              <text
                x={x(tick)}
                y={H - 14}
                textAnchor="middle"
                className="tabular fill-muted-foreground text-[12px]">
                {tick / 60}
              </text>
            </g>
          ))}
          {lines.map((line, n) => {
            const cy = TOP + ROW * (n + 0.5)
            const typical = median(line.times)
            return (
              <g key={line.key} opacity={hover >= 0 && hover !== n ? 0.55 : 1}>
                <text
                  x={LEFT - 12}
                  y={cy + 4}
                  textAnchor="end"
                  className="fill-foreground text-[12px] font-medium">
                  {line.label}
                </text>
                {line.times.length === 0 && (
                  <text x={LEFT + 8} y={cy + 4} className="fill-muted-foreground text-[12px]">
                    Nobody yet
                  </text>
                )}
                {line.times.map((seconds, i) => (
                  <circle
                    key={i}
                    cx={x(seconds)}
                    cy={cy + lift(i)}
                    r={4}
                    strokeWidth={2}
                    className={
                      line.people
                        ? 'fill-lifter stroke-background'
                        : 'fill-muted-foreground stroke-background'
                    }
                  />
                ))}
                {typical !== null && (
                  <line
                    x1={x(typical)}
                    x2={x(typical)}
                    y1={cy - 17}
                    y2={cy + 17}
                    strokeWidth={2}
                    className="stroke-foreground"
                  />
                )}
                <text
                  x={W}
                  y={cy + 4}
                  textAnchor="end"
                  className="tabular fill-foreground text-[12px] font-medium">
                  {line.finished > 0 ? `${line.times.length} of ${line.finished}` : ''}
                </text>
                <rect
                  x={0}
                  y={cy - ROW / 2}
                  width={W}
                  height={ROW}
                  fill="transparent"
                  tabIndex={0}
                  role="img"
                  aria-label={`${line.label}: ${line.times.length} of ${line.finished} delivered${typical === null ? '' : `, typical ${clock(typical)}`}`}
                  onPointerEnter={() => setHover(n)}
                  onPointerLeave={() => setHover(-1)}
                  onFocus={() => setHover(n)}
                  onBlur={() => setHover(-1)}
                  className="outline-none"
                />
              </g>
            )
          })}
        </svg>
        {shown && shown.times.length > 0 && (
          <div
            role="status"
            style={{
              left: `${((LEFT + PLOT / 2) / W) * 100}%`,
              top: `${((TOP + ROW * hover) / H) * 100}%`,
            }}
            className="pointer-events-none absolute z-10 w-max -translate-x-1/2 -translate-y-full rounded-md border border-input bg-popover px-2.5 py-1.5 text-sm">
            <p className="tabular font-bold">
              {shown.times.length} of {shown.finished} delivered
            </p>
            <p className="tabular text-muted-foreground">
              typical {clock(median(shown.times) ?? 0)}, fastest {clock(shown.times[0] ?? 0)}
            </p>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <span className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-muted-foreground" />A colony’s delivery
        </span>
        <span className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-lifter" />A room’s delivery
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3.5 w-0.5 bg-foreground" />
          Typical
        </span>
        <span className="text-muted-foreground">
          Counts are deliveries out of rounds that ran to the end, up to {clock(ANTS.cap)} each
          {abandoned > 0 ? `; ${abandoned} more were walked out on` : ''}
        </span>
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th>Who</th>
            <th>Delivered</th>
            <th>Rounds finished</th>
            <th>Typical time</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.key}>
              <td>{line.label}</td>
              <td>{line.times.length}</td>
              <td>{line.finished}</td>
              <td>{median(line.times) === null ? '' : clock(median(line.times) ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
