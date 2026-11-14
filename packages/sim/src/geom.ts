/** Convex polygons and the one collision routine the sim needs: load piece against wall, with a margin. */
export interface Vec {
  x: number
  y: number
}

export interface Poly {
  /** Counter-clockwise vertices (y down on screen makes no difference to the maths). */
  pts: Vec[]
  /** Outward unit normal of the edge that starts at the same index. */
  nrm: Vec[]
  minx: number
  miny: number
  maxx: number
  maxy: number
}

export function emptyQuad(): Poly {
  const mk = (): Vec => ({ x: 0, y: 0 })
  return {
    pts: [mk(), mk(), mk(), mk()],
    nrm: [mk(), mk(), mk(), mk()],
    minx: 0,
    miny: 0,
    maxx: 0,
    maxy: 0,
  }
}

/** Recompute normals and bounds after the vertices change. */
export function finishPoly(p: Poly): void {
  const n = p.pts.length
  let minx = Infinity
  let miny = Infinity
  let maxx = -Infinity
  let maxy = -Infinity
  let area = 0
  for (let i = 0; i < n; i++) {
    const a = p.pts[i]
    const b = p.pts[(i + 1) % n]
    if (!a || !b) continue
    area += a.x * b.y - b.x * a.y
    if (a.x < minx) minx = a.x
    if (a.y < miny) miny = a.y
    if (a.x > maxx) maxx = a.x
    if (a.y > maxy) maxy = a.y
  }
  const sign = area >= 0 ? 1 : -1
  for (let i = 0; i < n; i++) {
    const a = p.pts[i]
    const b = p.pts[(i + 1) % n]
    const m = p.nrm[i]
    if (!a || !b || !m) continue
    const ex = b.x - a.x
    const ey = b.y - a.y
    const len = hyp(ex, ey) || 1
    m.x = (sign * ey) / len
    m.y = (-sign * ex) / len
  }
  p.minx = minx
  p.miny = miny
  p.maxx = maxx
  p.maxy = maxy
}

/** An oriented rectangle around the segment (x1,y1)-(x2,y2), `t` thick, with square caps. */
export function segmentPoly(x1: number, y1: number, x2: number, y2: number, t: number): Poly {
  let dx = x2 - x1
  let dy = y2 - y1
  const len = hyp(dx, dy)
  if (len < 1e-6) {
    dx = 1
    dy = 0
  } else {
    dx /= len
    dy /= len
  }
  const h = t / 2
  const ax = x1 - dx * h
  const ay = y1 - dy * h
  const bx = x2 + dx * h
  const by = y2 + dy * h
  const px = -dy * h
  const py = dx * h
  const p = emptyQuad()
  const set = (i: number, x: number, y: number): void => {
    const v = p.pts[i]
    if (v) {
      v.x = x
      v.y = y
    }
  }
  set(0, ax + px, ay + py)
  set(1, ax - px, ay - py)
  set(2, bx - px, by - py)
  set(3, bx + px, by + py)
  finishPoly(p)
  return p
}

/** Write the world-space corners of a body-frame rectangle into `out`. */
export function placeRect(
  out: Poly,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  px: number,
  py: number,
  c: number,
  s: number
): void {
  const set = (i: number, x: number, y: number): void => {
    const v = out.pts[i]
    if (v) {
      v.x = px + c * x - s * y
      v.y = py + s * x + c * y
    }
  }
  set(0, x0, y0)
  set(1, x1, y0)
  set(2, x1, y1)
  set(3, x0, y1)
  finishPoly(out)
}

export interface Contact {
  x: number
  y: number
  /** Unit normal pointing from the wall into the load: the way the load must be pushed. */
  nx: number
  ny: number
  /** Gap along the normal: positive when apart, negative when overlapping. */
  sep: number
}

interface Sep {
  sep: number
  edge: number
}

function maxSeparation(a: Poly, b: Poly): Sep {
  let best = -Infinity
  let edge = 0
  for (let i = 0; i < a.pts.length; i++) {
    const n = a.nrm[i]
    const p = a.pts[i]
    if (!n || !p) continue
    let min = Infinity
    for (const q of b.pts) {
      const d = n.x * (q.x - p.x) + n.y * (q.y - p.y)
      if (d < min) min = d
    }
    if (min > best) {
      best = min
      edge = i
    }
  }
  return { sep: best, edge }
}

/**
 * Contacts between a load piece `a` and a wall `b` whose surfaces are within `margin`.
 * Appends at most two contacts to `out`.
 */
export function collide(a: Poly, b: Poly, margin: number, out: Contact[]): void {
  if (
    a.minx - margin > b.maxx ||
    b.minx - margin > a.maxx ||
    a.miny - margin > b.maxy ||
    b.miny - margin > a.maxy
  )
    return
  const sa = maxSeparation(a, b)
  if (sa.sep > margin) return
  const sb = maxSeparation(b, a)
  if (sb.sep > margin) return

  const refIsWall = sb.sep > sa.sep + 0.05
  const ref = refIsWall ? b : a
  const inc = refIsWall ? a : b
  const e = refIsWall ? sb.edge : sa.edge
  const n = ref.nrm[e]
  const r1 = ref.pts[e]
  const r2 = ref.pts[(e + 1) % ref.pts.length]
  if (!n || !r1 || !r2) return

  // Incident edge: the one facing the reference face most squarely.
  let incEdge = 0
  let minDot = Infinity
  for (let j = 0; j < inc.nrm.length; j++) {
    const m = inc.nrm[j]
    if (!m) continue
    const d = m.x * n.x + m.y * n.y
    if (d < minDot) {
      minDot = d
      incEdge = j
    }
  }
  const i1 = inc.pts[incEdge]
  const i2 = inc.pts[(incEdge + 1) % inc.pts.length]
  if (!i1 || !i2) return

  // Clip the incident edge to the reference face's side planes.
  const tx = r2.x - r1.x
  const ty = r2.y - r1.y
  const tl = hyp(tx, ty) || 1
  const ux = tx / tl
  const uy = ty / tl
  let ax = i1.x
  let ay = i1.y
  let bx = i2.x
  let by = i2.y
  let da = ux * (ax - r1.x) + uy * (ay - r1.y)
  let db = ux * (bx - r1.x) + uy * (by - r1.y)
  if (da < 0 && db < 0) return
  if (da > tl && db > tl) return
  if (da < 0) {
    const t = da / (da - db)
    ax += (bx - ax) * t
    ay += (by - ay) * t
    da = 0
  } else if (db < 0) {
    const t = db / (db - da)
    bx += (ax - bx) * t
    by += (ay - by) * t
    db = 0
  }
  if (da > tl) {
    const t = (da - tl) / (da - db)
    ax += (bx - ax) * t
    ay += (by - ay) * t
  } else if (db > tl) {
    const t = (db - tl) / (db - da)
    bx += (ax - bx) * t
    by += (ay - by) * t
  }

  const sign = refIsWall ? 1 : -1
  const sepA = n.x * (ax - r1.x) + n.y * (ay - r1.y)
  if (sepA <= margin) out.push({ x: ax, y: ay, nx: n.x * sign, ny: n.y * sign, sep: sepA })
  const sepB = n.x * (bx - r1.x) + n.y * (by - r1.y)
  if (sepB <= margin && hyp(bx - ax, by - ay) > 0.01) {
    out.push({ x: bx, y: by, nx: n.x * sign, ny: n.y * sign, sep: sepB })
  }
}

/** Distance from a point to a polygon (0 inside). */
export function distToPoly(p: Poly, x: number, y: number): number {
  let inside = true
  let best = Infinity
  const n = p.pts.length
  for (let i = 0; i < n; i++) {
    const a = p.pts[i]
    const b = p.pts[(i + 1) % n]
    const m = p.nrm[i]
    if (!a || !b || !m) continue
    if (m.x * (x - a.x) + m.y * (y - a.y) > 0) inside = false
    const ex = b.x - a.x
    const ey = b.y - a.y
    const l2 = ex * ex + ey * ey || 1
    let t = ((x - a.x) * ex + (y - a.y) * ey) / l2
    t = t < 0 ? 0 : t > 1 ? 1 : t
    const d = hyp(x - (a.x + ex * t), y - (a.y + ey * t))
    if (d < best) best = d
  }
  return inside ? 0 : best
}

/** Length of (x, y). Math.hypot is several times slower in every engine, and this is the sim's hottest call. */
export function hyp(x: number, y: number): number {
  return Math.sqrt(x * x + y * y)
}
/** Wrap an angle to (-π, π]. */
export function wrap(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI
  while (a <= -Math.PI) a += 2 * Math.PI
  return a
}

/** True when two convex polygons overlap by more than `tol`. */
export function overlaps(a: Poly, b: Poly, tol: number): boolean {
  if (a.minx > b.maxx || b.minx > a.maxx || a.miny > b.maxy || b.miny > a.maxy) return false
  if (maxSeparation(a, b).sep > -tol) return false
  return maxSeparation(b, a).sep <= -tol
}
