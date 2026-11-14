# Ant Movers (ant-thing) — Verify

> How to check a change. `[cheap]` checks run after every change; `[medium]` ones need the local Postgres or minutes of CPU; `[heavy — ask first]` ones touch the deployed site.

## Every change `[cheap]`

```bash
bun run typecheck           # tsc --noEmit: root + every workspace. Must be green
bun run test                # bun:test everywhere: the engine (determinism, every preset solvable by the planner and by a colony,
                            # no stuck ants, checkPuzzle), titles, env, ssr-state, tokens, brand
bun run build               # apps/web/dist/client + dist/server
```

After any `tokens.css` or `packages/brand` change: `bun run tokens && bun run brand && bun run test`.

After editing anything in `apps/web/server/`: load a page. `tsc` passing does not prove Bun can parse the file, and a parse error stops the dev server.

```bash
curl -s -m 5 -o /dev/null -w "%{http_code}\n" http://localhost:7268/          # 200
curl -s -m 5 -o /dev/null -w "%{http_code}\n" http://localhost:7268/healthz   # 200
```

## The engine `[cheap]`

In `packages/sim`:

```bash
bun bench/run.ts --puzzle piano-movers --seeds 32 --max 1800 --jobs 16    # about two thirds deliver, typical 10 to 15 min of sim time
bun bench/run.ts --puzzle open-field --seeds 16 --max 600 --jobs 16       # 16/16
bun bench/stuck.ts --puzzle piano-movers --seeds 8                        # 0 free ants going nowhere
bun bench/run.ts --puzzle piano-movers --seed 3 --max 300 --log 5         # one run, a line every 5 s
```

A rule change that moves the piano-movers rate by more than a few points changes the page's story: rerun the science data (below) and reread the science section's sentences against it.

## The page `[cheap]`, with `bun run dev` up and `bx.exe --profile ant --headless`

- `/`: the clock runs, Carrying climbs past 0 within a minute at 4×, every view chip draws something, Keyhole shows the map after a second or two.
- Race: "Race 48 colonies" fills the board; clicking a finished colony replays it and it delivers at the same time the board showed.
- `/build`: drag on the floor to draw a wall, the status line goes "Looking for a way through" → "There is a way through" or "No way through"; Test it; name it; Publish lands on `/p/<id>`.
- `/puzzles`: every built-in has a thumbnail; a published puzzle appears under "Built by visitors".
- `/admin`: needs `ADMIN_TOKEN` in the server's env; Hide and Delete work.
- A chart's "Run it on this machine" puts blue dots on the bars.

## Science data `[medium]`

```bash
cd packages/sim && bun bench/science.ts > ../../apps/web/src/science/data.json   # 23 conditions × 96 colonies, about 25 min on 20 cores
```

## E2E `[medium]`

Needs the root `.env` `DATABASE_URL`; the suite uses the database `ant_thing_test` on the same server.

```bash
bun run test:e2e            # Playwright on :7271: the lab runs, the puzzle list, build → publish → play, the 404 page
bun run test:e2e:update     # after an intentional UI change; review and commit the PNGs
```

## Deployed `[heavy — ask first]`

- Push to `main` deploys through Drydock. Then: `https://ant.dested.com/healthz` 200 with a valid certificate, `/` runs, a publish works, `/admin` opens with the token set in Drydock → Project → Environment.
- The host shows up under Crow's Nest → Sites → Waiting to be claimed.
