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
    goal: 'Two ideas run the A-10C II. The SOI is the one screen your HOTAS keys control right now. The SPI is one point on the ground that every sensor and weapon uses. Learn to move both.',
    steps: [
      { id: 'tgp', text: 'Make the pod screen (TGP, right MFCD) the SOI. Hold K, or press TGP in Controls. A green box now frames that screen.', keys: 'K (hold 1 s)', check: s => s.soiSeen.has('tgp') },
      { id: 'tad', text: 'Make the map (TAD, left MFCD) the SOI. Hold H, or press TAD. The green box moves to the left screen.', keys: 'H (hold 1 s)', check: s => s.soiSeen.has('tad') },
      { id: 'hud', text: 'Make the HUD the SOI. Tap U, or press HUD. A small star in the lower left of the HUD shows it.', keys: 'U', check: s => s.soiSeen.has('tad') && s.soi === 'hud' },
      { id: 'pod', text: 'Make the TGP the SOI again (hold K), then move the pod crosshair onto the vehicle column with ; . , /', keys: 'K (hold 1 s), ; . , /', check: s => s.soi === 'tgp' && (s.aimToColumnM ?? 1e9) < 120 },
      { id: 'spi', text: 'Make that point the SPI. Hold LCtrl+Up (TMS Forward Long), or press TMS Fwd Long. A small diamond appears on the map.', keys: 'LCtrl+Up (hold 1 s)', check: s => s.spiSource === 'tgp' && s.spiOnColumn },
      { id: 'slave', text: 'Move the crosshair away, then bring every sensor back to the SPI. Hold V (China Hat Forward Long), or press Slave to SPI.', keys: '; . , /, then V (hold 1 s)', check: s => s.slavedBack },
      { id: 'reset', text: 'Put the SPI back on the waypoint. Hold LCtrl+Down (TMS Aft Long), or press TMS Aft Long.', keys: 'LCtrl+Down (hold 1 s)', check: s => s.slavedBack && s.spiSource === 'steer' },
    ],
  },
  pod: {
    id: 'pod', title: 'Targeting pod', short: 'Pod',
    goal: 'Use the targeting pod: move it, zoom in, lock it on a vehicle, let go, and mark the vehicle as the SPI.',
    steps: [
      { id: 'soi', text: 'Make the pod screen the SOI. Hold K, or press TGP in Controls.', keys: 'K (hold 1 s)', check: s => s.soi === 'tgp' },
      { id: 'slew', text: 'Move the crosshair onto the vehicle column, north-east of the waypoint. Use ; . , / (or the arrow pad in Controls).', keys: '; . , /', check: s => (s.aimToColumnM ?? 1e9) < 80 },
      { id: 'naro', text: 'Switch to the narrow view: tap V (China Hat Forward Short), or press FOV. The top left reads NARO. Home / End zoom in and out (0Z to 9Z).', keys: 'V, Home / End', check: s => s.narrowSeen },
      { id: 'point', text: 'Lock the pod on a vehicle: tap LCtrl+Up (TMS Forward Short), or press TMS Fwd. POINT appears and a box follows the vehicle.', keys: 'LCtrl+Up', check: s => s.pointOnColumn },
      { id: 'area', text: 'Let go of the vehicle: tap LCtrl+Up again. The pod now reads AREA and stares at that patch of ground.', keys: 'LCtrl+Up', check: s => s.areaAfterPoint },
      { id: 'point2', text: 'Lock a vehicle again: tap LCtrl+Up.', keys: 'LCtrl+Up', check: s => s.areaAfterPoint && s.pointOnColumn },
      { id: 'spi', text: 'Make the locked vehicle the SPI: hold LCtrl+Up, or press TMS Fwd Long.', keys: 'LCtrl+Up (hold 1 s)', check: s => s.spiSource === 'tgp' && s.spiOnTarget && s.pointOnColumn },
    ],
  },
  laser: {
    id: 'laser', title: 'Laser and LSS', short: 'Laser & LSS',
    goal: `Fire your own laser at a vehicle, then find a friendly's laser spot with the laser spot search (LSS). A laser code is a four-digit number; a laser weapon only follows a spot with its own code. Yours is 1688; Ranger 2 lases on ${BUDDY_CODE}.`,
    steps: [
      { id: 'point', text: 'Make the pod the SOI (hold K) and lock it on a vehicle in the column (tap LCtrl+Up).', keys: 'K (hold 1 s), ; . , /, LCtrl+Up', check: s => s.pointOnColumn && s.laserCode === 1688 },
      { id: 'lase', text: 'Fire the laser for 2 s: hold Insert, or press Laser in Controls. An L flashes on the pod screen and the HUD.', keys: 'Insert (hold)', check: s => s.lasedPointS >= 2 },
      { id: 'code', text: `Stop the laser (release Insert or press Laser). In the TGP CNTL panel below Controls, type ${BUDDY_CODE} in "LSS code" and press ENTER.`, keys: `LSS code ${BUDDY_CODE}, ENTER`, check: s => s.lssCode === BUDDY_CODE && !s.laserFiring },
      { id: 'lss', text: 'Keep the trucks on the pod screen, then press "LSS · OSB 6" in Controls (or tap C). The bottom of the pod screen reads LSRCH: it is searching.', keys: 'LSS · OSB 6 button, C', check: s => s.lssDetectBuddy },
      { id: 'ltrack', text: 'Wait: DETECT, then LTRACK. A box sits on Ranger 2\'s spot and the pod follows it.', check: s => s.lssTrackBuddy },
      { id: 'spi', text: 'Make the spot the SPI: hold LCtrl+Up.', keys: 'LCtrl+Up (hold 1 s)', check: s => s.spiOnBuddySpot && s.spiSource === 'tgp' },
    ],
  },
  mav: {
    id: 'mav', title: 'Maverick D / H', short: 'Maverick',
    goal: 'Fire two Mavericks at two vehicles. The pod finds the target, the Maverick is pointed at it, locks it with its own camera, and flies to it by itself.',
    steps: [
      { id: 'profile', text: 'Choose the Maverick: tap PageDown (or press Profile) until 65D or 65H shows in the HUD.', keys: 'PageDown', check: s => s.selected === 'agm65d' || s.selected === 'agm65h' },
      { id: 'master', text: 'Tap M (or press M Master) until the HUD shows CCIP.', keys: 'M', check: s => (s.master === 'CCIP' || s.master === 'CCRP') && (s.selected === 'agm65d' || s.selected === 'agm65h') },
      { id: 'point', text: 'Make the pod the SOI (hold K) and lock it on a vehicle (tap LCtrl+Up).', keys: 'K (hold 1 s), ; . , /, LCtrl+Up', check: s => s.soi === 'tgp' && s.pointOnColumn },
      { id: 'spi', text: 'Make that vehicle the SPI: hold LCtrl+Up.', keys: 'LCtrl+Up (hold 1 s)', check: s => s.spiSource === 'tgp' && s.spiOnTarget },
      { id: 'slave', text: 'Point the Maverick at the SPI: hold V, or press Slave to SPI.', keys: 'V (hold 1 s)', check: s => s.mavSlaved },
      { id: 'mavsoi', text: 'Show the Maverick screen: tap K (or press TGP / MAV), then hold K (or press MAV) to make it the SOI.', keys: 'K, then K (hold 1 s)', check: s => s.soi === 'mav' },
      { id: 'lock', text: 'Lock the Maverick: tap LCtrl+Up. The corner brackets close into a small box. Lock inside about 7.5 nm.', keys: 'LCtrl+Up', check: s => s.mavLocked || n(s.fired, 'agm65d', 'agm65h') > 0 },
      { id: 'fire', text: 'When the range mark on the right-hand scale is filled (in range), fire: RAlt+Space, or press RELEASE.', keys: 'RAlt+Space', check: s => n(s.fired, 'agm65d', 'agm65h') >= 1 },
      { id: 'second', text: 'Second Maverick: move the box onto another vehicle with ; . , /, lock (tap LCtrl+Up) and fire.', keys: '; . , /, LCtrl+Up, RAlt+Space', check: s => n(s.fired, 'agm65d', 'agm65h') >= 2 },
      { id: 'kills', text: 'Watch both hit: two vehicles destroyed.', check: s => n(s.kills, 'agm65d', 'agm65h') >= 2 },
    ],
  },
  lgb: {
    id: 'lgb', title: 'Laser weapons', short: 'GBU-12 · APKWS · 65L',
    goal: 'Three weapons that follow your laser spot (code 1688): a GBU-12 bomb, APKWS rockets and an AGM-65L. Each misses if the laser goes off before impact.',
    steps: [
      { id: 'point', text: 'Make the pod the SOI (hold K) and lock it on a vehicle (tap LCtrl+Up).', keys: 'K (hold 1 s), ; . , /, LCtrl+Up', check: s => s.pointOnColumn },
      { id: 'spi', text: 'Make it the SPI: hold LCtrl+Up.', keys: 'LCtrl+Up (hold 1 s)', check: s => s.spiSource === 'tgp' && s.spiOnTarget },
      { id: 'gbu', text: 'Choose the GBU-12: tap PageDown (or press Profile) until GBU-12 shows in the HUD.', keys: 'PageDown', check: s => s.selected === 'gbu12' },
      { id: 'ccrp', text: 'Tap M until the HUD shows CCRP: the HUD now steers you to the release point.', keys: 'M', check: s => s.selected === 'gbu12' && s.master === 'CCRP' },
      { id: 'release', text: 'Fly along the steering line and release when the HUD says so: RAlt+Space, or press RELEASE. (In DCS you hold release; here one press drops it.)', keys: 'RAlt+Space', check: s => n(s.fired, 'gbu12') >= 1 },
      { id: 'lase', text: 'While the bomb falls, fire the laser and keep it on: hold Insert, or press Laser.', keys: 'Insert (hold)', check: s => s.lasedWithWeapon || n(s.kills, 'gbu12') > 0 },
      { id: 'gbu-hit', text: 'The bomb follows your spot: a vehicle destroyed.', check: s => n(s.kills, 'gbu12') >= 1 },
      { id: 'apkws', text: 'Choose APKWS (PageDown) and set CCIP (M).', keys: 'PageDown, M', check: s => s.selected === 'apkws' && (s.master === 'CCIP' || s.master === 'CCRP') },
      { id: 'truck', text: 'Lock the pod on a truck (tap LCtrl+Up) and start lasing (Insert or Laser).', keys: 'LCtrl+Up, Insert', check: s => s.selected === 'apkws' && s.pointOnTruck && s.laserFiring },
      { id: 'rkt', text: 'At about 5 nm, fire (RAlt+Space) and keep lasing until it hits.', keys: 'RAlt+Space, Insert (hold)', check: s => n(s.fired, 'apkws') >= 1 },
      { id: 'rkt-hit', text: 'The rocket follows your spot to the truck.', check: s => n(s.kills, 'apkws') >= 1 },
      { id: '65l', text: 'Choose the 65L (PageDown), lock the pod on a vehicle, lase it and fire. Keep lasing until it hits.', keys: 'PageDown, LCtrl+Up, Insert (hold), RAlt+Space', check: s => n(s.fired, 'agm65l') >= 1 },
      { id: '65l-hit', text: 'The AGM-65L hits your spot.', check: s => n(s.kills, 'agm65l') >= 1 },
    ],
  },
  gun: {
    id: 'gun', title: 'Gun strafe', short: 'Gun',
    goal: 'Strafe a truck with the 30 mm gun: nose down, put the pipper on the truck inside 2 nm, fire a short burst, pull up.',
    steps: [
      { id: 'guns', text: 'Tap M (or press M Master) until the HUD shows GUNS. A circle (the pipper) shows where the rounds will hit.', keys: 'M', check: s => s.master === 'GUNS' && s.selected === 'gau8' },
      { id: 'fire', text: 'Nose down with the Up arrow, steer with Left / Right until the pipper sits on a truck, then hold Space to fire (inside 2 nm).', keys: 'Up, Left / Right, Space (hold)', check: s => n(s.fired, 'gau8') >= 1 },
      { id: 'kill', text: 'Destroy a truck, then pull up with the Down arrow.', keys: 'Down', check: s => n(s.kills, 'gau8') >= 1 },
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
