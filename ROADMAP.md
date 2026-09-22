# Development roadmap

Fox3 Academy is evolving from a BVR trainer into a broader DCS learning environment. The current
simulation is a tactical autopilot, not a full flight model. These phases are product directions, not
release promises. [BACKLOG.md](BACKLOG.md) remains the authoritative list of concrete open work.

## 1. Accurate systems and independent practice

- Resolve documented differences in radar modes, launch behavior, acquisition, and AI engagements.
- Keep sourced facts, simplified mechanics, and version-dependent uncertainties distinct.
- Offer guided lessons and a free practice lab with continuous cursor movement and explicit actions.
  Explain aircraft-specific automation and label training aids.
- Keep radar cursor keys separate from optional keyboard flight commands. Label heading/altitude commands
  as tactical controls rather than realistic stick inputs.

## 2. Flight fundamentals

Add takeoff, landing, trim, pattern work, and basic aircraft handling as separate modules after establishing
an appropriate flight-control model. Start with one aircraft and one validated exercise before expanding.

Required foundations: control axes and input profiles, airborne/ground states, runway and terrain data,
aircraft-specific limits, lesson checkpoints, reset/replay, and fidelity labels. The current tactical
autopilot must not stand in for trim, pitch, roll, rudder, or landing dynamics.

## 3. Communications and aircraft systems

- Radio tuning and communication procedures, followed by scripted ATC and formation exercises.
- IFF and datalink pictures, sourced per aircraft.
- Jamming and burn-through as DCS gameplay rules with documented limitations.
- Within-visual-range training: the merge, basic fighter maneuvers, IR missiles, and countermeasures.

## 4. Aircraft presentation

**Deferred to community contributions.** Keep the existing procedural aircraft models in the application.
Higher-fidelity exteriors, asset searches, purchases, generation and manual mesh cleanup are not part of
the active implementation plan. They do not block training features or release readiness.

Contributors can propose one realistic replacement at a time, licensed for open redistribution and
modification. Coverage is needed for all ten aircraft; a free download is not proof of an open license.
Keep original sources, authors, licenses, attribution, and modification notes for every model and texture.
See the [aircraft asset research](docs/research/aircraft-assets.md) for candidates and unresolved coverage.

Plan an asset-provider boundary in src/render: an aircraft ID resolves to an asset or the procedural
fallback. Standardize scale, orientation, materials, and attachment points. Load models lazily, cache shared
resources, dispose them on teardown, and provide lower-detail versions for phones. Aircraft geometry must
not determine simulation behavior. Do not extract or redistribute models from DCS installations.

### Image-to-3D asset trials — deferred

No further generation or cleanup trials are planned. The exterior experiment remains outside the
repository and has not replaced any application model. A future community proposal may use rights-cleared
exterior photographs and a service that exports an editable mesh. Keep reference attribution, generation settings,
provider/model terms and modification notes. Commercial-use permission alone does not establish open
redistribution rights. Generated assets remain outside the repository until those rights are resolved.

Review the actual rotating mesh beside its references on an external prototype site. Check the correct
aircraft variant, silhouette from every angle, canopy and intake shapes, thin surfaces, underside, texture
artifacts, scale/orientation and browser performance. A convincing image is not proof of a good 3D model.
Record accept/revise/reject decisions before expanding the method across the fleet. Retain procedural
fallbacks and do not use generated geometry as evidence for aircraft behavior.

### Interactive cockpit explorer

Start with a sourced 2D cockpit or panel view for each supported aircraft. Every mapped button, switch,
knob, and display control should expose its name, purpose, DCS binding or clickable-cockpit action,
prerequisites, operating modes, and observable effect. Link controls to procedures and relevant lessons;
mark unverified controls explicitly. Include keyboard navigation, searchable control names, zoom, and
touch-friendly hotspots. Prioritize one complete aircraft over partial coverage of every cockpit.

Use 3D only where licensed cockpit assets, readable labels, accurate control placement, and browser
performance justify it. Keep the same control metadata for both presentations and retain an accessible
2D fallback. The first F-16C explorer now provides 399 mapped items across 49 panels, search, source links
and mobile details. Its original schematics are informational, with explicit omissions and uncertainty
labels; they do not simulate aircraft systems. See [coverage and sources](docs/research/f16-cockpit.md).
Next, validate current-game interactions, improve spatial panel placement and zoom, and add procedural
walkthroughs before expanding to another aircraft.

## 5. Learning and maintenance

- Progress across aircraft, radar-picture replay, and portable debrief exports.
- Phone controls, readable contacts, and accessible keyboard/touch operation.
- Broader RWR coverage before adding surface threats to combat exercises.
- A split-bundle static deployment option as the module and asset library grows.

### Reduce interface overload

The first UX implementation follows the reviewed Learn / Practice / Fly direction. Continue gathering pilot feedback before further layout changes. The current screens expose many
controls at once; evaluate clearer starting points, progressive disclosure, a stronger primary action,
separation of lessons from free practice, and fewer competing panels. Validate proposed workflows with
representative users using external prototypes before changing navigation or visual hierarchy. Keep the
prototype website outside this repository and record accepted decisions here in Markdown.

Accepted direction for the first implementation:

- Use the Learn / Practice / Fly structure from proposal A, with Reference available separately.
- Keep the 3D world as the primary lesson surface. Reduce competing panels without removing or relegating
  the world view; keep radar and cockpit information readily accessible.
- Give guided lessons and unrestricted practice separate Learn and Practice entry points.
- On mobile, use focused tabs and an always-visible current action.

The first pass applies this structure to navigation and the 3D labs. Further proposals and asset reviews remain outside the repository; accepted decisions belong here.

## Next implementation slices and missing foundations

The UI pass is the starting point, not the complete simulator. Keep each slice reviewable with one aircraft
and explicit completion criteria before expanding across the fleet.

| Slice | First usable result | Prerequisite / acceptance |
|---|---|---|
| Aircraft visuals — community contribution, deferred | Keep existing procedural exteriors; consider one independently reviewed replacement when contributed | Final asset licence/source package, verified variant, orientation and scale, phone performance budget; previous review candidates are not integration approvals |
| Cockpit exploration | F-16C reference explorer implemented; next validate interactions and add procedure walkthroughs | Resolve documented coverage gaps, improve spatial diagrams and zoom, verify current DCS actions before claiming complete coverage |
| Flight fundamentals | One airfield and aircraft for straight flight, turns, trim, pattern, takeoff and landing | Dedicated handling model, control axes, ground contact and clear fidelity limits; do not reuse tactical autopilot as a flight model |
| Communications | Tune a radio and complete a scripted startup/taxi/departure exchange | Per-aircraft radio controls, sourced phraseology and visible transcript; speech input optional |
| Jamming | A guided and free DCS exercise comparing jammer on/off and the displayed radar picture | Verified per-module gameplay rules, version notes and uncertainty labels; no engineering-level electronic-warfare model |
| 3D weapons reference | Inspect one sourced missile and one bomb, then expand to other DCS stores | Redistributable visual assets, per-module compatibility, gameplay roles and condition-dependent range evidence |

### 3D weapons reference

Plan a separate reference section for missiles, bombs, rockets and other stores. Let users rotate and zoom
each licensed model, compare its size, and see its DCS role, supported aircraft/modules and documented
gameplay capabilities. Connect relevant entries to existing lessons and aircraft loadout references.

Range needs context: distinguish a published DCS specification from an in-game launch envelope or measured
exercise result. Show the source, module/version and conditions such as altitude, speed and target aspect;
do not present one universal effective range. Bomb release envelopes and glide reach need their own
conditions rather than missile-style range bars. Mark unavailable values as unverified.

Start with a static, sourced catalogue before adding interactive launch or delivery exercises. Keep this
at DCS gameplay level: no guidance-law design, engineering performance tables, seeker/fuze internals or
warhead design. The asset viewer and metadata should share the aircraft catalogue's licence and performance
checks. This section is planned; the existing Missile Lab remains the current interactive capability.

Additional foundations to plan:

- **Inputs and accessibility:** joystick/HOTAS and gamepad profiles, axis calibration, remapping, left/right
  modifier handling, touch controls, non-colour cues and reduced-motion options.
- **Training structure:** reusable objectives, checkpoints, reset-to-step, failure explanations, prerequisites,
  progress across aircraft and local progress export/import.
- **Navigation and airfields:** runway selection, headings, traffic patterns, wind/weather presets, waypoints
  and instrument navigation before more demanding landing exercises.
- **Procedures:** startup/shutdown, taxi, checklists and emergency drills once the relevant cockpit systems
  are represented; distinguish clickable training from simulated system behavior.
- **Debrief and evaluation:** replay the radar's perceived picture alongside truth, mark decision points and
  add portable debrief export before introducing complex missions.
- **Performance and delivery:** model LODs, texture limits, cached assets, a split-bundle build and useful
  fallbacks for low-end devices or unavailable WebGL.
- **Content maintenance:** per-module/version verification records, repeatable DCS checks and a coverage map
  that shows which aircraft have researched controls, lessons, assets and cockpit panels.

Broader modules can follow: formation, aerial refuelling, carrier operations, visual combat, navigation-only
missions and aircraft-specific emergencies. Each requires its own evidence and simulation prerequisites;
listing it here does not imply that the current app already supports it.

## Architecture direction

Keep existing boundaries: data supplies facts, sim supplies behavior, render presents state, and pages
orchestrate exercises. Introduce new contracts when the first concrete module needs them. Favor reusable
scenario setup, input profiles, exercise objectives, and recording events over a monolithic simulator page.
Keep guided lesson automation separate from free-practice controls.

Roadmaps and decisions belong in Markdown. Private discussions and personal deployment configuration do
not belong in this repository.
