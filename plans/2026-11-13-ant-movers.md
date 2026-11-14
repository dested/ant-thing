# Ant Movers: sim + editor + gallery

Status: active
Board: #730 · Host: ant.dested.com (Drydock, repo dested/ant-thing, public MIT) · Dev: http://localhost:7268

## Ask (Sal, 2026-11-13)

Build the sim from the video (Weizmann "ants vs humans" piano-movers puzzle: a T-shaped load
through two slits). Ants must solve it by emergent behaviour, no planner. Sim + editor. HN-front-page
quality. Single-agent Fable xhigh run, no bosun.

Answers to the three questions: page = sim + editor + science section below the fold;
sharing = server gallery with solve stats (so: sal-starter fork, Postgres); repo = public, MIT.

## Decisions made without asking (plumbing)

- Fork of sal-starter, `--no-auth`, port 7268. Moderation is an ADMIN_TOKEN-guarded tRPC router, not accounts.
- Look: winged (Sal said last chance for questions). Light, lab-bench footage: paper arena, ink ants, the load's red as the one accent.
- Engine is a pure deterministic TS package (`packages/sim`), shared by the page, Web Workers (batch trials) and a headless bench.
- Solve stats are client-reported attempts (seed, ants, solved, sim seconds); no server-side sim CPU.
- No free-text author names. Titles pass a blocklist; 3 reports auto-hide; publish is rate-limited; kill switch env.

## The ant model (what each ant does; nothing global touches the load)

Sources: Gelblum 2015 (Nat Commun 6:7729), Fonio 2016 (eLife 5:e20185), Gelblum 2016 (PNAS 113:14615),
Dreyer 2025 (PNAS 122:e2414274121).

1. Scent: outbound ants mark time-since-nest, homebound ants mark time-since-load (min-rule grids that age).
   Following the falling numbers leads home / to the load. No BFS anywhere.
2. Grab: a free ant that reaches a free spot on the load's edge bites. Leading side pulls, trailing side lifts
   (lifters cut ground friction). Ants only pull, never push.
3. Newcomers know the way: for ~10 s after grabbing, an ant pulls toward home (scent gradient, falling back
   to its path-integration vector), with a personal error.
4. Conformity: after that she pulls the way her own grip point is already moving (alignment rate scales with
   speed; rotational noise always on). Stalled load = no signal = everyone pulls her own way (outward).
5. Turnover: carriers let go at a base rate, sooner when stalled; ants squeezed between load and wall are
   scraped off. Some walk home and come back fresh.

Physics: load is overdamped (first-order): A u = b where u = (vx, vy, ω), A = ground friction + each puller's
force-velocity slope, b = pull forces. Contacts against static walls solved by PGS in the A metric with Coulomb
friction. Load shape = grid cells → rects (collision) + boundary sites (grip points).

## Build order

1. [x] packages/sim: rng, geom (SAT contacts), shape, fields (wall SDF, scent), body solver, world, puzzle schema + presets
2. [x] bench: headless runs over seeds (solve rate, median), PNG snapshots; tune until the T puzzle solves
3. [ ] Kickoff look (tokens, fonts, mark, ui.md), `/` = the sim
4. [ ] Renderer (canvas 2D: arena, walls, load, ants with legs, scent, roles x-ray, trace) + camera
5. [ ] Controls, rule knobs, be-an-ant mode, move-it-yourself mode
6. [ ] Editor (walls, load cells, nest, start pose), local draft
7. [ ] Server: Puzzle + Attempt tables, publish/list/get/report/attempt, admin token router, rate limits
8. [ ] Gallery + puzzle pages (/p/:id), stats
9. [ ] Science section with live trials (workers) and charts from real runs
10. [ ] Deploy: gh repo (public), Drydock create with domain ant.dested.com, verify TLS
11. [ ] Kit: cliffnotes, ui.md, decisions, updates, verify, QA flows, board close-out

## Ledger

- 2026-11-13: forked, init, demo dropped, DB ant_thing created. Next: step 1.
- 2026-11-13: engine + bench done and committed. Findings worth keeping:
  - Slit 126 (video estimate) is unsolvable for the 168 crossbar per the lattice planner; 140 is the tightest solvable. Preset uses 140.
  - Defaults: conformity 1, noise 0.3, holdTime 120, homeProb 0.1, piano ants 400. 72% solve in 1200 s, median ~660 s (64 seeds).
  - Conformity has an optimum: 0 → 0%, 0.25 → 38%, 0.5-1 → ~60%, 2 → 19%, 5 → 0% (260 ants, 48 seeds, 1200 s).
  - Colony size: <=200 ants ~30%, 260 ~58%, 400 ~81%, 600 ~69% (48 seeds).
  - Knowledge is gated on a nest trip or 20 s of free walking; stalled pulls drain it 4x (Sudd's realign/reposition).
  - Tools: `bun bench/run.ts` (trials, --log), `bun bench/snap.ts` (PNG contact sheet), `bun bench/route.ts` (planner), `bench/sweep.sh`.
  - Background sweep output: W:\junk\ant-thing\sweep1.txt
