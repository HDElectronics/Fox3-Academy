# Browser QA — 2026-09-21

This pass used interactive Chrome on macOS at 1440 × 900 and an actual 390 × 844 browser viewport,
plus the repository's headless visual harness. Phone-width browser checks do not establish real-device
touch behavior. Existing aircraft models and DCS fact sources were unchanged.

## Interactive coverage

| Area | Actions and observed result |
|---|---|
| Learn / navigation | Started the radar lesson from the aircraft overview; moved between Learn, Practice, Fly and Reference; aircraft selection propagated. |
| Radar Lab | Changed display range, elevation and FC3 expected range; checked contact explanations and mobile Controls. Expected range and cursor coverage have separate values. |
| TWS | Entered free practice, changed radar mode, unlocked with Backspace, and returned to the guided lesson with its state and navigation reset. |
| Missile Lab | Paused and scrubbed replay to its beginning, changed camera, adjusted range on phone Controls, and computed the exact launch-zone values; slider bands and persistent actions remained usable. |
| Defense | Started a drill, selected a notch maneuver with the keyboard and dispensed chaff; count and coaching changed. |
| RWR | Switched the audio control on/off and completed a quiz answer/debrief flow. Listening quality was not assessed. |
| Cockpit | Searched the F-16C map for master arm and opened the matching explanation and sources. |
| Reference | Opened Sources and navigated from that deep section to the Sortie brief; the destination appeared at its top. |
| Sortie | Started an F-16C two-versus-two flight, paused/resumed, checked a mode-key tap while paused, steered with the action button, and ended into debrief. |
| Debrief | Switched Truth / Your radar, paused and scrubbed, then jumped to an enemy launch event. Radar perspective retained ownship focus; switching back restored truth controls. |

## Visual and automated checks

- Radar and Reference: Su-27, F-15C and M-2000C at 1440 and 390 px; all 12 screenshots inspected.
- Shared API adoption: eight screenshots inspected across Hangar, TWS, Defense and Missile Lab.
- Radar replay: seven screenshots inspected, including desktop/phone Su-27, F-15C and M-2000C.
- Additional live phone checks covered Radar Controls and Missile Lab launch-zone bands.
- Typechecking, the normal test suite and the single-file production build passed before integration.
  Tests cover independent recording snapshots, replay frame selection without future estimates, range-angle
  inputs and restart persistence, typed data contracts, slider zones and Sortie hold thresholds/cancellation.
- Environment-gated tuning suites were not run; no missile-model tuning changed.

## Corrections from this pass

- Sortie no longer completes a held action after pause or focus loss. A lost-focus release does not become
  a Viper short tap. A completed hold is recognized even when key release arrives between animation frames.
- FC3 expected range survives scene restarts and is independent of cursor movement and display scale.
- Radar elevation no longer repeats the degree symbol, and obsolete shared-range caveat text was removed.
- Debrief event navigation cannot move the radar-view camera to an otherwise hidden truth object.

## Still open

- Test one- and two-second holds with a physical keyboard in FC3, F-16C and M-2000C. Automated clock tests
  cover the thresholds and cancellation paths; browser automation used discrete key presses.
- Listen to RWR cues and test autoplay/resume behavior by ear.
- Use real phone touch gestures, including camera manipulation, slider dragging and persistent actions.
- Check browser Back/Forward scroll restoration across all routes.
- Benchmark sustained frame rate and memory on low-end GPUs and longer sessions.
- Radar-volume coverage annotations can still overlap nearby aircraft labels in crowded views; this
  separate annotation layout deserves another visual pass.

These remain tracked through B16 and the display backlog. This report is browser evidence, not an
in-game DCS verification; unresolved gameplay observations remain in
[verification-status.md](research/verification-status.md).
