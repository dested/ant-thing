// Rooms: visitors carrying one load together. The server owns the physics (one World per room,
// stepped at ROOM_RATE sim seconds a second) and tells every browser where things are 15 times a
// second. A browser only ever says where its own person walks, which way she pulls, grab and let go.
// Nothing here knows about sockets: rooms-socket.ts feeds it, and the tests drive it by hand.
import {
  decodeClient,
  DT,
  encodeState,
  gateLines,
  gatesPassed,
  PERSON_SPEED,
  PERSON_WEIGHT,
  requirePreset,
  ROOM_CAP,
  ROOM_RATE,
  roomPuzzle,
  walkTo,
  WIRE_VERSION,
  World,
  type Notice,
  type Puzzle,
  type WirePerson,
} from '@app/sim'

/** The part of a WebSocket a room needs. */
export interface Line {
  send(data: string | Uint8Array<ArrayBuffer>): void
  close(): void
  /** Bytes waiting to go out: a browser that can't keep up is skipped rather than buried. */
  backlog(): number
}

export type Outcome = 'DELIVERED' | 'CALLED_OFF' | 'ABANDONED'

export interface Result {
  /** The built-in puzzle the round was played on. */
  puzzle: string
  outcome: Outcome
  seconds: number
  people: number
  peak: number
  /** How many of the puzzle's walls the load got through. */
  gates: number
}

/** Room sizes alternate, so small groups and large ones both get played (the experiment ran both). */
export const SIZES = [8, 24] as const
export const TICKS_PER_SECOND = 30
/** A state frame goes out every this many ticks. */
const SEND_EVERY = 2
/** No word from a browser this long and its person stops counting toward the load's weight… */
export const QUIET_MS = 15_000
/** …then lets go… */
export const LET_GO_MS = 25_000
/** …and then is shown the door. */
export const AWAY_MS = 90_000
/** How long a finished round stays on screen. */
export const BREAK_MS = 8_000
/** An abandoned round is only worth keeping if it got this far (sim seconds). */
const KEEP_AFTER = 20
/** Walking budget: a browser may report at most this many seconds of walking at once (a lag spike's worth). */
const REACH_SECONDS = 1.5
const WALK = PERSON_SPEED * ROOM_RATE
const MAX_FRAMES_PER_SECOND = 90
const MAX_BACKLOG = 64 * 1024

interface Member {
  line: Line
  /** Her index in the room's world, and her id on the wire. */
  id: number
  heard: number
  /** Units she may still walk before the clock gives her more. */
  reach: number
  frames: number
  framesAt: number
}

/** A round's puzzle with nobody in it, the walls its load has to get through, and a world to play it in. */
interface Course {
  id: string
  puzzle: Puzzle
  gates: number[]
  world: World
}

function course(round: number): Course {
  const id = roomPuzzle(round)
  const puzzle = { ...requirePreset(id).puzzle, ants: 0 }
  const world = new World(puzzle, 1 + Math.floor(Math.random() * 1e6))
  // The clock waits for the first pull.
  world.frozen = true
  return { id, puzzle, gates: gateLines(puzzle), world }
}

export class Room {
  readonly members = new Map<Line, Member>()
  round = 1
  private course = course(1)
  started = false
  /** When the break after a round ends; 0 while a round is on. */
  breakUntil = 0
  private acc = 0
  private ticks = 0
  private peopleSeconds = 0
  private peak = 0
  /** The furthest the load has got this round, in walls. */
  private gates = 0

  constructor(
    readonly capacity: number,
    private readonly keep: (result: Result) => void
  ) {}

  get open(): boolean {
    return this.members.size < this.capacity
  }

  get world(): World {
    return this.course.world
  }

  join(line: Line, now: number): void {
    const member: Member = {
      line,
      id: this.world.addPerson(),
      heard: now,
      reach: WALK * REACH_SECONDS,
      frames: 0,
      framesAt: now,
    }
    this.members.set(line, member)
    this.greet(member)
  }

  /** True when the room is now empty and should be forgotten. */
  leave(line: Line): boolean {
    const member = this.members.get(line)
    if (!member) return this.members.size === 0
    this.world.removePerson(member.id)
    this.members.delete(line)
    if (this.members.size > 0) return false
    if (this.started && this.breakUntil === 0 && this.world.time >= KEEP_AFTER) {
      this.keep(this.result('ABANDONED', this.world.time))
    }
    return true
  }

  hear(line: Line, data: Uint8Array, now: number): void {
    const member = this.members.get(line)
    if (!member) return
    if (now - member.framesAt >= 1000) {
      member.framesAt = now
      member.frames = 0
    }
    if (++member.frames > MAX_FRAMES_PER_SECOND) return
    const message = decodeClient(data)
    if (!message) return
    const person = this.world.people[member.id]
    if (!person) return
    member.heard = now
    if (message.op === 'move') {
      if (person.site >= 0) return
      let dx = message.x - person.x
      let dy = message.y - person.y
      const far = Math.hypot(dx, dy)
      if (far < 1e-6) return
      if (far > member.reach) {
        dx *= member.reach / far
        dy *= member.reach / far
      }
      const bx = person.x
      const by = person.y
      walkTo(this.world.fields, person, bx + dx, by + dy)
      const walked = Math.hypot(person.x - bx, person.y - by)
      member.reach = Math.max(0, member.reach - walked)
      person.gait += walked
      if (walked > 0.5) person.h = Math.atan2(person.y - by, person.x - bx)
    } else if (message.op === 'pull') {
      if (person.site < 0) return
      person.px = message.px
      person.py = message.py
      if (!this.started && this.breakUntil === 0 && Math.hypot(message.px, message.py) > 0.05) {
        this.started = true
        this.world.frozen = false
      }
    } else if (message.op === 'grab') {
      if (this.breakUntil === 0) this.world.hold(member.id)
    } else {
      this.world.drop(member.id)
    }
  }

  /** Advance by `elapsed` real seconds. Returns the lines to hang up on (people who went away). */
  tick(now: number, elapsed: number): Line[] {
    const away: Line[] = []
    let active = 0
    for (const member of this.members.values()) {
      const quiet = now - member.heard
      if (quiet >= AWAY_MS) {
        away.push(member.line)
        continue
      }
      if (quiet >= LET_GO_MS) this.world.drop(member.id)
      if (quiet < QUIET_MS) active++
      member.reach = Math.min(WALK * REACH_SECONDS, member.reach + WALK * elapsed * 1.15)
    }
    this.world.weight = PERSON_WEIGHT * Math.max(1, active)

    this.acc += elapsed * ROOM_RATE
    let steps = 0
    while (this.acc >= DT) {
      this.acc -= DT
      this.world.step()
      // A stalled process doesn't get to catch up all at once.
      if (++steps >= 16) {
        this.acc = 0
        break
      }
    }

    if (this.breakUntil === 0) {
      if (this.started) {
        this.peopleSeconds += active * steps * DT
        this.peak = Math.max(this.peak, this.members.size)
        this.gates = Math.max(
          this.gates,
          gatesPassed(this.course.puzzle, this.course.gates, this.world.pieces)
        )
      }
      if (this.world.delivered) this.finish('DELIVERED', this.world.deliveredAt, now)
      else if (this.world.time >= ROOM_CAP) this.finish('CALLED_OFF', this.world.time, now)
    } else if (now >= this.breakUntil) {
      this.next()
    }

    if (++this.ticks % SEND_EVERY === 0) this.tell(active)
    return away
  }

  bye(why: Extract<Notice, { t: 'bye' }>['why']): void {
    const notice: Notice = { t: 'bye', why }
    const text = JSON.stringify(notice)
    for (const member of this.members.values()) member.line.send(text)
  }

  private result(outcome: Outcome, seconds: number): Result {
    return {
      puzzle: this.course.id,
      outcome,
      seconds,
      people: seconds > 0 ? this.peopleSeconds / seconds : this.members.size,
      peak: this.peak,
      gates: this.gates,
    }
  }

  private finish(outcome: Outcome, seconds: number, now: number): void {
    this.breakUntil = now + BREAK_MS
    this.world.frozen = true
    const result = this.result(outcome, seconds)
    this.keep(result)
    const notice: Notice = {
      t: 'over',
      round: this.round,
      delivered: outcome === 'DELIVERED',
      seconds,
      people: result.people,
      next: BREAK_MS,
      then: roomPuzzle(this.round + 1),
    }
    const text = JSON.stringify(notice)
    for (const member of this.members.values()) member.line.send(text)
  }

  private next(): void {
    this.round++
    this.course = course(this.round)
    this.started = false
    this.breakUntil = 0
    this.acc = 0
    this.peopleSeconds = 0
    this.peak = 0
    this.gates = 0
    for (const member of this.members.values()) {
      member.id = this.world.addPerson()
      this.greet(member)
    }
  }

  private greet(member: Member): void {
    const notice: Notice = {
      t: 'round',
      v: WIRE_VERSION,
      you: member.id,
      round: this.round,
      capacity: this.capacity,
      puzzle: this.course.id,
    }
    member.line.send(JSON.stringify(notice))
  }

  private tell(active: number): void {
    const w = this.world
    const people: WirePerson[] = []
    for (let id = 0; id < w.people.length; id++) {
      const p = w.people[id]
      if (p) people.push({ id, site: p.site, x: p.x, y: p.y, px: p.px, py: p.py })
    }
    const frame = encodeState({
      started: this.started,
      over: this.breakUntil !== 0,
      gates: this.gates,
      time: w.delivered ? w.deliveredAt : w.time,
      x: w.x,
      y: w.y,
      a: w.a,
      weight: Math.max(1, active),
      people,
    })
    for (const member of this.members.values()) {
      if (member.line.backlog() < MAX_BACKLOG) member.line.send(frame)
    }
  }
}

/** Every room, and who is in which. */
export class Rooms {
  readonly rooms: Room[] = []
  private readonly where = new Map<Line, Room>()
  private made = 0

  constructor(private readonly keep: (result: Result) => void) {}

  get people(): number {
    return this.where.size
  }

  /** Put a newcomer in the fullest room with space, so rooms stay crowded; open one when all are full. */
  join(line: Line, now: number): void {
    let room: Room | undefined
    for (const candidate of this.rooms) {
      if (candidate.open && (!room || candidate.members.size > room.members.size)) room = candidate
    }
    if (!room) {
      room = new Room(SIZES[this.made++ % SIZES.length] ?? SIZES[0], this.keep)
      this.rooms.push(room)
    }
    this.where.set(line, room)
    room.join(line, now)
  }

  leave(line: Line): void {
    const room = this.where.get(line)
    if (!room) return
    this.where.delete(line)
    if (room.leave(line)) this.rooms.splice(this.rooms.indexOf(room), 1)
  }

  hear(line: Line, data: Uint8Array, now: number): void {
    this.where.get(line)?.hear(line, data, now)
  }

  tick(now: number, elapsed: number): void {
    // A copy: hanging up on somebody can empty a room and remove it from the list.
    for (const room of [...this.rooms]) {
      for (const line of room.tick(now, elapsed)) {
        const notice: Notice = { t: 'bye', why: 'idle' }
        line.send(JSON.stringify(notice))
        line.close()
        this.leave(line)
      }
    }
  }

  /** Tell everyone the server is going away (a deploy): their browsers reconnect by themselves. */
  close(): void {
    for (const room of this.rooms) room.bye('restart')
    for (const line of [...this.where.keys()]) {
      line.close()
      this.leave(line)
    }
  }
}
