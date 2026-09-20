# Backlog

Open work after v0.1.0 (2026-09-20), highest value first. Each item says where to work and when it is done.
Rules for all of it are in `AGENTS.md`; keep the game-mechanics scope. When you finish an item, delete it here
and add a line to `CHANGELOG.md`.

v0.1.0 validation baseline: 413 tests pass, typecheck clean, all 8 pages load with no console errors on every jet at
1440 and 390 px.

## P1 — Behaves differently from DCS

- **B6. Remaining DCS verification.** The web/manual review and implemented corrections are documented in
  [verification-status.md](docs/research/verification-status.md). Still needs current-game observations:
  - launch warning (or only lock) for an R-77 or AIM-120 fired from STT;
  - early Enter lock in FC3 СНП across Su-27, MiG-29 and Su-33, whose manuals differ;
  - AIM-120B/C and SD-10 pitbull distances;
  - whether FC3 player radars use the AI detection tables, and whether the FC3 notch applies in look-up;
  - unresolved full-fidelity default keys, including classic F-14B Phoenix trigger and countermeasure defaults;
  - SPO-15 red lamp behavior for an active ARH missile.
  Corrected Viper/Tomcat cue claims, documented countermeasure actions and contextual JF-17 start mode are
  complete. Keep unverified labels until evidence resolves each remaining item; web research is not an
  in-game observation.
- **B7. Long regular-vs-regular fights.** Investigated in
  [ai-engagement-review.md](docs/research/ai-engagement-review.md). All 110 seeded diagnostics resolved within
  ten simulated minutes, without a stuck-state classification. Some Hornet/MiG-29S and Mirage/MiG-29S cases
  still exceed six minutes. Five-seed regression checks protect eventual resolution. Improve pacing only
  with a sourced gameplay reason; do not weaken defensive behavior simply to shorten fights.

## P2 — Display, UX and API cleanup

- **B8. Flanker HUD contact marks are small.** The ru-hud format's dot-row marks are hard to see in the
  ~230 px bezels of the Sortie and TWS pages. Scale marks with the display size in `src/ui/displays/radar/`.
- **B9. SAMs on every RWR.** The JF-17 scope boxes every emitter as an air threat (surface threats should be
  circles) and the ALR-67 has no SAM lamp; the RWR trainer therefore offers SAMs only on the SPO-15. Fix in
  `src/ui/displays/rwr/`, then enable SAMs in `src/pages/rwr-trainer`.
- **B10. 3D label clutter.** Page notes (for example "below the bars") do not take part in tag decluttering, and
  tags still overlap on phones in the Radar and Missile labs. Add a public declutter registration in
  `src/render/tactical.ts`.
- **B11. Contract additions pages asked for.** In `src/data/types.ts`: `KeyBind.group` and `KeyBind.keyboard`
  (the Cockpit page parses them from text today), `RadarSpec.azCenterOptionsDeg` (FC3 three-position scan),
  single-target TWS modes (M-2000C PSID) and cap confidence, `MissileSpec.pitbullApprox` and
  `flareSusceptibility`. In `src/sim/types.ts`: an expected-range field in `RadarState` for FC3 range-angle
  aiming. Replace the page-local workarounds after adding each.
- **B12. Adopt the newer kit and sim APIs.** Hangar hero: `CameraRig` with `interactive: false` and auto-orbit
  instead of its own camera. Defense: `notchState()` from `src/sim/missile.ts` instead of mirroring the seeker
  timer and SARH grace. TWS: `explainDetection(..., { units })` instead of rebuilding sentences. Missile Lab: a
  zone-band option on the kit slider instead of its own element in the track.
- **B13. Replay shows only truth.** `RecordFrame` has no track estimates, so the debrief cannot show what your
  radar believed at each moment. Extend the recording in `src/sim/world.ts` and draw it in `ReplayView`.
- **B15. Hyphenated jet names wrap** ("Su-" / "27") in narrow prose. A no-break hyphen falls back to another font;
  a `white-space: nowrap` span around jet names in copy would work.

## P3 — Quality and infrastructure

- **B16. Real-browser QA.** Headless checks cannot cover: key holds (FC3 Space 1 s, Viper TMS Right 1 s,
  M-2000C 2 s), RWR audio by ear, touch, scroll restore, and frame rate on low-end GPUs. Do one manual pass per page and fix what it finds.
- **B18. Sandbox cleanup.** `sandbox/` holds many probe configs and harnesses from the build waves. Keep the
  harness pages that still run (`render.html`, `ui.html`, `displays.html`, `frame.html`, page cycle harnesses)
  and delete stale probes.
- **B19. Bundle size.** The single file is 1.8 MB (545 KB gzipped). For a normal static host, a second Vite
  config with code splitting per page would cut first load.

## P4 — Ideas

- SAM threats in the Sortie and Defense drills (needs B9 first).
- A within-visual-range module: IR missiles, flares, basic BFM, the merge.
- Jamming and burn-through, a datalink picture (Link 16 on the Hornet and Viper), IFF.
- More jets: F-15E (Razbam), F-4E (Heatblur), Mirage F1, the full-fidelity MiG-29A, Eurofighter when released.
- A progress view across jets and Tacview ACMI export from Sortie.
