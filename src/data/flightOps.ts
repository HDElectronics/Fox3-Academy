/**
 * [OWNER: sim] Flight-ops facts for the airfield pattern and approach trainer (issue #19).
 * Gameplay numbers as the DCS manuals and guides give them to the player: pattern speeds and altitudes,
 * on-speed AoA, gear and flap positions, glide path. Speeds in knots, altitudes in feet.
 * Anything not taken from a source is `verified: false` and listed in FLIGHT_OPS_CAVEATS and in
 * docs/api/data.md ("Uncertain values", "Flight ops").
 */
import type { FlightOpsJetData, FlightOpsJetId, Sourced } from '../sim/flightOps/types';

const HORNET = 'ED F/A-18C Early Access Guide, Airfield VFR Landing';
const VIPER = "Chuck's Guides, DCS F-16C Viper, Landing";
const EAGLE = 'ED F-15C Flaming Cliffs 3 manual, Landing';

const ok = <T>(value: T, source: string, note?: string): Sourced<T> => ({ value, source, verified: true, note });
const nv = <T>(value: T, source: string, note?: string): Sourced<T> => ({ value, source, verified: false, note });

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
  },
};

export const FLIGHT_OPS_CAVEATS: string[] = [
  'Flight model: arcade. Speed, AoA and glide path follow simple gameplay rules tuned to the manual numbers, not DCS aerodynamics.',
  'Keys: gear G, flaps F, speed brake B follow common DCS defaults but are not verified per module.',
  'F-16C: no flap selector; the trailing-edge flaps lower with the gear. Abeam distance, gear limit and aim point are not in the source.',
  'F/A-18C: approach speed 140 kt and the 250 kt gear and FULL-flap limit are not verified (the carrier section says 150 KIAS).',
  'F-15C: the overhead pattern is not published; the Hornet numbers stand in. Approach speed 180 kt is not verified.',
  'Touchdown zone is a trainer choice: 350 ft short to 1000 ft past the aim point, never short of the threshold.',
];
