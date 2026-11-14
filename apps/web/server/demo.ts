// demo: the template's Post demo router (and the marker scripts/demo.ts checks:
// while this file exists, a fork's build and tests fail). `bun run demo:drop`
// deletes it with the rest of the demo; copy the pattern, not the feature.
import { z } from 'zod'
import { router, publicProcedure } from './trpc'
import { prisma } from './prisma'

export const demoRouter = router({
  list: publicProcedure.query(async () => {
    const rows = await prisma.post.findMany({
      take: 50,
      orderBy: { createdAt: 'desc' },
    })
    // `createdAt` stays a Date — superjson carries it over the wire and
    // through SSR hydration. Format it deterministically (UTC) when rendering
    // so server and client markup match.
    return rows.map((p) => ({
      id: p.id,
      title: p.title,
      content: p.content,
      createdAt: p.createdAt,
    }))
  }),
  create: publicProcedure
    .input(
      z.object({
        title: z.string().min(1).max(200),
        content: z.string().min(1).max(2000),
      })
    )
    .mutation(({ input }) => prisma.post.create({ data: input })),
})
