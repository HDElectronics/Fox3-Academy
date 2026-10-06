/** ED DCS F/A-18C Early Access Guide, 24 March 2024, pp217–227.
 * See docs/research/fa18c-atflir.md for the source and modeled subset. */
export const ATFLIR_CAVEATS = [
  'Original 3D depot, training targets and reticles: simplified, not DCS scenery or a cockpit replica.',
  'Camera field of view, slew speed, acquisition tolerance and instant acquisition are training values, not verified in DCS.',
  'The pod starts warmed up, in A/G, with a waypoint designated. Aircraft motion, pod limits and masking are omitted.',
  'Obstruction is a manual training event. Clearing it does not automatically reacquire a track in this trainer.',
  'IR contrast and the optional green night-vision look are artistic filters, not thermal or night-vision sensor models.',
  'Offset designation, zoom and LST are outside these lessons. Laser and GBU-12 exercises use separately documented training rules.',
] as const;
export const ATFLIR_SOURCE = 'ED F/A-18C Early Access Guide (24 March 2024), pp217–227';
