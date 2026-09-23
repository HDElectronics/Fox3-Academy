# Changelog

## Unreleased

- Merge & guns, part 2 (#11): three new lessons, The merge (lead turn, pass close, nose high or low, scored on
  angles gained by the second pass), One vs two circle (live turn circles, trainer advice for your jet against the
  bandit, scored on angle off his tail and range 30 s after the pass) and High yo-yo (stop an overshoot out of
  plane, scored on no overshoot and range held). The free fight now meets a rule-based fighting AI at Rookie,
  Regular and Veteran trainer levels: lead turn, one- or two-circle by jet, lag then lead pursuit, high yo-yo on
  an overshoot, guns, and a jink when your sight comes on; the debrief lists its moves. Gun kills now take time in
  the solution (about 2 s dead on at 600 m, less closer), so tracking drills no longer end a second after the
  first solution. Merge & guns joins the hangar lesson path; `merge:<ac>:done` needs every drill at 50 or more.

- Merge & guns (#11): a new close-combat page for all ten jets. Fly an arcade BFM mode from the keyboard or a
  touch pad against a scripted bandit (straight, level turn, turning and reversing, gun attack) through Corner
  speed, Pursuit, Guns tracking and Guns defence lessons plus a Free fight, each with a score and a debrief. The HUD
  panel (and a cockpit-camera overlay) draws each jet's own gun sight: FC3 funnel / LCOS, F-15C LCOS / reticle,
  Hornet funnel / director with SHOOT, F-16C EEGS Level II / V, F-14 RTGS, JF-17 SS / SSLC / LCOS, M-2000C CCLT,
  labelled simplified. The 3D view adds tracers, the lift vector, turn circles, the bandit's plane of motion,
  pursuit-coloured lines and hit sparks.
- Shkval & Vikhr (#37), the first Su-25T page: height-map terrain with a flattened target area wired into the sim,
  ground units, Vikhr smoke, rockets, gun tracers, impacts, the laser line and the Shkval field of view in 3D; a
  second camera renders the Shkval TV picture in black and white on the IT-23M with its symbology, next to the
  Su-25T HUD (mode and store labels, range scale, laser cursor, CCIP pipper, station boxes). Lessons for the Shkval,
  the laser, a scored Vikhr drill and a rocket / gun CCIP pass, with touch controls and a debrief per drill.

- Pattern & landing adds air-to-air refuelling (#28): Tanker rejoin and Pre-contact starts for the Su-33 (IL-78M
  with UPAZ pods), F-15C and F-16C (KC-135 boom) and the F/A-18C, F-14B, JF-17 and M-2000C (KC-135 MPRS or KC-130
  hose), low-poly tankers with hose, basket and boom, Wing and Receiver cameras, probe / door / lights / radio-call
  keys and touch buttons, a contact position box, the UPAZ hose-band gauge, simplified boom cues, closure and fuel
  readouts, a radio log and a graded refuelling debrief with its own progress key. The other jets see a note.

- Pattern & landing adds Catapult (F/A-18C, F-14B) and Ski-jump (Su-33) launch starts (#27) in Watch and Fly: a
  catapult or position picker and a Heavy toggle, catapult tracks, shuttle and jet-blast deflectors on the CVN,
  marked positions, deck stoppers and a ski-jump on the sim's 12° ramp on the Kuznetsov, a Deck (shooter) camera,
  a launch sequence strip with keys and not-verified tags, the Hornet trim-by-weight readout, power and FOD-screen
  warnings, launch keys and touch buttons, and a graded launch debrief with its own progress key.

- SAM threats (#10): the 3D views draw SA-10, SA-11 and SA-15 sites with their threat ring, minimum-range ring
  and altitude band, and SAMs in flight with smoke and trails, live and in the debrief replay. Defense adds a
  drill per site (brief, search / lock / launch on your RWR, beam and chaff, an optional ridge, coaching and a
  debrief); Sortie can add one or two sites with coach hints and debrief notes; the Reference RWR section lists
  each site's symbol, ring and band. Rings and bands are marked not verified; the AI jets ignore the sites.
- Pattern & landing adds carrier Case I and In the groove starts for the F/A-18C, F-14B and Su-33 (#26): a moving
  CVN or Kuznetsov with the angled deck, four wires and the ski-jump, sea instead of land, an LSO platform camera,
  hook (H / LAlt+G) and ball-call (Y) keys and touch buttons, an IFLOLS or Luna-3 close-up with a call-the-ball
  prompt, an LSO call log, Case I lesson steps and a DCS-style debrief (grade, comment codes in plain words, wire)
  with its own progress key.

- Pattern & landing adds a runway Takeoff start for all ten jets (#24): Watch and Fly, wheel brakes on W (also
  on the landing rollout), a HUD speed tape with VR and PULL bugs, a pitch bracket with the tail-strike line, a
  BRAKES · POWER · RELEASE · ROTATE · GEAR UP · FLAPS strip, per-jet lesson steps, a graded takeoff debrief and
  its own progress key. The M-2000C shows no flap lamp, keys or labels.
- Pattern & landing covers all ten jets and adds a return-to-base start for the FC3 nav jets (МРШ / ВЗВ / ПОС,
  NAV / ILSN): nav display, HUD steering cue, tower calls, nav lesson steps, gate rings where the jet passed them,
  on-screen stick, throttle and buttons for touch screens, and units from the km / nm switch.
- Add the Pattern & landing page (#/flight-ops) for the F/A-18C, F-16C and F-15C: demo and keyboard modes,
  HUD, AoA indexer, pattern trace, configuration lamps and a graded gate debrief; other jets get a jet picker.
- B15: Keep hyphenated jet names ("Su-27", "MiG-29S", "F/A-18C") on one line in prose: DOM helpers wrap
  them in a nowrap span instead of relying on a no-break hyphen.
- B21: Place radar-volume coverage labels in the shared label layout below aircraft, missile and lesson
  tags; a crowded coverage label moves a short way or hides, and placements no longer flip between sides.
- B19: Add `npm run build:web`, a code-split build for normal static hosts (shell, one chunk per page,
  three.js vendor chunk) that cuts first load from about 600 KB to 22 KB plus the opened page (Learn about
  370 KB) gzipped; the single-file build is unchanged. Failed page loads offer Retry and Reload app.
- B18: Remove stale sandbox probes (vitest probe configs, dump scripts and one-off page checks); keep the kit,
  page-cycle and phone-frame harnesses, and typecheck `sandbox/` with the app.
- B11: Make keyboard defaults, binding groups, radar capabilities and missile uncertainty typed data;
  migrate page consumers and separate FC3 expected range from the radar cursor, including scene restarts.
- B12: Adopt shared camera, detection explanation, seeker-state and slider-zone APIs across the lessons.
- B13: Record radar estimates and add Truth / Your radar perspectives to Sortie debriefs; radar view hides
  unobserved truth and keeps camera focus on ownship when scrubbing or jumping to events.
- B16: Exercise live browser flows across all modules at desktop and phone widths. Cancel Sortie holds
  on pause, focus loss and disposal, and settle completed holds even when release falls between frames.
  Record remaining physical-device, audio and performance checks in the browser QA report.

- B8: Enlarge Flanker HUD contact dots and friendly-row spacing in small bezels while preserving
  proportional marks on larger displays and existing designation/lock cues.
- B10: Keep tactical tags inside the viewport and include radar explanations and missile replay markers
  in shared label placement; suppress crowded secondary labels until space becomes available.
- B9: Distinguish JF-17 surface circles from airborne rectangles, add the ALR-67 SAM warning lamp, and
  enable representative SAM threats in the trainer with matching quiz explanations and fidelity caveats.

- Add an F-16C 2D cockpit explorer with 399 sourced items across 49 panels, search, individual explanations,
  MFD bezel layouts, local exploration progress and focused mobile details. Label coverage limits and
  manual-unavailable or uncertain interactions; other aircraft remain explicitly unmapped.
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
