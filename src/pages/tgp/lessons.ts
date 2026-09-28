/**
 * [OWNER: page-tgp] Lesson definitions for the Targeting pod & Mavericks page (A-10C II), pure and unit-tested.
 * Keys and cockpit words from docs/research/a10c.md §1-6 (PROCEDURES.a10c binds): TMS LCtrl+arrows, DMS
 * Home/End/Delete/PageDown, China Hat V/C, Coolie U/J/H/K, slew ; . , /, Insert laser, M master mode (all verified in
 * the ED training text and the community input lists); weapon release RAlt+Space and gun Space are the A-10C default
 * list (community, not verified for the A-10C II). LSS (OSB 6) and the CNTL codes are MFCD buttons. Game level only.
 */
import type { AgWeaponId } from '../../data/types';
import type { A10cMasterMode } from '../../ui/displays';
import type { RightPage, Soi, SpiSource } from '../cas/a10cHotas';
import type { Debrief } from '../strike/lessons';
import { BUDDY_CODE, TGP_LESSON_ORDER, type TgpLessonId } from './scenario';

export { TGP_LESSON_ORDER, type TgpLessonId, type Debrief };

/** What the steps look at, sampled each frame (TgpTracker). Sticky "seen" flags remember a state once reached. */
export interface TgpSnap {
  soi: Soi;
  rightPage: RightPage;
  soiSeen: ReadonlySet<Soi>;
  master: A10cMasterMode;
  selected: AgWeaponId | null;
  tgpOn: boolean;
  fov: 'wide' | 'narrow';
  narrowSeen: boolean;
  track: 'none' | 'area' | 'point' | 'inr';
  /** POINT track on a live column vehicle / on a live truck. */
  pointOnColumn: boolean;
  pointOnTruck: boolean;
  /** AREA or INR after a POINT track (sticky). */
  areaAfterPoint: boolean;
  /** Pod aim to the nearest live column vehicle (m). */
  aimToColumnM: number | null;
  spiSource: SpiSource;
  /** SPI (set, not the steerpoint) within 150 m of the column centre, and within 25 m of a live red vehicle. */
  spiOnColumn: boolean;
  spiOnTarget: boolean;
  /** The pod was slewed away from the SPI, then China Hat Forward Long brought it back (sticky). */
  slavedBack: boolean;
  laserCode: number;
  lssCode: number;
  laserFiring: boolean;
  /** Seconds of own laser on a POINT-tracked vehicle (sticky maximum of a continuous run). */
  lasedPointS: number;
  lss: 'off' | 'search' | 'detect' | 'track' | 'lost';
  /** The LSS saw (DETECT or LTRACK) / tracks (LTRACK) the friendly's spot (sticky). */
  lssDetectBuddy: boolean;
  lssTrackBuddy: boolean;
  /** The SPI sits on the friendly's spot (within 15 m). */
  spiOnBuddySpot: boolean;
  /** Maverick seeker slaved to the SPI (sticky), locked now. */
  mavSlaved: boolean;
  mavLocked: boolean;
  /** Launch check of the selected store passes now (in the DLZ with what it needs). */
  launchOk: boolean;
  /** Own releases and own kills per store. */
  fired: Partial<Record<AgWeaponId, number>>;
  kills: Partial<Record<AgWeaponId, number>>;
  /** Own laser fired while an own laser-guided store was in flight (sticky). */
  lasedWithWeapon: boolean;
}

export interface LessonStep { id: string; text: string; keys?: string; check: (s: TgpSnap) => boolean }

export interface LessonDef {
  id: TgpLessonId;
  title: string;
  short: string;
  goal: string;
  steps: LessonStep[];
}

const n = (r: Partial<Record<AgWeaponId, number>>, ...w: AgWeaponId[]) => w.reduce((a, k) => a + (r[k] ?? 0), 0);

export const LESSONS: Record<TgpLessonId, LessonDef> = {
  soi: {
    id: 'soi', title: 'SOI and SPI', short: 'SOI & SPI',
    goal: 'One display at a time is the sensor of interest: the HOTAS acts on it. Move the SOI with the Coolie, set the SPI from the pod and slave every sensor to it.',
    steps: [
      { id: 'tgp', text: 'Make the TGP the SOI: Coolie Right Long. A green box frames the right MFCD; the other MFCD reads NOT SOI.', keys: 'K (hold)', check: s => s.soiSeen.has('tgp') },
      { id: 'tad', text: 'Make the TAD the SOI: Coolie Left Long.', keys: 'H (hold)', check: s => s.soiSeen.has('tad') },
      { id: 'hud', text: 'Back to the HUD: Coolie Up Short. The asterisk lower left marks the HUD as SOI.', keys: 'U', check: s => s.soiSeen.has('tad') && s.soi === 'hud' },
      { id: 'spi', text: 'TGP as SOI, slew the pod onto the vehicle column and make it the SPI: TMS Forward Long.', keys: 'K (hold), ; . , /, LCtrl+Up (hold)', check: s => s.spiSource === 'tgp' && s.spiOnColumn },
      { id: 'slave', text: 'Slew the pod off the SPI, then slave every sensor back to it: China Hat Forward Long.', keys: '; . , /, V (hold)', check: s => s.slavedBack },
      { id: 'reset', text: 'Send the SPI back to the steerpoint: TMS Aft Long.', keys: 'LCtrl+Down (hold)', check: s => s.slavedBack && s.spiSource === 'steer' },
    ],
  },
  pod: {
    id: 'pod', title: 'Targeting pod', short: 'Pod',
    goal: 'Work the Litening pod: slew, change the field of view, point track a vehicle, drop back to area track, then make the vehicle the SPI.',
    steps: [
      { id: 'soi', text: 'Make the TGP the SOI: Coolie Right Long.', keys: 'K (hold)', check: s => s.soi === 'tgp' },
      { id: 'slew', text: 'Slew the crosshair onto the vehicle column, 700 m north-east of the steerpoint.', keys: '; . , /', check: s => (s.aimToColumnM ?? 1e9) < 80 },
      { id: 'naro', text: 'NARO for a closer look: China Hat Forward Short; the same switch goes back to WIDE. DMS Forward / Aft then zooms 0Z–9Z inside it.', keys: 'V, Home / End', check: s => s.narrowSeen },
      { id: 'point', text: 'POINT track a vehicle: TMS Forward Short. A box sits on it and follows it.', keys: 'LCtrl+Up', check: s => s.pointOnColumn },
      { id: 'area', text: 'Drop back to AREA: TMS Forward Short again (TMS Aft Short gives INR, a fixed point).', keys: 'LCtrl+Up, LCtrl+Down', check: s => s.areaAfterPoint },
      { id: 'spi', text: 'POINT track a vehicle again and make it the SPI: TMS Forward Long.', keys: 'LCtrl+Up, then LCtrl+Up (hold)', check: s => s.spiSource === 'tgp' && s.spiOnTarget && s.pointOnColumn },
    ],
  },
  laser: {
    id: 'laser', title: 'Laser and LSS', short: 'Laser & LSS',
    goal: `Lase a vehicle with your own code (1688), then find a friendly's spot on code ${BUDDY_CODE} with the laser spot search and make it the SPI.`,
    steps: [
      { id: 'point', text: 'TGP as SOI, POINT track a vehicle in the column. Your L code on the CNTL page reads 1688, the code your bombs carry.', keys: 'K (hold), ; . , /, LCtrl+Up', check: s => s.pointOnColumn && s.laserCode === 1688 },
      { id: 'lase', text: 'Fire the laser for 2 s: Insert, held (or latch it). L flashes on the TGP page and the HUD; the range reads L.', keys: 'Insert (hold)', check: s => s.lasedPointS >= 2 },
      { id: 'code', text: `Laser off. Ranger 2, south-east of the trucks, lases a truck on ${BUDDY_CODE}. Set the LSS code to ${BUDDY_CODE} on the CNTL page.`, keys: 'CNTL page: LSS code', check: s => s.lssCode === BUDDY_CODE && !s.laserFiring },
      { id: 'lss', text: 'Laser spot search: OSB 6. LSRCH while it searches, then DETECT and OSB 6 reads LST. Keep the trucks inside the view.', keys: 'OSB 6', check: s => s.lssDetectBuddy },
      { id: 'ltrack', text: 'LTRACK: after 1 s a box sits on the spot and the pod follows it.', check: s => s.lssTrackBuddy },
      { id: 'spi', text: 'Make the spot the SPI: TMS Forward Long.', keys: 'LCtrl+Up (hold)', check: s => s.spiOnBuddySpot && s.spiSource === 'tgp' },
    ],
  },
  mav: {
    id: 'mav', title: 'Maverick D / H', short: 'Maverick',
    goal: 'Two AGM-65D and two AGM-65H. Slave the Maverick to a pod SPI, lock from the MAV page, fire inside the DLZ, then lock and fire at a second vehicle.',
    steps: [
      { id: 'profile', text: 'HUD as SOI, select the AGM-65D profile: DMS Left or Right Short. The MAV page reads the DLZ instead of SENSOR.', keys: 'U, Delete / PageDown', check: s => s.selected === 'agm65d' || s.selected === 'agm65h' },
      { id: 'master', text: 'Master mode CCIP: M until CCIP shows in the HUD (NAV, GUNS, CCIP).', keys: 'M', check: s => (s.master === 'CCIP' || s.master === 'CCRP') && (s.selected === 'agm65d' || s.selected === 'agm65h') },
      { id: 'spi', text: 'TGP as SOI, POINT track a vehicle and make it the SPI.', keys: 'K (hold), ; . , /, LCtrl+Up, LCtrl+Up (hold)', check: s => s.spiSource === 'tgp' && s.spiOnTarget },
      { id: 'slave', text: 'Slave all to the SPI: China Hat Forward Long. The seeker looks at the SPI.', keys: 'V (hold)', check: s => s.mavSlaved },
      { id: 'mavsoi', text: 'MAV page as SOI: Coolie Right Short shows the MAV page, Coolie Right Long makes it SOI.', keys: 'K, then K (hold)', check: s => s.soi === 'mav' },
      { id: 'lock', text: 'Lock: TMS Forward Short. The gate collapses and the pointing cross flashes. Lock inside about 7.5 nm.', keys: 'LCtrl+Up', check: s => s.mavLocked || n(s.fired, 'agm65d', 'agm65h') > 0 },
      { id: 'fire', text: 'Inside the DLZ, release. Fire and forget: the seeker flies itself.', keys: 'RAlt+Space', check: s => n(s.fired, 'agm65d', 'agm65h') >= 1 },
      { id: 'second', text: 'Slew the gate onto another vehicle, lock and fire the second Maverick.', keys: '; . , /, LCtrl+Up, RAlt+Space', check: s => n(s.fired, 'agm65d', 'agm65h') >= 2 },
      { id: 'kills', text: 'Two vehicles destroyed.', check: s => n(s.kills, 'agm65d', 'agm65h') >= 2 },
    ],
  },
  lgb: {
    id: 'lgb', title: 'Laser weapons', short: 'GBU-12 · APKWS · 65L',
    goal: 'Three laser weapons on your own laser, code 1688: a GBU-12 in CCRP, APKWS rockets from about 5 nm, then an AGM-65L. Keep the laser on the target until impact.',
    steps: [
      { id: 'spi', text: 'TGP as SOI, POINT track a vehicle in the column and make it the SPI.', keys: 'K (hold), LCtrl+Up, LCtrl+Up (hold)', check: s => s.spiSource === 'tgp' && s.spiOnTarget },
      { id: 'gbu', text: 'HUD as SOI, GBU-12 profile (DMS Left / Right Short), master mode CCRP (M).', keys: 'U, Delete / PageDown, M', check: s => s.selected === 'gbu12' && s.master === 'CCRP' },
      { id: 'release', text: 'Fly toward the SPI and release inside the band. In DCS you hold release until the cue passes the reticle; here the bomb goes on the press.', keys: 'RAlt+Space', check: s => n(s.fired, 'gbu12') >= 1 },
      { id: 'lase', text: 'Lase before impact and keep it on: Insert, held, or latch it. L flashes on the HUD.', keys: 'Insert (hold)', check: s => s.lasedWithWeapon || n(s.kills, 'gbu12') > 0 },
      { id: 'gbu-hit', text: 'The GBU-12 guides onto your spot: a vehicle destroyed.', check: s => n(s.kills, 'gbu12') >= 1 },
      { id: 'apkws', text: 'APKWS profile (HUD SOI, DMS Left / Right) and CCIP. POINT track a truck and lase it before you fire.', keys: 'U, Delete / PageDown, M, Insert', check: s => s.selected === 'apkws' && s.pointOnTruck && s.laserFiring },
      { id: 'rkt', text: 'Fire at about 5 nm and keep lasing to impact.', keys: 'RAlt+Space, Insert (hold)', check: s => n(s.fired, 'apkws') >= 1 },
      { id: 'rkt-hit', text: 'The rocket rides your spot to the truck.', check: s => n(s.kills, 'apkws') >= 1 },
      { id: '65l', text: 'AGM-65L profile. POINT track a vehicle, lase it and release inside the DLZ. Keep the spot on until impact.', keys: 'Delete / PageDown, LCtrl+Up, Insert (hold), RAlt+Space', check: s => n(s.fired, 'agm65l') >= 1 },
      { id: '65l-hit', text: 'The 65L hits the spot.', check: s => n(s.kills, 'agm65l') >= 1 },
    ],
  },
  gun: {
    id: 'gun', title: 'Gun strafe', short: 'Gun',
    goal: 'Strafe the trucks with the GAU-8: GUNS mode, a shallow dive, the CCIP pipper on a truck inside 2 nm, a short burst, then pull out.',
    steps: [
      { id: 'guns', text: 'Master mode GUNS: M once from NAV. The gun cross and the CCIP gun pipper show; ammunition in the HUD data block.', keys: 'M', check: s => s.master === 'GUNS' && s.selected === 'gau8' },
      { id: 'fire', text: 'Push the nose down (Up arrow; hold longer for a steeper dive), steer the pipper onto a truck and fire inside 2 nm.', keys: 'Up / Down, Left / Right, Space', check: s => n(s.fired, 'gau8') >= 1 },
      { id: 'kill', text: 'Destroy a truck, then pull up: Down arrow.', keys: 'Down', check: s => n(s.kills, 'gau8') >= 1 },
    ],
  },
};

/** Trainer rules and simplifications the page lists under "Simplified and not verified". */
export const TGP_CAVEATS = [
  'The pod starts on and timed out in A-G, the Maverick aligned (no 3-minute ALN), and the AHCP switches are set: not modelled.',
  'Weapon release fires on the press. In DCS you hold release (CCRP cue, Mavericks); the trainer does not time the cue.',
  'Weapon release RAlt+Space and gun trigger Space are the A-10C default list: community, not verified for the A-10C II.',
  'The CNTL page is simplified to two code fields (L on OSB 18, LSS on OSB 17). Codes 1111 to 1788, digits 1 to 8 after the first.',
  'LSS starts with OSB 6. China Hat Aft Short with the TGP as SOI is listed as "Toggle LSS" in the manual HOTAS table; DMS Right Long is conflicting in the manual. Not verified in game.',
  'Maverick: any contrast inside the gate locks; the gate size, the lock range limit (8 nm), the seeker field of view and the picture size are trainer values.',
  'APKWS range: the manual conflicts; about 5 nm is the teaching number. The launch bands of every store are trainer gates, not verified.',
  'The AGM-65L flies here without an uncage step: it needs a spot on its code ahead of the jet. In DCS you uncage it with TMS Forward on the MAV page.',
  'Ranger 2 (the friendly lasing on 1511) is a scripted trainer unit, not the DCS JTAC.',
  'The jet flies itself: you steer with trainer keys (arrows). Positions, heights and repositioning between passes are trainer values.',
];

/** Debrief lines per lesson from the last snapshot. */
export function debriefLines(lesson: TgpLessonId, s: TgpSnap): string[] {
  const mav = n(s.fired, 'agm65d', 'agm65h'), mavK = n(s.kills, 'agm65d', 'agm65h');
  switch (lesson) {
    case 'soi': return ['SOI moved with the Coolie: Right Long TGP, Left Long TAD, Up Short HUD.', 'SPI set from the pod with TMS Forward Long, sensors slaved back with China Hat Forward Long, reset with TMS Aft Long.'];
    case 'pod': return ['Pod slewed onto the column, WIDE and NARO with China Hat Forward Short.', 'POINT and AREA with TMS Forward Short; the tracked vehicle made the SPI.'];
    case 'laser': return [`Own laser on code ${s.laserCode} for ${s.lasedPointS.toFixed(1)} s.`, `LSS on code ${s.lssCode}: LSRCH, DETECT, LTRACK on the friendly spot; the spot made the SPI.`];
    case 'mav': return [`Mavericks fired ${mav}, vehicles destroyed ${mavK}.`, 'Flow: profile, SPI from the pod, slave, MAV page SOI, lock, release in the DLZ.'];
    case 'lgb': return [
      `GBU-12 released ${n(s.fired, 'gbu12')}, kills ${n(s.kills, 'gbu12')}.`,
      `APKWS fired ${n(s.fired, 'apkws')}, kills ${n(s.kills, 'apkws')}.`,
      `AGM-65L fired ${n(s.fired, 'agm65l')}, kills ${n(s.kills, 'agm65l')}.`,
      'Every one needed your laser on code 1688 until impact.'];
    case 'gun': return [`Rounds fired ${n(s.fired, 'gau8')}, trucks destroyed ${n(s.kills, 'gau8')}.`, 'Pipper on the target inside 2 nm, short bursts, pull out early.'];
  }
}

/** Progress key for a lesson (AGENTS.md: '<route>:<lesson>:<aircraft>'). */
export const progressKey = (lesson: TgpLessonId): string => `tgp:${lesson}:a10c`;
