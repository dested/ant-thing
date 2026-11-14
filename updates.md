# Ant Movers (ant-thing) — Updates

> Terse, newest-first log: what was asked → what was done. One entry per finished task.

## 2026-11-14 — Ant Movers: sim, editor, gallery, race, science, deploy

Sal: build the ants-vs-humans piano-movers sim, emergent only, sim + editor + science, public gallery, host on ant.dested.com, public MIT repo. Then: stuck ants, more debug views, more shapes, faster than 64×, a maze, more ants.
Done: `packages/sim` (engine, planner, presets incl. sofa, hook, peg forest, maze), the lab on `/` (watch / be an ant / move it yourself, rule knobs, 8 views incl. Planner and Keyhole), Max speed, a 48-colony race on every core with exact replay, `/build` editor with live solvability check and publish, `/puzzles` + `/p/:id` with run stats and reports, `/admin`, the science section with rerunnable charts from `bench/science.ts`, kickoff (look, ui.md, brand), README + MIT license, Drydock deploy.
Touched: packages/sim/**, apps/web/src/{sim,race,space,editor,science,app}/**, apps/web/server/**, apps/web/prisma/**, apps/web/e2e/**, packages/tokens, packages/brand, ui.md, cliffnotes.md, decisions.md, verify.md, README.md, LICENSE, plans/2026-11-13-ant-movers.md

## 2026-11-14 — init from sal-starter

Ran `bun run init ant-thing --no-auth --port 7268` on dested/sal-starter 00889be (web). Next: the kickoff (look, `/`, icon).
Touched: everything `init` renames, project.json, updates.md
