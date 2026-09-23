/**
 * [OWNER: page-strike] Lesson definitions and scoring for the Shkval & Vikhr page (pure, unit-tested).
 * Keys and cockpit words come from PROCEDURES.su25t and the ED Su-25T Flight Manual (S1). Game level only.
 */
import type { AgMissReason, GroundUnitKind } from '../../sim/types';

export type LessonId = 'shkval' | 'laser' | 'vikhr' | 'ccip';
export const LESSON_ORDER: LessonId[] = ['shkval', 'laser', 'vikhr', 'ccip'];

/** What the steps look at, sampled each frame by the page. */
export interface StrikeSnap {
  master: 'nav' | 'ag' | 'fixed';
  selected: string | null;
  shkvalOn: boolean;
  groundStab: boolean;
  zoom: number;
  targetSizeM: number;
  /** Kind of the locked unit, null in КС. */
  locked: GroundUnitKind | null;
  /** Distance (m) from the sight's aim point to the tank platoon centre, and to the bunker. */
  aimToTanksM: number | null;
  aimToBunkerM: number | null;
  /** A lock attempt on the bunker failed on the size rule. */
  bunkerSizeFail: boolean;
  laserOn: boolean;
  /** Continuous lasing (s). */
  laserRunS: number;
  /** Laser steps done so far need memory: set by the page once lasing reached 5 s. */
  lasedLongEnough: boolean;
  shots: number;
  hits: number;
}

export interface LessonStep { id: string; text: string; keys?: string; check: (s: StrikeSnap) => boolean }

export interface LessonDef {
  id: LessonId;
  title: string;
  short: string;
  goal: string;
  steps: LessonStep[];
  scored: boolean;
}

export const LESSONS: Record<LessonId, LessonDef> = {
  shkval: {
    id: 'shkval', title: 'Shkval basics', short: 'Shkval', scored: false,
    goal: 'Find the tank platoon with the Shkval, learn the target-size rule on the bunker, then lock a tank.',
    steps: [
      { id: 'mode', text: 'Select air-to-ground mode: ОПТ-ЗЕМЛЯ on the HUD.', keys: '7', check: s => s.master === 'ag' },
      { id: 'on', text: 'Switch the Shkval on: the TV picture fills the IT-23M, ЗЕМЛЯ on the HUD.', keys: 'O', check: s => s.shkvalOn },
      { id: 'slew', text: 'Slew onto the tank platoon (diamond markers) and ground-stabilise.', keys: '; , . / then Enter', check: s => s.groundStab && (s.aimToTanksM ?? 1e9) < 450 },
      { id: 'zoom', text: 'Zoom in to identify: wide, 8x, 23x.', keys: '= / -', check: s => s.zoom >= 8 },
      { id: 'wrong', text: 'Slew onto the bunker and try to lock with 10 m set: the lock fails, the size does not match.', keys: 'Enter', check: s => s.bunkerSizeFail },
      { id: 'big', text: 'Set the target size to 60 m and lock the bunker: АС.', keys: 'RCtrl+] then Enter', check: s => s.locked === 'bunker' },
      { id: 'tank', text: 'Unlock, set 10 m (armour), slew back to the tanks and lock one.', keys: 'Enter, RCtrl+[, Enter', check: s => s.locked === 'tank' && s.targetSizeM <= 15 },
    ],
  },
  laser: {
    id: 'laser', title: 'Laser and range', short: 'Laser', scored: false,
    goal: 'Lock a tank, switch the laser on, read the slant range, then let the laser cool.',
    steps: [
      { id: 'lock', text: 'The sight is on the platoon. Lock a tank: АС on the IT-23M.', keys: 'Enter', check: s => s.locked === 'tank' },
      { id: 'laser', text: 'Switch the laser on: ЛД and the slant range in km appear.', keys: 'RShift+O', check: s => s.laserOn },
      { id: 'range', text: 'Keep lasing for 5 s and watch the range count down as you close.', check: s => s.lasedLongEnough },
      { id: 'off', text: 'Switch the laser off to cool it. Lase only when you need the range or a missile is in flight.', keys: 'RShift+O', check: s => s.lasedLongEnough && !s.laserOn },
    ],
  },
  vikhr: {
    id: 'vikhr', title: 'Vikhr attack', short: 'Vikhr drill', scored: true,
    goal: 'Four tanks at 12–15 km. Lock, lase, fire at ПР and hold the lock and the laser until each Vikhr hits.',
    steps: [
      { id: 'mode', text: 'Air-to-ground mode, Shkval on.', keys: '7, O', check: s => s.master === 'ag' && s.shkvalOn },
      { id: 'weapon', text: 'Select the Vikhr: 9А4172 on the HUD.', keys: 'D', check: s => s.selected === 'vikhr' },
      { id: 'lock', text: 'Find the platoon, stabilise, zoom and lock a tank (10 m).', keys: '; , . /, Enter, =', check: s => s.locked === 'tank' },
      { id: 'laser', text: 'Laser on. Wait for ПР: inside the launch range.', keys: 'RShift+O', check: s => s.laserOn },
      { id: 'fire', text: 'Fire. Keep the lock and the laser on until the IT-23M time of flight reaches 0.', keys: 'Space', check: s => s.shots > 0 },
      { id: 'next', text: 'Unlock, move to the next tank, lock and fire again.', check: s => s.hits >= 2 },
    ],
  },
  ccip: {
    id: 'ccip', title: 'Rocket and gun CCIP pass', short: 'CCIP pass', scored: true,
    goal: 'Dive on the truck column, walk the CCIP pipper onto a truck and fire at ПР. The cannon works the same way.',
    steps: [
      { id: 'mode', text: 'Air-to-ground mode: ОПТ-ЗЕМЛЯ.', keys: '7', check: s => s.master === 'ag' },
      { id: 'weapon', text: 'Select the S-8 rockets (С8), or the cannon (ВПУ).', keys: 'D or C', check: s => s.selected === 's8' || s.selected === 'gun25t' },
      { id: 'fire', text: 'In the dive, steer the pipper onto a truck and fire when ПР lights.', keys: 'Left / Right, Space', check: s => s.shots > 0 },
      { id: 'hit', text: 'Destroy a truck.', check: s => s.hits > 0 },
    ],
  },
};

/** Pilot words for why an air-to-ground weapon missed (every sim reason). */
export const MISS_TEXT: Record<AgMissReason, string> = {
  'lock-lost': 'Lock lost before impact: the missile went ballistic. Keep АС until the time of flight reaches 0.',
  'laser-off': 'Laser off before impact: the Vikhr rides the beam all the way. Keep ЛД on.',
  gimbal: 'The target left the Shkval gimbal (±35° azimuth, +15° to −85°). Do not turn away while a missile flies.',
  terrain: 'Terrain masked the line of sight: the lock dropped.',
  'emitter-off': 'The radar stopped emitting.',
  'target-dead': 'The target was already destroyed.',
  ground: 'Hit the ground short of the target.',
  timeout: 'Ran out of energy before the target: fire closer.',
};

export interface ShotRecord { weapon: string; rangeM: number | null; result: 'hit' | 'miss' | 'flying'; reason?: AgMissReason | 'hit'; killed: boolean }

export interface Debrief { stars: 0 | 1 | 2 | 3; title: string; lines: string[]; coaching: string[]; passed: boolean }

/** Vikhr drill: hits and kills against misses, laser time noted (S1 laser use limit is 20 min per flight). */
export function scoreVikhr(o: { shots: ShotRecord[]; tanks: number; tanksKilled: number; laserS: number }): Debrief {
  const hits = o.shots.filter(s => s.result === 'hit').length;
  const misses = o.shots.filter(s => s.result === 'miss');
  const stars: Debrief['stars'] = o.tanksKilled >= o.tanks && misses.length === 0 ? 3 : o.tanksKilled >= Math.ceil(o.tanks * 0.75) ? 2 : o.tanksKilled >= 1 ? 1 : 0;
  const lines = [
    `Tanks destroyed ${o.tanksKilled} of ${o.tanks}`,
    `Vikhr fired ${o.shots.length}: ${hits} hit, ${misses.length} missed`,
    `Laser on ${Math.round(o.laserS)} s`,
  ];
  const coaching: string[] = [];
  const reasons = new Map<string, number>();
  for (const m of misses) if (m.reason && m.reason !== 'hit') reasons.set(m.reason, (reasons.get(m.reason) ?? 0) + 1);
  for (const [r, n] of reasons) coaching.push(`${n} × ${MISS_TEXT[r as AgMissReason]}`);
  if (o.shots.length === 0) coaching.push('No Vikhr fired. Lock a tank, laser on, wait for ПР inside 10 km, then Space.');
  if (o.tanksKilled < o.tanks && o.shots.length > 0 && !misses.length) coaching.push('Keep a steady rhythm: after each hit unlock, slew to the next tank and lock again.');
  if (stars === 3) coaching.push('Clean attack: every Vikhr guided to impact.');
  return { stars, title: ['No kills', 'Some kills', 'Good attack', 'Platoon destroyed'][stars]!, lines, coaching, passed: stars >= 2 };
}

/** CCIP pass: kills first, then how close the best impact came. */
export function scoreCcip(o: { salvos: number; kills: number; bestMissM: number | null }): Debrief {
  const stars: Debrief['stars'] = o.kills >= 2 ? 3 : o.kills === 1 ? 2 : o.bestMissM != null && o.bestMissM < 60 ? 1 : 0;
  const lines = [`Trigger presses ${o.salvos}`, `Trucks destroyed ${o.kills}`,
    o.bestMissM != null ? `Closest impact ${Math.round(o.bestMissM)} m from a truck` : 'No impacts near the trucks'];
  const coaching: string[] = [];
  if (o.salvos === 0) coaching.push('Nothing fired. Fire when the pipper sits on a truck and ПР is lit.');
  else if (o.kills === 0) coaching.push('Put the pipper on the truck before you fire: the rockets land where the pipper is, with some spread.');
  if (stars >= 2) coaching.push('The pipper shows where the rockets will land: fly it onto the target, then fire.');
  return { stars, title: ['No hits', 'Close', 'Hit', 'Column destroyed'][stars]!, lines, coaching, passed: stars >= 2 };
}

/** Progress key for a lesson (AGENTS.md: '<route>:<lesson>:<aircraft>'). */
export const progressKey = (lesson: LessonId): string => `strike:${lesson}:su25t`;
