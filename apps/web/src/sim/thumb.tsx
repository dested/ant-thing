import { buildShape, NEST_R, segmentPoly, WALL_T, type Puzzle } from '@app/sim'

/** A puzzle as a still: floor, walls, load, nest. Plain SVG, so it renders on the server too. */
export function PuzzleThumb({ puzzle, className }: { puzzle: Puzzle; className?: string }) {
  const shape = buildShape(puzzle.load.cells, puzzle.load.cell)
  const turn = (puzzle.load.a * 180) / Math.PI
  return (
    <svg viewBox={`0 0 ${puzzle.w} ${puzzle.h}`} className={className} role="img" aria-label="The puzzle, seen from above">
      <rect width={puzzle.w} height={puzzle.h} className="fill-card" />
      {puzzle.walls.map(([x1, y1, x2, y2], i) => (
        <polygon
          key={i}
          points={segmentPoly(x1, y1, x2, y2, WALL_T)
            .pts.map(p => `${p.x},${p.y}`)
            .join(' ')}
          className="fill-foreground/75"
        />
      ))}
      <circle
        cx={puzzle.nest.x}
        cy={puzzle.nest.y}
        r={NEST_R}
        fill="none"
        className="stroke-foreground/60"
        strokeWidth={3}
        strokeDasharray="8 8"
      />
      <circle cx={puzzle.nest.x} cy={puzzle.nest.y} r={12} className="fill-foreground" />
      <g transform={`translate(${puzzle.load.x} ${puzzle.load.y}) rotate(${turn})`} className="fill-load">
        {shape.rects.map((r, i) => (
          <rect key={i} x={r.x0} y={r.y0} width={r.x1 - r.x0} height={r.y1 - r.y0} />
        ))}
      </g>
      <rect width={puzzle.w} height={puzzle.h} fill="none" className="stroke-foreground/60" strokeWidth={4} />
    </svg>
  )
}
