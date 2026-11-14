# Ant Movers

A colony of simulated ants carries a T-shaped load through two narrow slits, the puzzle from the Weizmann Institute's ants-versus-humans experiment. No ant knows what a wall is and nothing plans the route: each ant follows a few local rules taken from the lab's papers, and the colony gets the load through.

**Live: https://ant.dested.com**

- Watch a colony, be one of the ants, or drag the load through yourself.
- Eight debug views: roles, scent, the load's path, every pull, net force and wall contacts, ant traffic, the planner's route, and a map of the load's whole configuration space with the colony's path on it.
- Race 48 colonies at once, one worker per core, and replay any of them.
- Build your own puzzle (walls, pegs, mazes, any load shape) and publish it. An exhaustive search checks that a way through exists before it goes up.
- The charts on the page can be rerun in your own browser.

## How the ants work

| Rule                     | What she does                                                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Bite and pull            | An ant at a free spot on the load's edge bites. Outward pull: she pulls. Inward: she lifts, which cuts friction. Ants never push. |
| A newcomer knows the way | For about ten seconds after biting she pulls toward the nest, with her own error.                                                 |
| Then she goes along      | After that she turns her pull toward the way her own grip point is already moving.                                                |
| Scent                    | Ants leaving the nest mark how long ago they left. A newcomer reads home off the marks near the load. Marks stop at walls.        |
| Letting go               | After about two minutes, sooner when stuck, at once when pressed against a wall.                                                  |

The engine is `packages/sim`: a deterministic TypeScript package with no dependencies but zod. `packages/sim/src/params.ts` lists every number the behaviour depends on. The page says plainly which parts are measured and which are guessed.

## Run it

```bash
bun install
cp .env.example .env        # point DATABASE_URL at a local Postgres
createdb ant_thing
bun run db:deploy
bun run dev                 # http://localhost:7268
```

Headless trials, from `packages/sim`:

```bash
bun bench/run.ts --puzzle piano-movers --seeds 32 --max 1800 --jobs 16
bun bench/run.ts --puzzle piano-movers --seeds 32 --max 1800 --set conformity=0   # nothing moves
bun bench/science.ts > ../../apps/web/src/science/data.json                        # the page's charts
```

Checks: `bun run typecheck`, `bun run test`, `bun run test:e2e`.

## Sources

- Dreyer, Haluts, Korman, Gov, Fonio, Feinerman. Comparing cooperative geometric puzzle solving in ants versus humans. PNAS 122 (2025). https://doi.org/10.1073/pnas.2414274121
- Gelblum, Pinkoviezky, Fonio, Ghosh, Gov, Feinerman. Ant groups optimally amplify the effect of transiently informed individuals. Nature Communications 6 (2015). https://doi.org/10.1038/ncomms8729
- Fonio, Heyman, Boczkowski, Gelblum, Kosowski, Korman, Feinerman. A locally-blazed ant trail achieves efficient collective navigation despite limited information. eLife 5 (2016). https://doi.org/10.7554/eLife.20185
- Gelblum, Pinkoviezky, Fonio, Gov, Feinerman. Emergent oscillations assist obstacle negotiation during ant cooperative transport. PNAS 113 (2016). https://arxiv.org/abs/2107.09508

## Built on

[sal-starter](https://github.com/dested/sal-starter): Bun, Express 5 + Vite SSR, React 19, React Router 8, tRPC, Prisma + Postgres, Tailwind v4. `CLAUDE.md` and `cliffnotes.md` are the maps for anyone (or any agent) changing the code.

## License

MIT
