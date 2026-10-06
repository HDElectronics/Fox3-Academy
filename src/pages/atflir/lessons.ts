/** Hornet ATFLIR foundations. Sources and limits: docs/research/fa18c-atflir.md. */
export const LESSON_ORDER = ['control', 'find', 'track', 'recover'] as const;
export type LessonId = typeof LESSON_ORDER[number];
export const lessonId = (value: string | null): LessonId => LESSON_ORDER.find(id => id === value) ?? 'control';
export const progressKey = (id: LessonId): string => `atflir:${id}:fa18c`;
export const LESSONS: Record<LessonId, { title: string; goal: string; steps: readonly string[] }> = {
  control: { title: 'Give FLIR control', goal: 'The pod is already powered, in A/G, with WP2 designated. FLIR is on the right DDI. Assign TDC, then free the line of sight.',
    steps: ['Press SCS Right to assign TDC to FLIR.', 'Press Undesignate once to enter INR.', 'Slew the reticle with the TDC.'] },
  find: { title: 'Find the target', goal: 'Find the single truck above and right of the warehouse. Use the wider image to orient, then narrow the field of view.',
    steps: ['Assign TDC with SCS Right.', 'Undesignate, then slew onto the single truck.', 'Centre the truck in NAR field of view.'] },
  track: { title: 'Designate & track', goal: 'Move the WP2 designation to the single truck. In designation mode, hold TDC depress while slewing. Then use SCS Right for SCENE and AUTO.',
    steps: ['Assign TDC, then move the designation onto the truck with TDC depressed.', 'Release TDC depress and press SCS Right for SCENE.', 'Press SCS Right again and acquire the truck in AUTO.'] },
  recover: { title: 'Recover a track', goal: 'AUTO is tracking the wrong truck, left of the warehouse. Normal TDC slewing is inhibited. Break the track and acquire the assigned single truck on the right.',
    steps: ['Press Undesignate to leave AUTO.', 'Slew right onto the assigned single truck.', 'Press SCS Right for SCENE, then again for AUTO.'] },
};
