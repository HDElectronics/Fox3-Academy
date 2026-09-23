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

No open items.

## P3 — Quality and infrastructure

- **B16. Remaining device QA.** The [browser QA pass](docs/browser-qa.md) covers live desktop/phone-width
  interactions across every module. Still verify physical key holds (FC3 Space 1 s, Viper TMS Right 1 s,
  M-2000C 2 s), RWR audio by ear, touch on real phones, browser Back/Forward scroll restoration across
  routes, and frame rate on low-end GPUs. Hold cancellation and thresholds have automated regression tests.

## P4 — Ideas

- A within-visual-range module: IR missiles, flares, basic BFM, the merge.
- Jamming and burn-through, a datalink picture (Link 16 on the Hornet and Viper), IFF.
- More jets: F-15E (Razbam), F-4E (Heatblur), Mirage F1, the full-fidelity MiG-29A, Eurofighter when released.
- A progress view across jets and Tacview ACMI export from Sortie.

## Community contributions — deferred from active implementation

- **B20. Higher-fidelity aircraft exteriors.** Keep the current procedural models in `src/render/jets.ts`.
  Asset sourcing, generation, cleanup and integration are deferred; training development does not depend
  on them. Existing external previews are research records, not approved replacements. Start with one
  aircraft and the [asset research and integration checklist](docs/research/aircraft-assets.md).
  Done when a contribution includes clear mesh/texture redistribution rights, preferred source and
  conversion steps, correct or explicitly simplified variant details, verified scale/orientation,
  desktop/phone performance checks, attribution, resource cleanup and a working procedural fallback.
