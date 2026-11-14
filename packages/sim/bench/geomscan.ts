// Dev scan: which T / slit proportions are solvable? bun bench/geomscan.ts
import { findRoute, type Puzzle } from '../src/index'

function bar(x0: number, y0: number, w: number, h: number): [number, number][] {
  const out: [number, number][] = []
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) out.push([x, y])
  return out
}
function make(slit: number, big: number, stem: number, small: number, mid: number): Puzzle {
  const g0 = 350 - slit / 2
  const g1 = 350 + slit / 2
  const x1 = 490
  const x2 = x1 + mid + 14
  const cy = Math.floor(big / 2) - 1
  const cells = [...bar(0, 0, 2, big), ...bar(2, cy, stem, 2), ...bar(2 + stem, cy - (small - 2) / 2, 2, small)]
  return {
    v: 1,
    w: 1040,
    h: 700,
    walls: [
      [x1, 0, x1, g0],
      [x1, g1, x1, 700],
      [x2, 0, x2, g0],
      [x2, g1, x2, 700],
    ],
    load: { cell: 14, cells, x: 250, y: 250, a: 0 },
    nest: { x: 1022, y: 350 },
    ants: 100,
  }
}
const cases: [number, number, number, number, number][] = [
  [126, 12, 18, 6, 206],
  [140, 12, 18, 6, 206],
  [154, 12, 18, 6, 206],
  [168, 12, 18, 6, 206],
  [140, 12, 14, 6, 206],
  [154, 12, 14, 6, 206],
  [140, 12, 18, 6, 240],
  [154, 12, 18, 6, 240],
  [140, 10, 18, 6, 206],
  [126, 10, 18, 6, 206],
]
for (const [slit, big, stem, small, mid] of cases) {
  const t0 = performance.now()
  const r = findRoute(make(slit, big, stem, small, mid), 4, 120, 40_000_000)
  console.log(`slit=${slit} big=${big * 14} stem=${stem * 14} small=${small * 14} mid=${mid}: ${r.solvable ? 'SOLVABLE' : 'no'} poses=${r.path.length / 3} explored=${r.explored} [${((performance.now() - t0) / 1000).toFixed(1)}s]`)
}
