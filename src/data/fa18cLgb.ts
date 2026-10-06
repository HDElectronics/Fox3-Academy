/** Pilot-facing DCS procedures; no weapon engineering model.
 * ED DCS F/A-18C Early Access Guide, 24 March 2024.
 * See docs/research/fa18c-lgb.md for page references and training abstractions. */
export const LGB_SOURCE = 'ED F/A-18C Early Access Guide (24 March 2024), pp75, 224–227, 310–312, 321–322';
export const LGB_SOURCE_URL = 'https://www.digitalcombatsimulator.com/en/downloads/documentation/dcs-hornet_early_access_guide_en/';

/** Preset choices for this exercise, not a specification of valid DCS laser codes. */
export const LGB_CODE_PRESETS = ['1688', '1687'] as const;

/** Seconds. Only triggerPulse is sourced; the other durations are arbitrary lesson pacing. */
export const LGB_TRAINING_TIMING = {
  approach: 8,
  flight: 12,
  autoLaserLead: 6,
  triggerPulse: 2,
  requiredIllumination: 3,
} as const;

export const LGB_FACTS = {
  weapon: 'GBU-12 appears as 82LG on the SMS page.',
  setup: 'Select A/G, 82LG, MODE AUTO, MFUZ OFF and EFUZ INST; create a target designation.',
  bombCode: 'SMS CODE opens UFC code entry. Select CODE, enter four digits and press ENT. Match the bomb code to the designator code.',
  podCode: 'FLIR UFC opens LTDC and LSTC. Select LTDC, enter the designator code and press ENT. LTDC and bomb CODE are separate settings.',
  arm: 'Set LTD/R to ARM to enable the laser. The FLIR format shows the laser-arm field.',
  trigger: 'Box TRIG for trigger control. A press fires the laser for two seconds; holding the trigger fires continuously.',
  release: 'In AUTO, keep the velocity vector on the azimuth steering line and hold Weapon Release as the release cue approaches. Release the button after the bomb leaves.',
  countdown: 'The ATFLIR countdown changes from REL before release, to LASER before automatic lasing, then TTI until impact.',
} as const;

export const LGB_CAVEATS = [
  'The abbreviated STORES page, UFC option placement and HUD geometry are trainer layouts, not a full cockpit replica. Only the exercised code and laser controls are interactive.',
  'Manual review, not current-game verification: these procedures follow the ED guide dated 24 March 2024.',
  'The aircraft is preconfigured in A/G with one GBU-12, AUTO, MFUZ OFF and EFUZ INST. The training pass is aligned; aircraft handling and bomb ballistics are omitted.',
  'The 8-second approach, 12-second flight and last-6-second automatic laser window are arbitrary lesson timings, not DCS release or lasing schedules.',
  'Impact is a simplified training result based on target designation, matching codes and uninterrupted lasing for the final 3 seconds. This is an arbitrary completion rule, not DCS bomb behavior; it does not reproduce DCS bomb capture or reacquisition behavior.',
  '1688 and 1687 are exercise presets. This lesson does not validate the complete set of DCS laser codes or model multi-station code entry.',
  'Lost tracking and interrupted lasing are scripted exercises. Pod masking, laser limitations and automatic/manual laser transition details still need current-game verification.',
] as const;
