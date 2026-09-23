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
- **B24. Verify flight-ops and SAM values in game** ([#35](https://github.com/HDElectronics/Fox3-Academy/issues/35)).
  Pattern, takeoff, carrier, launch, refuelling and SAM values marked not verified in `docs/api/data.md`.
- **B7. Long regular-vs-regular fights.** Investigated in
  [ai-engagement-review.md](docs/research/ai-engagement-review.md). All 110 seeded diagnostics resolved within
  ten simulated minutes, without a stuck-state classification. Some Hornet/MiG-29S and Mirage/MiG-29S cases
  still exceed six minutes. Five-seed regression checks protect eventual resolution. Improve pacing only
  with a sourced gameplay reason; do not weaken defensive behavior simply to shorten fights.

## P2 — Display, UX and API cleanup

- **B22. Flight-ops polish** ([#33](https://github.com/HDElectronics/Fox3-Academy/issues/33)). Small gaps left from the
  flight-ops PRs: touch panel on tanker starts, catapults 3–4, deck altitude on the HUD, carrier wake, and others.
- **B23. SAM follow-ups** ([#34](https://github.com/HDElectronics/Fox3-Academy/issues/34)). AI jets ignore SAMs,
  sites cannot be destroyed, SA-10 drill pacing.

## P3 — Quality and infrastructure

- **B16. Remaining device QA.** The [browser QA pass](docs/browser-qa.md) covers live desktop/phone-width
  interactions across every module. Still verify physical key holds (FC3 Space 1 s, Viper TMS Right 1 s,
  M-2000C 2 s), RWR audio by ear, touch on real phones, browser Back/Forward scroll restoration across
  routes, and frame rate on low-end GPUs. Hold cancellation and thresholds have automated regression tests.

## P4 — Ideas

- Jamming and burn-through, a datalink picture (Link 16 on the Hornet and Viper), IFF.
- More jets: F-15E (Razbam), F-4E (Heatblur), Mirage F1, the full-fidelity MiG-29A, Eurofighter when released.
- A progress view across jets and Tacview ACMI export from Sortie.

## Community contributions — deferred from active implementation

- **B25. Cockpit explorer** ([#46](https://github.com/HDElectronics/Fox3-Academy/issues/46)). Removed from the app
  to be rebuilt by the community: an interactive, sourced map of an aircraft's cockpit controls. The previous
  F-16C catalogue is in the repository history; research in [f16-cockpit.md](docs/research/f16-cockpit.md). Done
  when a `cockpit` route returns with one aircraft fully mapped and sourced, phone layout checked and image rights
  clear.
- **B20. Higher-fidelity aircraft exteriors.** Keep the current procedural models in `src/render/jets.ts`.
  Asset sourcing, generation, cleanup and integration are deferred; training development does not depend
  on them. Existing external previews are research records, not approved replacements. Start with one
  aircraft and the [asset research and integration checklist](docs/research/aircraft-assets.md).
  Done when a contribution includes clear mesh/texture redistribution rights, preferred source and
  conversion steps, correct or explicitly simplified variant details, verified scale/orientation,
  desktop/phone performance checks, attribution, resource cleanup and a working procedural fallback.
