/**
 * [OWNER: data] Close-combat (WVR) facts for the ten fighters: gun sights, keys, gun ranges and round counts as the
 * DCS manuals give them to the player (docs/research/wvr-guns-bfm.md), plus a gameplay-level turn table for the
 * BFM mode of the flight model. Distances in metres (the manual's own unit is in `note`).
 *
 * Keyed by an explicit union of the ten fighters, not AircraftId: a jet without an entry has no gun in the sim and
 * flies BFM on a turn table derived from its perf block.
 * Every turn number is a trainer estimate (simplified, not verified). Gun values not taken from a manual are
 * `verified: false` and listed in WVR_CAVEATS and docs/api/data.md ("Uncertain values", "Guns and BFM").
 */
import type { Sourced } from '../sim/flightOps/types';

/** The ten fighters that carry gun and turn data. Deliberately not AircraftId (new ids opt in explicitly). */
export type GunJetId =
  | 'su27' | 'su33' | 'j11a' | 'mig29s'
  | 'f15c' | 'fa18c' | 'f16c' | 'f14b' | 'jf17' | 'm2000c';

export const GUN_JET_IDS: readonly GunJetId[] = ['su27', 'su33', 'j11a', 'mig29s', 'f15c', 'fa18c', 'f16c', 'f14b', 'jf17', 'm2000c'];

/**
 * HUD gun sight families (the HUD agent draws one per kind):
 * - 'funnel': FC3 Russian no-lock funnel sized by target span; 'lcos': lead-computing pipper from own turn rate;
 * - 'hornet-funnel' / 'hornet-director': F/A-18C radar-not-tracking funnel / tracking director reticle with range arc;
 * - 'eegs-funnel' / 'eegs-pipper': F-16C EEGS Level II funnel / Level V pipper;
 * - 'rtgs' / 'rtgs-track': F-14 real-time gun sight no-track pipper + diamond / STT bullet-at-range;
 * - 'range-reticle': F-15C locked reticle with range cue; 'ss' / 'sslc': JF-17 snapshot sight / snapshot + LCOS;
 * - 'cclt': M-2000C tracer line (Continuously Computed Lead Tracer).
 */
export type GunSightKind =
  | 'funnel' | 'lcos' | 'hornet-funnel' | 'hornet-director' | 'eegs-funnel' | 'eegs-pipper'
  | 'rtgs' | 'rtgs-track' | 'range-reticle' | 'ss' | 'sslc' | 'cclt';

export interface GunSpec {
  /** Gun name as the manual gives it. */
  gun: string;
  /** Calibre (mm), shown to the pilot; the arcade damage rule is the same for every gun. */
  calibreMm: number;
  rounds: Sourced<number>;
  /** Rate of fire (rounds per minute) the sim uses; HI where the pilot can select it. */
  rateRpm: Sourced<number>;
  /** LO rate where selectable. */
  rateLoRpm?: Sourced<number>;
  sight: { noLock: Sourced<GunSightKind>; lock: Sourced<GunSightKind>; other?: Sourced<GunSightKind[]> };
  /** Longest range the sight shows a solution or in-range cue (m). No hits are scored beyond it. */
  maxRangeM: Sourced<number>;
  /** Near and far ranges drawn by the no-lock funnel or pipper marks (m). */
  funnelM: Sourced<[number, number]>;
  /** Default target wingspan the funnel is sized for (m). */
  wingspanM: Sourced<number>;
  keys: { select: Sourced<string>; fire: Sourced<string>; span?: Sourced<string> };
  /** Burst limiter settings (s), JF-17 only. */
  burstLimitS?: Sourced<number[]>;
  /** Pilot-facing notes: cues, radar modes that come with the gun. */
  notes: string[];
}

/** Sustained turn at full afterburner: load factor at which specific excess power is zero. */
export interface TurnPerf {
  /** The two table altitudes (ft) and the Mach grid. */
  altFt: [number, number];
  mach: number[];
  /** Sustained g at each Mach, low altitude then high altitude. */
  sustainedG: [number[], number[]];
  verified: false;
  note: string;
}

const ok = <T>(value: T, source: string, note?: string): Sourced<T> => ({ value, source, verified: true, note });
const nv = <T>(value: T, source: string, note?: string): Sourced<T> => ({ value, source, verified: false, note });

const FT = 0.3048;
const ft = (x: number) => Math.round(x * FT);

const SU27 = 'ED Su-27 Flaming Cliffs 3 manual, Gun Employment (p. 63–64)';
const MIG29 = 'ED MiG-29 Flight Manual, Gun Employment (p. 58)';
const RU_KEYS = 'docs/research/ru-fc3.md, key table';
const EAGLE = 'ED F-15C Flaming Cliffs 3 manual, Gunnery Modes (p. 49) and AUTO GUNS (p. 72)';
const EAGLE_KEYS = 'docs/research/f15c-fc3.md, key table';
const HORNET = 'ED F/A-18C Early Access Guide, M61A1 Gun A/A mode (p. 262–266)';
const HORNET_KEYS = 'docs/research/hornet-viper.md, Hornet key table';
const VIPER = 'ED F-16C Early Access Guide, EEGS (primary text not reached; community summary)';
const TOMCAT = 'Heatblur DCS F-14 manual, M61A1 Vulcan';
const THUNDER = "Chuck's Guides, DCS JF-17 Thunder, 3.3 GSH-23-2 Cannon (Air-to-Air)";
const MIRAGE = "Chuck's Guides, DCS M-2000C, 2.3 Air-to-Air Guns Tutorial";
const TRAINER = 'Trainer estimate';

function fc3Ru(src: string, verified: boolean, note: string): GunSpec {
  const sv = <T>(value: T, n?: string): Sourced<T> => ({ value, source: src, verified, note: n ? `${n} ${note}`.trim() : note || undefined });
  return {
    gun: 'GSh-30-1',
    calibreMm: 30,
    rounds: sv(150),
    rateRpm: ok(1500, MIG29, 'GSh-30-1, 1500 rounds per minute (MiG-29 manual).'),
    sight: {
      noLock: sv('funnel', 'No lock: gun funnel sized by the target span.'),
      lock: sv('lcos', 'Locked target: lead-computing sight with range.'),
    },
    maxRangeM: sv(1200, 'Aiming crosshair appears inside 1200 m.'),
    funnelM: nv([200, 1200], TRAINER, 'Funnel near end not given; 200 m trainer pick.'),
    wingspanM: sv(20, 'Default Target Size 20 m, set with RAlt+- / RAlt+=.'),
    keys: {
      select: ok('C', RU_KEYS, '"Cannon".'),
      fire: ok('Space', RU_KEYS, '"Weapon Fire".'),
      span: ok('RAlt+= / RAlt+-', RU_KEYS, '"Target Specified Size Increase/Decrease".'),
    },
    notes: ['C selects the cannon and the close-combat radar modes.'],
  };
}

export const GUNS: Record<GunJetId, GunSpec> = {
  su27: fc3Ru(SU27, true, ''),
  su33: fc3Ru(SU27, false, 'Su-27 manual text; the Su-33 manual was not checked for guns.'),
  j11a: fc3Ru(SU27, false, 'Su-27 manual text; no J-11A-specific gun text.'),
  mig29s: fc3Ru(MIG29, true, 'MiG-29 manual (generic MiG-29, same text as the Su-27).'),
  f15c: {
    gun: 'M61A1',
    calibreMm: 20,
    rounds: ok(940, EAGLE, '940 rounds shown on the HUD.'),
    rateRpm: nv(6000, TRAINER, 'Rate not given in the FC3 manual.'),
    sight: {
      noLock: ok('lcos', EAGLE, 'No lock: gun cross and lead-computing pipper.'),
      lock: ok('range-reticle', EAGLE, 'Locked: reticle with a range cue around the pipper.'),
    },
    maxRangeM: nv(ft(4000), TRAINER, 'Gun range not given; 4000 ft trainer pick.'),
    funnelM: nv([ft(1000), ft(4000)], TRAINER),
    wingspanM: nv(13, TRAINER),
    keys: { select: ok('C', EAGLE_KEYS, '"Cannon"; also enters Auto Guns (AACQ 60° × 20°, lock within 10 nm).'), fire: ok('Space', EAGLE_KEYS, '"Weapon Fire".') },
    notes: ['Cannon (C) brings up Auto Guns: 60° wide × 20° tall scan around the gun reticle, locks the first target within 10 nm.'],
  },
  fa18c: {
    gun: 'M61A1',
    calibreMm: 20,
    rounds: ok(578, HORNET),
    rateRpm: ok(6000, HORNET, 'HI rate.'),
    rateLoRpm: ok(4000, HORNET, 'LO rate.'),
    sight: {
      noLock: ok('hornet-funnel', HORNET, 'Radar not tracking: funnel to 2000 ft with 1000 / 2000 ft cues, wingspan 40 ft (WSPN).'),
      lock: ok('hornet-director', HORNET, 'Radar tracking: director reticle with range arc; SHOOT when predicted miss < 20 ft (off above 30 ft).'),
    },
    maxRangeM: nv(ft(4000), HORNET, 'The guide gives the lesser of 1.5 s time of flight or a minimum impact velocity (verified); the 4000 ft number is a trainer pick.'),
    funnelM: ok([ft(1000), ft(2000)], HORNET),
    wingspanM: ok(ft(40), HORNET, 'Adjustable wingspan, default 40 ft (the fixed stadia are sized for 25 ft).'),
    keys: { select: ok('LShift+X', HORNET_KEYS, '"Select Gun" (Weapon Select Aft), enters GACQ.'), fire: ok('Space', HORNET_KEYS, '"Trigger".') },
    notes: ['Gun select gives GACQ: 20° dashed HUD circle, 5 nm.'],
  },
  f16c: {
    gun: 'M61A1',
    calibreMm: 20,
    rounds: nv(510, VIPER),
    rateRpm: nv(6000, TRAINER),
    sight: {
      noLock: nv('eegs-funnel', VIPER, 'EEGS Level II funnel: fire when the wingtips touch the funnel; top about 600 ft (community summary), bottom 2500–3000 ft not verified.'),
      lock: nv('eegs-pipper', VIPER, 'EEGS Level V: pipper at target range once locked.'),
    },
    maxRangeM: nv(ft(3000), VIPER),
    funnelM: nv([ft(600), ft(3000)], VIPER),
    wingspanM: nv(ft(33), VIPER, 'Default wingspan 33 ft.'),
    keys: { select: nv('3', 'docs/research/hornet-viper.md, Viper key table', 'DOGFIGHT outboard; gun is its default weapon. Trigger has no default key found.'), fire: nv('Space', TRAINER, 'No default key found; trainer key.') },
    notes: ['DOGFIGHT outboard enters ACM 30 × 20 in NO RAD with the gun selected.'],
  },
  f14b: {
    gun: 'M61A1',
    calibreMm: 20,
    rounds: ok(676, TOMCAT),
    rateRpm: ok(6000, TOMCAT, 'HI rate.'),
    rateLoRpm: ok(4000, TOMCAT, 'LO rate.'),
    sight: {
      noLock: ok('rtgs', TOMCAT, 'No track: bullets at 1000 ft (pipper) and 2000 ft (diamond).'),
      lock: ok('rtgs-track', TOMCAT, 'STT: pipper shows the bullets at target range out to 4000 ft.'),
    },
    maxRangeM: ok(ft(4000), TOMCAT),
    funnelM: ok([ft(1000), ft(2000)], TOMCAT),
    wingspanM: nv(13, TRAINER),
    keys: { select: nv('Weapon selector GUN', TOMCAT, 'HOTAS weapon selector; no single default key verified.'), fire: nv('Space', TRAINER, 'Trainer key.') },
    notes: ['The pilot fires the gun; the ACM lock modes (PLM, PAL, VSL) are the pilot\'s.'],
  },
  jf17: {
    gun: 'GSh-23-2',
    calibreMm: 23,
    rounds: ok(180, THUNDER),
    rateRpm: nv(3000, TRAINER),
    sight: {
      noLock: ok('ss', THUNDER, 'SS snapshot sight.'),
      lock: ok('lcos', THUNDER, 'LCOS with a locked target.'),
      other: ok(['sslc'], THUNDER, 'SSLC combines snapshot and LCOS.'),
    },
    maxRangeM: nv(ft(4000), TRAINER),
    funnelM: nv([ft(1000), ft(4000)], TRAINER),
    wingspanM: nv(13, TRAINER),
    keys: { select: nv('Gun', THUNDER, 'Selected from the SMS / HOTAS; no default key verified.'), fire: nv('Space', TRAINER, 'Trainer key.') },
    burstLimitS: nv([0.2, 0.5], THUNDER, 'The guide shows a 0.5 s limiter; the 0.2 s setting was not found.'),
    notes: [],
  },
  m2000c: {
    gun: 'DEFA 554 (×2)',
    calibreMm: 30,
    rounds: ok(250, MIRAGE, '2 × 125 rounds.'),
    rateRpm: nv(2400, TRAINER, 'Two guns together.'),
    sight: {
      noLock: ok('cclt', MIRAGE, 'CCLT tracer line to 1000 m with wingspan marks at 300 m and 600 m.'),
      lock: ok('cclt', MIRAGE, 'With a radar lock a distance meter appears inside 1200 m.'),
    },
    maxRangeM: ok(1200, MIRAGE, 'Target distance meter inside 1200 m.'),
    funnelM: ok([300, 1000], MIRAGE, 'Wingspan marks at 300 m and 600 m; the tracer line runs to 1000 m.'),
    wingspanM: nv(13, TRAINER),
    keys: { select: nv('Gun', MIRAGE, 'Selected on the weapon panel / HOTAS; no default key verified.'), fire: nv('Space', TRAINER, 'Trainer key.') },
    notes: [],
  },
};

/** Mach grid and a shared sustained-g shape (peak = 1) for the trainer turn tables. */
const MACH = [0.3, 0.5, 0.7, 0.9, 1.1, 1.4];
const SHAPE = [0.35, 0.72, 0.95, 1.0, 0.85, 0.65];
const r1 = (x: number) => Math.round(x * 10) / 10;

function turn(peakLow: number, peakHigh: number): TurnPerf {
  return {
    altFt: [5000, 20000],
    mach: MACH,
    sustainedG: [SHAPE.map(s => r1(Math.max(1.2, s * peakLow))), SHAPE.map(s => r1(Math.max(1.1, s * peakHigh)))],
    verified: false,
    note: 'Trainer estimate: a shared shape scaled per jet. Simplified, not verified against DCS.',
  };
}

/** Sustained-g tables at full afterburner (5000 ft and 20000 ft). Simplified, not verified. */
export const TURN_PERF: Record<GunJetId, TurnPerf> = {
  su27: turn(8.0, 5.2),
  su33: turn(7.5, 5.0),
  j11a: turn(8.0, 5.2),
  mig29s: turn(8.0, 5.3),
  f15c: turn(7.8, 5.3),
  fa18c: turn(6.5, 4.3),
  f16c: turn(8.5, 5.5),
  f14b: turn(6.5, 4.5),
  jf17: turn(7.0, 4.6),
  m2000c: turn(7.5, 5.0),
};

/** Gun data for any aircraft id; null when the jet has no gun data. */
export function gunSpecFor(type: string): GunSpec | null {
  return (GUNS as Partial<Record<string, GunSpec>>)[type] ?? null;
}

/** Turn table for any aircraft id; null when the jet has none (the flight model derives one from perf). */
export function turnPerfFor(type: string): TurnPerf | null {
  return (TURN_PERF as Partial<Record<string, TurnPerf>>)[type] ?? null;
}

/** Sustained g from a table at a Mach and altitude (linear in both, clamped Mach, altitude extrapolated, ≥ 1). */
export function sustainedG(tp: TurnPerf, mach: number, altFt: number): number {
  const m = Math.min(tp.mach[tp.mach.length - 1]!, Math.max(tp.mach[0]!, mach));
  let i = 1;
  while (i < tp.mach.length - 1 && m > tp.mach[i]!) i++;
  const f = (m - tp.mach[i - 1]!) / (tp.mach[i]! - tp.mach[i - 1]!);
  const at = (row: number[]) => row[i - 1]! + f * (row[i]! - row[i - 1]!);
  const lo = at(tp.sustainedG[0]), hi = at(tp.sustainedG[1]);
  const a = Math.max(0, (altFt - tp.altFt[0]) / (tp.altFt[1] - tp.altFt[0]));
  return Math.max(1, lo + a * (hi - lo));
}

/** Every simplified or unverified close-combat value, in pilot words. */
export const WVR_CAVEATS: string[] = [
  'Turn performance (sustained g at 5000 ft and 20000 ft) is a trainer estimate: simplified, not verified against DCS.',
  'Gun hits are an arcade rule: time with the gun line on the lead point inside max range. A kill takes about 2 s of fire in the solution at 600 m, less closer, more at long range: a trainer gameplay target, not DCS damage. No ballistics.',
  'Rates of fire not given in the manuals are trainer picks (F-15C and F-16C M61 6000, GSh-23 3000, DEFA 2 × 1200 rounds per minute). GSh-30-1 1500 comes from the MiG-29 manual.',
  'Gun ranges not given in the manuals (F-15C, F/A-18C, JF-17) use 4000 ft; default wingspans not given use 13 m. The FC3 funnel near end (200 m) is a trainer pick.',
  'Su-33 and J-11A gun sights use the Su-27 manual text; the MiG-29 manual text is for the generic MiG-29.',
  'F-16C gun facts (EEGS funnel ranges, 33 ft wingspan, 510 rounds) are not verified: the ED guide was not reached.',
  'JF-17 burst limiter 0.2 s setting not found (0.5 s is in the guide).',
  'F-16C, F-14B, JF-17 and M-2000C gun trigger keys are trainer keys; no DCS default was verified.',
];
