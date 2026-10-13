export const JDAM_ORDER = ['setup','delivery','troubleshoot'] as const;
export type JdamLesson = typeof JDAM_ORDER[number];
export const jdamLesson = (value: string | null): JdamLesson => JDAM_ORDER.find(id=>id===value) ?? 'setup';
export const jdamKey = (id: JdamLesson) => `jdam:${id}:fa18c`;
export const JDAM_LESSONS = {
  setup: { title: 'Prepare the JDAM', goal: 'One GBU-38 is loaded. Select J-82, prepare TOO delivery and designate the assigned truck at WP2.', steps: ['Select A/G, J-82 and TOO.', 'Complete warmup and set EFUZ INST.', 'Set Master Arm ARM, select WP2 and press WPDSG. Confirm RDY.'] },
  delivery: { title: 'Deliver in TOO', goal: 'The assigned target is the single truck at WP2. Verify readiness, start the aligned training pass and release on IN RNG. No laser is needed.', steps: ['Prepare the weapon and confirm the assigned target.', 'Start the training pass; release when IN RNG appears.', 'Watch the GBU-38 reach the target.'] },
  troubleshoot: { title: 'Wrong designation', goal: 'The weapon is ready, but WP3 points at the wrong truck. Inspect the target before releasing. Changing the designation after release does not retarget that bomb.', steps: ['Correct the designation to the assigned WP2 truck.', 'Release in range with the corrected designation.', 'Confirm impact on the assigned truck.'] },
} as const;
