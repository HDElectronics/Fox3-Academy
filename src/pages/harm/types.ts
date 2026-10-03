/**
 * [OWNER: page-harm] View contracts between the HARM page's logic (avionics.ts, sim.ts) and its drawing code
 * (ddi.ts, hud.ts, ew.ts, ufc.ts, scene3d.ts). Logic produces these plain objects every frame; drawing code only reads
 * them. Facts behind every field: docs/research/fa18c-harm.md (S1 = ED F/A-18C guide, page numbers there).
 *
 * Angles in degrees. Azimuth: relative to the jet's nose, + right, −180..180. HUD and DDI positions: degrees from
 * the boresight / seeker centre, x + right, y + up.
 */

export type HarmMode = 'SP' | 'TOO' | 'PB';
export type Pullup = 'AC' | 'HRM';
export type MasterMode = 'NAV' | 'AA' | 'AG';

/** The SAM systems the page teaches (page-local, not the shared SamId). */
export type SystemId = 'sa6' | 'sa8' | 'sa11' | 'sa15' | 'sa10';

/** Individual vehicles drawn in 3D. */
export type VehicleId =
  | 'sa6-str' | 'sa6-tel'
  | 'sa8'
  | 'sa11-sr' | 'sa11-telar' | 'sa11-cp'
  | 'sa15'
  | 'sa10-sr' | 'sa10-tr' | 'sa10-ln';

/** TOO class filters (S1 p371). */
export type HarmClass = 'ALL' | 'FRD' | 'HOS' | 'FN' | 'HN' | 'F1' | 'F2' | 'H1' | 'H2' | 'FAA' | 'HAA' | 'FS' | 'HS' | 'UKN' | 'PRI';

/**
 * DDI pushbutton numbering in DCS (S1 figs. 203, 210, 212, 214): left column 1 (bottom) to 5 (top), top row 6-10
 * left to right, right column 11 (top) to 15 (bottom), bottom row 16 (right) to 20 (left).
 */
export type Osb = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20;

/** Where each class sits on the CLASS sub-page (S1 fig. 212). */
export const CLASS_OSB: Readonly<Record<HarmClass, Osb>> = {
  ALL: 1, FRD: 2, HOS: 3, FN: 4, HN: 5,
  F1: 6, F2: 7, H1: 8, H2: 9, FAA: 10,
  HAA: 11, FS: 12, HS: 13, UKN: 14, PRI: 15,
};

/** An emitter on the TOO format, in seeker-relative degrees (the four T marks are at ±15°). */
export interface DdiTarget {
  /** RWR symbol, e.g. '6', '15', 'SD'. */
  label: string;
  xDeg: number;
  yDeg: number;
  /** Priority emitter: box around it. */
  boxed: boolean;
  /** Handed off: H-OFF above the box. */
  hoff: boolean;
  /** That radar has locked you: a line above the symbol (S1 p369). */
  lockedYou: boolean;
}

/** The HARM format on a DDI (S1 pp361-375). */
export interface FormatView {
  /** SMS = the stores page before HARM is selected (S1 fig. 202): only `sms`, `hrmOvrd` and `hintOsb` apply. */
  page: 'SMS' | 'HARM' | 'CLASS' | 'SCAN';
  /** Stores page: HARM legend at OSB 6 (top row), wingform stations with HARM and STBY / RDY under the selected one. */
  sms: null | { stations: { sta: number; loaded: boolean; selected: boolean }[]; status: 'RDY' | 'STBY' | null };
  mode: HarmMode;
  /** HARM weapon legend top left: boxed when selected; crossed out when not ready. */
  weapon: { boxed: boolean; crossed: boolean };
  /** Under the weapon legend. */
  status: 'RDY' | 'STBY' | null;
  /** Station of the selected HARM ('STA 8'), null when none left. */
  station: number | null;
  /** False draws an X through that mode legend (S1 p364). */
  modeAvailable: Record<HarmMode, boolean>;
  /** HRM OVRD legend boxed = Pullback inhibited (the default). */
  hrmOvrd: boolean;
  /** TDC priority on this display: a small diamond top right (S1 fig. 210). */
  tdc: boolean;
  /** TOO body; null in SP and PB. */
  too: null | {
    cls: HarmClass;
    targets: DdiTarget[];
    /** Emitters of the class outside the 30° field of view. */
    arrows: { left: boolean; right: boolean; up: boolean; down: boolean };
    limit: boolean;
  };
  /** PB body; null in SP and TOO. */
  pb: null | {
    pullup: Pullup;
    /** Emitter code entered on the UFC, null until entered. */
    code: number | null;
    inRange: 'A/C RNG' | 'HRM RNG' | null;
    /** Time of flight if launched now, time to impact of the HARM in flight (seconds). */
    tofS: number | null;
    ttiS: number | null;
  };
  /** CLASS sub-page: 15 classes on the OSBs (CLASS_OSB), the selected one written in the centre. */
  classPage: null | { selected: HarmClass; detected: HarmClass[] };
  /** SCAN sub-page: every detected class, with the side when outside the field of view. */
  scanPage: null | { rows: { cls: HarmClass; side: 'in' | 'left' | 'right' }[] };
  /** Lesson hint: draw a pulsing marker at this OSB (trainer aid, not in DCS). */
  hintOsb: Osb | null;
}

/** EW page (ALR-67 azimuth display) and the RWR lamps. Simplified: one ring, symbol at its bearing. */
export interface EwView {
  emitters: {
    label: string;
    azDeg: number;
    /** 0 = outer (searching), 1 = inner (lethal / locked). Radius on the display. */
    ring: 0 | 1;
    /** The emitter the HARM is cued to (S1 p365). */
    boxed: boolean;
    lockedYou: boolean;
  }[];
  /** AI lamp: a radar locked you; CW lamp: a missile is being guided at you. */
  lamps: { ai: boolean; cw: boolean; sam: boolean };
  /** HUD EW boxed (OSB 14 on the EW page, S1 fig. 231). */
  hudOn: boolean;
  hintOsb: Osb | null;
}

/** HUD picture. */
export interface HudView {
  headingDeg: number;
  pitchDeg: number;
  altFt: number;
  iasKt: number;
  mach: number;
  g: number;
  /** Flight path marker, degrees from boresight. */
  fpm: { xDeg: number; yDeg: number };
  master: MasterMode;
  masterArm: boolean;
  /** 'HARM' written on the right side when a HARM is selected (S1 p365). */
  harmLegend: boolean;
  /** Pullback: HARM (ready), HARM-X (crossed out), PLBK (inhibited) (S1 pp366-367). */
  pullback: null | 'HARM' | 'HARM-X' | 'PLBK';
  /** EW symbols in the HUD when HUD EW is on. */
  ew: { label: string; azDeg: number; boxed: boolean }[];
  /** TOO line of sight to the designated emitter: a box, H-OFF above it once handed off (S1 p370). */
  los: null | { xDeg: number; yDeg: number; hoff: boolean };
  /** Steering to the selected waypoint or the designated TGT point (diamond when designated, S1 p122). */
  steer: null | { name: string; distNm: number; xDeg: number; yDeg: number; tgt: boolean };
  /** PB cues (S1 fig. 216). Release cues are elevation angles on the azimuth steering line. */
  pb: null | {
    aslXDeg: number;
    inRange: 'A/C RNG' | 'HRM RNG' | null;
    distNm: number;
    acCueYDeg: number | null;
    hrmCueYDeg: number | null;
    minCueYDeg: number | null;
  };
}

/** UFC: five option windows with cueing colons, the scratchpad, the keypad. */
export type UfcKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'CLR' | 'ENT' | 'OPT1' | 'OPT2' | 'OPT3' | 'OPT4' | 'OPT5';
export interface UfcView {
  /** Option windows 1-5, top to bottom. `cued` puts the ':' in front (selected option). */
  options: { text: string; cued: boolean }[];
  scratch: string;
  /** Lesson hint: pulse this key (trainer aid). */
  hint: UfcKey | null;
}

/** World snapshot for the 3D scene, sim metres: x east, y up, z south (the app's frame). */
export interface SceneView {
  t: number;
  jet: { pos: { x: number; y: number; z: number }; headingRad: number; pitchRad: number; alive: boolean };
  sites: {
    id: string;
    system: SystemId;
    vehicles: { id: VehicleId; pos: { x: number; y: number; z: number }; headingRad: number; emitter: boolean; alive: boolean }[];
    /** The site's radar is transmitting. */
    emitting: boolean;
    /** Its tracking radar is locked on the jet. */
    lockedJet: boolean;
  }[];
  harms: {
    id: string;
    pos: { x: number; y: number; z: number };
    vel: { x: number; y: number; z: number };
    /** Guidance lost (radar went quiet): drawn dimmer. */
    lost: boolean;
    alive: boolean;
  }[];
  /** Short-lived explosions: position and age (s). */
  blasts: { pos: { x: number; y: number; z: number }; age: number }[];
}
