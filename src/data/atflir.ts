/** ED DCS F/A-18C Early Access Guide, 24 March 2024, pp217–227.
 * See docs/research/fa18c-atflir.md for the source and modeled subset. */
export const ATFLIR_CAVEATS = [
  'Synthetic overhead image, training targets and reticles: simplified, not DCS video or a cockpit replica.',
  'Field-of-view scale, slew speed, acquisition tolerance and instant acquisition are training values, not verified in DCS.',
  'The pod starts warmed up, in A/G, with a waypoint designated. Aircraft motion, pod limits and masking are omitted.',
  'Obstruction is a manual training event. Clearing it does not automatically reacquire a track in this trainer.',
  'Offset designation, zoom, laser, LST and weapon delivery are outside these foundation lessons.',
] as const;
export const ATFLIR_SOURCE = 'ED F/A-18C Early Access Guide (24 March 2024), pp217–227';
