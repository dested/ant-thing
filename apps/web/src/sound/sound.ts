import { useSyncExternalStore } from 'react'

/**
 * Every sound on the site, synthesised here (there are no audio files): the load dragging over
 * the floor and scraping walls, grips taken and lost, and a chime when something is achieved.
 * Off until the visitor turns it on, and remembered in this browser.
 */
const KEY = 'ant-movers:sound'

export type Tick = 'grab' | 'drop' | 'bite'
export type Chime = 'gate' | 'delivered' | 'calledOff'

const NOTES: Record<Chime, { notes: number[]; gap: number; ring: number }> = {
  gate: { notes: [523.25, 783.99], gap: 0.09, ring: 0.5 },
  delivered: { notes: [523.25, 659.25, 783.99, 1046.5], gap: 0.11, ring: 0.9 },
  calledOff: { notes: [392, 311.13], gap: 0.22, ring: 0.7 },
}

interface Rub {
  gain: GainNode
  level: number
}

class Sound {
  on = false
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noise: AudioBuffer | null = null
  private floor: Rub | null = null
  private wall: Rub | null = null
  private lastTick = 0
  private remembered = false
  private readonly listeners = new Set<() => void>()

  subscribe = (listener: () => void): (() => void) => {
    this.remember()
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  isOn = (): boolean => this.on

  /** Turn sound on or off. The first "on" has to come from a click or a key: browsers insist. */
  setOn(on: boolean): void {
    this.on = on
    try {
      localStorage.setItem(KEY, on ? '1' : '0')
    } catch {
      // Private windows may refuse storage: the switch still works for this visit.
    }
    if (on) this.wake()
    else void this.ctx?.suspend()
    for (const listener of this.listeners) listener()
  }

  /**
   * What the visitor chose last time. Audio itself can't start until they touch the page, so a
   * remembered "on" wakes up on the first click or key press.
   */
  private remember(): void {
    if (this.remembered || typeof window === 'undefined') return
    this.remembered = true
    try {
      this.on = localStorage.getItem(KEY) === '1'
    } catch {
      this.on = false
    }
    if (!this.on) return
    const first = (): void => {
      window.removeEventListener('pointerdown', first)
      window.removeEventListener('keydown', first)
      if (this.on) this.wake()
    }
    window.addEventListener('pointerdown', first)
    window.addEventListener('keydown', first)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) void this.ctx?.suspend()
      else if (this.on) void this.ctx?.resume()
    })
  }

  private wake(): void {
    if (!this.ctx) {
      const ctx = new AudioContext()
      const master = ctx.createGain()
      master.gain.value = 0.55
      master.connect(ctx.destination)
      const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
      const samples = noise.getChannelData(0)
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1
      this.ctx = ctx
      this.master = master
      this.noise = noise
      // A low rumble for the floor, a thin hiss for a wall.
      this.floor = this.rub(ctx, master, noise, 240, 0.7)
      this.wall = this.rub(ctx, master, noise, 2100, 2.5)
    }
    void this.ctx.resume()
  }

  private rub(
    ctx: AudioContext,
    out: AudioNode,
    noise: AudioBuffer,
    frequency: number,
    q: number
  ): Rub {
    const source = ctx.createBufferSource()
    source.buffer = noise
    source.loop = true
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = frequency
    filter.Q.value = q
    const gain = ctx.createGain()
    gain.gain.value = 0
    source.connect(filter).connect(gain).connect(out)
    source.start()
    return { gain, level: 0 }
  }

  /** The load moving: how fast over the floor and how hard along a wall, each 0 to 1. Call every frame. */
  scrape(floor: number, wall: number): void {
    const ctx = this.ctx
    if (!ctx || !this.on) return
    this.level(ctx, this.floor, Math.min(1, floor) * 0.16)
    this.level(ctx, this.wall, Math.min(1, wall) * 0.05)
  }

  private level(ctx: AudioContext, rub: Rub | null, target: number): void {
    if (!rub || Math.abs(target - rub.level) < 0.004) return
    rub.level = target
    rub.gain.gain.setTargetAtTime(target, ctx.currentTime, 0.08)
  }

  /** A grip taken or lost. Ant bites are quiet and rationed: a colony makes hundreds. */
  tick(kind: Tick): void {
    const ctx = this.ctx
    const master = this.master
    if (!ctx || !master || !this.noise || !this.on) return
    const now = ctx.currentTime
    if (kind === 'bite') {
      if (now - this.lastTick < 0.045) return
      this.lastTick = now
    }
    const source = ctx.createBufferSource()
    source.buffer = this.noise
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value =
      kind === 'bite' ? 3200 + Math.random() * 2600 : kind === 'grab' ? 1700 : 900
    filter.Q.value = 4
    const gain = ctx.createGain()
    const peak = kind === 'bite' ? 0.07 : 0.4
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(peak, now + 0.003)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (kind === 'bite' ? 0.03 : 0.09))
    source.connect(filter).connect(gain).connect(master)
    source.start(now, Math.random() * 0.9, 0.12)
  }

  chime(kind: Chime): void {
    const ctx = this.ctx
    const master = this.master
    if (!ctx || !master || !this.on) return
    const { notes, gap, ring } = NOTES[kind]
    notes.forEach((frequency, i) => {
      const at = ctx.currentTime + i * gap
      const osc = ctx.createOscillator()
      osc.type = 'triangle'
      osc.frequency.value = frequency
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0, at)
      gain.gain.linearRampToValueAtTime(0.22, at + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + ring)
      osc.connect(gain).connect(master)
      osc.start(at)
      osc.stop(at + ring + 0.05)
    })
  }
}

export const sound = new Sound()

const off = (): boolean => false

/** Whether sound is on. False on the server and until the browser has read the visitor's choice. */
export function useSound(): boolean {
  return useSyncExternalStore(sound.subscribe, sound.isOn, off)
}
