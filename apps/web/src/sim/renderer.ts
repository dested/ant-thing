import { colors } from '@app/tokens'
import { ANT_LEN, CARRY, LIFTER, NEST, NEST_R, UNKNOWN, type Puzzle, type World } from '@app/sim'

export interface Camera {
  /** World point at the centre of the view. */
  x: number
  y: number
  /** Screen pixels per world unit (CSS pixels). */
  zoom: number
}

export interface ViewOptions {
  roles: boolean
  scent: boolean
  trace: boolean
}

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

const INK = rgb(colors.ant)
const LOAD = rgb(colors.load)

/** The zoom that fits the whole arena in a view, with a small margin. */
export function fitZoom(puzzle: Puzzle, width: number, height: number): number {
  return Math.min(width / (puzzle.w + 24), height / (puzzle.h + 24))
}

/**
 * Draws a world the way the overhead camera sees it. Everything is batched by colour:
 * a few hundred ants cost three or four canvas paths per frame.
 */
export class Renderer {
  private scentCanvas: HTMLCanvasElement | null = null
  private scentImage: ImageData | null = null
  private scentAge = 99

  draw(
    ctx: CanvasRenderingContext2D,
    world: World,
    cam: Camera,
    width: number,
    height: number,
    dpr: number,
    view: ViewOptions,
    playerIndex: number
  ): void {
    const p = world.puzzle
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    const z = cam.zoom
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (width / 2 - cam.x * z), dpr * (height / 2 - cam.y * z))

    this.floor(ctx, p)
    if (view.scent) this.scent(ctx, world)
    if (view.trace) this.trace(ctx, world, z)
    this.nest(ctx, p, z)
    this.walls(ctx, p, world)
    this.load(ctx, world)
    this.ants(ctx, world, z, view.roles, playerIndex)
  }

  private floor(ctx: CanvasRenderingContext2D, p: Puzzle): void {
    ctx.fillStyle = colors.card
    ctx.fillRect(0, 0, p.w, p.h)
    // Uneven lab lighting: brighter in the middle, like the footage.
    const g = ctx.createRadialGradient(p.w * 0.45, p.h * 0.4, p.h * 0.1, p.w * 0.5, p.h * 0.5, p.w * 0.75)
    g.addColorStop(0, 'rgba(255,255,255,0.28)')
    g.addColorStop(1, 'rgba(0,0,0,0.07)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, p.w, p.h)
    // The arena's reference dots.
    ctx.fillStyle = 'rgba(20,24,20,0.5)'
    ctx.beginPath()
    for (let y = 37; y < p.h; y += 74) {
      for (let x = 37; x < p.w; x += 74) {
        ctx.moveTo(x + 1.1, y)
        ctx.arc(x, y, 1.1, 0, Math.PI * 2)
      }
    }
    ctx.fill()
  }

  private scent(ctx: CanvasRenderingContext2D, world: World): void {
    const f = world.fields
    if (!this.scentCanvas || this.scentCanvas.width !== f.gw || this.scentCanvas.height !== f.gh) {
      this.scentCanvas = document.createElement('canvas')
      this.scentCanvas.width = f.gw
      this.scentCanvas.height = f.gh
      this.scentImage = null
      this.scentAge = 99
    }
    const sctx = this.scentCanvas.getContext('2d')
    if (!sctx) return
    if (++this.scentAge > 5) {
      this.scentAge = 0
      const img = this.scentImage ?? sctx.createImageData(f.gw, f.gh)
      this.scentImage = img
      const d = img.data
      for (let k = 0; k < f.home.length; k++) {
        const hv = f.home[k] ?? UNKNOWN
        const fv = f.food[k] ?? UNKNOWN
        // Fresh marks are strong. Home marks read as graphite, load marks as the load's red.
        const ha = hv >= UNKNOWN ? 0 : 0.42 * Math.exp(-hv / 28)
        const fa = fv >= UNKNOWN ? 0 : 0.55 * Math.exp(-fv / 14)
        const a = ha + fa - ha * fa
        const o = k * 4
        if (a < 0.004) {
          d[o + 3] = 0
          continue
        }
        const wf = fa / (ha + fa)
        d[o] = INK[0] + (LOAD[0] - INK[0]) * wf
        d[o + 1] = INK[1] + (LOAD[1] - INK[1]) * wf
        d[o + 2] = INK[2] + (LOAD[2] - INK[2]) * wf
        d[o + 3] = Math.min(255, a * 255)
      }
      sctx.putImageData(img, 0, 0)
    }
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(this.scentCanvas, 0, 0, f.gw * f.gres, f.gh * f.gres)
  }

  private trace(ctx: CanvasRenderingContext2D, world: World, z: number): void {
    const t = world.trace
    if (t.length < 6) return
    ctx.strokeStyle = colors.load
    ctx.globalAlpha = 0.55
    ctx.lineWidth = Math.max(1.2, 1.2 / z)
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(t[0] ?? 0, t[1] ?? 0)
    for (let i = 3; i < t.length; i += 3) ctx.lineTo(t[i] ?? 0, t[i + 1] ?? 0)
    ctx.lineTo(world.x, world.y)
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  private nest(ctx: CanvasRenderingContext2D, p: Puzzle, z: number): void {
    const { x, y } = p.nest
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, p.w, p.h)
    ctx.clip()
    ctx.strokeStyle = 'rgba(20,24,20,0.55)'
    ctx.lineWidth = Math.max(1, 1.2 / z)
    ctx.setLineDash([5, 5])
    ctx.beginPath()
    ctx.arc(x, y, NEST_R, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
    const g = ctx.createRadialGradient(x, y, 2, x, y, 13)
    g.addColorStop(0, 'rgba(10,10,8,0.95)')
    g.addColorStop(0.7, 'rgba(30,26,20,0.8)')
    g.addColorStop(1, 'rgba(30,26,20,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, 13, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  private walls(ctx: CanvasRenderingContext2D, p: Puzzle, world: World): void {
    const count = p.walls.length
    if (count > 0) {
      const path = (): void => {
        ctx.beginPath()
        for (let i = 0; i < count; i++) {
          const poly = world.walls[i]
          if (!poly) continue
          poly.pts.forEach((v, k) => (k === 0 ? ctx.moveTo(v.x, v.y) : ctx.lineTo(v.x, v.y)))
          ctx.closePath()
        }
      }
      ctx.save()
      ctx.shadowColor = 'rgba(0,0,0,0.28)'
      ctx.shadowBlur = 7
      ctx.shadowOffsetY = 2.5
      ctx.fillStyle = colors.wall
      path()
      ctx.fill()
      ctx.restore()
      ctx.fillStyle = colors.wall
      path()
      ctx.fill()
      ctx.strokeStyle = 'rgba(20,24,20,0.22)'
      ctx.lineWidth = 0.8
      ctx.stroke()
    }
    ctx.strokeStyle = 'rgba(20,24,20,0.55)'
    ctx.lineWidth = 2
    ctx.strokeRect(0, 0, p.w, p.h)
  }

  private load(ctx: CanvasRenderingContext2D, world: World): void {
    const rects = world.shape.rects
    // The pieces overlap, so anything translucent is filled as one path: the union, painted once.
    const union = (inset: number): void => {
      ctx.beginPath()
      for (const r of rects) ctx.rect(r.x0 + inset, r.y0 + inset, r.x1 - r.x0 - inset * 2, r.y1 - r.y0 - inset * 2)
    }
    ctx.save()
    ctx.translate(world.x + 2.5, world.y + 3.5)
    ctx.rotate(world.a)
    ctx.fillStyle = 'rgba(0,0,0,0.2)'
    union(0)
    ctx.fill()
    ctx.restore()

    ctx.save()
    ctx.translate(world.x, world.y)
    ctx.rotate(world.a)
    // Stroke every piece, then fill every piece: the fills hide the inner strokes, leaving one outline.
    ctx.strokeStyle = 'rgba(70,8,10,0.9)'
    ctx.lineWidth = 2.2
    ctx.lineJoin = 'round'
    for (const r of rects) ctx.strokeRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0)
    ctx.fillStyle = colors.load
    union(0)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.13)'
    union(2.2)
    ctx.fill()
    ctx.restore()
  }

  private ants(ctx: CanvasRenderingContext2D, world: World, z: number, roles: boolean, playerIndex: number): void {
    const ants = world.ants
    const detailed = ANT_LEN * z >= 9
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    if (!detailed) {
      // Far away an ant is two strokes: a fat gaster and a thinner front.
      ctx.strokeStyle = colors.ant
      ctx.lineWidth = 3.1
      ctx.beginPath()
      for (const a of ants) {
        if (a.state === NEST) continue
        const c = Math.cos(a.h)
        const s = Math.sin(a.h)
        ctx.moveTo(a.x - c * 4.6, a.y - s * 4.6)
        ctx.lineTo(a.x - c * 2.4, a.y - s * 2.4)
      }
      ctx.stroke()
      ctx.lineWidth = 2
      ctx.beginPath()
      for (const a of ants) {
        if (a.state === NEST) continue
        const c = Math.cos(a.h)
        const s = Math.sin(a.h)
        ctx.moveTo(a.x - c * 1.6, a.y - s * 1.6)
        ctx.lineTo(a.x + c * 4.4, a.y + s * 4.4)
      }
      ctx.stroke()
    } else {
      // Close up: six legs on a tripod gait, antennae, three body segments.
      ctx.strokeStyle = colors.ant
      ctx.lineWidth = 0.55
      ctx.beginPath()
      for (const a of ants) {
        if (a.state === NEST) continue
        const c = Math.cos(a.h)
        const s = Math.sin(a.h)
        const swing = Math.sin(a.gait * 0.9) * 1.5
        for (let leg = 0; leg < 3; leg++) {
          const along = 1.7 - leg * 1.15
          const rake = (leg - 1) * -1.7
          for (let side = -1; side <= 1; side += 2) {
            const phase = (leg + (side > 0 ? 1 : 0)) % 2 === 0 ? swing : -swing
            const hx = a.x + c * along
            const hy = a.y + s * along
            const kx = along + rake * 0.5 + phase * 0.4
            const fx = along + rake + phase
            ctx.moveTo(hx, hy)
            ctx.lineTo(a.x + c * kx - s * side * 3, a.y + s * kx + c * side * 3)
            ctx.lineTo(a.x + c * fx - s * side * 5.4, a.y + s * fx + c * side * 5.4)
          }
        }
        for (let side = -1; side <= 1; side += 2) {
          const wob = Math.sin(a.gait * 0.5 + side) * 0.5
          ctx.moveTo(a.x + c * 4.6, a.y + s * 4.6)
          ctx.lineTo(a.x + c * 6.3 - s * side * (1.5 + wob), a.y + s * 6.3 + c * side * (1.5 + wob))
          ctx.lineTo(a.x + c * 8.2 - s * side * (2.3 + wob), a.y + s * 8.2 + c * side * (2.3 + wob))
        }
      }
      ctx.stroke()
      ctx.fillStyle = colors.ant
      ctx.beginPath()
      for (const a of ants) {
        if (a.state === NEST) continue
        const c = Math.cos(a.h)
        const s = Math.sin(a.h)
        const gx = a.x - c * 3.7
        const gy = a.y - s * 3.7
        ctx.moveTo(gx + c * 3.1, gy + s * 3.1)
        ctx.ellipse(gx, gy, 3.1, 2.05, a.h, 0, Math.PI * 2)
        const tx = a.x + c * 0.7
        const ty = a.y + s * 0.7
        ctx.moveTo(tx + c * 2.3, ty + s * 2.3)
        ctx.ellipse(tx, ty, 2.3, 1.25, a.h, 0, Math.PI * 2)
        const hx = a.x + c * 4.1
        const hy = a.y + s * 4.1
        ctx.moveTo(hx + 1.55, hy)
        ctx.arc(hx, hy, 1.55, 0, Math.PI * 2)
      }
      ctx.fill()
    }

    if (roles) {
      // Paint dots, the way a lab marks individuals: yellow knows the way home, blue is lifting.
      const r = Math.max(1.7, 1.6 / z)
      for (let pass = 0; pass < 2; pass++) {
        ctx.fillStyle = pass === 0 ? colors.marker : colors.lifter
        ctx.beginPath()
        for (const a of ants) {
          if (a.state !== CARRY) continue
          const knows = a.informed > 0
          if (pass === 0 ? !knows : knows || a.role !== LIFTER) continue
          const gx = a.x - Math.cos(a.h) * 3.7
          const gy = a.y - Math.sin(a.h) * 3.7
          ctx.moveTo(gx + r, gy)
          ctx.arc(gx, gy, r, 0, Math.PI * 2)
        }
        ctx.fill()
      }
    }

    const me = ants[playerIndex]
    if (me) {
      ctx.strokeStyle = colors.load
      ctx.lineWidth = Math.max(1.4, 2 / z)
      ctx.beginPath()
      ctx.arc(me.x, me.y, 10, 0, Math.PI * 2)
      ctx.stroke()
      const p = world.player
      if (p) {
        ctx.globalAlpha = 0.5
        ctx.setLineDash([3, 4])
        ctx.beginPath()
        ctx.moveTo(me.x, me.y)
        ctx.lineTo(p.tx, p.ty)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.globalAlpha = 1
      }
    }
  }
}
