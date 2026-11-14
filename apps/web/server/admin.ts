import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { env } from './env'
import { allow } from './limits'
import { prisma } from './prisma'
import { forgetPuzzles } from './puzzles'
import { publicProcedure, router } from './trpc'
import { sameSecret } from './who'

const token = z.string().min(1).max(200)

/** Throws unless `given` is the ADMIN_TOKEN. With no token configured, nobody is admin. */
function requireAdmin(given: string, who: string): void {
  if (!allow(who, 'admin', 30, 60_000)) {
    throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Too many tries. Wait a minute.' })
  }
  const expected = env.ADMIN_TOKEN
  if (!expected || !sameSecret(given, expected)) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'That is not the admin token.' })
  }
}

export const adminRouter = router({
  /** Published puzzles, newest first, hidden ones included. */
  puzzles: publicProcedure
    .input(z.object({ token, page: z.number().int().min(0).max(1000).default(0) }))
    .query(async ({ input, ctx }) => {
      requireAdmin(input.token, ctx.who)
      const [rows, total, runs] = await Promise.all([
        prisma.puzzle.findMany({
          where: { preset: false },
          orderBy: [{ hidden: 'desc' }, { reports: 'desc' }, { createdAt: 'desc' }],
          skip: input.page * 100,
          take: 100,
          select: {
            id: true,
            title: true,
            hidden: true,
            reports: true,
            antRuns: true,
            handRuns: true,
            createdAt: true,
          },
        }),
        prisma.puzzle.count({ where: { preset: false } }),
        prisma.run.count(),
      ])
      return { rows, total, runs }
    }),

  setHidden: publicProcedure
    .input(z.object({ token, id: z.string().min(1).max(40), hidden: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(input.token, ctx.who)
      await prisma.puzzle.update({
        where: { id: input.id },
        data: input.hidden
          ? { hidden: true }
          : { hidden: false, reports: 0, flags: { deleteMany: {} } },
      })
      forgetPuzzles()
      return { ok: true }
    }),

  remove: publicProcedure
    .input(z.object({ token, id: z.string().min(1).max(40) }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(input.token, ctx.who)
      await prisma.puzzle.deleteMany({ where: { id: input.id, preset: false } })
      forgetPuzzles()
      return { ok: true }
    }),
})
