import { colors } from '@app/tokens'
import {
  ANT_LEN,
  CARRY,
  LIFTER,
  NEST,
  NEST_R,
  PULLER,
  segmentPoly,
  UNKNOWN,
  WALL_T,
  type Poly,
  type Puzzle,
  type Shape,
  type World,
} from '@app/sim'

export interface Camera {
  /** World point at the centre of the view. */
  x: number
  y: number
  /** Screen pixels per world unit (CSS pixels). */
  zoom: number
}

export interface ViewOptions {
  /** Paint dots: who knows the way, who is lifting. */
  roles: boolean
  /** The two scent fields. */
  scent: boolean
  /** Where the load has been: its path, and a faint print of it every five seconds. */
  trace: boolean
  /** Every carrier's pull, and the grip points. */
  pulls: boolean
  /** The sum of the pulls, the twist they make, and where walls push back. */
  forces: boolean
  /** A long exposure of where free ants walk. */
  traffic: boolean
}

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

const INK = rgb(colors.ant)
const LOAD = rgb(colors.load)
const BENCH = rgb(colors.background)

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
  private sealedFor: World | null = null
  private sealed: HTMLCanvasElement | null = null
  private trafficFor: World | null = null
  private traffic: HTMLCanvasElement | null = null
  private trafficAge = 0

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
    if (view.traffic) this.exposure(ctx, world)
    else this.trafficFor = null
    if (view.scent) this.scent(ctx, world)
    if (view.trace) this.trace(ctx, world, z)
    this.nest(ctx, p, z)
    this.sealedOff(ctx, world)
    this.walls(ctx, p, world.walls.slice(0, p.walls.length))
    this.load(ctx, world.shape, world.x, world.y, world.a)
    if (view.pulls) this.grips(ctx, world)
    this.ants(ctx, world, z, view.roles, playerIndex)
    if (view.pulls) this.pulls(ctx, world, z)
    if (view.forces) this.forces(ctx, world, z)
  }

  /** A puzzle with nobody in it: what the editor draws under its handles. */
  still(
    ctx: CanvasRenderingContext2D,
    puzzle: Puzzle,
    shape: Shape,
    cam: Camera,
    width: number,
    height: number,
    dpr: number
  ): void {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    const z = cam.zoom
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (width / 2 - cam.x * z), dpr * (height / 2 - cam.y * z))
    this.floor(ctx, puzzle)
    this.nest(ctx, puzzle, z)
    this.walls(
      ctx,
      puzzle,
      puzzle.walls.map(([x1, y1, x2, y2]) => segmentPoly(x1, y1, x2, y2, WALL_T))
    )
    this.load(ctx, shape, puzzle.load.x, puzzle.load.y, puzzle.load.a)
  }

  /**
   * Floor no ant can reach from the nest (the inside of a block, the far side of a sealed wall) is
   * painted as bench: it is not part of the arena. Worked out once per world from the wall field.
   */
  private sealedOff(ctx: CanvasRenderingContext2D, world: World): void {
    if (this.sealedFor !== world) {
      this.sealedFor = world
      this.sealed = this.buildSealed(world)
    }
    if (!this.sealed) return
    const f = world.fields
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, world.puzzle.w, world.puzzle.h)
    ctx.clip()
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(this.sealed, -f.sres / 2, -f.sres / 2, f.sw * f.sres, f.sh * f.sres)
    ctx.restore()
  }

  private buildSealed(world: World): HTMLCanvasElement | null {
    const f = world.fields
    const { sw, sh, sres, sdf } = f
    const open = (k: number): boolean => (sdf[k] ?? 0) > 1
    const reached = new Uint8Array(sw * sh)
    const start =
      Math.min(sh - 2, Math.max(1, Math.round(world.puzzle.nest.y / sres))) * sw +
      Math.min(sw - 2, Math.max(1, Math.round(world.puzzle.nest.x / sres)))
    const queue = new Int32Array(sw * sh)
    let head = 0
    let tail = 0
    queue[tail++] = start
    reached[start] = 1
    while (head < tail) {
      const k = queue[head++] ?? 0
      const i = k % sw
      for (const n of [k - 1, k + 1, k - sw, k + sw]) {
        if (n < 0 || n >= sw * sh || reached[n]) continue
        if ((n === k - 1 && i === 0) || (n === k + 1 && i === sw - 1)) continue
        if (!open(n)) continue
        reached[n] = 1
        queue[tail++] = n
      }
    }
    // Sealed = open floor the flood never reached, grown a little way into the walls beside it.
    const sealed = new Uint8Array(sw * sh)
    let any = false
    for (let k = 0; k < sw * sh; k++) {
      if (open(k) && !reached[k]) {
        sealed[k] = 1
        any = true
      }
    }
    if (!any) return null
    for (let pass = 0; pass < 3; pass++) {
      const grown = sealed.slice()
      for (let j = 1; j < sh - 1; j++) {
        for (let i = 1; i < sw - 1; i++) {
          const k = j * sw + i
          if (sealed[k] || open(k)) continue
          if (sealed[k - 1] || sealed[k + 1] || sealed[k - sw] || sealed[k + sw]) grown[k] = 1
        }
      }
      sealed.set(grown)
    }
    const canvas = document.createElement('canvas')
    canvas.width = sw
    canvas.height = sh
    const c = canvas.getContext('2d')
    if (!c) return null
    const img = c.createImageData(sw, sh)
    for (let k = 0; k < sw * sh; k++) {
      if (!sealed[k]) continue
      img.data[k * 4] = BENCH[0]
      img.data[k * 4 + 1] = BENCH[1]
      img.data[k * 4 + 2] = BENCH[2]
      img.data[k * 4 + 3] = 255
    }
    c.putImageData(img, 0, 0)
    return canvas
  }

  /** Long exposure: every frame each free ant leaves a speck, and the whole plate fades slowly. */
  private exposure(ctx: CanvasRenderingContext2D, world: World): void {
    const p = world.puzzle
    const scale = 0.5
    if (this.trafficFor !== world || !this.traffic) {
      this.trafficFor = world
      this.traffic = document.createElement('canvas')
      this.traffic.width = Math.ceil(p.w * scale)
      this.traffic.height = Math.ceil(p.h * scale)
      this.trafficAge = 0
    }
    const t = this.traffic.getContext('2d')
    if (!t) return
    if (++this.trafficAge % 40 === 0) {
      t.globalCompositeOperation = 'destination-out'
      t.fillStyle = 'rgba(0,0,0,0.06)'
      t.fillRect(0, 0, this.traffic.width, this.traffic.height)
      t.globalCompositeOperation = 'source-over'
    }
    t.fillStyle = `rgba(${INK[0]},${INK[1]},${INK[2]},0.09)`
    for (const a of world.ants) {
      if (a.state === NEST || a.state === CARRY) continue
      t.fillRect(a.x * scale - 0.5, a.y * scale - 0.5, 1.5, 1.5)
    }
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(this.traffic, 0, 0, p.w, p.h)
  }

  /** Grip points: free ones as specks, ones a wall is in the way of in red. */
  private grips(ctx: CanvasRenderingContext2D, world: World): void {
    ctx.fillStyle = 'rgba(20,24,20,0.45)'
    ctx.beginPath()
    for (const st of world.sites) {
      if (st.occ >= 0 || st.blocked) continue
      ctx.moveTo(st.x + st.nx * 2 + 0.9, st.y + st.ny * 2)
      ctx.arc(st.x + st.nx * 2, st.y + st.ny * 2, 0.9, 0, Math.PI * 2)
    }
    ctx.fill()
    ctx.fillStyle = colors.load
    ctx.beginPath()
    for (const st of world.sites) {
      if (!st.blocked) continue
      ctx.moveTo(st.x + st.nx * 2 + 1.3, st.y + st.ny * 2)
      ctx.arc(st.x + st.nx * 2, st.y + st.ny * 2, 1.3, 0, Math.PI * 2)
    }
    ctx.fill()
  }

  /** One line per pulling ant, the way she is pulling. Yellow lines are ants who know the way. */
  private pulls(ctx: CanvasRenderingContext2D, world: World, z: number): void {
    const reach = 22
    ctx.lineCap = 'round'
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass === 0 ? 'rgba(20,24,20,0.8)' : colors.marker
      ctx.lineWidth = Math.max(pass === 0 ? 1 : 1.8, (pass === 0 ? 1 : 1.8) / z)
      ctx.beginPath()
      for (const a of world.ants) {
        if (a.state !== CARRY || a.role !== PULLER) continue
        if ((a.informed > 0) !== (pass === 1)) continue
        const st = world.sites[a.site]
        if (!st) continue
        const c = Math.cos(a.dir)
        const s = Math.sin(a.dir)
        const x0 = st.x + c * 13
        const y0 = st.y + s * 13
        const x1 = st.x + c * (13 + reach)
        const y1 = st.y + s * (13 + reach)
        ctx.moveTo(x0, y0)
        ctx.lineTo(x1, y1)
        ctx.moveTo(x1 - c * 4 + s * 2.4, y1 - s * 4 - c * 2.4)
        ctx.lineTo(x1, y1)
        ctx.lineTo(x1 - c * 4 - s * 2.4, y1 - s * 4 + c * 2.4)
      }
      ctx.stroke()
    }
  }

  /** The sum of all pulls as one arrow, the twist as an arc, and a tick wherever a wall pushes back. */
  private forces(ctx: CanvasRenderingContext2D, world: World, z: number): void {
    const { net } = world
    const lw = Math.max(2.6, 2.6 / z)
    const halo = 'rgba(250,250,248,0.85)'
    const arrow = (x0: number, y0: number, x1: number, y1: number): void => {
      const len = Math.hypot(x1 - x0, y1 - y0)
      if (len < 2) return
      const c = (x1 - x0) / len
      const s = (y1 - y0) / len
      const head = Math.min(9, len * 0.5)
      ctx.beginPath()
      ctx.moveTo(x0, y0)
      ctx.lineTo(x1, y1)
      ctx.moveTo(x1 - c * head + s * head * 0.6, y1 - s * head - c * head * 0.6)
      ctx.lineTo(x1, y1)
      ctx.lineTo(x1 - c * head - s * head * 0.6, y1 - s * head + c * head * 0.6)
    }
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    // Net pull: 2.5 units of arrow per ant's worth of force.
    const fx = world.x + net.x * 2.5
    const fy = world.y + net.y * 2.5
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass === 0 ? halo : colors.foreground
      ctx.lineWidth = pass === 0 ? lw * 2.2 : lw
      arrow(world.x, world.y, fx, fy)
      ctx.stroke()
      // Twist: an arc whose sweep grows with the torque.
      const sweep = Math.max(-2.6, Math.min(2.6, net.t / 900))
      if (Math.abs(sweep) > 0.08) {
        const r = 30
        ctx.beginPath()
        ctx.arc(world.x, world.y, r, -Math.PI / 2, -Math.PI / 2 + sweep, sweep < 0)
        const end = -Math.PI / 2 + sweep
        const ex = world.x + Math.cos(end) * r
        const ey = world.y + Math.sin(end) * r
        const dir = end + (sweep > 0 ? Math.PI / 2 : -Math.PI / 2)
        ctx.moveTo(ex - Math.cos(dir - 0.5) * 7, ey - Math.sin(dir - 0.5) * 7)
        ctx.lineTo(ex, ey)
        ctx.lineTo(ex - Math.cos(dir + 0.5) * 7, ey - Math.sin(dir + 0.5) * 7)
        ctx.stroke()
      }
    }
    // Wall contacts: a dot on the wall and a tick along the push.
    ctx.strokeStyle = colors.foreground
    ctx.fillStyle = colors.marker
    ctx.lineWidth = Math.max(1.6, 1.6 / z)
    for (const c of world.contacts) {
      if (c.sep > 0.5) continue
      ctx.beginPath()
      ctx.moveTo(c.x, c.y)
      ctx.lineTo(c.x + c.nx * 14, c.y + c.ny * 14)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(c.x, c.y, 3, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
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
    // A print of the load every five seconds: where it lingers, the prints pile up.
    const rects = world.shape.rects
    const every = 30
    const first = Math.max(0, Math.floor((t.length / 3 - 260 * 10) / 10) * 10 * 3)
    ctx.fillStyle = `rgba(${LOAD[0]},${LOAD[1]},${LOAD[2]},0.05)`
    for (let i = first; i < t.length; i += every) {
      ctx.save()
      ctx.translate(t[i] ?? 0, t[i + 1] ?? 0)
      ctx.rotate(t[i + 2] ?? 0)
      ctx.beginPath()
      for (const r of rects) ctx.rect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0)
      ctx.fill()
      ctx.restore()
    }
    ctx.strokeStyle = colors.load
    ctx.globalAlpha = 0.6
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

  private walls(ctx: CanvasRenderingContext2D, p: Puzzle, polys: readonly Poly[]): void {
    if (polys.length > 0) {
      const path = (): void => {
        ctx.beginPath()
        for (const poly of polys) {
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

  private load(ctx: CanvasRenderingContext2D, shape: Shape, x: number, y: number, a: number): void {
    const rects = shape.rects
    // The pieces overlap, so anything translucent is filled as one path: the union, painted once.
    const union = (inset: number): void => {
      ctx.beginPath()
      for (const r of rects) ctx.rect(r.x0 + inset, r.y0 + inset, r.x1 - r.x0 - inset * 2, r.y1 - r.y0 - inset * 2)
    }
    ctx.save()
    ctx.translate(x + 2.5, y + 3.5)
    ctx.rotate(a)
    ctx.fillStyle = 'rgba(0,0,0,0.2)'
    union(0)
    ctx.fill()
    ctx.restore()

    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(a)
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
