import { router } from './trpc'
import { demoRouter } from './demo' // demo

export const appRouter = router({
  posts: demoRouter, // demo
})

export type AppRouter = typeof appRouter
