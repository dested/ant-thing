# Ant Movers (ant-thing) — CliffNotes

> Living map of the project. Read this before any coding session.
> Last updated: 2026-11-16. Stack rules and template mechanics → `CLAUDE.md` · look → `ui.md` · why → `decisions.md` · the build plans and findings → `plans/2026-11-13-ant-movers.md`, `plans/2026-11-16-people-on-the-load.md`.

## What this is

A simulation of the Weizmann "ants vs humans" piano-movers experiment: a colony of ants carries a T-shaped load through two slits, by local rules only (no planner touches the load). Around it: live rooms where visitors carry the same load together (`/people`, the human half of the experiment), a puzzle editor, a public gallery with solve stats, a colony race that uses every core, debug views, sound, a rewind bar, shareable clips, and a science section with rerunnable charts. Live at **https://ant.dested.com** (Drydock, repo `dested/ant-thing`, public, MIT).

A sal-starter fork: web only, `--no-auth`. **Paths below are relative to `apps/web/`** unless they start with `apps/` or `packages/`.

## Quick Reference

- **Ports:** web + API **7268**, Playwright e2e **7271**. From `project.json`.
- **Dev:** `bun run dev` → http://localhost:7268 (HMR on the same port)
- **Type-check:** `bun run typecheck` · **Unit tests:** `bun run test` · **Build:** `bun run build` · **E2E:** `bun run test:e2e` (DB `ant_thing_test`; `bun run test:e2e:update` rewrites baselines)
- **Engine bench (in `packages/sim`):** `bun bench/run.ts --puzzle piano-movers --seeds 32 --max 1800 --jobs 16 [--ants n] [--set conformity=0.5,scent=false] [--json]` · one run with a log: `--seed 3 --log 5` · stuck-ant count: `bun bench/stuck.ts --puzzle maze --seeds 8` · planner: `bun bench/route.ts` · PNG snapshots: `bun bench/snap.ts`
- **Chart data:** `bun bench/science.ts > ../../apps/web/src/science/data.json` (in `packages/sim`; 22 conditions × 96 colonies, about 25 min on 20 cores)
- **Migrations:** `bun run db:migrate --name <what>` (agent shells: CLAUDE.md → Add a DB table) · `bun run db:deploy`. Never `db push`, never `bunx prisma`
- **Room stand-ins (dev only, localhost only):** `bun server/crowd.ts --people 12 --seconds 60 [--port 7268] [--skill 0.6]` in `apps/web`; prints `{people, joined, frames}` and exits 1 unless everyone got into a room. **Never point anything like it at the deployed site: rooms write the public record.**
- **Env:** `DATABASE_URL`, `PORT`; optional `ADMIN_TOKEN` (unset = nobody is admin), `PUBLISH_OFF=1` (kill switch for publishing)
- **Health:** `GET /healthz`
- **Look:** one theme (light), `packages/tokens/tokens.css` → `bun run tokens` → `bun run brand`

## File map (concept → path)

| Concept                                                               | Path                                                         |
| --------------------------------------------------------------------- | ------------------------------------------------------------ |
| Engine: the world step, ant brain, load physics                       | `packages/sim/src/world.ts`                                  |
| Every behaviour number, with a comment each                           | `packages/sim/src/params.ts`                                 |
| Scent grids, wall distance field, line of sight                       | `packages/sim/src/field.ts`                                  |
| Geometry: SAT contacts, polygons, `hyp`                               | `packages/sim/src/geom.ts`                                   |
| Load shape from grid cells: collision rects, grip sites               | `packages/sim/src/shape.ts`                                  |
| Puzzle schema (zod), `LIMITS`, `PRESETS`, maze generator              | `packages/sim/src/puzzle.ts`                                 |
| The planner the ants don't have: `findRoute`, `mapSpace`              | `packages/sim/src/solvable.ts`                               |
| `checkPuzzle` (is it well-formed), `fastestPossible`                  | `packages/sim/src/validate.ts`                               |
| Engine tests (determinism, presets solvable, no stuck ants)           | `packages/sim/src/sim.test.ts`                               |
| People on the load: grips, walking, `gateLines` / `gatesPassed`       | `packages/sim/src/people.ts` (+ `World.addPerson/hold/drop`) |
| Room wire format: binary states, client ops, JSON notices, constants  | `packages/sim/src/wire.ts`                                   |
| Room logic with no sockets in it (join, idle, rounds, results)        | `server/rooms.ts` (+ `rooms.test.ts`)                        |
| Room WebSocket endpoint, caps, the `carry` writer                     | `server/rooms-socket.ts`, `server/upgrades.ts`               |
| People results API (`people.stats`)                                   | `server/people.ts`                                           |
| Room page: client, prediction, stick input, the round's footage       | `src/people/room.ts`, page `src/app/people.tsx`              |
| People-against-ants strip plot, the colony's numbers beside it        | `src/people/people-chart.tsx`, `src/people/record.ts`        |
| Sound: every noise synthesised, one switch                            | `src/sound/sound.ts`, `sound-button.tsx`                     |
| Rewind: the tape of a lab run                                         | `src/sim/tape.ts` (+ `Session.scrub/live/shot`)              |
| Clips: 720×1280 MP4 from footage, share sheet or download             | `src/share/clip.ts`, `share-button.tsx`                      |
| Canvas renderer: arena, ants, every view layer, `still()`, `ghosts()` | `src/sim/renderer.ts`                                        |
| Session: the frame loop, camera, input, modes, rule knobs             | `src/sim/session.ts`                                         |
| Lab UI: stage + panel, race panel, strip plot                         | `src/sim/lab.tsx`, `src/sim/stage.tsx`                       |
| Race: one worker per core, pool, board canvas                         | `src/race/race.worker.ts`, `race.ts`, `board.tsx`            |
| Headless trials for the charts' "Run it on this machine"              | `src/race/trials.ts`                                         |
| Keyhole + Planner views (configuration space in a worker)             | `src/space/space.worker.ts`, `use-space.ts`, `keyhole.tsx`   |
| Editor: canvas, shape painter, draft, live solvability check          | `src/editor/*`, page `src/app/build.tsx`                     |
| Science section, charts, bench data                                   | `src/science/science.tsx`, `sweep-chart.tsx`, `data.json`    |
| Gallery API: list, get, publish, record, report                       | `server/puzzles.ts`                                          |
| Publish-time planner check in a Bun Worker                            | `server/route-check.ts`, `server/route-worker.ts`            |
| Moderation API (token) + page                                         | `server/admin.ts`, `src/app/admin.tsx`                       |
| Anonymous caller id (salted IP hash), rate limits, TTL cache          | `server/who.ts`, `server/limits.ts`                          |
| Title cleaning and blocklist                                          | `server/titles.ts`                                           |

## Routes / URLs

Explicit in `src/app/routes.tsx`. All nest under `Layout`.

| Route         | Serves                                                      | File                         | Loader                                   |
| ------------- | ----------------------------------------------------------- | ---------------------------- | ---------------------------------------- |
| `/`           | the lab on piano-movers + the science section               | `src/app/home.tsx`           | `homeLoader` (prefetch `puzzles.get`)    |
| `/puzzles`    | built-in puzzles + visitors' gallery (Most played / Newest) | `src/app/puzzles.tsx`        | `puzzlesLoader`                          |
| `/p/:id`      | the lab on a preset or published puzzle                     | `src/app/puzzle.tsx`         | `puzzleLoader` (404 when unknown)        |
| `/people`     | a live room: everyone in it holds the same load             | `src/app/people.tsx`         | `peopleLoader` (prefetch `people.stats`) |
| `/build`      | the editor; `?from=<id>` opens a copy of that puzzle        | `src/app/build.tsx`          | `buildLoader`                            |
| `/admin`      | moderation, asks for `ADMIN_TOKEN` (not linked)             | `src/app/admin.tsx`          | none                                     |
| `/healthz`    | DB health JSON                                              | `server.ts`                  |                                          |
| `/api/trpc/*` | tRPC: `puzzles.*`, `admin.*`, `people.stats`                | `server/router.ts`           |                                          |
| `/api/room`   | WebSocket (`?v=<WIRE_VERSION>`), binary: the room protocol  | `server/rooms-socket.ts`     |                                          |
| unmatched GET | 404 page                                                    | `src/app/error-boundary.tsx` |                                          |

## Data model

`prisma/schema.prisma`: `Puzzle` (id, title, `data` Json = the zod `Puzzle`, `hash` unique for dedupe, `preset`, `hidden`, `reports`, run counters and bests, `ipHash`), `Run` (puzzleId, kind `ANTS`/`HANDS`, seconds, seed, ipHash), `Report` (one per puzzle per caller). Built-in puzzles are code (`PRESETS`); a preset gets a DB row lazily, only to hold stats. `Carry` (`carry` table): one row per room round that got going, with puzzleId, outcome `DELIVERED` / `CALLED_OFF` / `ABANDONED`, sim seconds, average people, peak people, and `gates` (walls the load got through).

## Systems

### The ant model

Each ant is free (searching, returning, in the nest) or carrying. A carrier is **informed** for about 10 s after biting (pulls toward home: scent downhill + 0.3 × straight line + personal error) and then a **conformist** (turns her pull toward her grip point's velocity). Outward pull = puller, inward = lifter. She lets go after ~120 s, sooner when stalled, at once when scraped against a wall. Nothing global steers the load. Details and what was guessed: the science section and `params.ts`.

### Physics

Overdamped rigid body, `A u = b` for `(vx, vy, ω)`; wall contacts by SAT + projected Gauss-Seidel with Coulomb friction. 60 steps per sim second. Deterministic per seed **within one JS engine** (trig differs in the last bits between V8 and JSC), so the server never replays a run.

### Speed

`session.ts` steps within a frame budget (11 ms, 28 ms at Max). The race and the charts run colonies headless in workers, one per core (`coreCount()` = cores − 1, max 16). Picking a colony in the race replays its seed in the lab, exactly.

### Server

No accounts. `ctx.who` is a salted hash of the caller's IP. Publish: zod → `checkPuzzle` → planner in a worker thread (one at a time, 30 s) → dedupe by hash. Record: a time faster than `fastestPossible` is refused. Three reports hide a puzzle. In-memory rate limits and a 15 s list cache (single instance).

### People rooms

The server owns a `World` per room with no ants and up to 8 or 24 people (sizes alternate; a newcomer joins the fullest open room). It steps at 2× (`ROOM_RATE`) and sends a binary state 15 times a second; the page draws 110 ms behind and predicts only the visitor's own walking. A person pulls like one ant, in any direction, and the load's drag is half a pull per active person (`PERSON_WEIGHT`), so a room that agrees moves at two thirds of carrying speed. A wall scrapes a holder off. Walking is done on the visitor's machine and checked on the server (a speed budget, and `walkTo` can't cross walls). Idle: 15 s stops counting toward the weight, 25 s lets go, 90 s leaves the room. A room's first round is `doorway` (a warm-up); every round after is `piano-movers`, and only those reach `people.stats` and the chart. Rounds cap at 30 sim minutes, 8 s between rounds. No chat, no names. Rooms live in memory: a deploy drops them and pages reconnect by themselves.

### Sound, rewind, clips

Sound is synthesised in `src/sound/sound.ts` (no audio files), off until switched on, remembered in localStorage. The lab keeps a `Tape` (load pose + every ant, ten frames a sim second, thinned when it passes 24 MB): the rewind bar scrubs it and the sim waits; it is footage, not state. `Session.shot()` and `Room.shot()` hand footage to `src/share/clip.ts`, which paints 720×1280 frames (clock on top, arena turned upright) and encodes H.264 MP4 with WebCodecs through `mediabunny` (loaded on demand), falling back to filming the canvas with MediaRecorder. Phones get the share sheet, everything else a download.

## Gotchas

- A syntax error in a `server/` file stops `bun --watch` serving. Run `bun run typecheck` **and** load a page after editing server code; never put raw U+2028-range characters in a regex literal.
- The planner is conservative (lattice step 4+, 3° turns): it can call a barely-possible puzzle impossible. Publishing follows the planner.
- `world.trace` holds x, y, angle triples every 0.5 s; the renderer, the Keyhole and the race trails all read poses, never ants.
- e2e truncates every table, so nothing is seeded in the DB at boot.
- The lab panel is 20rem; anything added to it must still fit an 800 px tall window.
- **Stand-ins and load tests are for localhost only.** A room round on the deployed site is a row in the public record.
- Bump `WIRE_VERSION` when the room protocol changes: an old page is told `bye version` and shows "This page is out of date".
- e2e files run in name order and `smoke.spec.ts` must stay first: its puzzle-list screenshot needs an empty database, and a colony delivering in a later test adds a line to that page.
- The share sheet needs a tap that is still warm; a slow encode outlives it, so the button turns into "Send the clip" for a second tap.
- Changing an engine rule changes every number on the page: rerun `bench/science.ts` and the engine tests.

## Status

- **Done:** engine + bench, lab (modes, knobs, 8 views), race, Keyhole/Planner, editor, gallery + stats + reports + admin, science section with rerunnable charts, deploy; people rooms with stored results and the people-against-ants chart, sound, rewind, clips.
- **Not built:** accounts, server-side replay of runs, a phone-first layout for the editor (it works, but is built for a pointer), rooms on visitor-built puzzles, rooms across more than one server instance, sound inside a clip.
- **Next:** whatever Sal asks after seeing it.
