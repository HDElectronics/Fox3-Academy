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

Work happens on `feat/copilot` (branched from `feat/dcs-link`); both merge to `main` together when the
objective is done.

**Done so far:**
- DCS link: export script v0.5.0, bridge, fake DCS, test page.
- Copilot page for the F/A-18C:
  - fuel and limits;
  - approach AoA and configuration;
  - threats and radar lock from the jet's own displays.
- `fox3-dcs` MCP server (read-only).
- Test mission generator.
- Research notes: `dcs-export.md`, `fa18c-copilot.md`, `fa18c-videos.md`.
- In-game findings recorded in `dcs-export.md`, "Observed in game" and "Hornet displays".

- **B28. Navigation and fuel at home plate.** Export the route and next waypoint for the Hornet:
  `LoGetRoute`, or HSI/UFC text through `list_indication`, whichever the Hornet fills; check with the dump
  command. Then give the bearing, distance and ETA to the next waypoint and to home, and fuel at home plate from
  the measured burn. Add copilot calls (home plate below bingo, joker at the steerpoint) and MCP tools. Done when
  verified with a recorded frame and covered by a regression test.
- **B29. MCP server, remaining.** The read-only server is done ([mcp.md](docs/mcp.md)). Still open:
  - route and fuel at home plate (B28);
  - checklist state (B32);
  - opt-in actions, each a separate tool that asks for confirmation: set BINGO, press a cockpit button, show an
    in-game text message (the last needs a mission or hook script, not Export.lua).

  Done when a client answers "what is my fuel at home plate" from live data.
- **B30. Voice LLM copilot.** Push-to-talk in the copilot page, then speech to text, then an LLM agent with the
  B29 tools and `search_notes`, then a spoken answer. Deterministic rules keep every time-critical call. The API
  key lives with the bridge on the user's computer, never in the repository or the public site. Open question:
  push-to-talk from the HOTAS (the browser only reads a gamepad while focused; the bridge may need to read a DCS
  keybind). Done when a pilot can ask "talk me through Case I" in flight and get a correct, sourced answer within
  about two seconds.
- **B31. Live landing coach.** Read the Hornet ICLS/ILS deviation (`LoGetGlideDeviation` / `LoGetSideDeviation`
  are not verified for the Hornet; try HUD text). Add LSO-style calls reusing `src/sim/flightOps/lso.ts`, and
  Case I gates from `src/data/flightOps.ts`. Generate a carrier Case I practice mission
  (`dcs-link/missions/`). Done when a recorded approach drives the calls in a regression test.
- **B32. Live checklists.** Cold start, before takeoff and landing, using the ED guide steps
  ([fa18c-copilot.md](docs/research/fa18c-copilot.md)) and the cues the videos stress
  ([fa18c-videos.md](docs/research/fa18c-videos.md), "Ideas for the copilot"). Each step ticks itself from
  cockpit switches and IFEI values.
  - Already checked in game: gear handle, flaps, hook, master arm.
  - Still to check: APU 375, crank 377, battery 404, generators 402/403, parking brake 241, launch bar 233,
    anti-skid 238.
  - Generate a cold-start mission.

  Done when a recorded cold start ticks every step.
- **B33. In-game checks still open** (record a frame for each, update `dcs-export.md` and the "not verified" labels):
  - Hornet:
    - meaning of `ASPECT_DDI` and `HUD_TargetAngleReadout`;
    - the IFEI strings with the IFEI off or on another page;
    - `LoGetMechInfo` status vs value while the gear cycles;
    - whether `LoGetMCPState` is filled;
    - whether the export heading is true or magnetic;
    - the over-G limit (the guide gives none; 7.5 G is a rough figure).
  - FC3 jets:
    - whether `LoGetTWSInfo` and `LoGetLockedTargetInformation` work;
    - the RWR azimuth unit and sign;
    - the AoA unit.
  - Multiplayer: a server with own-ship or sensor export off.
  - Public site:
    - the Chrome local-network prompt;
    - Safari, which is untested.
- **B34. Threat bearing for the F/A-18C.** The displays export no threat bearing as text, so threat calls have no
  clock position. Look for another own-sensor source, such as RWR display arguments. Never fall back to world
  objects: that would break multiplayer fairness.
- **B35. Copilot for more jets.** The `#/copilot` route is F/A-18C only. Add profiles (facts, rules, cockpit
  decode, display map) jet by jet, starting with an FC3 jet, whose sensor functions should work once B33
  confirms them.
- **B36. Copilot page on CopilotMonitor.** The page duplicates the evaluation loop that `src/copilot/monitor.ts`
  runs for the MCP server. Move the page onto the monitor, and add page-level tests.
- **B37. Packaging for site users.** The bridge and the MCP server need this repository and Node 24.
  - Add an install command that copies the export script and adds the `Export.lua` line.
  - Ship a standalone bridge download (for example a Node single executable).
  - Document using the single-file build (`--allow-origin null`).
- **B38. Flight-ops data conflicts from the ED guide** ([fa18c-copilot.md](docs/research/fa18c-copilot.md),
  "Conflicts with repo data"). Fix in `src/data/flightOps.ts`, `docs/api/data.md` and the affected tests:
  - indexer colours: slow green, fast red;
  - flap keys: AUTO `F`, HALF `LShift+F`, FULL `LCtrl+F`;
  - speed brake keys;
  - field takeoff in afterburner;
  - the carrier launch power contradiction;
  - abeam distances;
  - trainer key clashes on `L` and `Y`;
  - field gear limit of 250 kt: verified (p102).
- **B39. User guide.** Add the DCS link, Copilot and MCP server to `docs/user-guide.md` with screenshots, and
  the test mission (pydcs needs Python 3.12; 0.15 fails to import on 3.13).

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
