# People on the load, sound, rewind, clips

> Status: **done** (2026-11-16). Sal picked option 1 of five "next level" ideas and asked for the UI work too, ahead of a TikTok post.

## What was built

- `/people`: live rooms where every visitor holds the same T-shaped load. No chat. The server runs the physics.
- A people-against-ants chart on the home page from stored rounds (`carry` table, `people.stats`).
- Sound (synthesised, off by default), a rewind bar on the lab, and Share: a 720×1280 MP4 made in the browser.

## How a room works

1. `GET /api/room?v=1` upgrades to a WebSocket (`server/rooms-socket.ts`). The visitor joins the fullest open room, or a new one (capacity alternates 8 and 24), and arrives holding a free grip.
2. The room (`server/rooms.ts`) steps its `World` at 2× and sends a 14 + 8n byte state 15 times a second. Notices (`round`, `over`, `bye`) are JSON.
3. The page (`src/people/room.ts`) draws 110 ms behind, predicts only its own walking, and sends `move`, `pull`, `grab`, `drop`.
4. Round 1 is `doorway`, later rounds `piano-movers`. A round ends delivered, called off at 30 sim minutes, or abandoned when the room empties (kept if it ran 20 sim s).

## Numbers that were chosen, not measured

| Number          | Value                                  | Why                                                      |
| --------------- | -------------------------------------- | -------------------------------------------------------- |
| A person's pull | one ant's                              | so people and ants share a clock                         |
| Load drag       | 0.5 pull per active person             | full agreement = 2/3 of carrying speed at any group size |
| Room clock      | 2× real time                           | a 13-minute problem in under 7                           |
| Idle            | 15 s unweighted, 25 s let go, 90 s out | a phone in a pocket shouldn't anchor the load            |
| Caps            | 3,000 people, 200 per address          | one small server                                         |

## Findings

- The T has to turn about 180° and go crossbar first through slit 1. People without a plan find this hard, which is the experiment's result. Hence the warm-up round and the `gates` column.
- One room costs about 9 µs a step and 0.4 MB: 150 full rooms use about a sixth of one core.
- A 20-second clip of 400 ants needs about 4.5 Mbit/s to look clean (about 11 MB).

## Not done

- Rooms on visitor-built puzzles, private rooms with a link, sound in clips, more than one server instance.
