/**
 * Su-25T air-to-ground stores as the DCS player meets them: HUD label, what the pilot must do to guide the
 * weapon, and a gameplay launch band. Source for labels and rules: ED DCS World Su-25T Flight Manual (S1,
 * docs/research/su25t.md). S1 gives no launch ranges for guided weapons: every range band here is a community
 * value, marked rangeVerified: false and listed in docs/api/data.md ("Uncertain values").
 * Game level only (AGENTS.md rule 1): no seeker, fuze or warhead data. The arcade flight constants live in
 * src/sim/agWeapons.ts.
 */
import type { AgLoadout, AgWeaponId, AgWeaponSpec } from './types';

const LOCK_AND_LASE = 'Lock with the Shkval, laser on, launch at ПР, keep the lock and the laser until impact.';

export const AG_WEAPONS: Record<AgWeaponId, AgWeaponSpec> = {
  vikhr: {
    id: 'vikhr', name: 'Vikhr', hudLabel: '9А4172', kind: 'missile', guidance: 'beam-riding',
    needsLock: true, needsLaser: true, holdToImpact: true, needsEmitter: false, pairable: true,
    rangeKm: { min: 0.8, max: 10 }, rangeVerified: false,
    guidanceRule: LOCK_AND_LASE,
    notes: [
      'Rides the laser beam down the Shkval line of sight (S1).',
      'Can be fired in pairs; usable against slow aircraft and helicopters (S1).',
    ],
  },
  kh25ml: {
    id: 'kh25ml', name: 'Kh-25ML', hudLabel: '25МЛ', kind: 'missile', guidance: 'laser',
    needsLock: true, needsLaser: true, holdToImpact: true, needsEmitter: false, pairable: false,
    rangeKm: { min: 3, max: 10 }, rangeVerified: false,
    guidanceRule: LOCK_AND_LASE,
    notes: ['Same flow as the Vikhr: the target must stay illuminated for the whole time of flight (S1).'],
  },
  kh29l: {
    id: 'kh29l', name: 'Kh-29L', hudLabel: '29Л', kind: 'missile', guidance: 'laser',
    needsLock: true, needsLaser: true, holdToImpact: true, needsEmitter: false, pairable: false,
    rangeKm: { min: 3, max: 10 }, rangeVerified: false,
    guidanceRule: LOCK_AND_LASE,
    notes: ['Same flow as the Vikhr: the target must stay illuminated for the whole time of flight (S1).'],
  },
  kh29t: {
    id: 'kh29t', name: 'Kh-29T', hudLabel: '29Т', kind: 'missile', guidance: 'tv',
    needsLock: true, needsLaser: false, holdToImpact: false, needsEmitter: false, pairable: false,
    rangeKm: { min: 3, max: 12 }, rangeVerified: false,
    guidanceRule: 'Lock with the Shkval and launch at ПР. No laser; the missile guides itself after launch.',
    notes: ['TV guided: fire and forget once launched on a Shkval lock (S1).'],
  },
  kab500kr: {
    id: 'kab500kr', name: 'KAB-500Kr', hudLabel: '500Кр', kind: 'bomb', guidance: 'tv',
    needsLock: true, needsLaser: false, holdToImpact: false, needsEmitter: false, pairable: false,
    rangeKm: { min: 1, max: 8 }, rangeVerified: false,
    guidanceRule: 'Lock with the Shkval and release at ПР. No laser; the bomb guides itself after release.',
    notes: ['TV guided bomb (S1). Its reach depends on release height and speed; the band is a trainer gate.'],
  },
  s8: {
    id: 's8', name: 'S-8', hudLabel: 'С8', kind: 'rocket', guidance: 'ballistic',
    needsLock: false, needsLaser: false, holdToImpact: false, needsEmitter: false, pairable: false,
    rangeKm: { min: 0.8, max: 4 }, rangeVerified: false,
    guidanceRule: 'Put the pipper on the target and fire at the range the HUD range bar shows.',
    notes: ['Unguided. S1 shows the rocket type on the HUD (С-5 / С-8).'],
  },
  s13: {
    id: 's13', name: 'S-13', hudLabel: 'С13', kind: 'rocket', guidance: 'ballistic',
    needsLock: false, needsLaser: false, holdToImpact: false, needsEmitter: false, pairable: false,
    rangeKm: { min: 1, max: 5 }, rangeVerified: false,
    guidanceRule: 'Put the pipper on the target and fire at the range the HUD range bar shows.',
    notes: ['Unguided. The HUD label follows the S1 pattern for rockets and is not verified for the S-13.'],
  },
  fab250: {
    id: 'fab250', name: 'FAB-250', hudLabel: 'АБ', kind: 'bomb', guidance: 'ballistic',
    needsLock: false, needsLaser: false, holdToImpact: false, needsEmitter: false, pairable: false,
    rangeKm: { min: 0, max: 5 }, rangeVerified: false,
    guidanceRule: 'CCIP: fly the pipper onto the target and release. CCRP: designate with the Shkval and laser, hold release.',
    notes: ['АБ covers free-fall bombs and dispensers (S1). The band only gates the trainer ПР cue.'],
  },
  gun25t: {
    id: 'gun25t', name: '30 mm cannon', hudLabel: 'ВПУ', kind: 'gun', guidance: 'ballistic',
    needsLock: false, needsLaser: false, holdToImpact: false, needsEmitter: false, pairable: false,
    rangeKm: { min: 0.3, max: 2 }, rangeVerified: false,
    guidanceRule: 'Select the cannon (C), put the pipper on the target and fire in short bursts.',
    notes: ['Gun type and round count conflict between S1 and other sources: not verified.'],
  },
  kh58: {
    id: 'kh58', name: 'Kh-58', hudLabel: '58', kind: 'missile', guidance: 'anti-radiation',
    needsLock: false, needsLaser: false, holdToImpact: false, needsEmitter: true, pairable: false,
    rangeKm: { min: 10, max: 70 }, rangeVerified: false,
    guidanceRule: 'Needs the L-081 Fantasmagoria pod. Detect [I], put the emitter inside ±30°, lock it [Enter], launch.',
    notes: ['HUD shows 58 and ПРГ (S1). The launch band shrinks at low level; values are not verified.'],
  },
};

export const AG_WEAPON_ORDER: AgWeaponId[] = ['vikhr', 'kh25ml', 'kh29l', 'kh29t', 'kab500kr', 's8', 's13', 'fab250', 'gun25t', 'kh58'];

/** Cannon rounds S1 gives ("200 round magazine"); other sources say 150. Not verified. */
export const SU25T_GUN_ROUNDS = 200;

/**
 * Trainer loadouts for the Su-25T. Weapon counts per launcher are public (8 Vikhr per launcher, 20 S-8 per B-8
 * pod, 5 S-13 per B-13 pod); the L-081 on station 6 is from S1. Other station numbers are not verified.
 */
export const SU25T_LOADOUTS: AgLoadout[] = [
  {
    id: 'vikhr', name: 'Vikhr ×16, S-8 ×40',
    stations: [
      { station: 1, weapon: 'r60', count: 1 }, { station: 3, weapon: 's8', count: 20 },
      { station: 4, weapon: 'vikhr', count: 8 }, { station: 8, weapon: 'vikhr', count: 8 },
      { station: 9, weapon: 's8', count: 20 }, { station: 11, weapon: 'r60', count: 1 },
    ],
    gunRounds: SU25T_GUN_ROUNDS,
  },
  {
    id: 'laser', name: 'Kh-25ML ×2, Kh-29L ×2, Vikhr ×16',
    stations: [
      { station: 1, weapon: 'r60', count: 1 }, { station: 2, weapon: 'kh25ml', count: 1 },
      { station: 3, weapon: 'kh29l', count: 1 }, { station: 4, weapon: 'vikhr', count: 8 },
      { station: 8, weapon: 'vikhr', count: 8 }, { station: 9, weapon: 'kh29l', count: 1 },
      { station: 10, weapon: 'kh25ml', count: 1 }, { station: 11, weapon: 'r60', count: 1 },
    ],
    gunRounds: SU25T_GUN_ROUNDS,
  },
  {
    id: 'tv', name: 'Kh-29T ×2, KAB-500Kr ×2',
    stations: [
      { station: 1, weapon: 'r60', count: 1 }, { station: 3, weapon: 'kh29t', count: 1 },
      { station: 4, weapon: 'kab500kr', count: 1 }, { station: 8, weapon: 'kab500kr', count: 1 },
      { station: 9, weapon: 'kh29t', count: 1 }, { station: 11, weapon: 'r60', count: 1 },
    ],
    gunRounds: SU25T_GUN_ROUNDS,
  },
  {
    id: 'unguided', name: 'FAB-250 ×4, S-13 ×10, S-8 ×40',
    stations: [
      { station: 2, weapon: 's13', count: 5 }, { station: 3, weapon: 's8', count: 20 },
      { station: 4, weapon: 'fab250', count: 1 }, { station: 5, weapon: 'fab250', count: 1 },
      { station: 7, weapon: 'fab250', count: 1 }, { station: 8, weapon: 'fab250', count: 1 },
      { station: 9, weapon: 's8', count: 20 }, { station: 10, weapon: 's13', count: 5 },
    ],
    gunRounds: SU25T_GUN_ROUNDS,
  },
  {
    id: 'sead', name: 'Kh-58 ×2, L-081, Vikhr ×16',
    stations: [
      { station: 1, weapon: 'r60', count: 1 }, { station: 3, weapon: 'kh58', count: 1 },
      { station: 4, weapon: 'vikhr', count: 8 }, { station: 6, weapon: 'l081', count: 1 },
      { station: 8, weapon: 'vikhr', count: 8 }, { station: 9, weapon: 'kh58', count: 1 },
      { station: 11, weapon: 'r60', count: 1 },
    ],
    gunRounds: SU25T_GUN_ROUNDS,
    note: 'The Kh-58 needs the L-081 Fantasmagoria pod on station 6 (S1).',
  },
];

export const AG_CAVEATS: string[] = [
  'S1 gives no launch ranges for guided air-to-ground weapons ("observe the maximum launch range scale in the HUD"): every range band is a community value, not verified.',
  'Laser limits: S1 documents about 1 minute of continuous operation with cooling (p. 57) and 20 minutes total per flight (p. 32). The trainer uses a simplified recoverable 20-minute heat threshold and recovery while off, not verified; it does not enforce the separate manual limits.',
  'Cannon: S1 writes "GSh-20 30-mm twin-barrel cannon with a 200 round magazine"; other sources say GSh-30 with 150 rounds. Not verified.',
  'Station numbers other than the L-081 on station 6 are trainer layouts, not verified against the Mission Editor.',
  'Weapon flight (speed over time, dispersion, kill radius) is an arcade model tuned for teaching, not DCS weapon data.',
  'Shkval slew stops use the IT-23M scales; releasing ground stabilisation at a stop or when the sight leaves the ground is a simplified trainer rule, not verified.',
  'Shkval field of view below 23x is scaled from the S1 23x figure (0.73 × 0.97°); the wide and 8x fields are not verified.',
];
