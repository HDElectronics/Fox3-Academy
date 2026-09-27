/**
 * [OWNER: data] Jamming as DCS presents it to the player (issue #12): the one kind of jamming DCS models (it hides
 * range and leaves the bearing), the range at which each radar gets range back (burn-through), the missiles that
 * can be fired at a jammer without range (home-on-jam), the player's own jammer and the jam cue per radar.
 * Game level only (AGENTS.md rule 1): symbols, keys and in-game ranges, never jammer or radar internals.
 *
 * Research: docs/research/ecm-datalink-iff.md. `verified: true` only where an ED or Heatblur manual gives the fact;
 * community and trainer values are listed in ECM_CAVEATS and labelled in the UI.
 */
import type { FighterId, MissileId } from './types';

export interface EcmFact<T> { value: T; verified: boolean; source: string; note?: string }

const NM = 1852;

/** Range (m) inside which the radar measures range on a jammer again. Outside it the jammer is a strobe. */
export const BURN_THROUGH_M: Record<FighterId, EcmFact<number>> = {
  f15c: { value: 19 * NM, verified: true, source: 'ED F-15C manual pp. 70–71: 15–23 nm', note: 'Middle of the manual range' },
  su27: { value: 25_000, verified: true, source: 'ED Su-27 manual pp. 57–59: under 25 km' },
  su33: { value: 25_000, verified: false, source: 'Su-27 value, same family', note: 'simplified' },
  j11a: { value: 25_000, verified: false, source: 'Su-27 value, same family', note: 'simplified' },
  mig29s: { value: 25_000, verified: false, source: 'Su-27 value, same FC3 family', note: 'simplified' },
  f16c: { value: 25 * NM, verified: false, source: 'ED video (Stormbirds summary): about 25 nm', note: 'community' },
  f14b: { value: 26 * NM, verified: false, source: 'FlyAndWire test: 23–29 nm', note: 'community' },
  m2000c: { value: 22 * NM, verified: false, source: "Chuck's M-2000C guide: 20–25 nm", note: 'community' },
  fa18c: { value: 20 * NM, verified: false, source: 'No figure found; DCS values cluster at 13–29 nm', note: 'simplified' },
  jf17: { value: 20 * NM, verified: false, source: 'No figure found; DCS values cluster at 13–29 nm', note: 'simplified' },
};

/**
 * How far (as a multiple of the radar's head-on detection range) a jammer shows as a strobe. DCS shows jammers
 * well beyond detection range (the F-14 TID marks them at 50 nm); one factor for every radar. Trainer value.
 */
export const STROBE_RANGE_FACTOR = 1.75;

/** Missiles that can be fired from a jam (angle-only) lock and home on the jammer. */
export const HOJ_MISSILES: Partial<Record<MissileId, EcmFact<true>>> = {
  aim120b: { value: true, verified: true, source: 'ED F-15C manual p. 70' },
  aim120c: { value: true, verified: true, source: 'ED F-15C manual p. 70' },
  aim7m: { value: true, verified: true, source: 'ED F-15C manual p. 70; Hornet guide: AIM-7 without STT in HOJ' },
  r27r: { value: true, verified: true, source: 'ED Su-27 manual pp. 57–59: R-27R/ER home on the jam' },
  r27er: { value: true, verified: true, source: 'ED Su-27 manual pp. 57–59: R-27R/ER home on the jam' },
  aim54a: { value: true, verified: true, source: 'Heatblur F-14 manual, ECM: JAT lock' },
  aim54c: { value: true, verified: true, source: 'Heatblur F-14 manual, ECM: JAT lock' },
};

/** Can this missile be fired at a jammer from an angle-only lock? */
export const isHojMissile = (id: MissileId): boolean => !!HOJ_MISSILES[id];

/** The player's own self-protection jammer. `key` is the DCS default; `trainerKey` marks a trainer key. */
export interface OwnJammer {
  name: string;
  key: string;
  trainerKey: boolean;
  /** How the cockpit shows it on, as the manual names it. */
  cue: string;
  verified: boolean;
  source: string;
  note?: string;
}

export const OWN_JAMMER: Record<FighterId, OwnJammer | null> = {
  f15c: { name: 'ALQ-135', key: 'E', trainerKey: false, cue: 'ECM light', verified: true, source: 'ED F-15C manual, ECM' },
  su27: { name: 'Sorbtsiya wingtip pods', key: 'E', trainerKey: false, cue: 'ECM lamp, right panel (blinks while warming up, then steady)', verified: true, source: 'ED Su-27 manual p. 68' },
  su33: { name: 'Sorbtsiya wingtip pods', key: 'E', trainerKey: false, cue: 'ECM lamp', verified: false, source: 'Game files: same pods as the Su-27', note: 'not verified in game' },
  j11a: null,
  mig29s: { name: 'Gardenia', key: 'E', trainerKey: false, cue: 'ECM lamp', verified: false, source: 'Game files', note: 'lamp not verified' },
  fa18c: {
    name: 'ALQ-165 ASPJ', key: 'E', trainerKey: true, cue: 'JAMMER ON', verified: false,
    source: 'ED Hornet guide pp. 415–416: ECM panel OFF / STBY / REC / XMIT', note: 'In DCS a panel knob (XMIT), not a key',
  },
  f16c: {
    name: 'ALQ-131 / ALQ-184 pod', key: 'E', trainerKey: true, cue: 'ECM Enable light', verified: false,
    source: 'ED Viper guide pp. 698–706: XMIT 3 with CMS Aft on, CMS Right off', note: 'In DCS the ECM panel and CMS switch, not a key',
  },
  f14b: {
    name: 'ALQ-126', key: 'E', trainerKey: true, cue: 'DECM panel', verified: false,
    source: 'Heatblur F-14 manual, ECM: RIO panel', note: 'In DCS a RIO panel switch, not a key',
  },
  jf17: { name: 'KG-600 SPJ pod', key: 'E', trainerKey: false, cue: 'JAMING on the CMBT page', verified: false, source: "Chuck's JF-17 guide: T2 forward", note: 'community' },
  m2000c: { name: 'Internal jammer', key: 'E', trainerKey: false, cue: 'BR light', verified: false, source: "Chuck's M-2000C guide: E = jammer", note: 'community' },
};

/** How each radar shows a jammer (strobe) and a jam lock, as the manuals describe it. */
export interface JamCue { strobe: string; lock: string; verified: boolean; source: string }

export const JAM_CUE: Record<FighterId, JamCue> = {
  f15c: { strobe: 'Column of hollow rectangles along the bearing', lock: 'Solid line and HOJ', verified: true, source: 'ED F-15C manual p. 70' },
  su27: { strobe: 'Flashing strobe on the HUD and АП', lock: 'AOJ lock, range set by hand (default 10 km)', verified: true, source: 'ED Su-27 manual pp. 57–59' },
  su33: { strobe: 'Flashing strobe on the HUD and АП', lock: 'AOJ lock', verified: false, source: 'Su-27 cue, same family' },
  j11a: { strobe: 'Flashing strobe on the HUD and АП', lock: 'AOJ lock', verified: false, source: 'Su-27 cue, same family' },
  mig29s: { strobe: 'Flashing strobe on the HUD and АП', lock: 'AOJ lock', verified: false, source: 'Su-27 cue, same family' },
  fa18c: { strobe: 'AOJ dugout at the top of the scope', lock: 'AOJ lock', verified: true, source: 'ED Hornet guide p. 157' },
  f16c: { strobe: 'Yellow chevrons at the top of the FCR', lock: 'Jam lock (not verified)', verified: true, source: 'ED Viper guide pp. 392–393' },
  f14b: { strobe: 'TID strobe with < at 50 nm', lock: 'JAT lock', verified: true, source: 'Heatblur F-14 manual, ECM' },
  jf17: { strobe: 'Strobe along the bearing', lock: 'Jam lock', verified: false, source: 'No symbol found: generic strobe' },
  m2000c: { strobe: 'Strobe along the bearing', lock: 'Jam lock', verified: false, source: 'No symbol found: generic strobe' },
};

/** DCS mission editor option "ECM Using" for AI aircraft (Hoggit: DCS option ECMUsing). */
export type EcmUsing = 'never' | 'locked' | 'detected' | 'always';
export const ECM_USING: readonly { id: EcmUsing; label: string }[] = [
  { id: 'never', label: 'Never use' },
  { id: 'locked', label: 'Use if only lock by radar' },
  { id: 'detected', label: 'Use if detected by radar' },
  { id: 'always', label: 'Always use' },
];

export const ECM_CAVEATS: readonly string[] = [
  'Burn-through is one range per radar; DCS values cluster between 13 and 29 nm and barely depend on the jammer (community test).',
  'Home-on-jam missiles fly pure pursuit on the jammer (stated for the F-15C and Su-27; applied to every HOJ missile).',
  'Jammers show as strobes out to 1.75× the radar head-on detection range: a trainer value.',
  'Hornet, Viper and Tomcat jammers are panel switches in DCS; the trainer key E stands in for them.',
  'The AI "ECM Using" default and whether the AI stops jamming inside burn-through are not verified.',
  'No RWR cue for an enemy jammer: none is documented.',
];
