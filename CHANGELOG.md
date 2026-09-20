# Changelog

## Unreleased

- Organize navigation around Learn, Practice, Fly and Reference; retain the 3D aircraft overview and add a
  dedicated practice directory with separate guided/free TWS entry points.
- Keep the world prominent in 3D labs, collapse secondary details, and add focused phone tabs with persistent
  actions across Radar, TWS, Missile Lab, Defense and Sortie.
- Fix same-page query navigation so changing between guided and free sessions remounts correctly; preserve
  one-time aircraft deep links and global aircraft switching.
- B14: Keep Defense maneuvers and Sortie steering, designation and fire available in a phone action bar.

- B1: Move MiG-29S СНП2 into the shared radar/launch model, enforce pair constraints, and support it in AI.
- B2: Capture Phoenix launch-mode guidance and warning behavior; update Defense and Sortie coaching.
- B3: Correct aspect-dependent look-down detection and N-019M reference radar cross-section scaling.
- B4: Enforce aircraft-specific TWS scan pairs across the simulation, labs, and reference page.
- B5: Require IR acquisition in Missile Lab and add optional radar-dependent support.
- B6: Apply sourced display, countermeasure-action, and JF-17 BVR start-mode corrections; record unresolved
  current-game checks in a dedicated verification note.
- B7: Investigate 110 seeded AI engagements and add convergence regression coverage. Six-minute pacing
  remains open; no unsupported defensive tuning was applied.
- Add a free TWS lab with continuous cursor control, explicit designation/lock/unlock, optional DCS СНП snap,
  and tactical arrow-key heading/altitude commands alongside guided lessons.
- Add an MIT license, contribution guide, and neutral public documentation; remove obsolete deployment
  tooling and internal build conversations.
- Expand the Markdown roadmap for broader DCS training, licensed aircraft assets, cockpit exploration, and
  a later user-tested UX redesign. Keep prototype websites outside the repository.
- B17: Initialize the public Git baseline on `main` and ignore generated output and local secrets.

## 0.1.0 — 2026-09-20

First full version.

- Eight modules: Hangar, Radar lab, TWS, Missile lab, Defense, RWR trainer, Sortie with debrief, Cockpit reference.
- Ten DCS jets: Su-27, Su-33, J-11A, MiG-29S, F-15C, F/A-18C, F-16C, F-14B, JF-17, M-2000C.
- Seventeen air-to-air missiles; six RWRs; five radar display formats.
- Simulation: radar scan and detection with Doppler notch, TWS track files, STT, per-jet launch and designation
  rules, RWR logic, gameplay missile model tuned to DCS launch-zone tables, skill-scaled AI, scenarios, replay.
- Two cockpit skins that follow the selected jet; metric and imperial units.
- Portable single-file production build.
- Quality improvements: semi-active missiles survive a brief lock wobble, AI pump and
  reshoot fixes, a 10-matchup AI duel sweep in the test suite, per-jet copy and key corrections, phone layouts.
- A silent TWS shot at you stays hidden in the Sortie 3D view until your RWR could know about it
  ("Hidden shots" layer reveals it).
- Copy no longer says a TWS shot is "silent": the target still sees your search radar, just no lock or launch
  warning until pitbull.
- Contributor documentation and prioritized backlog.
