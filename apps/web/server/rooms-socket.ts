// The socket side of rooms: accepts WebSocket upgrades on ROOM_PATH, hands each browser to
// rooms.ts as a Line, runs the one clock that ticks every room, and writes finished rounds down.
import type { IncomingMessage } from 'node:http'
import { WebSocketServer, type RawData } from 'ws'
import { ROOM_PATH, WIRE_VERSION, type Notice } from '@app/sim'
import { formatError, log } from './logger'
import { prisma } from './prisma'
import { Rooms, TICKS_PER_SECOND, type Line, type Result } from './rooms'
import { onUpgrade } from './upgrades'
import { whoIs } from './who'

/** Everyone at once. Past this a newcomer is told the rooms are full rather than slowing them all down. */
const MAX_PEOPLE = 3000
/** Phones on one carrier share an address, so this is generous: it only stops one machine opening thousands. */
const MAX_PER_CALLER = 200

let changed: (() => void) | null = null

/** Called whenever a round is written down (the stats cache listens). */
export function onCarry(listener: () => void): void {
  changed = listener
}

function keep(result: Result): void {
  prisma.carry
    .create({
      data: {
        puzzleId: result.puzzle,
        outcome: result.outcome,
        seconds: result.seconds,
        people: result.people,
        peak: result.peak,
        gates: result.gates,
      },
    })
    .then(() => changed?.())
    .catch((e: unknown) => log.error(`[rooms] could not save a round: ${formatError(e)}`))
}

export const rooms = new Rooms(keep)

const perCaller = new Map<string, number>()

/** The visitor's address. One proxy sits in front in production, and the last forwarded entry is the one it wrote. */
function callerIp(req: IncomingMessage): string {
  const raw = req.headers['x-forwarded-for']
  const forwarded = (Array.isArray(raw) ? raw.join(',') : (raw ?? ''))
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  return forwarded.at(-1) ?? req.socket.remoteAddress ?? ''
}

function bytes(data: RawData): Uint8Array {
  if (Array.isArray(data)) return Buffer.concat(data)
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  return data
}

/** Start serving rooms. Returns the function that stops them (a deploy). */
export function startRooms(): () => void {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64, perMessageDeflate: false })
  let timer: ReturnType<typeof setInterval> | null = null
  let last = performance.now()

  const tick = (): void => {
    const now = performance.now()
    const elapsed = Math.min(0.25, (now - last) / 1000)
    last = now
    try {
      rooms.tick(Date.now(), elapsed)
    } catch (e) {
      log.error(`[rooms] tick failed: ${formatError(e)}`)
    }
    if (rooms.people === 0 && timer) {
      clearInterval(timer)
      timer = null
    }
  }

  onUpgrade(ROOM_PATH, (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, (ws) => {
      const turnAway = (why: Extract<Notice, { t: 'bye' }>['why']): void => {
        const notice: Notice = { t: 'bye', why }
        ws.send(JSON.stringify(notice))
        ws.close()
      }
      const url = new URL(req.url ?? '/', 'http://localhost')
      if (url.searchParams.get('v') !== String(WIRE_VERSION)) return turnAway('version')
      const who = whoIs(callerIp(req))
      const mine = perCaller.get(who) ?? 0
      if (rooms.people >= MAX_PEOPLE || mine >= MAX_PER_CALLER) return turnAway('busy')
      perCaller.set(who, mine + 1)

      const line: Line = {
        send(data) {
          if (ws.readyState === ws.OPEN) ws.send(data)
        },
        close() {
          ws.close()
        },
        backlog() {
          return ws.bufferedAmount
        },
      }
      let gone = false
      const leave = (): void => {
        if (gone) return
        gone = true
        rooms.leave(line)
        const left = (perCaller.get(who) ?? 1) - 1
        if (left > 0) perCaller.set(who, left)
        else perCaller.delete(who)
      }
      ws.on('message', (data, isBinary) => {
        if (isBinary) rooms.hear(line, bytes(data), Date.now())
      })
      ws.on('close', leave)
      ws.on('error', leave)

      rooms.join(line, Date.now())
      if (!timer) {
        last = performance.now()
        timer = setInterval(tick, 1000 / TICKS_PER_SECOND)
      }
    })
  })

  return () => {
    if (timer) clearInterval(timer)
    timer = null
    rooms.close()
    for (const client of wss.clients) client.terminate()
    wss.close()
  }
}
