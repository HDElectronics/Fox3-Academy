# Fox3 Academy — architecture and team contract

> Status: v0.1.0 is built. This file stays the contract for parallel agent work. Single agents start with
> `AGENTS.md`; open work is in `BACKLOG.md`.

A 3D web app (three.js) that trains DCS World pilots in beyond-visual-range combat: radar modes and
scan volume, track-while-scan, missile launch zones, defending against missiles, reading the RWR, and
full engagements against AI with a Tacview-style debrief. It supports ten DCS aircraft and adapts every
page to the selected jet (radar rules, display format, missiles, RWR, bindings, units).

The audience is DCS players practising aircraft procedures and tactical skills. **Accuracy about how DCS models things is the product.** Research lives in `docs/research/*.md`; use it. When the app simplifies, say so in the UI.

## Scope: a game tutorial, built from game mechanics

This is a tutorial for the DCS World flight-simulator video game. Everything in it is **gameplay as DCS
presents it to the player**: what the radar display shows, which keys do what, the launch-zone numbers
the game's DLZ reports, when a missile "goes pitbull" in the game, what the RWR shows, which defensive
moves work in the game. It is not a model of real weapons.

- Missiles and sensors are **game-design abstractions tuned to reproduce DCS gameplay outcomes**
  (launch ranges, pitbull distances, "shoot high and fast", "cold targets shrink range", "notch + chaff
  works in the game"). Use simple arcade-style mechanics: a speed-over-time curve, a turn-rate cap,
  steer-to-intercept-point, rule-based seeker states with probabilities. Do not build or look up
  engineering-level weapon models (thrust or drag tables, guidance-law design, seeker or fuze
  internals, warhead data). None of it is needed, and the app should not contain it.
- Source numbers from pilot-facing material: DCS manuals, the in-game DLZ, community gameplay tests.

## Commands

```
npm run dev        # Vite dev server (the team shares one on http://localhost:5190, see Visual checks)
npm run typecheck  # tsc --noEmit (TypeScript 7, strict)
npm test           # vitest (node env) — sim tests live next to code as *.test.ts
npm run build      # single-file build → dist/index.html (three.js inlined)
npm run build:web  # code-split build → dist-web/ (page chunks, three.js vendor chunk)
```

The application runs in a normal browser on a static host. Keep the single-file build working; the
split-bundle build (`vite.config.ts`, mode `web`) loads each route through `ROUTES[].load` and is the place
for future model assets and additional modules. Store preferences through
`src/app/store.ts`. External assets require documented redistribution rights and a local fallback.

## Navigation and lab presentation

`src/app/navigation.ts` defines Learn, Practice, Fly and Reference destinations without changing established
module paths. `#/learn` aliases `#/hangar`; Practice has its own directory and marks free sessions with
`lab=free`. Router identity includes normalized query parameters. An `ac` deep link selects the aircraft once
before page mount, then leaves the global picker in control.

`labLayout` keeps the 3D world central on desktop and provides opt-in World / Displays / Controls tabs on
phones. Tabs change presentation only: simulations and recordings continue. Pages supply persistent mobile
actions and dispose layout observers on unmount. The shell publishes its measured height as `--shell-h`.

## Folder ownership (edit ONLY what you own)

| Path | Owner | Notes |
|---|---|---|
| `src/app/*`, `src/main.ts`, `index.html`, `src/styles/tokens.css`, `src/styles/base.css`, `src/ui/theme.ts`, `src/sim/types.ts`, `src/sim/world.ts`, `src/sim/math.ts`, `src/sim/atmosphere.ts`, `src/data/types.ts`, configs | architect | Contracts. Do not edit. If you need a change, work around it locally and list it under "Requests" in your final report. |
| `src/data/aircraft.ts`, `missiles.ts`, `rwr.ts`, `procedures.ts`, `sources.ts` | data | Facts from research. Keep the types. |
| `src/sim/flight.ts`, `missile.ts`, `missileModel.ts`, `countermeasures.ts`, `dlz.ts`, `dlzTables.ts`, `physics.test.ts`, `scripts/tune-*.mjs|ts` | sim-physics | |
| `src/sim/radar.ts`, `rwr.ts`, `launch.ts`, `picture.ts`, `sensors.test.ts` | sim-sensors | |
| `src/sim/ai.ts`, `scenarios.ts`, `ai.test.ts` | sim-ai | AI pilots and ready-made scenario builders |
| `src/render/**` | render | three.js kit |
| `src/ui/**` except `theme.ts`, `displays/` (and `dom.ts`: extend only, keep `h()`), `src/styles/components.css` | ui-kit | controls, panels, layout |
| `src/ui/displays/**` | displays | 2D cockpit displays: radar formats and RWRs (canvas) |
| `src/pages/<name>/**` | page-<name> | one agent per page; page-local CSS goes in `src/pages/<name>/style.css` imported by the page |

## Conventions

- **Frame**: x = east, y = up, z = south (north = −z). Metres, seconds, m/s, radians inside sim.
  Heading: radians clockwise from north. Relative bearings: −π..π, + = right. See `src/sim/math.ts`.
- **Render scale**: 1 three.js unit = 1 km. Convert with the render kit, never ad hoc.
- **Display units**: `app.units` ('metric' → km, m, km/h; 'imperial' → nm, ft, kt). Use `src/app/format.ts`.
  Russian jets default metric, Western imperial; the user can flip it in the top bar.
- **Time**: sim runs fixed 1/60 s steps via `world.step(dt)`; pages call it from their animation loop
  with `dt = realDt * timeScale`, clamped (≤ 0.1 s real per frame).
- **TypeScript strict**. No `any` except at library seams. No non-null `!` on things that can be null.
- Imports are relative (`../../sim/world`). The alias `@/` also works.
- No global mutable state outside `AppStore`. Pages must fully clean up in `unmount()`.

## Simulation API (src/sim) — what pages use

```ts
const world = new World();
const me = world.spawnAircraft({ side: 'blue', type: app.aircraft, controller: 'player', pos: {x:0,y:9000,z:0}, heading: 0, speed: 260 });
const bandit = world.spawnAircraft({ side: 'red', type: 'su27', controller: 'ai', skill: 'regular', pos: {x:0,y:8000,z:-90000}, heading: Math.PI, speed: 250 });
world.setRadarMode(me.id, 'tws');          // 'rws' | 'tws' | 'stt' | 'acm' | 'off'
world.setScan(me.id, { azHalf, bars, elCenter, azCenter, rangeScale, cursor });
world.designate(me.id, targetId);          // TWS: toggle designation; RWS: per-jet lock behaviour
world.lock(me.id, targetId); world.unlock(me.id);
world.canLaunch(me.id) / world.launch(me.id)   // uses selected weapon and primary/locked target
world.cycleWeapon(me.id); world.chaff(me.id); world.flare(me.id);
me.cmd.heading = …; me.cmd.altitude = …; me.cmd.speed = …; me.cmd.maxG = …; me.cmd.afterburner = …;
world.step(dt);
world.on(e => …);                          // SimEvent stream (launch, pitbull, datalink-lost, hit, miss, lock, rwr, ai…)
buildRadarPicture(world, me.id)            // src/sim/picture.ts → RadarPicture for the 2D display
me.rwr                                     // RwrContact[] for the RWR display
simulateShot(setup) / dlzFor(...)          // src/sim/dlz.ts for the Missile Lab
world.recording                            // RecordFrame[] every 0.25 s for replay
```

Types: `src/sim/types.ts`. Facts: `src/data/*` (`AIRCRAFT`, `MISSILES`, `RWRS`, `PROCEDURES`).
Ground truth (`targetId` on bricks/tracks) may be used for picking and for the "truth" layer of the 3D
view, but a display must only show what the radar knows.

## Render kit (src/render) — expected by pages

Owned by the render agent; pages read the real code. It must provide at least:

- `Stage` — creates WebGLRenderer + CSS2D label renderer inside a container, resize via
  ResizeObserver, DPR cap 2, animation loop with `onFrame((dt, t) => …)`, pause/resume,
  `dispose()` that frees everything. Tone mapping, fog and sky set once here.
- `Environment` — stylised high-altitude sky (gradient dome, sun), ground/sea plane with a subtle
  km grid and horizon haze; altitude reads at a glance.
- Procedural low-poly jet meshes for every `AircraftId` with recognisable silhouettes (twin-tail
  Flanker, Eagle, Hornet with canted tails, Viper single tail, Tomcat swing wing, Mirage delta, JF-17,
  Fulcrum), a missile mesh, currently built from code. A future asset provider may load licensed GLB models with these silhouettes as fallbacks.
- `WorldView` — syncs a `World` into the scene each frame: jets (scaled up for visibility, Tacview
  style, with constant-screen-size option), side colours, labels (callsign, alt, speed), altitude
  drop-lines with ground shadow, missile trails and smoke, chaff/flare puffs, datalink lines, active
  seeker cones, explosions, and optional layers toggled by pages (truth vs track estimate markers,
  radar scan volume of one aircraft, radar beam, notch visualisation).
- `RadarVolume` — the 3D scan volume of one aircraft (az × bars × range), current bar and beam,
  altitude coverage at range; updates live as scan settings change.
- Camera rigs: tactical orbit around a focus (default), chase (behind own jet), top-down plan,
  free orbit; smooth transitions; focus on any entity.
- Replay support: render a `RecordFrame[]` at time `t` (for the Sortie debrief).
- Performance: 60 fps with ~10 jets and ~20 missiles on a laptop; share geometries/materials.

## UI kit (src/ui) — expected by pages

- Controls: segmented control, button, toggle, slider with value readout, select, chips, key-hint
  (`<kbd>`), tabs. All keyboard accessible, `aria-pressed` for toggles, stable ids.
- Panels: console panel (cockpit-painted), screen bezel (black glass frame with placard label),
  coach box (what to do now + why), step checklist with done state, event log, stat readout rows,
  callout for "simplified here" notes, modal/overlay for results.
- Layout helpers: `labLayout()` — 3D viewport + side console + bottom strip, responsive to 390 px.
- **Cockpit displays** (canvas 2D, crisp at DPR, read colours from `readTheme()`):
  - `RadarDisplay` — draws a `RadarPicture` in the jet's `DisplayFormat`: `ru-hud` (Cyrillic
    labels, ПР cue), `f15-vsd`, `mfd` (Hornet/Viper/JF-17 labels), `tid` (F-14 round plan view),
    `vtb` (Mirage). Bricks, tracks with aspect sticks, designation markers, DLZ scale, shoot cue,
    scan limits/caret, missile time-to-active/impact, altitude coverage. Hit-testing: click →
    target id.
  - `RwrDisplay` — draws `RwrContact[]` in the jet's `RwrSpec`: `spo15` lamp panel (direction lamps,
    type letters, lock/launch lamps, above/below) or a round scope (symbols, priority ring, hat for
    airborne, launch flashing, diamond on top threat).
  - Audio cues optional (WebAudio tones for search/lock/launch), off by default, user toggle.

## Pages

| Route | Page | Job |
|---|---|---|
| `#/hangar` | hangar | Pick a jet (rotating 3D model), what it can/can't do in BVR, weapon cards, entry to every lesson with progress. |
| `#/radar` | radar-lab | 3D scan volume: azimuth, bars, antenna elevation, range; why you miss targets (outside bars, notch, look-down, range). Guided exercises. |
| `#/tws` | tws | The original TWS lesson rebuilt in 3D for every jet: RWS vs TWS vs STT, track files, designation, multi-shot where the jet allows it, bandit RWR panel showing what each bandit hears. |
| `#/missiles` | missile-lab | Launch zones: choose missile, shooter alt/speed, target alt/speed/aspect/manoeuvre; fly the shot in 3D; speed/altitude plots; Rmax vs Rne; compare shots. |
| `#/defense` | defense | You are the target: incoming SARH/ARH shots; notch/beam, chaff, drag cold, crank; Doppler gate visualised; timing drills with scoring. |
| `#/rwr` | rwr-trainer | Learn your jet's RWR, then quiz: who is searching, locking, launching; what to do. |
| `#/sortie` | sortie | Full BVR engagement vs AI (1v1, 1v2, 2v2) with your jet's real radar/missile rules, then a Tacview-style debrief with timeline and coaching. |
| `#/reference` | reference | Bindings/HOTAS, procedures, missile and aircraft tables, glossary, sources. |

Page contract: `src/app/page.ts`. Default-export a factory returning `{ mount(ctx), unmount() }`.
The router remounts the page when the jet or units change. Read `ctx.app.aircraft`, `ctx.app.spec`,
`ctx.app.units`. Save progress with `ctx.app.setProgress('<page>:<aircraft>:<key>', value)`.

## Design system

One visual world: a fighter cockpit. Chrome is the selected jet's cockpit paint (`data-cockpit`):
Soviet turquoise with black ink for Flankers/Fulcrums, dark gull grey with white placards for Western
jets. Displays are black glass with phosphor symbology (`--sym`), amber for designation/primary
(`--sym-hi`), `--caution` amber and `--warning` red used only for real cautions/warnings. The 3D world
is a hazy high-altitude day: ultramarine zenith, pale horizon haze, desaturated ground far below.

- Tokens only (`src/styles/tokens.css`, `readTheme()` for canvas/WebGL). No hard-coded colours.
- Type: `--font-display` Russo One for page titles only; `--font-body` IBM Plex Sans for prose;
  `--font-mono` B612 Mono (Airbus cockpit face) for every instrument, readout, label, button.
- Placards: uppercase mono, small, letter-spaced, `--panel-muted`.
- Square-ish radii (`--r-1`, `--r-2`), flat surfaces, hairline `--panel-line` dividers. No drop
  shadows except glow on symbology. No gradients on chrome. No emoji.
- Buttons look like cockpit push-buttons: dark cap (`--btn`), lit state (`--btn-on`).
- Layout: labs are one-screen tools on desktop (3D viewport dominant, console at the side, display
  bezels inset), stacking to a single column at ≤ 900 px; nothing scrolls sideways at 390 px.
- Motion: purposeful only (radar sweep, missile flight). Respect `prefers-reduced-motion` by starting
  paused / reducing ambient animation.

## Copy voice

Pilot to pilot. Short, concrete, active. Use DCS vocabulary correctly (RWS, TWS, STT, L&S, DT2,
pitbull, notch, crank, F-pole, Rmax, Rne, bandit, Fox 1/2/3, ПР, СНП). Explain the *why* in one line.
Name keys exactly as DCS does (`RAlt + I`). Never invent facts: if research is uncertain, phrase it as
simplified. No marketing, no exclamation marks.

## Visual checks (use them)

A Vite dev server runs on http://localhost:5190 (`scripts/shot.sh` starts one if it is down). Take a
headless-Chrome screenshot (WebGL works, via SwiftShader) and view the PNG with the Read tool:

```
scripts/shot.sh '/#/tws' .shots/tws-1440.png 1440 900 6000     # path, output, width, height, wait ms
scripts/shot.sh '/#/tws' .shots/tws-390.png 390 844 6000       # phone width
scripts/shot.sh '/sandbox/render.html' .shots/render.png       # your own harness page
```

It prints the page's console output (errors included); fix every error it shows. Kit agents build
harness pages in `sandbox/<agent>.html` (plain HTML with `<script type="module" src="./render-demo.ts">`
etc.) to see their work before pages exist. Name screenshots `.shots/<agent>-<what>.png`. Headless
time is virtual: animations advance by the wait budget. Use `?shot=1` style query params in your own
page to jump to an interesting state for a screenshot if useful. Other agents are editing other
files at the same time: if `tsc` reports errors only in files you do not own, ignore them.

## Definition of done (every agent)

1. `npm run typecheck` passes with zero errors; `npm test` passes (if you touched sim).
2. Only your owned files changed (plus your own `sandbox/<you>*.html` harness and `.shots/<you>-*.png`).
3. Page mounts and unmounts cleanly (no leaked RAF loops, listeners, WebGL contexts).
4. No console errors. Works at 390 px wide and 1440 px wide. Keyboard usable.
5. Final report: what you built, public API (for kits), known gaps, Requests to other owners.
