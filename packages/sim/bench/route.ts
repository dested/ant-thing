// Is a puzzle solvable at all, and what does the shortest solution look like?
//   bun bench/route.ts --puzzle piano-movers [--out /w/junk/ant-thing/snaps/route.png]
import { Resvg } from '@resvg/resvg-js'
import { buildShape, findRoute, NEST_R, segmentPoly, WALL_T } from '../src/index'
import { parseArgs } from './args'

const args = parseArgs(process.argv.slice(2))
const t0 = performance.now()
const route = findRoute(
  args.puzzle,
  Number(args.values.get('step') ?? 4),
  Number(args.values.get('turns') ?? 120),
  40_000_000
)
const poses = route.path.length / 3
console.log(
  `${args.puzzleId}: ${route.solvable ? 'solvable' : 'NOT solvable'}  poses=${poses} explored=${route.explored} [${((performance.now() - t0) / 1000).toFixed(1)}s]`
)
const out = args.values.get('out')
if (out && route.solvable) {
  const p = args.puzzle
  const shape = buildShape(p.load.cells, p.load.cell)
  const parts: string[] = [`<rect width="${p.w}" height="${p.h}" fill="#f1f0ea"/>`]
  for (const [x1, y1, x2, y2] of p.walls) {
    const poly = segmentPoly(x1, y1, x2, y2, WALL_T)
    parts.push(
      `<polygon points="${poly.pts.map((q) => `${q.x},${q.y}`).join(' ')}" fill="#9aa0a6"/>`
    )
  }
  parts.push(
    `<circle cx="${p.nest.x}" cy="${p.nest.y}" r="${NEST_R}" fill="none" stroke="#333" stroke-width="2"/>`
  )
  const every = Math.max(1, Math.floor(poses / 40))
  for (let n = 0; n < poses; n += every) {
    const x = route.path[n * 3] ?? 0
    const y = route.path[n * 3 + 1] ?? 0
    const a = ((route.path[n * 3 + 2] ?? 0) * 180) / Math.PI
    const hue = Math.round((n / poses) * 280)
    const rects = shape.rects
      .map((r) => `<rect x="${r.x0}" y="${r.y0}" width="${r.x1 - r.x0}" height="${r.y1 - r.y0}"/>`)
      .join('')
    parts.push(
      `<g transform="translate(${x},${y}) rotate(${a})" fill="hsl(${hue},70%,50%)" opacity="0.22" stroke="hsl(${hue},70%,35%)" stroke-width="1">${rects}</g>`
    )
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${p.w}" height="${p.h}">${parts.join('')}</svg>`
  await Bun.write(out, new Resvg(svg, { fitTo: { mode: 'zoom', value: 1.4 } }).render().asPng())
  console.log(`→ ${out}`)
}
