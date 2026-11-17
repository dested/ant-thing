// A crowd of stand-ins for trying a room on this machine: `bun server/crowd.ts --help`.
// Each one joins a room, pulls roughly toward the nest and grabs again when a wall scrapes it off.
// It only ever talks to localhost, so stand-ins can never end up in the real record.
import {
  decodeState,
  encodeClient,
  Fields,
  noticeSchema,
  PERSON_SPEED,
  requirePreset,
  ROOM_PATH,
  ROOM_RATE,
  walkTo,
  WIRE_VERSION,
  World,
} from '@app/sim'

const HELP = `bun server/crowd.ts [--people 12] [--seconds 60] [--port 7268] [--skill 0.6]

  --people   how many stand-ins join (default 12)
  --seconds  how long they stay (default 60)
  --port     the local server's port (default 7268)
  --skill    0 pulls any which way, 1 pulls straight at the nest (default 0.6)

Exits 0 when the time is up, 1 when a stand-in could not connect.`

function flag(name: string, fallback: number): number {
  const at = process.argv.indexOf(`--${name}`)
  const raw = at >= 0 ? process.argv[at + 1] : undefined
  const value = raw === undefined ? fallback : Number(raw)
  if (!Number.isFinite(value)) {
    console.error(`--${name} needs a number.\n\n${HELP}`)
    process.exit(2)
  }
  return value
}

if (process.argv.includes('--help')) {
  console.log(HELP)
  process.exit(0)
}

const people = flag('people', 12)
const seconds = flag('seconds', 60)
const port = flag('port', 7268)
const skill = Math.max(0, Math.min(1, flag('skill', 0.6)))

let failed = false
const joined = new Set<number>()
let frames = 0

function standIn(index: number): void {
  const ws = new WebSocket(`ws://localhost:${port}${ROOM_PATH}?v=${WIRE_VERSION}`)
  ws.binaryType = 'arraybuffer'
  // Only for turning a pose into grip points; nothing here is simulated.
  let puzzle = { ...requirePreset('doorway').puzzle, ants: 0 }
  let fields = new Fields(puzzle.w, puzzle.h, puzzle.walls)
  let world = new World(puzzle, 1)
  let you = -1
  let mood = Math.random() * Math.PI * 2
  const me = { x: 0, y: 0 }
  let free = false
  let last = performance.now()

  ws.onerror = () => {
    failed = true
    console.error(`stand-in ${index} could not connect to localhost:${port}`)
  }
  ws.onmessage = (e) => {
    if (typeof e.data === 'string') {
      const notice = noticeSchema.parse(JSON.parse(e.data))
      if (notice.t === 'round') {
        joined.add(index)
        you = notice.you
        puzzle = { ...requirePreset(notice.puzzle).puzzle, ants: 0 }
        fields = new Fields(puzzle.w, puzzle.h, puzzle.walls)
        world = new World(puzzle, 1)
      }
      if (notice.t === 'over' && index === 0) {
        console.log(
          `round ${notice.round}: ${notice.delivered ? 'delivered' : 'called off'} at ${notice.seconds.toFixed(1)} s, ${notice.people.toFixed(1)} people`
        )
      }
      return
    }
    if (!(e.data instanceof ArrayBuffer)) return
    frames++
    const state = decodeState(new Uint8Array(e.data))
    const mine = state?.people.find((p) => p.id === you)
    if (!state || !mine) return
    const now = performance.now()
    const elapsed = Math.min(0.2, (now - last) / 1000)
    last = now
    mood += (Math.random() - 0.5) * 0.6
    if (mine.site >= 0) {
      free = false
      world.pose(state.x, state.y, state.a)
      const st = world.sites[mine.site]
      if (!st) return
      const home = Math.atan2(puzzle.nest.y - st.y, puzzle.nest.x - st.x)
      const dir = home + (1 - skill) * Math.sin(mood) * Math.PI
      ws.send(encodeClient({ op: 'pull', px: Math.cos(dir), py: Math.sin(dir) }))
      return
    }
    // Scraped off: walk back to the load and take hold again.
    if (!free) {
      free = true
      me.x = mine.x
      me.y = mine.y
    }
    const far = Math.hypot(state.x - me.x, state.y - me.y)
    const step = Math.min(far, PERSON_SPEED * ROOM_RATE * elapsed)
    if (far > 1)
      walkTo(
        fields,
        me,
        me.x + ((state.x - me.x) / far) * step,
        me.y + ((state.y - me.y) / far) * step
      )
    ws.send(encodeClient({ op: 'move', x: me.x, y: me.y }))
    if (Math.random() < 0.15) ws.send(encodeClient({ op: 'grab' }))
  }
  setTimeout(() => ws.close(), seconds * 1000)
}

for (let i = 0; i < people; i++) setTimeout(() => standIn(i), i * 150)
setTimeout(
  () => {
    // One line a script can read: exit 1 unless every stand-in got into a room.
    console.log(JSON.stringify({ people, joined: joined.size, frames }))
    process.exit(failed || joined.size < people ? 1 : 0)
  },
  seconds * 1000 + people * 150 + 500
)
