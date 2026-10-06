/** HARM fault-recovery exercises. DCS controls: docs/research/fa18c-harm.md.
 * The initial faults and timed radar shutdown are scripted teaching setups, not DCS AI predictions. */
import type { HarmAvionics } from './avionics';
import type { HarmLesson, HarmStep } from './lessons';

export const TROUBLE_ORDER = ['handoff', 'code', 'waypoint', 'silent', 'last'] as const;
export type TroubleId = typeof TROUBLE_ORDER[number];
export const troubleProgressKey = (id: TroubleId): string => `harm:troubleshoot:${id}:fa18c`;
export const troubleComplete = (read: (key: string) => unknown): boolean => TROUBLE_ORDER.every(id => read(troubleProgressKey(id)) === true);
export function troubleId(value: string | null): TroubleId { return TROUBLE_ORDER.find(id => id === value) ?? 'handoff'; }

interface TroubleCase { label: string; lesson: HarmLesson; prepare: (av: HarmAvionics) => void }
const NM = 1852;
const jet = { x: 0, z: 0, altFt: 25000, headingDeg: 0, speedKt: 450 };
const arm = (av: HarmAvionics) => { av.toggleMasterArm(); av.setMaster('AG'); av.osb(6); };
const pb = (av: HarmAvionics, code: string) => {
  arm(av); av.osb(3); av.osb(14); av.ufcKey('OPT4');
  for (const key of code) av.ufcKey(key as '1');
  av.ufcKey('ENT'); av.wpdsg();
};
const pbSetup: NonNullable<HarmLesson['setup']> = () => ({
  sim: { jet, sites: [{ id: 'sa11', name: 'SA-11', system: 'sa11', at: { x: 0, z: -25 * NM } }] },
  waypoints: p => [{ name: 'WP4 SA-11', pos: p('sa11') }],
});
const shot: HarmStep = {
  id: 'fire', text: 'Hold WEAPON RELEASE and fly the PB steering and pull-up cues.', keys: 'R, Down arrow',
  why: 'Keep the flight path marker on the steering line and raise it to the release cue. The trainer releases when both conditions are met (guide p375).',
  check: s => s.launches > 0,
};
const kill: HarmStep = {
  id: 'kill', text: 'Confirm the Snow Drift was destroyed.',
  why: 'A release alone does not prove the setup was correct. Check the impact and the event log.',
  check: s => s.kills.includes('sa11-sr'),
};

export const TROUBLE_CASES: Record<TroubleId, TroubleCase> = {
  handoff: {
    label: 'TOO STBY',
    lesson: {
      id: 'troubleshoot', short: 'Troubleshoot', title: 'TOO: boxed but not ready', kind: 'drill',
      goal: 'The SA-6 is boxed, but TOO still says STBY. Master Arm, A/G and TDC are already set. Fix the missing step and hit the radar. This range holds fire.',
      setup: () => ({ sim: { jet, sites: [{ id: 'sa6', name: 'SA-6', system: 'sa6', at: { x: 0, z: -25 * NM } }] }, waypoints: p => [{ name: 'WP2 SA-6', pos: p('sa6') }] }),
      steps: [
        { id: 'handoff', text: 'Turn STBY into RDY with a target hand-off.', keys: 'C', why: 'A box is only the priority selection. Cage/Uncage gives that target to the HARM; look for H-OFF and RDY (guide p368).', check: s => s.handoff === '6' },
        { id: 'fire', text: 'Release one HARM.', keys: 'R', why: 'With H-OFF shown, weapon release sends the HARM to the selected radar.', check: s => s.launches > 0 },
        { id: 'kill', text: 'Confirm the SA-6 radar was destroyed.', why: 'The event log reports the Straight Flush kill.', check: s => s.kills.includes('sa6-str') },
      ],
    },
    prepare: av => { arm(av); av.osb(4); av.tdcToHarm(); },
  },
  code: {
    label: 'PB code',
    lesson: {
      id: 'troubleshoot', short: 'Troubleshoot', title: 'PB: right place, wrong code', kind: 'drill',
      goal: 'WP4 is on an SA-11 Snow Drift, but TGT is 108. HARM is not crossed out: an accepted code can still be the wrong code. Correct it before firing. This range holds fire.',
      setup: pbSetup,
      steps: [
        { id: 'code', text: 'Use the kneeboard to enter the Snow Drift code on the UFC.', why: '108 names the SA-6 Straight Flush. The Snow Drift is 107. Press UFC, option 4, type 107 and ENT (guide pp374, 420).', hint: { ddi: 14 }, check: s => s.pbCode === 107 },
        shot, kill,
      ],
    },
    prepare: av => pb(av, '108'),
  },
  waypoint: {
    label: 'PB point',
    lesson: {
      id: 'troubleshoot', short: 'Troubleshoot', title: 'PB: right code, wrong point', kind: 'drill',
      goal: 'TGT 107 is correct, but WP3 is designated over empty ground. Put the PB target point on the Snow Drift at WP4 before firing. This range holds fire.',
      setup: () => ({ ...pbSetup(), waypoints: p => [{ name: 'WP3 empty ground', pos: { x: -8 * NM, y: 0, z: -20 * NM } }, { name: 'WP4 SA-11', pos: p('sa11') }] }),
      steps: [
        { id: 'point', text: 'Step the HSI to WP4 and press WPDSG again.', why: 'Selecting a waypoint alone does not designate it. PB flies to the designated point, then listens for the coded radar nearby (guide pp122, 373).', check: s => s.designated === 'WP4 SA-11' },
        shot, kill,
      ],
    },
    prepare: av => pb(av, '107'),
  },
  silent: {
    label: 'Silent radar',
    lesson: {
      id: 'troubleshoot', short: 'Troubleshoot', title: 'SP: the radar went quiet', kind: 'drill',
      goal: 'One HARM is already airborne and has lost the SA-6 signal. A scripted 30 s silence starts now; the radar then stays on. Wait for 6 to return before using another HARM. This range holds fire.',
      setup: () => ({ sim: { jet, sites: [{ id: 'sa6', name: 'SA-6', system: 'sa6', at: { x: 0, z: -25 * NM } }] }, waypoints: p => [{ name: 'WP2 SA-6', pos: p('sa6') }] }),
      steps: [
        { id: 'return', text: 'Wait until 6 returns on the EW page.', why: 'A missing symbol is not proof of a kill. The first HARM lost guidance; check the log. This timed shutdown is a training script (guide p367 for guidance loss).', check: s => s.spCue === '6' },
        { id: 'retry', text: 'Release one follow-up HARM with 6 cued.', keys: 'R', why: 'The first missile does not regain guidance in this simplified trainer. Use a fresh shot once the radar transmits.', check: s => s.launches >= 2 },
        { id: 'kill', text: 'Confirm the SA-6 radar was destroyed.', why: 'Look for a kill report, not just an empty EW page.', check: s => s.kills.includes('sa6-str') },
      ],
    },
    prepare: av => {
      arm(av); av.setRelease(true); av.setRelease(false);
      av.sim.step(8);
      av.sim.sites[0]!.quietUntil = av.sim.t + 30;
      av.sim.step(0.02);
    },
  },
  last: {
    label: 'Last HARM',
    lesson: {
      id: 'troubleshoot', short: 'Troubleshoot', title: 'SP: one HARM, two radars', kind: 'drill',
      goal: 'Only one HARM remains. SP has cued the nearer SA-8 (8), but your assigned target is the SA-6 (6). Check the cue before spending the last weapon. Both sites hold fire.',
      setup: () => ({ sim: { jet, sites: [
        { id: 'sa6', name: 'Assigned SA-6', system: 'sa6', at: { x: 0, z: -25 * NM } },
        { id: 'sa8', name: 'SA-8', system: 'sa8', at: { x: 2 * NM, z: -12 * NM } },
      ] }, waypoints: p => [{ name: 'WP2 SA-6', pos: p('sa6') }] }),
      steps: [
        { id: 'cue', text: 'Use HARM Sequence to box 6 on the EW page.', keys: 'I', why: 'SP prioritises threats automatically; that may not be your assigned target. HARM Sequence selects another emitter (guide p365).', check: s => s.spCue === '6' },
        { id: 'fire', text: 'Release your last HARM at the SA-6.', keys: 'R', why: 'There is no in-flight reload. A wasted shot means this exercise must be restarted.', check: s => s.launches > 0 },
        { id: 'kill', text: 'Confirm the assigned radar was destroyed.', why: 'Destroying the SA-8 does not meet this objective.', check: s => s.kills.includes('sa6-str') },
      ],
    },
    prepare: av => { arm(av); av.stations = [3]; },
  },
};
