/**
 * [OWNER: data] Close-range acquisition (ACM) modes and the IR missile shot for the ten fighters, as the DCS
 * manuals present them to the player (docs/research/ru-fc3.md, f15c-fc3.md, hornet-viper.md,
 * tomcat-thunder-mirage.md). Game-tutorial scope (AGENTS.md rule 1): each mode is a scan area, a lock range, a lock
 * rule and the HUD cue the pilot sees. No radar or seeker engineering.
 *
 * Angles are degrees off the nose (az + right, el + up), in the HUD frame the trainer uses (flight path and lift
 * vector: simplified, no angle of attack). Ranges in metres. Values not in the research notes are
 * `verified: false`, listed in ACM_CAVEATS and in docs/api/data.md ("Uncertain values").
 */
import type { Sourced } from '../sim/flightOps/types';
import type { MissileId } from './types';
import type { GunJetId } from './wvr';

export type AcmModeId =
  | 'vs' | 'bore' | 'helmet' | 'fi0'                 // FC3 Russian (F-15C shares vs / bore)
  | 'autoguns'                                       // F-15C
  | 'bst' | 'vacq' | 'wacq' | 'gacq'                 // F/A-18C
  | 'acm20' | 'acm60' | 'acmbore'                    // F-16C
  | 'plm' | 'vslhi' | 'vsllo' | 'pal'                // F-14B
  | 'vt' | 'bs' | 'ha'                               // JF-17
  | 'm2k-bore' | 'm2k-vert' | 'm2k-hud';             // M-2000C

/** Scan area: a cone round a centre, or an az × el box (deg). */
export type AcmArea =
  | { kind: 'cone'; radiusDeg: number; az: number; el: number }
  | { kind: 'box'; az: [number, number]; el: [number, number] };

/**
 * What the jet's own HUD shows for the mode: two vertical lines, a circle, a dashed circle, the helmet ring, a
 * fixed cross, a single reference line, or nothing (the trainer still draws the scan area as a dim aid).
 */
export type AcmCue = 'lines' | 'circle' | 'dashed-circle' | 'helmet' | 'cross' | 'line' | 'none';

export interface AcmModeSpec {
  id: AcmModeId;
  /** Name as the manual gives it (HUD strings of the FC3 modes are not confirmed). */
  name: string;
  /** What does the looking: radar (the target's RWR sees the lock), IRST (silent), or the missile's own seeker. */
  sensor: 'radar' | 'irst' | 'seeker';
  area: Sourced<AcmArea>;
  /** Lock range (m); for the seeker mode, the missile's IR acquisition range applies instead. */
  rangeM: Sourced<number>;
  /** 'auto': locks the first target in the area; 'enter': the pilot presses lock with the target in the area. */
  lock: Sourced<'auto' | 'enter'>;
  /** Seconds the target must sit in the area before the lock (gameplay dwell). */
  lockS: Sourced<number>;
  /** DCS key or control that selects the mode. */
  key: Sourced<string>;
  cue: AcmCue;
  note: string;
}

export interface IrShotSpec {
  /** The IR missile the lesson uses (from the jet's default loadout). */
  missile: MissileId;
  /**
   * 'auto': the seeker tracks as soon as it sees the heat (FC3 ПР, Magic II growl then fire);
   * 'key': growl first, then the pilot uncages and the seeker tracks (AIM-9, PL-5EII).
   */
  uncage: Sourced<'auto' | 'key'>;
  uncageKey: Sourced<string> | null;
  /** Seeker field of view (deg, full cone) while it searches. */
  seekerFovDeg: Sourced<number>;
  /** Largest off-boresight angle for the launch (deg). */
  launchLimitDeg: Sourced<number>;
  /** Cue that the seeker tracks and the shot is allowed, as the pilot reads it. */
  readyCue: Sourced<string>;
  /** Growl while the seeker sees heat, high tone when it tracks. */
  tones: Sourced<string>;
  fire: Sourced<string>;
}

export interface AcmJet {
  modes: AcmModeSpec[];
  ir: IrShotSpec;
  /** One line on how the jet enters close combat. */
  entry: Sourced<string>;
}

const ok = <T>(value: T, source: string, note?: string): Sourced<T> => ({ value, source, verified: true, note });
const nv = <T>(value: T, source: string, note?: string): Sourced<T> => ({ value, source, verified: false, note });

const NM = 1852;
const TRAINER = 'Trainer pick';
const RU = 'docs/research/ru-fc3.md, Close combat (FC3 and MiG-29 manuals)';
const RU_KEYS = 'docs/research/ru-fc3.md, key table';
const RU_MSL = 'docs/research/ru-fc3.md, R-73 row (DCS Lua Fi_start 0.79 rad)';
const EAGLE = 'docs/research/f15c-fc3.md, AACQ modes (FC3 manual)';
const HORNET = 'docs/research/hornet-viper.md, Hornet ACM modes (ED guide)';
const HORNET_KEYS = 'docs/research/hornet-viper.md, Hornet key table';
const VIPER = 'docs/research/hornet-viper.md, Viper ACM (ED guide)';
const VIPER_KEYS = 'docs/research/hornet-viper.md, Viper key table';
const TOMCAT = 'docs/research/tomcat-thunder-mirage.md, F-14 ACM modes (Heatblur manual)';
const THUNDER = 'docs/research/tomcat-thunder-mirage.md, JF-17 ACM and PL-5EII (Chuck\'s Guides)';
const MIRAGE = 'docs/research/tomcat-thunder-mirage.md, M-2000C close-combat modes and Magic II (Chuck\'s Guides)';

const box = (az: [number, number], el: [number, number]): AcmArea => ({ kind: 'box', az, el });
const cone = (radiusDeg: number, az = 0, el = 0): AcmArea => ({ kind: 'cone', radiusDeg, az, el });
const autoLock = (src: string) => ok<'auto' | 'enter'>('auto', src, 'Locks the first target in the area.');
const dwell = nv(0.5, TRAINER, 'Time in the area before the lock: gameplay value.');

function fc3(manual: string): AcmJet {
  const range = nv(10000, TRAINER, 'FC3 close-combat lock range not in the research notes: 10 km trainer value.');
  return {
    entry: ok('Keys 3 (VS), 4 (BORE), 5 (HELMET), 6 (Fi0). VS, BORE and HELMET use the IRST and an IR missile by default.', RU),
    modes: [
      { id: 'vs', name: 'VS', sensor: 'irst', area: ok(box([-1.5, 1.5], [-10, 50]), RU, 'A 3° wide bar from −10° to +50°.'), rangeM: range,
        lock: ok('auto', RU, 'FC3 manual: automatic lock. The Su-27 manual says the lock holds only while Enter is pressed.'),
        lockS: ok(2, RU, 'Lock in 1–3 s; the trainer uses 2 s.'), key: ok('3', RU_KEYS), cue: 'lines',
        note: `Put him between the two lines; the lock comes in 1 to 3 s. ${manual}` },
      { id: 'bore', name: 'BORE', sensor: 'irst', area: ok(cone(1.25), RU, '2.5° circle (slewable in DCS; fixed here).'), rangeM: range,
        lock: ok('enter', RU, 'Circle on him, then Enter.'), lockS: dwell, key: ok('4', RU_KEYS), cue: 'circle',
        note: 'Put the 2.5° circle on him and press Enter.' },
      { id: 'helmet', name: 'HELMET', sensor: 'irst', area: nv(cone(45), TRAINER, 'Acquisition eligibility: trainer 45° cone round the nose; the padlock/look direction is independent.'), rangeM: range,
        lock: ok('enter', RU, 'Look at him, press Enter.'), lockS: dwell, key: ok('5', RU_KEYS), cue: 'helmet',
        note: 'Look at him (padlock), press Enter; fire when the ring flashes (ПР). An X above the ring: he is outside the seeker gimbal.' },
      { id: 'fi0', name: 'Fi0', sensor: 'seeker', area: ok(cone(1), RU, 'The missile\'s own seeker, a 2° cone on the boresight.'),
        rangeM: nv(0, TRAINER, 'The missile\'s IR acquisition range applies.'),
        lock: ok('auto', RU, 'ПР when the seeker locks.'), lockS: dwell, key: ok('6', RU_KEYS), cue: 'cross',
        note: 'No radar, no IRST: the missile\'s own seeker. Nothing on his RWR. Judge the range by eye.' },
    ],
    ir: {
      missile: 'r73',
      uncage: ok('auto', RU, 'The seeker locks on its own; ПР shows the launch is authorised.'), uncageKey: null,
      seekerFovDeg: ok(2, RU, 'Fi0: a 2° cone.'),
      launchLimitDeg: ok(45, RU_MSL, 'R-73 launch up to 45° off the nose (tracking gimbal 75°).'),
      readyCue: ok('ПР', RU), tones: nv('growl, then a steady tone on lock', TRAINER, 'FC3 seeker tones not in the research notes.'),
      fire: ok('Space', RU_KEYS),
    },
  };
}

export const ACM: Record<GunJetId, AcmJet> = {
  su27: fc3('Su-27 manual.'),
  su33: fc3('Su-27 manual text.'),
  j11a: fc3('Su-27 manual text.'),
  mig29s: fc3('MiG-29 manual.'),
  f15c: {
    entry: ok('Keys 3 (Vertical Scan), 4 (Boresight), C (gun and Auto Guns). Each locks the first target within 10 nm, then STT.', EAGLE),
    modes: [
      { id: 'vs', name: 'VS', sensor: 'radar', area: ok(box([-3.75, 3.75], [-2, 50]), EAGLE, 'Manual gives 7.5° × −2°..+50° and 2.5° × −2°..+55°; the first is used.'),
        rangeM: ok(10 * NM, EAGLE), lock: autoLock(EAGLE), lockS: dwell, key: ok('3', EAGLE), cue: 'lines',
        note: 'Two vertical HUD lines: put him between them or on the lift vector.' },
      { id: 'bore', name: 'BORE', sensor: 'radar', area: nv(cone(3), TRAINER, 'A narrow cone on the boresight reticle; size not given, 6° trainer value.'),
        rangeM: ok(10 * NM, EAGLE), lock: autoLock(EAGLE), lockS: dwell, key: ok('4', EAGLE), cue: 'circle',
        note: 'Point the boresight reticle at him.' },
      { id: 'autoguns', name: 'AUTO GUNS', sensor: 'radar', area: ok(box([-30, 30], [-10, 10]), EAGLE, '60° wide × 20° tall round the gun reticle.'),
        rangeM: ok(10 * NM, EAGLE), lock: autoLock(EAGLE), lockS: dwell, key: ok('C', EAGLE, 'Selecting the gun also selects Auto Guns.'), cue: 'none',
        note: 'Select the gun: the radar scans 60° × 20° and locks the first target.' },
    ],
    ir: {
      missile: 'aim9m',
      uncage: nv('key', TRAINER, 'Growl then uncage: trainer rule for the FC3 F-15C.'), uncageKey: ok('6', EAGLE, 'Key 6: FLOOD / VISUAL / AIM-9 seeker cage.'),
      seekerFovDeg: nv(2, TRAINER), launchLimitDeg: nv(45, 'data/missiles.ts seeker gimbal', 'AIM-9M launch limit from the missile gimbal data; not verified.'),
      readyCue: nv('high tone', TRAINER), tones: nv('growl, then a high tone when uncaged on him', TRAINER), fire: ok('RAlt+Space', 'docs/research/f15c-fc3.md, key table', 'Weapon Release. Space also launching missiles is unverified; Space on this page is a trainer control.'),
    },
  },
  fa18c: {
    entry: ok('Sensor Control Switch forward enters ACM with BST; in ACM aft is VACQ, left is WACQ. Selecting the gun gives GACQ.', HORNET),
    modes: [
      { id: 'bst', name: 'BST', sensor: 'radar', area: ok(cone(1.65), HORNET, '3.3° dashed HUD circle.'), rangeM: ok(10 * NM, HORNET),
        lock: autoLock(HORNET), lockS: dwell, key: ok('RAlt+;', HORNET_KEYS, 'Sensor Control Switch forward.'), cue: 'dashed-circle',
        note: 'Boresight: put the 3.3° circle on him.' },
      { id: 'vacq', name: 'VACQ', sensor: 'radar', area: nv(box([-1.5, 1.5], [-13, 46]), HORNET, 'Elevation −13° to +46°; the 3° width is a trainer value.'),
        rangeM: ok(5 * NM, HORNET), lock: autoLock(HORNET), lockS: dwell, key: ok('RAlt+.', HORNET_KEYS, 'Sensor Control Switch aft (in ACM).'), cue: 'lines',
        note: 'Vertical acquisition: two dashed lines up the HUD. Roll him between them and pull.' },
      { id: 'wacq', name: 'WACQ', sensor: 'radar', area: ok(box([-30, 30], [-5, 5]), HORNET, '60° × 10° box, caged centre; centred on the boresight here.'),
        rangeM: ok(10 * NM, HORNET), lock: autoLock(HORNET), lockS: dwell, key: ok('RAlt+,', HORNET_KEYS, 'Sensor Control Switch left (in ACM).'), cue: 'none',
        note: 'Wide acquisition: 60° × 10°. DCS shows a small box on the lower right of the HUD.' },
      { id: 'gacq', name: 'GACQ', sensor: 'radar', area: ok(cone(10), HORNET, '20° dashed HUD circle.'), rangeM: ok(5 * NM, HORNET),
        lock: autoLock(HORNET), lockS: dwell, key: ok('LShift+X', HORNET_KEYS, 'Weapon Select aft: gun.'), cue: 'dashed-circle',
        note: 'Gun acquisition: the 20° circle, guns only in DCS.' },
    ],
    ir: {
      missile: 'aim9x',
      uncage: ok('key', HORNET_KEYS, 'Cage/Uncage button.'), uncageKey: ok('C', HORNET_KEYS),
      seekerFovDeg: nv(2, TRAINER), launchLimitDeg: nv(90, 'data/missiles.ts seeker gimbal', 'AIM-9X limit from the missile gimbal data.'),
      readyCue: nv('high tone', TRAINER, 'Seeker reticle, growl, then a high tone after uncage: not in the research notes.'),
      tones: nv('growl, then a high tone when uncaged on him', TRAINER), fire: ok('Space', HORNET_KEYS),
    },
  },
  f16c: {
    entry: ok('DOGFIGHT switch outboard (key 3) enters ACM 30×20 in NO RAD. TMS right 30×20, aft 10×60, up BORE.', VIPER),
    modes: [
      { id: 'acm20', name: '30×20', sensor: 'radar', area: ok(box([-15, 15], [-16, 4]), VIPER, '±15° az, +4° to −16° el as the research note gives it.'),
        rangeM: ok(10 * NM, VIPER), lock: autoLock(VIPER), lockS: dwell, key: ok('RCtrl+Right', VIPER_KEYS, 'TMS right.'), cue: 'none',
        note: 'The widest ACM pattern. First detection goes to STT with a "Lock" voice.' },
      { id: 'acm60', name: '10×60', sensor: 'radar', area: ok(box([-5, 5], [-7, 53]), VIPER, '±5° az, −7° to +53° el.'),
        rangeM: ok(10 * NM, VIPER), lock: autoLock(VIPER), lockS: dwell, key: ok('RCtrl+Down', VIPER_KEYS, 'TMS aft from NO RAD.'), cue: 'line',
        note: 'Vertical pattern: the HUD shows the fuselage reference line. Roll him onto it and pull.' },
      { id: 'acmbore', name: 'BORE', sensor: 'radar', area: nv(cone(1.5, 0, -3), VIPER, 'Centred 3° below the boresight; the 3° cone size is a trainer value.'),
        rangeM: ok(20 * NM, VIPER, 'Default 20 nm (5 / 10 / 20 / 40).'), lock: autoLock(VIPER), lockS: dwell, key: ok('RCtrl+Up', VIPER_KEYS, 'TMS up.'), cue: 'cross',
        note: 'The radar bore cross: put it on him.' },
    ],
    ir: {
      missile: 'aim9x',
      uncage: ok('key', VIPER_KEYS, 'UNCAGE switch.'), uncageKey: ok('C', VIPER_KEYS),
      seekerFovDeg: nv(2, TRAINER), launchLimitDeg: nv(90, 'data/missiles.ts seeker gimbal', 'AIM-9X limit from the missile gimbal data.'),
      readyCue: nv('high tone', TRAINER), tones: nv('growl, then a high tone when uncaged on him', TRAINER, 'Not in the research notes.'),
      fire: ok('RAlt+Space', VIPER_KEYS, 'WPN REL Button - Depress (hold). Space on this page is a trainer control.'),
    },
  },
  f14b: {
    entry: ok('The pilot has the ACM lock modes: PLM on its own button, VSL HI / VSL LO / PAL on the Target Designate switch.', TOMCAT),
    modes: [
      { id: 'plm', name: 'PLM', sensor: 'radar', area: nv(cone(2), TOMCAT, 'Antenna on the ADL (armament datum line); 4° cone is a trainer value.'),
        rangeM: ok(5 * NM, TOMCAT), lock: autoLock(TOMCAT), lockS: dwell, key: nv('PLM button', TOMCAT, 'No keyboard default in the notes.'), cue: 'circle',
        note: 'Pilot lock-on: point the nose at him. Ends in P-STT.' },
      { id: 'vslhi', name: 'VSL HI', sensor: 'radar', area: ok(box([-2.5, 2.5], [15, 55]), TOMCAT, '5° wide, +15° to +55°.'),
        rangeM: ok(5 * NM, TOMCAT), lock: autoLock(TOMCAT), lockS: dwell, key: nv('Target Designate up', TOMCAT, 'No keyboard default in the notes.'), cue: 'lines',
        note: 'Vertical scan high: for a bandit above the nose in the turn.' },
      { id: 'vsllo', name: 'VSL LO', sensor: 'radar', area: ok(box([-2.5, 2.5], [-15, 25]), TOMCAT, '5° wide, −15° to +25°.'),
        rangeM: ok(5 * NM, TOMCAT), lock: autoLock(TOMCAT), lockS: dwell, key: nv('Target Designate down', TOMCAT, 'No keyboard default in the notes.'), cue: 'lines',
        note: 'Vertical scan low: bandit near the nose.' },
      { id: 'pal', name: 'PAL', sensor: 'radar', area: nv(box([-20, 20], [-10, 10]), TOMCAT, '±20° az, 8 bars; the ±10° elevation is a trainer value.'),
        rangeM: ok(15 * NM, TOMCAT), lock: autoLock(TOMCAT), lockS: dwell, key: nv('Target Designate forward', TOMCAT, 'No keyboard default in the notes.'), cue: 'none',
        note: 'Pilot automatic lock-on: the first target within 15 nm.' },
    ],
    ir: {
      missile: 'aim9m',
      uncage: nv('key', TRAINER), uncageKey: nv('C', TRAINER, 'Trainer key.'),
      seekerFovDeg: nv(2, TRAINER), launchLimitDeg: nv(45, 'data/missiles.ts seeker gimbal'),
      readyCue: nv('high tone', TRAINER), tones: nv('growl, then a high tone', TRAINER), fire: nv('Space', TRAINER, 'Trainer key.'),
    },
  },
  jf17: {
    entry: ok('S1 forward enters ACM; S2 aft VT, forward BS, right HA. Auto-lock within 10 nm, then STT.', THUNDER),
    modes: [
      { id: 'vt', name: 'VT', sensor: 'radar', area: nv(box([-5, 5], [-10, 40]), THUNDER, '10° × 50° vertical; the −10° lower edge is a trainer value.'),
        rangeM: ok(10 * NM, THUNDER), lock: autoLock(THUNDER), lockS: dwell, key: ok('S2 aft', THUNDER), cue: 'lines', note: 'Vertical: roll him into the strip and pull.' },
      { id: 'bs', name: 'BS', sensor: 'radar', area: ok(cone(2), THUNDER, '4° cone.'),
        rangeM: ok(10 * NM, THUNDER), lock: autoLock(THUNDER), lockS: dwell, key: ok('S2 forward', THUNDER), cue: 'circle', note: 'Boresight: nose on him.' },
      { id: 'ha', name: 'HA', sensor: 'radar', area: nv(box([-12, 12], [-12, 10]), THUNDER, 'The whole HUD area; the HUD size is a trainer value.'),
        rangeM: ok(10 * NM, THUNDER), lock: autoLock(THUNDER), lockS: dwell, key: ok('S2 right', THUNDER), cue: 'none', note: 'HUD area: anything in the HUD.' },
    ],
    ir: {
      missile: 'pl5e',
      uncage: ok('key', THUNDER, 'T2 press uncages.'), uncageKey: ok('T2', THUNDER),
      seekerFovDeg: nv(2, TRAINER), launchLimitDeg: nv(45, 'data/missiles.ts seeker gimbal'),
      readyCue: ok('high tone', THUNDER, 'High tone = lock.'), tones: ok('seeker circle on the HUD, high tone on lock', THUNDER),
      fire: ok('S3', THUNDER),
    },
  },
  m2000c: {
    entry: ok('Weapons System CMD aft: boresight; forward: vertical / horizontal. Auto-lock within 10 nm into PSIC.', MIRAGE),
    modes: [
      { id: 'm2k-bore', name: 'Boresight', sensor: 'radar', area: ok(cone(1.5), MIRAGE, '3° cone.'),
        rangeM: ok(10 * NM, MIRAGE), lock: autoLock(MIRAGE), lockS: dwell, key: nv('Weapons System CMD aft', MIRAGE, 'No keyboard default.'), cue: 'circle', note: 'Nose on him.' },
      { id: 'm2k-vert', name: 'Vertical', sensor: 'radar', area: nv(box([-1.5, 1.5], [-10, 50]), MIRAGE, 'Two vertical lines from −10° to +50°; 3° width is a trainer value.'),
        rangeM: ok(10 * NM, MIRAGE), lock: autoLock(MIRAGE), lockS: dwell, key: nv('Weapons System CMD forward', MIRAGE, 'No keyboard default.'), cue: 'lines', note: 'Roll him between the lines and pull.' },
      { id: 'm2k-hud', name: 'HUD (SVI)', sensor: 'radar', area: ok(cone(10), MIRAGE, 'A spiral about a 20° cone.'),
        rangeM: ok(10 * NM, MIRAGE), lock: autoLock(MIRAGE), lockS: dwell, key: nv('Weapons System CMD forward', MIRAGE, 'No keyboard default.'), cue: 'none', note: 'Anything in the HUD cone.' },
    ],
    ir: {
      missile: 'magic2',
      uncage: ok('auto', MIRAGE, 'Growl tone, then fire; Magic Slave puts the seeker on the radar target.'), uncageKey: null,
      seekerFovDeg: nv(2, TRAINER, 'Seeker patterns MAG / MAV (wide or narrow) are not modelled: one 2° cone.'),
      launchLimitDeg: nv(55, 'data/missiles.ts seeker gimbal'),
      readyCue: nv('tone', TRAINER), tones: ok('growl tone', MIRAGE), fire: ok('Space', MIRAGE),
    },
  },
};

/** ACM data for any aircraft id; null for jets without it. */
export function acmFor(type: string): AcmJet | null {
  return (ACM as Partial<Record<string, AcmJet>>)[type] ?? null;
}

/** Every simplified or unverified ACM and IR value, in pilot words. */
export const ACM_CAVEATS: string[] = [
  'ACM scan areas are drawn in the flight-path frame (no angle of attack) and scanned instantly after a short dwell: simplified.',
  'FC3 close-combat lock range (10 km) and the HELMET 45° acquisition limit are trainer values. VS lock: the FC3 manual says automatic, the Su-27 manual says Enter held; the trainer locks automatically after 2 s.',
  'HELMET look follows the drill bandit independently of lock eligibility; its ring and X stay at the HUD edge when off screen: trainer aids. ACM locks drop beyond 60° or 1.5 times the acquisition range: trainer values.',
  'Hornet GACQ selects guns. Selecting the IR missile while in GACQ switches to BST in this trainer.',
  'FC3 HUD mode strings are not confirmed (the manuals name VS, ОПТ – СТРОБ, ШЛЕМ, Фи0).',
  'Unstated pattern sizes are trainer values: F-15C BORE cone, Hornet VACQ width, F-16C BORE cone, F-14 PLM cone and PAL elevation, JF-17 VT lower edge and HA size, M-2000C vertical width.',
  'IR seeker: one 2° cone for every missile (Fi0 2° is verified), growl when it sees heat, high tone when it tracks. Seeker tones, the F-15C and F-14 uncage rule and every launch limit except the R-73 45° are not verified.',
  'F-14B mode keys, uncage and fire, and M-2000C mode keys have no verified keyboard default. F-15C Space launching missiles is unverified; its documented Weapon Release and the Viper WPN REL use RAlt+Space. The page uses C to uncage and Space to fire as trainer controls.',
];
