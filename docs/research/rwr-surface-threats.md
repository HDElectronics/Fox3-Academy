# RWR surface-threat cues

Scope: pilot-visible DCS symbology used by the RWR trainer. This note does not describe radar or missile
engineering. Sources were checked on 21 September 2026. No current DCS build was available for an in-game
observation, so version-dependent behavior remains manual-backed rather than game-verified.

## JF-17 HSD

The Deka-authored *DCS: JF-17 Thunder Flight Manual*, document dated 21 September 2024, says the RWR
classifies search, track and attack emissions from airborne, ground and ship radars and places the detected
emissions on the HSD (printed pp. 290–291; PDF pp. 298–299). Its symbol figure distinguishes:

- ground, AAA and ship threats with **circles**;
- air threats with **rectangles**;
- the main threat with four short outward ticks;
- a jammed secondary air threat with a line below its rectangle.

This directly supports circular frames for the trainer's known `sam-long`, `sam-medium` and `sam-short`
contacts and rectangular frames for aircraft and AWACS contacts. An `unknown` contact is left unframed because
the trainer has no domain information for it. The three SAM choices remain broad range classes rather than an
exhaustive JF-17 threat library. Existing data caveats remain authoritative for the text inside the shapes: only
the `SA8` spelling is confirmed in the prior research, while `SA10` and `SA11` follow the apparent pattern.

Source: Deka Ironwork Simulations, *DCS: JF-17 Thunder Flight Manual*, 21 September 2024, pp. 290–291.
The available English machine translation is hosted by FlyAndWire:
https://flyandwire.com/wp-content/uploads/2024/09/odt_dcs-jf-17-flight-manual-en-faw240921.pdf

## AN/ALR-67 SAM warning lamp

The official Eagle Dynamics *DCS F/A-18C Early Access Guide*, updated 24 March 2024, identifies separate
warning-panel categories (p. 414): `AI` is an airborne intercept radar in lock mode, `SAM` is a surface-to-air
radar that has locked the aircraft, and `CW` is continuous-wave energy that is probably guiding a missile. The
official appendix lists the representative surface codes used by this trainer (pp. 419–420): `10` for the
SA-10 tracking radar, `11` for the SA-11 tracking radar, and `15` for the SA-15 radar.

Heatblur's official DCS F-14 ALR-67 manual documents the same SAM/AAA/AI/CW categories for its modeled
ALR-67. A category lamp is steady for a critical-band threat and flashes when active engagement is detected.
The shared trainer therefore keeps AI limited to airborne locks/launches, lights SAM steadily for a known
surface lock, and flashes SAM for a surface launch. An active-seeker `M` contact alone lights neither shooter
category. The Hornet manual explicitly establishes its SAM lock lamp but does not separately spell out the
lamp's launch flashing, so the trainer describes the latter as its shared ALR-67 presentation rather than a
Hornet-specific verified cue.

The trainer's abstract `launch` state also drives the CW lamp. The manuals define CW as detected
continuous-wave energy, probably associated with missile guidance; they do not establish that every
representative SAM or fighter launch used by the trainer produces that cue. This remains an explicit display
approximation rather than a per-emitter DCS claim.

Sources:

1. Eagle Dynamics, *DCS F/A-18C Early Access Guide*, updated 24 March 2024, pp. 414, 419–420:
   https://www.digitalcombatsimulator.com/en/downloads/documentation/dcs-hornet_early_access_guide_en/
2. Heatblur, *DCS F-14 Tomcat Manual — ALR-67*, “Warning Lights”:
   https://f14.manuals.heatblur.se/f14ab/systems/defensive_systems/rwr/alr_67.html

## Trainer boundary

The trainer supplies representative long-, medium- and short-range SAM contacts. It does not claim to cover
every DCS surface radar identity, launcher relationship or guidance method. SAM launch is a generic
player-facing warning state; no engineering-level behavior is modeled.
