# Ant Movers (ant-thing) — CliffNotes

> Living map of the project. Read this before any coding session.
> Last updated: 2026-11-14. Stack rules and template mechanics → `CLAUDE.md` · look → `ui.md` · why → `decisions.md` · the build plan and findings → `plans/2026-11-13-ant-movers.md`.

## What this is

A simulation of the Weizmann "ants vs humans" piano-movers experiment: a colony of ants carries a T-shaped load through two slits, by local rules only (no planner touches the load). Around it: a puzzle editor, a public gallery with solve stats, a colony race that uses every core, debug views, and a science section with rerunnable charts. Live at **https://ant.dested.com** (Drydock, repo `dested/ant-thing`, public, MIT).

A sal-starter fork: web only, `--no-auth`. **Paths below are relative to `apps/web/`** unless they start with `apps/` or `packages/`.

## Quick Reference

- **Ports:** web + API **7268**, Playwright e2e **7271**. From `project.json`.
- **Dev:** `bun run dev` → http://localhost:7268 (HMR on the same port)
- **Type-check:** `bun run typecheck` · **Unit tests:** `bun run test` · **Build:** `bun run build` · **E2E:** `bun run test:e2e` (DB `ant_thing_test`; `bun run test:e2e:update` rewrites baselines)
- **Engine bench (in `packages/sim`):** `bun bench/run.ts --puzzle piano-movers --seeds 32 --max 1800 --jobs 16 [--ants n] [--set conformity=0.5,scent=false] [--json]` · one run with a log: `--seed 3 --log 5` · stuck-ant count: `bun bench/stuck.ts --puzzle maze --seeds 8` · planner: `bun bench/route.ts` · PNG snapshots: `bun bench/snap.ts`
- **Chart data:** `bun bench/science.ts > ../../apps/web/src/science/data.json` (in `packages/sim`; 23 conditions × 96 colonies, about 25 min on 20 cores)
- **Migrations:** `bun run db:migrate --name <what>` (agent shells: CLAUDE.md → Add a DB table) · `bun run db:deploy`. Never `db push`, never `bunx prisma`
- **Env:** `DATABASE_URL`, `PORT`; optional `ADMIN_TOKEN` (unset = nobody is admin), `PUBLISH_OFF=1` (kill switch for publishing)
- **Health:** `GET /healthz`
- **Look:** one theme (light), `packages/tokens/tokens.css` → `bun run tokens` → `bun run brand`

## File map (concept → path)

| Concept | Path |
| --- | --- |
| Engine: the world step, ant brain, load physics | `packages/sim/src/world.ts` |
| Every behaviour number, with a comment each | `packages/sim/src/params.ts` |
| Scent grids, wall distance field, line of sight | `packages/sim/src/field.ts` |
| Geometry: SAT contacts, polygons, `hyp` | `packages/sim/src/geom.ts` |
| Load shape from grid cells: collision rects, grip sites | `packages/sim/src/shape.ts` |
| Puzzle schema (zod), `LIMITS`, `PRESETS`, maze generator | `packages/sim/src/puzzle.ts` |
| The planner the ants don't have: `findRoute`, `mapSpace` | `packages/sim/src/solvable.ts` |
| `checkPuzzle` (is it well-formed), `fastestPossible` | `packages/sim/src/validate.ts` |
| Engine tests (determinism, presets solvable, no stuck ants) | `packages/sim/src/sim.test.ts` |
| Canvas renderer: arena, ants, every view layer, `still()`, `ghosts()` | `src/sim/renderer.ts` |
| Session: the frame loop, camera, input, modes, rule knobs | `src/sim/session.ts` |
| Lab UI: stage + panel, race panel, strip plot | `src/sim/lab.tsx`, `src/sim/stage.tsx` |
| Race: one worker per core, pool, board canvas | `src/race/race.worker.ts`, `race.ts`, `board.tsx` |
| Headless trials for the charts' "Run it on this machine" | `src/race/trials.ts` |
| Keyhole + Planner views (configuration space in a worker) | `src/space/space.worker.ts`, `use-space.ts`, `keyhole.tsx` |
| Editor: canvas, shape painter, draft, live solvability check | `src/editor/*`, page `src/app/build.tsx` |
| Science section, charts, bench data | `src/science/science.tsx`, `sweep-chart.tsx`, `data.json` |
| Gallery API: list, get, publish, record, report | `server/puzzles.ts` |
| Publish-time planner check in a Bun Worker | `server/route-check.ts`, `server/route-worker.ts` |
| Moderation API (token) + page | `server/admin.ts`, `src/app/admin.tsx` |
| Anonymous caller id (salted IP hash), rate limits, TTL cache | `server/who.ts`, `server/limits.ts` |
| Title cleaning and blocklist | `server/titles.ts` |

## Routes / URLs

Explicit in `src/app/routes.tsx`. All nest under `Layout`.

| Route | Serves | File | Loader |
| --- | --- | --- | --- |
| `/` | the lab on piano-movers + the science section | `src/app/home.tsx` | `homeLoader` (prefetch `puzzles.get`) |
| `/puzzles` | built-in puzzles + visitors' gallery (Most played / Newest) | `src/app/puzzles.tsx` | `puzzlesLoader` |
| `/p/:id` | the lab on a preset or published puzzle | `src/app/puzzle.tsx` | `puzzleLoader` (404 when unknown) |
| `/build` | the editor; `?from=<id>` opens a copy of that puzzle | `src/app/build.tsx` | `buildLoader` |
| `/admin` | moderation, asks for `ADMIN_TOKEN` (not linked) | `src/app/admin.tsx` | none |
| `/healthz` | DB health JSON | `server.ts` | |
| `/api/trpc/*` | tRPC: `puzzles.*`, `admin.*` | `server/router.ts` | |
| unmatched GET | 404 page | `src/app/error-boundary.tsx` | |

## Data model

`prisma/schema.prisma`: `Puzzle` (id, title, `data` Json = the zod `Puzzle`, `hash` unique for dedupe, `preset`, `hidden`, `reports`, run counters and bests, `ipHash`), `Run` (puzzleId, kind `ANTS`/`HANDS`, seconds, seed, ipHash), `Report` (one per puzzle per caller). Built-in puzzles are code (`PRESETS`); a preset gets a DB row lazily, only to hold stats.

## Systems

### The ant model
Each ant is free (searching, returning, in the nest) or carrying. A carrier is **informed** for about 10 s after biting (pulls toward home: scent downhill + 0.3 × straight line + personal error) and then a **conformist** (turns her pull toward her grip point's velocity). Outward pull = puller, inward = lifter. She lets go after ~120 s, sooner when stalled, at once when scraped against a wall. Nothing global steers the load. Details and what was guessed: the science section and `params.ts`.

### Physics
Overdamped rigid body, `A u = b` for `(vx, vy, ω)`; wall contacts by SAT + projected Gauss-Seidel with Coulomb friction. 60 steps per sim second. Deterministic per seed **within one JS engine** (trig differs in the last bits between V8 and JSC), so the server never replays a run.

### Speed
`session.ts` steps within a frame budget (11 ms, 28 ms at Max). The race and the charts run colonies headless in workers, one per core (`coreCount()` = cores − 1, max 16). Picking a colony in the race replays its seed in the lab, exactly.

### Server
No accounts. `ctx.who` is a salted hash of the caller's IP. Publish: zod → `checkPuzzle` → planner in a worker thread (one at a time, 30 s) → dedupe by hash. Record: a time faster than `fastestPossible` is refused. Three reports hide a puzzle. In-memory rate limits and a 15 s list cache (single instance).

## Gotchas

- A syntax error in a `server/` file stops `bun --watch` serving. Run `bun run typecheck` **and** load a page after editing server code; never put raw U+2028-range characters in a regex literal.
- The planner is conservative (lattice step 4+, 3° turns): it can call a barely-possible puzzle impossible. Publishing follows the planner.
- `world.trace` holds x, y, angle triples every 0.5 s; the renderer, the Keyhole and the race trails all read poses, never ants.
- e2e truncates every table, so nothing is seeded in the DB at boot.
- The lab panel is 20rem; anything added to it must still fit an 800 px tall window.
- Changing an engine rule changes every number on the page: rerun `bench/science.ts` and the engine tests.

## Status

- **Done:** engine + bench, lab (modes, knobs, 8 views), race, Keyhole/Planner, editor, gallery + stats + reports + admin, science section with rerunnable charts, deploy.
- **Not built:** accounts, server-side replay of runs, a phone-first layout for the editor (it works, but is built for a pointer).
- **Next:** whatever Sal asks after seeing it.
