import { buildShape, segmentPoly, WALL_T, type Puzzle, type Shape } from '@app/sim'
import { colors } from '@app/tokens'
import { useEffect, useRef } from 'react'
import { clock } from '~/sim/clock'
import type { Colony, Race } from './race'

const GAP = 6

interface Layout {
  cols: number
  cw: number
  ch: number
  ox: number
  oy: number
  scale: number
}

/** The grid with the biggest cells that still fits every colony on the canvas. */
function layout(puzzle: Puzzle, count: number, width: number, height: number): Layout {
  let best: Layout = { cols: 1, cw: 1, ch: 1, ox: 0, oy: 0, scale: 1 }
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols)
    let cw = (width - GAP * (cols + 1)) / cols
    let ch = (cw * puzzle.h) / puzzle.w
    const tall = rows * ch + GAP * (rows + 1)
    if (tall > height) {
      ch = (height - GAP * (rows + 1)) / rows
      cw = (ch * puzzle.w) / puzzle.h
    }
    if (cw > best.cw) {
      best = {
        cols,
        cw,
        ch,
        ox: (width - cols * cw - (cols - 1) * GAP) / 2,
        oy: (height - rows * ch - (rows - 1) * GAP) / 2,
        scale: cw / puzzle.w,
      }
    }
  }
  return best
}

/** The empty arena, drawn once and stamped into every cell. */
function tile(
  puzzle: Puzzle,
  cw: number,
  ch: number,
  scale: number,
  dpr: number
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(cw * dpr))
  canvas.height = Math.max(1, Math.round(ch * dpr))
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  ctx.scale(dpr * scale, dpr * scale)
  ctx.fillStyle = colors.card
  ctx.fillRect(0, 0, puzzle.w, puzzle.h)
  ctx.fillStyle = colors.ant
  ctx.beginPath()
  ctx.arc(puzzle.nest.x, puzzle.nest.y, 16, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = colors.wall
  ctx.strokeStyle = 'rgba(20,24,20,0.5)'
  ctx.lineWidth = 0.8 / scale
  ctx.beginPath()
  for (const [x1, y1, x2, y2] of puzzle.walls) {
    const poly = segmentPoly(x1, y1, x2, y2, WALL_T)
    poly.pts.forEach((v, k) => (k === 0 ? ctx.moveTo(v.x, v.y) : ctx.lineTo(v.x, v.y)))
    ctx.closePath()
  }
  ctx.fill()
  ctx.stroke()
  return canvas
}

function drawColony(
  ctx: CanvasRenderingContext2D,
  colony: Colony,
  shape: Shape,
  scale: number,
  cw: number,
  ch: number,
  hovered: boolean
): void {
  const over = colony.state === 'delivered' || colony.state === 'lost'
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, cw, ch)
  ctx.clip()
  ctx.scale(scale, scale)
  const t = colony.trail
  if (t.length >= 4) {
    ctx.strokeStyle = colors.load
    ctx.globalAlpha = 0.5
    ctx.lineWidth = 1.2 / scale
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(t[0] ?? 0, t[1] ?? 0)
    for (let k = 2; k < t.length; k += 2) ctx.lineTo(t[k] ?? 0, t[k + 1] ?? 0)
    ctx.stroke()
    ctx.globalAlpha = 1
  }
  ctx.translate(colony.x, colony.y)
  ctx.rotate(colony.a)
  ctx.fillStyle = colors.load
  ctx.beginPath()
  for (const r of shape.rects) ctx.rect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0)
  ctx.fill()
  ctx.restore()

  if (colony.state === 'waiting' || colony.state === 'lost') {
    ctx.fillStyle = colors.background
    ctx.globalAlpha = colony.state === 'waiting' ? 0.6 : 0.45
    ctx.fillRect(0, 0, cw, ch)
    ctx.globalAlpha = 1
  }
  if (over || colony.state === 'running') {
    const size = Math.max(10, Math.min(15, ch * 0.17))
    ctx.font = `${over ? 700 : 500} ${size}px "Bricolage Grotesque Variable", system-ui, sans-serif`
    ctx.textBaseline = 'bottom'
    ctx.fillStyle = over ? colors.foreground : colors.mutedForeground
    const label = colony.state === 'lost' ? 'Called off' : clock(colony.time)
    ctx.fillText(label, 5, ch - 3)
  }
  ctx.strokeStyle = hovered
    ? colors.foreground
    : colony.state === 'delivered'
      ? colors.success
      : 'rgba(20,24,20,0.35)'
  ctx.lineWidth = hovered || colony.state === 'delivered' ? 2 : 1
  ctx.strokeRect(0.5, 0.5, cw - 1, ch - 1)
}

/** Every colony of a race in its own small arena: where its load is, where it has been, how it ended. */
export function RaceBoard({
  race,
  onPick,
  className,
}: {
  race: Race
  onPick: (seed: number) => void
  className?: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const puzzle = race.puzzle
    const shape = buildShape(puzzle.load.cells, puzzle.load.cell)
    let width = 1
    let height = 1
    let dpr = 1
    let grid = layout(puzzle, race.colonies.length, width, height)
    let stamp = tile(puzzle, grid.cw, grid.ch, grid.scale, dpr)
    let hover = -1
    let raf = 0

    const resize = (): void => {
      const box = canvas.getBoundingClientRect()
      width = Math.max(1, box.width)
      height = Math.max(1, box.height)
      dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      grid = layout(puzzle, race.colonies.length, width, height)
      stamp = tile(puzzle, grid.cw, grid.ch, grid.scale, dpr)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()

    const at = (e: PointerEvent): number => {
      const box = canvas.getBoundingClientRect()
      const x = e.clientX - box.left - grid.ox
      const y = e.clientY - box.top - grid.oy
      const col = Math.floor(x / (grid.cw + GAP))
      const row = Math.floor(y / (grid.ch + GAP))
      if (col < 0 || col >= grid.cols || row < 0) return -1
      if (x - col * (grid.cw + GAP) > grid.cw || y - row * (grid.ch + GAP) > grid.ch) return -1
      const n = row * grid.cols + col
      return n < race.colonies.length ? n : -1
    }
    const move = (e: PointerEvent): void => {
      hover = at(e)
      canvas.style.cursor = hover >= 0 ? 'pointer' : 'default'
    }
    const leave = (): void => {
      hover = -1
    }
    const click = (e: PointerEvent): void => {
      const colony = race.colonies[at(e)]
      if (colony) onPick(colony.seed)
    }
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerleave', leave)
    canvas.addEventListener('click', click)

    const frame = (): void => {
      raf = requestAnimationFrame(frame)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)
      race.colonies.forEach((colony, n) => {
        const x = grid.ox + (n % grid.cols) * (grid.cw + GAP)
        const y = grid.oy + Math.floor(n / grid.cols) * (grid.ch + GAP)
        ctx.setTransform(dpr, 0, 0, dpr, Math.round(x * dpr), Math.round(y * dpr))
        ctx.drawImage(stamp, 0, 0, grid.cw, grid.ch)
        drawColony(ctx, colony, shape, grid.scale, grid.cw, grid.ch, n === hover)
      })
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerleave', leave)
      canvas.removeEventListener('click', click)
    }
  }, [race, onPick])

  return <canvas ref={ref} aria-label="Every colony in the race" className={className} />
}
