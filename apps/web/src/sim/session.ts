import { CARRY, DEFAULT_PARAMS, DT, World, type Params, type Puzzle } from '@app/sim'
import { fitZoom, Renderer, type Camera, type ViewOptions } from './renderer'

export type Mode = 'watch' | 'ant' | 'hands'

/** Sim seconds per real second. 0 means as fast as this machine can step it. */
export const RATES = [1, 4, 16, 64, 0] as const
export type Rate = (typeof RATES)[number]

/** Seconds of trail-laying before the clock starts, and how fast it plays. */
export const WARM_SECONDS = 45
const WARM_RATE = 24
/** Milliseconds of stepping allowed in one frame before the sim falls behind instead of the page. */
const BUDGET = 11
/** The same at Max speed, where the picture drops to half the frames so the sim gets most of the core. */
const MAX_BUDGET = 28
const MIN_ZOOM_FACTOR = 0.6
const MAX_ZOOM = 9

export type RuleKey = 'conformity' | 'informedTime' | 'scent'

export interface Snapshot {
  seed: number
  ants: number
  mode: Mode
  running: boolean
  rate: Rate
  warming: boolean
  time: number
  delivered: boolean
  deliveredAt: number
  carriers: number
  pullers: number
  lifters: number
  informed: number
  out: number
  /** Load speed, units per second. */
  speed: number
  biting: boolean
  holding: boolean
  zoomed: boolean
  view: ViewOptions
  /** Sim seconds per real second actually achieved lately. */
  pace: number
  conformity: number
  informedTime: number
  scentRule: boolean
  /** True while the run is the puzzle as published: default rules, its own ant count, nobody helping. */
  standard: boolean
  /** True when a rule knob or the ant count is off its default. */
  changed: boolean
}

export interface Finish {
  seed: number
  ants: number
  seconds: number
  kind: 'ANTS' | 'HANDS'
  standard: boolean
}

export const IDLE: Snapshot = {
  seed: 0,
  ants: 0,
  mode: 'watch',
  running: true,
  rate: 4,
  warming: true,
  time: 0,
  delivered: false,
  deliveredAt: 0,
  carriers: 0,
  pullers: 0,
  lifters: 0,
  informed: 0,
  out: 0,
  speed: 0,
  biting: false,
  holding: false,
  zoomed: false,
  view: { roles: true, scent: false, trace: false, pulls: false, forces: false, traffic: false },
  pace: 0,
  conformity: DEFAULT_PARAMS.conformity,
  informedTime: DEFAULT_PARAMS.informedTime,
  scentRule: DEFAULT_PARAMS.scent,
  standard: true,
  changed: false,
}

function randomSeed(): number {
  return 1 + Math.floor(Math.random() * 99999)
}

interface Touch {
  x: number
  y: number
}

/**
 * One running experiment on one canvas: the world, the clock that steps it, the camera and the
 * pointer. React reads it through `subscribe` / `snapshot` a few times a second; the frame loop
 * never touches React.
 */
export class Session {
  world: World
  readonly cam: Camera = { x: 0, y: 0, zoom: 1 }
  onFinish: ((finish: Finish) => void) | null = null

  private puzzle: Puzzle
  private readonly basePuzzle: Puzzle
  private params: Params = { ...DEFAULT_PARAMS }
  private seed: number
  private mode: Mode = 'watch'
  private running = true
  private rate: Rate = 4
  private view: ViewOptions = IDLE.view
  private pace = 0
  private standard = true
  private kind: 'ANTS' | 'HANDS' = 'ANTS'
  private reported = false

  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private readonly renderer = new Renderer()
  private width = 1
  private height = 1
  private dpr = 1
  private userCam = false
  private onscreen = true
  private raf = 0
  private last = 0
  private acc = 0
  private published = 0
  private speed = 0
  private current: Snapshot = IDLE
  private readonly listeners = new Set<() => void>()
  private readonly touches = new Map<number, Touch>()
  private pinch = 0
  private panning = false
  private moved = 0

  constructor(puzzle: Puzzle, seed?: number) {
    this.basePuzzle = puzzle
    this.puzzle = puzzle
    this.seed = seed ?? randomSeed()
    this.world = this.build()
    this.current = this.read()
  }

  // ---- React side ---------------------------------------------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  snapshot = (): Snapshot => this.current

  private publish(): void {
    this.current = this.read()
    for (const listener of this.listeners) listener()
  }

  private read(): Snapshot {
    const w = this.world
    const me = w.player ? w.ants[w.player.ant] : undefined
    return {
      seed: this.seed,
      ants: this.puzzle.ants,
      mode: this.mode,
      running: this.running,
      rate: this.rate,
      warming: w.warmup > 0,
      time: w.delivered ? w.deliveredAt : w.time,
      delivered: w.delivered,
      deliveredAt: w.deliveredAt,
      carriers: w.stats.carriers,
      pullers: w.stats.pullers,
      lifters: w.stats.lifters,
      informed: w.stats.informed,
      out: w.stats.out,
      speed: this.speed,
      biting: w.player?.bite ?? false,
      holding: me?.state === CARRY,
      zoomed: this.userCam,
      view: this.view,
      pace: this.pace,
      conformity: this.params.conformity,
      informedTime: this.params.informedTime,
      scentRule: this.params.scent,
      standard: this.standard,
      changed: this.rulesChanged(),
    }
  }

  // ---- Controls -----------------------------------------------------------------------------

  private build(): World {
    const world = new World(this.puzzle, this.seed, this.params)
    world.startWarmup(WARM_SECONDS)
    if (this.mode === 'hands') world.setHands(true)
    return world
  }

  private rulesChanged(): boolean {
    return (
      this.puzzle.ants !== this.basePuzzle.ants ||
      this.params.conformity !== DEFAULT_PARAMS.conformity ||
      this.params.informedTime !== DEFAULT_PARAMS.informedTime ||
      this.params.scent !== DEFAULT_PARAMS.scent
    )
  }

  private isStandard(): boolean {
    return this.mode !== 'ant' && !this.rulesChanged()
  }

  /** What a headless copy of this run needs: the puzzle as it stands and the rules that are off default. */
  setup(): { puzzle: Puzzle; rules: { conformity: number; informedTime: number; scent: boolean } } {
    const { conformity, informedTime, scent } = this.params
    return { puzzle: this.puzzle, rules: { conformity, informedTime, scent } }
  }

  /** Start over. A new colony unless a seed is given. */
  restart(seed?: number): void {
    this.seed = seed ?? randomSeed()
    this.world = this.build()
    this.acc = 0
    this.running = true
    this.reported = false
    this.standard = this.isStandard()
    this.kind = this.mode === 'hands' ? 'HANDS' : 'ANTS'
    if (this.mode === 'ant') this.world.possess()
    if (this.mode !== 'ant') this.fit()
    this.publish()
  }

  setRunning(on: boolean): void {
    this.running = on
    this.publish()
  }

  setRate(rate: Rate): void {
    this.rate = rate
    this.publish()
  }

  setView(key: keyof ViewOptions, on: boolean): void {
    this.view = { ...this.view, [key]: on }
    this.publish()
  }

  setAnts(count: number): void {
    if (count === this.puzzle.ants) return
    this.puzzle = { ...this.puzzle, ants: count }
    this.restart(this.seed)
  }

  setRule(key: 'conformity' | 'informedTime', value: number): void
  setRule(key: 'scent', value: boolean): void
  setRule(key: RuleKey, value: number | boolean): void {
    if (key === 'scent') {
      if (typeof value !== 'boolean') return
      this.params.scent = value
      this.world.params.scent = value
    } else {
      if (typeof value !== 'number') return
      this.params[key] = value
      this.world.params[key] = value
    }
    if (!this.isStandard()) this.standard = false
    this.publish()
  }

  resetRules(): void {
    this.params = { ...DEFAULT_PARAMS }
    this.puzzle = this.basePuzzle
    this.restart(this.seed)
  }

  setMode(mode: Mode): void {
    if (mode === this.mode) return
    const w = this.world
    if (this.mode === 'ant') w.release()
    if (this.mode === 'hands') {
      w.drag = null
      w.setHands(false)
    }
    this.mode = mode
    if (mode === 'ant') {
      this.standard = false
      if (w.possess()) this.zoomToPlayer()
    } else if (mode === 'hands') {
      // Hands start from scratch: a fair race against the colony's clock.
      this.restart(this.seed)
      return
    } else {
      this.fit()
    }
    if (this.kind === 'HANDS') this.standard = false
    this.publish()
  }

  toggleBite(): void {
    const p = this.world.player
    if (!p) return
    p.bite = !p.bite
    this.publish()
  }

  // ---- Camera -------------------------------------------------------------------------------

  private base(): number {
    return fitZoom(this.puzzle, this.width, this.height)
  }

  fit(): void {
    this.userCam = false
    this.cam.x = this.puzzle.w / 2
    this.cam.y = this.puzzle.h / 2
    this.cam.zoom = this.base()
    this.touchAction()
    this.publish()
  }

  zoomBy(factor: number, sx = this.width / 2, sy = this.height / 2): void {
    const cam = this.cam
    const wx = cam.x + (sx - this.width / 2) / cam.zoom
    const wy = cam.y + (sy - this.height / 2) / cam.zoom
    const zoom = Math.min(MAX_ZOOM, Math.max(this.base() * MIN_ZOOM_FACTOR, cam.zoom * factor))
    cam.zoom = zoom
    cam.x = wx - (sx - this.width / 2) / zoom
    cam.y = wy - (sy - this.height / 2) / zoom
    this.userCam = true
    this.clampCam()
    this.touchAction()
    this.publish()
  }

  private zoomToPlayer(): void {
    const p = this.world.player
    const me = p ? this.world.ants[p.ant] : undefined
    if (!me) return
    this.userCam = true
    this.cam.zoom = Math.max(this.base() * 1.6, Math.min(3, this.width / 260))
    this.cam.x = me.x
    this.cam.y = me.y
    this.touchAction()
  }

  private clampCam(): void {
    const cam = this.cam
    cam.x = Math.min(this.puzzle.w, Math.max(0, cam.x))
    cam.y = Math.min(this.puzzle.h, Math.max(0, cam.y))
  }

  private toWorld(sx: number, sy: number): Touch {
    return {
      x: this.cam.x + (sx - this.width / 2) / this.cam.zoom,
      y: this.cam.y + (sy - this.height / 2) / this.cam.zoom,
    }
  }

  private follow(elapsed: number): void {
    const p = this.world.player
    const me = p ? this.world.ants[p.ant] : undefined
    if (!p || !me) return
    const k = 1 - Math.exp(-elapsed * 5)
    this.cam.x += (me.x - this.cam.x) * k
    this.cam.y += (me.y - this.cam.y) * k
  }

  /** At the fitted view a finger scrolls the page; once zoomed, or steering, it belongs to the arena. */
  private touchAction(): void {
    if (!this.canvas) return
    this.canvas.style.touchAction = this.mode === 'watch' && !this.userCam ? 'pan-y' : 'none'
  }

  // ---- Canvas -------------------------------------------------------------------------------

  /** Bind to a canvas. Returns the function that unbinds. */
  attach(canvas: HTMLCanvasElement): () => void {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    const resize = (): void => {
      const rect = canvas.getBoundingClientRect()
      this.width = Math.max(1, rect.width)
      this.height = Math.max(1, rect.height)
      this.dpr = Math.min(3, window.devicePixelRatio || 1)
      canvas.width = Math.round(this.width * this.dpr)
      canvas.height = Math.round(this.height * this.dpr)
      if (!this.userCam) {
        this.cam.x = this.puzzle.w / 2
        this.cam.y = this.puzzle.h / 2
        this.cam.zoom = this.base()
      }
      this.render()
    }
    const sizes = new ResizeObserver(resize)
    sizes.observe(canvas)
    const seen = new IntersectionObserver((entries) => {
      for (const entry of entries) this.onscreen = entry.isIntersecting
    })
    seen.observe(canvas)
    resize()
    this.touchAction()

    const at = (e: PointerEvent | WheelEvent): Touch => {
      const rect = canvas.getBoundingClientRect()
      return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }

    const down = (e: PointerEvent): void => {
      const s = at(e)
      this.touches.set(e.pointerId, s)
      this.moved = 0
      if (this.touches.size === 2) {
        this.pinch = this.spread()
        this.panning = false
        this.world.drag = null
        return
      }
      const w = this.toWorld(s.x, s.y)
      if (this.mode === 'hands') {
        const grip = this.world.gripAt(w.x, w.y)
        if (grip) {
          canvas.setPointerCapture(e.pointerId)
          this.world.drag = { bx: grip.bx, by: grip.by, tx: w.x, ty: w.y }
          return
        }
      }
      if (this.mode === 'ant') {
        const p = this.world.player
        if (p) {
          p.tx = w.x
          p.ty = w.y
        }
        if (e.pointerType === 'touch') canvas.setPointerCapture(e.pointerId)
        return
      }
      this.panning = true
      if (e.pointerType !== 'touch' || this.userCam) canvas.setPointerCapture(e.pointerId)
    }

    const move = (e: PointerEvent): void => {
      const s = at(e)
      const prev = this.touches.get(e.pointerId)
      if (prev) this.touches.set(e.pointerId, s)
      if (this.touches.size === 2 && prev) {
        const spread = this.spread()
        if (this.pinch > 0 && spread > 0) {
          const mid = this.middle()
          this.zoomBy(spread / this.pinch, mid.x, mid.y)
        }
        this.pinch = spread
        return
      }
      const w = this.toWorld(s.x, s.y)
      if (this.world.drag) {
        this.world.drag.tx = w.x
        this.world.drag.ty = w.y
        return
      }
      if (this.mode === 'ant') {
        const p = this.world.player
        if (p && (e.pointerType !== 'touch' || prev)) {
          p.tx = w.x
          p.ty = w.y
        }
        return
      }
      if (this.panning && prev) {
        const dx = s.x - prev.x
        const dy = s.y - prev.y
        this.moved += Math.abs(dx) + Math.abs(dy)
        if (e.pointerType === 'touch' && !this.userCam) return
        if (this.moved > 4) {
          this.cam.x -= dx / this.cam.zoom
          this.cam.y -= dy / this.cam.zoom
          this.userCam = true
          this.clampCam()
          this.touchAction()
        }
      }
    }

    const up = (e: PointerEvent): void => {
      this.touches.delete(e.pointerId)
      this.pinch = 0
      if (this.world.drag) this.world.drag = null
      if (this.mode === 'ant' && e.type === 'pointerup' && e.pointerType !== 'touch')
        this.toggleBite()
      if (this.panning) {
        this.panning = false
        this.publish()
      }
    }

    const wheel = (e: WheelEvent): void => {
      // A plain wheel scrolls the page. Pinch on a trackpad (ctrl + wheel) or ctrl/⌘ + wheel zooms.
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const s = at(e)
      this.zoomBy(Math.exp(-e.deltaY * 0.01), s.x, s.y)
    }

    const key = (e: KeyboardEvent): void => {
      if (e.code !== 'Space' || this.mode !== 'ant') return
      const target = e.target
      if (target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName))
        return
      e.preventDefault()
      if (!e.repeat) this.toggleBite()
    }

    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', up)
    canvas.addEventListener('wheel', wheel, { passive: false })
    window.addEventListener('keydown', key)

    this.last = performance.now()
    this.raf = requestAnimationFrame(this.frame)

    return () => {
      cancelAnimationFrame(this.raf)
      sizes.disconnect()
      seen.disconnect()
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', up)
      canvas.removeEventListener('wheel', wheel)
      window.removeEventListener('keydown', key)
      this.touches.clear()
      this.canvas = null
      this.ctx = null
    }
  }

  private spread(): number {
    const [a, b] = [...this.touches.values()]
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
  }

  private middle(): Touch {
    const [a, b] = [...this.touches.values()]
    return a && b
      ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      : { x: this.width / 2, y: this.height / 2 }
  }

  private frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame)
    const elapsed = Math.min(0.1, (now - this.last) / 1000)
    this.last = now
    if (!this.onscreen) return
    const w = this.world
    const warming = w.warmup > 0
    if (this.running || warming) {
      // Rate 0 is "max": ask for more than any machine can do and let the frame budget cap it.
      this.acc += elapsed * (warming ? WARM_RATE : this.rate || 4000)
      const start = performance.now()
      const budget = this.rate === 0 && !warming ? MAX_BUDGET : BUDGET
      let steps = 0
      while (this.acc >= DT) {
        this.acc -= DT
        w.step()
        steps++
        if (w.delivered && !this.reported) {
          this.reported = true
          this.onFinish?.({
            seed: this.seed,
            ants: this.puzzle.ants,
            seconds: w.deliveredAt,
            kind: this.kind,
            standard: this.standard,
          })
          this.publish()
        }
        // Leaving warm-up changes the rate: stop here so the new one applies next frame.
        if (warming && w.warmup === 0) {
          this.acc = 0
          break
        }
        if ((steps & 3) === 0 && performance.now() - start > budget) {
          this.acc = 0
          break
        }
      }
      const v = Math.hypot(w.vx, w.vy)
      this.speed += (v - this.speed) * 0.1
      if (elapsed > 0) this.pace += ((steps * DT) / elapsed - this.pace) * 0.08
    } else {
      this.pace = 0
    }
    this.follow(elapsed)
    this.render()
    if (now - this.published > 160) {
      this.published = now
      this.publish()
    }
  }

  private render(): void {
    if (!this.ctx) return
    this.renderer.draw(
      this.ctx,
      this.world,
      this.cam,
      this.width,
      this.height,
      this.dpr,
      this.view,
      this.world.player?.ant ?? -1
    )
  }
}
