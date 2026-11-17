import {
  decodeState,
  encodeClient,
  noticeSchema,
  PERSON_REACH,
  PERSON_SPEED,
  PERSON_STAND,
  preset,
  requirePreset,
  ROOM_PATH,
  ROOM_RATE,
  ROOM_WARMUP,
  walkTo,
  WIRE_VERSION,
  World,
  wrap,
  type ClientMessage,
  type Notice,
  type Puzzle,
  type RoomState,
} from '@app/sim'
import type { Shot } from '../share/clip'
import { fitZoom, Renderer, type Camera, type Figure, type ViewOptions } from '../sim/renderer'

export type Status =
  /** Looking for a room, or the connection dropped and it is being retried. */
  | 'joining'
  | 'playing'
  /** The server let this person go after a long silence. */
  | 'away'
  /** Every room is full. */
  | 'busy'
  /** The page is older than the server. */
  | 'stale'
  /** Retrying did not help. */
  | 'lost'

export interface Ending {
  delivered: boolean
  seconds: number
  people: number
  /** `performance.now()` at which the next round starts. */
  nextAt: number
  /** The title of the puzzle the next round is played on. */
  then: string
}

export interface RoomSnapshot {
  status: Status
  /** The built-in puzzle this round is played on: its id and its title. */
  puzzle: string
  title: string
  round: number
  time: number
  started: boolean
  people: number
  /** How much of the room's pull goes the same way: 0 is a tug of war, 1 is everyone together. */
  together: number
  holding: boolean
  canGrab: boolean
  ending: Ending | null
  /** How many walls the load has just got through, for a few seconds after it does; otherwise 0. */
  through: number
  /** Whole seconds until the next round, while a round's result is up. */
  nextIn: number
  /** A round has ended here and can be made into a clip. */
  filmed: boolean
}

export const WAITING: RoomSnapshot = {
  status: 'joining',
  puzzle: '',
  title: '',
  round: 0,
  time: 0,
  started: false,
  people: 0,
  together: 0,
  holding: false,
  canGrab: false,
  ending: null,
  through: 0,
  nextIn: 0,
  filmed: false,
}

export type Cue = 'grab' | 'drop' | 'gate' | 'delivered' | 'calledOff'

/** Draw this far behind the newest state, so there are always two states to draw between. */
const DELAY = 110

/** One moment of a round, kept for the clip: the room as the server sent it, and how long the path was. */
interface Take {
  state: RoomState
  trace: number
}

/** A finished round, kept until the next one finishes. */
interface Reel {
  puzzle: Puzzle
  takes: Take[]
  trace: number[]
  you: number
  delivered: boolean
  seconds: number
  people: number
}
/** Pixels of drag for a full-strength pull. */
const STICK = 52
const SEND_MS = 50
/** How long "Through the first slit" stays up. */
const THROUGH_MS = 4000
const WALK = PERSON_SPEED * ROOM_RATE
const VIEW: ViewOptions = {
  roles: false,
  scent: false,
  trace: true,
  pulls: false,
  forces: false,
  traffic: false,
  planner: false,
  keyhole: false,
}
const KEYS: Record<string, [number, number]> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
}

interface Stamp {
  at: number
  state: RoomState
}

/** A built-in puzzle with nobody in it. An id this page doesn't know falls back to the warm-up. */
function empty(id: string): { id: string; title: string; puzzle: Puzzle } {
  const found = preset(id) ?? requirePreset(ROOM_WARMUP)
  return { id: found.id, title: found.title, puzzle: { ...found.puzzle, ants: 0 } }
}

/**
 * One visitor's seat in a room: the socket, their own person (walked here, so it never lags), the
 * picture of everyone else (drawn a moment behind what the server last said) and the pointer.
 * React reads it through `subscribe` / `snapshot` a few times a second, like the lab's Session.
 */
export class Room {
  readonly cam: Camera = { x: 0, y: 0, zoom: 1, turn: false }
  onCue: ((cue: Cue) => void) | null = null

  private course = empty(ROOM_WARMUP)
  /** Never stepped: it turns the load's pose into pieces and grip points for drawing. */
  private world = new World(this.course.puzzle, 1)
  private readonly renderer = new Renderer()
  private socket: WebSocket | null = null
  private status: Status = 'joining'
  private left = false
  private tries = 0
  private retry: ReturnType<typeof setTimeout> | null = null

  private you = -1
  private round = 0
  private ending: Ending | null = null
  private stamps: Stamp[] = []
  /** This round so far, every other state the server sent. */
  private takes: Take[] = []
  private heard = 0
  private reel: Reel | null = null
  private traced = -1
  private together = 0
  private gates = 0
  private gateAt = 0
  /** Load speed as a share of the fastest a room can carry it, smoothed (for the sound of it dragging). */
  speed = 0

  private readonly me = { x: 0, y: 0, h: 0 }
  private placed = false
  private holding = false
  private site = -1
  private readonly facing = new Map<number, { x: number; y: number; h: number }>()

  private readonly keys = new Set<string>()
  private drag: { id: number; ox: number; oy: number; x: number; y: number } | null = null
  private sentAt = 0
  private sentX = 0
  private sentY = 0
  private walked = false

  private ctx: CanvasRenderingContext2D | null = null
  private width = 1
  private height = 1
  private dpr = 1
  private raf = 0
  private last = 0
  private published = 0
  private current: RoomSnapshot = WAITING
  private readonly listeners = new Set<() => void>()

  // ---- React side ---------------------------------------------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  snapshot = (): RoomSnapshot => this.current

  private publish(): void {
    const newest = this.stamps.at(-1)?.state
    this.current = {
      status: this.status,
      puzzle: this.course.id,
      title: this.course.title,
      round: this.round,
      time: newest?.time ?? 0,
      started: newest?.started ?? false,
      people: newest?.people.length ?? 0,
      together: this.together,
      holding: this.holding,
      canGrab: this.status === 'playing' && !this.holding && !this.ending && this.inReach(),
      ending: this.ending,
      through: performance.now() - this.gateAt < THROUGH_MS ? this.gates : 0,
      nextIn: this.ending
        ? Math.max(0, Math.ceil((this.ending.nextAt - performance.now()) / 1000))
        : 0,
      filmed: this.reel !== null,
    }
    for (const listener of this.listeners) listener()
  }

  /** The last round that ended here as footage for a clip, or null if none has. */
  shot(): Shot | null {
    const reel = this.reel
    const last = reel ? reel.takes.length - 1 : 0
    if (!reel || last < 1) return null
    const { puzzle, takes, trace, you } = reel
    const world = new World(puzzle, 1)
    const renderer = new Renderer()
    const around = (at: number): { from: Take; to: Take; t: number } | null => {
      const i = Math.max(0, Math.min(last, at * last))
      const from = takes[Math.floor(i)]
      const to = takes[Math.ceil(i)]
      return from && to ? { from, to, t: i - Math.floor(i) } : null
    }
    return {
      seconds: reel.seconds,
      who: reel.people === 1 ? '1 person' : `${reel.people} people`,
      delivered: reel.delivered,
      clock: (at) => {
        const pair = around(at)
        if (!pair) return 0
        return pair.from.state.time + (pair.to.state.time - pair.from.state.time) * pair.t
      },
      draw: (ctx, at, width, height) => {
        const pair = around(at)
        if (!pair) return
        const { t } = pair
        const from = pair.from.state
        const to = pair.to.state
        world.pose(
          from.x + (to.x - from.x) * t,
          from.y + (to.y - from.y) * t,
          from.a + wrap(to.a - from.a) * t
        )
        const length = Math.min(trace.length, pair.to.trace)
        if (world.trace.length > length) world.trace.length = length
        for (let n = world.trace.length; n < length; n++) world.trace.push(trace[n] ?? 0)
        const figures: Figure[] = []
        for (const p of to.people) {
          const st = p.site >= 0 ? world.sites[p.site] : undefined
          if (st) {
            figures.push({
              x: st.x + st.nx * PERSON_STAND,
              y: st.y + st.ny * PERSON_STAND,
              h: Math.atan2(-st.ny, -st.nx),
              grip: { x: st.x, y: st.y },
              px: p.px,
              py: p.py,
              you: p.id === you,
            })
            continue
          }
          const before = from.people.find((q) => q.id === p.id && q.site < 0)
          const x = before ? before.x + (p.x - before.x) * t : p.x
          const y = before ? before.y + (p.y - before.y) * t : p.y
          // A walker faces the way she is going; one standing still faces the load.
          const walked = before ? Math.hypot(p.x - before.x, p.y - before.y) > 0.5 : false
          const h =
            before && walked
              ? Math.atan2(p.y - before.y, p.x - before.x)
              : Math.atan2(world.y - y, world.x - x)
          figures.push({ x, y, h, grip: null, px: 0, py: 0, you: p.id === you })
        }
        const turn = height > width
        const cam = {
          x: puzzle.w / 2,
          y: puzzle.h / 2,
          zoom: fitZoom(puzzle, width, height, turn),
          turn,
        }
        renderer.draw(ctx, world, cam, width, height, 1, VIEW, -1)
        renderer.figures(ctx, figures, cam.zoom)
      },
    }
  }

  /** Grab the load, or let go of it. */
  toggle = (): void => {
    if (this.status !== 'playing') return
    this.say({ op: this.holding ? 'drop' : 'grab' })
  }

  /** Look for a room (again). */
  join = (): void => {
    if (this.retry) clearTimeout(this.retry)
    this.retry = null
    this.left = false
    this.tries = 0
    this.status = 'joining'
    this.connect()
    this.publish()
  }

  // ---- the socket ---------------------------------------------------------------------------

  private connect(): void {
    this.socket?.close()
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
    const socket = new WebSocket(`${scheme}://${location.host}${ROOM_PATH}?v=${WIRE_VERSION}`)
    socket.binaryType = 'arraybuffer'
    this.socket = socket
    socket.onmessage = (event: MessageEvent<unknown>) => {
      if (socket !== this.socket) return
      if (typeof event.data === 'string') {
        let raw: unknown
        try {
          raw = JSON.parse(event.data)
        } catch {
          return
        }
        const notice = noticeSchema.safeParse(raw)
        if (notice.success) this.notice(notice.data)
      } else if (event.data instanceof ArrayBuffer) {
        const state = decodeState(new Uint8Array(event.data))
        if (state) this.hear(state)
      }
    }
    socket.onclose = () => {
      if (socket !== this.socket) return
      this.socket = null
      if (this.left || this.status === 'away' || this.status === 'busy' || this.status === 'stale')
        return
      // Dropped (a deploy, a tunnel, a lift): try again, a little slower each time.
      this.status = this.tries >= 7 ? 'lost' : 'joining'
      if (this.status === 'joining') {
        this.retry = setTimeout(() => this.connect(), Math.min(8000, 400 * 2 ** this.tries))
        this.tries++
      }
      this.publish()
    }
  }

  private say(message: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(encodeClient(message))
  }

  private notice(notice: Notice): void {
    if (notice.t === 'round') {
      if (notice.puzzle !== this.course.id) {
        this.course = empty(notice.puzzle)
        this.world = new World(this.course.puzzle, 1)
        this.fit()
      }
      this.you = notice.you
      this.round = notice.round
      this.status = 'playing'
      this.tries = 0
      this.ending = null
      this.stamps = []
      this.takes = []
      this.placed = false
      this.holding = false
      this.site = -1
      this.traced = -1
      this.gates = 0
      this.gateAt = 0
      this.world.trace.length = 0
      this.facing.clear()
    } else if (notice.t === 'over') {
      this.ending = {
        delivered: notice.delivered,
        seconds: notice.seconds,
        people: notice.people,
        nextAt: performance.now() + notice.next,
        then: empty(notice.then).title,
      }
      if (this.takes.length > 1) {
        this.reel = {
          puzzle: this.course.puzzle,
          takes: this.takes,
          trace: this.world.trace.slice(),
          you: this.you,
          delivered: notice.delivered,
          seconds: notice.seconds,
          people: Math.max(1, Math.round(notice.people)),
        }
      }
      this.takes = []
      this.onCue?.(notice.delivered ? 'delivered' : 'calledOff')
    } else if (notice.why === 'idle') {
      this.status = 'away'
    } else if (notice.why === 'busy') {
      this.status = 'busy'
    } else if (notice.why === 'version') {
      this.status = 'stale'
    }
    // A restart is not an ending: the close that follows it reconnects.
    this.publish()
  }

  private hear(state: RoomState): void {
    const now = performance.now()
    const before = this.stamps.at(-1)
    if (before && now > before.at) {
      // Sim units per sim second; everyone pulling one way manages about 16.
      const moved = Math.hypot(state.x - before.state.x, state.y - before.state.y)
      const v = moved / (((now - before.at) / 1000) * ROOM_RATE)
      this.speed += (Math.min(1, v / 16) - this.speed) * 0.25
    }
    this.stamps.push({ at: now, state })
    if (state.gates > this.gates && this.stamps.length > 1) {
      this.gateAt = now
      this.onCue?.('gate')
    }
    this.gates = state.gates
    while (this.stamps.length > 2 && (this.stamps[0]?.at ?? now) < now - 1000) this.stamps.shift()

    const mine = state.people.find((p) => p.id === this.you)
    if (mine) {
      const holding = mine.site >= 0
      if (!holding) {
        // Take the server's word for where I stand when it lets me go, and when we disagree badly.
        const off = Math.hypot(mine.x - this.me.x, mine.y - this.me.y)
        if (this.holding || !this.placed || off > 130) {
          this.me.x = mine.x
          this.me.y = mine.y
        }
      }
      if (this.placed && holding !== this.holding) this.onCue?.(holding ? 'grab' : 'drop')
      this.holding = holding
      this.site = mine.site
      this.placed = true
    }

    if (state.started && !state.over && state.time - this.traced >= 0.5) {
      this.traced = state.time
      if (this.world.trace.length < 30000) this.world.trace.push(state.x, state.y, state.a)
    }
    if (state.started && !state.over && this.heard++ % 2 === 0) {
      this.takes.push({ state, trace: this.world.trace.length })
    }

    let sx = 0
    let sy = 0
    for (const p of state.people) {
      if (p.site < 0) continue
      sx += p.px
      sy += p.py
    }
    const together = Math.min(1, Math.hypot(sx, sy) / Math.max(1, state.weight))
    this.together += (together - this.together) * 0.2
  }

  /** Whether a grip point is close enough to take hold of. */
  private inReach(): boolean {
    for (const st of this.world.sites) {
      if (Math.hypot(st.x - this.me.x, st.y - this.me.y) <= PERSON_REACH) return true
    }
    return false
  }

  // ---- the canvas ---------------------------------------------------------------------------

  /** Bind to a canvas and join a room. Returns the function that leaves and unbinds. */
  attach(canvas: HTMLCanvasElement): () => void {
    this.ctx = canvas.getContext('2d')
    const resize = (): void => {
      const rect = canvas.getBoundingClientRect()
      this.width = Math.max(1, rect.width)
      this.height = Math.max(1, rect.height)
      this.dpr = Math.min(3, window.devicePixelRatio || 1)
      canvas.width = Math.round(this.width * this.dpr)
      canvas.height = Math.round(this.height * this.dpr)
      this.fit()
    }
    const sizes = new ResizeObserver(resize)
    sizes.observe(canvas)
    resize()

    const at = (e: PointerEvent): { x: number; y: number } => {
      const rect = canvas.getBoundingClientRect()
      return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }
    const down = (e: PointerEvent): void => {
      if (this.drag) return
      const p = at(e)
      this.drag = { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y }
      canvas.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent): void => {
      if (this.drag?.id !== e.pointerId) return
      const p = at(e)
      this.drag.x = p.x
      this.drag.y = p.y
    }
    const up = (e: PointerEvent): void => {
      if (this.drag?.id === e.pointerId) this.drag = null
    }
    const keydown = (e: KeyboardEvent): void => {
      const target = e.target
      if (target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName))
        return
      if (e.code === 'Space') {
        e.preventDefault()
        if (!e.repeat) this.toggle()
      } else if (KEYS[e.code]) {
        e.preventDefault()
        this.keys.add(e.code)
      }
    }
    const keyup = (e: KeyboardEvent): void => {
      this.keys.delete(e.code)
    }
    const blur = (): void => {
      this.keys.clear()
      this.drag = null
    }

    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', up)
    window.addEventListener('keydown', keydown)
    window.addEventListener('keyup', keyup)
    window.addEventListener('blur', blur)

    this.join()
    this.last = performance.now()
    this.raf = requestAnimationFrame(this.frame)

    return () => {
      cancelAnimationFrame(this.raf)
      sizes.disconnect()
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', up)
      window.removeEventListener('keydown', keydown)
      window.removeEventListener('keyup', keyup)
      window.removeEventListener('blur', blur)
      this.left = true
      if (this.retry) clearTimeout(this.retry)
      this.socket?.close()
      this.socket = null
      this.ctx = null
    }
  }

  /** Show the whole arena, turned on its side when the view is taller than it is wide. */
  private fit(): void {
    const puzzle = this.course.puzzle
    this.cam.x = puzzle.w / 2
    this.cam.y = puzzle.h / 2
    this.cam.turn = this.height > this.width
    this.cam.zoom = fitZoom(puzzle, this.width, this.height, this.cam.turn)
  }

  /** Which way the visitor is steering, in world units: a vector no longer than 1. */
  private steer(): { x: number; y: number } {
    let sx = 0
    let sy = 0
    if (this.drag) {
      sx = (this.drag.x - this.drag.ox) / STICK
      sy = (this.drag.y - this.drag.oy) / STICK
    } else {
      for (const code of this.keys) {
        const dir = KEYS[code]
        if (!dir) continue
        sx += dir[0]
        sy += dir[1]
      }
    }
    const m = Math.hypot(sx, sy)
    if (m > 1) {
      sx /= m
      sy /= m
    }
    // On a turned view, up the screen is +x in the world and right is +y.
    return this.cam.turn ? { x: -sy, y: sx } : { x: sx, y: sy }
  }

  private frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame)
    const elapsed = Math.min(0.1, (now - this.last) / 1000)
    this.last = now
    const s = this.steer()
    const pulling = Math.hypot(s.x, s.y)

    if (this.status === 'playing' && this.placed) {
      if (!this.holding) {
        if (pulling > 0.02) {
          walkTo(
            this.world.fields,
            this.me,
            this.me.x + s.x * WALK * elapsed,
            this.me.y + s.y * WALK * elapsed
          )
          this.me.h = Math.atan2(s.y, s.x)
          this.walked = true
        }
        if (this.walked && now - this.sentAt >= SEND_MS) {
          this.walked = false
          this.sentAt = now
          this.say({ op: 'move', x: this.me.x, y: this.me.y })
        }
      } else {
        const changed = Math.abs(s.x - this.sentX) + Math.abs(s.y - this.sentY) > 0.02
        // Said again twice a second while pulling, so the server knows this person is still here.
        const due = changed ? SEND_MS : pulling > 0.02 ? 500 : Infinity
        if (now - this.sentAt >= due) {
          this.sentAt = now
          this.sentX = s.x
          this.sentY = s.y
          this.say({ op: 'pull', px: s.x, py: s.y })
        }
      }
    }

    this.render(now, s)
    if (now - this.published > 160) {
      this.published = now
      this.publish()
    }
  }

  private render(now: number, s: { x: number; y: number }): void {
    const ctx = this.ctx
    if (!ctx) return
    const target = now - DELAY
    let a = this.stamps[0]
    let b = a
    for (let i = 0; i < this.stamps.length; i++) {
      const stamp = this.stamps[i]
      if (!stamp || stamp.at > target) break
      a = stamp
      b = this.stamps[i + 1] ?? stamp
    }
    const figures: Figure[] = []
    if (a && b) {
      const t = b.at > a.at ? Math.max(0, Math.min(1, (target - a.at) / (b.at - a.at))) : 1
      const from = a.state
      const to = b.state
      this.world.pose(
        from.x + (to.x - from.x) * t,
        from.y + (to.y - from.y) * t,
        from.a + wrap(to.a - from.a) * t
      )
      for (const p of to.people) {
        const you = p.id === this.you
        // My own state is the freshest there is; everyone else is drawn where the server last put them.
        const site = you ? this.site : p.site
        const st = site >= 0 ? this.world.sites[site] : undefined
        if (st) {
          figures.push({
            x: st.x + st.nx * PERSON_STAND,
            y: st.y + st.ny * PERSON_STAND,
            h: Math.atan2(-st.ny, -st.nx),
            grip: { x: st.x, y: st.y },
            px: you ? s.x : p.px,
            py: you ? s.y : p.py,
            you,
          })
          this.facing.delete(p.id)
          continue
        }
        if (you) {
          figures.push({ x: this.me.x, y: this.me.y, h: this.me.h, grip: null, px: 0, py: 0, you })
          continue
        }
        if (p.site >= 0) continue
        const before = from.people.find((q) => q.id === p.id && q.site < 0)
        const x = before ? before.x + (p.x - before.x) * t : p.x
        const y = before ? before.y + (p.y - before.y) * t : p.y
        const seen = this.facing.get(p.id) ?? { x, y, h: 0 }
        if (Math.hypot(x - seen.x, y - seen.y) > 0.4) seen.h = Math.atan2(y - seen.y, x - seen.x)
        seen.x = x
        seen.y = y
        this.facing.set(p.id, seen)
        figures.push({ x, y, h: seen.h, grip: null, px: 0, py: 0, you })
      }
    }

    this.renderer.draw(ctx, this.world, this.cam, this.width, this.height, this.dpr, VIEW, -1)
    this.renderer.figures(ctx, figures, this.cam.zoom)

    // The stick, where the thumb is.
    const drag = this.drag
    if (drag) {
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
      let kx = drag.x - drag.ox
      let ky = drag.y - drag.oy
      const m = Math.hypot(kx, ky)
      if (m > STICK) {
        kx *= STICK / m
        ky *= STICK / m
      }
      ctx.strokeStyle = 'rgba(20,24,20,0.28)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(drag.ox, drag.oy, STICK, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = 'rgba(20,24,20,0.4)'
      ctx.beginPath()
      ctx.arc(drag.ox + kx, drag.oy + ky, 20, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}
