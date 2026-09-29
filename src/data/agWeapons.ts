/**
 * Air-to-ground stores as the DCS player meets them (Su-25T and A-10C II): HUD label, what the pilot must do to guide the
 * weapon, and a gameplay launch band. Source for labels and rules: ED DCS World Su-25T Flight Manual (S1,
 * docs/research/su25t.md). S1 gives no launch ranges for guided weapons: every range band here is a community
 * value, marked rangeVerified: false and listed in docs/api/data.md ("Uncertain values").
 * A-10C II stores: ED A-10C II Tank Killer Flight Manual (M) and ED training missions (T), docs/research/a10c.md
 * section 6. hudLabel there is the trainer's short store name for the DSMS profile, not verified in game.
 * Game level only (AGENTS.md rule 1): no seeker, fuze or warhead data. The arcade flight constants live in
 * src/sim/agWeapons.ts.
 */
import type { AgLoadout, AgWeaponId, AgWeaponSpec, AttackId, SamId } from './types';

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

  // ─── A-10C II (docs/research/a10c.md) ────────────────────────────────────────────────────────────────
  gbu12: {
    id: 'gbu12', name: 'GBU-12', hudLabel: 'GBU-12', defaultLaserCode: 1688, kind: 'bomb', guidance: 'laser-spot',
    needsLock: false, needsLaser: false, holdToImpact: false, needsEmitter: false, pairable: false,
    rangeKm: { min: 1, max: 9 }, rangeVerified: false,
    guidanceRule: 'Make the target your SPI, release in CCRP holding release through the cue, and keep a laser spot with the bomb\'s code on the target for the last seconds of the fall.',
    notes: [
      'Homes on any spot with its code: your own TGP laser or the JTAC\'s. Default code 1688 (M p. 400–401).',
      'ED tip: drop above 15000 ft AGL and lase from about 8 s before impact; auto-lase can fire the laser for you (M p. 393, 674).',
      'Keep the pod unmasked: an M next to the laser field means the laser cannot fire (M p. 396).',
      'Release reach depends on height and speed; the range band is a trainer gate, not verified.',
    ],
  },
  agm65d: {
    id: 'agm65d', name: 'AGM-65D Maverick', hudLabel: '65D', kind: 'missile', guidance: 'tv',
    needsLock: true, needsLaser: false, holdToImpact: false, needsEmitter: false, pairable: false,
    rangeKm: { min: 5.6, max: 13 }, rangeVerified: false,
    guidanceRule: 'Slave the Maverick to the SPI, slew the gate onto the target until it locks (the pointing cross flashes), hold release. Fire and forget.',
    notes: [
      'Infrared picture: works at night. Needs 3 minutes of alignment after EO power on (ALN, then RDY).',
      'Manual: lock "generally between 3 and 7 nm"; ED lessons lock at about 7.5 nm (M p. 93; T).',
      'The HUD DLZ staple has its max tick fixed at 15 nm and shows only with the lock within 30° of the nose (M p. 453–454).',
      'Simplified: any contrast inside the gate locks.',
    ],
  },
  agm65h: {
    id: 'agm65h', name: 'AGM-65H Maverick', hudLabel: '65H', kind: 'missile', guidance: 'tv',
    needsLock: true, needsLaser: false, holdToImpact: false, needsEmitter: false, pairable: false,
    rangeKm: { min: 5.6, max: 13 }, rangeVerified: false,
    guidanceRule: 'Slave the Maverick to the SPI, slew the gate onto the target until it locks (the pointing cross flashes), hold release. Fire and forget.',
    notes: [
      'TV (daylight) picture. Same flow as the AGM-65D; force correlate is available (Boat Center, TMS Aft Short, slew).',
      'Manual: lock "generally between 3 and 7 nm" (M p. 93).',
      'Simplified: any contrast inside the gate locks.',
    ],
  },
  agm65l: {
    id: 'agm65l', name: 'AGM-65L Maverick', hudLabel: '65L', defaultLaserCode: 1688, kind: 'missile', guidance: 'laser-spot',
    needsLock: true, needsLaser: false, holdToImpact: true, needsEmitter: false, pairable: false,
    rangeKm: { min: 5.6, max: 13 }, rangeVerified: false,
    guidanceRule: 'Put a laser spot with its code on the target, uncage with TMS Forward until the solid square shows the lock, launch, and keep the spot on until impact.',
    notes: [
      'Laser Maverick on the LAU-117 (stations 3 and 9). No video: the MAV page shows a synthetic view (M p. 693–697).',
      'The spot can be your own TGP laser or the JTAC\'s; the ED lesson sets the laser LATCH on (T).',
      'Default code 1688; set it on the DSMS INV page or with the Boat switch on the MAV page.',
      'Range band follows the AGM-65D/H figure; not verified for the L.',
    ],
  },
  apkws: {
    id: 'apkws', name: 'APKWS', hudLabel: 'APKWS', defaultLaserCode: 1688, kind: 'rocket', guidance: 'laser-spot',
    needsLock: false, needsLaser: false, holdToImpact: true, needsEmitter: false, pairable: false,
    rangeKm: { min: 2.2, max: 9.3 }, rangeVerified: false,
    guidanceRule: 'Lase the target with the code the rockets are set to, fire from about 5 nm with the normal rocket CCIP reticle, and keep lasing to impact.',
    notes: [
      'Laser-guided rockets in a LAU-131 pod, for light targets. Default code 1688 on the DSMS INV page (M p. 698–702).',
      'Range conflicts in the manual (1.2–6.8 nm, 5.0–6.0 nm, 0.5–2.5 nm); the ED lesson fires the first rocket inside 5.2–5.5 nm. Teaching number: about 5 nm.',
    ],
  },
  mk82: {
    id: 'mk82', name: 'Mk-82', hudLabel: 'MK-82', kind: 'bomb', guidance: 'ballistic',
    needsLock: false, needsLaser: false, holdToImpact: false, needsEmitter: false, pairable: false,
    rangeKm: { min: 0, max: 5 }, rangeVerified: false,
    guidanceRule: 'CCIP: fly the pipper onto the target and release. CCRP: make the target your SPI, fly the ASL and hold release through the cue.',
    notes: ['Unguided. An X in the CCIP reticle means below minimum release: the release is invalid (M p. 442–444).', 'The band only gates the trainer release cue.'],
  },
  cbu97: {
    id: 'cbu97', name: 'CBU-97', hudLabel: 'CBU-97', kind: 'bomb', guidance: 'ballistic',
    needsLock: false, needsLaser: false, holdToImpact: false, needsEmitter: false, pairable: false,
    rangeKm: { min: 0, max: 5 }, rangeVerified: false,
    guidanceRule: 'CCIP or CCRP like the Mk-82. Minimum release comes from the burst height (HOF) set in the profile.',
    notes: ['Cluster bomb for armour spread over an area (M p. 443).', 'The band only gates the trainer release cue.'],
  },
  gau8: {
    id: 'gau8', name: 'GAU-8 30 mm', hudLabel: 'GUN', kind: 'gun', guidance: 'ballistic',
    needsLock: false, needsLaser: false, holdToImpact: false, needsEmitter: false, pairable: false,
    rangeKm: { min: 0.9, max: 3.7 }, rangeVerified: false,
    guidanceRule: 'GUNS master mode, put the CCIP gun pipper on the target and fire short bursts between 2 nm and 0.5 nm slant range.',
    notes: [
      'Effective strafe 0.5–2 nm slant; tanks at 0.5–1 nm, from behind (M p. 632–633; T).',
      'CCIP INVALID shows when the target elevation is unknown or above you.',
    ],
  },
};

export const AG_WEAPON_ORDER: AgWeaponId[] = [
  'vikhr', 'kh25ml', 'kh29l', 'kh29t', 'kab500kr', 's8', 's13', 'fab250', 'gun25t', 'kh58',
  'gbu12', 'agm65d', 'agm65h', 'agm65l', 'apkws', 'mk82', 'cbu97', 'gau8',
];

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

/** GAU-8 rounds. The HUD shows the count (CM/1150 in the manual's example, M p. 632); the full load is not verified. */
export const A10C_GUN_ROUNDS = 1150;

/**
 * Trainer CAS loadouts for the A-10C II. The PGM loadout is the ED training mission layout (T: GBU-12 on 4 and 8,
 * TGP on 2, AIM-9M pair on 11); the others keep that TGP and AIM-9M placement and use the store stations the manual
 * gives (AGM-65L on the LAU-117, stations 3 and 9). Counts per launcher and the Mission Editor default payloads
 * are not verified.
 */
export const A10C_LOADOUTS: AgLoadout[] = [
  {
    id: 'pgm', name: 'GBU-12 ×2, APKWS ×7, TGP',
    stations: [
      { station: 2, weapon: 'tgp', count: 1 }, { station: 3, weapon: 'apkws', count: 7 },
      { station: 4, weapon: 'gbu12', count: 1 }, { station: 8, weapon: 'gbu12', count: 1 },
      { station: 11, weapon: 'aim9m', count: 2 },
    ],
    gunRounds: A10C_GUN_ROUNDS,
    note: 'GBU-12, TGP and AIM-9M stations follow the ED PGM training mission; the APKWS pod (7 rockets) is a trainer addition, not verified.',
  },
  {
    id: 'maverick', name: 'AGM-65D ×2, AGM-65H ×2, TGP',
    stations: [
      { station: 2, weapon: 'tgp', count: 1 }, { station: 3, weapon: 'agm65d', count: 2 },
      { station: 9, weapon: 'agm65h', count: 2 }, { station: 11, weapon: 'aim9m', count: 2 },
    ],
    gunRounds: A10C_GUN_ROUNDS,
    note: 'Two Mavericks per LAU-88 is a trainer layout, not verified.',
  },
  {
    id: 'laser', name: 'AGM-65L ×2, GBU-12 ×2, TGP',
    stations: [
      { station: 2, weapon: 'tgp', count: 1 }, { station: 3, weapon: 'agm65l', count: 1 },
      { station: 4, weapon: 'gbu12', count: 1 }, { station: 8, weapon: 'gbu12', count: 1 },
      { station: 9, weapon: 'agm65l', count: 1 }, { station: 11, weapon: 'aim9m', count: 2 },
    ],
    gunRounds: A10C_GUN_ROUNDS,
    note: 'AGM-65L on the LAU-117, stations 3 and 9 (M p. 693).',
  },
  {
    id: 'unguided', name: 'Mk-82 ×4, CBU-97 ×2, TGP',
    stations: [
      { station: 2, weapon: 'tgp', count: 1 }, { station: 3, weapon: 'cbu97', count: 1 },
      { station: 4, weapon: 'mk82', count: 1 }, { station: 5, weapon: 'mk82', count: 1 },
      { station: 7, weapon: 'mk82', count: 1 }, { station: 8, weapon: 'mk82', count: 1 },
      { station: 9, weapon: 'cbu97', count: 1 }, { station: 11, weapon: 'aim9m', count: 2 },
    ],
    gunRounds: A10C_GUN_ROUNDS,
    note: 'Trainer layout, not verified against the Mission Editor.',
  },
];

/** Trainer loadouts per attack jet. */
export const AG_LOADOUTS: Record<AttackId, AgLoadout[]> = { su25t: SU25T_LOADOUTS, a10c: A10C_LOADOUTS };

/** Gun rounds per attack jet (both values not verified, see AG_CAVEATS). */
export const GUN_ROUNDS: Record<AttackId, number> = { su25t: SU25T_GUN_ROUNDS, a10c: A10C_GUN_ROUNDS };

/**
 * Kh-58 HUD type code under an emitter diamond, per SAM radar the missile can attack. S1 says the HUD marks
 * emitters inside ±30° with diamonds; the codes here are trainer labels (the site's NATO number), not verified.
 */
export const KH58_TARGET_CODES: Partial<Record<SamId, string>> = { sa10: '10', sa11: '11', sa15: '15' };

/** Can the Kh-58 attack this radar (a code shows under its diamond)? Trainer list, not verified. */
export const kh58CanAttack = (sam: SamId): boolean => KH58_TARGET_CODES[sam] != null;

export const AG_CAVEATS: string[] = [
  'S1 gives no launch ranges for guided air-to-ground weapons ("observe the maximum launch range scale in the HUD"): every range band is a community value, not verified.',
  'Laser limits: S1 documents about 1 minute of continuous operation with cooling (p. 57) and 20 minutes total per flight (p. 32). The trainer uses a simplified recoverable 20-minute heat threshold and recovery while off, not verified; it does not enforce the separate manual limits.',
  'Cannon: S1 writes "GSh-20 30-mm twin-barrel cannon with a 200 round magazine"; other sources say GSh-30 with 150 rounds. Not verified.',
  'Station numbers other than the L-081 on station 6 are trainer layouts, not verified against the Mission Editor.',
  'Weapon flight (speed over time, dispersion, kill radius) is an arcade model tuned for teaching, not DCS weapon data.',
  'Shkval slew stops use the IT-23M scales; releasing ground stabilisation at a stop or when the sight leaves the ground is a simplified trainer rule, not verified.',
  'Kh-58 HUD: diamonds inside ±30° follow S1; the type code under each diamond is a trainer label (the SAM NATO number), and the diamond placement across the HUD is scaled to fit the ±30° zone. Not verified.',
  'CCRP: the director circle tolerance (±2° of track) and the automatic release rule are trainer values; S1 gives the procedure (hold release, keel into the circle, 10 s cue), not the tolerances.',
  'Shkval field of view below 23x is scaled from the S1 23x figure (0.73 × 0.97°); the wide and 8x fields are not verified.',
  'A-10C II: the DSMS store labels (65D, MK-82, GUN) are trainer short names, not verified in game.',
  'A-10C II: every range band is a trainer gate (rangeVerified false). The Maverick D/H band follows the manual\'s "generally 3–7 nm" lock range and the gun band its 0.5–2 nm strafe range; AGM-65L, GBU-12, Mk-82 and CBU-97 bands are not from the manual. APKWS range conflicts in the manual; the trainer teaches about 5 nm.',
  'A-10C II: GAU-8 rounds (1150) are the manual\'s HUD example, not a verified full load. Loadouts other than the ED PGM training layout are trainer layouts.',
];
