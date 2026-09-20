# Development roadmap

Fox Three School is evolving from a BVR trainer into a broader DCS learning environment. The current
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

Replace the current silhouettes incrementally with realistic models licensed for open redistribution and
modification. Research coverage for all ten aircraft; a free download is not proof of an open license.
Keep original sources, authors, licenses, attribution, and modification notes for every model and texture.
See the [aircraft asset research](docs/research/aircraft-assets.md) for candidates and unresolved coverage.

Plan an asset-provider boundary in src/render: an aircraft ID resolves to an asset or the procedural
fallback. Standardize scale, orientation, materials, and attachment points. Load models lazily, cache shared
resources, dispose them on teardown, and provide lower-detail versions for phones. Aircraft geometry must
not determine simulation behavior. Do not extract or redistribute models from DCS installations.

### Interactive cockpit explorer

Start with a sourced 2D cockpit or panel view for each supported aircraft. Every mapped button, switch,
knob, and display control should expose its name, purpose, DCS binding or clickable-cockpit action,
prerequisites, operating modes, and observable effect. Link controls to procedures and relevant lessons;
mark unverified controls explicitly. Include keyboard navigation, searchable control names, zoom, and
touch-friendly hotspots. Prioritize one complete aircraft over partial coverage of every cockpit.

Use 3D only where licensed cockpit assets, readable labels, accurate control placement, and browser
performance justify it. Keep the same control metadata for both presentations and retain an accessible
2D fallback. This is planned work, not part of the current P1 implementation.

## 5. Learning and maintenance

- Progress across aircraft, radar-picture replay, and portable debrief exports.
- Phone controls, readable contacts, and accessible keyboard/touch operation.
- Broader RWR coverage before adding surface threats to combat exercises.
- A split-bundle static deployment option as the module and asset library grows.

### Reduce interface overload

Plan a separate UX phase with pilot feedback before implementation. The current screens expose many
controls at once; evaluate clearer starting points, progressive disclosure, a stronger primary action,
separation of lessons from free practice, and fewer competing panels. Validate proposed workflows with
representative users using external prototypes before changing navigation or visual hierarchy. Keep the
prototype website outside this repository and record accepted decisions here in Markdown.

Preferred prototype direction (pending implementation approval):

- Use the Learn / Practice / Fly structure from proposal A, with Reference available separately.
- Keep the 3D world as the primary lesson surface. Reduce competing panels without removing or relegating
  the world view; keep radar and cockpit information readily accessible.
- Give guided lessons and unrestricted practice separate Learn and Practice entry points.
- On mobile, use focused tabs and an always-visible current action.

These are design preferences for the next external prototype revision, not approval to redesign the app.

## Architecture direction

Keep existing boundaries: data supplies facts, sim supplies behavior, render presents state, and pages
orchestrate exercises. Introduce new contracts when the first concrete module needs them. Favor reusable
scenario setup, input profiles, exercise objectives, and recording events over a monolithic simulator page.
Keep guided lesson automation separate from free-practice controls.

Roadmaps and decisions belong in Markdown. Private discussions and personal deployment configuration do
not belong in this repository.
