/**
 * [OWNER: page-merge] Lesson definitions, run metrics, scoring and the debrief for Merge & guns. Pure (no DOM, no
 * World): the runner fills MergeMetrics, these functions grade it. Score rules follow the issue #11 plan: time near
 * corner, time in the requested pursuit, angles gained by the second pass, angle off and range after a circle
 * fight, no overshoot on a yo-yo, hits / time in solution / rounds, hits taken. Trainer scoring, simplified.
 */
import type { Circle } from '../../sim/bfmAi';
import type { BanditMode } from './bandit';
import type { Pursuit } from './bfm';

export type LessonId = 'corner' | 'pursuit' | 'merge' | 'circles' | 'yoyo' | 'tracking' | 'defence' | 'ir' | 'fight';
export const LESSON_ORDER: LessonId[] = ['corner', 'pursuit', 'merge', 'circles', 'yoyo', 'tracking', 'defence', 'ir', 'fight'];
/** Lessons that count toward the page's done flag (the free fight does not). */
export const SCORED_LESSONS: LessonId[] = ['corner', 'pursuit', 'merge', 'circles', 'yoyo', 'tracking', 'defence', 'ir'];
/** Lessons where the IR missile can be selected. */
export const IR_LESSONS: LessonId[] = ['ir', 'fight'];

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
  start: 'solo' | 'behind' | 'close-behind' | 'defend' | 'merge' | 'overshoot' | 'ir';
}

export const LESSONS: Record<LessonId, LessonDef> = {
  corner: { id: 'corner', n: 1, title: 'Corner speed', bandit: 'turn', banditModes: ['turn', 'straight'], durationS: 45, start: 'solo' },
  pursuit: { id: 'pursuit', n: 2, title: 'Pursuit', bandit: 'turn', banditModes: ['turn', 'reverse'], durationS: 80, start: 'behind' },
  merge: { id: 'merge', n: 3, title: 'The merge', bandit: 'two-circle', banditModes: ['two-circle', 'one-circle'], durationS: 60, start: 'merge' },
  circles: { id: 'circles', n: 4, title: 'One vs two circle', bandit: 'two-circle', banditModes: ['two-circle', 'one-circle'], durationS: 60, start: 'merge' },
  yoyo: { id: 'yoyo', n: 5, title: 'High yo-yo', bandit: 'hard', banditModes: ['hard'], durationS: 25, start: 'overshoot' },
  tracking: { id: 'tracking', n: 6, title: 'Guns tracking', bandit: 'turn', banditModes: ['straight', 'turn', 'reverse'], durationS: 45, start: 'close-behind' },
  defence: { id: 'defence', n: 7, title: 'Guns defence', bandit: 'guns', banditModes: ['guns'], durationS: 30, start: 'defend' },
  ir: { id: 'ir', n: 8, title: 'Close-range lock and IR shot', bandit: 'turn', banditModes: ['straight', 'turn', 'reverse'], durationS: 60, start: 'ir' },
  fight: { id: 'fight', n: null, title: 'Free fight', bandit: 'regular', banditModes: ['rookie', 'regular', 'veteran'], durationS: 120, start: 'merge' },
};

/** One vs two circle: the fight is scored this long after the first pass (s). */
export const CIRCLE_EVAL_S = 30;
/** High yo-yo: range band that counts as held behind him (m). */
export const HOLD_MIN_M = 300;
export const HOLD_MAX_M = 1500;
/** High yo-yo: climb above the bandit's plane and recover behind him for this long (trainer thresholds). */
export const YOYO_CLIMB_M = 150;
export const YOYO_RECOVERY_S = 1;

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
  /** First pass: time, closest range (m), how far you had turned before it (deg), nose high or low after it. */
  passT: number | null;
  passRange: number;
  leadTurnDeg: number;
  vertical: 'high' | 'low' | 'level' | null;
  /** Circle you flew after the first pass (toward him = two, away = one) and the trainer's advice for the matchup. */
  circleFlown: Circle | null;
  circleAdvised: Circle | null;
  /** Second pass time and the angles gained there (his nose angle minus yours, deg); end state if no second pass. */
  secondPassT: number | null;
  anglesDeg: number;
  /** Angle from your nose to him and from his tail to you (deg), and range (m), at the scoring moment. */
  myAtaDeg: number;
  aotDeg: number;
  rangeM: number;
  /** High yo-yo: overshoots, seconds in the range band behind him, most height above his plane (m). */
  overshoots: number;
  heldS: number;
  climbM: number;
  /** Climbed above YOYO_CLIMB_M after pulling with the lift vector raised out of his plane. */
  outOfPlane: boolean;
  /** Seconds descending back onto him, nose within 60°, behind him in range after the climb. */
  recoveredS: number;
  /** Fighting AI moves seen (free fight). */
  aiMoves: Record<string, number>;
  /** IR shot: close-combat mode used, seconds to the first lock (or seeker track), shots, shots in the zone. */
  acmMode: string | null;
  lockS: number | null;
  irShots: number;
  irInZone: number;
  /** First shot: off-boresight (deg) and range (m) at launch. */
  irOffDeg: number | null;
  irRangeM: number | null;
  /** Missile results: hits, decoyed by flares, other misses. */
  irHits: number;
  irFlared: number;
  irMissed: number;
}

export function emptyMetrics(): MergeMetrics {
  return {
    t: 0, cornerS: 0, turningS: 0, pursuitS: { lead: 0, pure: 0, lag: 0 }, phase: 0, held: [0, 0, 0], phaseT: 0,
    solutionS: 0, roundsFired: 0, roundsInSolution: 0, hits: 0, damageDealt: 0, hitsTaken: 0, damageTaken: 0,
    hisSolutionS: 0, maxG: 1, minKts: Infinity, killed: null,
    passT: null, passRange: Infinity, leadTurnDeg: 0, vertical: null, circleFlown: null, circleAdvised: null,
    secondPassT: null, anglesDeg: 0, myAtaDeg: 180, aotDeg: 180, rangeM: Infinity, overshoots: 0, heldS: 0, climbM: 0,
    outOfPlane: false, recoveredS: 0, aiMoves: {},
    acmMode: null, lockS: null, irShots: 0, irInZone: 0, irOffDeg: null, irRangeM: null, irHits: 0, irFlared: 0, irMissed: 0,
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

/** Range score for the circle fight: 1 inside 1500 m, 0 at 4000 m and beyond, half inside 200 m (trainer choice). */
export function rangeScore(r: number): number {
  if (!Number.isFinite(r)) return 0;
  if (r < 200) return 0.5;
  return pct((4000 - r) / 2500);
}

/** Score 0..100 per lesson. */
export function scoreLesson(id: LessonId, m: MergeMetrics): number {
  switch (id) {
    case 'corner':
      return Math.round(100 * pct(m.cornerS / 25));
    case 'pursuit':
      return Math.round(100 * m.held.reduce((a, h) => a + pct(h / PURSUIT_HOLD_S), 0) / PURSUIT_ORDER.length);
    case 'merge':
      if (m.passT === null) return 0;
      return Math.round(60 * pct((m.anglesDeg + 30) / 120) + 20 * pct((1500 - m.passRange) / 1000) + 20 * pct(m.leadTurnDeg / 30));
    case 'circles':
      if (m.passT === null) return 0;
      return Math.round(45 * pct(1 - m.aotDeg / 180) + 25 * pct(1 - m.myAtaDeg / 180) + 20 * rangeScore(m.rangeM)
        + (m.circleFlown !== null && m.circleFlown === m.circleAdvised ? 10 : 0));
    case 'yoyo': {
      const score = Math.round((m.overshoots === 0 ? 50 : 0) + 35 * pct(m.heldS / 15) + 15 * pct(m.climbM / 300));
      return m.climbM > YOYO_CLIMB_M && m.outOfPlane && m.recoveredS >= YOYO_RECOVERY_S ? score : Math.min(49, score);
    }
    case 'tracking': {
      const economy = m.roundsFired > 0 ? m.roundsInSolution / m.roundsFired : 0;
      return Math.round(30 * pct(m.solutionS / 2) + 50 * pct(m.damageDealt) + 20 * economy);
    }
    case 'defence':
      return Math.round(70 * (1 - pct(m.damageTaken)) + 30 * (1 - pct(m.hisSolutionS / 6)));
    case 'ir': {
      const lock = m.lockS === null ? 0 : 30 * pct((25 - m.lockS) / 20);
      const zone = m.irShots > 0 ? 40 * m.irInZone / m.irShots : 0;
      const result = m.irHits > 0 ? 30 : m.irFlared > 0 ? 10 : 0;
      const score = Math.round(lock + zone + result);
      return m.lockS !== null && m.irShots > 0 && m.irInZone > 0 ? score : Math.min(49, score);
    }
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
  /** Range and height formatter (m in, pilot units out); defaults to metres. */
  dist?: (m: number) => string;
  /** Your jet and the bandit's, short names. */
  me?: string;
  bandit?: string;
  /** Fighting AI skill label (free fight). */
  skill?: string;
  /** IR lesson: the jet's IR missile name, its uncage and fire keys, and whether it is an FC3 jet (ПР). */
  irMissile?: string;
  uncageKey?: string | null;
  fc3?: boolean;
}

const s1 = (x: number) => `${x.toFixed(1)} s`;
const deg = (x: number) => `${Math.round(x)}°`;
const CIRCLE_NAME: Record<Circle, string> = { one: 'One-circle', two: 'Two-circle' };
/** Fighting AI modes worth naming in the debrief. */
const AI_MOVES: [string, string][] = [['lead-turn', 'lead turn'], ['turn-away', 'one-circle turn'], ['yoyo', 'high yo-yo'], ['jink', 'jink'], ['guns', 'guns attack']];

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
    case 'merge': {
      const dist = c.dist ?? ((x: number) => `${Math.round(x)} m`);
      stats.push(['First pass', m.passT === null ? 'No pass' : dist(m.passRange)], ['Turned before the pass', deg(m.leadTurnDeg)],
        ['After the pass', m.vertical === null ? '-' : m.vertical === 'high' ? 'Nose high' : m.vertical === 'low' ? 'Nose low' : 'Level'],
        [m.secondPassT === null ? 'Angles gained at the end' : 'Angles gained at the second pass', deg(m.anglesDeg)]);
      if (m.passT === null) coaching.push('Fly to the merge: point at him and pass close.');
      else {
        if (m.passRange > 1500) coaching.push('Pass closer. A wide pass gives him turning room: pass about 300 to 500 m off his side.');
        if (m.leadTurnDeg < 15) coaching.push('Lead turn: start the turn toward his side just before he passes your wing line. Too early and you give him your nose.');
        if (m.anglesDeg < 0) coaching.push('He gained angles. Turn at corner and stay in the turn: nose low to keep speed, nose high to tighten the circle.');
      }
      coaching.push('Nose high: tighter turn, speed into height. Nose low: gravity adds turn rate and keeps speed. Either gains angles when flown at corner.');
      break;
    }
    case 'circles': {
      const dist = c.dist ?? ((x: number) => `${Math.round(x)} m`);
      stats.push(['You fought', m.circleFlown ? CIRCLE_NAME[m.circleFlown] : '-'],
        ['Trainer advice', m.circleAdvised ? `${CIRCLE_NAME[m.circleAdvised]}${c.me && c.bandit ? ` (${c.me} vs ${c.bandit})` : ''}` : '-'],
        [`Angle off his tail after ${CIRCLE_EVAL_S} s`, m.passT === null ? '-' : deg(m.aotDeg)], ['Your nose to him', m.passT === null ? '-' : deg(m.myAtaDeg)],
        ['Range', Number.isFinite(m.rangeM) ? dist(m.rangeM) : '-']);
      if (m.circleFlown && m.circleAdvised && m.circleFlown !== m.circleAdvised) {
        coaching.push(m.circleAdvised === 'two'
          ? 'Your jet out-rates him: turn toward him after the pass (two-circle) and win on sustained turn rate.'
          : 'Your jet wins on radius, not rate: turn away after the pass (one-circle), slow toward corner and win on the smaller circle.');
      }
      if (m.aotDeg > 90) coaching.push('He is not yet in front of you. Hold corner speed in the turn and do not bleed below it.');
      coaching.push('Two-circle is a rate fight: best sustained turn rate wins. One-circle is a radius fight: the smaller circle wins, and both jets end slow.');
      break;
    }
    case 'yoyo': {
      const dist = c.dist ?? ((x: number) => `${Math.round(x)} m`);
      stats.push(['Overshoots', String(m.overshoots)], ['Time behind him in range', s1(m.heldS)], ['Height gained out of plane', dist(m.climbM)]);
      if (m.overshoots > 0) coaching.push('Too fast inside his turn: before you pass his wing line, roll your lift vector above his plane and pull.');
      if (m.climbM < 150) coaching.push('Go out of plane: raise the nose above his turn, then roll back down onto him when the closure is gone.');
      coaching.push('A high yo-yo trades closure and speed for height, then turns the height back into position behind him.');
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
    case 'ir': {
      const dist = c.dist ?? ((x: number) => `${Math.round(x)} m`);
      const msl = c.irMissile ?? 'IR missile';
      const result = m.irHits > 0 ? 'Hit' : m.irFlared > 0 ? 'Decoyed by flares' : m.irMissed > 0 ? 'Missed' : m.irShots > 0 ? 'In flight' : 'No shot';
      stats.push(['Mode', m.acmMode ?? '-'], ['Time to lock', m.lockS === null ? 'No lock' : s1(m.lockS)],
        ['Shots', String(m.irShots)], ['Shots in the zone', String(m.irInZone)],
        ['Off the nose at launch', m.irOffDeg === null ? '-' : deg(m.irOffDeg)], ['Range at launch', m.irRangeM === null ? '-' : dist(m.irRangeM)],
        ['Result', result]);
      if (m.lockS === null) coaching.push('Pick the mode for the geometry: boresight for a bandit on the nose, the vertical scan for one above the nose in a turn. Roll him into the area and hold him there.');
      else if (m.lockS > 5) coaching.push('Faster lock: put him in the mode area first, then select it. The vertical scan wants him in the strip: roll your lift vector onto him.');
      if (m.irShots === 0) coaching.push(c.fc3 ? 'Fire when ПР shows.' : `Get the growl, uncage${c.uncageKey ? ` (${c.uncageKey})` : ''}, wait for the high tone, then fire.`);
      else if (m.irInZone < m.irShots) coaching.push(c.fc3 ? `Wait for ПР: the ${msl} seeker has not locked, or he is out of range or too far off the nose.` : `Fire on the high tone, inside range and the off-boresight limit. Without the tone the ${msl} guides on whatever heat it sees.`);
      if (m.irFlared > 0) coaching.push('His flares decoyed it. Shoot closer, from nearer his tail, or when he is slow to flare; follow up with a second shot.');
      coaching.push(c.fc3 ? 'IRST and Fi0 shots give him no RWR warning. His only cue is the missile: shoot from his blind side.' : 'The IR missile gives no RWR launch warning, but your radar lock shows on his RWR.');
      break;
    }
    case 'fight': {
      shots();
      if (m.irShots > 0) stats.push(['IR shots', `${m.irShots} (${m.irInZone} in the zone, ${m.irHits} hit${m.irHits === 1 ? '' : 's'})`]);
      stats.push(['Hits taken', String(m.hitsTaken)], ['Result', m.killed === 'bandit' ? 'Bandit destroyed' : m.killed === 'me' ? 'You were shot down' : 'Time up']);
      if (c.skill) stats.push(['Bandit', c.skill]);
      const mv = m.aiMoves;
      const seen = AI_MOVES.filter(([k]) => (mv[k] ?? 0) > 0).map(([k, t]) => `${t}${mv[k]! > 1 ? ` × ${mv[k]}` : ''}`);
      stats.push(['Bandit moves', seen.length ? seen.join(', ') : '-']);
      if ((mv.jink ?? 0) > 0) coaching.push('He jinked when your sight came on: short bursts as he settles, and stay in his plane.');
      if ((mv.yoyo ?? 0) > 0) coaching.push('He flew a high yo-yo when he overshot: watch his lift vector come back down and turn into him.');
      coaching.push('Use what you drilled: corner speed in the turn, lead to close, lag to hold, guns in his plane.');
      break;
    }
  }
  const title = id === 'fight' ? (m.killed === 'bandit' ? 'Splash' : m.killed === 'me' ? 'Shot down' : 'Knock it off') : `${LESSONS[id].title}: ${score}`;
  return { lesson: id, score, title, tone, stats, coaching };
}
