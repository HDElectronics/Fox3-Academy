/**
 * Missile Lab: pure setup logic (no DOM). Shot setups, launch-zone geometry, the jet's own cue names,
 * presets, key extraction from the jet's binds. Everything here is testable in node.
 */
import { Vector3 } from 'three';
import type { AircraftId, MissileId } from '../../data/types';
import { AIRCRAFT, AIRCRAFT_ORDER, MISSILES, PROCEDURES } from '../../data';
import type { Dlz, PhoenixLaunchMode } from '../../sim/types';
import { dlzFor, dlzTargetType, simulateShot, type ShotResult, type ShotSetup, type TargetManeuver } from '../../sim/dlz';
import { sigma, speedFromMach } from '../../sim/atmosphere';
import { missileModel } from '../../sim/missileModel';
import { parseKeyList, splitAlternatives } from '../../ui/keys';
import { M_PER_FT, M_PER_NM } from '../../sim/math';
import type { Units } from '../../app/format';

export type Aspect = 'hot' | 'flank' | 'beam' | 'cold';
export const ASPECTS: Aspect[] = ['hot', 'flank', 'beam', 'cold'];
/** Target aspect as the shooter sees it (0 = nose-on). Brevity: FLANK is 40–70°, BEAM 70–110°. */
export const ASPECT_DEG: Record<Aspect, number> = { hot: 0, flank: 45, beam: 90, cold: 180 };

export const MANEUVERS: TargetManeuver[] = ['none', 'turn-cold', 'beam', 'crank', 'notch-chaff'];

export interface LabSetup {
  missile: MissileId;
  shooterAlt: number;     // m
  shooterMach: number;
  targetAlt: number;      // m
  targetMach: number;
  aspect: Aspect;
  maneuver: TargetManeuver;
  /** Seconds after launch the target starts its manoeuvre. */
  reactAfter: number;
  /** Launch range, m (slant). */
  range: number;
  /** What-if: switch the missile's automatic loft off (lab only; DCS lofts by itself). */
  loftOff?: boolean;
  shooterType?: AircraftId;
  support?: 'perfect' | 'radar';
  phoenixLaunchMode?: PhoenixLaunchMode;
}

/** Slider limits (the DLZ tables cover shooter altitude 0.5–15 km and Mach 0.5–1.5). */
export const LIMITS = {
  altMin: 500, altMax: 15000,
  machMin: 0.5, machMax: 1.5,
  tMachMin: 0.5, tMachMax: 1.6,
  reactMax: 20,
};

// ------------------------------------------------------------------------------------------ jets & missiles

/** The jet that plays the shooter in 3D: yours if it carries the missile, else the first carrier. */
export function shooterTypeFor(ac: AircraftId, missile: MissileId): AircraftId {
  if (AIRCRAFT[ac].missiles.includes(missile)) return ac;
  return AIRCRAFT_ORDER.find(id => AIRCRAFT[id].missiles.includes(missile)) ?? ac;
}

/**
 * The target jet simulateShot flies (its turn and run performance): the sim's own rule for the jet the
 * launch-zone tables were flown against (an eastern missile shoots at an F-15C, a western one at an Su-27).
 */
export function targetTypeFor(missile: MissileId): AircraftId {
  return dlzTargetType(missile);
}

/** Your jet's missiles first, then every other missile for comparison. */
export function missileChoices(ac: AircraftId): { own: MissileId[]; other: MissileId[] } {
  const own = [...AIRCRAFT[ac].missiles];
  const all = Object.keys(MISSILES) as MissileId[];
  const other = all.filter(m => !own.includes(m)).sort((a, b) => MISSILES[a].fox - MISSILES[b].fox || MISSILES[b].ref.highHeadOnKm - MISSILES[a].ref.highHeadOnKm);
  own.sort((a, b) => MISSILES[b].ref.highHeadOnKm - MISSILES[a].ref.highHeadOnKm);
  return { own, other };
}

/** The jet's main BVR missile: the longest-reaching radar missile of its default loadout. */
export function defaultMissile(ac: AircraftId): MissileId {
  const spec = AIRCRAFT[ac];
  const radar = spec.loadout.map(l => l.missile).filter(m => MISSILES[m].seeker !== 'ir');
  const pool = radar.length ? radar : spec.missiles;
  return [...pool].sort((a, b) => MISSILES[b].ref.highHeadOnKm - MISSILES[a].ref.highHeadOnKm)[0] ?? 'aim120c';
}

/** The missile's guidance rule without clauses that name another jet (the AIM-7M's F-15C-only FLOOD note on a Hornet). */
export function guidanceRuleFor(missile: MissileId, ac: AircraftId): string {
  const rule = MISSILES[missile].guidanceRule;
  const others = AIRCRAFT_ORDER.filter(id => id !== ac).map(id => AIRCRAFT[id].short);
  const parts = rule.split(/;\s*/).filter(p => !others.some(n => p.includes(n)));
  const out = (parts.length ? parts : [rule]).join('; ').trim();
  return /[.!?]$/.test(out) ? out : out + '.';
}

export function seekerWord(m: MissileId): string {
  const s = MISSILES[m];
  return s.seeker === 'arh' ? 'active radar' : s.seeker === 'sarh' ? 'semi-active radar' : 'infrared';
}

// ------------------------------------------------------------------------------------------ geometry

/** Launch geometry in sim metres, exactly as simulateShot places it. */
export function geometry(s: LabSetup): { shooterPos: Vector3; shooterVel: Vector3; targetPos: Vector3; targetVel: Vector3 } {
  const sAlt = Math.max(0, s.shooterAlt), tAlt = Math.max(0, s.targetAlt);
  const vS = speedFromMach(s.shooterMach, sAlt), vT = speedFromMach(s.targetMach, tAlt);
  const dh = tAlt - sAlt;
  const horiz = Math.sqrt(Math.max(1, s.range * s.range - dh * dh));
  const shooterPos = new Vector3(0, sAlt, 0);
  const targetPos = new Vector3(0, tAlt, -horiz);
  const shooterVel = targetPos.clone().sub(shooterPos).setLength(vS);
  const h = Math.PI + ASPECT_DEG[s.aspect] * Math.PI / 180;
  const targetVel = new Vector3(Math.sin(h), 0, -Math.cos(h)).multiplyScalar(vT);
  return { shooterPos, shooterVel, targetPos, targetVel };
}

/** The game's launch zone (table lookup) for this setup. */
export function dlzAt(s: LabSetup): Dlz {
  const g = geometry(s);
  return dlzFor(g.shooterPos, g.shooterVel, g.targetPos, g.targetVel, s.missile);
}

export function toShotSetup(s: LabSetup, seed = 1): ShotSetup {
  return {
    missile: s.missile, shooterAlt: s.shooterAlt, shooterMach: s.shooterMach, targetAlt: s.targetAlt,
    targetMach: s.targetMach, range: s.range, aspectDeg: ASPECT_DEG[s.aspect], maneuver: s.maneuver,
    reactAfter: s.reactAfter, seed, shooterType: s.shooterType, support: s.support, phoenixLaunchMode: s.phoenixLaunchMode, targetType: targetTypeFor(s.missile),
    // the lab's what-if: fly a lofting missile flat (sim/dlz's official per-shot switch)
    ...(s.loftOff && MISSILES[s.missile].lofts ? { loft: false } : {}),
  };
}

/**
 * How hard the missile can still pull at a given speed and altitude (g), from the game model's turn cap:
 * full g down to a dynamic-pressure threshold, proportionally less below it.
 */
export function turnCapG(missile: MissileId, mach: number, altM: number): number {
  const mm = missileModel(missile);
  const v = speedFromMach(mach, Math.max(0, altM));
  return mm.maxG * Math.min(1, (sigma(Math.max(0, altM)) * v * v) / mm.fullGSigmaV2);
}

// ------------------------------------------------------------------------------------------ units

export const rangeToUser = (m: number, u: Units) => (u === 'metric' ? m / 1000 : m / M_PER_NM);
export const rangeFromUser = (v: number, u: Units) => (u === 'metric' ? v * 1000 : v * M_PER_NM);
export const rangeUnit = (u: Units) => (u === 'metric' ? 'km' : 'nm');
/** Altitude slider value: km (metric) or thousands of feet (imperial). */
export const altToUser = (m: number, u: Units) => (u === 'metric' ? m / 1000 : m / M_PER_FT / 1000);
export const altFromUser = (v: number, u: Units) => (u === 'metric' ? v * 1000 : v * 1000 * M_PER_FT);

export function fmtR(m: number, u: Units, dp?: number): string {
  const v = rangeToUser(m, u);
  const d = dp ?? (v < 10 ? 1 : 0);
  return v.toFixed(d) + ' ' + rangeUnit(u);
}
export function fmtAltU(m: number, u: Units): string {
  if (u === 'metric') return (m >= 1000 ? (m / 1000).toFixed(m % 1000 === 0 ? 0 : 1) + ' km' : Math.round(m) + ' m');
  return (Math.round(m / M_PER_FT / 100) * 100).toFixed(0) + ' ft';
}
export function fmtDist(m: number, u: Units): string {
  if (m >= 2000) return fmtR(m, u, 1);
  return u === 'metric' ? Math.round(m) + ' m' : Math.round(m / M_PER_FT).toFixed(0) + ' ft';
}

// ------------------------------------------------------------------------------------------ cue names

export interface CueNames {
  rmax: string;
  rne: string;
  rmin: string;
  /** Shoot cue as the cockpit shows it. */
  cue: string;
  /** FC3 Russian: ПР (and the auto-lock) only inside this fraction of Rmax. */
  prFraction: number | null;
  /** The shoot cue lights only inside Rne (JF-17 SHOOT inside the NEZ, M-2000C TIR). */
  cueInsideRne: boolean;
  /** The cue is this trainer's label, not a verified cockpit cue: say "past the Rmax mark", not "no cue". */
  cueSimplified: boolean;
  /** Where the cues live in this cockpit, one line each. */
  lines: string[];
}

/** The jet's own words for the launch-zone marks (research: bvr-mechanics, f15c-fc3, ru-fc3, hornet-viper, tomcat-thunder-mirage). */
export function cueNames(ac: AircraftId, missile: MissileId): CueNames {
  const spec = AIRCRAFT[ac];
  const base = { prFraction: null, cueInsideRne: false, cueSimplified: false };
  switch (ac) {
    case 'su27': case 'su33': case 'j11a': case 'mig29s': {
      const f = spec.radar.tws?.autoSttAtRmaxFraction ?? 0.85;
      return {
        ...base, rmax: 'Rmax', rne: 'Rtr', rmin: 'Rmin', cue: 'ПР', prFraction: f,
        lines: [
          'HUD range scale on the left, three thick ticks: Rmax on top, Rtr (the no-escape range) in the middle, Rmin at the bottom. The caret is the target range.',
          `ПР (launch authorised) lights only inside ${Math.round(f * 100)} % of Rmax, and in СНП the radar locks by itself there. Hold Space at least 1 s to fire.`,
        ],
      };
    }
    case 'f15c': {
      const sk = MISSILES[missile].seeker;
      return {
        ...base, rmax: 'Rpi', rne: 'Rtr', rmin: 'Rmin', cue: sk === 'sarh' ? 'flashing ▲' : sk === 'arh' ? 'flashing ★' : 'shoot',
        cueSimplified: sk === 'ir',
        lines: [
          'HUD and VSD scale on the right: Raero triangle on top, then Rpi (target keeps flying), Rtr (turn and run), Rmin. There is no SHOOT text.',
          'Shoot cue: a flashing star (AIM-120) or a flashing triangle (AIM-7) under the TD box, in range with the steering dot in the ASE circle. The manual says shoot inside Rtr.',
        ],
      };
    }
    case 'fa18c':
      return {
        ...base, rmax: 'RMAX', rne: 'RNE', rmin: 'RMIN', cue: 'SHOOT',
        lines: [
          'HUD NIRD circle and DDI range scale: RMIN, RNE, RMAX, and the RAERO diamond outside (the missile can still pull 5 g).',
          'SHOOT above the TD box is steady inside RMAX and flashes inside RNE. After launch "xx ACT" counts to active, then "xx TTG".',
        ],
      };
    case 'f16c':
      return {
        ...base, rmax: 'RPI', rne: 'RTR', rmin: 'RMIN', cue: 'launch available', cueSimplified: true,
        lines: [
          'HUD and FCR scale: RAERO (40° loft), ROPT (20° loft), RPI (target keeps flying), RTR (turn and run), RMIN.',
          'In DCS, place the ASC inside the ASEC at or below RPI; there is no SHOOT text. RTR down to RMIN is the manoeuvre zone. After launch A nn counts to active, then T nn to impact.',
        ],
      };
    case 'f14b':
      return {
        ...base, rmax: 'Rmax', rne: 'Rne', rmin: 'Rmin', cue: 'launch available', cueSimplified: true,
        lines: [
          'Pilot HUD scale shows Rmax and Rmin. The TID launch-zone vector has TUMR / TUOR / TUIR ticks (time to minimum, optimum, in range).',
          'Heatblur computes its own Phoenix zone. Rne here is a trainer estimate. The classic TID uses launch-zone vectors and optimum-range blinking, not an IN RNG text cue. About 3 s from trigger to missile away.',
        ],
      };
    case 'jf17':
      return {
        ...base, rmax: 'RMAX', rne: 'NEZ', rmin: 'RMIN', cue: 'SHOOT', cueInsideRne: true,
        lines: [
          'Radar page scale: Weapon Max Range, the No Escape Zone (green bar), Weapon Min Range.',
          'HUD arrows round the TD box: ">" inside max range, "^" inside the NEZ. SHOOT shows only inside the NEZ. After launch TOF becomes TOA.',
        ],
      };
    case 'm2000c':
      return {
        ...base, rmax: 'Rmax', rne: 'Rne', rmin: 'Rmin', cue: 'TIR', cueInsideRne: true,
        lines: [
          'HUD scale: two long-limit marks (the thick one is against a target that does not manoeuvre) and a short-limit mark. A doubled director circle means you are inside the long limit.',
          'TIR (fire) appears only inside the most restrictive domain; this trainer takes that as its Rne. Hold the trigger (Space) at least 2 s for the 530.',
        ],
      };
  }
}

// ------------------------------------------------------------------------------------------ keys

/** First bindable chord in a known keyboard default. */
function bindableKey(keys: string | null): string | null {
  if (!keys) return null;
  for (const alt of splitAlternatives(keys)) if (parseKeyList(alt).length === 1) return alt.trim();
  return null;
}

/** The jet's missile launch key (keyboard default), or null when research has none. */
export function launchKey(ac: AircraftId): string | null {
  const b = PROCEDURES[ac].binds.find(x => /^launch/i.test(x.action));
  return b ? bindableKey(b.keyboard) : null;
}

/** The jet's weapon-step key (FC3 "Weapon Change", Viper missile step), or null. */
export function weaponStepKey(ac: AircraftId): string | null {
  const b = PROCEDURES[ac].binds.find(x => /weapon cycle|missile step/i.test(x.action));
  return b ? bindableKey(b.keyboard) : null;
}

// ------------------------------------------------------------------------------------------ presets

export type PresetId = 'high-fast' | 'hot-cold' | 'rmax-cold' | 'rne' | 'loft';
export const PRESET_IDS: PresetId[] = ['high-fast', 'hot-cold', 'rmax-cold', 'rne', 'loft'];

export interface PresetShot { name: string; setup: LabSetup }
export interface Preset { id: PresetId; title: string; shots: PresetShot[]; note?: string }

export const PRESET_TITLES: Record<PresetId, string> = {
  'high-fast': 'High and fast vs low and slow',
  'hot-cold': 'Hot vs cold target',
  'rmax-cold': 'Rmax shot, target turns cold',
  rne: 'Rne shot',
  loft: 'Loft on / off',
};

/** Preset title in the jet's own words (Rtr shot on a Flanker, NEZ shot on the JF-17...). */
export function presetTitle(id: PresetId, c: Pick<CueNames, 'rmax' | 'rne'>): string {
  if (id === 'rmax-cold') return `${c.rmax} shot, target turns cold`;
  if (id === 'rne') return `${c.rne} shot`;
  return PRESET_TITLES[id];
}

/** Round a range to a whole km or nm (so readouts stay clean). */
export function roundRange(m: number, u: Units): number {
  const v = rangeToUser(m, u);
  const step = v < 12 ? 0.5 : 1;
  return rangeFromUser(Math.max(step, Math.round(v / step) * step), u);
}

/** A missile of this jet that lofts in DCS, or null. */
export function loftingMissileOf(ac: AircraftId): MissileId | null {
  return AIRCRAFT[ac].missiles.find(m => MISSILES[m].lofts) ?? null;
}

/** Build a preset's shots from the current setup (missile, and for some presets the shooter state). */
export function buildPreset(id: PresetId, base: LabSetup, ac: AircraftId, u: Units): Preset {
  const std: LabSetup = {
    ...base, loftOff: false, maneuver: 'none', reactAfter: base.reactAfter,
  };
  const c = cueNames(ac, base.missile);
  const title = presetTitle(id, c);
  switch (id) {
    case 'high-fast': {
      const HI = u === 'metric' ? 12000 : altFromUser(40, u), LO = u === 'metric' ? 3000 : altFromUser(10, u);
      const hi: LabSetup = { ...std, shooterAlt: HI, shooterMach: 1.2, targetAlt: HI, targetMach: 0.9, aspect: 'hot' };
      const lo: LabSetup = { ...std, shooterAlt: LO, shooterMach: 0.7, targetAlt: LO, targetMach: 0.9, aspect: 'hot' };
      const rHi = dlzAt({ ...hi, range: 40000 }).rmax, rLo = dlzAt({ ...lo, range: 30000 }).rmax;
      let r = 0.8 * rHi;
      if (r < 1.15 * rLo) r = 0.92 * rHi;
      r = roundRange(r, u);
      return { id, title, shots: [
        { name: `${fmtAltU(HI, u)} M1.2`, setup: { ...hi, range: r } },
        { name: `${fmtAltU(LO, u)} M0.7`, setup: { ...lo, range: r } },
      ] };
    }
    case 'hot-cold': {
      const hot: LabSetup = { ...std, aspect: 'hot' };
      const rHot = dlzAt({ ...hot, range: 40000 }).rmax;
      const r = roundRange(0.75 * rHot, u);
      return { id, title, shots: [
        { name: 'Hot target', setup: { ...hot, range: r } },
        { name: 'Cold target', setup: { ...std, aspect: 'cold', range: r } },
      ] };
    }
    case 'rmax-cold': {
      const hot: LabSetup = { ...std, aspect: 'hot' };
      const z = dlzAt({ ...hot, range: 40000 });
      const r = roundRange(0.95 * dlzAt({ ...hot, range: z.rmax }).rmax, u);
      const react = Math.max(1, Math.min(6, base.reactAfter || 3));
      return { id, title, shots: [
        { name: `${c.rmax}, he flies on`, setup: { ...hot, range: r } },
        { name: `${c.rmax}, cold after ${react} s`, setup: { ...hot, range: r, maneuver: 'turn-cold', reactAfter: react } },
      ] };
    }
    case 'rne': {
      const hot: LabSetup = { ...std, aspect: 'hot' };
      const z = dlzAt({ ...hot, range: 30000 });
      const r = roundRange(0.9 * dlzAt({ ...hot, range: z.rne }).rne, u);
      return { id, title, shots: [
        { name: `${c.rne}, cold at launch`, setup: { ...hot, range: r, maneuver: 'turn-cold', reactAfter: 0 } },
      ] };
    }
    case 'loft': {
      const own = MISSILES[base.missile].lofts ? base.missile : loftingMissileOf(ac);
      const missile: MissileId = own ?? 'aim120c';
      const A = u === 'metric' ? 10000 : altFromUser(33, u);
      const hot: LabSetup = { ...std, missile, aspect: 'hot', shooterAlt: A, shooterMach: 0.9, targetAlt: A, targetMach: 0.9 };
      const z = dlzAt({ ...hot, range: 60000 });
      const r = roundRange(0.9 * dlzAt({ ...hot, range: z.rmax }).rmax, u);
      const note = own ? undefined : `None of the ${AIRCRAFT[ac].short}'s missiles loft in DCS, so this uses the ${MISSILES[missile].name}.`;
      return { id, title, note, shots: [
        { name: 'Loft (as DCS flies it)', setup: { ...hot, range: r, loftOff: false } },
        { name: 'Loft off (what-if)', setup: { ...hot, range: r, loftOff: true } },
      ] };
    }
  }
}

/** Default setup for a jet: its main missile, cruise-ish altitude, co-altitude hot target at 80 % Rmax. */
export function defaultSetup(ac: AircraftId, u: Units, missile = defaultMissile(ac)): LabSetup {
  const alt = u === 'metric' ? 9000 : altFromUser(30, u);
  const s: LabSetup = {
    missile, shooterType: shooterTypeFor(ac, missile), shooterAlt: alt, shooterMach: 0.9, targetAlt: alt, targetMach: 0.9, aspect: 'hot',
    maneuver: 'none', reactAfter: 3, range: 40000,
  };
  const r = dlzAt(s).rmax;
  s.range = roundRange(0.8 * dlzAt({ ...s, range: r }).rmax, u);
  return s;
}

/** Where the launch range sits in the zone. */
export type ZonePlace = 'inside-rmin' | 'nez' | 'rne-rmax' | 'beyond-rmax';
export function zonePlace(range: number, d: Dlz): ZonePlace {
  if (range < d.rmin) return 'inside-rmin';
  if (range <= d.rne) return 'nez';
  if (range <= d.rmax) return 'rne-rmax';
  return 'beyond-rmax';
}

/** Slider maximum for the launch range: comfortably past Rmax, in whole user units. */
export function rangeSliderMax(d: Dlz, u: Units): number {
  const v = rangeToUser(Math.max(d.rmax * 1.35, 15000), u);
  const step = v > 60 ? 10 : 5;
  return Math.ceil(v / step) * step;
}

// ------------------------------------------------------------------------------------------ flying

/**
 * Fly one shot with the game model (sim/dlz simulateShot). `loftOff` is a lab what-if, passed to the sim
 * as ShotSetup.loft = false for this one flight.
 */
export function flyShot(s: LabSetup, seed = 1): ShotResult {
  return simulateShot(toShotSetup(s, seed));
}
