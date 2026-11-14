import { adminRouter } from './admin'
import { puzzlesRouter } from './puzzles'
import { router } from './trpc'

export const appRouter = router({
  puzzles: puzzlesRouter,
  admin: adminRouter,
})

export type AppRouter = typeof appRouter
