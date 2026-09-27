# CAS & JTAC module: plan

Status: shipped for the Su-25T (2026-09-27, #54–#60, issue #53). Follow-ups: #61, #62 (A-10C II), #63 (in-game checks). Game level only (AGENTS.md rule 1): the module teaches
what the DCS player sees and does with the built-in JTAC (radio menu, 9-line, marks, clearance calls) and never
weapon effects, fuzing or risk-estimate tables.

Research behind this plan:

- [research/cas-jtac.md](research/cas-jtac.md): the in-game JTAC flow, marks, control types, Mission Editor
  FAC tasks, common player mistakes. Main source: ED *A-10C II Flight Manual*, "F4 JTAC" (pp. 784–788).
- [research/cas-jets.md](research/cas-jets.md): how the Su-25T, A-10C II, F/A-18C and F-16C work a JTAC task.

## What the research settled

| Topic | Finding | Consequence for the trainer |
|---|---|---|
| Radio flow | `\` → F4 JTACs → pick JTAC → Check-in (automatic content) → type 1/2/3 → Ready to copy → 9 lines → remarks → readback → IP Inbound → continue → mark → Contact the Mark → In → cleared hot / abort → Off → re-attack or depart (manual) | The JTAC state machine follows this order exactly; menu labels outside the A-10C manual are marked "not verified" |
| 9-line | IP, heading/offset, distance, elevation MSL, target type, UTM grid, mark (None / WP / Laser / IR Pointer), friendlies, egress. Remarks: weapon, weather, attack headings. Voice plus subtitles (manual) | Kneeboard card has these nine fields plus remarks; location shown as a UTM grid |
| Smoke | Built-in JTAC smoke is **white**, goes down inside **10 nm** after IP Inbound, "mark is on the deck" (manual). Coloured smoke is Combined Arms or scripts only | Built-in lessons use white smoke only; no colour picker |
| Laser | Code 1688 by default; only after "Laser On"; then "Spot", "Shift", "Terminate" (manual). No ME field found to change it | Su-25T cannot use it (no laser spot search). The laser branch teaches "request another mark" |
| Su-25T 1113 | Community reports a HUD diamond on code 1113 for Kh-25ML / Kh-29L / S-25L (not Vikhr); a 2025 bug report says it broke | Left out of lessons; mentioned only as "not verified" in the reference text |
| Line of sight | No LOS → "problem: no LOS", coordinates only (manual) | Scenario can place the JTAC masked to teach the coordinates-only flow |
| Clearance and aborts | "cleared hot" / "continue" / "abort" are ED phrases; the AI's abort rules are **not documented**. Players report "ABORT ABORT ABORT" on release without clearance | Abort rules are trainer rules, labelled "simplified": release without "cleared hot", heading outside the briefed attack heading, aim point not on the target |
| Friendly fire | No documented AI JTAC reaction | Scoring only; the JTAC says nothing game-specific about it |

## Lessons (Su-25T first)

1. **Radio and 9-line.** Open the radio menu, reach the JTAC, check in, copy the 9-line into the kneeboard card,
   read back. Pass: IP, elevation, grid, mark and friendlies lines correct.
2. **Talk-on and the mark.** Call IP Inbound, get white smoke inside 10 nm, "Contact the Mark", follow the talk-on
   from the smoke to the target among decoys and friendlies, lock it with the Shkval. Variant: the JTAC offers a
   laser mark and the pilot learns the Su-25T cannot see it.
3. **Attack geometry and clearance.** Run in inside the briefed attack heading, call In, wait for "cleared hot".
   Scored violations: release without clearance, release after abort, heading outside the window.
4. **Friendlies close.** Friendlies near the target; every impact is classified on target, wrong target, near
   friendlies or fratricide. Fratricide fails the lesson. One trainer distance, labelled "trainer rule".
5. **CAS sortie.** Check-in to Off with an optional SA-15 / ZSU-23-4 threat, scored out of 100 with a Tacview
   debrief.

Later jets: A-10C II (laser spot search, codes, digital 9-line on TAD and MSG page, markpoints), then the
F-16C and F/A-18C (LST, JDAM from coordinates). Hornet and Viper need a multirole role; see Risks.

## Design

### Layering

- **JTAC is page logic.** A pure `JtacController` state machine in `src/pages/cas/jtac.ts`, stepped after
  `world.step`, headless-testable like `SortieTracker` (`src/pages/strike/sortie.ts`). Its body is a blue
  `GroundUnit`; "eyes on" uses `world.lineOfSight`. Calls are mirrored as `note` events for replay and Tacview.
- **Marks are sim entities.** Rendering (visible in the Shkval TV), recording, replay, Tacview and a later
  laser spot tracker all need them.
- **Clearance and safety are page logic**, evaluated on `ag-launch`, `ag-impact` and `ground-kill`. The sim
  stays neutral: weapon damage and the Shkval lock already ignore side (`src/sim/agWeapons.ts`,
  `src/sim/shkval.ts`), so friendly fire and wrong-target locks already happen.
- **Jet-agnostic core.** JTAC, 9-line, safety and tracker read generic World state and events; only an aim-point
  adapter (`shkvalAimPoint` for the Su-25T) is jet-specific.
- No new `Side` and no new `GroundUnitKind` for the first version: friendlies are blue vehicles, decoys are red.

### Contract changes (additive, coordinator-owned)

- `src/data/types.ts`: `BindGroup` gains `'comms'`; `MarkKind = 'smoke' | 'wp' | 'laser' | 'ir'`;
  `NineLineField`; `CommsMenuNode`; `JtacCallSpec { id, text, verified, note? }`.
- `src/sim/types.ts`: `GroundMark` entity, `MarkSpawnOptions`, a `mark` event (`on` / `off`),
  `RecordFrame.marks?`.
- `src/sim/world.ts`: `marks` map, `spawnMark`, `endMark`, `stepMarks` in the tick, marks in the snapshot.
- `src/app/page.ts`: no change. `src/app/routes.ts`: `cas` route with `roles: ['attack']`.

### New files

| Layer | Files |
|---|---|
| data | `src/data/cas.ts` (9-line fields, JTAC calls with `verified` flags, comms menu tree, caveats), comms binds in `procedures.ts`, sources |
| sim | `src/sim/marks.ts` + test (spawn, expiry, recording, determinism via `world.rand()`) |
| render | `src/render/attack/marks.ts` (white smoke plume as a real scene object so the Shkval TV shows it; laser spot truth-only), side-coloured unit markers and IP / attack-heading geometry in `attackScene.ts` |
| ui | `src/ui/radioMenu.ts` (DCS-style list, `\` opens, F-keys select, F12 exit, digit aliases because browsers reserve F5 / F11 / F12; exposes `handleKey` for the page's single `bindKeys` map), `src/ui/radioLog.ts` (JTAC subtitles) |
| export | `src/export/acmi.ts`: ground units, air-to-ground weapons, marks and JTAC calls (also fixes Strike exports) |
| page | `src/pages/cas/`: `index`, `lessons`, `scenario`, `nineLine`, `jtac`, `safety`, `tracker`, `kneeboard`, `debrief`, tests |
| strike refactor | `src/pages/strike/cockpit.ts`: extract the Su-25T cockpit wiring (~500 lines of `strike/index.ts`) so CAS reuses it; decouple `drawPlan` from Strike's `PLAN` |

### Integration

- Progress keys `cas:<lesson>:<jet>` (`cas:nine-line:su25t` … `cas:sortie:su25t`, best score at
  `cas:sortie:su25t:best`); the progress page adds CAS goals to the attack-jet branch. Scripted pre-rolls never
  write progress.
- Screenshot states: `?lesson=<id>&shot=<state>`, e.g. `radio`, `card`, `smoke-tv`, `tally`, `cleared`, `abort`,
  `danger`, `debrief`.

## Build order

| PR | Content | Done when |
|---|---|---|
| P0 research | This plan, `research/cas-jtac.md`, `research/cas-jets.md` | Every phrase, menu path, mark and Su-25T limit has a source or a "not verified" tag |
| P1 strike refactor | `strike/cockpit.ts`, `drawPlan` decoupled | Strike tests green; Strike screenshots unchanged at 1440 and 390 |
| P2 contracts | Type and World additions, `sim/marks.ts` + tests, API doc "Marks" section | Typecheck and tests green; marks spawn, expire, record deterministically |
| P3 data | `data/cas.ts`, comms binds, sources, caveat exports | Every call has a `verified` flag; reference page lists comms binds |
| P4 render | Mark layer, side-coloured markers, geometry | Smoke visible in chase view and Shkval TV; screenshot checks |
| P5 ui-kit | `radioMenu`, `radioLog` + tests | Keyboard and touch work; 390 px layout |
| P6 export | ACMI ground units, A-G weapons, marks, calls | Tests green; Strike and CAS files open in Tacview |
| P7a page core | Scenario, 9-line, JTAC, lessons 1–2, kneeboard, route | Headless JTAC and 9-line tests; `?shot=card`, `smoke-tv` |
| P7b geometry and safety | Lessons 3–4 | Tests for no-clearance release, abort, heading violation, fratricide |
| P7c sortie and debrief | Lesson 5, tracker, scoring, progress | Scripted sortie scores ≥ 85; fratricide run scores 0 stars |
| P8 docs | API doc, user guide, `dcs-accuracy.md`, `data.md` uncertain values | `npm run check` green; visual checks at 1440 and 390 |

P3, P4, P5 and P6 can run in parallel after P2 with one owner each (data, render, ui-kit, export); `src/pages/cas/**`
has a single page owner; contract files stay with the coordinator.

## Risks and open questions

1. **In-game wording.** No ED source gives a verbatim AI transcript; menu labels beyond the A-10C manual and the
   abort rules need an in-game check (add to B6). Until then the UI says "simplified".
2. **Browser keys.** F5, F11, F12 (and F1 in some browsers) cannot be captured reliably; `\` sits elsewhere on
   some layouts. Digit aliases and on-screen buttons, labelled as trainer keys.
3. **Smoke in the Shkval TV.** Must be a real scene object (the overlay is hidden in the TV); check performance.
4. **Multirole jets.** `roles` cannot express a Hornet or Viper that is both fighter and attack; a later contract
   needs a `multirole` role or a per-route `accepts(id)` predicate. `AttackState` is Su-25T-shaped.
5. **Dispersion and friendlies.** Friendlies must sit beyond the unguided dispersion band or lesson 4 feels
   random; tune with seeded tests.
