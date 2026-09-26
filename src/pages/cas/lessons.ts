/**
 * [OWNER: page-cas] Lesson definitions and scoring for the CAS & JTAC page (pure, unit-tested). The JTAC flow
 * follows the ED A-10C II manual ("F4 JTAC"); clearance, abort and friendly-safety rules are trainer rules.
 * Game level only (AGENTS.md rule 1).
 */
import type { Debrief } from '../strike/lessons';
import type { CasLessonId } from './scenario';
import type { JtacState, Violation } from './jtac';
import type { ImpactClass } from './safety';

export type { CasLessonId, Debrief };
export const CAS_LESSON_ORDER: CasLessonId[] = ['nine-line', 'talk-on', 'geometry', 'danger-close', 'sortie'];

/** Trainer rules the page states in its caveats (on top of the data caveats). */
export const CAS_PAGE_CAVEATS = [
  'When the AI JTAC clears you hot, says continue or aborts is not documented by ED. Here: cleared hot needs the attack heading inside the briefed window and the Shkval on a briefed target; a wrong target or heading aborts.',
  'Friendly safety: an impact within 500 m of a friendly counts as danger close; any friendly destroyed fails the lesson. Trainer rules.',
  'The jet flies itself: you steer with trainer keys. The talk-on wording, the smoke offset from the target and the JTAC pace are simplified.',
];

/** What the steps look at, sampled by the page. */
export interface CasSnap {
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
      { id: 'copy', text: 'When the JTAC asks, select Ready to copy and write each line on the card.', keys: 'F1', check: s => after(s.jtac, 'nine-line', 'remarks-ready', 'remarks', 'readback', 'await-ip', 'inbound', 'mark-down', 'talk-on', 'cleared', 'aborted', 'off', 'complete') },
      { id: 'remarks', text: 'Ready to copy remarks: weapon, threats, final attack heading.', keys: 'F1', check: s => after(s.jtac, 'remarks', 'readback', 'await-ip', 'inbound', 'mark-down', 'talk-on', 'cleared', 'aborted', 'off', 'complete') },
      { id: 'card', text: 'Card complete: IP, elevation, grid, mark and friendlies must be right.', check: s => s.cardPassed },
      { id: 'readback', text: 'Read back the grid, elevation and attack heading.', keys: 'F1', check: s => after(s.jtac, 'await-ip', 'inbound', 'mark-down', 'talk-on', 'cleared', 'aborted', 'off', 'complete') },
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
      { id: 'checkin', text: 'Check in and copy the 9-line.', keys: '\\, F4, F1', check: s => after(s.jtac, 'await-ip', 'inbound', 'mark-down', 'talk-on', 'cleared', 'aborted', 'off', 'complete') },
      { id: 'ip', text: 'Fly to the IP and call IP Inbound.', keys: '\\, F1', check: s => !after(s.jtac, 'idle', 'checked-in', 'nine-line', 'remarks-ready', 'remarks', 'readback', 'await-ip') },
      { id: 'attack', text: 'Contact the mark, lock, In, cleared hot, attack, Off.', keys: '\\, Space', check: s => s.attacks > 0 },
      { id: 'kill', text: 'Destroy the target group, re-attacking as cleared.', check: s => s.targetsKilled >= s.targets },
    ],
  },
};

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
