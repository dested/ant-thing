import { adminRouter } from './admin'
import { peopleRouter } from './people'
import { puzzlesRouter } from './puzzles'
import { router } from './trpc'

export const appRouter = router({
  puzzles: puzzlesRouter,
  admin: adminRouter,
  people: peopleRouter,
})

export type AppRouter = typeof appRouter
