/**
 * [OWNER: page-defense] Drill definitions and setup defaults for the Defense page (pure, no DOM).
 * Every default is data-driven: threats by bloc, shooters from carriersOf(), ranges from the sim's own
 * launch-zone tables (dlzFor), altitudes from cruiseFor().
 */
import { Vector3 } from 'three';
import type { AircraftId, MissileId } from '../../data/types';
import { AIRCRAFT } from '../../data/aircraft';
import { MISSILES } from '../../data/missiles';
import { blocOf, carriersOf, cruiseFor } from '../../sim/scenarios';
import { dlzFor } from '../../sim/dlz';
import { speedFromMach } from '../../sim/atmosphere';
import type { AiSkill } from '../../sim/types';

export type DrillId = 'lock' | 'pitbull' | 'drag' | 'late' | 'free';
export const DRILL_ORDER: DrillId[] = ['lock', 'pitbull', 'drag', 'late', 'free'];
/** Drills that count toward 'defense:<ac>:done'. */
export const SCORED_DRILLS: DrillId[] = ['lock', 'pitbull', 'drag', 'late'];

/** The six radar missiles the drills use. */
export const THREATS: MissileId[] = ['r27er', 'aim7m', 'r77', 'aim120c', 'sd10', 'aim54c'];

/** When your controls come alive in a drill. */
export type Cue = 'start' | 'launch' | 'pitbull';

export type AltSetup = 'high' | 'above' | 'below' | 'low';
export type AspectSetup = 'hot' | 'flank-l' | 'flank-r' | 'beam-l' | 'beam-r' | 'cold';
export type MethodSetup = 'auto' | 'stt' | 'tws';

export interface DrillDef {
  id: DrillId;
  /** 1..4, null for the free drill. */
  n: number | null;
  title: string;
  /** Short cap legend. */
  cap: string;
  /** Seeker kinds this drill accepts. */
  seekers: ('sarh' | 'arh')[];
  cue: Cue;
  /** Extra seconds after the cue before your controls unlock (the late-defense drill). */
  delayS: number;
  /** What counts as passing: surviving, or just flying it (the late drill shows what happens). */
  pass: 'survive' | 'fly';
  alt: AltSetup;
  /** Does the drill want chaff (for scoring). */
  wantsChaff: boolean;
  /** The main technique, for scoring the discipline part. */
  technique: 'notch' | 'drag';
}

export const DRILLS: Record<DrillId, DrillDef> = {
  lock: {
    id: 'lock', n: 1, title: 'Break the lock', cap: 'Break lock', seekers: ['sarh'], cue: 'launch', delayS: 0,
    pass: 'survive', alt: 'high', wantsChaff: false, technique: 'notch',
  },
  pitbull: {
    id: 'pitbull', n: 2, title: 'Notch and chaff at pitbull', cap: 'Pitbull', seekers: ['arh'], cue: 'pitbull', delayS: 0,
    pass: 'survive', alt: 'above', wantsChaff: true, technique: 'notch',
  },
  drag: {
    id: 'drag', n: 3, title: 'Drag it out', cap: 'Drag', seekers: ['sarh', 'arh'], cue: 'launch', delayS: 0,
    pass: 'survive', alt: 'high', wantsChaff: false, technique: 'drag',
  },
  late: {
    id: 'late', n: 4, title: 'Late defense', cap: 'Late', seekers: ['arh'], cue: 'pitbull', delayS: 4,
    pass: 'fly', alt: 'high', wantsChaff: true, technique: 'notch',
  },
  free: {
    id: 'free', n: null, title: 'Free practice', cap: 'Free', seekers: ['sarh', 'arh'], cue: 'start', delayS: 0,
    pass: 'survive', alt: 'high', wantsChaff: false, technique: 'notch',
  },
};

export interface Setup {
  drill: DrillId;
  threat: MissileId;
  shooter: AircraftId;
  /** Launch range, m. */
  range: number;
  aspect: AspectSetup;
  alt: AltSetup;
  skill: AiSkill;
  method: MethodSetup;
}

export const SKILLS: AiSkill[] = ['rookie', 'regular', 'veteran', 'ace'];

/** Where the shooter starts, seen from your cockpit. `deg` is your aspect as he sees you. */
export const ASPECTS: { value: AspectSetup; label: string; deg: number; side: 'left' | 'right' }[] = [
  { value: 'hot', label: 'On your nose', deg: 0, side: 'right' },
  { value: 'flank-l', label: '45° left', deg: 45, side: 'left' },
  { value: 'flank-r', label: '45° right', deg: 45, side: 'right' },
  { value: 'beam-l', label: '90° left', deg: 90, side: 'left' },
  { value: 'beam-r', label: '90° right', deg: 90, side: 'right' },
  { value: 'cold', label: 'Behind you', deg: 180, side: 'right' },
];

export const ALTS: { value: AltSetup; label: string; title: string }[] = [
  { value: 'high', label: 'Both high', title: 'You and the shooter at cruise altitude, about 10 km' },
  { value: 'above', label: 'He is higher', title: 'He is at about 9.5 km, you at 5.5 km: missiles look down at you (the notch works)' },
  { value: 'below', label: 'He is lower', title: 'He is at 4.5 km, you high: missiles look up at you (the notch is weak)' },
  { value: 'low', label: 'Both low', title: 'Both at 3 km: short ranges, clutter everywhere' },
];

/** Missiles a drill accepts, in THREATS order. */
export function threatsFor(drill: DrillId): MissileId[] {
  const ok = DRILLS[drill].seekers;
  return THREATS.filter(m => (ok as string[]).includes(MISSILES[m].seeker));
}

/** A sensible threat for this drill and the player's side: Western jets face Eastern missiles and vice versa. */
export function defaultThreat(drill: DrillId, player: AircraftId): MissileId {
  const west = blocOf(player) === 'west';
  switch (drill) {
    case 'lock': return west ? 'r27er' : 'aim7m';
    case 'pitbull': case 'late': case 'drag': return west ? 'r77' : 'aim120c';
    case 'free': return west ? 'r27er' : 'aim120c';
  }
}

/** Jets that fire this missile, opponents of the player first. */
export function shootersFor(threat: MissileId, player: AircraftId): AircraftId[] {
  const list = carriersOf(threat, player);
  return list.length ? list : [player];
}

/** Can this shooter fire an ARH from TWS (silent until pitbull)? */
export function canTwsShot(shooter: AircraftId): boolean {
  const r = AIRCRAFT[shooter].radar;
  return !!r.tws && r.tws.launchFromTws && r.modes.includes('tws');
}

/** How the shot will actually leave: STT (lock + warnings) or TWS (silent until pitbull). */
export function launchMethod(threat: MissileId, shooter: AircraftId, method: MethodSetup): 'stt' | 'tws' {
  if (MISSILES[threat].seeker !== 'arh') return 'stt';
  if (method === 'stt') return 'stt';
  return canTwsShot(shooter) ? 'tws' : 'stt';
}

/**
 * Keep a setup consistent after a change: a SARH threat always leaves from STT, and a shooter that cannot
 * fire from TWS cannot keep 'tws' selected (the control would show a disabled choice as the active one).
 */
export function normalizeSetup(s: Setup): Setup {
  const arh = MISSILES[s.threat].seeker === 'arh';
  const phoenixPitbull = (s.threat === 'aim54a' || s.threat === 'aim54c') && (s.drill === 'pitbull' || s.drill === 'late');
  const method: MethodSetup = phoenixPitbull ? 'tws' : !arh ? 'auto' : s.method === 'tws' && !canTwsShot(s.shooter) ? 'auto' : s.method;
  return method === s.method ? s : { ...s, method };
}

/** Does his STT shot of this missile light up your RWR's launch warning at once? */
export function sttLaunchWarns(threat: MissileId, shooter: AircraftId): boolean {
  return MISSILES[threat].seeker === 'sarh' || AIRCRAFT[shooter].radar.sttArhLaunchWarning;
}

/** Start altitudes (m) and Mach for both jets. */
export function altitudes(setup: Pick<Setup, 'alt' | 'shooter'>, player: AircraftId): { playerAlt: number; shooterAlt: number; playerMach: number; shooterMach: number } {
  const pc = cruiseFor(player), sc = cruiseFor(setup.shooter);
  switch (setup.alt) {
    case 'high': return { playerAlt: pc.alt, shooterAlt: sc.alt, playerMach: pc.mach, shooterMach: sc.mach };
    case 'above': return { playerAlt: 5500, shooterAlt: Math.max(sc.alt, 9500), playerMach: pc.mach, shooterMach: sc.mach };
    case 'below': return { playerAlt: Math.max(pc.alt, 9500), shooterAlt: 4500, playerMach: pc.mach, shooterMach: 0.85 };
    case 'low': return { playerAlt: 3000, shooterAlt: 3000, playerMach: 0.8, shooterMach: 0.8 };
  }
}

/** The shooter's launch zone against you, hot, for this geometry (the sim's own DLZ tables). */
export function zoneFor(setup: Pick<Setup, 'alt' | 'shooter' | 'threat'>, player: AircraftId): { rmax: number; rne: number; rmin: number } {
  const a = altitudes(setup, player);
  const d = 40_000;
  const sPos = new Vector3(0, a.shooterAlt, -d), pPos = new Vector3(0, a.playerAlt, 0);
  const sVel = new Vector3(0, 0, speedFromMach(a.shooterMach, a.shooterAlt));
  const pVel = new Vector3(0, 0, -speedFromMach(a.playerMach, a.playerAlt));
  const z = dlzFor(sPos, sVel, pPos, pVel, setup.threat);
  return { rmax: z.rmax, rne: z.rne, rmin: z.rmin };
}

/** Allowed launch-range bounds (m) for the slider. */
export function rangeBounds(setup: Pick<Setup, 'alt' | 'shooter' | 'threat'>, player: AircraftId): { min: number; max: number } {
  const z = zoneFor(setup, player);
  const min = Math.max(8000, z.rmin * 1.5);
  return { min, max: Math.max(min + 2000, z.rmax) };
}

/** The drill's default launch range (m) for this geometry. */
export function defaultRange(drill: DrillId, setup: Pick<Setup, 'alt' | 'shooter' | 'threat'>, player: AircraftId): number {
  const z = zoneFor(setup, player);
  const b = rangeBounds(setup, player);
  const pit = (MISSILES[setup.threat].pitbullKm ?? 0) * 1000;
  let r: number;
  switch (drill) {
    case 'lock': r = 0.55 * z.rmax; break;
    case 'pitbull': r = 0.6 * z.rmax; break;
    case 'drag': r = Math.max(0.85 * z.rmax, 1.6 * z.rne); break;
    case 'late': r = pit > 0 ? Math.min(pit + 8000, 0.5 * z.rmax) : 0.35 * z.rmax; break;
    case 'free': r = 0.6 * z.rmax; break;
  }
  r = Math.min(b.max, Math.max(b.min, r));
  return Math.round(r / 1000) * 1000;
}

/** A complete default setup for a drill and a jet. */
export function defaultSetup(drill: DrillId, player: AircraftId): Setup {
  const threat = defaultThreat(drill, player);
  return setupFor(drill, player, threat);
}

/** Defaults for a drill with a chosen threat (shooter, altitude, range follow). */
export function setupFor(drill: DrillId, player: AircraftId, threat: MissileId, keep: Partial<Setup> = {}): Setup {
  const shooters = shootersFor(threat, player);
  const shooter = keep.shooter && shooters.includes(keep.shooter) ? keep.shooter : shooters[0];
  const alt = keep.alt ?? DRILLS[drill].alt;
  const base = { alt, shooter, threat };
  return {
    drill, threat, shooter, alt,
    range: keep.range ?? defaultRange(drill, base, player),
    aspect: keep.aspect ?? 'hot',
    skill: keep.skill ?? 'veteran',
    method: keep.method ?? 'auto',
  };
}

/** Missile label with its Fox number and seeker, e.g. "R-27ER (Fox 1, SARH)". */
export function missileLabel(m: MissileId): string {
  const s = MISSILES[m];
  return `${s.name} · Fox ${s.fox}`;
}

/** One-line goal for the drill with this setup, in pilot words. */
export function drillGoal(setup: Setup): string {
  const m = MISSILES[setup.threat];
  const sh = AIRCRAFT[setup.shooter].short;
  const radar = AIRCRAFT[setup.shooter].radar.name;
  const method = launchMethod(setup.threat, setup.shooter, setup.method);
  switch (setup.drill) {
    case 'lock':
      return `Beat an ${m.name} by notching the ${sh}'s ${radar}. A SARH missile rides his lock: drop the lock and it goes dumb.`;
    case 'pitbull':
      if ((setup.threat === 'aim54a' || setup.threat === 'aim54c') && method === 'stt') return `A PD-STT Phoenix gives an immediate launch warning and stays semi-active to impact. Beam the ${sh}'s radar; it never reaches pitbull. Select TWS for the pitbull drill.`;
      return method === 'tws'
        ? `The ${sh} fires an ${m.name} from TWS: no warning until its seeker goes active. At the spike, beam the missile, get low and chaff in the notch.`
        : sttLaunchWarns(setup.threat, setup.shooter)
          ? `The ${sh} locks you and fires an ${m.name} from STT: lock, then launch warning. Hold hot until the spike, then beam the missile, get low and chaff in the notch.`
          : `The ${sh} locks you and fires an ${m.name} from STT: you get the lock, and here no launch warning (simplified). At the spike, beam the missile, get low and chaff in the notch.`;
    case 'drag':
      return `A long ${m.name} shot. Turn cold at the launch call, full afterburner, descend, and run it out of energy.`;
    case 'late':
      return `A close ${m.name} shot, and you only react ${DRILLS.late.delayS} s after the spike. See how little time that leaves.`;
    case 'free':
      return `Any threat, any geometry. Your controls are live from the start: defend at the lock, the launch or the spike.`;
  }
}

/** What unlocks your controls, in words. */
export function cueText(drill: DrillId): string {
  const d = DRILLS[drill];
  if (d.cue === 'start') return 'Controls live from the start.';
  if (d.cue === 'launch') return drill === 'drag' ? 'Controls unlock at the launch call.' : 'Controls unlock at the launch warning.';
  return d.delayS > 0 ? `Controls unlock ${d.delayS} s after the spike.` : 'Controls unlock at the spike (seeker active).';
}

/** Next drill in order (wraps back to the first scored drill). */
export function nextDrill(d: DrillId): DrillId {
  const i = DRILL_ORDER.indexOf(d);
  const n = DRILL_ORDER[(i + 1) % DRILL_ORDER.length];
  return n;
}
