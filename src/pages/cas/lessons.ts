/**
 * [OWNER: page-cas] Lesson definitions and scoring for the CAS & JTAC page (pure, unit-tested). The JTAC flow
 * follows the ED A-10C II manual ("F4 JTAC"); clearance, abort and friendly-safety rules are trainer rules.
 * Per jet: `LESSONS` / `CAS_LESSON_ORDER` are the Su-25T's; `lessonsFor('a10c')` adds the JTAC laser hand-off and the
 * digital 9-line and rewrites the Shkval steps for the targeting pod (docs/research/a10c.md §2-4, §8).
 * Game level only (AGENTS.md rule 1).
 */
import type { Debrief } from '../strike/lessons';
import type { CasJet, CasLessonId } from './scenario';
import type { JtacState, Violation } from './jtac';
import type { ImpactClass } from './safety';

export type { CasLessonId, Debrief };
export const CAS_LESSON_ORDER: CasLessonId[] = ['nine-line', 'talk-on', 'geometry', 'danger-close', 'sortie'];
/** A-10C II order: the brief, the digital 9-line, the JTAC laser, then the smoke lessons with the pod. */
export const A10C_LESSON_ORDER: CasLessonId[] = ['nine-line', 'digital', 'jtac-laser', 'talk-on', 'geometry', 'danger-close', 'sortie'];
export const lessonOrder = (jet: CasJet): CasLessonId[] => (jet === 'a10c' ? A10C_LESSON_ORDER : CAS_LESSON_ORDER);

/** Trainer rules the page states in its caveats (on top of the data caveats). */
export const CAS_PAGE_CAVEATS = [
  'When the AI JTAC clears you hot, says continue or aborts is not documented by ED. Here: cleared hot needs the attack heading inside the briefed window and the Shkval on a briefed target; a wrong target or heading aborts.',
  'Friendly safety: an impact within 500 m of a friendly counts as danger close; any friendly destroyed fails the lesson. Trainer rules.',
  'The jet flies itself: you steer with trainer keys. The talk-on wording, the smoke offset from the target and the JTAC pace are simplified.',
];

/** A-10C II trainer rules, shown with the page caveats when the A-10C II flies. */
export const A10C_PAGE_CAVEATS = [
  'A-10C II: cleared hot needs the pod point track, or an SPI you set from the pod, on a briefed target. The TAD triangle alone is coordinates, not eyes on the target.',
  'A-10C II: the pod is already on and timed out in A-G at the start; the AHCP switches, the CNTL page and the DSMS are not modelled. Codes are 1688 everywhere.',
  'A-10C II: weapon release fires on the press. In DCS you hold release through the CCRP cue; the trainer does not model the cue timing.',
  'A-10C II: what the JTAC says after Spot, Shift and Terminate, and when it stops lasing, is trainer wording and a trainer rule.',
  'A-10C II: WILCO and CNTCO are buttons (OSB 19 and OSB 7 on the MSG page); no keyboard default was found.',
];

/**
 * A-10C II cockpit milestones, sticky once reached (the page records them): 'hook-tasking' (TAD triangle hooked),
 * 'spi-tasking' (the triangle made the SPI), 'slave' (pod slaved to the SPI), 'lss-detect', 'lss-track',
 * 'point-target' (pod POINT track on a briefed target), 'spi-tgp' (SPI set from the pod on a briefed target),
 * 'laser-release' (own laser firing with an own weapon in flight).
 */
export type A10cMilestone = 'hook-tasking' | 'spi-tasking' | 'slave' | 'lss-detect' | 'lss-track' | 'point-target' | 'spi-tgp' | 'laser-release';

/** What the steps look at, sampled by the page. */
export interface CasSnap {
  jet: CasJet;
  jtac: JtacState;
  /** Radio menu open (DCS: backslash). */
  menuOpen: boolean;
  /** Kneeboard: key lines graded correct, and whether the card passed. */
  cardPassed: boolean;
  shkvalOn: boolean;
  /** The Shkval is locked on a briefed target / on something else. */
  lockedTarget: boolean;
  lockedOther: boolean;
  /** Heading inside the attack window. */
  onAttackHeading: boolean;
  releases: number;
  clearedReleases: number;
  violations: number;
  targetsKilled: number;
  targets: number;
  fratricide: boolean;
  attacks: number;
  /** A-10C II (false / 'off' / 'none' on the Su-25T). */
  tgpOn: boolean;
  lss: 'off' | 'search' | 'detect' | 'track' | 'lost';
  laserFiring: boolean;
  /** The JTAC's laser spot is on. */
  jtacLasing: boolean;
  /** The digital 9-line: none yet, new (ATTACK flashing), accepted or refused. */
  tasking: 'none' | 'new' | 'wilco' | 'cntco';
  milestones: ReadonlySet<A10cMilestone>;
}

export interface LessonStep { id: string; text: string; keys?: string; check: (s: CasSnap) => boolean }

export interface LessonDef {
  id: CasLessonId;
  title: string;
  short: string;
  goal: string;
  steps: LessonStep[];
  /** Scored lessons end with a debrief; unscored ones complete when every step is done. */
  scored: boolean;
}

const after = (s: JtacState, ...states: JtacState[]) => states.includes(s);

export const LESSONS: Record<CasLessonId, LessonDef> = {
  'nine-line': {
    id: 'nine-line', title: 'Radio and 9-line', short: '9-line', scored: true,
    goal: 'Check in with the JTAC, copy the 9-line and the remarks on the kneeboard card, and read back.',
    steps: [
      { id: 'menu', text: 'Open the radio menu: F4 JTACs, then pick the JTAC.', keys: '\\, F4', check: s => s.menuOpen || s.jtac !== 'idle' },
      { id: 'checkin', text: 'Check in. The game sends your position, weapons and playtime for you.', keys: 'F1', check: s => s.jtac !== 'idle' },
      { id: 'copy', text: 'When the JTAC asks, select Ready to copy and write each line on the card.', keys: 'F1', check: s => after(s.jtac, 'nine-line', 'remarks-ready', 'remarks', 'readback', 'data', 'await-ip', 'inbound', 'lasing', 'mark-down', 'talk-on', 'cleared', 'aborted', 'off', 'complete') },
      { id: 'remarks', text: 'Ready to copy remarks: weapon, threats, final attack heading.', keys: 'F1', check: s => after(s.jtac, 'remarks', 'readback', 'data', 'await-ip', 'inbound', 'lasing', 'mark-down', 'talk-on', 'cleared', 'aborted', 'off', 'complete') },
      { id: 'card', text: 'Card complete: IP, elevation, grid, mark and friendlies must be right.', check: s => s.cardPassed },
      { id: 'readback', text: 'Read back the grid, elevation and attack heading.', keys: 'F1', check: s => after(s.jtac, 'data', 'await-ip', 'inbound', 'lasing', 'mark-down', 'talk-on', 'cleared', 'aborted', 'off', 'complete') },
    ],
  },
  'talk-on': {
    id: 'talk-on', title: 'Talk-on from the mark', short: 'Talk-on', scored: false,
    goal: 'Call IP inbound, find the white smoke, follow the talk-on from the mark and lock the target with the Shkval.',
    steps: [
      { id: 'ip', text: 'Radio menu: IP Inbound. The JTAC answers continue.', keys: '\\, F1', check: s => !after(s.jtac, 'await-ip') },
      { id: 'mark', text: 'Inside 10 nm the JTAC puts white smoke down: "mark is on the deck".', check: s => after(s.jtac, 'mark-down', 'talk-on', 'cleared', 'aborted', 'off', 'complete') },
      { id: 'contact', text: 'Find the smoke, then Contact the Mark. Listen to the talk-on: direction and distance from the smoke.', keys: '\\, F1', check: s => after(s.jtac, 'talk-on', 'cleared', 'aborted', 'off', 'complete') },
      { id: 'lock', text: 'Shkval on, slew from the smoke along the talk-on, lock a tank: АС. The smoke is a reference, not the target.', keys: '7, O, Enter', check: s => s.lockedTarget },
      { id: 'in', text: 'On the attack heading, call In and wait for cleared hot.', keys: '\\, F1', check: s => after(s.jtac, 'cleared', 'off', 'complete') },
    ],
  },
  geometry: {
    id: 'geometry', title: 'Attack heading and clearance', short: 'Cleared hot', scored: true,
    goal: 'Run in from the IP inside the briefed attack headings, call In, release only after cleared hot, then call Off.',
    steps: [
      { id: 'ip', text: 'Radio menu: IP Inbound.', keys: '\\, F1', check: s => !after(s.jtac, 'await-ip', 'idle') },
      { id: 'contact', text: 'Contact the Mark when the smoke is down, then find the target.', keys: '\\, F1', check: s => after(s.jtac, 'talk-on', 'cleared', 'aborted', 'off', 'complete') },
      { id: 'heading', text: 'Turn onto the final attack heading window from the remarks.', keys: 'Left / Right', check: s => s.onAttackHeading },
      { id: 'in', text: 'Call In. Cleared hot is the only clearance: IP inbound and In are not.', keys: '\\, F1', check: s => after(s.jtac, 'cleared', 'off', 'complete') },
      { id: 'release', text: 'Release on the target.', keys: 'Space', check: s => s.clearedReleases > 0 },
      { id: 'off', text: 'Call Off after the attack. The JTAC gives BDA and clears a re-attack or departure.', keys: '\\, F1', check: s => s.attacks > 0 },
    ],
  },
  'danger-close': {
    id: 'danger-close', title: 'Friendlies close', short: 'Danger close', scored: true,
    goal: 'Friendlies are inside 500 m of the target. Keep to the attack heading, use the guided Vikhr and hit only the target.',
    steps: [
      { id: 'ip', text: 'Radio menu: IP Inbound. Note the friendly line on the smoke side.', keys: '\\, F1', check: s => !after(s.jtac, 'await-ip', 'idle') },
      { id: 'lock', text: 'Lock a briefed tank, not a friendly: check the talk-on before you lock.', keys: 'O, Enter', check: s => s.lockedTarget },
      { id: 'in', text: 'Call In on the attack heading and wait for cleared hot.', keys: '\\, F1', check: s => after(s.jtac, 'cleared', 'off', 'complete') },
      { id: 'kill', text: 'Vikhr on the target, lock and laser to impact.', keys: 'Space', check: s => s.targetsKilled > 0 },
    ],
  },
  sortie: {
    id: 'sortie', title: 'CAS sortie', short: 'Sortie', scored: true,
    goal: 'Check in at the holding point, copy the 9-line, attack under JTAC control, avoid the threats and egress.',
    steps: [
      { id: 'checkin', text: 'Check in and copy the 9-line.', keys: '\\, F4, F1', check: s => after(s.jtac, 'await-ip', 'inbound', 'lasing', 'mark-down', 'talk-on', 'cleared', 'aborted', 'off', 'complete') },
      { id: 'ip', text: 'Fly to the IP and call IP Inbound.', keys: '\\, F1', check: s => !after(s.jtac, 'idle', 'checked-in', 'nine-line', 'remarks-ready', 'remarks', 'readback', 'data', 'await-ip') },
      { id: 'attack', text: 'Contact the mark, lock, In, cleared hot, attack, Off.', keys: '\\, Space', check: s => s.attacks > 0 },
      { id: 'kill', text: 'Destroy the target group, re-attacking as cleared.', check: s => s.targetsKilled >= s.targets },
    ],
  },
  'jtac-laser': {
    id: 'jtac-laser', title: 'JTAC laser hand-off', short: 'JTAC laser', scored: true,
    goal: 'The JTAC lases the target on code 1688 after Laser On. Find the spot with the LSS, call Spot, make it the SPI, get cleared hot and put an AGM-65L or a GBU-12 on it.',
    steps: [
      { id: 'ip', text: 'Radio menu: IP Inbound. The JTAC answers continue.', keys: '\\, F1', check: s => !after(s.jtac, 'await-ip', 'idle') },
      { id: 'laser-on', text: 'Radio menu: Laser On. The JTAC lases the target on its code: "Lasing, code 1688".', keys: '\\, F1', check: s => s.jtacLasing || after(s.jtac, 'lasing', 'talk-on', 'cleared', 'aborted', 'off', 'complete') },
      { id: 'slave', text: 'TGP as SOI (Coolie Right Long). China Hat Forward Long slaves the pod to the SPI: the datalinked target.', keys: 'K (hold), V (hold)', check: s => s.milestones.has('slave') },
      { id: 'lss', text: 'LSS on OSB 6, code 1688: LSRCH, then DETECT (OSB 6 reads LST), then LTRACK with a box on the spot.', keys: 'OSB 6', check: s => s.milestones.has('lss-track') },
      { id: 'spot', text: 'Radio menu: Spot. Shift moves the laser to the next vehicle; Terminate stops it.', keys: '\\, F1', check: s => after(s.jtac, 'talk-on', 'cleared', 'aborted', 'off', 'complete') },
      { id: 'spi', text: 'Make the spot your SPI: TMS Forward Long (hold 1 s) with the TGP as SOI.', keys: 'LCtrl+Up (hold)', check: s => s.milestones.has('spi-tgp') },
      { id: 'in', text: 'On the attack heading, call In and wait for cleared hot.', keys: '\\, F1', check: s => after(s.jtac, 'cleared', 'off', 'complete') },
      { id: 'release', text: 'AGM-65L or GBU-12 on the JTAC\'s spot. Weapon profile with DMS Left or Right, then release.', keys: 'Delete / PageDown, RAlt+Space', check: s => s.clearedReleases > 0 },
      { id: 'off', text: 'Call Off after the attack. The JTAC gives BDA.', keys: '\\, F1', check: s => s.attacks > 0 },
    ],
  },
  digital: {
    id: 'digital', title: 'Digital 9-line', short: 'Datalink', scored: true,
    goal: 'Take the 9-line by datalink: WILCO, hook the triangle, make it the SPI, slave the pod, point track a tank, and drop a GBU-12 or fire APKWS on your own laser. Coordinates only: no mark.',
    steps: [
      { id: 'readback', text: 'Radio menu: 9-line readback. The JTAC answers "Standby for data".', keys: '\\, F1', check: s => !after(s.jtac, 'readback', 'idle') },
      { id: 'wilco', text: 'NEW TASKING on the MFCDs, ATTACK and the red triangle on the TAD, the 9-line on the MSG page. Accept it: WILCO, OSB 19.', keys: 'OSB 19', check: s => s.tasking === 'wilco' },
      { id: 'hook', text: 'TAD as SOI (Coolie Left Long). Slew the cursor onto the triangle and hook it: TMS Forward Short.', keys: 'H (hold), ; . , /, LCtrl+Up', check: s => s.milestones.has('hook-tasking') },
      { id: 'spi', text: 'TMS Forward Long (hold 1 s): the triangle is the SPI, the wedding cake moves onto it.', keys: 'LCtrl+Up (hold)', check: s => s.milestones.has('spi-tasking') },
      { id: 'slave', text: 'TGP as SOI (Coolie Right Long). China Hat Forward Long: the pod looks at the SPI.', keys: 'K (hold), V (hold)', check: s => s.milestones.has('slave') },
      { id: 'track', text: 'Slew onto a tank and point track it: TMS Forward Short. POINT shows next to the crosshair.', keys: '; . , /, LCtrl+Up', check: s => s.milestones.has('point-target') },
      { id: 'spi-tgp', text: 'TMS Forward Long again: the tank is the SPI.', keys: 'LCtrl+Up (hold)', check: s => s.milestones.has('spi-tgp') },
      { id: 'release', text: 'Cleared to engage. HUD as SOI (Coolie Up Short), CCRP with M, GBU-12 or APKWS, release on the attack heading.', keys: 'U, M, RAlt+Space', check: s => s.clearedReleases > 0 },
      { id: 'lase', text: 'Lase until impact: Insert, held. L flashes on the HUD and the TGP page. APKWS needs the laser before you fire.', keys: 'Insert (hold)', check: s => s.milestones.has('laser-release') || s.targetsKilled > 0 },
      { id: 'complete', text: 'Radio menu: Attack Complete. The JTAC gives BDA.', keys: '\\, F1', check: s => s.attacks > 0 },
    ],
  },
};

/** A-10C II versions of the smoke lessons: the targeting pod replaces the Shkval. */
const A10C_OVERRIDES: Partial<Record<CasLessonId, Partial<LessonDef>>> = {
  'talk-on': {
    goal: 'Call IP inbound, find the white smoke, follow the talk-on from the mark and point track the target with the pod.',
    steps: [
      LESSONS['talk-on'].steps[0]!, LESSONS['talk-on'].steps[1]!, LESSONS['talk-on'].steps[2]!,
      { id: 'lock', text: 'TGP as SOI (Coolie Right Long), China Hat Forward Long to the SPI, slew from the smoke along the talk-on, TMS Forward Short: POINT on a tank. The smoke is a reference, not the target.', keys: 'K (hold), V (hold), ; . , /, LCtrl+Up', check: s => s.lockedTarget },
      LESSONS['talk-on'].steps[4]!,
    ],
  },
  geometry: {
    steps: [
      LESSONS.geometry.steps[0]!,
      { id: 'contact', text: 'Contact the Mark when the smoke is down, then point track a tank with the pod and make it the SPI.', keys: '\\, F1, LCtrl+Up', check: s => after(s.jtac, 'talk-on', 'cleared', 'aborted', 'off', 'complete') },
      LESSONS.geometry.steps[2]!, LESSONS.geometry.steps[3]!,
      { id: 'release', text: 'Release on the target: GBU-12 on the SPI, or APKWS, and lase to impact.', keys: 'RAlt+Space, Insert (hold)', check: s => s.clearedReleases > 0 },
      LESSONS.geometry.steps[5]!,
    ],
  },
  'danger-close': {
    goal: 'Friendlies are inside 500 m of the target. Keep to the attack heading, use a laser-guided weapon on your own laser and hit only the target.',
    steps: [
      LESSONS['danger-close'].steps[0]!,
      { id: 'lock', text: 'Point track a briefed tank with the pod, not a friendly: check the talk-on before you track.', keys: 'LCtrl+Up', check: s => s.lockedTarget },
      LESSONS['danger-close'].steps[2]!,
      { id: 'kill', text: 'GBU-12 or APKWS on the tank, lasing to impact.', keys: 'RAlt+Space, Insert (hold)', check: s => s.targetsKilled > 0 },
    ],
  },
  sortie: {
    goal: 'Check in at the holding point, take the 9-line and the datalink, work the JTAC laser, avoid the threats and egress.',
    steps: [
      { id: 'checkin', text: 'Check in, copy the 9-line, read back and WILCO the digital 9-line.', keys: '\\, F4, F1, OSB 19', check: s => after(s.jtac, 'await-ip', 'inbound', 'lasing', 'mark-down', 'talk-on', 'cleared', 'aborted', 'off', 'complete') },
      LESSONS.sortie.steps[1]!,
      { id: 'spot', text: 'Laser On, find the spot with the LSS, call Spot.', keys: '\\, F1, OSB 6', check: s => after(s.jtac, 'talk-on', 'cleared', 'aborted', 'off', 'complete') },
      { id: 'attack', text: 'Spot as SPI, In, cleared hot, release, Off.', keys: '\\, LCtrl+Up, RAlt+Space', check: s => s.attacks > 0 },
      LESSONS.sortie.steps[3]!,
    ],
  },
};

const A10C_LESSONS: Record<CasLessonId, LessonDef> = Object.fromEntries(
  (Object.keys(LESSONS) as CasLessonId[]).map(id => [id, { ...LESSONS[id], ...A10C_OVERRIDES[id] }]),
) as Record<CasLessonId, LessonDef>;

/** Lesson definitions for a jet. */
export const lessonsFor = (jet: CasJet): Record<CasLessonId, LessonDef> => (jet === 'a10c' ? A10C_LESSONS : LESSONS);

export interface CasSummary {
  lesson: CasLessonId;
  targets: number;
  targetsKilled: number;
  impacts: Partial<Record<ImpactClass, number>>;
  releases: number;
  violations: Violation[];
  aborts: number;
  shotDown: boolean;
  /** 9-line lesson: fields right out of 9, and whether the key lines passed. */
  card?: { correct: number; passed: boolean };
}

const VIOLATION_TEXT: Record<Violation, string> = {
  'no-clearance': 'Released without cleared hot. IP inbound, In and the talk-on are not clearances.',
  'after-abort': 'Released after an abort. An abort cancels the clearance: go back to the IP.',
  'outside-heading': 'Released outside the briefed attack headings. They keep your weapons off the friendlies.',
};

export function scoreCas(s: CasSummary): Debrief {
  const n = (c: ImpactClass) => s.impacts[c] ?? 0;
  const lines: string[] = [];
  const coaching: string[] = [];
  if (s.lesson === 'nine-line' && s.card) {
    const stars: Debrief['stars'] = s.card.correct === 9 ? 3 : s.card.passed ? 2 : s.card.correct >= 5 ? 1 : 0;
    lines.push(`Kneeboard lines right ${s.card.correct} of 9`, s.card.passed ? 'Key lines right: IP, elevation, grid, mark, friendlies' : 'A key line is wrong or missing');
    if (!s.card.passed) coaching.push('Copy lines 1, 4, 6, 7 and 8 first: where to start, how high the target sits, where it is, the mark and the friendlies.');
    return { stars, title: ['Not copied', 'Partial', 'Good copy', 'Perfect copy'][stars]!, lines, coaching, passed: stars >= 2 };
  }
  const frat = n('fratricide') > 0;
  lines.push(`Targets destroyed ${s.targetsKilled} of ${s.targets}`, `Releases ${s.releases}, clearance violations ${s.violations.length}`);
  if (n('danger-close')) lines.push(`Impacts near friendlies ${n('danger-close')}`);
  if (n('wrong-target')) lines.push(`Wrong-target kills ${n('wrong-target')}`);
  if (frat) lines.push('Friendly destroyed');
  for (const v of new Set(s.violations)) coaching.push(VIOLATION_TEXT[v]);
  if (frat) coaching.push('Fratricide ends the mission. Lock only what the talk-on describes, and never run in over the friendly line.');
  if (n('wrong-target')) coaching.push('Wrong target: confirm the target from the mark before you lock. Use What is my target? when unsure.');
  if (s.shotDown) coaching.push('Shot down. Stay outside the threat rings on the way to the IP.');
  const killRatio = s.targets ? s.targetsKilled / s.targets : 0;
  let stars: Debrief['stars'] = frat || s.shotDown ? 0 : killRatio >= 1 ? 3 : killRatio > 0 ? 2 : 1;
  if (s.violations.length && stars > 1) stars = 1;
  if (stars === 3 && n('danger-close')) stars = 2;
  return { stars, title: ['Mission failed', 'Clearance problem', 'Good attack', 'Clean CAS'][stars]!, lines, coaching, passed: stars >= 2 };
}

/** Progress key (AGENTS.md: '<route>:<lesson>:<aircraft>'). */
export const progressKey = (lesson: CasLessonId, jet = 'su25t'): string => `cas:${lesson}:${jet}`;
