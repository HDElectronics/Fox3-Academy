/**
 * The lesson path: one ordered list of Learn pages (LESSON_LINKS) shared by every jet, filtered per jet by the
 * route table (routes.ts `roles` / `jets`, read through roleGate.ts). The Learn bar, the hangar cards, Progress
 * and the next-lesson handoff all read it, so they always agree on order, labels and step numbers.
 *
 * Fighters: Radar, TWS, Missiles, Defense, RWR (BVR), Merge & guns, Pattern & landing, then the jet's own pages
 * (HARM & SEAD, ATFLIR, JDAM on the F/A-18C). Attack jets: their cockpit page, then CAS & JTAC. The path then
 * hands off to Fly (FLY_LINK): the sortie is the graduation flight, not a numbered step.
 *
 * Completion per step lives in src/pages/progress/model.ts (`pathProgress`), which knows each page's goals.
 * The pure position and next-step logic here takes those completions as input.
 */
import { AIRCRAFT } from '../data/aircraft';
import type { AircraftId, AttackId } from '../data/types';
import { jetAllowed } from './roleGate';
import { routeFor } from './routes';

/** Topic of a step. Shown as a thin divider in the Learn bar; `jet` holds pages only some jets have. */
export type LessonGroupId = 'bvr' | 'close' | 'flying' | 'jet';
export interface LessonLink {
  /** Route path plus the query a Learn visit opens with ('radar?ex=low'). */
  path: string;
  /** Short name in the bar and on cards. */
  label: string;
  /** What the lesson teaches, a few words. */
  title: string;
  group: LessonGroupId;
}

/** Every Learn page in path order. A new lesson page gets one entry here; jets see the ones their role opens. */
export const LESSON_LINKS: readonly LessonLink[] = [
  { path: 'radar?ex=low', label: 'Radar', title: 'Scan volume', group: 'bvr' },
  { path: 'tws', label: 'TWS', title: 'Track while scan', group: 'bvr' },
  { path: 'missiles', label: 'Missiles', title: 'Launch zones', group: 'bvr' },
  { path: 'defense', label: 'Defense', title: 'Beat a missile', group: 'bvr' },
  { path: 'rwr', label: 'RWR', title: 'Read the RWR', group: 'bvr' },
  { path: 'merge', label: 'Merge & guns', title: 'Merge, BFM and guns', group: 'close' },
  { path: 'flight-ops', label: 'Pattern & landing', title: 'Take off, break and land', group: 'flying' },
  { path: 'harm', label: 'HARM & SEAD', title: 'Suppress SAM radars', group: 'jet' },
  { path: 'atflir', label: 'ATFLIR', title: 'Find, designate and track', group: 'jet' },
  { path: 'jdam', label: 'JDAM', title: 'GBU-38 on a TOO target', group: 'jet' },
  { path: 'strike', label: 'Shkval & Vikhr', title: 'Lock, lase and fire', group: 'jet' },
  { path: 'tgp', label: 'Targeting pod & Mavericks', title: 'Pod, laser and Mavericks', group: 'jet' },
  { path: 'cas', label: 'CAS & JTAC', title: 'Work the JTAC', group: 'jet' },
];

/** Route path of a link path ('radar?ex=low' -> 'radar'). */
export const routeOf = (path: string): string => path.replace(/^#?\/?/, '').split('?')[0]!;

/** True when the link's route accepts the jet (no role gate on arrival). */
export const linkOpensFor = (link: { path: string }, jet: AircraftId): boolean => jetAllowed(routeFor(routeOf(link.path)), jet);

/** The jet's lesson path, in order. */
export function lessonSteps(jet: AircraftId): LessonLink[] {
  return LESSON_LINKS.filter(link => linkOpensFor(link, jet));
}

/** The Learn link for a route (with its default query), or the route itself. */
export function lessonPath(route: string): string {
  return LESSON_LINKS.find(link => routeOf(link.path) === route)?.path ?? route;
}

/** Fly for an attack jet: its own scored sortie lesson, since the BVR sortie takes fighters only. */
export const ATTACK_SORTIE: Readonly<Record<AttackId, string>> = { su25t: 'strike?lesson=sortie', a10c: 'cas?lesson=sortie' };

export interface FlyLink { path: string; label: string; title: string }
/** Where the path hands off: the jet's sortie (the Fly destination). */
export function flyLinkFor(jet: AircraftId): FlyLink {
  if (AIRCRAFT[jet].role === 'attack') {
    return { path: ATTACK_SORTIE[jet as AttackId], label: 'Sortie', title: jet === 'su25t' ? 'Strike sortie' : 'CAS sortie' };
  }
  return { path: 'sortie', label: 'Sortie', title: 'Fight and debrief' };
}

// ------------------------------------------------------------------------------------------ position and next

/** A step and whether every goal on it is complete. */
export interface StepState { link: LessonLink; complete: boolean }
export interface NextTarget {
  path: string;
  label: string;
  /** A numbered step, or the hand-off to Fly after the last one. */
  kind: 'step' | 'fly';
  /** Index of the step, null for Fly. */
  index: number | null;
}
export interface PathStatus {
  /** Index of the step on screen; null on a page outside the path (Learn home, Progress, Practice...). */
  current: number | null;
  total: number;
  doneCount: number;
  /** Every step complete. */
  complete: boolean;
  /**
   * On a step: the following step, or Fly after the last. Elsewhere: the first step not complete (the one to
   * continue with), or Fly once the path is complete.
   */
  next: NextTarget;
  /** The current step is complete, so Next is the obvious move. Always false outside the path. */
  ready: boolean;
}

const stepTarget = (steps: readonly StepState[], i: number): NextTarget =>
  ({ path: steps[i]!.link.path, label: steps[i]!.link.label, kind: 'step', index: i });
const flyTarget = (fly: FlyLink): NextTarget => ({ path: fly.path, label: fly.label, kind: 'fly', index: null });

/** Index of the step whose route is `route`, or null. */
export function stepIndexOf(steps: readonly { path: string }[], route: string | null): number | null {
  if (!route) return null;
  const i = steps.findIndex(s => routeOf(s.path) === route);
  return i < 0 ? null : i;
}

/**
 * Where the pilot is on the path and what comes next. Sequential on purpose: Next after step 2 is step 3 even
 * when 3 is already done, so the bar reads the same way every time.
 */
export function pathStatus(steps: readonly StepState[], route: string | null, fly: FlyLink): PathStatus {
  const total = steps.length;
  const doneCount = steps.filter(s => s.complete).length;
  const complete = total > 0 && doneCount === total;
  const current = stepIndexOf(steps.map(s => s.link), route);
  if (current !== null) {
    const next = current + 1 < total ? stepTarget(steps, current + 1) : flyTarget(fly);
    return { current, total, doneCount, complete, next, ready: steps[current]!.complete };
  }
  const first = steps.findIndex(s => !s.complete);
  return { current: null, total, doneCount, complete, next: first < 0 ? flyTarget(fly) : stepTarget(steps, first), ready: false };
}

/** Words for the next action. On a step: 'Next'. Elsewhere: 'Start' before any step is done, 'Continue' after. */
export function nextVerb(status: PathStatus): string {
  if (status.next.kind === 'fly') return status.current === null ? 'Fly' : 'Next';
  if (status.current !== null) return 'Next';
  return status.doneCount === 0 ? 'Start' : 'Continue';
}

/** The next-action text: 'Next: Missiles', 'Continue: Defense', 'Fly a sortie'. */
export function nextText(status: PathStatus): string {
  if (status.next.kind === 'fly') return status.current === null ? 'Fly a sortie' : 'Next: Fly a sortie';
  return `${nextVerb(status)}: ${status.next.label}`;
}
