// Contact sheet of one run, for eyeballing behaviour without a browser.
//   bun bench/snap.ts --puzzle piano-movers --seed 3 --max 240 --every 10 --out /w/junk/ant-thing/snaps/a.png
import { Resvg } from '@resvg/resvg-js'
import { CARRY, DT, LIFTER, NEST, NEST_R, PULLER, UNKNOWN, World } from '../src/index'
import { parseArgs } from './args'

const args = parseArgs(process.argv.slice(2))
const every = Number(args.values.get('every') ?? 10)
const out = args.values.get('out') ?? '/w/junk/ant-thing/snaps/snap.png'
const cols = Number(args.values.get('cols') ?? 4)
const scent = args.values.get('scent')
const start = Number(args.values.get('start') ?? 0)

const world = new World(args.puzzle, args.seed, args.params)
world.prewarm(args.prewarm)

const W = args.puzzle.w
const H = args.puzzle.h
const frames: string[] = []

function frame(): string {
  const parts: string[] = []
  parts.push(`<rect width="${W}" height="${H}" fill="#f1f0ea"/>`)
  if (scent === 'home' || scent === 'food') {
    const f = world.fields
    const grid = scent === 'home' ? f.home : f.food
    for (let j = 0; j < f.gh; j++) {
      for (let i = 0; i < f.gw; i++) {
        const v = grid[j * f.gw + i] ?? UNKNOWN
        if (v >= UNKNOWN) continue
        const o = Math.max(0.05, Math.exp(-v / 20)).toFixed(2)
        parts.push(`<rect x="${i * f.gres}" y="${j * f.gres}" width="${f.gres}" height="${f.gres}" fill="${scent === 'home' ? '#2a6fdb' : '#1f9d55'}" opacity="${o}"/>`)
      }
    }
  }
  for (const wall of world.walls) {
    parts.push(`<polygon points="${wall.pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}" fill="#9aa0a6"/>`)
  }
  const nest = args.puzzle.nest
  parts.push(`<circle cx="${nest.x}" cy="${nest.y}" r="${NEST_R}" fill="none" stroke="#333" stroke-width="2"/>`)
  if (world.trace.length >= 6) {
    const pts: string[] = []
    for (let i = 0; i < world.trace.length; i += 3) pts.push(`${(world.trace[i] ?? 0).toFixed(0)},${(world.trace[i + 1] ?? 0).toFixed(0)}`)
    parts.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="#c0392b" stroke-width="1.5" opacity="0.5"/>`)
  }
  for (const piece of world.pieces) {
    parts.push(`<polygon points="${piece.pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}" fill="#d9534f" opacity="0.85"/>`)
  }
  for (const ant of world.ants) {
    if (ant.state === NEST) continue
    const hx = Math.cos(ant.h) * 5
    const hy = Math.sin(ant.h) * 5
    let color = '#222'
    if (ant.state === CARRY) color = ant.informed > 0 ? '#ff8c00' : ant.role === PULLER ? '#111' : ant.role === LIFTER ? '#2a6fdb' : '#111'
    else color = ant.state === 1 ? '#555' : '#333'
    const wdt = ant.state === CARRY ? 3 : 2
    parts.push(`<line x1="${(ant.x - hx).toFixed(1)}" y1="${(ant.y - hy).toFixed(1)}" x2="${(ant.x + hx).toFixed(1)}" y2="${(ant.y + hy).toFixed(1)}" stroke="${color}" stroke-width="${wdt}" stroke-linecap="round"/>`)
  }
  const s = world.stats
  parts.push(`<text x="10" y="24" font-family="monospace" font-size="20" fill="#000">t=${world.time.toFixed(0)}s carry=${s.carriers} pull=${s.pullers} inf=${s.informed} out=${s.out}${world.delivered ? ' DELIVERED ' + world.deliveredAt.toFixed(0) : ''}</text>`)
  return parts.join('')
}

const steps = Math.round(args.max / DT)
const gap = Math.round(every / DT)
if (start <= 0) frames.push(frame())
for (let i = 1; i <= steps; i++) {
  world.step()
  if (i % gap === 0 && world.time >= start) frames.push(frame())
  if (world.delivered) {
    frames.push(frame())
    break
  }
}

const rows = Math.ceil(frames.length / cols)
const pad = 8
const svg = [
  `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * (W + pad)}" height="${rows * (H + pad)}">`,
  `<rect width="100%" height="100%" fill="#fff"/>`,
  ...frames.map((body, i) => `<g transform="translate(${(i % cols) * (W + pad)},${Math.floor(i / cols) * (H + pad)})">${body}</g>`),
  '</svg>',
].join('')
const scale = Number(args.values.get('scale') ?? 0.5)
const png = new Resvg(svg, { fitTo: { mode: 'zoom', value: scale }, font: { loadSystemFonts: true } }).render().asPng()
await Bun.write(out, png)
console.log(`${frames.length} frames → ${out}  delivered=${world.delivered ? world.deliveredAt.toFixed(1) : 'no'}`)
