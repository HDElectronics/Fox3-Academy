/**
 * [OWNER: page-strike] Lesson definitions and scoring for the Shkval & Vikhr page (pure, unit-tested).
 * Keys and cockpit words come from PROCEDURES.su25t and the ED Su-25T Flight Manual (S1). Game level only.
 */
import type { AgMissReason, GroundUnitKind } from '../../sim/types';
import { AG_CAVEATS } from '../../data/agWeapons';
import { SAM_CAVEATS } from '../../data/sams';

export const STRIKE_CAVEATS = [...AG_CAVEATS, ...SAM_CAVEATS];

/** Keep scoring live until weapons resolve, including ballistic SAMs that can still hit after track loss. */
export function strikeWeaponsResolved(
  playerId: string,
  weapons: Iterable<{ alive: boolean }>,
  sams: Iterable<{ alive: boolean; targetId: string | null }>,
): boolean {
  for (const w of weapons) if (w.alive) return false;
  for (const m of sams) if (m.alive && m.targetId === playerId) return false;
  return true;
}

export type LessonId = 'shkval' | 'laser' | 'vikhr' | 'ccip' | 'bombs' | 'sead' | 'threat';
export const LESSON_ORDER: LessonId[] = ['shkval', 'laser', 'vikhr', 'ccip', 'bombs', 'sead', 'threat'];

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
  /** Bombs lesson: CCRP solution available (bomb, designation, laser), release held, automatic releases, CCIP bombs. */
  ccrpActive: boolean;
  ccrpHeld: boolean;
  ccrpReleases: number;
  ccipBombs: number;
  /** Kh-58: passive detection on, attackable emitters inside ±30°, emitter locked, ПР lit, Kh-58 fired. */
  armDetecting: boolean;
  emittersInZone: number;
  emitterLocked: boolean;
  pr: boolean;
  armFired: number;
  /** SAM sites destroyed, tanks destroyed. */
  samsKilled: number;
  tanksKilled: number;
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
  bombs: {
    id: 'bombs', title: 'Bombs: CCIP and CCRP', short: 'Bombs', scored: true,
    goal: 'Level CCRP pass on the tank platoon with a Shkval designation, then a CCIP dive on the trucks.',
    steps: [
      { id: 'mode', text: 'Air-to-ground mode.', keys: '7', check: s => s.master === 'ag' },
      { id: 'weapon', text: 'Select the free-fall bombs: АБ on the HUD.', keys: 'D', check: s => s.selected === 'fab250' },
      { id: 'designate', text: 'Shkval on, slew onto the tank platoon and ground-stabilise: that point is the CCRP target.', keys: 'O, ; , . /, Enter', check: s => s.shkvalOn && s.groundStab && (s.aimToTanksM ?? 1e9) < 250 },
      { id: 'laser', text: 'Laser on for the range: the director circle and the time scale appear on the HUD.', keys: 'RShift+O', check: s => s.ccrpActive || s.ccrpReleases > 0 },
      { id: 'hold', text: 'Hold release and fly the keel of the aircraft symbol into the director circle.', keys: 'Space, Left / Right', check: s => s.ccrpHeld || s.ccrpReleases > 0 },
      { id: 'release', text: 'Keep holding: the arrow runs down the last 10 s and the bomb releases itself.', check: s => s.ccrpReleases > 0 },
      { id: 'ccip', text: 'CCIP dive on the trucks: Shkval off, walk the pipper onto a truck and release.', keys: 'O, Space', check: s => s.ccipBombs > 0 },
    ],
  },
  sead: {
    id: 'sead', title: 'Kh-58 SEAD', short: 'Kh-58 SEAD', scored: true,
    goal: 'An SA-15 is emitting 30 km ahead. Find it with the L-081 pod and kill it with a Kh-58 from outside its trainer ring (12 km, not verified in DCS).',
    steps: [
      { id: 'mode', text: 'Air-to-ground mode and the Kh-58: 58 on the HUD.', keys: '7, D', check: s => s.master === 'ag' && s.selected === 'kh58' },
      { id: 'detect', text: 'Passive detection on: ПРГ on the HUD.', keys: 'I', check: s => s.armDetecting },
      { id: 'zone', text: 'Turn toward the SA-15 until its radar is inside ±30°: a diamond with its type code appears. The SPO-15 lights only once the radar paints you.', keys: 'Left / Right', check: s => s.emittersInZone > 0 || s.emitterLocked },
      { id: 'lock', text: 'Slew the square onto the diamond and lock: the diamond becomes a circle.', keys: '; , . /, Enter', check: s => s.emitterLocked || s.armFired > 0 },
      { id: 'pr', text: 'Read the range bar (current and maximum) and wait for ПР.', check: s => s.pr || s.armFired > 0 },
      { id: 'fire', text: 'Fire, then turn away: the Kh-58 homes on the radar for as long as it emits.', keys: 'Space', check: s => s.armFired > 0 },
      { id: 'kill', text: 'The SA-15 is destroyed.', check: s => s.samsKilled > 0 },
    ],
  },
  threat: {
    id: 'threat', title: 'Attack under a SAM threat', short: 'SAM threat', scored: true,
    goal: 'A tank platoon covered by an SA-15 (trainer ring: 12 km, not verified in DCS). Suppress it with a Kh-58 first, or stand off with Vikhrs outside the ring.',
    steps: [
      { id: 'mode', text: 'Air-to-ground mode. Watch the SPO-15: the trainer gives the SA-15 a 15 km search reach (simplified: 1.25 × its ring, not verified in DCS).', keys: '7', check: s => s.master === 'ag' },
      { id: 'choose', text: 'Choose: Kh-58 on the SA-15 first (58, I, Enter), or Vikhrs (9А4172) fired from outside its ring.', keys: 'D', check: s => s.selected === 'kh58' || s.selected === 'vikhr' },
      { id: 'first', text: 'Kill the SA-15, or put a Vikhr into a tank while you stay outside the ring.', check: s => s.samsKilled > 0 || s.tanksKilled > 0 },
      { id: 'platoon', text: 'Destroy the platoon. On a launch cue: notch, descend, or leave the ring.', check: s => s.tanksKilled >= 4 },
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

/** A bomb impact that counts as a hit (m from the nearest target). Trainer value. */
export const BOMB_HIT_M = 25;

/** Bombs lesson: the CCRP pass (automatic release, miss distance) and the CCIP pass (miss distance). */
export function scoreBombs(o: { ccrpAuto: boolean; ccrpMissM: number | null; ccrpPassesMissed: number; ccipMissM: number | null; kills: number }): Debrief {
  const ccrpOk = o.ccrpAuto && o.ccrpMissM != null && o.ccrpMissM <= BOMB_HIT_M;
  const ccipOk = o.ccipMissM != null && o.ccipMissM <= BOMB_HIT_M;
  const near = [o.ccrpMissM, o.ccipMissM].some(m => m != null && m <= 60);
  const stars: Debrief['stars'] = ccrpOk && ccipOk ? 3 : ccrpOk || ccipOk ? 2 : near ? 1 : 0;
  const m = (x: number | null) => (x == null ? 'no bomb' : `${Math.round(x)} m`);
  const missed = o.ccrpPassesMissed;
  const lines = [
    `CCRP: ${o.ccrpAuto ? 'automatic release' : 'no automatic release'}, miss ${m(o.ccrpMissM)}${missed ? `, ${missed} pass${missed > 1 ? 'es' : ''} without release` : ''}`,
    `CCIP: miss ${m(o.ccipMissM)}`,
    `Targets destroyed ${o.kills}`,
  ];
  const coaching: string[] = [];
  if (missed) coaching.push('No CCRP release on a pass: the keel was outside the director circle when the arrow reached 0, or release was let go. Steer into the circle early and keep holding.');
  if (!o.ccrpAuto && !missed) coaching.push('CCRP: designate with the Shkval, laser on, then hold release until the bomb goes by itself.');
  if (o.ccrpMissM != null && o.ccrpMissM > BOMB_HIT_M) coaching.push('CCRP bombs land on the designated point: stabilise the sight on the target itself, not near it.');
  if (o.ccipMissM == null) coaching.push('CCIP: Shkval off, the pipper shows the impact point. Release with the pipper on the target.');
  else if (o.ccipMissM > BOMB_HIT_M) coaching.push('CCIP: fly the pipper onto the truck first, then release. A pipper short or long misses by as much.');
  if (stars === 3) coaching.push('Both passes on target: CCRP for a level release on a designation, CCIP when you can see the target in the dive.');
  return { stars, title: ['No hits', 'Close', 'One pass on target', 'Both passes on target'][stars]!, lines, coaching, passed: stars >= 2 };
}

/** Kh-58 SEAD: kill, launch outside the ring inside the band, time exposed inside the SAM ring. */
export function scoreSead(o: { killed: boolean; fired: number; launchRangeM: number | null; ringM: number; band: { min: number; max: number }; ringS: number; shotDown: boolean }): Debrief {
  const outside = o.launchRangeM != null && o.launchRangeM > o.ringM;
  const stars: Debrief['stars'] = o.shotDown ? (o.killed ? 1 : 0)
    : o.killed && outside && o.ringS < 1 ? 3 : o.killed ? 2 : o.fired ? 1 : 0;
  const km = (m: number) => (m / 1000).toFixed(1);
  const lines = [
    `SA-15 ${o.killed ? 'destroyed' : 'still up'}`,
    o.launchRangeM != null ? `Kh-58 launched at ${km(o.launchRangeM)} km (band ${km(o.band.min)}–${km(o.band.max)} km, ring ${km(o.ringM)} km)` : 'No Kh-58 launched',
    `Time inside the SAM ring ${Math.round(o.ringS)} s${o.shotDown ? ', shot down' : ''}`,
  ];
  const coaching: string[] = [];
  if (!o.fired) coaching.push('No launch. [I], steer the emitter inside ±30°, square on the diamond, [Enter], fire at ПР.');
  if (o.fired && !outside) coaching.push('Launch before the ring: the Kh-58 band reaches far beyond the SA-15 ring, so there is no need to enter it.');
  if (o.fired && !o.killed && !o.shotDown) coaching.push('The Kh-58 homes only while the radar emits. A radar that goes silent makes it miss.');
  if (o.ringS >= 1) coaching.push('Turn away after the launch: the missile needs nothing more from you, and every second in the ring invites a SAM.');
  if (o.shotDown) coaching.push('Shot down inside the ring. Stay outside the trainer ring (12 km, not verified in DCS), and notch or descend on the launch cue.');
  if (stars === 3) coaching.push('Clean SEAD: detected, locked and fired from outside the ring, never exposed.');
  return { stars, title: ['No kill', 'Missile away', 'Site destroyed', 'Clean SEAD'][stars]!, lines, coaching, passed: stars >= 2 };
}

/** SAM-threat attack: targets killed, hits taken, time in the ring. */
export function scoreThreat(o: { tanks: number; tanksKilled: number; samsKilled: number; hitsTaken: number; ringS: number; samLaunches: number }): Debrief {
  const alive = o.hitsTaken === 0;
  const stars: Debrief['stars'] = !alive ? (o.tanksKilled >= 1 ? 1 : 0)
    : o.tanksKilled >= o.tanks && o.ringS < 15 ? 3 : o.tanksKilled >= Math.ceil(o.tanks * 0.75) ? 2 : o.tanksKilled >= 1 || o.samsKilled > 0 ? 1 : 0;
  const lines = [
    `Tanks destroyed ${o.tanksKilled} of ${o.tanks}`,
    `SAM sites destroyed ${o.samsKilled}`,
    `SAMs fired at you ${o.samLaunches}, hits taken ${o.hitsTaken}`,
    `Time inside a SAM ring ${Math.round(o.ringS)} s`,
  ];
  const coaching: string[] = [];
  if (!alive) coaching.push('Shot down. On the SPO-15 launch cue put the SAM at 3 or 9 o\'clock (notch) and descend, or turn out of the ring.');
  if (o.samLaunches > 0) coaching.push('Flares (192 on the Su-25T) decoy IR missiles. The SA-15 and SA-11 are radar guided: here flares do not help against them, and the Su-25T carries no chaff.');
  if (o.ringS >= 15) coaching.push('Too long inside the ring. Kill the SA-15 first with the Kh-58, or fire the Vikhr from beyond the trainer ring (12 km, not verified in DCS) and turn off within the Shkval gimbal.');
  if (o.samsKilled === 0 && o.tanksKilled < o.tanks) coaching.push('The Vikhr reaches 10 km and the SA-15 trainer ring is 12 km (not verified in DCS): stand-off works only while the SAM sits behind the target. Otherwise suppress it first.');
  if (stars === 3) coaching.push('Platoon destroyed without taking a hit.');
  return { stars, title: ['Mission failed', 'Partial', 'Good attack', 'Target destroyed'][stars]!, lines, coaching, passed: stars >= 2 };
}

/** Progress key for a lesson (AGENTS.md: '<route>:<lesson>:<aircraft>'). */
export const progressKey = (lesson: LessonId): string => `strike:${lesson}:su25t`;
