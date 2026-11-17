import { colors } from '@app/tokens'
import { clock } from '~/sim/clock'

/** A finished or unfinished run as footage: something that can paint any moment of itself. */
export interface Shot {
  /** How long the run took on its own clock, seconds. */
  seconds: number
  /** Who carried the load: "400 ants", "9 people". */
  who: string
  delivered: boolean
  /** The run's clock at a moment; 0 is the start and 1 the end. */
  clock(at: number): number
  /** Paint the arena at a moment onto a canvas of this size. */
  draw(ctx: CanvasRenderingContext2D, at: number, width: number, height: number): void
}

const WIDTH = 720
const HEIGHT = 1280
const HEAD = 148
const FPS = 30
/** The last frame is held this long, so the time can be read. */
const HOLD = 1.6
const FACE = '"Bricolage Grotesque Variable", system-ui, sans-serif'

/** A clip squeezes a run into a few seconds: sixteen times life, but never under 6 s or over 18. */
function length(shot: Shot): number {
  return Math.max(6, Math.min(18, shot.seconds / 16))
}

/** Paints frame after frame of a shot as a phone-shaped picture: the clock above, the arena below. */
function painter(shot: Shot): {
  canvas: HTMLCanvasElement
  frames: number
  paint(n: number): void
} {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const arena = document.createElement('canvas')
  arena.width = WIDTH
  arena.height = HEIGHT - HEAD
  const ctx = canvas.getContext('2d')
  const actx = arena.getContext('2d')
  const moving = Math.round(length(shot) * FPS)
  const frames = moving + Math.round(HOLD * FPS)
  const paint = (n: number): void => {
    if (!ctx || !actx) return
    const at = Math.min(1, n / Math.max(1, moving - 1))
    shot.draw(actx, at, WIDTH, HEIGHT - HEAD)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = colors.background
    ctx.fillRect(0, 0, WIDTH, HEIGHT)
    ctx.drawImage(arena, 0, HEAD)
    ctx.fillStyle = colors.foreground
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'left'
    ctx.font = `condensed 800 104px ${FACE}`
    ctx.fillText(clock(shot.clock(at)), 36, 112)
    ctx.textAlign = 'right'
    ctx.font = `condensed 700 40px ${FACE}`
    ctx.fillText(shot.who, WIDTH - 36, 70)
    ctx.font = `500 28px ${FACE}`
    ctx.fillStyle = colors.mutedForeground
    ctx.fillText('ant.dested.com', WIDTH - 36, 112)
  }
  return { canvas, frames, paint }
}

/** Encode off the clock, as fast as the machine goes: H.264 in an MP4, which every phone and app takes. */
async function encode(shot: Shot, onProgress: (done: number) => void): Promise<File | null> {
  if (typeof VideoEncoder === 'undefined') return null
  const {
    BufferTarget,
    CanvasSource,
    canEncodeVideo,
    getFirstEncodableVideoCodec,
    Mp4OutputFormat,
    Output,
  } = await import('mediabunny')
  const format = new Mp4OutputFormat()
  const size = { width: WIDTH, height: HEIGHT }
  const codec = (await canEncodeVideo('avc', size))
    ? 'avc'
    : await getFirstEncodableVideoCodec(format.getSupportedVideoCodecs(), size)
  if (!codec) return null
  const { canvas, frames, paint } = painter(shot)
  const target = new BufferTarget()
  const output = new Output({ format, target })
  const source = new CanvasSource(canvas, { codec, bitrate: 4_500_000, keyFrameInterval: 2 })
  output.addVideoTrack(source, { frameRate: FPS })
  await output.start()
  for (let n = 0; n < frames; n++) {
    paint(n)
    await source.add(n / FPS, 1 / FPS)
    if (n % 6 === 0) {
      onProgress(n / frames)
      // Let the page breathe: the button's label has to be able to change.
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }
  await output.finalize()
  if (!target.buffer) return null
  return new File([target.buffer], 'ant-movers.mp4', { type: 'video/mp4' })
}

/** Where there is no encoder to drive, film the canvas as it plays: slower, and whatever format the browser has. */
async function film(shot: Shot, onProgress: (done: number) => void): Promise<File | null> {
  if (typeof MediaRecorder === 'undefined') return null
  const type = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find(
    (candidate) => MediaRecorder.isTypeSupported(candidate)
  )
  if (!type) return null
  const { canvas, frames, paint } = painter(shot)
  paint(0)
  const recorder = new MediaRecorder(canvas.captureStream(FPS), {
    mimeType: type,
    videoBitsPerSecond: 6_000_000,
  })
  const parts: Blob[] = []
  recorder.ondataavailable = (event) => parts.push(event.data)
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve()
  })
  recorder.start()
  const start = performance.now()
  await new Promise<void>((resolve) => {
    const tick = (): void => {
      const n = Math.floor(((performance.now() - start) / 1000) * FPS)
      if (n >= frames) return resolve()
      paint(n)
      onProgress(n / frames)
      requestAnimationFrame(tick)
    }
    tick()
  })
  recorder.stop()
  await stopped
  const mp4 = type.startsWith('video/mp4')
  return new File(parts, mp4 ? 'ant-movers.mp4' : 'ant-movers.webm', {
    type: mp4 ? 'video/mp4' : 'video/webm',
  })
}

/** Make a clip of a shot. Null when this browser can do neither. */
export async function makeClip(
  shot: Shot,
  onProgress: (done: number) => void
): Promise<File | null> {
  // The clock is drawn in the page's own face: make sure it is there before the first frame.
  await document.fonts.load(`800 104px ${FACE}`).catch(() => undefined)
  return (
    (await encode(shot, onProgress).catch(() => null)) ??
    (await film(shot, onProgress).catch(() => null))
  )
}

/** Whether this device has a share sheet that takes a video (phones do; most desktops don't). */
export function canSend(file: File): boolean {
  return typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })
}

/**
 * Hand a clip to the share sheet. False when the browser wants a fresh tap first (the encode
 * outlived the one that started it); true when it was sent or the visitor closed the sheet.
 */
export async function send(file: File): Promise<boolean> {
  try {
    await navigator.share({ files: [file], title: 'Ant Movers' })
    return true
  } catch (error) {
    return error instanceof DOMException && error.name === 'AbortError'
  }
}

/** Save a clip to the downloads folder. */
export function save(file: File): void {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
