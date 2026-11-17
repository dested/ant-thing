// People against ants: what rooms.ts has written down, for the page's chart.
import { ROOM_PUZZLE } from '@app/sim'
import { cached, makeCache } from './limits'
import { prisma } from './prisma'
import { onCarry, rooms } from './rooms-socket'
import { publicProcedure, router } from './trpc'

/** Group sizes, after the experiment's: one person, a small group, a large one. */
export type GroupKey = 'one' | 'small' | 'large'

export interface Group {
  key: GroupKey
  delivered: number
  calledOff: number
  abandoned: number
  /** Sim seconds of every delivery, fastest first. */
  times: number[]
}

/** How many of the latest rounds the chart reads. */
const LATEST = 4000

export function groupOf(people: number): GroupKey {
  if (people < 1.5) return 'one'
  return people < 8.5 ? 'small' : 'large'
}

const cache = makeCache<Group[]>()
onCarry(() => cache.entries.clear())

async function load(): Promise<Group[]> {
  const rows = await prisma.carry.findMany({
    where: { puzzleId: ROOM_PUZZLE },
    select: { outcome: true, seconds: true, people: true },
    orderBy: { createdAt: 'desc' },
    take: LATEST,
  })
  const groups: Group[] = (['one', 'small', 'large'] as const).map((key) => ({
    key,
    delivered: 0,
    calledOff: 0,
    abandoned: 0,
    times: [],
  }))
  for (const row of rows) {
    const group = groups.find((g) => g.key === groupOf(row.people))
    if (!group) continue
    if (row.outcome === 'DELIVERED') {
      group.delivered++
      group.times.push(Math.round(row.seconds * 10) / 10)
    } else if (row.outcome === 'CALLED_OFF') group.calledOff++
    else group.abandoned++
  }
  for (const group of groups) group.times.sort((a, b) => a - b)
  return groups
}

export const peopleRouter = router({
  /** Every group size's record so far, and how many people are in rooms right now. */
  stats: publicProcedure.query(async () => ({
    online: rooms.people,
    groups: await cached(cache, 'groups', 10_000, load),
  })),
})
