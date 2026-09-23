# Decisions

Short records of the choices that shape the codebase, newest last. Add one when you make a choice a future
maintainer might want to undo.

## 1. Portable single-file build
The current app ships as one self-contained HTML file (`vite-plugin-singlefile`, three.js inlined).
This keeps deployment simple and removes runtime dependencies except web fonts. A second, code-split build
(`npm run build:web`) serves normal static hosts with a smaller first load and can later carry licensed
aircraft assets without removing the portable option.

## 2. TypeScript strict, no UI framework
Typed DOM factories (`h()` plus kit components) instead of React or similar. The app is canvas and WebGL heavy;
most UI is panels around them. Types are the contract between layers, which mattered when many agents built
the layers in parallel.

## 3. The simulation is a tactics trainer, not a flight model
Jets fly a tactical autopilot through `ac.cmd`. The lessons are about radar, missiles and decisions, not stick
and rudder, and an autopilot keeps AI and player on the same footing.

## 4. Missiles and sensors are game mechanics
Missiles use an arcade model (speed-over-time curve, turn-rate cap, steer to intercept, rule-based seeker states)
tuned to reproduce DCS launch-zone numbers and defensive outcomes. Engineering-level weapon modelling is out of
scope: the lessons teach player-visible procedures and decisions. Research notes contain pilot-facing facts.

## 5. Facts live in data, sourced
Every DCS fact sits in `src/data` with its source in `docs/research`. Pages never hard-code a range, a key or a
cue. Uncertain values are kept, flagged, and shown to the user as "simplified" or "not verified".

## 6. One World per page, hash routing, remount on jet change
Pages own their World and Stage and are remounted when the jet or units change. This keeps pages independent
and avoids long-lived state leaking across lessons.

## 7. Two cockpit skins that follow the jet
The whole UI takes the selected jet's cockpit paint: Soviet turquoise with black ink for Flankers and Fulcrums,
dark gull grey for Western jets. Displays are black glass with phosphor symbology. B612 Mono (a font designed
for Airbus cockpit displays) is used for every instrument and label.

## 8. Tacview-style 3D
Jets are scaled up to stay visible at BVR ranges, with labels, drop lines and trails, because DCS pilots already
debrief in Tacview and read that picture fluently.

## 9. Deterministic simulation
The sim uses a seeded generator (`world.rand()`), so tests, drills and replays are reproducible.

## 10. Keys follow DCS
Wherever the app lets you operate the radar or weapons it uses the jet's DCS default binding, shown on the
button, so practice transfers to the sim. Missing defaults are marked, never invented.
