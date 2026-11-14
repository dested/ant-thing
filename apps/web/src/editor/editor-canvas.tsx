import { buildShape, LIMITS, NEST_R, segmentPoly, WALL_T, type Puzzle, type Shape, type Wall } from '@app/sim'
import { colors } from '@app/tokens'
import { useEffect, useMemo, useRef, useState } from 'react'
import { fitZoom, Renderer } from '~/sim/renderer'

export type Tool = 'wall' | 'peg' | 'erase'

type Grab =
  | { kind: 'new'; index: number }
  | { kind: 'end'; index: number; end: 0 | 1 }
  | { kind: 'wall'; index: number; px: number; py: number; orig: Wall }
  | { kind: 'load'; dx: number; dy: number }
  | { kind: 'turn' }
  | { kind: 'nest'; dx: number; dy: number }
  | { kind: 'erase' }

interface Size {
  w: number
  h: number
  dpr: number
}

const GRID = 10
const snap = (v: number): number => Math.round(v / GRID) * GRID
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

function zoomFor(puzzle: Puzzle, size: Size): number {
  return fitZoom(puzzle, size.w, size.h) * 0.93
}

function wallAt(puzzle: Puzzle, x: number, y: number, tol: number): number {
  let best = WALL_T / 2 + tol
  let pick = -1
  puzzle.walls.forEach(([x1, y1, x2, y2], i) => {
    const dx = x2 - x1
    const dy = y2 - y1
    const len2 = dx * dx + dy * dy
    const t = len2 < 1e-9 ? 0 : clamp(((x - x1) * dx + (y - y1) * dy) / len2, 0, 1)
    const d = Math.hypot(x - (x1 + dx * t), y - (y1 + dy * t))
    if (d < best) {
      best = d
      pick = i
    }
  })
  return pick
}

function inLoad(puzzle: Puzzle, shape: Shape, x: number, y: number): boolean {
  const c = Math.cos(puzzle.load.a)
  const s = Math.sin(puzzle.load.a)
  const dx = x - puzzle.load.x
  const dy = y - puzzle.load.y
  const bx = c * dx + s * dy
  const by = -s * dx + c * dy
  return shape.rects.some(r => bx >= r.x0 - 3 && bx <= r.x1 + 3 && by >= r.y0 - 3 && by <= r.y1 + 3)
}

/**
 * The editor's arena. Drag on open floor to draw a wall; drag a wall, its ends, the load, the
 * load's turning knob or the nest to move them. Every change goes up through `onEdit` with a
 * stroke number, so one drag is one undo step.
 */
export function EditorCanvas({
  puzzle,
  tool,
  path,
  onEdit,
  className,
}: {
  puzzle: Puzzle
  tool: Tool
  /** The planner's route to draw faintly, or null. */
  path: number[] | null
  onEdit: (next: Puzzle, stroke: string) => void
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [selected, setSelected] = useState(-1)
  const [size, setSize] = useState<Size>({ w: 1, h: 1, dpr: 1 })
  const shape = useMemo(
    () => buildShape(puzzle.load.cells, puzzle.load.cell),
    [puzzle.load.cells, puzzle.load.cell]
  )
  const live = useRef({ puzzle, shape, tool, selected, size, onEdit })
  const grab = useRef<Grab | null>(null)
  const stroke = useRef(0)
  const renderer = useRef<Renderer | null>(null)

  useEffect(() => {
    live.current = { puzzle, shape, tool, selected, size, onEdit }
  })

  // Draw.
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    renderer.current ??= new Renderer()
    const zoom = zoomFor(puzzle, size)
    const cam = { x: puzzle.w / 2, y: puzzle.h / 2, zoom }
    renderer.current.still(ctx, puzzle, shape, cam, size.w, size.h, size.dpr)

    if (path && path.length >= 3) {
      ctx.fillStyle = `${colors.lifter}14`
      for (let i = 0; i < path.length; i += 3) {
        ctx.save()
        ctx.translate(path[i] ?? 0, path[i + 1] ?? 0)
        ctx.rotate(path[i + 2] ?? 0)
        ctx.beginPath()
        for (const r of shape.rects) ctx.rect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0)
        ctx.fill()
        ctx.restore()
      }
    }

    const knob = (x: number, y: number): void => {
      ctx.beginPath()
      ctx.arc(x, y, 6 / zoom, 0, Math.PI * 2)
      ctx.fillStyle = colors.popover
      ctx.fill()
      ctx.strokeStyle = colors.foreground
      ctx.lineWidth = 1.6 / zoom
      ctx.stroke()
    }

    const wall = puzzle.walls[selected]
    if (wall) {
      const [x1, y1, x2, y2] = wall
      const poly = segmentPoly(x1, y1, x2, y2, WALL_T)
      ctx.beginPath()
      poly.pts.forEach((v, k) => (k === 0 ? ctx.moveTo(v.x, v.y) : ctx.lineTo(v.x, v.y)))
      ctx.closePath()
      ctx.strokeStyle = colors.foreground
      ctx.lineWidth = 1.6 / zoom
      ctx.stroke()
      knob(x1, y1)
      if (x1 !== x2 || y1 !== y2) knob(x2, y2)
    }

    // The load's turning knob, on a stalk along its own x axis.
    const reach = shape.radius + 26 / zoom
    const kx = puzzle.load.x + Math.cos(puzzle.load.a) * reach
    const ky = puzzle.load.y + Math.sin(puzzle.load.a) * reach
    ctx.beginPath()
    ctx.moveTo(puzzle.load.x, puzzle.load.y)
    ctx.lineTo(kx, ky)
    ctx.strokeStyle = colors.foreground
    ctx.lineWidth = 1.2 / zoom
    ctx.setLineDash([4 / zoom, 4 / zoom])
    ctx.stroke()
    ctx.setLineDash([])
    knob(kx, ky)
  }, [puzzle, shape, selected, size, path])

  // Size, pointer and keys.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const resize = (): void => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(3, window.devicePixelRatio || 1)
      canvas.width = Math.round(Math.max(1, rect.width) * dpr)
      canvas.height = Math.round(Math.max(1, rect.height) * dpr)
      setSize({ w: Math.max(1, rect.width), h: Math.max(1, rect.height), dpr })
    }
    const sizes = new ResizeObserver(resize)
    sizes.observe(canvas)
    resize()

    const at = (e: PointerEvent): { x: number; y: number; zoom: number } => {
      const rect = canvas.getBoundingClientRect()
      const { puzzle: p, size: s } = live.current
      const zoom = zoomFor(p, s)
      return {
        x: p.w / 2 + (e.clientX - rect.left - s.w / 2) / zoom,
        y: p.h / 2 + (e.clientY - rect.top - s.h / 2) / zoom,
        zoom,
      }
    }
    const edit = (next: Puzzle): void => live.current.onEdit(next, `drag${stroke.current}`)
    const withoutWall = (p: Puzzle, index: number): Puzzle => ({ ...p, walls: p.walls.filter((_, i) => i !== index) })
    const withWall = (p: Puzzle, index: number, wall: Wall): Puzzle => ({
      ...p,
      walls: p.walls.map((w, i) => (i === index ? wall : w)),
    })

    const down = (e: PointerEvent): void => {
      const { puzzle: p, shape: sh, tool: t, selected: sel } = live.current
      const pt = at(e)
      const tol = 11 / pt.zoom
      canvas.setPointerCapture(e.pointerId)
      stroke.current++
      const chosen = p.walls[sel]
      if (t === 'wall' && chosen) {
        for (const end of [0, 1] as const) {
          const ex = end === 0 ? chosen[0] : chosen[2]
          const ey = end === 0 ? chosen[1] : chosen[3]
          if (Math.hypot(pt.x - ex, pt.y - ey) < tol * 1.2) {
            grab.current = { kind: 'end', index: sel, end }
            return
          }
        }
      }
      const reach = sh.radius + 26 / pt.zoom
      const kx = p.load.x + Math.cos(p.load.a) * reach
      const ky = p.load.y + Math.sin(p.load.a) * reach
      if (Math.hypot(pt.x - kx, pt.y - ky) < tol * 1.3) {
        grab.current = { kind: 'turn' }
        return
      }
      if (inLoad(p, sh, pt.x, pt.y)) {
        grab.current = { kind: 'load', dx: pt.x - p.load.x, dy: pt.y - p.load.y }
        setSelected(-1)
        return
      }
      if (Math.hypot(pt.x - p.nest.x, pt.y - p.nest.y) < Math.max(NEST_R * 0.7, tol)) {
        grab.current = { kind: 'nest', dx: pt.x - p.nest.x, dy: pt.y - p.nest.y }
        setSelected(-1)
        return
      }
      const hit = wallAt(p, pt.x, pt.y, 4 / pt.zoom)
      if (t === 'erase') {
        grab.current = { kind: 'erase' }
        setSelected(-1)
        if (hit >= 0) edit(withoutWall(p, hit))
        return
      }
      if (t === 'peg') {
        if (hit < 0 && p.walls.length < LIMITS.maxWalls) {
          const x = clamp(snap(pt.x), 0, p.w)
          const y = clamp(snap(pt.y), 0, p.h)
          edit({ ...p, walls: [...p.walls, [x, y, x, y]] })
          setSelected(p.walls.length)
        }
        return
      }
      if (hit >= 0) {
        const orig = p.walls[hit]
        if (!orig) return
        setSelected(hit)
        grab.current = { kind: 'wall', index: hit, px: pt.x, py: pt.y, orig }
        return
      }
      if (p.walls.length >= LIMITS.maxWalls) return
      const x0 = clamp(snap(pt.x), 0, p.w)
      const y0 = clamp(snap(pt.y), 0, p.h)
      edit({ ...p, walls: [...p.walls, [x0, y0, x0, y0]] })
      setSelected(p.walls.length)
      grab.current = { kind: 'new', index: p.walls.length }
    }

    const move = (e: PointerEvent): void => {
      const g = grab.current
      if (!g) return
      const { puzzle: p } = live.current
      const pt = at(e)
      if (g.kind === 'new' || g.kind === 'end') {
        const wall = p.walls[g.index]
        if (!wall) return
        const moving = g.kind === 'new' ? 1 : g.end
        const ox = moving === 1 ? wall[0] : wall[2]
        const oy = moving === 1 ? wall[1] : wall[3]
        let x = clamp(snap(pt.x), 0, p.w)
        let y = clamp(snap(pt.y), 0, p.h)
        // A wall that is nearly level or nearly upright snaps the rest of the way.
        if (Math.abs(x - ox) <= GRID && Math.abs(y - oy) > GRID * 2) x = ox
        if (Math.abs(y - oy) <= GRID && Math.abs(x - ox) > GRID * 2) y = oy
        edit(withWall(p, g.index, moving === 1 ? [ox, oy, x, y] : [x, y, ox, oy]))
      } else if (g.kind === 'wall') {
        const [x1, y1, x2, y2] = g.orig
        const dx = clamp(snap(pt.x - g.px), -Math.min(x1, x2), p.w - Math.max(x1, x2))
        const dy = clamp(snap(pt.y - g.py), -Math.min(y1, y2), p.h - Math.max(y1, y2))
        edit(withWall(p, g.index, [x1 + dx, y1 + dy, x2 + dx, y2 + dy]))
      } else if (g.kind === 'load') {
        edit({
          ...p,
          load: { ...p.load, x: clamp(Math.round(pt.x - g.dx), 0, p.w), y: clamp(Math.round(pt.y - g.dy), 0, p.h) },
        })
      } else if (g.kind === 'turn') {
        let a = Math.atan2(pt.y - p.load.y, pt.x - p.load.x)
        if (!e.altKey) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12)
        edit({ ...p, load: { ...p.load, a: Math.round(a * 10000) / 10000 } })
      } else if (g.kind === 'nest') {
        edit({
          ...p,
          nest: { x: clamp(Math.round(pt.x - g.dx), 16, p.w - 16), y: clamp(Math.round(pt.y - g.dy), 16, p.h - 16) },
        })
      } else {
        const hit = wallAt(p, pt.x, pt.y, 4 / pt.zoom)
        if (hit >= 0) edit(withoutWall(p, hit))
      }
    }

    const up = (): void => {
      const g = grab.current
      grab.current = null
      if (g?.kind !== 'new') return
      // A click that never became a drag leaves no wall behind.
      const { puzzle: p } = live.current
      const wall = p.walls[g.index]
      if (wall && wall[0] === wall[2] && wall[1] === wall[3]) {
        edit(withoutWall(p, g.index))
        setSelected(-1)
      }
    }

    const key = (e: KeyboardEvent): void => {
      const target = e.target
      if (target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      const { puzzle: p, selected: sel } = live.current
      if ((e.key === 'Delete' || e.key === 'Backspace') && p.walls[sel]) {
        e.preventDefault()
        stroke.current++
        edit(withoutWall(p, sel))
        setSelected(-1)
      } else if (e.key === 'Escape') {
        setSelected(-1)
      }
    }

    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', up)
    window.addEventListener('keydown', key)
    return () => {
      sizes.disconnect()
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', up)
      window.removeEventListener('keydown', key)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ touchAction: 'none', cursor: tool === 'erase' ? 'not-allowed' : 'crosshair' }}
      aria-label="The arena you are building, seen from above"
    />
  )
}
