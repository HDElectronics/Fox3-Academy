/**
 * [OWNER: data] Missile facts as DCS models them (docs/research/missiles.md, bvr-mechanics.md, per-jet notes).
 * Physics constants for the flight model live in src/sim/missileModel.ts (sim-physics).
 *
 * Field sources:
 * - massKg, diameterM, burnS, maxMach, maxG: DCS Lua (datamine build 2.9.29). maxMach is the Lua Mach_max
 *   field, a legacy/AI value; new-API missiles are really limited by drag and thrust.
 * - lengthM: real-world / ED manual text (the Lua has no length).
 * - ref: ED's own launch table (ModelData[50..55]): shooter and target both at 900 km/h (~M0.85 at 10 km).
 *   Table values, not flight results. See MISSILE_REF_NOTE.
 * - chaffSusceptibility: the Lua ccm_k0 factor (0 = immune, 1 = default), clamped to 0..1. IR missiles are 0
 *   (chaff does nothing to them); their flare factor is in the notes.
 * - pitbullKm for AMRAAM-class missiles is not published; values are the best reading and marked (approx.).
 */
import type { MissileId, MissileSpec } from './types';

/** Caption for ref ranges wherever they are shown. */
export const MISSILE_REF_NOTE =
  'Reference ranges are ED\'s DCS launch table (shooter and target at 900 km/h, about M0.85 at 10 km): 10 km head-on, ' +
  '10 km with the target running away, and 1 km head-on. They drive the FC3/AI launch zone; the real missile may do better or worse.';

/**
 * How much an IR seeker falls for flares, 0 (immune) .. 1 (very gullible), on the same scale as
 * chaffSusceptibility: the Lua IR ccm_k0 clamped to 0..1 (AIM-9X 0.2; AIM-9M, R-73, R-27T/ET, PL-5EII 0.5;
 * Magic II 2.0 → 1). Radar missiles are 0. Not in MissileSpec yet (requested from the architect).
 */
export const FLARE_SUSCEPTIBILITY: Record<MissileId, number> = {
  r27r: 0, r27er: 0, r27t: 0.5, r27et: 0.5, r77: 0, r73: 0.5,
  aim120b: 0, aim120c: 0, aim7m: 0, aim9m: 0.5, aim9x: 0.2,
  aim54a: 0, aim54c: 0, sd10: 0, pl5e: 0.5, s530d: 0, magic2: 1,
};

type Def = Omit<MissileSpec, 'id'>;
const m = (id: MissileId, d: Def): MissileSpec => ({ id, ...d });

const SARH_RULE_R27 = 'Hold STT on the target until impact; if the lock breaks, relock at once or the missile is lost.';
const IR_R27_RULE = 'Get the seeker lock (ПР) before you fire; after launch it is on its own, so turn away or defend.';
const AMRAAM_RULE = 'Keep a track on the target (TWS or STT) until the missile goes active, then you may turn away.';
const PHOENIX_RULE =
  'From TWS keep the target inside the scan until its TTI blinks (active command sent); from PD-STT hold the lock to impact.';

export const MISSILES: Record<MissileId, MissileSpec> = {
  r27r: m('r27r', {
    name: 'R-27R', nato: 'AA-10 Alamo-A', fox: 1, seeker: 'sarh', midcourse: 'none', lofts: false,
    seekerRangeKm: 60, seekerGimbalDeg: 55,
    massKg: 253, lengthM: 4.0, diameterM: 0.23, burnS: 6, maxMach: 4.5, maxG: 25,
    ref: { highHeadOnKm: 35, highColdKm: 12, lowHeadOnKm: 16 },
    chaffSusceptibility: 0.5,
    guidanceRule: SARH_RULE_R27,
    notes: [
      'Semi-active: it homes on your radar\'s reflection, with inertial flight and radio correction in midcourse.',
      'Since 2.9.20 (Sep 2025) the seeker merges several targets or chaff inside its range and speed gate into one, which can pull it off the target.',
      'Since 2.9.27 (Jun 2026) glint noise and time-to-hit angle gating can cause misses.',
      'If your lock breaks it goes dumb and will not chase chaff; relock quickly and it can continue.',
      'No loft, and pitching up to loft it gains nothing since 2.9.20. Cannot be launched beyond 120° of bank.',
      'Battery (autopilot op_time) 60 s.',
    ],
  }),
  r27er: m('r27er', {
    name: 'R-27ER', nato: 'AA-10 Alamo-C', fox: 1, seeker: 'sarh', midcourse: 'none', lofts: false,
    seekerRangeKm: 60, seekerGimbalDeg: 55,
    massKg: 351, lengthM: 4.78, diameterM: 0.26, burnS: 8, maxMach: 4.0, maxG: 25,
    ref: { highHeadOnKm: 59, highColdKm: 27, lowHeadOnKm: 25.5 },
    chaffSusceptibility: 0.5,
    guidanceRule: SARH_RULE_R27,
    notes: [
      'Same seeker and rules as the R-27R with a two-stage motor: 2.5 s boost + 5.5 s sustain.',
      'ED\'s Su-27 manual: 66 km forward hemisphere at 10 km, 28 km at 1 km, 10 km rear hemisphere at 1 km.',
      'Battery 60 s: after that it is dead even with speed left.',
      'Multitarget seeker (2.9.20) and glint noise (2.9.27) as the R-27R.',
      'No loft; the autopilot corrects a manual pitch-up since 2.9.20.',
    ],
  }),
  r27t: m('r27t', {
    name: 'R-27T', nato: 'AA-10 Alamo-B', fox: 2, seeker: 'ir', midcourse: 'none', lofts: false,
    seekerRangeKm: 25, seekerGimbalDeg: 60,
    massKg: 245, lengthM: 3.7, diameterM: 0.23, burnS: 6, maxMach: 3.2, maxG: 25,
    ref: { highHeadOnKm: 31, highColdKm: 11, lowHeadOnKm: 14 },
    chaffSusceptibility: 0,
    guidanceRule: IR_R27_RULE,
    notes: [
      'Cooled IR seeker that must lock before launch.',
      'No RWR warning at all: the target only knows if he sees the smoke.',
      'Seeker sensitivity 25 km against a hot target; lock range is shorter head-on or without afterburner.',
      'Flare factor (Lua ccm_k0) 0.5, medium. Can be cued by radar or IRST.',
      'Length 3.7 m per ED; public sources say about 3.8 m.',
    ],
  }),
  r27et: m('r27et', {
    name: 'R-27ET', nato: 'AA-10 Alamo-D', fox: 2, seeker: 'ir', midcourse: 'none', lofts: false,
    seekerRangeKm: 25, seekerGimbalDeg: 60,
    massKg: 343, lengthM: 4.5, diameterM: 0.26, burnS: 8, maxMach: 4.0, maxG: 25,
    ref: { highHeadOnKm: 58, highColdKm: 25.5, lowHeadOnKm: 24 },
    chaffSusceptibility: 0,
    guidanceRule: IR_R27_RULE,
    notes: [
      'The ER motor with an IR seeker: the table reach is long, but the seeker (25 km against a hot target) must lock first.',
      'No RWR warning. Cue it with the IRST and nothing warns him at all.',
      'Flare factor (Lua ccm_k0) 0.5, medium.',
    ],
  }),
  r77: m('r77', {
    name: 'R-77', nato: 'AA-12 Adder', fox: 3, seeker: 'arh', midcourse: 'datalink', lofts: false,
    pitbullKm: 15, seekerRangeKm: 16, seekerGimbalDeg: 60,
    massKg: 175, lengthM: 3.6, diameterM: 0.19, burnS: 5.1, maxMach: 4.0, maxG: 40,
    ref: { highHeadOnKm: 45, highColdKm: 18, lowHeadOnKm: 17.7 },
    chaffSusceptibility: 0.2,
    guidanceRule: 'Hold STT until the missile is inside about 15 km of the target, then you may drop lock or switch targets.',
    notes: [
      'Legacy flight model: one 5.1 s motor, no loft. Community tests find it the weakest Fox 3 against manoeuvring targets.',
      'FC3 fires it from STT only (the MiG-29S СНП2 two-target shot excepted). The manual lets you switch targets once it is within 15 km of its target.',
      'Seeker lock-on about 16 km against 5 m² (manual). Battery 70 s. Homes on jamming.',
      'Pitbull at ~15 km is the manual\'s switch-away range (Lua D_max is also 15 km). What it does if you drop lock earlier is not verified; this trainer flies it on to the last estimate.',
      'Chaff factor (Lua ccm_k0) 0.2.',
    ],
  }),
  r73: m('r73', {
    name: 'R-73', nato: 'AA-11 Archer', fox: 2, seeker: 'ir', midcourse: 'none', lofts: false,
    seekerRangeKm: 20, seekerGimbalDeg: 75,
    massKg: 105, lengthM: 2.9, diameterM: 0.17, burnS: 5.5, maxMach: 2.8, maxG: 45,
    ref: { highHeadOnKm: 27, highColdKm: 12, lowHeadOnKm: 11 },
    chaffSusceptibility: 0,
    guidanceRule: 'Get the seeker lock and ПР before you fire; nothing is needed from you after launch.',
    notes: [
      'All-aspect IR dogfight missile: 45° off the nose at launch, 75° tracking. Pair it with the helmet sight.',
      'The table range is kinematic; the seeker (20 km against a hot target) is the real limit.',
      'No RWR warning. Flare factor (Lua ccm_k0) 0.5.',
    ],
  }),
  aim120b: m('aim120b', {
    name: 'AIM-120B', nato: 'AMRAAM', fox: 3, seeker: 'arh', midcourse: 'datalink', lofts: true,
    pitbullKm: 14, seekerRangeKm: 30, seekerGimbalDeg: 60,
    massKg: 157.9, lengthM: 3.66, diameterM: 0.178, burnS: 7.1, maxMach: 4.0, maxG: 30,
    ref: { highHeadOnKm: 65, highColdKm: 19.5, lowHeadOnKm: 21.5 },
    chaffSusceptibility: 0.2,
    guidanceRule: AMRAAM_RULE,
    notes: [
      'Two-stage motor: 2.1 s boost + 5.0 s sustain. Battery 80 s.',
      'Lofts about 30° when fired beyond ~25 km and stops lofting inside 15 km.',
      'Pitbull ~14 km (approx.): Lua D_max read as the active distance; ED does not publish it.',
      'From TWS the target sees only your search radar (no lock, no launch warning) until the seeker goes active.',
      'If the track is lost it flies on to the last computed intercept point and goes active there.',
      'Chaff factor (Lua ccm_k0) 0.2. Since 2.7.1 the notch needs ground clutter behind the target.',
    ],
  }),
  aim120c: m('aim120c', {
    name: 'AIM-120C', nato: 'AMRAAM', fox: 3, seeker: 'arh', midcourse: 'datalink', lofts: true,
    pitbullKm: 16, seekerRangeKm: 30, seekerGimbalDeg: 60,
    massKg: 161.5, lengthM: 3.66, diameterM: 0.178, burnS: 6.5, maxMach: 4.0, maxG: 30,
    ref: { highHeadOnKm: 75, highColdKm: 21.5, lowHeadOnKm: 25 },
    chaffSusceptibility: 0.1,
    guidanceRule: AMRAAM_RULE,
    notes: [
      'DCS models the C-5: one 6.5 s motor, battery 100 s, seeker 15° field of view on a ±60° gimbal, homes on jamming.',
      'Lofts about 30° beyond ~25 km, not inside 15 km.',
      'Pitbull ~16 km / 8.6 nm (approx.): Lua D_max; community reports about 8 nm, some ED forum posts say 10 nm.',
      'Hardest radar missile to chaff (Lua ccm_k0 0.1). The notch needs ground behind you, and since 2.7.14 it is harder to notch once it is active and close.',
      'Guidance updates 2023–2025: constant lead angle, better against barrel rolls, 30° conical fuze arming at 150 m.',
      'Cues: F-15C HUD "T tta tti" then "M tti"; F/A-18C "xx ACT" then "TTG"; F-16C "A nn" then "T nn".',
    ],
  }),
  aim7m: m('aim7m', {
    name: 'AIM-7M', nato: 'Sparrow', fox: 1, seeker: 'sarh', midcourse: 'none', lofts: false,
    seekerRangeKm: 60, seekerGimbalDeg: 60,
    massKg: 231.1, lengthM: 3.66, diameterM: 0.203, burnS: 14.5, maxMach: 3.2, maxG: 25,
    ref: { highHeadOnKm: 38, highColdKm: 12, lowHeadOnKm: 19 },
    chaffSusceptibility: 0.6,
    // Jet-specific options (F-15C FLOOD, F-14 flood) live in notes, so every page can print this rule as is.
    guidanceRule: 'Hold STT on the target until impact.',
    notes: [
      'Semi-active: needs STT for the whole flight. The target sees lock and launch the whole time.',
      'F-15C only: inside 10 nm FLOOD (key 6) guides it without a lock; keep the target in the 12° circle. No DLZ in FLOOD.',
      'F-14: if the STT drops, the WCS goes to flood; keep the target on the nose.',
      'No TWS shot: the F-15C refuses it, the F/A-18C goes STT on the L&S when you fire, the F-14 needs PD-STT or P-STT.',
      'Since 2.9.27 (Jun 2026): new SARH seeker with glint noise; gimbal ±60°.',
      'Loft is off by default on the 7M (the 7MH lofts). Long sustainer: 3.7 s + 10.8 s. Battery 75 s.',
      'Chaff factor: the Lua has 0.2 (sensor) and 1.0 (seeker); which one drives chaff is unclear, so 0.6 is used (approx.).',
    ],
  }),
  aim9m: m('aim9m', {
    name: 'AIM-9M', nato: 'Sidewinder', fox: 2, seeker: 'ir', midcourse: 'none', lofts: false,
    seekerRangeKm: 20, seekerGimbalDeg: 45,
    massKg: 85.7, lengthM: 2.87, diameterM: 0.127, burnS: 5.2, maxMach: 2.7, maxG: 40,
    ref: { highHeadOnKm: 27, highColdKm: 10, lowHeadOnKm: 10.5 },
    chaffSusceptibility: 0,
    guidanceRule: 'Get the lock tone before you fire; nothing is needed from you after launch.',
    notes: [
      'Cooled IR seeker, 17° off the nose at launch.',
      'The table range is kinematic only; the seeker (about 20 km against a hot target) is the real limit.',
      'No RWR warning. Flare factor (Lua ccm_k0) 0.5.',
    ],
  }),
  aim9x: m('aim9x', {
    name: 'AIM-9X', nato: 'Sidewinder', fox: 2, seeker: 'ir', midcourse: 'none', lofts: false,
    seekerRangeKm: 25, seekerGimbalDeg: 90,
    massKg: 84.5, lengthM: 3.02, diameterM: 0.127, burnS: 5.0, maxMach: 2.7, maxG: 55,
    ref: { highHeadOnKm: 27, highColdKm: 10, lowHeadOnKm: 10.5 },
    chaffSusceptibility: 0,
    guidanceRule: 'Get the lock tone (the seeker looks up to 90° off the nose) before you fire; nothing is needed after launch.',
    notes: [
      'Imaging IR with high off-boresight: 90° at launch.',
      'Hardest IR missile to flare (Lua ccm_k0 0.2). 55 g.',
      'The table range is kinematic only; the seeker (about 25 km against a hot target) is the real limit.',
    ],
  }),
  aim54a: m('aim54a', {
    name: 'AIM-54A', nato: 'Phoenix', fox: 3, seeker: 'arh', midcourse: 'datalink', lofts: true,
    pitbullKm: 18.5, seekerRangeKm: 25, seekerGimbalDeg: 60,
    massKg: 444, lengthM: 3.96, diameterM: 0.38, burnS: 27, maxMach: 4.0, maxG: 22,
    ref: { highHeadOnKm: 120, highColdKm: 46, lowHeadOnKm: 44 },
    chaffSusceptibility: 1,
    guidanceRule: PHOENIX_RULE,
    notes: [
      'Heatblur runs its own flight model and DLZ; the ED table stub (27 s burn, 120 km head-on at 10 km) is approx.',
      'TWS: AWG-9 datalink midcourse, then an active command about 16 s before impact. Distance follows the TGTS switch: SMALL 6 nm, NORM 10 nm (used here), LARGE 13 nm.',
      'PD-STT: semi-active all the way, never goes active; the target gets a launch warning at once.',
      'Active off the rail, no loft, about 10 nm reach: P-STT, ACM or BRSIT, PH ACT set before launch, or a target inside 10 nm.',
      'Very easy to chaff (Lua ccm_k0 1.0). Heatblur: at least 60 nm high against a fighter in PD-STT, about 50 nm in TWS.',
      'Mk47 vs Mk60 motors are not visible in the stub; community tests say both burn about 27–30 s.',
    ],
  }),
  aim54c: m('aim54c', {
    name: 'AIM-54C', nato: 'Phoenix', fox: 3, seeker: 'arh', midcourse: 'datalink', lofts: true,
    pitbullKm: 18.5, seekerRangeKm: 25, seekerGimbalDeg: 60,
    massKg: 454, lengthM: 3.96, diameterM: 0.38, burnS: 27, maxMach: 4.0, maxG: 22,
    ref: { highHeadOnKm: 120, highColdKm: 46, lowHeadOnKm: 44 },
    chaffSusceptibility: 0.2,
    guidanceRule: PHOENIX_RULE,
    notes: [
      'Digital seeker and smokeless motor: far harder to chaff than the 54A (Lua ccm_k0 0.2 vs 1.0).',
      'Ignores the TGTS switch in DCS: goes active about 10 nm (18.5 km) from the target.',
      'TWS: datalink then active (no lock or launch warning to the target until then). PD-STT: semi-active to impact, immediate launch warning.',
      'Active off the rail with no loft from P-STT, ACM, PH ACT or inside 10 nm.',
      'Heatblur flight model; the ED table stub ranges are approx.',
    ],
  }),
  sd10: m('sd10', {
    name: 'SD-10', fox: 3, seeker: 'arh', midcourse: 'datalink', lofts: true,
    pitbullKm: 16, seekerRangeKm: 30, seekerGimbalDeg: 60,
    massKg: 199, lengthM: 3.9, diameterM: 0.203, burnS: 10, maxMach: 5.0, maxG: 30,
    ref: { highHeadOnKm: 80, highColdKm: 25, lowHeadOnKm: 25 },
    chaffSusceptibility: 0.11,
    guidanceRule: 'Keep the HPT track until the TOA countdown reaches 0 (pitbull), then you may turn away.',
    notes: [
      'Export PL-12. Same guidance scheme as the AIM-120 in the Lua: inertial and datalink, then active.',
      'Two-stage motor: 6 s + 4 s. Battery 100 s.',
      'Pitbull ~16 km (approx.): not published. After launch the HUD TOF becomes TOA; TOA 0 = active.',
      'The Lua has loft data (15° from 30 km), but AI shots have been seen flying flat; player lofting is unverified.',
      'From TWS: no lock or launch warning for the target until pitbull. Chaff factor (Lua ccm_k0) 0.11.',
    ],
  }),
  pl5e: m('pl5e', {
    name: 'PL-5EII', fox: 2, seeker: 'ir', midcourse: 'none', lofts: false,
    seekerRangeKm: 20, seekerGimbalDeg: 45,
    massKg: 83, lengthM: 2.89, diameterM: 0.127, burnS: 6, maxMach: 2.7, maxG: 35,
    ref: { highHeadOnKm: 27, highColdKm: 10, lowHeadOnKm: 10.5 },
    chaffSusceptibility: 0,
    guidanceRule: 'Uncage with T2 and wait for the high tone before you fire; nothing is needed after launch.',
    notes: [
      'Cooled IR. Select with S8 and let it warm up ("PL5 ON").',
      'Seeker about 20 km against a hot target; AI Range_max 16 km.',
      'No RWR warning. Flare factor (Lua ccm_k0) 0.5.',
    ],
  }),
  s530d: m('s530d', {
    name: 'Super 530D', fox: 1, seeker: 'sarh', midcourse: 'none', lofts: true,
    seekerRangeKm: 100, seekerGimbalDeg: 50,
    massKg: 270, lengthM: 3.8, diameterM: 0.263, burnS: 10.5, maxMach: 5.0, maxG: 25,
    ref: { highHeadOnKm: 46, highColdKm: 18, lowHeadOnKm: 19 },
    chaffSusceptibility: 0.1,
    guidanceRule: 'Hold the PSIC lock until impact and keep the target inside ±60°; the missile dies about 45 s after launch.',
    notes: [
      'Semi-active: needs PSIC (STT) for the whole flight. After a shot the radar stays in PSIC Super 530 for 50 s.',
      'Battery about 45 s (Lua op_time 47 s): long shots die before they arrive.',
      'Lofts +45° for 10 s when fired beyond 18.5 km (10 nm).',
      'Guide ranges: about 10 nm at sea level, about 23 nm at 40,000 ft.',
      'Hold the trigger at least 2 s to fire; the "P" blinks for about 30 s after power-up.',
      'Chaff factor 0.1 from the new-API Lua; the legacy entry says 0.5.',
    ],
  }),
  magic2: m('magic2', {
    name: 'Magic II', fox: 2, seeker: 'ir', midcourse: 'none', lofts: false,
    seekerRangeKm: 20, seekerGimbalDeg: 55,
    massKg: 85, lengthM: 2.75, diameterM: 0.157, burnS: 1.9, maxMach: 2.0, maxG: 40,
    ref: { highHeadOnKm: 16, highColdKm: 6, lowHeadOnKm: 7.5 },
    chaffSusceptibility: 0,
    guidanceRule: 'Wait for the growl (seeker lock) before you fire; nothing is needed after launch.',
    notes: [
      'All-aspect IR with a very short 1.9 s motor: 0.25–8 nm per the guide.',
      '55° off the nose; can be slaved to the radar target (Magic Slave).',
      'Easiest missile to flare in this set (Lua ccm_k0 2.0).',
    ],
  }),
};
