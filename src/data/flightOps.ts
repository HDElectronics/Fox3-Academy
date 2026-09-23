/**
 * [OWNER: sim] Flight-ops facts for the airfield pattern and approach trainer (issue #19).
 * Gameplay numbers as the DCS manuals and guides give them to the player: pattern speeds and altitudes,
 * on-speed AoA, gear and flap positions, glide path. Speeds in knots, altitudes in feet.
 * Anything not taken from a source is `verified: false` and listed in FLIGHT_OPS_CAVEATS and in
 * docs/api/data.md ("Uncertain values", "Flight ops").
 */
import type {
  FlightOpsCarrierData, FlightOpsJetData, FlightOpsJetId, FlightOpsLaunchData, FlightOpsNavData, FlightOpsTakeoffData,
  Sourced,
} from '../sim/flightOps/types';
import { HORNET_CASE1, SHIP_CAVEATS, SUPERCARRIER, SU33_MANUAL } from './ships';

export { SHIPS, SHIP_HULL, SHIP_CAVEATS } from './ships';

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

const HORNET_TO = 'ED F/A-18C Early Access Guide, Takeoff';
const VIPER_TO = "Chuck's Guides, DCS F-16C Viper, Takeoff";
const EAGLE_TO = 'ED F-15C Flaming Cliffs 3 manual, Quick Start and Takeoff';
const TOMCAT_TO = 'Heatblur DCS F-14 manual, Takeoff (work-in-progress page)';
const THUNDER_TO = "Chuck's Guides, DCS JF-17 Thunder, Takeoff";
const MIRAGE_TO = "Chuck's Guides, DCS M-2000C, Takeoff";
/** Trainer standard takeoff weight for the F-16C Vr lookup, lb (a trainer choice). */
export const F16_TAKEOFF_WEIGHT_LB = 27000;
const F16_VR: readonly (readonly [number, number])[] = [[20000, 128], [44000, 198]];

const ok = <T>(value: T, source: string, note?: string): Sourced<T> => ({ value, source, verified: true, note });
const nv = <T>(value: T, source: string, note?: string): Sourced<T> => ({ value, source, verified: false, note });

/** Linear lookup in a [lb, kt] Vr schedule (clamped at the ends), rounded to the knot. */
export function vrAtWeight(table: readonly (readonly [number, number])[], lb: number): number {
  let i = 1;
  while (i < table.length - 1 && lb > table[i]![0]) i++;
  const p = table[i - 1]!, q = table[i]!;
  const f = Math.min(1, Math.max(0, (lb - p[0]) / (q[0] - p[0])));
  return Math.round(p[1] + f * (q[1] - p[1]));
}

/** "Call the ball" is a radio-menu call in DCS (F1 LSO, then Ball). The trainer maps it to one key. */
const BALL_KEY_NOTE = 'Trainer key: in DCS the ball call is made from the radio menu.';
const TOMCAT_CASE1 = 'Heatblur DCS F-14 manual, Landing Procedures (carrier)';
const NOT_FOR_JET = 'Not given for this jet; Hornet / Supercarrier value used.';

const HORNET_CARRIER: FlightOpsCarrierData = {
  ship: 'cvn',
  hookKey: ok('H', HORNET_CASE1, 'Hook handle down.'),
  ballCallKey: nv('Y', HORNET_CASE1, BALL_KEY_NOTE),
  pattern: {
    initialKt: ok(350, HORNET_CASE1, 'KIAS at the initial.'),
    initialAltFt: ok(800, SUPERCARRIER, 'Initial 3 nm astern at 800 ft, just outboard of the starboard side.'),
    breakIntervalS: ok([15, 20], SUPERCARRIER, 'Interval between jets in the break; break before 4 nm.'),
    downwindAltFt: ok(600, SUPERCARRIER),
    abeamNm: ok([1.25, 1.5], SUPERCARRIER),
    ninetyAltFt: nv([450, 500], TOMCAT_CASE1, NOT_FOR_JET.replace('Hornet / Supercarrier', 'Tomcat')),
    ballNm: ok(0.75, SUPERCARRIER, 'Groove wings level at ¾ nm and call the ball; CLARA with no ball.'),
    grooveS: nv([18, 24], SUPERCARRIER, 'Not given for the Hornet; trainer band for wings level at ¾ nm at on-speed closure.'),
    gearFlapsMaxKt: ok(150, HORNET_CASE1, 'Gear and FULL flaps below 150 KIAS; about 145 KIAS on speed.'),
  },
  touchdownPower: ok('max', SUPERCARRIER, 'Throttles to max power at touchdown (MIL in the trainer).'),
};

const TOMCAT_CARRIER: FlightOpsCarrierData = {
  ship: 'cvn',
  hookKey: nv('H', TOMCAT_CASE1, 'Hook key not given in the manual reading; Hornet key used.'),
  ballCallKey: nv('Y', TOMCAT_CASE1, BALL_KEY_NOTE),
  pattern: {
    initialKt: ok(350, TOMCAT_CASE1, 'Break at 300–350 KIAS.'),
    initialAltFt: ok(800, TOMCAT_CASE1, 'Break at 800 ft.'),
    breakIntervalS: ok([15, 17], TOMCAT_CASE1),
    downwindAltFt: ok(600, SUPERCARRIER),
    abeamNm: ok([1.25, 1.5], SUPERCARRIER),
    ninetyAltFt: ok([450, 500], TOMCAT_CASE1, 'The 90 at 450–500 ft.'),
    ballNm: ok(0.6, TOMCAT_CASE1, 'Ball at about 0.6 nm.'),
    grooveS: ok([15, 18], TOMCAT_CASE1, '15–18 s in the groove.'),
    gearFlapsMaxKt: nv(250, TOMCAT_CASE1, 'Not given; gameplay value.'),
  },
  touchdownPower: ok('MIL', SUPERCARRIER, 'MIL at touchdown: afterburner waveoffs are prohibited in the Tomcat.'),
};

const SU33_CARRIER: FlightOpsCarrierData = {
  ship: 'kuznetsov',
  hookKey: ok('LAlt+G', SU33_MANUAL, 'Tail hook.'),
  ballCallKey: nv('Y', SU33_MANUAL, 'Trainer key; no ball call is verified for the Kuznetsov.'),
  pattern: {
    initialKt: nv(350, SUPERCARRIER, NOT_FOR_JET),
    initialAltFt: nv(800, SUPERCARRIER, NOT_FOR_JET),
    breakIntervalS: nv([15, 20], SUPERCARRIER, NOT_FOR_JET),
    downwindAltFt: nv(600, SUPERCARRIER, NOT_FOR_JET),
    abeamNm: nv([1.25, 1.5], SUPERCARRIER, NOT_FOR_JET),
    ninetyAltFt: nv([450, 500], TOMCAT_CASE1, 'Not given for this jet; Tomcat value used.'),
    ballNm: nv(0.75, SUPERCARRIER, 'Luna-3 in sight; Supercarrier value used.'),
    grooveS: nv([18, 24], SUPERCARRIER, 'Not given; the Hornet trainer band is used.'),
    gearFlapsMaxKt: nv(250, SU33_MANUAL, 'Gear limit not given; gameplay value.'),
  },
  touchdownPower: nv('max', SUPERCARRIER, 'Not given for the Su-33; Supercarrier rule used.'),
};

const HORNET_CAT = 'ED F/A-18C Early Access Guide, Carrier takeoff';
const TOMCAT_CAT = 'Heatblur DCS F-14 training lesson, carrier takeoff';
const SALUTE_CONFLICT = 'The Supercarrier guide gives LCtrl+LShift+LAlt+S or the radio menu; the Heatblur Tomcat lesson gives LShift+U. Conflict, not verified in game.';
const TRAINER_KEY = 'Default key not verified; trainer key.';

/** Hornet catapult (#27): NWS HI, launch bar, hook up, T/O trim by weight, MIL, wipe out, salute, hands off. */
const HORNET_LAUNCH: FlightOpsLaunchData = {
  kind: 'catapult',
  ship: 'cvn',
  steps: [
    { id: 'nwsHi', label: 'NWS HI', key: ok('S', HORNET_CAT), note: 'Wings spread before taxi onto the catapult; the trainer starts spread.' },
    { id: 'launchBar', label: 'Launch bar down', key: nv('L', HORNET_CAT, TRAINER_KEY), note: 'Behind the shuttle.' },
    { id: 'hookUp', label: 'Hook up', key: ok('U', SUPERCARRIER) },
    { id: 'trim', label: 'T/O trim', key: null, note: 'Trim for the gross weight.' },
    { id: 'power', label: 'MIL', key: null, note: 'Afterburner at 49000 lb and above.' },
    { id: 'wipeOut', label: 'Wipe out controls', key: nv('K', HORNET_CAT, TRAINER_KEY), note: 'Full stick and rudder travel.' },
    { id: 'salute', label: 'Salute', key: nv('LCtrl+LShift+LAlt+S', SUPERCARRIER, SALUTE_CONFLICT) },
    { id: 'handsOff', label: 'Hands off', key: null, note: 'The flight controls rotate the jet.' },
  ],
  power: ok('MIL', HORNET_CAT),
  abFromLb: ok(49000, HORNET_CAT),
  trimByWeightLb: ok([[44000, 16], [49000, 17], [Number.POSITIVE_INFINITY, 19]], HORNET_CAT,
    '16° below 44000 lb, 17° at 45000–48000 lb, 19° at 49000 lb and above. The trainer puts the gaps in the 17° band.'),
  weights: { unit: 'lb', normal: 42000, heavy: 50000 },
  stations: [1, 2],
  clearingTurn: ok({ 1: 'right', 2: 'right', 3: 'left', 4: 'left' }, SUPERCARRIER),
  after: { flapLabel: 'AUTO', cue: 'Gear up, flaps AUTO, clearing turn' },
  cue: 'NWS HI, launch bar, hook up, trim, MIL, wipe out, salute, hands off',
};

/** Tomcat catapult (#27), Heatblur lesson: hook up, MIL, salute, hands off. */
const TOMCAT_LAUNCH: FlightOpsLaunchData = {
  kind: 'catapult',
  ship: 'cvn',
  steps: [
    { id: 'hookUp', label: 'Hook up', key: ok('U', TOMCAT_CAT) },
    { id: 'power', label: 'MIL', key: null, note: 'MIL for the shot; not verified in the lesson text.' },
    { id: 'salute', label: 'Salute', key: ok('LShift+U', TOMCAT_CAT, `Verified for the Heatblur lesson text only. ${SALUTE_CONFLICT}`) },
    { id: 'handsOff', label: 'Hands off', key: null, note: 'Not verified for the Tomcat; the trainer grades it as for the Hornet.' },
  ],
  power: nv('MIL', TOMCAT_CAT, 'MIL, no afterburner: not verified.'),
  weights: { unit: 'lb', normal: 60000, heavy: 70000 },
  stations: [1, 2],
  clearingTurn: ok({ 1: 'right', 2: 'right', 3: 'left', 4: 'left' }, SUPERCARRIER),
  after: { flapLabel: 'UP', cue: 'Gear up, flaps up, clearing turn' },
  cue: 'Hook up, MIL, salute, hands off',
};

/** Su-33 ski-jump (#27): full afterburner against the stoppers, special afterburner, run, ramp. */
const SU33_LAUNCH: FlightOpsLaunchData = {
  kind: 'skiJump',
  ship: 'kuznetsov',
  steps: [
    { id: 'power', label: 'Full afterburner', key: null, note: 'The deck stoppers hold the jet during the run-up.' },
    { id: 'specialAB', label: 'Special afterburner', key: ok('LShift+E', SUPERCARRIER, '10-minute limit.') },
    { id: 'release', label: 'Stoppers release', key: null, note: 'How the stoppers release is not verified; the trainer releases them 3 s after full afterburner.' },
  ],
  power: ok('AB', SUPERCARRIER, 'Full afterburner, then special afterburner.'),
  weights: { unit: 'kg', normal: 26000, heavy: 32000 },
  stations: [1, 3],
  runM: ok({ 1: 90, 2: 90, 3: 180 }, SUPERCARRIER, 'Positions 1 and 2 give a 90 m run, position 3 gives 180 m: use it heavy.'),
  shortRunMaxWeight: nv(29000, SU33_MANUAL, 'The guide says to use position 3 heavy; the weight limit is a gameplay value.'),
  avoid: { fodScreens: ok('LAlt+I', SU33_MANUAL, 'Intake FOD screens cost 12 % thrust: do not use them for the launch.') },
  after: { flapLabel: 'UP', cue: 'Gear up, flaps up, climb' },
  cue: 'Full afterburner, special afterburner, hold on the stoppers, run, ramp',
};

const WHEEL_BRAKE_KEY = 'DCS common default wheel-brake key; not in the source for this module.';
const NO_TAILSTRIKE = 'Not published; gameplay value above the rotation band.';

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

/** FC3 Russian jets: the manuals give no rotation speed or attitude; gameplay values, all not verified. */
function ruTakeoff(source: string, vrKt: number, kmh: number, extra = ''): FlightOpsTakeoffData {
  return {
    vrKt: nv(vrKt, source, `Not published; gameplay value (about ${kmh} km/h).${extra}`),
    pitchDeg: nv([8, 12], source, 'Not published; gameplay band around 10°.'),
    tailStrikeDeg: nv(15, source, NO_TAILSTRIKE),
    gearUpMaxKt: nv(270, source, 'Not published; gameplay value (about 500 km/h).'),
    afterburner: nv(true, source, 'Full afterburner assumed; not published in the FC3 manual reading.'),
    flapIndex: 1,
    keys: {
      brakes: nv('W', source, 'FC3 wheel-brake key as the F-15C quick start gives it; not confirmed in docs/research/ru-fc3.md.'),
      throttleMax: nv('PgUp', source, 'FC3 default throttle key; not in docs/research.'),
    },
    cue: `Flaps TAKEOFF, hold W, full afterburner, release. Rotate at about ${kmh} km/h to 8–12°, gear up with a positive climb`,
  };
}
const RU_FLAPS = ['UP', 'TAKEOFF', 'LANDING'] as const;

function ruJet(id: 'su27' | 'j11a' | 'su33' | 'mig29s', source: string, approachKt: Sourced<number>,
  colors: FlightOpsJetData['aoa']['colors'], aoaNote: string, takeoff: FlightOpsTakeoffData): FlightOpsJetData {
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
    takeoff,
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
    carrier: HORNET_CARRIER,
    launch: HORNET_LAUNCH,
    takeoff: {
      vrKt: nv(145, HORNET_TO, 'The guide gives no rotation speed; gameplay value.'),
      pitchDeg: ok([6, 8], HORNET_TO, 'Rotate to 6–8° nose-high.'),
      tailStrikeDeg: nv(12, HORNET_TO, NO_TAILSTRIKE),
      gearUpMaxKt: nv(250, HORNET_TO, 'Not given in the takeoff section; the landing gear limit is used.'),
      afterburner: nv(false, HORNET_TO, 'MIL used; the guide reading does not fix MIL or MAX.'),
      flapIndex: 1,
      keys: { brakes: nv('W', HORNET_TO, WHEEL_BRAKE_KEY) },
      cue: 'Flaps HALF, T/O trim. Rotate to 6–8° nose-high, gear up, then flaps AUTO',
    },
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
    takeoff: {
      vrKt: ok(vrAtWeight(F16_VR, F16_TAKEOFF_WEIGHT_LB), VIPER_TO, `Interpolated from the guide's Vr table at ${F16_TAKEOFF_WEIGHT_LB} lb (the trainer's standard weight).`),
      vrByWeightLb: ok(F16_VR, VIPER_TO, 'Rotation speed from 128 kt at 20000 lb to 198 kt at 44000 lb.'),
      pullEarlyKt: ok(10, VIPER_TO, 'Start the pull 10 kt before Vr in MIL, 15 kt in afterburner. The lesson flies MIL.'),
      pitchDeg: ok([8, 12], VIPER_TO),
      tailStrikeDeg: nv(15, VIPER_TO, NO_TAILSTRIKE),
      gearUpMaxKt: ok(300, VIPER_TO, 'Gear up before 300 kt.'),
      afterburner: ok(false, VIPER_TO, 'The guide gives MIL and afterburner takeoffs; the lesson uses MIL.'),
      flapIndex: 1,
      keys: { brakes: nv('W', VIPER_TO, WHEEL_BRAKE_KEY) },
      cue: 'MIL, release brakes. Pull 10 kt before Vr to 8–12°, gear up before 300 kt; the flaps follow',
    },
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
    takeoff: {
      vrKt: nv(150, EAGLE_TO, 'Quick start rotates at 150 kt; the detailed takeoff section instead pulls the stick half back at 100 kt and holds 10° after nosewheel lift-off.'),
      pitchDeg: nv([8, 12], EAGLE_TO, 'Band around the 10° hold of the detailed takeoff section.'),
      tailStrikeDeg: nv(15, EAGLE_TO, NO_TAILSTRIKE),
      gearUpMaxKt: nv(250, EAGLE_TO, 'Not given; the landing gear limit is used.'),
      afterburner: nv(false, EAGLE_TO, 'MIL used; not fixed in this reading.'),
      flapIndex: 1,
      keys: {
        brakes: ok('W', EAGLE_TO, 'Hold W (wheel brakes) while the engines spool up.'),
        throttleMax: nv('PgUp', EAGLE_TO, 'FC3 default throttle key; not confirmed in this reading.'),
      },
      cue: 'Flaps DOWN, hold W, throttle up, release. Rotate at 150 kt, hold 10°, gear and flaps up',
    },
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
    carrier: TOMCAT_CARRIER,
    launch: TOMCAT_LAUNCH,
    takeoff: {
      vrKt: nv(145, TOMCAT_TO, 'Heatblur takeoff page is a work in progress; gameplay value.'),
      pitchDeg: nv([8, 12], TOMCAT_TO, 'Not published; gameplay band.'),
      tailStrikeDeg: nv(14, TOMCAT_TO, NO_TAILSTRIKE),
      gearUpMaxKt: nv(250, TOMCAT_TO, 'Not published; the landing gear limit is used.'),
      afterburner: nv(false, TOMCAT_TO, 'Not published; MIL used.'),
      flapIndex: 1,
      keys: { brakes: nv('W', TOMCAT_TO, WHEEL_BRAKE_KEY) },
      cue: 'Flaps DN, MIL, release brakes. Rotate to 8–12°, gear and flaps up with a positive climb',
    },
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
    takeoff: {
      vrKt: ok(140, THUNDER_TO, 'About 140 kt. Takeoff trim is set automatically above 41 kt.'),
      pullEarlyKt: ok(20, THUNDER_TO, 'Start pulling at 120 kt.'),
      pitchDeg: nv([8, 12], THUNDER_TO, 'Pitch attitude not given; gameplay band.'),
      tailStrikeDeg: nv(14, THUNDER_TO, NO_TAILSTRIKE),
      gearUpMaxKt: ok(300, THUNDER_TO, 'Gear up at 30 ft and below 300 kt.'),
      afterburner: nv(false, THUNDER_TO, 'MIL used; not fixed in this reading.'),
      flapIndex: 1,
      keys: { brakes: nv('W', THUNDER_TO, WHEEL_BRAKE_KEY) },
      cue: 'Release brakes, auto T/O trim above 41 kt. Pull at 120 kt, lift off about 140 kt, gear up at 30 ft',
    },
  },
  m2000c: {
    id: 'm2000c',
    noFlapControl: true,
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
    takeoff: {
      vrKt: nv(150, MIRAGE_TO, 'Rotation speed not given; gameplay value.'),
      pitchDeg: nv([10, 12.5], MIRAGE_TO, 'Band not given; kept below the 13° tail-strike attitude.'),
      tailStrikeDeg: ok(13, MIRAGE_TO, 'Keep pitch below 13° to avoid a tail strike.'),
      gearUpMaxKt: ok(260, MIRAGE_TO, 'Gear up before 260 kt.'),
      afterburner: ok(true, MIRAGE_TO, 'Full afterburner.'),
      flapIndex: null,
      keys: { brakes: nv('W', MIRAGE_TO, WHEEL_BRAKE_KEY) },
      cue: 'Nose-wheel steering for the start of the roll, full afterburner. Rotate below 13°, gear up before 260 kt',
    },
  },
  su27: ruJet('su27', SU27, nv(146, SU27, 'Su-33 manual history quotes 270 km/h for the Su-27 approach; background only.'),
    { slow: null, on: null, fast: null }, 'The manual gives no approach AoA; gameplay value.',
    ruTakeoff(SU27, 140, 260)),
  j11a: ruJet('j11a', SU27, nv(146, SU27, 'Su-27 value used; background only.'),
    { slow: null, on: null, fast: null }, 'The manual gives no approach AoA; gameplay value.',
    ruTakeoff(SU27, 140, 260, ' Su-27 value used.')),
  su33: { ...ruJet('su33', SU33, nv(130, SU33, 'Manual history quotes 240 km/h for the Su-33 approach; background only.'),
    { slow: 'red', on: 'green', fast: 'yellow' }, 'ISM-1 indexer: yellow fast, green optimal, red slow; the manual gives no on-speed number, gameplay value.',
    ruTakeoff(SU33, 135, 250, ' Runway takeoff; the ski-jump is the launch lesson.')), carrier: SU33_CARRIER, launch: SU33_LAUNCH },
  mig29s: ruJet('mig29s', MIG29, nv(140, MIG29, 'Not given; gameplay value.'),
    { slow: null, on: null, fast: null }, 'The manual gives no approach AoA; gameplay value.',
    ruTakeoff(MIG29, 135, 250)),
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
  'Takeoff: the F-16C Vr table, 10 kt early pull, 8–12° and 300 kt gear limit, the Hornet 6–8° and HALF flaps, the JF-17 120 kt pull, about 140 kt and 300 kt gear limit, the M-2000C full afterburner, 13° tail strike and 260 kt gear limit, and the F-15C W brake key are sourced. Other rotation speeds, pitch bands, tail-strike attitudes, gear limits and brake keys are gameplay values. F-15C: the quick start rotates at 150 kt; the detailed section pulls at 100 kt and holds 10°.',
  'M-2000C: no pilot flap control (elevons, automatic slats); the trainer has no flap keys or flap grading for it.',
  'Takeoff ground roll, rotation and liftoff are arcade rules tied to Vr and the pitch band, not a takeoff performance model.',
  'Touchdown zone is a trainer choice: 350 ft short to 1000 ft past the aim point, never short of the threshold.',
  'Carrier: Hornet hook H, 350 KIAS / 800 ft initial, 600 ft downwind 1¼–1½ nm abeam, ball at ¾ nm, gear and FULL flaps below 150 KIAS, and the Tomcat 800 ft 300–350 KIAS break, 15–17 s interval, 90 at 450–500 ft, ball at 0.6 nm, 15–18 s groove and MIL at touchdown are sourced. The Tomcat hook key, the ball-call key Y (DCS uses the radio menu), the Hornet groove time and 90 altitude and the whole Su-33 Case I pattern are not.',
  'Carrier: LSO calls, ball cells, the grade and the wire rule are arcade rules built on the Supercarrier guide thresholds; the grade comment bands and pass penalties are trainer choices.',
  'Launch: Hornet NWS HI S, hook up U, T/O trim 16° / 17° / 19° by weight, MIL (afterburner from 49000 lb), wipe out, salute and hands off; Tomcat hook up U and salute LShift+U (Heatblur lesson text); clearing turn right from catapults 1–2 and left from 3–4; Su-33 runs of 90 m (positions 1–2) and 180 m (position 3, heavy), full then special afterburner LShift+E (10-minute limit), no FOD screens LAlt+I (−12 % thrust) are sourced. Not verified: the Hornet salute key (LCtrl+LShift+LAlt+S or the radio menu against LShift+U), the launch bar and wipe-out trainer keys, Tomcat MIL and hands off, the stopper release, the 29000 kg short-run limit and the trainer launch weights.',
  'Launch: the catapult stroke (2.5 s to the approach speed + 15 kt), the shooter delay, the ski-jump run acceleration, the 12° ramp, the minimum ramp speed (0.85 of the approach speed) and the settle after a cold cat or a short run are arcade rules, not catapult or ski-jump performance.',
  ...SHIP_CAVEATS,
];
