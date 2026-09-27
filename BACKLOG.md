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
- **B27. Verify the JTAC and CCIP trainer values in game** ([#63](https://github.com/HDElectronics/Fox3-Academy/issues/63)).
  AI JTAC wording, radio menu labels outside the ED manual, when the AI clears or aborts, smoke lifetime, the
  Su-25T 1113 laser report, the Shkval frame minimum and the S-8 / S-13 dispersion. Labelled until checked.
- **B7. Long regular-vs-regular fights.** Investigated in
  [ai-engagement-review.md](docs/research/ai-engagement-review.md). All 110 seeded diagnostics resolved within
  ten simulated minutes, without a stuck-state classification. Some Hornet/MiG-29S and Mirage/MiG-29S cases
  still exceed six minutes. Five-seed regression checks protect eventual resolution. Improve pacing only
  with a sourced gameplay reason; do not weaken defensive behavior simply to shorten fights.

## P2 — Display, UX and API cleanup

- **B22. Flight-ops polish** ([#33](https://github.com/HDElectronics/Fox3-Academy/issues/33)). Small gaps left from the
  flight-ops PRs: touch panel on tanker starts, catapults 3–4, deck altitude on the HUD, carrier wake, and others.
- **B28. CAS follow-ups** ([#61](https://github.com/HDElectronics/Fox3-Academy/issues/61)). Pitch buttons on touch screens,
  the S1 rocket salvo selector (ПО 1 / 2 / 4 / ВСЕ), the laser code in recordings, the IR pointer lesson, and a
  multirole route role so the Hornet and Viper can fly CAS.

## P3 — Quality and infrastructure

- **B16. Remaining device QA.** The [browser QA pass](docs/browser-qa.md) covers live desktop/phone-width
  interactions across every module. Still verify physical key holds (FC3 Space 1 s, Viper TMS Right 1 s,
  M-2000C 2 s), RWR audio by ear, touch on real tablets (phones get the desktop-only panel), browser Back/Forward scroll restoration across
  routes, and frame rate on low-end GPUs, including the new exterior assets and the Shkval second viewport.
  Hold cancellation and thresholds have automated regression tests.

## P4 — Ideas

- A datalink picture (Link 16 on the Hornet and Viper, the FC3 AWACS triangles) and IFF, from
  [ecm-datalink-iff.md](docs/research/ecm-datalink-iff.md) ([#12](https://github.com/HDElectronics/Fox3-Academy/issues/12)); jamming shipped.
- More jets: F-15E (Razbam), F-4E (Heatblur), Mirage F1, the full-fidelity MiG-29A, Eurofighter when released.
- A-10C II as the next CAS jet ([#62](https://github.com/HDElectronics/Fox3-Academy/issues/62)): laser spot search, the
  digital 9-line on the TAD, coordinates and markpoints (research in [cas-jets.md](docs/research/cas-jets.md)).

## Community contributions — deferred from active implementation

- **B25. Cockpit explorer** ([#46](https://github.com/HDElectronics/Fox3-Academy/issues/46)). Removed from the app
  to be rebuilt by the community: an interactive, sourced map of an aircraft's cockpit controls. The previous
  F-16C catalogue is in the repository history; research in [f16-cockpit.md](docs/research/f16-cockpit.md). Done
  when a `cockpit` route returns with one aircraft fully mapped and sourced, narrow layout checked and image rights
  clear.
