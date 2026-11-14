import { createHash, randomInt } from 'node:crypto'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import {
  checkPuzzle,
  DEFAULT_PARAMS,
  fastestPossible,
  PRESETS,
  puzzleSchema,
  type Puzzle,
} from '@app/sim'
import { hasEnv } from './env'
import { allow, cached, makeCache } from './limits'
import { log } from './logger'
import { prisma } from './prisma'
import { cleanTitle } from './titles'
import { publicProcedure, router } from './trpc'

const HOUR = 60 * 60 * 1000
const PAGE = 48
/** Three different visitors reporting a puzzle hide it until an admin looks. */
const REPORTS_TO_HIDE = 3
/** A dragged load moves at most about this fast, units per second (the drag spring's top speed). */
const HAND_SPEED = 330

export interface PuzzleCard {
  id: string
  title: string
  puzzle: Puzzle
  preset: boolean
  antRuns: number
  antBest: number | null
  handRuns: number
  handBest: number | null
  createdAt: Date
}

export interface PuzzleDetail extends PuzzleCard {
  antMedian: number | null
  handMedian: number | null
}

interface Row {
  id: string
  title: string
  data: unknown
  preset: boolean
  antRuns: number
  antBest: number | null
  handRuns: number
  handBest: number | null
  createdAt: Date
}

const columns = {
  id: true,
  title: true,
  data: true,
  preset: true,
  antRuns: true,
  antBest: true,
  handRuns: true,
  handBest: true,
  createdAt: true,
} as const

/** A stored row as a card. The JSON column is checked on the way out: a row that no longer parses is skipped. */
function toCard(row: Row): PuzzleCard | null {
  const parsed = puzzleSchema.safeParse(row.data)
  if (!parsed.success) {
    log.warn(`puzzle ${row.id} no longer matches the puzzle schema; skipped`)
    return null
  }
  const { data: _data, ...rest } = row
  return { ...rest, puzzle: parsed.data }
}

function present<T>(value: T | null): value is T {
  return value !== null
}

export function hashPuzzle(puzzle: Puzzle): string {
  return createHash('sha256').update(JSON.stringify(puzzle)).digest('hex')
}

const ID_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz'

function newId(): string {
  let id = ''
  for (let i = 0; i < 8; i++) id += ID_ALPHABET[randomInt(ID_ALPHABET.length)] ?? 'x'
  return id
}

/**
 * The built-in puzzles are code (PRESETS). A built-in gets a row the first time a run is recorded
 * for it, and only so its runs can be counted like anyone's; the row's data is never read back.
 */
async function ensurePresetRow(id: string): Promise<Puzzle | null> {
  const preset = PRESETS.find((p) => p.id === id)
  if (!preset) return null
  const hash = hashPuzzle(preset.puzzle)
  const existing = await prisma.puzzle.findUnique({ where: { id }, select: { hash: true } })
  if (existing?.hash !== hash) {
    // Someone may have published the identical puzzle first: the built-in takes the hash.
    await prisma.puzzle.deleteMany({ where: { hash, id: { not: id } } })
    await prisma.puzzle.upsert({
      where: { id },
      create: { id, title: preset.title, data: preset.puzzle, hash, preset: true },
      update: { title: preset.title, data: preset.puzzle, hash, preset: true, hidden: false },
    })
  }
  return preset.puzzle
}

const EPOCH = new Date(0)

/** A built-in as a card: the puzzle from code, the numbers from its row when it has one. */
function presetCard(id: string, row: Row | undefined): PuzzleCard | null {
  const preset = PRESETS.find((p) => p.id === id)
  if (!preset) return null
  return {
    id,
    title: preset.title,
    puzzle: preset.puzzle,
    preset: true,
    antRuns: row?.antRuns ?? 0,
    antBest: row?.antBest ?? null,
    handRuns: row?.handRuns ?? 0,
    handBest: row?.handBest ?? null,
    createdAt: EPOCH,
  }
}

const medianRows = z.array(z.object({ kind: z.enum(['ANTS', 'HANDS']), median: z.number() }))

interface ListPage {
  presets: PuzzleCard[]
  community: PuzzleCard[]
  more: boolean
}
const lists = makeCache<ListPage>()
const details = makeCache<PuzzleDetail | null>()

/** Forget what the gallery has cached: the lists, and the details too unless told otherwise. */
export function forgetPuzzles(listsOnly = false): void {
  lists.entries.clear()
  if (!listsOnly) details.entries.clear()
}

export const puzzlesRouter = router({
  /** The built-in puzzles, in their own order, and a page of published ones. */
  list: publicProcedure
    .input(
      z.object({
        sort: z.enum(['new', 'played']).default('played'),
        page: z.number().int().min(0).max(500).default(0),
      })
    )
    .query(({ input }) =>
      cached(lists, `${input.sort}:${input.page}`, 15_000, async (): Promise<ListPage> => {
        const [presets, community] = await Promise.all([
          input.page === 0
            ? prisma.puzzle.findMany({ where: { preset: true }, select: columns })
            : Promise.resolve([]),
          prisma.puzzle.findMany({
            where: { preset: false, hidden: false },
            select: columns,
            orderBy:
              input.sort === 'new'
                ? [{ createdAt: 'desc' }]
                : [{ antRuns: 'desc' }, { createdAt: 'desc' }],
            skip: input.page * PAGE,
            take: PAGE + 1,
          }),
        ])
        return {
          presets:
            input.page === 0
              ? PRESETS.map((p) =>
                  presetCard(
                    p.id,
                    presets.find((row) => row.id === p.id)
                  )
                ).filter(present)
              : [],
          community: community.slice(0, PAGE).map(toCard).filter(present),
          more: community.length > PAGE,
        }
      })
    ),

  /** One puzzle with its numbers, or null when there is none (or it is hidden). */
  get: publicProcedure.input(z.object({ id: z.string().min(1).max(40) })).query(({ input }) =>
    cached(details, input.id, 10_000, async (): Promise<PuzzleDetail | null> => {
      const row = await prisma.puzzle.findFirst({
        where: { id: input.id, hidden: false },
        select: columns,
      })
      const card = presetCard(input.id, row ?? undefined) ?? (row ? toCard(row) : null)
      if (!card) return null
      const medians = medianRows.parse(
        await prisma.$queryRaw`
          SELECT kind::text AS kind, percentile_cont(0.5) WITHIN GROUP (ORDER BY seconds)::float8 AS median
          FROM run WHERE puzzle_id = ${input.id} GROUP BY kind`
      )
      return {
        ...card,
        antMedian: medians.find((m) => m.kind === 'ANTS')?.median ?? null,
        handMedian: medians.find((m) => m.kind === 'HANDS')?.median ?? null,
      }
    })
  ),

  /** Publish a puzzle from the editor. The same puzzle published twice gets the first one's id. */
  publish: publicProcedure
    .input(z.object({ title: z.string().max(200), puzzle: puzzleSchema }))
    .mutation(async ({ input, ctx }) => {
      if (hasEnv('PUBLISH_OFF')) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message:
            'Publishing is switched off for now. Your puzzle is still saved in this browser.',
        })
      }
      const cleaned = cleanTitle(input.title)
      if ('problem' in cleaned)
        throw new TRPCError({ code: 'BAD_REQUEST', message: cleaned.problem })
      const problem = checkPuzzle(input.puzzle)
      if (problem) throw new TRPCError({ code: 'BAD_REQUEST', message: problem })
      const hash = hashPuzzle(input.puzzle)
      const builtIn = PRESETS.find((p) => hashPuzzle(p.puzzle) === hash)
      if (builtIn) return { id: builtIn.id, existed: true }
      const existing = await prisma.puzzle.findUnique({
        where: { hash },
        select: { id: true, hidden: true },
      })
      if (existing && !existing.hidden) return { id: existing.id, existed: true }
      if (existing)
        throw new TRPCError({ code: 'FORBIDDEN', message: 'This puzzle was taken down.' })
      if (!allow(ctx.who, 'publish', 8, HOUR)) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: 'That is a lot of puzzles in one hour. Try again later.',
        })
      }
      // Dynamic import: the checker spawns a worker thread, which only the real server process can do.
      const { checkSolvable, RouteCheckBusy } = await import('./route-check')
      let solvable: boolean
      try {
        solvable = await checkSolvable(input.puzzle)
      } catch (error) {
        if (error instanceof RouteCheckBusy) {
          throw new TRPCError({
            code: 'TOO_MANY_REQUESTS',
            message: `${error.message} Try again in a minute.`,
          })
        }
        throw error
      }
      if (!solvable) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message:
            'No way through: the load can’t reach the nest however it is turned. Widen a gap or shrink the load.',
        })
      }
      for (let attempt = 0; attempt < 4; attempt++) {
        const id = newId()
        const taken = await prisma.puzzle.findUnique({ where: { id }, select: { id: true } })
        if (taken) continue
        await prisma.puzzle.create({
          data: { id, title: cleaned.title, data: input.puzzle, hash, ipHash: ctx.who },
        })
        forgetPuzzles(true)
        return { id, existed: false }
      }
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Could not pick an id for the puzzle. Try again.',
      })
    }),

  /** Flag a published puzzle. Each visitor counts once; enough flags hide it. */
  report: publicProcedure
    .input(z.object({ id: z.string().min(1).max(40) }))
    .mutation(async ({ input, ctx }) => {
      if (!allow(ctx.who, 'report', 20, HOUR)) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: 'Too many reports. Try again later.',
        })
      }
      const puzzle = await prisma.puzzle.findUnique({
        where: { id: input.id },
        select: { preset: true },
      })
      if (!puzzle || puzzle.preset) return { ok: true }
      const created = await prisma.report.createMany({
        data: [{ puzzleId: input.id, ipHash: ctx.who }],
        skipDuplicates: true,
      })
      if (created.count > 0) {
        const updated = await prisma.puzzle.update({
          where: { id: input.id },
          data: { reports: { increment: 1 } },
          select: { reports: true },
        })
        if (updated.reports >= REPORTS_TO_HIDE) {
          await prisma.puzzle.update({ where: { id: input.id }, data: { hidden: true } })
          forgetPuzzles()
        }
      }
      return { ok: true }
    }),

  /**
   * Record a delivery. Only runs of the puzzle as published count (the page sends nothing else),
   * and a time faster than the straight line allows is dropped.
   */
  record: publicProcedure
    .input(
      z.object({
        id: z.string().min(1).max(40),
        kind: z.enum(['ANTS', 'HANDS']),
        seconds: z
          .number()
          .finite()
          .positive()
          .max(6 * 3600),
        seed: z.number().int().min(0).max(1_000_000),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!allow(ctx.who, 'record', 60, HOUR)) return { ok: false }
      let puzzle = await ensurePresetRow(input.id)
      if (!puzzle) {
        const row = await prisma.puzzle.findFirst({
          where: { id: input.id, hidden: false },
          select: { data: true },
        })
        const parsed = row ? puzzleSchema.safeParse(row.data) : null
        if (!parsed?.success) return { ok: false }
        puzzle = parsed.data
      }
      const speed = input.kind === 'ANTS' ? DEFAULT_PARAMS.carrySpeed * 1.05 : HAND_SPEED
      if (input.seconds < fastestPossible(puzzle, speed)) return { ok: false }
      await prisma.run.create({
        data: {
          puzzleId: input.id,
          kind: input.kind,
          seconds: input.seconds,
          seed: input.seed,
          ipHash: ctx.who,
        },
      })
      if (input.kind === 'ANTS') {
        await prisma.$executeRaw`
          UPDATE puzzle SET ant_runs = ant_runs + 1, ant_best = LEAST(COALESCE(ant_best, ${input.seconds}), ${input.seconds})
          WHERE id = ${input.id}`
      } else {
        await prisma.$executeRaw`
          UPDATE puzzle SET hand_runs = hand_runs + 1, hand_best = LEAST(COALESCE(hand_best, ${input.seconds}), ${input.seconds})
          WHERE id = ${input.id}`
      }
      return { ok: true }
    }),
})
