# Developer guide

A tour of the codebase for someone who wants to change or extend it. Agents should read `AGENTS.md` first; this
guide explains the same system at a slower pace.

## Setup

```
npm install
npm run dev        # http://localhost:5173
npm run check      # typecheck + tests + both production builds
```

Requirements: Node 20+ (built with Node 24), a browser with WebGL. For screenshots, Google Chrome at the default
macOS path and either ImageMagick or Python 3 with Pillow (used by `scripts/shot.sh` to crop phone widths).

## Parallel work with Worktrunk

[Worktrunk](https://github.com/max-sixty/worktrunk) is an optional Git worktree manager. On macOS, install
with `brew install worktrunk`, then run `wt config shell install zsh` and restart the shell. Ordinary Git
worktrees remain supported; contributors do not need an AI agent or a paid model service.

Create a separate task checkout from a clean primary checkout:

```sh
wt switch --create fix/contact-visibility --base main --no-cd
wt list
```

Worktrunk prints the new directory. Work there, run `npm ci`, and choose a distinct port when starting a
dev server (`npm run dev -- --port 5192 --strictPort`, for example). Each agent receives its own absolute
directory and explicit file ownership. One coordinator owns staging, commits and integration. Shared Git
configuration and refs still belong to the same repository even though working directories are isolated.

Review the diff, stage explicit paths, inspect `git diff --cached`, and make small commits. Before merging,
bring an unpublished branch up to date with `git rebase main`, resolve any conflicts, run the relevant
visual checks, and review the final diff. Do not rewrite published branches without agreement.

From the clean task worktree, integrate with:

```sh
wt merge main --no-commit --no-rebase
```

This preserves the prepared commits and requires a fast-forward. The checked-in `.config/wt.toml` runs
`npm run check` before integration; approve that known hook when Worktrunk first asks. Successful integration
removes the completed task worktree and branch. Never force removal of unmerged work. Avoid bare `wt merge`:
its default workflow can stage changes, squash commits and rebase automatically. No commit-generation
service or automatic agent-launch hook is configured by this project.

## The big picture

The app is a single-page application with a hash router (`#/tws`, `#/sortie`, ...). The shell in `src/app` draws
the top bar, keeps global state in `AppStore` (selected jet, units, lesson progress), and mounts one page at a
time. Switching jets or units remounts the current page, so pages read the jet once on mount.

`src/app/navigation.ts` maps routes to Learn, Practice, Fly and Reference. `#/learn` aliases the original
`#/hangar`; a `lab=free` query selects the Practice context. The router compares normalized query parameters,
so switching guided/free sessions remounts even on the same path. It consumes `ac` once before mounting.
The shell measures both navigation rows into `--shell-h` for viewport sizing.

3D labs opt into `labLayout({ mobileTabs: true, mobileActions })`. Phone tab changes hide panels without
rebuilding their World or Stage. Dispose the layout with the page's cleanup bag. `mobileAction` mirrors an
existing button's state and invokes its original handler; its MutationObserver must also be disposed.

Each page owns three things:

1. A **World** from `src/sim`: the simulation of jets, radars, RWRs, missiles and countermeasures. The page
   steps it from its animation loop.
2. A **Stage** from `src/render`: the three.js scene, with `WorldView` drawing the World in 3D.
3. **Kit components** from `src/ui` and `src/ui/displays`: buttons, panels, and the canvas cockpit displays.

Facts (what each jet and missile can do in DCS) come from `src/data`, which was written from the research notes
in `docs/research`.

## Simulation (`src/sim`)

- `world.ts`: the `World` class. It owns every entity, runs fixed 1/60 s ticks, emits `SimEvent`s (launch,
  pitbull, datalink-lost, hit, miss, lock, rwr, ai, ...), records a replay frame every 0.25 s, and is the only
  API pages call (`spawnAircraft`, `setRadarMode`, `designate`, `lock`, `launch`, `chaff`, ...).
- `flight.ts`: a tactical autopilot. Jets fly toward `ac.cmd` (heading, altitude, speed, max g, afterburner)
  with believable energy: hard turns and climbs bleed speed.
- `radar.ts`: antenna scan (azimuth sweep and bars), detection (range by aspect, look-down, RCS, Doppler notch),
  RWS bricks, TWS track files, STT, per-jet rules (`radarRules`: designation limits, auto-lock, launch order).
- `rwr.ts`: rebuilds each jet's RWR contacts every tick (search, lock, launch, missile).
- `launch.ts`: whether a jet may launch now, with the reason in pilot words.
- `missile.ts`, `missileModel.ts`: missiles as game mechanics tuned to DCS launch-zone numbers (see "Scope"
  in `ARCHITECTURE.md`).
- `dlz.ts`, `dlzTables.ts`: fast launch-zone lookup (Rmax, Rne, Rmin) from generated tables, plus
  `simulateShot` for full single-shot runs.
- `ai.ts`: skill-scaled AI pilots (commit, attack, support, defend, pump, merge). `scenarios.ts`: ready-made
  setups (TWS drill, duel, pair, 2v2, defense drill, radar lab).
- `picture.ts`: `buildRadarPicture` turns radar state into what the cockpit display shows.

Conventions: x east, y up, z south (north is −z); metres, seconds, radians; `world.rand()` for randomness.

## Rendering (`src/render`)

`Stage` wraps the WebGL renderer, camera, CSS2D label layer, resize handling and the frame loop. `WorldView`
draws a World the way Tacview does: jets scaled up to stay visible at 100 km, labels, altitude drop lines,
missile trails, datalink and illumination lines, seeker cones, chaff, explosions, and optional observer layers
(what one jet's radar believes vs the truth, its scan volume). `CameraRig` offers orbit, chase with a padlock,
top-down and cockpit views. `ReplayView` renders recorded frames for the Sortie debrief. Jets are procedural
low-poly models built in code; there are no external assets.

## UI kit and displays (`src/ui`)

Every component is a typed factory returning an element and a small handle (`segmented(...)` returns
`{ el, set, value, setOption }`). Layout helpers: `labLayout` (one-screen tool), `docLayout` (reading page),
`split`. `bindKeys` handles DCS-style chords (`RAlt+I`) with physical-key matching so macOS Option works.

`src/ui/displays` draws the cockpit screens on canvas: `RadarDisplay` in five formats (Flanker/Fulcrum HUD,
F-15C VSD, Hornet/Viper/JF-17 MFD, F-14 TID, Mirage VTB) and `RwrDisplay` for the SPO-15 lamp panel and the
round scopes. They read colours from the design tokens and only use the `RadarPicture` and `RwrContact` data.

## Styling

`src/styles/tokens.css` defines two cockpit skins, chosen by the selected jet (`data-cockpit="ru"` or `"us"`).
Use tokens everywhere; canvas and WebGL code read them through `readTheme()`. Page-specific CSS lives next to
the page (`src/pages/<name>/style.css`).

## Testing

- `npm test` runs about 390 fast tests: sim physics and sensors, AI and a 10-matchup duel sweep, displays and
  key parsing, and the pure logic of every page (quiz generation, sortie coaching, defense scoring, ...).
- `TUNE=1 npx vitest run tests/tune` refits the missile model and regenerates the DLZ tables (slow).
- `sandbox/*.html` pages are dev-only harnesses for the kits and some pages; `sandbox/*.vitest.config.ts` run
  probe tests that are not part of `npm test`.
- `scripts/shot.sh` takes headless screenshots and prints console output. See `AGENTS.md` for the gotchas.

## Publishing

Run `npm run check`, then pick one of the two builds. Web fonts are the only external runtime dependency of
either.

- `npm run build` writes `dist/index.html`: one self-contained file with all code, styles and three.js
  inlined. It opens offline from disk and suits hosts that take a single file. Inspect it with `npm run preview`.
- `npm run build:web` writes `dist-web/`: `index.html` plus hashed chunks in `assets/`. The shell loads first,
  each route in `src/app/routes.ts` is its own chunk, and three.js is a shared vendor chunk, so the first
  visit downloads only the shell and the opened page. Serve the whole folder from a normal static host;
  hashed chunk names can be cached long-term, `index.html` should not be. Inspect it with
  `npm run preview:web`. If a chunk fails to load (offline, or a redeploy removed an old chunk), the page
  shows Retry and Reload app actions. Deployment accounts and personal URLs are not part of the source repository.

## Extending

See "Common tasks" in `AGENTS.md` for adding a jet, a missile, a page or a radar rule. Before adding any fact,
find it in `docs/research` or research it and add it there with a source; label anything unverified.
