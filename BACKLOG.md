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

## P2 — Display, UX and API cleanup

Nothing open. Flight-ops polish (#33), SAM follow-ups (#34) and CAS follow-ups (#61) shipped.

## P3 — Quality and infrastructure

- **B16. Remaining device QA.** The [browser QA pass](docs/browser-qa.md) covers live desktop/phone-width
  interactions across every module. Still verify physical key holds (FC3 Space 1 s, Viper TMS Right 1 s,
  M-2000C 2 s), RWR audio by ear, touch on real tablets (phones get the desktop-only panel), browser Back/Forward scroll restoration across
  routes, and frame rate on low-end GPUs, including the new exterior assets and the Shkval second viewport.
  Hold cancellation and thresholds have automated regression tests.

## Objective — Live DCS copilot

Turn the DCS link into a copilot that helps in flight, then into one you can talk to. Builds on `dcs-link/`,
`src/dcs/`, `src/copilot/` ([copilot.md](docs/copilot.md)). Rule 1 still holds: gameplay-level data and cues only.
Multiplayer fairness: the copilot only uses what the pilot's own jet knows (own ship, own sensors, own RWR) and
respects the server's export permissions; world-object truth data stays out.

- **B28. Richer live data and a useful copilot.** Export and use what the pilot actually needs: RWR contacts
  (`LoGetTWSInfo`), radar lock (range, closure, aspect against the app's own DLZ tables), stores and gun rounds,
  route and next waypoint (bearing, distance, ETA, fuel at home plate), ICLS/ILS deviation and carrier LSO-style
  calls (reuse `src/sim/flightOps/lso.ts`), cold start and landing checklists driven by cockpit switches, DDI
  and UFC text. Done when each is verified in game with one recorded frame and has a regression test.
- **B29. DCS MCP server.** Read-only server done ([mcp.md](docs/mcp.md)): status, flight, fuel, threats, radar
  lock, weapons, cockpit switches, copilot alerts, notes search. Still open: route and fuel at home plate (needs
  B28 route data), checklist state, and opt-in actions (set BINGO, press a cockpit button, in-game text message)
  as separate tools that ask for confirmation. Done when a client answers "what is my fuel at home plate" from
  live data.
- **B30. Voice LLM copilot.** Push-to-talk in the copilot page: speech to text, an LLM agent with the B29 tools
  and the research notes as its references, spoken answer. Deterministic rules keep every time-critical call;
  the LLM answers questions and talks through procedures. The API key lives with the bridge on the user's
  computer, never in the repository or the public site. Done when a pilot can ask "talk me through Case I" and
  "what's my bearing to the boat" in flight and get correct, sourced answers within about two seconds.

## P4 — Ideas

- More jets: F-15E (Razbam), F-4E (Heatblur), Mirage F1, the full-fidelity MiG-29A, Eurofighter when released.
- A-10C II follow-ups: CDU coordinate entry from line 6 and markpoints, the Maverick page, CCIP consent (hold
  through the solution cue), and in-game checks of the trainer values in [a10c.md](docs/research/a10c.md).

## Community contributions — deferred from active implementation

- **B25. Cockpit explorer** ([#46](https://github.com/HDElectronics/Fox3-Academy/issues/46)). Removed from the app
  to be rebuilt by the community: an interactive, sourced map of an aircraft's cockpit controls. The previous
  F-16C catalogue is in the repository history; research in [f16-cockpit.md](docs/research/f16-cockpit.md). Done
  when a `cockpit` route returns with one aircraft fully mapped and sourced, narrow layout checked and image rights
  clear.
