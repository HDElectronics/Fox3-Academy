/**
 * [OWNER: page-merge] Lesson definitions, run metrics, scoring and the debrief for Merge & guns. Pure (no DOM, no
 * World): the runner fills MergeMetrics, these functions grade it. Score rules follow the issue #11 plan: time near
 * corner, time in the requested pursuit, hits / time in solution / rounds, hits taken.
 */
import type { BanditMode } from './bandit';
import type { Pursuit } from './bfm';

export type LessonId = 'corner' | 'pursuit' | 'tracking' | 'defence' | 'fight';
export const LESSON_ORDER: LessonId[] = ['corner', 'pursuit', 'tracking', 'defence', 'fight'];
/** Lessons that count toward the page's done flag (the free fight does not). */
export const SCORED_LESSONS: LessonId[] = ['corner', 'pursuit', 'tracking', 'defence'];

export interface LessonDef {
  id: LessonId;
  /** Lesson number, null for the free drill. */
  n: number | null;
  title: string;
  /** Default bandit and the modes the pilot may pick. */
  bandit: BanditMode;
  banditModes: BanditMode[];
  /** Run length (s). */
  durationS: number;
  /** Start geometry. */
  start: 'solo' | 'behind' | 'close-behind' | 'defend' | 'merge';
}

export const LESSONS: Record<LessonId, LessonDef> = {
  corner: { id: 'corner', n: 1, title: 'Corner speed', bandit: 'turn', banditModes: ['turn', 'straight'], durationS: 45, start: 'solo' },
  pursuit: { id: 'pursuit', n: 2, title: 'Pursuit', bandit: 'turn', banditModes: ['turn', 'reverse'], durationS: 80, start: 'behind' },
  tracking: { id: 'tracking', n: 3, title: 'Guns tracking', bandit: 'turn', banditModes: ['straight', 'turn', 'reverse'], durationS: 45, start: 'close-behind' },
  defence: { id: 'defence', n: 4, title: 'Guns defence', bandit: 'guns', banditModes: ['guns'], durationS: 30, start: 'defend' },
  fight: { id: 'fight', n: null, title: 'Free fight', bandit: 'reverse', banditModes: ['straight', 'turn', 'reverse'], durationS: 120, start: 'merge' },
};

export const PURSUIT_ORDER: Pursuit[] = ['lead', 'pure', 'lag'];
/** Seconds to hold each requested pursuit, and the most a phase may take. */
export const PURSUIT_HOLD_S = 10;
export const PURSUIT_PHASE_MAX_S = 25;

export interface MergeMetrics {
  t: number;
  /** Seconds within the corner band while turning ≥ 3 g, and seconds turning ≥ 3 g. */
  cornerS: number;
  turningS: number;
  /** Seconds in each pursuit (all lessons). */
  pursuitS: Record<Pursuit, number>;
  /** Pursuit drill: current phase index, seconds held in each requested phase, seconds in the current phase. */
  phase: number;
  held: number[];
  phaseT: number;
  /** Seconds with your gun line on the lead point inside range. */
  solutionS: number;
  roundsFired: number;
  roundsInSolution: number;
  hits: number;
  damageDealt: number;
  hitsTaken: number;
  damageTaken: number;
  /** Seconds the bandit had you in his solution. */
  hisSolutionS: number;
  maxG: number;
  minKts: number;
  killed: 'bandit' | 'me' | null;
}

export function emptyMetrics(): MergeMetrics {
  return {
    t: 0, cornerS: 0, turningS: 0, pursuitS: { lead: 0, pure: 0, lag: 0 }, phase: 0, held: [0, 0, 0], phaseT: 0,
    solutionS: 0, roundsFired: 0, roundsInSolution: 0, hits: 0, damageDealt: 0, hitsTaken: 0, damageTaken: 0,
    hisSolutionS: 0, maxG: 1, minKts: Infinity, killed: null,
  };
}

/** Pursuit drill bookkeeping for one step: returns true when every phase is over. */
export function stepPursuitPhase(m: MergeMetrics, kind: Pursuit, dt: number): boolean {
  if (m.phase >= PURSUIT_ORDER.length) return true;
  m.phaseT += dt;
  if (kind === PURSUIT_ORDER[m.phase]) m.held[m.phase]! += dt;
  if (m.held[m.phase]! >= PURSUIT_HOLD_S || m.phaseT >= PURSUIT_PHASE_MAX_S) { m.phase++; m.phaseT = 0; }
  return m.phase >= PURSUIT_ORDER.length;
}

const pct = (x: number) => Math.max(0, Math.min(1, x));

/** Score 0..100 per lesson. */
export function scoreLesson(id: LessonId, m: MergeMetrics): number {
  switch (id) {
    case 'corner':
      return Math.round(100 * pct(m.cornerS / 25));
    case 'pursuit':
      return Math.round(100 * m.held.reduce((a, h) => a + pct(h / PURSUIT_HOLD_S), 0) / PURSUIT_ORDER.length);
    case 'tracking': {
      const economy = m.roundsFired > 0 ? m.roundsInSolution / m.roundsFired : 0;
      return Math.round(30 * pct(m.solutionS / 2) + 50 * pct(m.damageDealt) + 20 * economy);
    }
    case 'defence':
      return Math.round(70 * (1 - pct(m.damageTaken)) + 30 * (1 - pct(m.hisSolutionS / 6)));
    case 'fight':
      if (m.killed === 'bandit') return 100;
      return Math.round(60 * pct(m.damageDealt) + 40 * (1 - pct(m.damageTaken)));
  }
}

export interface Debrief {
  lesson: LessonId;
  score: number;
  title: string;
  tone: 'ok' | 'caution' | 'warning';
  stats: [string, string][];
  coaching: string[];
}

export interface DebriefContext {
  /** Corner speed as the pilot reads it, e.g. "420 kt" or "780 km/h". */
  corner: string;
  /** Minimum speed flown, formatted. */
  minSpeed: string;
}

const s1 = (x: number) => `${x.toFixed(1)} s`;

/** Debrief text for a finished run. */
export function debrief(id: LessonId, m: MergeMetrics, c: DebriefContext): Debrief {
  const score = scoreLesson(id, m);
  const tone = score >= 70 ? 'ok' : score >= 40 ? 'caution' : 'warning';
  const stats: [string, string][] = [];
  const coaching: string[] = [];
  const shots = (): void => {
    stats.push(['Time in solution', s1(m.solutionS)], ['Rounds fired', String(m.roundsFired)],
      ['Rounds fired in solution', String(m.roundsInSolution)], ['Hits', String(m.hits)]);
  };
  switch (id) {
    case 'corner':
      stats.push(['Corner speed', c.corner], ['Time at corner (3 g or more)', s1(m.cornerS)], ['Time turning', s1(m.turningS)],
        ['Peak g', m.maxG.toFixed(1)], ['Slowest', c.minSpeed]);
      if (m.turningS < 10) coaching.push('Pull harder: the drill counts only turns of 3 g or more.');
      if (m.cornerS < m.turningS * 0.5) coaching.push(`Hold ${c.corner}: faster, ease the pull or come off the burner; slower, unload and let the jet accelerate.`);
      coaching.push('Corner speed gives the best instantaneous turn rate. Above it you are g-limited, below it lift-limited.');
      break;
    case 'pursuit': {
      PURSUIT_ORDER.forEach((k, i) => stats.push([`${k[0]!.toUpperCase()}${k.slice(1)} pursuit held`, `${s1(Math.min(PURSUIT_HOLD_S, m.held[i]!))} of ${PURSUIT_HOLD_S} s`]));
      const worst = PURSUIT_ORDER[m.held.indexOf(Math.min(...m.held))]!;
      if (worst === 'lead') coaching.push('Lead: pull your nose ahead of his, into his turn. Range closes fastest here.');
      if (worst === 'pure') coaching.push('Pure: put your velocity vector on him and keep it there. It needs a tighter turn than his.');
      if (worst === 'lag') coaching.push('Lag: ease the pull and let your nose drift behind his tail. You keep energy and stay out of his plane.');
      coaching.push('Lead closes and sets up a gun shot, lag holds range and saves energy, pure sits between them.');
      break;
    }
    case 'tracking':
      shots();
      if (m.solutionS < 2) coaching.push('Get in his plane of motion first, then pull the pipper or funnel onto him.');
      if (m.roundsFired > 0 && m.roundsInSolution / m.roundsFired < 0.5) coaching.push('Fire only when the sight is on him: short bursts, then reassess.');
      if (m.roundsFired === 0) coaching.push('Squeeze the trigger (Space) when his wingspan fills the funnel or the pipper sits on him.');
      coaching.push('Frame his wingspan: the funnel is sized for a wingspan, the pipper needs the range the sight shows.');
      break;
    case 'defence':
      stats.push(['Hits taken', String(m.hitsTaken)], ['Damage taken', `${Math.round(Math.min(1, m.damageTaken) * 100)} %`],
        ['Time in his solution', s1(m.hisSolutionS)]);
      if (m.hisSolutionS > 3) coaching.push('Get out of his plane: roll your lift vector off his plane and pull, or unload and change planes.');
      coaching.push('A predictable turn is a gun solution for him. Change planes when you see his nose come to lead.');
      break;
    case 'fight':
      shots();
      stats.push(['Hits taken', String(m.hitsTaken)], ['Result', m.killed === 'bandit' ? 'Bandit destroyed' : m.killed === 'me' ? 'You were shot down' : 'Time up']);
      coaching.push('Use what you drilled: corner speed in the turn, lead to close, lag to hold, guns in his plane.');
      break;
  }
  const title = id === 'fight' ? (m.killed === 'bandit' ? 'Splash' : m.killed === 'me' ? 'Shot down' : 'Knock it off') : `${LESSONS[id].title}: ${score}`;
  return { lesson: id, score, title, tone, stats, coaching };
}
