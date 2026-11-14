import { LIMITS, type Puzzle } from '@app/sim'
import { useMutation } from '@tanstack/react-query'
import { Redo2, Undo2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLoaderData, useNavigate } from 'react-router'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Chip, Segmented } from '~/components/ui/segmented'
import { Slider } from '~/components/ui/slider'
import {
  blankDraft,
  centred,
  loadDraft,
  resized,
  saveDraft,
  SHAPES,
  withMaze,
  type Draft,
} from '~/editor/draft'
import { EditorCanvas, type Tool } from '~/editor/editor-canvas'
import { ShapePainter } from '~/editor/shape-painter'
import { useSolve } from '~/editor/use-solve'
import { useTRPC } from '~/lib/trpc'
import { Lab } from '~/sim/lab'

const TOOLS: readonly { value: Tool; label: string }[] = [
  { value: 'wall', label: 'Wall' },
  { value: 'peg', label: 'Peg' },
  { value: 'erase', label: 'Erase' },
]

function Knob({
  label,
  value,
  shown,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  shown: string
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm">{label}</span>
        <span className="tabular text-sm font-medium">{shown}</span>
      </div>
      <Slider
        aria-label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        onValueChange={(next) => onChange(next)}
      />
    </div>
  )
}

export function BuildPage() {
  const { from } = useLoaderData<{ from: Draft | null }>()
  const [draft, setDraft] = useState<Draft>(() => from ?? blankDraft())
  const [undo, setUndo] = useState<Puzzle[]>([])
  const [redo, setRedo] = useState<Puzzle[]>([])
  const [tool, setTool] = useState<Tool>('wall')
  const [showRoute, setShowRoute] = useState(false)
  const [testing, setTesting] = useState(false)
  const lastStroke = useRef('')
  const navigate = useNavigate()
  const trpc = useTRPC()
  const solve = useSolve(draft.puzzle)
  const publish = useMutation(
    trpc.puzzles.publish.mutationOptions({
      onSuccess: ({ id }) => navigate(id === 'piano-movers' ? '/' : `/p/${id}`),
    })
  )

  // The draft kept in this browser replaces the starter, unless the page was opened on someone's puzzle.
  useEffect(() => {
    if (from) return
    const kept = loadDraft()
    if (kept) setDraft(kept)
  }, [from])

  useEffect(() => {
    const timer = window.setTimeout(() => saveDraft(draft), 300)
    return () => window.clearTimeout(timer)
  }, [draft])

  /** Apply a change. Changes that share a stroke (one drag, one slider) are one undo step. */
  const edit = (next: Puzzle, stroke: string): void => {
    if (stroke !== lastStroke.current) {
      lastStroke.current = stroke
      setUndo((stack) => [...stack.slice(-99), draft.puzzle])
      setRedo([])
    }
    setDraft((d) => ({ ...d, puzzle: next }))
    publish.reset()
  }
  const once = (next: Puzzle): void => edit(next, `once${Date.now()}`)

  const stepBack = (): void => {
    const previous = undo[undo.length - 1]
    if (!previous) return
    lastStroke.current = ''
    setUndo(undo.slice(0, -1))
    setRedo([...redo, draft.puzzle])
    setDraft((d) => ({ ...d, puzzle: previous }))
  }
  const stepForward = (): void => {
    const next = redo[redo.length - 1]
    if (!next) return
    lastStroke.current = ''
    setRedo(redo.slice(0, -1))
    setUndo([...undo, draft.puzzle])
    setDraft((d) => ({ ...d, puzzle: next }))
  }

  useEffect(() => {
    const key = (e: KeyboardEvent): void => {
      const target = e.target
      if (target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return
      e.preventDefault()
      if (e.shiftKey) stepForward()
      else stepBack()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })

  const { puzzle } = draft

  if (testing) {
    return (
      <Lab puzzle={puzzle} title={draft.title.trim() || 'Untitled puzzle'}>
        <Button onClick={() => setTesting(false)}>Back to the editor</Button>
      </Lab>
    )
  }

  const ready = !solve.checking && !solve.problem && solve.solvable
  const named = draft.title.trim().length >= 3

  return (
    <section className="grid lg:h-[calc(100svh-3rem)] lg:min-h-[34rem] lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="relative aspect-[3/2] min-h-0 overflow-hidden lg:aspect-auto">
        <EditorCanvas
          puzzle={puzzle}
          tool={tool}
          path={showRoute && ready ? solve.path : null}
          onEdit={edit}
          className="absolute inset-0 size-full"
        />
      </div>

      <aside className="flex min-h-0 flex-col border-t lg:border-t-0 lg:border-l">
        <div className="flex flex-col gap-5 p-5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          <h1 className="font-display text-2xl leading-tight font-bold">Build a puzzle</h1>

          <div className="flex items-center gap-2">
            <Segmented
              label="Tool"
              value={tool}
              options={TOOLS}
              onChange={setTool}
              className="flex-1"
            />
            <Button
              size="icon"
              variant="outline"
              aria-label="Undo"
              disabled={undo.length === 0}
              onClick={stepBack}
              className="size-8 shrink-0 border-input bg-transparent shadow-none">
              <Undo2 />
            </Button>
            <Button
              size="icon"
              variant="outline"
              aria-label="Redo"
              disabled={redo.length === 0}
              onClick={stepForward}
              className="size-8 shrink-0 border-input bg-transparent shadow-none">
              <Redo2 />
            </Button>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => once(withMaze(puzzle, 1 + Math.floor(Math.random() * 100000)))}
              className="flex-1 border-input bg-transparent shadow-none">
              New maze
            </Button>
            <Button
              variant="outline"
              disabled={puzzle.walls.length === 0}
              onClick={() => once({ ...puzzle, walls: [] })}
              className="flex-1 border-input bg-transparent shadow-none">
              Clear walls
            </Button>
          </div>

          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-4 gap-1.5">
              {SHAPES.map((shape) => (
                <button
                  key={shape.id}
                  type="button"
                  onClick={() =>
                    once({ ...puzzle, load: { ...puzzle.load, cells: centred(shape.cells) } })
                  }
                  className="h-7 cursor-pointer rounded-md border border-input text-sm font-medium hover:bg-accent">
                  {shape.label}
                </button>
              ))}
            </div>
            <ShapePainter
              cells={puzzle.load.cells}
              onChange={(cells, stroke) =>
                edit({ ...puzzle, load: { ...puzzle.load, cells } }, stroke)
              }
            />
            <Knob
              label="Load size"
              value={puzzle.load.cell}
              shown={`${puzzle.load.cell}`}
              min={LIMITS.minCell}
              max={LIMITS.maxCell}
              step={1}
              onChange={(cell) => edit({ ...puzzle, load: { ...puzzle.load, cell } }, 'cell')}
            />
          </div>

          <div className="flex flex-col gap-3">
            <Knob
              label="Arena width"
              value={puzzle.w}
              shown={`${puzzle.w}`}
              min={LIMITS.minW}
              max={LIMITS.maxW}
              step={20}
              onChange={(w) => edit(resized(puzzle, w, puzzle.h), 'w')}
            />
            <Knob
              label="Arena height"
              value={puzzle.h}
              shown={`${puzzle.h}`}
              min={LIMITS.minH}
              max={LIMITS.maxH}
              step={20}
              onChange={(h) => edit(resized(puzzle, puzzle.w, h), 'h')}
            />
            <Knob
              label="Ants"
              value={puzzle.ants}
              shown={`${puzzle.ants}`}
              min={LIMITS.minAnts}
              max={LIMITS.maxAnts}
              step={10}
              onChange={(ants) => edit({ ...puzzle, ants }, 'ants')}
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t p-5">
          <div className="flex min-h-8 items-center justify-between gap-3" aria-live="polite">
            {solve.checking ? (
              <p className="text-sm text-muted-foreground">Looking for a way through</p>
            ) : solve.problem ? (
              <p className="text-sm font-medium text-destructive">{solve.problem}</p>
            ) : solve.solvable ? (
              <>
                <p className="text-sm font-medium text-success">There is a way through</p>
                <Chip pressed={showRoute} onChange={setShowRoute} className="flex-none">
                  Show it
                </Chip>
              </>
            ) : (
              <p className="text-sm font-medium text-destructive">
                No way through: however the load is turned, it can’t reach the nest. Widen a gap or
                shrink the load.
              </p>
            )}
          </div>

          <Input
            aria-label="Name"
            placeholder="Name"
            maxLength={48}
            value={draft.title}
            onChange={(e) => {
              setDraft((d) => ({ ...d, title: e.target.value }))
              publish.reset()
            }}
          />
          {publish.isError && (
            <p className="text-sm font-medium text-destructive">{publish.error.message}</p>
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={Boolean(solve.problem)}
              onClick={() => setTesting(true)}
              className="flex-1 border-input bg-transparent shadow-none">
              Test it
            </Button>
            <Button
              disabled={!ready || !named || publish.isPending}
              onClick={() => publish.mutate({ title: draft.title, puzzle })}
              className="flex-1">
              {publish.isPending ? 'Publishing' : 'Publish'}
            </Button>
          </div>
        </div>
      </aside>
    </section>
  )
}
