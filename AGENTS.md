# AGENTS.md — working on Fox Three School

Instructions for contributors and coding agents working in this repository.
Read this file first, then `BACKLOG.md` for what to do next. Humans: start at `docs/README.md`.

## What this is

A 3D web app that trains DCS World pilots in beyond-visual-range (BVR) combat: radar scan volume,
track-while-scan, launch zones, defending against missiles, reading the RWR, and full AI engagements with a
Tacview-style debrief. Ten DCS jets, and every page adapts to the jet picked in the top bar.

Stack: TypeScript 7 (strict), three.js 0.186, Vite 8, Vitest 5. No UI framework: typed DOM factories in `src/ui`.
The production build is a self-contained HTML file suitable for a static web host.

## Rules that matter most

1. **It is a game tutorial. Model game mechanics only.** Everything shows gameplay as DCS presents it to the
   player: displays, keys, the in-game launch-zone numbers, RWR cues, which defensive moves work in the game.
   Missiles and sensors are arcade-style abstractions tuned to reproduce DCS outcomes (speed-over-time curve,
   turn-rate cap, steer-to-intercept, rule-based seeker states). Never add engineering-level weapon detail
   (thrust or drag tables, guidance-law design, seeker or fuze internals, warhead data), and never ask a
   sub-agent to research or build it. Engineering-level detail is outside the teaching scope.
   See `ARCHITECTURE.md`, section "Scope".
2. **Accuracy about DCS is the product.** Facts come from `docs/research/*.md` and live in `src/data`. If a fact
   is not verified, the UI says "simplified" or "not verified"; never invent a key binding, a range or a cue.
   Every uncertain value is listed in `docs/api/data.md` ("Uncertain values") and in the data caveat exports.
3. **Contracts are deliberate.** `src/sim/types.ts`, `src/sim/world.ts`, `src/data/types.ts`, `src/app/page.ts`
   are the seams between layers. Change them on purpose, update every consumer, and update the API doc.
4. **Green before done.** `npm run typecheck` has zero errors and `npm test` passes. Add a test for every logic
   bug you fix. UI changes need a visual check (below).
5. **Design system only.** Colours come from `src/styles/tokens.css` (or `readTheme()` in canvas/WebGL code).
   Fonts: Russo One for page titles only, IBM Plex Sans for prose, B612 Mono for every instrument, label and
   button. Copy is pilot-to-pilot: short, concrete, correct DCS vocabulary, no exclamation marks, no emoji.
6. **Pages clean up.** `unmount()` stops the loop, disposes the Stage, removes every listener, stops audio.

## Commands

```
npm install
npm run dev          # Vite dev server on :5173 (agents share :5190, see Visual checks)
npm run typecheck    # tsc --noEmit
npm test             # vitest: sim, data, kits, page logic (a few seconds)
npm run build        # dist/index.html (single file, three.js inlined)
npm run check        # typecheck + test + build
```

Offline tuning (slow, only when changing the missile model):
`TUNE=1 npx vitest run tests/tune` refits missile constants and regenerates `src/sim/dlzTables.ts`.
See `docs/api/sim-physics.md`, "Tuning workflow".

## Repo map

| Path | What lives there | API doc |
|---|---|---|
| `src/app/` | Shell: top bar, jet picker, hash router, `AppStore` (jet, units, progress in localStorage), unit formatting | this file |
| `src/data/` | Aircraft, radars, missiles, RWRs, bindings, procedures, 108 sources | `docs/api/data.md` |
| `src/sim/` | `World` (fixed 60 Hz loop), flight, radar, RWR, launch rules, missile model, DLZ tables, AI, scenarios | `docs/api/sim-*.md` |
| `src/render/` | three.js kit: `Stage`, sky and ground, procedural jets, `WorldView`, `RadarVolume`, `CameraRig`, `ReplayView` | `docs/api/render.md` |
| `src/ui/` | Controls, panels, layouts, `bindKeys` | `docs/api/ui-kit.md` |
| `src/ui/displays/` | Canvas cockpit displays: five radar formats, six RWRs, DLZ bar, missile timeline, RWR audio | `docs/api/displays.md` |
| `src/pages/<name>/` | One folder per route: hangar, radar-lab, tws, missile-lab, defense, rwr-trainer, sortie, reference | page `index.ts` header |
| `src/styles/` | `tokens.css` (two cockpit skins), `base.css`, `components.css` | |
| `docs/research/` | Sourced research notes, the ground truth for facts | |
| `docs/` | Human docs: user guide, developer guide, DCS accuracy, decisions | `docs/README.md` |
| `sandbox/` | Dev-only harness pages and probe configs (not in the build) | |
| `tests/tune/` | Env-gated tuning, AI duel sweep, DLZ generator | |
| `scripts/` | `shot.sh` (headless screenshots) | |

## How the layers talk

```
src/data (facts) ──► src/sim World ──step(dt)──► entities (aircraft, missiles, countermeasures), events, recording
                         │                         │
                         ├─ buildRadarPicture() ──► RadarDisplay (src/ui/displays)   what the radar knows
                         ├─ aircraft.rwr ─────────► RwrDisplay                        what the RWR shows
                         └─ WorldView (src/render) renders truth + observer layers in 3D
src/pages/<route> owns a World, a Stage, kit components, and the lesson logic; the router mounts one page at a time.
```

- Frame: x = east, y = up, z = south (north is −z). Metres, seconds, m/s, radians inside the sim.
  Headings are radians clockwise from north. Render scale: 1 three.js unit = 1 km.
- Pages fly jets through `ac.cmd` (heading, altitude, speed, maxG, afterburner); the sim is a tactics trainer,
  not a flight model. Controllers: `player` and `script` are page-driven, `ai` runs `sim/ai.ts`.
- Randomness inside the sim uses `world.rand()` only (deterministic, seeded); never `Math.random()`.
- Displays must show only what the radar knows (bricks, tracks). Truth is for the 3D "truth" layer and picking.

## Common tasks

- **Add a jet:** add the id to `AircraftId` in `src/data/types.ts`; add its spec in `src/data/aircraft.ts`,
  binds and procedures in `procedures.ts`, RWR symbols in `rwr.ts`; add a model in `src/render/jets.ts`; add
  per-jet radar rules in `src/sim/radar.ts` (`radarRules`) if it behaves differently; run all tests
  (several iterate over every jet) and screenshot every page with `?ac=<id>`.
- **Add a missile:** `MissileId`, `src/data/missiles.ts`, gameplay constants in `src/sim/missileModel.ts`, then
  the tuning workflow to refit it and regenerate the DLZ tables. Keep it gameplay-level (rule 1).
- **Add a page:** folder in `src/pages/<name>/` default-exporting a `PageFactory` (`src/app/page.ts`), add a
  route in `src/app/routes.ts`, support `?ac=<id>` and `?shot=<state>` for screenshots, write progress with
  `ctx.app.setProgress('<route>:<aircraft>:done', true)`.
- **Change a radar rule:** `src/sim/radar.ts` (`radarRules`, scan, detection, TWS, STT), then
  `src/sim/sensors.test.ts`. Launch rules are in `launch.ts`, the display model in `picture.ts`.
- **Publish:** run `npm run check`, then deploy `dist/` to the chosen static host. No personal deployment endpoint belongs in the repository.

## Visual checks

```
scripts/shot.sh '/#/tws?ac=su27' .shots/tws-su27.png 1440 900 6000   # path, output, width, height, wait ms
scripts/shot.sh '/#/tws?ac=f15c' .shots/tws-390.png 390 844 6000     # true 390 px phone layout
```

It starts a dev server on :5190 if none is running, takes a headless-Chrome screenshot (WebGL works via
SwiftShader) and prints the page's console output. View the PNG. Check at least su27 (Russian skin, metric,
no Fox 3), f15c (US skin, multi-target) and m2000c or f14b (edge cases), at 1440 and 390 wide.

Headless gotchas:
- Time is virtual and `requestAnimationFrame` barely runs, so use each page's `?shot=<state>` pre-roll
  (and `?t=<seconds>` on the radar lab) to reach interesting states.
- Screenshots of a scrolled window come out blank: use a tall window (e.g. 1440x3000) or section params.
- Headless Chrome never lays out narrower than 500 px; `shot.sh` hosts narrower widths in
  `sandbox/frame.html` and crops, so 390 is a real 390 layout.

## Gotchas

- Pages that run a sim must create their `Stage` with `autoPause: 'render'`, so the fight keeps going while the
  3D view is scrolled off screen (`true` stops the sim too).
- Use one `bindKeys` map per page; when two maps bind the same chord only the first fires.
- B612 Mono draws a comma as a full cell: write altitudes without thousands separators ("34400 ft").
- FC3 Russian jets normally launch radar missiles from STT; СНП auto-locks at 85 % Rmax. MiG-29S СНП2 is
  the shared sim exception: `setSnp2` and `launchSnp2` validate and launch an atomic two-target R-77 pair.
- Phoenix launch mode is captured at launch: TWS uses datalink then active; PD-STT stays SARH; P-STT, PH ACT,
  and close shots use active off the rail. These are DCS gameplay rules, not weapon engineering.
- Free TWS lab uses continuous cursor and tactical arrow inputs; guided lessons retain contact stepping.
  Manual designation and optional DCS СНП cursor snap must remain clearly distinguished.
- `RwrContact.emitterType` accepts SAM, AWACS and unknown emitters for trainer pages; the sim only produces
  aircraft and missiles.
- The `[hidden]` attribute is forced to `display: none` globally; use `el.hidden`.

## Working with several agents at once

`ARCHITECTURE.md` holds the ownership table used when agents build in parallel: each agent edits only the files
it owns, contract files belong to one coordinator, and requests for other owners go in the agent's report. Brief every sub-agent with rule 1 and assign explicit file ownership before parallel work.

## Where to go next

- `BACKLOG.md`: prioritised open work with pointers and done-when criteria.
- `docs/dcs-accuracy.md`: what is modelled, what is simplified, what is unverified.
- `docs/developer-guide.md`: a longer tour for humans.
