/** Pilot-facing DCS workflow only. See docs/research/fa18c-jdam.md. */
export const JDAM_SOURCE = 'ED F/A-18C Early Access Guide (24 March 2024), pp329–341';
export const JDAM_SOURCE_URL = 'https://www.digitalcombatsimulator.com/en/downloads/documentation/dcs-hornet_early_access_guide_en/';
export const JDAM_TIMING = {
  /** Sourced warmup; selection applies power. */
  warmup: 150,
  /** Sourced initial TIMING clock (counts down to 7:30). */
  alignmentClock: 600,
  /** Arbitrary lesson pacing, not weapon performance. */
  approach: 8,
  flight: 12,
} as const;
export const JDAM_FACTS = {
  weapon: 'GBU-38 appears as J-82 on the Hornet STORES format.',
  setup: 'Select A/G, J-82 and TOO. Set EFUZ INST and Master Arm ARM.',
  power: 'Selecting the weapon applies power. Warmup takes 2 minutes 30 seconds; deselecting requires a new warmup.',
  timing: 'TIMING starts at 10:00 and clears at 7:30. STBY and RDY are station status cues; TIMING is separate.',
  target: 'TOO uses the current sensor or waypoint target designation. Check the intended target before release.',
  release: 'In MAN delivery, steer toward the target bearing and use Weapon Release when IN RNG is displayed.',
  hud: 'MANUAL uses a heading cue and range status. It does not use the conventional AUTO azimuth steering line or release cue.',
  leave: 'JDAM is a launch-and-leave weapon. Laser codes and continued illumination are not required.',
} as const;
export const JDAM_CAVEATS = [
  'Manual review, not current-game verification: this lesson follows the ED guide dated 24 March 2024.',
  'The 8-second approach and 12-second bomb flight are arbitrary lesson timings. The aligned training pass does not calculate a DCS launch zone, flight dynamics or weapon performance.',
  'The Skip warmup training control advances the documented 150-second warmup immediately; it is not a Hornet cockpit control.',
  'The abbreviated cockpit practices one GBU-38, TOO and MAN release. PP missions, multi-station releases, alignment-quality details and other release modes are omitted.',
  'The manual gives inconsistent alignment-quality timing statements. This lesson models the documented 150-second warmup interlock, without asserting a GOOD quality threshold.',
  'The held release control releases immediately when the training prerequisites and IN RNG are satisfied. A current-DCS minimum button-hold duration has not been verified and is not simulated.',
  'Impact is a simple exercise result: the bomb retains the target designated at release. Changing the designation afterwards does not move that released bomb. No laser or seeker model is used.',
  'The weapon exterior, path and impact effects are illustrative and enlarged for readability, not weapon performance or damage simulation.',
] as const;
