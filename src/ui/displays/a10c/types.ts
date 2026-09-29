/**
 * Input contracts for the A-10C II cockpit displays (docs/research/a10c.md §2–5): the HUD, the TGP page and the
 * TAD / MSG page on the MFCDs. Pages build these views from the sim (ac.ag.tgp, ac.ag.spi, marks, the JTAC state);
 * displays only draw them. Positions on the ground are world metres (x east, z south); angles are radians.
 */
import type { AgWeaponId } from '../../../data/types';

/** HUD master mode as the A-10C II cycles it with M: NAV → GUNS → CCIP → CCRP. */
export type A10cMasterMode = 'NAV' | 'GUNS' | 'CCIP' | 'CCRP';

export interface A10cHudView {
  t: number;
  /** Heading (rad, clockwise from north), pitch and bank (rad). */
  heading: number;
  pitch: number;
  roll: number;
  speedKt: number;
  altFt: number;
  master: A10cMasterMode;
  /** HUD is the SOI (asterisk lower left). */
  soi: boolean;
  /** Selected store as the DSMS labels it ('GBU-12', '65L', 'GUN'), and rounds left. */
  weapon: { id: AgWeaponId; label: string; count: number } | null;
  /** CCIP / gun pipper: angles from the boresight (az + right, el + up), rad; null when no solution. */
  pipper: { az: number; el: number } | null;
  /** CCIP consent: release held, solution cue running down the steering line (0..1 of the way); null when idle. */
  releaseCue: number | null;
  /** CCRP: seconds to release and track error (rad, + target right); null outside CCRP. */
  ccrp: { ttrS: number; errRad: number } | null;
  /** The SPI in the HUD (az, el from the boresight), or null when off the HUD. */
  spi: { az: number; el: number } | null;
  /** Below minimum altitude for the selected store: X over the reticle. */
  belowMinAlt: boolean;
  /** Own laser firing: flashing L. */
  laserFiring: boolean;
  /** Maverick cues when a Maverick profile is selected (optional). */
  mav?: HudMavCue | null;
}

export interface TgpPageView {
  t: number;
  on: boolean;
  /** The pod video (the ShkvalTv render of the line of sight at the pod FOV), or null. */
  image: CanvasImageSource | null;
  fov: 'wide' | 'narrow';
  /** Zoom level 0–9 (drawn as nZ next to WIDE / NARO); optional. */
  zoom?: number;
  /** Track mode: AREA / POINT / INR, or none (rate). */
  track: 'none' | 'area' | 'point' | 'inr';
  /** LSS state: LSRCH, DETECT, LTRACK, NO LSR; off draws nothing. */
  lss: 'off' | 'search' | 'detect' | 'track' | 'lost';
  lssCode: number;
  laserCode: number;
  laserFiring: boolean;
  /** Slant range to the aim (m) and where it comes from: L laser, T target elevation, E estimate. */
  rangeM: number | null;
  rangeSource: 'L' | 'T' | 'E' | null;
  /** This MFCD is the SOI (green box). */
  soi: boolean;
  /** The pod line of sight is the SPI. */
  isSpi: boolean;
  /** Units for the range readout. */
  units: 'imperial' | 'metric';
}

export interface TadView {
  t: number;
  /** Own position (world m) and heading (rad). */
  own: { x: number; z: number; heading: number };
  /** Display scale: range from own ship to the top edge (nm), 5–160 centred. */
  scaleNm: number;
  /** SPI ("wedding cake") and the steerpoint. */
  spi: { x: number; z: number } | null;
  steerpoint: { x: number; z: number; name: string } | null;
  /** Friendly ground units over SADL (green crosses): the JTAC. */
  friendlies: { x: number; z: number; label?: string }[];
  /** Digital 9-line tasking: red triangle with a dot at the target; ATTACK flashes until WILCO. */
  tasking: { x: number; z: number; accepted: boolean } | null;
  /** NEW TASKING shown on both MFCDs until cleared (TMS Left Short). */
  newTasking: boolean;
  /** TAD cursor and the hooked symbol. */
  cursor: { x: number; z: number } | null;
  hooked: 'tasking' | 'spi' | 'friendly' | null;
  soi: boolean;
}

/** MSG page: the digital 9-line as received, with WILCO (OSB 19) / CNTCO (OSB 7). */
export interface MsgPageView {
  title: string;
  lines: { label: string; value: string }[];
  state: 'new' | 'wilco' | 'cntco';
}

/**
 * MAV page (MFCD) for the AGM-65D/H (research a10c.md §6): SENSOR until a Maverick profile is selected, then the DLZ;
 * the seeker video with the tracking gate (collapses on lock, pointing cross flashes), break-lock spreads the
 * crosshairs; status ALN / RDY / EMPTY. The AGM-65L has no video: the page shows its synthetic view and the code.
 */
export interface MavPageView {
  t: number;
  /** Maverick profile selected (else the page reads SENSOR). */
  profile: 'agm65d' | 'agm65h' | 'agm65l' | null;
  /** Seeker video (D: IIR, H: TV), or null (L, caged, or no picture). */
  image: CanvasImageSource | null;
  caged: boolean;
  locked: boolean;
  /** Seconds since the last break-lock (crosshairs spread while recent), or null. */
  sinceBreakS: number | null;
  status: 'ALN' | 'RDY' | 'EMPTY';
  /** Slant range to the aim (m) and the launch zone band (m), for the DLZ staple. */
  rangeM: number | null;
  dlz: { min: number; max: number } | null;
  /** AGM-65L: laser code and whether a spot on it is seen. */
  laserCode: number | null;
  spotSeen: boolean;
  soi: boolean;
  units: 'imperial' | 'metric';
}

/** HUD additions when a Maverick is selected: the wagon-wheel reticle on the seeker line of sight, and the DLZ staple. */
export interface HudMavCue {
  /** Seeker line of sight (az, el from the boresight), or null when caged / off the HUD. */
  los: { az: number; el: number } | null;
  locked: boolean;
  rangeM: number | null;
  dlz: { min: number; max: number } | null;
  /** Below minimum range: X over the reticle. */
  tooClose: boolean;
}
