/** The load's geometry, built once from its grid cells. Everything is in the body frame, origin at the centroid. */
export interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** A grip point on the load's edge, with the outward normal an ant there stands along. */
export interface Site {
  x: number
  y: number
  nx: number
  ny: number
}

export interface Shape {
  cell: number
  cellCount: number
  /** Convex pieces for collision. */
  rects: Rect[]
  sites: Site[]
  /** Mean squared distance of the load's area from its centroid (sets how hard it is to spin). */
  rg2: number
  /** Furthest corner from the centroid. */
  radius: number
  /** Centroid in grid units (cell coordinates times cell size), for the editor. */
  cx: number
  cy: number
}

const key = (x: number, y: number): number => y * 4096 + x

export function buildShape(
  cells: readonly (readonly [number, number])[],
  cell: number,
  spacing = 7
): Shape {
  const filled = new Set<number>()
  const unique: [number, number][] = []
  for (const [x, y] of cells) {
    const k = key(x, y)
    if (filled.has(k)) continue
    filled.add(k)
    unique.push([x, y])
  }
  let sx = 0
  let sy = 0
  for (const [x, y] of unique) {
    sx += (x + 0.5) * cell
    sy += (y + 0.5) * cell
  }
  const n = Math.max(1, unique.length)
  const cx = sx / n
  const cy = sy / n

  // Rects: a cover of overlapping maximal rectangles, grown from each uncovered cell. Overlap (rather than a
  // partition) keeps seams off the load's straight edges, so a wall corner sliding along one never snags.
  const has = (x: number, y: number): boolean => filled.has(key(x, y))
  const rowFull = (xa: number, xb: number, y: number): boolean => {
    for (let x = xa; x <= xb; x++) if (!has(x, y)) return false
    return true
  }
  const colFull = (ya: number, yb: number, x: number): boolean => {
    for (let y = ya; y <= yb; y++) if (!has(x, y)) return false
    return true
  }
  const grow = (sx0: number, sy0: number, wide: boolean): [number, number, number, number] => {
    let x0 = sx0
    let x1 = sx0
    let y0 = sy0
    let y1 = sy0
    for (let pass = 0; pass < 2; pass++) {
      if ((pass === 0) === wide) {
        while (colFull(y0, y1, x0 - 1)) x0--
        while (colFull(y0, y1, x1 + 1)) x1++
      } else {
        while (rowFull(x0, x1, y0 - 1)) y0--
        while (rowFull(x0, x1, y1 + 1)) y1++
      }
    }
    return [x0, y0, x1, y1]
  }
  const covered = new Set<number>()
  const rects: Rect[] = []
  for (const [x, y] of unique) {
    if (covered.has(key(x, y))) continue
    const a = grow(x, y, true)
    const b = grow(x, y, false)
    const areaA = (a[2] - a[0] + 1) * (a[3] - a[1] + 1)
    const areaB = (b[2] - b[0] + 1) * (b[3] - b[1] + 1)
    const [x0, y0, x1, y1] = areaA >= areaB ? a : b
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) covered.add(key(xx, yy))
    rects.push({
      x0: x0 * cell - cx,
      y0: y0 * cell - cy,
      x1: (x1 + 1) * cell - cx,
      y1: (y1 + 1) * cell - cy,
    })
  }

  // Sites: along every cell edge that faces empty space.
  const per = Math.max(1, Math.round(cell / spacing))
  const sites: Site[] = []
  const sides: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]
  for (const [x, y] of unique) {
    for (const [dx, dy] of sides) {
      if (filled.has(key(x + dx, y + dy))) continue
      const mx = (x + 0.5 + dx * 0.5) * cell - cx
      const my = (y + 0.5 + dy * 0.5) * cell - cy
      for (let k = 0; k < per; k++) {
        const t = ((k + 0.5) / per - 0.5) * cell
        sites.push({ x: mx + -dy * t, y: my + dx * t, nx: dx, ny: dy })
      }
    }
  }

  let rg2 = 0
  let radius = 0
  for (const [x, y] of unique) {
    const px = (x + 0.5) * cell - cx
    const py = (y + 0.5) * cell - cy
    rg2 += px * px + py * py
    const far = Math.hypot(Math.abs(px) + cell / 2, Math.abs(py) + cell / 2)
    if (far > radius) radius = far
  }
  rg2 = rg2 / n + (cell * cell) / 6

  return { cell, cellCount: unique.length, rects, sites, rg2, radius, cx, cy }
}

/** True when every cell is reachable from the first through shared edges. */
export function isConnected(cells: readonly (readonly [number, number])[]): boolean {
  const filled = new Set<number>()
  for (const [x, y] of cells) filled.add(key(x, y))
  const first = cells[0]
  if (!first) return false
  const seen = new Set<number>([key(first[0], first[1])])
  const stack: [number, number][] = [[first[0], first[1]]]
  while (stack.length) {
    const top = stack.pop()
    if (!top) break
    const [x, y] = top
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const k = key(x + dx, y + dy)
      if (!filled.has(k) || seen.has(k)) continue
      seen.add(k)
      stack.push([x + dx, y + dy])
    }
  }
  return seen.size === filled.size
}
