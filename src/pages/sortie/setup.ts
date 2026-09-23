/**
 * Sortie settings, the engagement builder (scenarios.duel / pair / twoVTwo) and the brief's facts,
 * all derived from data: loadouts, missile seekers and pitbull distances, the radar's TWS rules, the
 * in-game launch zone (dlzFor) at the chosen altitudes, and the AI skill table.
 */
import { Vector3 } from 'three';
import type { AircraftId, MissileId, SamId } from '../../data/types';
import { SAMS, SAM_ORDER } from '../../data/sams';
import { AIRCRAFT } from '../../data/aircraft';
import { MISSILES } from '../../data/missiles';
import type { AiSkill } from '../../sim/types';
import { World } from '../../sim/world';
import { cruiseFor, defaultAdversary, duel, pair, twoVTwo, type Engagement, type SamPlacement } from '../../sim/scenarios';
import { dlzFor } from '../../sim/dlz';
import { speedFromMach } from '../../sim/atmosphere';
import { AI_SKILLS } from '../../sim/ai';
import { fmtAlt, fmtAltFine, fmtRange, type Units } from '../../app/format';
import type { ScenarioId, SortieResult } from './coach';

export type { ScenarioId } from './coach';
export type TimeScale = 1 | 2 | 4 | 8;
export const TIME_SCALES: TimeScale[] = [1, 2, 4, 8];
export const SKILLS: AiSkill[] = ['rookie', 'regular', 'veteran', 'ace'];
export const SORTIE_LIMIT_S = 480;
/** Start separation limits, m (the brief's slider covers 40–160 km or 25–90 nm). */
export const RANGE_MIN_M = 40_000;
export const RANGE_MAX_M = 170_000;

export interface SortieSetup {
  scenario: ScenarioId;
  enemy: AircraftId;
  skill: AiSkill;
  /** Start separation, m. */
  range: number;
  playerAlt: number;
  enemyAlt: number;
  timeScale: TimeScale;
  seed: number;
  /** SAM sites on the bandits' side (0 = none) and their class. */
  sams: SamCount;
  samType: SamId;
}

export type SamCount = 0 | 1 | 2;
export const SAM_COUNTS: SamCount[] = [0, 1, 2];

export function defaultSetup(ac: AircraftId): SortieSetup {
  const enemy = defaultAdversary(ac);
  return {
    scenario: '1v1', enemy, skill: 'regular', range: 100_000,
    playerAlt: cruiseFor(ac).alt, enemyAlt: cruiseFor(enemy).alt, timeScale: 2, seed: 1, sams: 0, samType: 'sa11',
  };
}

/** Parse a stored setup (JSON string from the progress store), falling back to the defaults field by field. */
export function parseSetup(ac: AircraftId, raw: unknown): SortieSetup {
  const d = defaultSetup(ac);
  if (typeof raw !== 'string') return d;
  try {
    const o = JSON.parse(raw) as Partial<SortieSetup>;
    const num = (v: unknown, lo: number, hi: number, def: number) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def);
    return {
      scenario: o.scenario === '1v2' || o.scenario === '2v2' ? o.scenario : '1v1',
      enemy: typeof o.enemy === 'string' && Object.hasOwn(AIRCRAFT, o.enemy) ? o.enemy : d.enemy,
      skill: o.skill && SKILLS.includes(o.skill) ? o.skill : d.skill,
      range: num(o.range, RANGE_MIN_M, RANGE_MAX_M, d.range),
      playerAlt: num(o.playerAlt, 2_000, 13_000, d.playerAlt),
      enemyAlt: num(o.enemyAlt, 2_000, 13_000, d.enemyAlt),
      timeScale: TIME_SCALES.includes(o.timeScale as TimeScale) ? (o.timeScale as TimeScale) : d.timeScale,
      seed: 1,
      sams: o.sams === 1 || o.sams === 2 ? o.sams : 0,
      samType: o.samType && SAM_ORDER.includes(o.samType) ? o.samType : d.samType,
    };
  } catch { return d; }
}

/** Spawn the fight into a fresh World. */
export function buildSortie(world: World, ac: AircraftId, s: SortieSetup, units: Units): Engagement {
  const opts = { range: s.range, playerAlt: s.playerAlt, enemyAlt: s.enemyAlt, units, sams: samPlacements(s) };
  if (s.scenario === '1v2') return pair(world, ac, s.enemy, s.skill, opts);
  if (s.scenario === '2v2') return twoVTwo(world, ac, s.enemy, s.skill, opts);
  return duel(world, ac, s.enemy, s.skill, opts);
}

export const enemyCount = (s: ScenarioId) => (s === '1v1' ? 1 : 2);

/**
 * SAM sites for the sortie: on the bandits' side of the fight, off the centre line, placed so you meet the ring
 * on the way in (at least just outside it at the start, and no nearer than about half the start range).
 */
export function samPlacements(s: Pick<SortieSetup, 'sams' | 'samType' | 'range'>): SamPlacement[] {
  const ring = SAMS[s.samType].threatRingKm * 1000;
  const range = Math.max(ring * 1.15, s.range * 0.55);
  const offs = s.sams === 2 ? [18, -18] : s.sams === 1 ? [12] : [];
  return offs.map(offsetDeg => ({ type: s.samType, range, offsetDeg }));
}

/** Brief lines for the SAM sites (empty without sites). AI jets ignore SAMs: said as simplified. */
export function samBriefLines(s: Pick<SortieSetup, 'sams' | 'samType' | 'range'>, units: Units): string[] {
  if (!s.sams) return [];
  const sp = SAMS[s.samType];
  const p = samPlacements(s)[0];
  const short = sp.nato.split(' ')[0];
  return [
    `${s.sams === 2 ? 'Two' : 'One'} ${sp.nato} site${s.sams === 2 ? 's' : ''} ahead, about ${fmtRange(p.range ?? 0, units, 0)} out: ring ${fmtRange(sp.threatRingKm * 1000, units, 0)}, ${fmtAltFine(sp.minAltM, units)} to ${fmtAlt(sp.maxAltM, units)} (not verified in the Mission Editor).`,
    `The RWR shows ${short} search, then lock, then launch. ${sp.defeat[0]}`,
    'Simplified: the AI jets ignore the SAM sites and fly the fight as if they were not there. The sites shoot only at your side.',
  ];
}

// ───────────────────────────────────────────────────────────── brief facts

export interface ZoneBar { who: 'you' | 'them'; missile: MissileId; name: string; rmax: number; rne: number }
export interface BriefFacts {
  you: string;
  them: string;
  radar: string;
  threats: string[];
  yourJet: string[];
  skill: string;
  zones: ZoneBar[];
  edge: string;
  sams: string[];
}

/** Best radar missile in a loadout (longest ED head-on reference), else the best IR one. */
export function primaryMissile(ac: AircraftId): MissileId | null {
  const ids = AIRCRAFT[ac].loadout.map(l => l.missile);
  const radar = ids.filter(m => MISSILES[m].seeker !== 'ir');
  const pool = radar.length ? radar : ids;
  return pool.sort((a, b) => MISSILES[b].ref.highHeadOnKm - MISSILES[a].ref.highHeadOnKm)[0] ?? null;
}

const loadoutText = (ac: AircraftId) => AIRCRAFT[ac].loadout.map(l => `${l.count}× ${MISSILES[l.missile].name}`).join(', ');

/** Launch zone head-on, both at their chosen altitudes and cruise Mach (the in-game DLZ numbers). */
export function headOnZone(missile: MissileId, shooter: AircraftId, shooterAlt: number, target: AircraftId, targetAlt: number): { rmax: number; rne: number } {
  const vs = speedFromMach(cruiseFor(shooter).mach, shooterAlt);
  const vt = speedFromMach(cruiseFor(target).mach, targetAlt);
  const d = dlzFor(new Vector3(0, shooterAlt, 0), new Vector3(0, 0, -vs), new Vector3(0, targetAlt, -60000), new Vector3(0, 0, vt), missile);
  return { rmax: d.rmax, rne: d.rne };
}

function threatLine(m: MissileId, shooter: AircraftId, units: Units): string {
  const spec = MISSILES[m], radar = AIRCRAFT[shooter].radar;
  const pit = spec.pitbullKm ? fmtRange(spec.pitbullKm * 1000, units, 0) : null;
  if (spec.seeker === 'sarh') return `${spec.name} (Fox 1): you get his lock, then a launch warning, and it needs his lock to impact. Notch his radar: beam him low with chaff and it goes dumb.`;
  if (spec.seeker === 'ir') return `${spec.name} (Fox 2, IR): the RWR never shows it. Inside ${fmtRange(spec.ref.lowHeadOnKm * 1000, units, 0)} or so, flare early and stay out of his nose.`;
  if (radar.tws?.launchFromTws) return `${spec.name} (Fox 3) from TWS: no lock, no launch warning, nothing until it goes active${pit ? ` about ${pit} from you` : ''}. Keep your own timeline.`;
  if (radar.sttArhLaunchWarning) return `${spec.name} (Fox 3) from STT: you see his lock and a launch warning, then it goes active${pit ? ` about ${pit} out` : ''}.`;
  // DCS most likely shows only the lock until pitbull for a Fox 3 fired from STT (not re-verified): say so.
  return `${spec.name} (Fox 3) from STT: you see his lock; here, no launch warning until it goes active${pit ? ` about ${pit} out` : ''} (DCS most likely does the same; not verified).`;
}

/** 'an F-16C', 'an Su-27', 'an M-2000C', 'a J-11A', 'a MiG-29S' (said "mig"): the article by the spoken first sound. */
export function article(short: string): 'a' | 'an' {
  if (/^Mi[G-]/.test(short)) return 'a';
  return /^[AEFHILMNORSX]/.test(short) ? 'an' : 'a';
}

/** How many Fox 3 targets the jet can support at once here: the radar's cap, never more than the Fox 3s it carries. */
export function multiShot(ac: AircraftId): string {
  const spec = AIRCRAFT[ac];
  const fox3 = spec.loadout.filter(l => MISSILES[l.missile].seeker === 'arh');
  const carried = fox3.reduce((n, l) => n + l.count, 0);
  const cap = spec.radar.tws?.maxSimultaneousTargets ?? 1;
  if (cap >= carried) return `each of your ${carried} ${fox3.map(l => MISSILES[l.missile].name).join(' / ')} can go to a different target.`;
  return `the ${spec.short} guides Fox 3s at up to ${cap} targets at once.`;
}

export function briefFacts(ac: AircraftId, s: SortieSetup, units: Units): BriefFacts {
  const me = AIRCRAFT[ac], en = AIRCRAFT[s.enemy];
  const n = enemyCount(s.scenario);
  const R = (m: number) => fmtRange(m, units, 0);
  const theirs = [...new Set(en.loadout.map(l => l.missile))];
  const threats = theirs.map(m => threatLine(m, s.enemy, units));

  const yourJet: string[] = [];
  const mine = me.loadout.map(l => MISSILES[l.missile]);
  const hasFox3 = mine.some(m => m.seeker === 'arh');
  if (!hasFox3) yourJet.push(`No Fox 3 on the ${me.short}: your ${mine.find(m => m.seeker === 'sarh')?.name ?? 'radar missile'} needs your lock all the way to impact, and he sees lock and launch the whole time.`);
  if (!me.radar.tws) yourJet.push(`No TWS on the ${me.short}: you lock (${me.radar.modeLabels.stt ?? 'STT'}) to shoot, and he hears the lock.`);
  else if (me.radar.tws.autoSttAtRmaxFraction) yourJet.push(`${me.radar.modeLabels.tws ?? 'TWS'} tracks one target silently; the radar locks by itself at ${Math.round(me.radar.tws.autoSttAtRmaxFraction * 100)} % of Rmax and the shot leaves from STT.`);
  else if (me.radar.tws.launchFromTws && hasFox3) yourJet.push(`Your Fox 3 leaves from TWS with no warning to him until pitbull; ${multiShot(ac)}`);
  yourJet.push(`Crank to about ${Math.min(50, me.radar.gimbalAzDeg - 10)}° while you guide: the radar gimbal is ±${me.radar.gimbalAzDeg}°.`);

  const sk = AI_SKILLS[s.skill];
  const skill = `${s.skill[0].toUpperCase() + s.skill.slice(1)}: reacts to a warning in ${sk.reactS[0]}–${sk.reactS[1]} s, beams within ±${sk.notchErrDeg}°, ` +
    `shoots at ${sk.launchFrac !== null ? `${Math.round(sk.launchFrac * 100)} % of Rmax` : 'just outside Rne'}, cranks ${sk.crankDeg}°` +
    `${sk.inFlightPerTarget > 1 ? ', may ripple two missiles' : ''}.`;

  const zones: ZoneBar[] = [];
  const pm = primaryMissile(ac), pe = primaryMissile(s.enemy);
  if (pm) { const z = headOnZone(pm, ac, s.playerAlt, s.enemy, s.enemyAlt); zones.push({ who: 'you', missile: pm, name: MISSILES[pm].name, ...z }); }
  if (pe) { const z = headOnZone(pe, s.enemy, s.enemyAlt, ac, s.playerAlt); zones.push({ who: 'them', missile: pe, name: MISSILES[pe].name, ...z }); }
  let edge = '';
  if (zones.length === 2) {
    const [y, t] = zones;
    const d = y.rmax - t.rmax;
    edge = Math.abs(d) < 3000
      ? `Head-on you and he reach about the same range (${R(y.rmax)} vs ${R(t.rmax)}): whoever is higher and faster at the shot wins it.`
      : d > 0
        ? `You outrange him by ${R(d)} head-on: shoot first, crank, and be cold before his ${R(t.rmax)}.`
        : `He outranges you by ${R(-d)} head-on: do not trade shots at max range. Beam his first shot, then come back hot and shoot inside your own Rne, or climb and speed up to stretch your missile.`;
  }
  // Head-on detection as the sim computes it: the jet's table range × (RCS / 5 m²)^¼, × the look-down factor
  // when the target is below.
  const det = (obs: AircraftId, obsAlt: number, tgt: AircraftId, tgtAlt: number) => {
    const r = AIRCRAFT[obs].radar.detectKm;
    const down = tgtAlt < obsAlt - 50;
    return { m: r.headOn * 1000 * Math.pow(AIRCRAFT[tgt].rcsM2 / 5, 0.25) * (down ? r.lookDownFactor : 1), down };
  };
  const mine2 = det(ac, s.playerAlt, s.enemy, s.enemyAlt), his = det(s.enemy, s.enemyAlt, ac, s.playerAlt);
  const an = article(en.short);
  let radar = `Your ${me.radar.name} sees ${an} ${en.short} head-on at about ${R(mine2.m)}${mine2.down ? ' (looking down)' : ''}; his ${en.radar.name} sees you at about ${R(his.m)}${his.down ? ' (looking down)' : ''}.`;
  const theirZone = zones.find(z => z.who === 'them');
  if (theirZone && theirZone.rmax > mine2.m) radar += ` He can shoot from ${R(theirZone.rmax)}, before your radar sees him: fly the AWACS picture, watch the RWR, and do not fly straight at him.`;
  else if (his.m > mine2.m + 5000) radar += ' He sees you first.';

  return {
    radar,
    you: `${me.name}: ${loadoutText(ac)}.`,
    them: `${n}× ${en.name}, ${s.skill}: ${loadoutText(s.enemy)} each.`,
    threats, yourJet, skill, zones, edge, sams: samBriefLines(s, units),
  };
}

// ───────────────────────────────────────────────────────────── world + end rules

/** A fresh World for this sortie (deterministic per jet and seed, so "Fly again" is the same fight). */
export function sortieWorld(ac: AircraftId, s: SortieSetup): World {
  return new World(1000 + s.seed * 7919 + ac.length * 31);
}

/** End rules: you are down, every bandit is down, nobody has a missile left, or the time limit. */
export function sortieEnd(world: World, eng: Engagement): SortieResult | null {
  const me = world.get(eng.playerId);
  if (!me || !me.alive) return { outcome: 'loss', reason: 'shot-down', t: world.t };
  if (!eng.enemyIds.some(id => world.get(id)?.alive)) return { outcome: 'win', reason: 'bandits-dead', t: world.t };
  if (world.t >= SORTIE_LIMIT_S) return { outcome: 'draw', reason: 'time', t: world.t };
  let any = false;
  for (const a of world.aircraft.values()) if (a.alive) for (const v of Object.values(a.stores)) if ((v ?? 0) > 0) { any = true; break; }
  if (!any && ![...world.missiles.values()].some(m => m.alive)) return { outcome: 'draw', reason: 'bingo', t: world.t };
  return null;
}
