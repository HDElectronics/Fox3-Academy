/**
 * [OWNER: sim] Flight-ops facts for the airfield pattern and approach trainer (issue #19).
 * Gameplay numbers as the DCS manuals and guides give them to the player: pattern speeds and altitudes,
 * on-speed AoA, gear and flap positions, glide path. Speeds in knots, altitudes in feet.
 * Anything not taken from a source is `verified: false` and listed in FLIGHT_OPS_CAVEATS and in
 * docs/api/data.md ("Uncertain values", "Flight ops").
 */
import type { FlightOpsJetData, FlightOpsJetId, FlightOpsNavData, Sourced } from '../sim/flightOps/types';

const HORNET = 'ED F/A-18C Early Access Guide, Airfield VFR Landing';
const VIPER = "Chuck's Guides, DCS F-16C Viper, Landing";
const EAGLE = 'ED F-15C Flaming Cliffs 3 manual, Landing';
const TOMCAT = 'Heatblur DCS F-14 manual, Landing Procedures';
const THUNDER = "Chuck's Guides, DCS JF-17 Thunder, Landing";
const MIRAGE = "Chuck's Guides, DCS M-2000C, Landing";
const SU27 = 'ED Su-27 Flaming Cliffs 3 manual';
const SU33 = 'ED Su-33 Flaming Cliffs 3 manual';
const MIG29 = 'ED MiG-29 Flaming Cliffs 3 manual';
const RU_KEYS = 'docs/research/ru-fc3.md, key table (Nav mode = 1)';
const EAGLE_KEYS = 'docs/research/f15c-fc3.md, key table (Navigation mode = 1)';

const ok = <T>(value: T, source: string, note?: string): Sourced<T> => ({ value, source, verified: true, note });
const nv = <T>(value: T, source: string, note?: string): Sourced<T> => ({ value, source, verified: false, note });

const NO_PATTERN = 'Pattern not published for this jet; Hornet value used.';
/** Hornet-like overhead pattern stand-in for jets whose manuals publish none. */
function standInPattern(source: string, gearMaxKt: Sourced<number>): FlightOpsJetData['pattern'] {
  return {
    initialKt: nv(350, source, NO_PATTERN),
    initialAltFt: nv(800, source, NO_PATTERN),
    breakG: nv(3.5, source, NO_PATTERN),
    downwindAltFt: nv(600, source, NO_PATTERN),
    abeamNm: nv(1.2, source, NO_PATTERN),
    gearMaxKt,
  };
}

/** Glide-slope intercept point for the return lesson: a gameplay value, on the 3° path (12 km · tan 3° ≈ 630 m). */
const INTERCEPT_M = 12000;
const INTERCEPT_ALT_M = 600;

/** FC3 Russian jets: one key cycles МРШ → ВЗВ → ПОС. */
function ruNav(source: string): FlightOpsNavData {
  return {
    modes: [{ id: 'route', label: 'МРШ' }, { id: 'return', label: 'ВЗВ' }, { id: 'landing', label: 'ПОС' }],
    keys: {
      modeCycle: ok('1', RU_KEYS, 'Cycles МРШ (route), ВЗВ (return), ПОС (landing).'),
      pointCycle: nv('LCtrl+~', source, 'Cycles waypoints or airfields; not yet in docs/research.'),
    },
    interceptPointM: nv(INTERCEPT_M, source, 'Not published; gameplay value on the extended centreline.'),
    interceptAltM: nv(INTERCEPT_ALT_M, source, 'Not published; gameplay value near the 3° path.'),
    autoLandingSwitch: nv(true, source, 'ВЗВ switches to ПОС at the glide-slope intercept point and the tower gives landing instructions (manual reading, not yet in docs/research).'),
    cues: ['МРШ', 'ВЗВ', 'ПОС'],
  };
}

const EAGLE_NAV: FlightOpsNavData = {
  modes: [{ id: 'route', label: 'NAV' }, { id: 'landing', label: 'ILSN' }],
  keys: { modeCycle: ok('1', EAGLE_KEYS, 'Selects NAV, then ILSN.') },
  interceptPointM: nv(INTERCEPT_M, EAGLE, 'Not published; gameplay value on the extended centreline.'),
  interceptAltM: nv(INTERCEPT_ALT_M, EAGLE, 'Not published; gameplay value near the 3° path.'),
  autoLandingSwitch: nv(false, EAGLE, 'The pilot selects ILSN.'),
  cues: ['GSUP', 'GSDN'],
};

const ruKeys = { gear: 'G', flaps: 'F', speedbrake: 'B' };
const RU_FLAPS = ['UP', 'TAKEOFF', 'LANDING'] as const;

function ruJet(id: 'su27' | 'j11a' | 'su33' | 'mig29s', source: string, approachKt: Sourced<number>,
  colors: FlightOpsJetData['aoa']['colors'], aoaNote: string): FlightOpsJetData {
  return {
    id,
    flapLabels: RU_FLAPS,
    landingFlap: 2,
    takeoffFlap: 1,
    keys: ruKeys,
    aoa: {
      unit: 'deg',
      onSpeed: nv(10, source, aoaNote),
      band: nv([9, 11], source, aoaNote),
      colors,
    },
    approachKt,
    pattern: standInPattern(source, nv(250, source, 'Gear limit not given; gameplay value.')),
    glideDeg: nv(3, source, 'FC3 ILS glide path; not verified.'),
    aimPointFt: nv(500, source, 'Not given; Hornet value used.'),
    hudCue: 'ПОС: fly the director to the glide path, AoA about 10°',
    nav: ruNav(source),
  };
}

export const FLIGHT_OPS: Record<FlightOpsJetId, FlightOpsJetData> = {
  fa18c: {
    id: 'fa18c',
    flapLabels: ['AUTO', 'HALF', 'FULL'],
    landingFlap: 2,
    takeoffFlap: 1,
    keys: { gear: 'G', flaps: 'F', speedbrake: 'B' },
    aoa: {
      unit: 'deg',
      onSpeed: ok(8.1, HORNET),
      band: ok([7.4, 8.8], HORNET),
      colors: { slow: null, on: 'amber', fast: null },
    },
    approachKt: nv(140, HORNET, 'Typical at landing weight; the trainer flies the AoA, not a speed.'),
    pattern: {
      initialKt: ok(350, HORNET),
      initialAltFt: ok(800, HORNET, 'AGL'),
      breakG: ok(3.5, HORNET, 'Rule of thumb: 1 % of airspeed (350 kt = 3.5 g). Break 5–10 s past the runway end.'),
      downwindAltFt: ok(600, HORNET, 'AGL'),
      abeamNm: ok(1.2, HORNET),
      gearMaxKt: nv(250, HORNET, 'Guide lowers gear and FULL flaps below 250 kt; the carrier section says 150 KIAS.'),
    },
    glideDeg: ok(3, HORNET),
    aimPointFt: ok(500, HORNET, 'Past the threshold.'),
    hudCue: 'E-bracket on the flight path marker',
  },
  f16c: {
    id: 'f16c',
    flapLabels: ['UP', 'DOWN (with gear)'],
    flapsWithGear: true,
    landingFlap: 1,
    takeoffFlap: 1,
    keys: { gear: 'G', flaps: 'No flap key', speedbrake: 'B' },
    aoa: {
      unit: 'deg',
      onSpeed: ok(11, VIPER, 'Fly 11–13°; 13° is the touchdown maximum.'),
      band: ok([11, 14], VIPER, 'Green doughnut 11–14°, red chevron above 14° (slow), yellow below 11° (fast).'),
      colors: { slow: 'red', on: 'green', fast: 'yellow' },
    },
    approachKt: nv(150, VIPER, 'Depends on weight; fly the AoA.'),
    pattern: {
      initialKt: ok(300, VIPER),
      initialAltFt: ok(1500, VIPER, 'AGL'),
      breakG: ok(3.5, VIPER, '3–4 g, about 70° bank, speed brake out.'),
      downwindAltFt: ok(1500, VIPER, 'AGL, 200–220 kt.'),
      abeamNm: nv(1.2, VIPER, 'Not given; Hornet value used.'),
      gearMaxKt: nv(300, VIPER, 'Not given; the lesson lowers the gear on downwind at 200–220 kt.'),
    },
    glideDeg: ok(2.5, VIPER, 'Final on the 2.5° line.'),
    aimPointFt: nv(500, VIPER, 'Not given; Hornet value used.'),
    hudCue: 'Flight path marker on the 2.5° line, AoA bracket',
  },
  f15c: {
    id: 'f15c',
    flapLabels: ['UP', 'DOWN'],
    landingFlap: 1,
    takeoffFlap: 1,
    keys: { gear: 'G', flaps: 'F', speedbrake: 'B' },
    aoa: {
      unit: 'units',
      onSpeed: ok(21, EAGLE),
      band: ok([20, 22], EAGLE),
      colors: { slow: null, on: null, fast: null },
    },
    approachKt: nv(180, EAGLE, 'Minimum on final per the manual reading; the quick start flies about 150 kt at the outer beacon.'),
    pattern: {
      initialKt: nv(350, EAGLE, 'Pattern not published for the F-15C; Hornet value used.'),
      initialAltFt: nv(800, EAGLE, 'Pattern not published; Hornet value used.'),
      breakG: nv(3.5, EAGLE, 'Pattern not published; Hornet value used.'),
      downwindAltFt: nv(600, EAGLE, 'Pattern not published; Hornet value used.'),
      abeamNm: nv(1.2, EAGLE, 'Pattern not published; Hornet value used.'),
      gearMaxKt: nv(250, EAGLE, 'Not verified.'),
    },
    glideDeg: ok(3, EAGLE, 'ILS glide slope.'),
    aimPointFt: nv(500, EAGLE, 'Not given; Hornet value used.'),
    hudCue: 'ILSN: GSUP / GSDN glide-slope cues',
    nav: EAGLE_NAV,
  },
  f14b: {
    id: 'f14b',
    flapLabels: ['UP', 'DN'],
    landingFlap: 1,
    takeoffFlap: 1,
    keys: { gear: 'G', flaps: 'F', speedbrake: 'B' },
    aoa: {
      unit: 'units',
      onSpeed: ok(15, TOMCAT),
      band: nv([14, 16], TOMCAT, 'On-speed band not given; ±1 unit used.'),
      colors: { slow: null, on: null, fast: null },
    },
    approachKt: nv(135, TOMCAT, 'Depends on weight; fly the AoA.'),
    pattern: {
      initialKt: ok(350, TOMCAT, 'Carrier break at 300–350 KIAS; the field pattern is not published.'),
      initialAltFt: ok(800, TOMCAT, 'Carrier break altitude; the field pattern is not published.'),
      breakG: nv(3.5, TOMCAT, NO_PATTERN),
      downwindAltFt: nv(600, TOMCAT, NO_PATTERN),
      abeamNm: nv(1.2, TOMCAT, NO_PATTERN),
      gearMaxKt: nv(250, TOMCAT, 'Not given; gameplay value.'),
    },
    glideDeg: nv(3, TOMCAT, 'Not given; 3° used.'),
    aimPointFt: nv(500, TOMCAT, 'Not given; Hornet value used.'),
    hudCue: 'On speed at 15 units AoA',
  },
  jf17: {
    id: 'jf17',
    flapLabels: ['UP', 'DOWN'],
    landingFlap: 1,
    takeoffFlap: 1,
    keys: { gear: 'G', flaps: 'F', speedbrake: 'B' },
    aoa: {
      unit: 'deg',
      onSpeed: ok(10, THUNDER, 'About 10°.'),
      band: nv([9, 11], THUNDER, 'Band not given; ±1° used.'),
      colors: { slow: null, on: null, fast: null },
    },
    approachKt: nv(150, THUNDER, 'Depends on weight; fly the AoA.'),
    pattern: standInPattern(THUNDER, nv(250, THUNDER, 'Not given; gameplay value.')),
    glideDeg: nv(3, THUNDER, 'Not given; 3° used.'),
    aimPointFt: nv(500, THUNDER, 'Not given; Hornet value used.'),
    hudCue: 'Flight path marker in the E-bracket',
  },
  m2000c: {
    id: 'm2000c',
    flapLabels: ['UP', 'DOWN'],
    landingFlap: 1,
    takeoffFlap: 1,
    keys: { gear: 'G', flaps: 'F', speedbrake: 'B' },
    aoa: {
      unit: 'deg',
      onSpeed: ok(14, MIRAGE, 'Trim to about 14°.'),
      band: nv([13, 15], MIRAGE, 'Band not given; ±1° used.'),
      colors: { slow: null, on: null, fast: null },
    },
    approachKt: nv(145, MIRAGE, 'Depends on weight; fly the AoA.'),
    pattern: standInPattern(MIRAGE, ok(230, MIRAGE, 'Gear down below 230 kt.')),
    glideDeg: nv(3, MIRAGE, 'Not given; 3° used.'),
    aimPointFt: nv(500, MIRAGE, 'Not given; Hornet value used.'),
    hudCue: 'Trim to about 14° AoA, velocity vector on the aim point',
  },
  su27: ruJet('su27', SU27, nv(146, SU27, 'Su-33 manual history quotes 270 km/h for the Su-27 approach; background only.'),
    { slow: null, on: null, fast: null }, 'The manual gives no approach AoA; gameplay value.'),
  j11a: ruJet('j11a', SU27, nv(146, SU27, 'Su-27 value used; background only.'),
    { slow: null, on: null, fast: null }, 'The manual gives no approach AoA; gameplay value.'),
  su33: ruJet('su33', SU33, nv(130, SU33, 'Manual history quotes 240 km/h for the Su-33 approach; background only.'),
    { slow: 'red', on: 'green', fast: 'yellow' }, 'ISM-1 indexer: yellow fast, green optimal, red slow; the manual gives no on-speed number, gameplay value.'),
  mig29s: ruJet('mig29s', MIG29, nv(140, MIG29, 'Not given; gameplay value.'),
    { slow: null, on: null, fast: null }, 'The manual gives no approach AoA; gameplay value.'),
};

export const FLIGHT_OPS_CAVEATS: string[] = [
  'Flight model: arcade. Speed, AoA and glide path follow simple gameplay rules tuned to the manual numbers, not DCS aerodynamics.',
  'Keys: gear G, flaps F, speed brake B follow common DCS defaults but are not verified per module.',
  'F-16C: no flap selector; the trailing-edge flaps lower with the gear. Abeam distance, gear limit and aim point are not in the source.',
  'F/A-18C: approach speed 140 kt and the 250 kt gear and FULL-flap limit are not verified (the carrier section says 150 KIAS).',
  'F-15C: the overhead pattern is not published; the Hornet numbers stand in. Approach speed 180 kt is not verified.',
  'F-14B: 15 units on speed is sourced; the ±1 unit band, approach speed, gear limit and field pattern are not (the 800 ft, 300–350 KIAS break is the carrier break).',
  'JF-17 and M-2000C: on-speed AoA is sourced (about 10°, about 14°); bands, approach speeds and the overhead pattern are stand-ins. M-2000C gear limit 230 kt is sourced.',
  'Su-27, J-11A, Su-33, MiG-29S: the manuals give no approach AoA or pattern; 10° on speed, the pattern and the gear limit are gameplay values. Flap labels UP / TAKEOFF / LANDING are English stand-ins.',
  'Su-33: indexer colours (yellow fast, green on, red slow) are from the ISM-1 description; the on-speed number is not.',
  'Nav: the mode key 1 is sourced; LCtrl+~ for waypoints, the automatic ВЗВ → ПОС switch, the 12 km / 600 m intercept point and the tower call wording are not verified. Route waypoints are lesson points, not DCS mission data.',
  'Touchdown zone is a trainer choice: 350 ft short to 1000 ft past the aim point, never short of the threshold.',
];
