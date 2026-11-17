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
- `/people`: the title is "Doorway", the button says "Let go" (a newcomer arrives holding the load), an arrow key starts the clock and moves the load, Space lets go and the button says "Grab". With company: `bun server/crowd.ts --people 12 --seconds 60` in `apps/web` (localhost only, exit 1 unless all joined). A delivered warm-up shows "Delivered in …", then round 2 is "Piano movers".
- Sound: the speaker button turns on scraping and ticks; it stays on after a reload.
- Rewind: after the warm-up a bar appears under the arena; dragging it back shows the run then, the clock follows, "Now" returns.
- Share: on a delivered colony (lab) or an ended round (room), "Share" counts up and then downloads `ant-movers.mp4` on a desktop; 720×1280, the clock on top.
- Phone size with bx: open `/puzzles`, replace the body with `<iframe src="/people" style="width:390px;height:780px">` (same origin; a `data:` page renders blank).

## Science data `[medium]`

```bash
cd packages/sim && bun bench/science.ts > ../../apps/web/src/science/data.json   # 22 conditions × 96 colonies, about 25 min on 20 cores
```

## E2E `[medium]`

Needs the root `.env` `DATABASE_URL`; the suite uses the database `ant_thing_test` on the same server.

```bash
bun run test:e2e            # Playwright on :7271: the puzzle list, the lab, rewind, build → publish → play, the 404 page, a room, sound, the home section
bun run test:e2e:update     # after an intentional UI change; review and commit the PNGs
```

## Deployed `[heavy — ask first]`

- Push to `main` deploys through Drydock. Then: `https://ant.dested.com/healthz` 200 with a valid certificate, `/` runs, a publish works, `/admin` opens with the token set in Drydock → Project → Environment.
- The host shows up under Crow's Nest → Sites → Waiting to be claimed.
- Rooms: open `https://ant.dested.com/people` in one browser and see "Doorway" and "Let go". Don't pull unless you mean to play: a round that gets going is a row in the public record. Never run `server/crowd.ts` or any bot against it.
