/**
 * [OWNER: page-harm] Facts for the HARM page: the SAM systems it teaches, their radars, RWR symbols, TOO classes and
 * PB codes, the HARM's stations, and the trainer's own values (marked). Every fact is from
 * docs/research/fa18c-harm.md: S1 = ED F/A-18C guide (page numbers), S2 = DCS encyclopedia. Page-local on purpose:
 * the shared SamId only covers the SA-10/11/15 sites the BVR pages use.
 */
import type { HarmClass, SystemId, VehicleId } from './types';

export interface RadarInfo {
  /** Vehicle carrying the radar. */
  vehicle: VehicleId;
  /** Radar name as the RWR and the guide name it. */
  name: string;
  /** RWR symbol on the azimuth indicator and the TOO format (S1 p420). */
  rwr: string;
  /** TOO class, null where the guide's table leaves it blank (S1 p420). */
  cls: HarmClass | null;
  /** PB emitter code (ALIC ID, S1 p420). */
  alic: number;
  /** What it does for the battery, in pilot terms. */
  job: 'search' | 'track' | 'search and track';
}

export interface VehicleRole {
  id: VehicleId;
  /** Display name. */
  name: string;
  /** One line: what the vehicle is for. */
  role: string;
  /** Has a radar the HARM can home on. */
  radar: boolean;
}

export interface SystemInfo {
  id: SystemId;
  name: string;
  nato: string;
  /** One paragraph: what the battery is and how it fights, pilot level. */
  summary: string;
  vehicles: VehicleRole[];
  radars: RadarInfo[];
  /** Which radar to shoot and why. */
  harmTarget: string;
  /** Envelope figures as S2 (or S5) publishes them, with the source in the text. */
  figures: string[];
  /** Where it appears in the practice missions. */
  inMissions: string | null;
}

export const SYSTEMS: Record<SystemId, SystemInfo> = {
  sa6: {
    id: 'sa6', name: '2K12 Kub', nato: 'SA-6 Gainful',
    summary: 'A mobile battery built around one radar vehicle. The 1S91 "Straight Flush" both searches for you and tracks you; the 2P25 launchers around it carry three missiles each and have no radar of their own. Kill the radar and the launchers are blind.',
    vehicles: [
      { id: 'sa6-str', name: '1S91 Straight Flush', role: 'Search and track radar for the whole battery', radar: true },
      { id: 'sa6-tel', name: '2P25 launcher', role: 'Three missiles on a turntable; no radar', radar: false },
    ],
    radars: [{ vehicle: 'sa6-str', name: 'Straight Flush', rwr: '6', cls: 'H1', alic: 108, job: 'search and track' }],
    harmTarget: 'The 1S91 Straight Flush: code 108, RWR 6, class H1. It is the only emitter in the battery.',
    figures: [
      'Radar detection 75 km, up to 10 km altitude; tracking 28 km (DCS encyclopedia, 1S91).',
      'Missile effective range 4–24 km, altitude up to 14 km (DCS encyclopedia, 2P25).',
    ],
    inMissions: 'Range 1 at WP2 in both missions; live in mission 2.',
  },
  sa8: {
    id: 'sa8', name: '9K33 Osa', nato: 'SA-8 Gecko',
    summary: 'Everything on one six-wheeled vehicle: a search antenna, a tracking radar and six missiles. One vehicle is a complete short-range air defence, so each one is its own emitter.',
    vehicles: [{ id: 'sa8', name: '9A33 Osa', role: 'Search radar, tracking radar and six missiles on one vehicle', radar: true }],
    radars: [{ vehicle: 'sa8', name: 'Land Roll', rwr: '8', cls: 'H1', alic: 117, job: 'search and track' }],
    harmTarget: 'The 9A33 itself: code 117, RWR 8, class H1.',
    figures: ['The DCS encyclopedia gives a 100 m minimum altitude and no range.'],
    inMissions: 'Range 2 near WP3 in mission 1, with the SA-15.',
  },
  sa11: {
    id: 'sa11', name: '9K37 Buk-M1', nato: 'SA-11 Gadfly',
    summary: 'A battery with a separate search radar, a command post and launchers that each carry their own tracking radar. The 9S18M1 "Snow Drift" finds you from far away; each 9A310M1 launcher locks you with its "Fire Dome" and guides its own missiles.',
    vehicles: [
      { id: 'sa11-sr', name: '9S18M1 Snow Drift', role: 'Search (target acquisition) radar for the battery', radar: true },
      { id: 'sa11-cp', name: '9S470M1 command post', role: 'Runs the battery; no radar the HARM can use', radar: false },
      { id: 'sa11-telar', name: '9A310M1 launcher (TELAR)', role: 'Four missiles and its own Fire Dome tracking radar', radar: true },
    ],
    radars: [
      { vehicle: 'sa11-sr', name: 'Snow Drift', rwr: 'SD', cls: 'H2', alic: 107, job: 'search' },
      { vehicle: 'sa11-telar', name: 'Fire Dome', rwr: '11', cls: 'H2', alic: 115, job: 'track' },
    ],
    harmTarget: 'Snow Drift (code 107, RWR SD) blinds the battery\'s search. A Fire Dome (code 115, RWR 11) is the launcher that is about to shoot. Both are class H2.',
    figures: [
      'Snow Drift instrumented range 10–160 km (DCS encyclopedia, 9S18M1).',
      'Engagement 3–35 km (DCS encyclopedia, 9S470M1); the trainer\'s SAM notes give the same.',
    ],
    inMissions: 'Range 3 at WP4: PB practice in mission 1, live in mission 2.',
  },
  sa15: {
    id: 'sa15', name: '9K331 Tor', nato: 'SA-15 Gauntlet',
    summary: 'A tracked vehicle with a search radar, a tracking radar and eight missiles. Like the SA-8 it fights alone, but it is newer and quicker: a point defence that can sit next to other sites.',
    vehicles: [{ id: 'sa15', name: '9A331 Tor', role: 'Search and tracking radars and eight missiles on one vehicle', radar: true }],
    radars: [{ vehicle: 'sa15', name: 'Scrum Half', rwr: '15', cls: 'H2', alic: 119, job: 'search and track' }],
    harmTarget: 'The 9A331 itself: code 119, RWR 15, class H2.',
    figures: ['1.5–12 km, up to 6000 m (Fox3 Academy SAM notes from a community reference; not verified in game).'],
    inMissions: 'Range 2 near WP3 in mission 1, with the SA-8.',
  },
  sa10: {
    id: 'sa10', name: 'S-300PS', nato: 'SA-10 Grumble',
    summary: 'A long-range battery with separate radars for each job: the 64N6E "Big Bird" watches a huge area, the 30N6 "Flap Lid" tracks and guides, and the 5P85 launchers carry four missiles each without a radar of their own.',
    vehicles: [
      { id: 'sa10-sr', name: '64N6E Big Bird', role: 'Long-range surveillance radar', radar: true },
      { id: 'sa10-tr', name: '30N6 Flap Lid', role: 'Tracking and guidance radar', radar: true },
      { id: 'sa10-ln', name: '5P85 launcher', role: 'Four missiles; no radar', radar: false },
    ],
    radars: [
      { vehicle: 'sa10-sr', name: 'Big Bird', rwr: 'BB', cls: 'H2', alic: 104, job: 'search' },
      { vehicle: 'sa10-tr', name: 'Flap Lid', rwr: '10', cls: 'H2', alic: 110, job: 'track' },
    ],
    harmTarget: 'The Flap Lid (code 110, RWR 10): without it the launchers cannot guide. The Big Bird (104, BB) only searches.',
    figures: [
      'Big Bird detection 300 km (DCS encyclopedia, 64N6E).',
      'Launchers: 47 km against targets above 2000 m, 25 km at 25 m and below (DCS encyclopedia, 5P85). Fox3 Academy\'s other pages use 120 km from a community reference; the two disagree.',
    ],
    inMissions: null,
  },
};

export const SYSTEM_ORDER: SystemId[] = ['sa6', 'sa8', 'sa11', 'sa15', 'sa10'];

/** Emitter code table for the kneeboard: the rows of S1 p420 whose columns line up. */
export const ALIC_TABLE: { system: string; radar: string; rwr: string; cls: HarmClass | null; alic: number }[] = [
  { system: 'SA-2/3/5', radar: 'P-19 Flat Face B', rwr: 'S', cls: 'H1', alic: 122 },
  { system: 'SA-2', radar: 'SNR-75 Fan Song', rwr: '2', cls: null, alic: 126 },
  { system: 'SA-3', radar: 'SNR-125 Low Blow', rwr: '3', cls: 'H1', alic: 123 },
  { system: 'SA-5', radar: '5N62 Square Pair', rwr: '5', cls: null, alic: 129 },
  { system: 'SA-6', radar: '1S91 Straight Flush', rwr: '6', cls: 'H1', alic: 108 },
  { system: 'SA-8', radar: 'Land Roll', rwr: '8', cls: 'H1', alic: 117 },
  { system: 'SA-10', radar: '64N6E Big Bird', rwr: 'BB', cls: 'H2', alic: 104 },
  { system: 'SA-10', radar: '5N66M Clam Shell', rwr: 'CS', cls: 'H2', alic: 103 },
  { system: 'SA-10', radar: '30N6E Flap Lid', rwr: '10', cls: 'H2', alic: 110 },
  { system: 'SA-11', radar: '9S18M1 Snow Drift', rwr: 'SD', cls: 'H2', alic: 107 },
  { system: 'SA-11', radar: '9S35 Fire Dome', rwr: '11', cls: 'H2', alic: 115 },
  { system: 'SA-11 battery', radar: '9S80M1 Dog Ear', rwr: 'DE', cls: 'HS', alic: 109 },
  { system: 'SA-13', radar: '9S86 Snap Shot', rwr: '13', cls: null, alic: 118 },
  { system: 'SA-15', radar: 'Scrum Half', rwr: '15', cls: 'H2', alic: 119 },
];

/** What each TOO class shows (S1 p371). */
export const CLASS_MEANING: Record<HarmClass, string> = {
  ALL: 'all radars', FRD: 'friendly radars', HOS: 'hostile radars', FN: 'friendly naval radars', HN: 'hostile naval radars',
  F1: 'old friendly radars', F2: 'new friendly radars', H1: 'old hostile radars', H2: 'new hostile radars',
  FAA: 'friendly AAA', HAA: 'hostile AAA', FS: 'friendly search radars', HS: 'hostile search radars',
  UKN: 'unknown radars', PRI: 'radars locked to you',
};

/** HARM stations and the order the next HARM is selected after a launch (S1 p361-362). */
export const HARM_STATIONS = [8, 2, 7, 3] as const;

/**
 * Trainer values: not DCS figures. The page lists them as simplified (HARM_CAVEATS).
 * Radar ranges for the drills use S2 where it gives one (SA-6) and round trainer numbers elsewhere.
 */
export const TRAINER = {
  /** Range at which each system's radar shows on your RWR and when it locks you (m). */
  detectM: { sa6: 75_000, sa8: 30_000, sa11: 100_000, sa15: 25_000, sa10: 150_000 } as Record<SystemId, number>,
  lockM: { sa6: 28_000, sa8: 12_000, sa11: 35_000, sa15: 12_000, sa10: 47_000 } as Record<SystemId, number>,
  /** HARM pull-up in range below this (nm), at 25000 ft; scales with altitude. A/C pull-up reaches 30 % further. */
  hrmRangeNmAt25k: 40,
  acRangeFactor: 1.3,
  minRangeNm: 5,
  /** HARM seeker field of view half-angle (deg): the T marks (S1 p369). */
  fovHalfDeg: 15,
  /** PB: distance before the designated point where the HARM switches its receiver on (m). */
  pbSeekerOnM: 12_000,
  /** PB: the HARM finds an emitter of the coded type within this distance of the point (m). */
  pbSearchRadiusM: 4_000,
  /** A radar with evasion on goes quiet when a HARM homing on it is this close (m), for this long (s). */
  evadeAtM: 15_000,
  evadeForS: 45,
} as const;

/** What the page simplifies; shown in the "Simplified and not verified" disclosure. */
export const HARM_CAVEATS: string[] = [
  'The HARM flies an arcade path: a fixed speed curve, a loft that shrinks as it closes, and a turn-rate limit. It homes while the radar transmits and goes ballistic when it stops (ED guide p367).',
  'In-range distances for PB (40 nm for a HARM pull-up at 25000 ft, 30 % more for an A/C pull-up, 5 nm minimum) are trainer values, not DCS figures. The guide only says up to 80 nm depending on altitude.',
  'The HUD release cues are placed by a trainer rule: the A/C pull-up cue near 45° at long range, the HARM pull-up cue a few degrees up. Fly the cues the same way as in DCS; their exact positions differ.',
  'RWR detection and lock ranges: the SA-6 uses the DCS encyclopedia (75 km, 28 km); the others are round trainer numbers.',
  'A radar that "evades" goes quiet when your HARM is 15 km away and stays off 45 s. DCS AI decides this itself (Mission Editor option "Evasion of ARM").',
  'TOO format: only azimuth limits the 30° field of view here; each emitter is drawn at half its angle below the nose, clamped inside the T marks.',
  'The EW page is one ring with symbols at their bearing; the ALR-67 display in DCS has more detail.',
  'The pullback label position in the HUD is not verified.',
  'The jet flies on a simple autopilot: arrows turn and pitch it; it holds speed.',
];
