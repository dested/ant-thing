# Ant Movers — UI / Visual Language

> Source of truth for how this looks and feels. Follow it for anything visual, and keep it current as part of finishing a UI change. Fork-owned: `bun run sync` keeps this file as the fork wrote it.

## North star

**Overhead camera: the page is the lab footage, and everything else is quiet instrument chrome around it.**

- Fails as: a dashboard. Cards, shadows, gradients, coloured badges around a small canvas.
- Fails as: a toy. Cartoon ants, rounded bubbly controls, playful copy.
- Signature move: the arena fills the first screen edge to edge, lit like a bench under a lamp, and the load's signal red is the only loud colour on the page.

## Rules

1. **One theme.** `packages/tokens/tokens.css` is the look (light). No dark mode, no toggle, no following the OS. `dark:` classes never match.
2. **Tokens over values.** Classes come from tokens (`bg-popover`, `text-muted-foreground`, `border-input`); canvas and SVG code imports `colors` from `@app/tokens`. Never a Tailwind palette class. The only literal colours are translucent ink/shadow on the canvas (`rgba(20,24,20,…)`).
3. **A colour change edits `tokens.css`**, then `bun run tokens` and `bun run brand`.
4. **No eyebrows, no taglines, no helper text or captions, no period at the end of a heading.** A control gets one label. If a screen needs explaining, rename or regroup.
5. **Red means the load.** `load` (same value as `destructive`) marks the load, its path, and the page's own setting in a chart. Nothing else is red except an error message.

## Palette

| Role               | Class                              | Use                                                                 | Value     |
| ------------------ | ---------------------------------- | ------------------------------------------------------------------- | --------- |
| Background (bench) | `bg-background`                    | page, panels                                                        | `#d3d6d0` |
| Card (paper)       | `bg-card`                          | arena floor, thumbnails                                             | `#e9eae6` |
| Popover (acrylic)  | `bg-popover`                       | overlays on the arena, tooltips, walls                              | `#fafaf8` |
| Foreground (ink)   | `text-foreground`, `bg-foreground` | text, pressed controls, primary button                              | `#141913` |
| Muted              | `text-muted-foreground`            | readout labels, axis text, context bars                             | `#4c524b` |
| Accent             | `bg-accent`                        | hover                                                               | `#babeb6` |
| Border / Input     | `border`, `border-input`           | hairlines (16% ink), control outlines (28% ink)                     |           |
| Load               | `bg-load`, `fill-load`             | the load, its path, "this page's setting"                           | `#ce0e1a` |
| Marker             | `bg-marker`                        | paint dot: an ant who knows the way                                 | `#f7be1c` |
| Lifter             | `bg-lifter`, `fill-lifter`         | paint dot: a lifting ant; planner ghosts; "this machine" in a chart | `#1a73d5` |
| Success            | `text-success`                     | "There is a way through", a delivered colony's frame                | `#1d7d3e` |
| Destructive        | `text-destructive`                 | errors, "No way through"                                            | `#ce0e1a` |

## Type

One family: **Bricolage Grotesque Variable** (`@fontsource-variable/bricolage-grotesque`, `wdth` axis).

| Role    | Class          | Notes                                                                    |
| ------- | -------------- | ------------------------------------------------------------------------ |
| Display | `font-display` | the same family at `wdth` 78 (condensed), `font-bold` / `font-extrabold` |
| Body    | default        | `wdth` 100                                                               |
| Numbers | `tabular`      | tabular figures; every readout, clock and count                          |

Scale: big readout (the clock, a race score) `font-display text-5xl font-extrabold leading-none`; page/section heading in prose `font-display text-4xl font-extrabold leading-none`; panel title `font-display text-2xl font-bold`; chart or rule title `font-display text-xl font-bold`; body `text-base leading-relaxed` capped at `max-w-[65ch]`; controls and readouts `text-sm`.

## Surfaces

- Instrument-flat: `--radius` 0.25rem, hairlines, **no shadows** in the chrome. The only shadows are painted on the canvas (walls, the load) because the lamp is overhead.
- Controls are outlined, not filled: `border-input bg-transparent shadow-none`. A pressed segment or chip inverts to ink (`aria-pressed:bg-foreground aria-pressed:text-background`). One filled ink button per screen at most (Publish, Bite).
- Lab layout: `grid lg:grid-cols-[minmax(0,1fr)_20rem]`, arena left, a 20rem panel right, full height under the 3rem header. Below `lg` the panel stacks under a 3:2 arena.
- Prose (the science section): one column, `max-w-3xl`, `px-5 py-16`, sections `gap-16`.
- Lists of facts are hairline rows (`border-t`/`border-b`, label left in muted, value right), two columns in the panel.

## Motion

The sim is the only thing that moves. Chrome changes are instant: no entrance animations, no hover transitions.

## Components

| Component           | File                                             | Notes                                                                                        |
| ------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `Lab`               | `apps/web/src/sim/lab.tsx`                       | the arena + panel; also hosts the race board and panel                                       |
| `Segmented`, `Chip` | `apps/web/src/components/ui/segmented.tsx`       | one-of-few joined buttons; an on/off view layer                                              |
| `Slider`, `Switch`  | `apps/web/src/components/ui/{slider,switch}.tsx` | Base UI, hairline track, square ink thumb                                                    |
| `Button`, `Input`   | `apps/web/src/components/ui/`                    | Base UI; `type="button"` by default                                                          |
| `PuzzleThumb`       | `apps/web/src/sim/thumb.tsx`                     | SVG still of a puzzle                                                                        |
| `SweepChart`        | `apps/web/src/science/sweep-chart.tsx`           | column chart: grey context bars, red for the page's setting, blue dots for the visitor's run |
| `RaceBoard`         | `apps/web/src/race/board.tsx`                    | canvas grid of mini arenas                                                                   |
| `Keyhole`           | `apps/web/src/space/keyhole.tsx`                 | inset map on the arena                                                                       |

Charts: columns ≤ 24px with a 4px rounded top, hairline grid at 0/50/100%, value on the cap, text in text tokens (never the series colour), a legend row under the plot, a tooltip on hover and focus, an `sr-only` table.

## Icon

`packages/brand/mark.svg` + `brand.json` → `bun run brand`. Never hand-edit an output.

## States

- **Loading:** one muted line ("Looking for a way through", "Mapping every pose"). No spinners.
- **Empty:** one short sentence with the way out ("Nobody has published a puzzle yet").
- **Pending action:** disable the button and swap its label ("Publishing").
- **Error:** `text-sm font-medium text-destructive` beside the control; it says what to do next.

## Voice

Plain and exact, like a lab notebook. Short sentences, common words, sentence case. Ants are "she". Buttons say what happens ("Race 48 colonies", "Test it", "Publish"). No exclamation marks, no emoji, no marketing words.

## Don'ts

- ❌ Dark mode in any form.
- ❌ Colours outside `tokens.css`, palette classes, a second accent colour.
- ❌ Cards with shadows, gradients as decoration, rounded-xl anything.
- ❌ An eyebrow, tagline, subtitle, hint or caption.
- ❌ `tailwind.config.*`, `asChild`, `@radix-ui/*`, `import './x.css'` from a component.
- ❌ Hand-made icons or favicons: edit the mark and run `bun run brand`.
