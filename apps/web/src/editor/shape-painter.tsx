import { LIMITS } from '@app/sim'
import { colors } from '@app/tokens'
import { useEffect, useRef } from 'react'

type Cells = [number, number][]

const N = LIMITS.grid

/** The load's shape on a grid: drag to fill cells, start on a filled cell to erase. */
export function ShapePainter({
  cells,
  onChange,
}: {
  cells: readonly (readonly [number, number])[]
  onChange: (cells: Cells, stroke: string) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const live = useRef({ cells, onChange })
  const stroke = useRef(0)

  useEffect(() => {
    live.current = { cells, onChange }
  })

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const px = canvas.width / N
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = colors.card
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = colors.load
    for (const [x, y] of cells) ctx.fillRect(x * px, y * px, px, px)
    ctx.strokeStyle = 'rgba(20,24,20,0.1)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let i = 1; i < N; i++) {
      ctx.moveTo(Math.round(i * px) + 0.5, 0)
      ctx.lineTo(Math.round(i * px) + 0.5, canvas.height)
      ctx.moveTo(0, Math.round(i * px) + 0.5)
      ctx.lineTo(canvas.width, Math.round(i * px) + 0.5)
    }
    ctx.stroke()
  }, [cells])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let filling: boolean | null = null
    const cellAt = (e: PointerEvent): [number, number] | null => {
      const rect = canvas.getBoundingClientRect()
      const x = Math.floor(((e.clientX - rect.left) / rect.width) * N)
      const y = Math.floor(((e.clientY - rect.top) / rect.height) * N)
      return x >= 0 && y >= 0 && x < N && y < N ? [x, y] : null
    }
    const paint = (e: PointerEvent): void => {
      const cell = cellAt(e)
      if (!cell || filling === null) return
      const now = live.current.cells
      const has = now.some(([x, y]) => x === cell[0] && y === cell[1])
      if (filling === has) return
      if (!filling && now.length <= 1) return
      if (filling && now.length >= LIMITS.maxCells) return
      const next: Cells = filling
        ? [...now.map(([x, y]): [number, number] => [x, y]), cell]
        : now
            .filter(([x, y]) => x !== cell[0] || y !== cell[1])
            .map(([x, y]): [number, number] => [x, y])
      live.current.onChange(next, `shape${stroke.current}`)
    }
    const down = (e: PointerEvent): void => {
      const cell = cellAt(e)
      if (!cell) return
      canvas.setPointerCapture(e.pointerId)
      stroke.current++
      filling = !live.current.cells.some(([x, y]) => x === cell[0] && y === cell[1])
      paint(e)
    }
    const up = (): void => {
      filling = null
    }
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', paint)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', up)
    return () => {
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', paint)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', up)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      width={N * 14}
      height={N * 14}
      className="aspect-square w-full cursor-crosshair rounded-sm border border-input"
      style={{ touchAction: 'none' }}
      aria-label="The load's shape: drag to fill cells, drag from a filled cell to erase"
    />
  )
}
