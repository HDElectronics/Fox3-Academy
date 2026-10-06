# F/A-18C JDAM TOO lesson

Scope: DCS pilot-facing setup, designation and manual release of one GBU-38. No weapon engineering, ballistic model, targeting internals or damage model.

## Source

Eagle Dynamics, [DCS F/A-18C Early Access Guide](https://www.digitalcombatsimulator.com/en/downloads/documentation/dcs-hornet_early_access_guide_en/), 24 March 2024, printed pages 329–341. Read from the locally supplied official PDF. These are manual-reviewed statements, not observations of the current DCS build.

- pp329–330: JDAM supports launch-and-leave employment. TOO procedure selects A/G, weapon, TOO, EFUZ INST, designation, then Weapon Release with IN RNG.
- pp330–331: weapon selection applies power. Warmup takes 2 minutes 30 seconds. TIMING counts from 10:00 to 7:30; deselection requires another warmup. TIMING is distinct from the station status. Stations are STBY during warmup; the priority station becomes RDY when A/G Ready conditions are met.
- p331: GBU-38 is J-82. The guide's alignment-quality descriptions are inconsistent: p330 associates 7:30 with GOOD, while p331 says GOOD may require ten minutes and is not a release interlock. The lesson therefore models the 150-second warmup without teaching a GOOD-quality timing threshold.
- pp332–334: ARM is not necessarily RDY. The selected priority station and target validity matter. TOO cues the selected weapon to the sensor-designated target. EFUZ has an INST selection.
- pp335–336: JDAM DSPLY contains quantity and release type; MAN is the documented implemented type in this manual revision.
- p338: TOO takes a target point from a waypoint or sensor; MSN displays its coordinates and elevation. No coordinates or UFC input sequence is invented by this trainer.
- pp340–341: MANUAL uses a heading cue and TMR / IN RNG / IN ZONE range indications. It does **not** use the conventional AUTO azimuth steering line or release cue.

## Deliberate training simplifications

The page uses one store and three lessons: setup, delivery, and correcting a wrong TOO target. Selection starts the full 150-second timer. An explicitly labelled training shortcut skips this wait. The aircraft follows an aligned eight-second approach, then holds the IN RNG opportunity open. Flight takes twelve seconds. These durations are arbitrary pacing, not a DCS range model.

The manual's quick procedure says to press Weapon Release; no JDAM-specific minimum hold duration was verified in the reviewed pages. The held web control releases as soon as the exercise conditions are satisfied. The page must not claim a timed dwell matches DCS.

The bomb snapshots the designated target on release. A later designation change does not move the released bomb. The exercise succeeds when the assigned target was selected, otherwise it depicts a miss of the assigned target. Laser controls have no role. Paths, enlarged exterior and impact effects are visual teaching aids only.

The abbreviated cockpit omits PP coordinate entry, multi-store sequencing, alignment-quality progression and advanced delivery modes. Current-DCS button-hold details, display fidelity and readiness behaviour remain to be checked in game. Export these caveats from `src/data/fa18cJdam.ts` and show them in the lesson; list uncertainties in the shared data API documentation.
