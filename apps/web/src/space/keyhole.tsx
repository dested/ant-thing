import { colors } from '@app/tokens'
import { useEffect, useRef } from 'react'
import type { Session } from '~/sim/session'
import type { Space } from './use-space'

const WIDTH = 264
const HEIGHT = 150

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

/** The reachable poses as a picture: one pixel per lattice column and turn step. */
function chart(space: Space): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = space.cols
  canvas.height = space.rows
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  const image = ctx.createImageData(space.cols, space.rows)
  const shut = rgb(colors.accent)
  const open = rgb(colors.popover)
  const goal = rgb(colors.success)
  for (let k = 0; k < space.rows; k++) {
    for (let i = 0; i < space.cols; i++) {
      const at = k * space.cols + i
      const c = space.goal[at] === 1 ? goal : space.open[at] === 1 ? open : shut
      // Angle zero sits at the bottom, so the picture reads like a graph.
      const px = ((space.rows - 1 - k) * space.cols + i) * 4
      image.data[px] = c[0]
      image.data[px + 1] = c[1]
      image.data[px + 2] = c[2]
      image.data[px + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

/**
 * The puzzle as the planner sees it: how far across the load is against which way it is turned.
 * Pale is every pose it can reach, the narrow necks are the slits, and the red line is where this
 * colony has actually taken it.
 */
export function Keyhole({ session, space }: { session: Session; space: Space | null }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !space) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = WIDTH * dpr
    canvas.height = HEIGHT * dpr
    const base = chart(space)
    const span = (space.cols - 1) * space.step
    const sx = (x: number): number => (x / span) * WIDTH
    const turn = (a: number): number => {
      const t = a / (Math.PI * 2)
      return t - Math.floor(t)
    }
    const sy = (a: number): number => HEIGHT - turn(a) * HEIGHT

    const line = (pts: readonly number[], from: number): void => {
      ctx.beginPath()
      let last = -1
      for (let i = from; i + 2 < pts.length; i += 3) {
        const x = sx(pts[i] ?? 0)
        const y = sy(pts[i + 2] ?? 0)
        // A turn past zero comes back in at the other edge: lift the pen instead of crossing the map.
        if (last < 0 || Math.abs(y - last) > HEIGHT / 2) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
        last = y
      }
      ctx.stroke()
    }

    let raf = 0
    let tick = 0
    const frame = (): void => {
      raf = requestAnimationFrame(frame)
      if (tick++ % 4 !== 0) return
      const world = session.world
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(base, 0, 0, WIDTH, HEIGHT)
      ctx.lineJoin = 'round'
      ctx.strokeStyle = colors.foreground
      ctx.globalAlpha = 0.55
      ctx.lineWidth = 1
      ctx.setLineDash([3, 3])
      line(space.path, 0)
      ctx.setLineDash([])
      ctx.globalAlpha = 0.85
      ctx.strokeStyle = colors.load
      ctx.lineWidth = 1.2
      line(world.trace, 0)
      ctx.globalAlpha = 1
      ctx.fillStyle = colors.load
      ctx.strokeStyle = colors.popover
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(sx(world.x), sy(world.a), 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [session, space])

  return (
    <div className="absolute right-3 bottom-3 rounded-md border border-input bg-popover p-2 pb-1">
      <div className="flex items-stretch gap-1.5">
        <span className="rotate-180 text-center text-[11px] leading-none text-muted-foreground [writing-mode:vertical-rl]">
          Turned
        </span>
        {space ? (
          <canvas
            ref={ref}
            style={{ width: WIDTH, height: HEIGHT }}
            aria-label="Every pose the load can reach: how far across against how it is turned, with this colony's path"
          />
        ) : (
          <p
            style={{ width: WIDTH, height: HEIGHT }}
            className="flex items-center justify-center text-sm text-muted-foreground">
            Mapping every pose
          </p>
        )}
      </div>
      <p className="mt-1 pl-4 text-center text-[11px] leading-none text-muted-foreground">Across</p>
    </div>
  )
}
