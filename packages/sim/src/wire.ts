import { z } from 'zod'

/**
 * What a room's browser and server say to each other over one WebSocket. Positions and pulls are
 * small binary frames (they go many times a second); the rare notices are JSON.
 */
export const WIRE_VERSION = 1
export const ROOM_PATH = '/api/room'
/** Sim seconds per real second in a room. */
export const ROOM_RATE = 2
/** Sim seconds before a round is called off: the same cap the colonies get. */
export const ROOM_CAP = 1800
/** The puzzle rooms carry: the experiment's. Its rounds are the ones compared with the colony. */
export const ROOM_PUZZLE = 'piano-movers'
/** A room's first round is an easy one, so a new group learns to turn a load before it meets the T. */
export const ROOM_WARMUP = 'doorway'

/** Which built-in puzzle a room plays in a given round (rounds count from 1). */
export function roomPuzzle(round: number): string {
  return round <= 1 ? ROOM_WARMUP : ROOM_PUZZLE
}

const C_MOVE = 2
const C_PULL = 3
const C_GRAB = 4
const C_DROP = 5
const S_STATE = 1

const POS = 16
const ANGLE = 10000
const PULL = 127

export type ClientMessage =
  | { op: 'move'; x: number; y: number }
  | { op: 'pull'; px: number; py: number }
  | { op: 'grab' }
  | { op: 'drop' }

export function encodeClient(message: ClientMessage): Uint8Array<ArrayBuffer> {
  if (message.op === 'move') {
    const out = new Uint8Array(5)
    const view = new DataView(out.buffer)
    view.setUint8(0, C_MOVE)
    view.setInt16(1, clampInt(message.x * POS), true)
    view.setInt16(3, clampInt(message.y * POS), true)
    return out
  }
  if (message.op === 'pull') {
    const out = new Uint8Array(3)
    const view = new DataView(out.buffer)
    view.setUint8(0, C_PULL)
    view.setInt8(1, clampPull(message.px))
    view.setInt8(2, clampPull(message.py))
    return out
  }
  return Uint8Array.of(message.op === 'grab' ? C_GRAB : C_DROP)
}

/** Null for anything that is not exactly one well-formed frame. */
export function decodeClient(data: Uint8Array): ClientMessage | null {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const op = data[0]
  if (op === C_MOVE && data.length === 5) {
    return { op: 'move', x: view.getInt16(1, true) / POS, y: view.getInt16(3, true) / POS }
  }
  if (op === C_PULL && data.length === 3) {
    let px = view.getInt8(1) / PULL
    let py = view.getInt8(2) / PULL
    const m = Math.hypot(px, py)
    if (m > 1) {
      px /= m
      py /= m
    }
    return { op: 'pull', px, py }
  }
  if (op === C_GRAB && data.length === 1) return { op: 'grab' }
  if (op === C_DROP && data.length === 1) return { op: 'drop' }
  return null
}

export interface WirePerson {
  id: number
  /** Grip point index while holding, else -1. */
  site: number
  /** Where she stands (free people only; a holder stands at her grip point). */
  x: number
  y: number
  /** Her pull (holders only). */
  px: number
  py: number
}

export interface RoomState {
  /** The clock is running: somebody has pulled. */
  started: boolean
  /** The round has ended and the next has not begun. */
  over: boolean
  /** How many of the puzzle's walls the load has got through this round (`gateLines`). */
  gates: number
  /** Sim seconds on the clock. */
  time: number
  x: number
  y: number
  a: number
  /** How many people the load is weighted for. */
  weight: number
  people: WirePerson[]
}

const HEAD = 14
const EACH = 8

export function encodeState(state: RoomState): Uint8Array<ArrayBuffer> {
  const n = Math.min(255, state.people.length)
  const out = new Uint8Array(HEAD + EACH * n)
  const view = new DataView(out.buffer)
  view.setUint8(0, S_STATE)
  view.setUint8(
    1,
    (state.started ? 1 : 0) | (state.over ? 2 : 0) | (Math.max(0, Math.min(7, state.gates)) << 2)
  )
  view.setUint32(2, Math.max(0, Math.round(state.time * 100)), true)
  view.setInt16(6, clampInt(state.x * POS), true)
  view.setInt16(8, clampInt(state.y * POS), true)
  view.setInt16(10, clampInt(state.a * ANGLE), true)
  view.setUint8(12, Math.max(0, Math.min(255, state.weight)))
  view.setUint8(13, n)
  for (let i = 0; i < n; i++) {
    const p = state.people[i]
    if (!p) continue
    const at = HEAD + EACH * i
    const holding = p.site >= 0
    view.setUint8(at, p.id)
    view.setUint8(at + 1, holding ? 1 : 0)
    view.setInt16(at + 2, holding ? p.site : clampInt(p.x * POS), true)
    view.setInt16(at + 4, holding ? 0 : clampInt(p.y * POS), true)
    view.setInt8(at + 6, clampPull(p.px))
    view.setInt8(at + 7, clampPull(p.py))
  }
  return out
}

export function decodeState(data: Uint8Array): RoomState | null {
  if (data.length < HEAD || data[0] !== S_STATE) return null
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const n = view.getUint8(13)
  if (data.length !== HEAD + EACH * n) return null
  const flags = view.getUint8(1)
  const people: WirePerson[] = []
  for (let i = 0; i < n; i++) {
    const at = HEAD + EACH * i
    const holding = (view.getUint8(at + 1) & 1) === 1
    const a = view.getInt16(at + 2, true)
    const b = view.getInt16(at + 4, true)
    people.push({
      id: view.getUint8(at),
      site: holding ? a : -1,
      x: holding ? 0 : a / POS,
      y: holding ? 0 : b / POS,
      px: view.getInt8(at + 6) / PULL,
      py: view.getInt8(at + 7) / PULL,
    })
  }
  return {
    started: (flags & 1) === 1,
    over: (flags & 2) === 2,
    gates: (flags >> 2) & 7,
    time: view.getUint32(2, true) / 100,
    x: view.getInt16(6, true) / POS,
    y: view.getInt16(8, true) / POS,
    a: view.getInt16(10, true) / ANGLE,
    weight: view.getUint8(12),
    people,
  }
}

const count = z.number().int().min(0)

/** The JSON notices a room sends. */
export const noticeSchema = z.discriminatedUnion('t', [
  /** Sent on joining and again at the start of every round: which person is you. */
  z.object({
    t: z.literal('round'),
    v: z.number().int(),
    you: count,
    round: count,
    capacity: count,
    /** The built-in puzzle this round is played on. */
    puzzle: z.string(),
  }),
  z.object({
    t: z.literal('over'),
    round: count,
    delivered: z.boolean(),
    seconds: z.number().min(0),
    /** People in the room, averaged over the round. */
    people: z.number().min(0),
    /** Milliseconds until the next round. */
    next: count,
    /** The built-in puzzle the next round is played on. */
    then: z.string(),
  }),
  z.object({ t: z.literal('bye'), why: z.enum(['idle', 'busy', 'restart', 'version']) }),
])
export type Notice = z.infer<typeof noticeSchema>

function clampInt(v: number): number {
  return Math.max(-32768, Math.min(32767, Math.round(v)))
}

function clampPull(v: number): number {
  return Math.max(-PULL, Math.min(PULL, Math.round(v * PULL)))
}
