import { describe, expect, test } from 'bun:test'
import {
  decodeState,
  encodeClient,
  noticeSchema,
  ROOM_CAP,
  ROOM_PUZZLE,
  ROOM_WARMUP,
  type Notice,
  type RoomState,
} from '@app/sim'
import {
  AWAY_MS,
  BREAK_MS,
  LET_GO_MS,
  QUIET_MS,
  Rooms,
  SIZES,
  TICKS_PER_SECOND,
  type Line,
  type Result,
} from './rooms'

/** A browser, as far as a room can tell. */
class Fake implements Line {
  notices: Notice[] = []
  state: RoomState | null = null
  closed = false
  send(data: string | Uint8Array<ArrayBuffer>): void {
    if (typeof data === 'string') this.notices.push(noticeSchema.parse(JSON.parse(data)))
    else this.state = decodeState(data)
  }
  close(): void {
    this.closed = true
  }
  backlog(): number {
    return 0
  }
  get you(): number {
    let you = -1
    for (const notice of this.notices) if (notice.t === 'round') you = notice.you
    return you
  }
  get me() {
    return this.state?.people.find((p) => p.id === this.you)
  }
}

const STEP = 1000 / TICKS_PER_SECOND

function setup() {
  const kept: Result[] = []
  const rooms = new Rooms((result) => kept.push(result))
  let now = 1_000_000
  const run = (ms: number, each?: () => void): void => {
    for (let t = 0; t < ms; t += STEP) {
      now += STEP
      each?.()
      rooms.tick(now, STEP / 1000)
    }
  }
  const join = (): Fake => {
    const fake = new Fake()
    rooms.join(fake, now)
    return fake
  }
  return { rooms, kept, run, join, now: () => now }
}

describe('rooms', () => {
  test('a newcomer is told who she is and starts out holding the load', () => {
    const { rooms, run, join } = setup()
    const a = join()
    expect(a.notices[0]).toMatchObject({
      t: 'round',
      round: 1,
      capacity: SIZES[0],
      puzzle: ROOM_WARMUP,
    })
    run(200)
    expect(a.state?.people.length).toBe(1)
    expect(a.me?.site).toBeGreaterThanOrEqual(0)
    expect(a.state?.started).toBe(false)
    expect(a.state?.time).toBe(0)
    expect(rooms.people).toBe(1)
  })

  test('the clock waits for the first pull, then the load moves', () => {
    const { rooms, run, join, now } = setup()
    const a = join()
    run(2000)
    const x0 = a.state?.x ?? 0
    expect(a.state?.time).toBe(0)
    rooms.hear(a, encodeClient({ op: 'pull', px: 1, py: 0 }), now())
    run(3000, () => rooms.hear(a, encodeClient({ op: 'pull', px: 1, py: 0 }), now()))
    expect(a.state?.started).toBe(true)
    expect(a.state?.time).toBeGreaterThan(5)
    expect((a.state?.x ?? 0) - x0).toBeGreaterThan(20)
  })

  test('rooms fill before a new one opens, and sizes alternate', () => {
    const { rooms, join } = setup()
    const first = Array.from({ length: SIZES[0] }, join)
    expect(rooms.rooms.length).toBe(1)
    join()
    expect(rooms.rooms.length).toBe(2)
    expect(rooms.rooms[1]?.capacity).toBe(SIZES[1])
    // Somebody leaves the full room: the next newcomer takes that place, not the emptier room.
    const gone = first[0]
    if (gone) rooms.leave(gone)
    join()
    expect(rooms.rooms[0]?.members.size).toBe(SIZES[0])
    expect(rooms.rooms[1]?.members.size).toBe(1)
  })

  test('a walker cannot go faster than a person or through a wall', () => {
    const { rooms, run, join, now } = setup()
    const a = join()
    rooms.hear(a, encodeClient({ op: 'drop' }), now())
    run(200)
    const start = a.me
    if (!start) throw new Error('no person')
    expect(start.site).toBe(-1)
    // Claims to be on the far side of the wall a moment later (the straight line misses the slit).
    rooms.hear(a, encodeClient({ op: 'move', x: 1000, y: 40 }), now())
    run(100)
    const after = a.me
    if (!after) throw new Error('no person')
    expect(after.x).toBeLessThan(560)
    expect(Math.hypot(after.x - start.x, after.y - start.y)).toBeLessThan(300)
  })

  test('somebody who goes quiet stops weighing on the load, lets go, and is shown the door', () => {
    const { rooms, run, join, now } = setup()
    const a = join()
    const b = join()
    const keepBusy = (): void => rooms.hear(a, encodeClient({ op: 'pull', px: 0, py: 0 }), now())
    run(1000, keepBusy)
    expect(a.state?.weight).toBe(2)
    run(QUIET_MS, keepBusy)
    expect(a.state?.weight).toBe(1)
    expect(a.state?.people.find((p) => p.id === b.you)?.site).toBeGreaterThanOrEqual(0)
    run(LET_GO_MS - QUIET_MS, keepBusy)
    expect(a.state?.people.find((p) => p.id === b.you)?.site).toBe(-1)
    run(AWAY_MS - LET_GO_MS + 500, keepBusy)
    expect(b.closed).toBe(true)
    expect(b.notices.at(-1)).toEqual({ t: 'bye', why: 'idle' })
    expect(rooms.people).toBe(1)
    expect(a.closed).toBe(false)
  })

  test('a round that runs out of time is called off, kept, and a new one starts', () => {
    const { rooms, kept, run, join, now } = setup()
    const a = join()
    const room = rooms.rooms[0]
    if (!room) throw new Error('no room')
    rooms.hear(a, encodeClient({ op: 'pull', px: 0, py: -1 }), now())
    run(1000)
    // Skip to the end of the clock rather than play fifteen minutes.
    room.world.time = ROOM_CAP - 1
    run(1500, () => rooms.hear(a, encodeClient({ op: 'pull', px: 0, py: -1 }), now()))
    expect(kept.length).toBe(1)
    expect(kept[0]?.outcome).toBe('CALLED_OFF')
    expect(kept[0]?.puzzle).toBe(ROOM_WARMUP)
    expect(a.notices.at(-1)).toMatchObject({
      t: 'over',
      delivered: false,
      round: 1,
      then: ROOM_PUZZLE,
    })
    expect(a.state?.over).toBe(true)
    run(BREAK_MS + 200, () => rooms.hear(a, encodeClient({ op: 'pull', px: 0, py: 0 }), now()))
    expect(a.notices.at(-1)).toMatchObject({ t: 'round', round: 2, puzzle: ROOM_PUZZLE })
    expect(a.state?.over).toBe(false)
    expect(a.state?.time).toBe(0)
    expect(a.me?.site).toBeGreaterThanOrEqual(0)
  })

  test('a room everyone walks out of is kept as abandoned, once it got somewhere', () => {
    const { rooms, kept, run, join, now } = setup()
    const a = join()
    rooms.hear(a, encodeClient({ op: 'pull', px: 1, py: 0 }), now())
    run(1000)
    rooms.leave(a)
    expect(kept.length).toBe(0)
    expect(rooms.rooms.length).toBe(0)

    const b = join()
    run(12_000, () => rooms.hear(b, encodeClient({ op: 'pull', px: 0, py: 1 }), now()))
    rooms.leave(b)
    expect(kept.length).toBe(1)
    expect(kept[0]?.outcome).toBe('ABANDONED')
    expect(kept[0]?.people).toBeCloseTo(1, 1)
    expect(rooms.people).toBe(0)
  })

  test('closing tells everyone to come back', () => {
    const { rooms, join } = setup()
    const a = join()
    rooms.close()
    expect(a.notices.at(-1)).toEqual({ t: 'bye', why: 'restart' })
    expect(a.closed).toBe(true)
    expect(rooms.people).toBe(0)
  })
})
