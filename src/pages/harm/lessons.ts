/**
 * [OWNER: page-harm] Lessons of the HARM page: what each one sets up, its steps (with the reason behind each one,
 * shown by the coach), the trainer hints, and the per-frame snapshot the steps are checked against. Pure: no DOM.
 * Facts: docs/research/fa18c-harm.md (page numbers are the ED F/A-18C guide).
 */
import type { Waypoint } from './avionics';
import type { SimSetup, Vec3 } from './sim';
import type { HarmClass, HarmMode, MasterMode, Osb, Pullup, SystemId, UfcKey, VehicleId } from './types';

export type HarmLessonId = 'radars' | 'homing' | 'sp' | 'too' | 'pb' | 'pullback' | 'live';
export const HARM_LESSON_ORDER: HarmLessonId[] = ['radars', 'homing', 'sp', 'too', 'pb', 'pullback', 'live'];
export const progressKey = (l: HarmLessonId): string => `harm:${l}:fa18c`;

/** Homing films (lesson 'homing'). */
export type FilmId = 'direct' | 'shutdown' | 'pb' | 'ac';
export const FILM_ORDER: FilmId[] = ['direct', 'shutdown', 'pb', 'ac'];
export const FILMS: Record<FilmId, { label: string; title: string; narration: string[] }> = {
  direct: {
    label: 'SP / TOO shot', title: 'Straight at a transmitting radar',
    narration: [
      'SP and TOO shots go straight for the radar the HARM was given.',
      'The HARM climbs a little to keep its energy, then dives onto the radar.',
      'It homes on the radar\'s own transmissions: as long as the radar keeps transmitting, it is guided all the way (guide p367).',
    ],
  },
  shutdown: {
    label: 'Radar goes quiet', title: 'The radar switches off mid-flight',
    narration: [
      'Same shot, but the crew switches the radar off while the HARM is on its way.',
      'With nothing to listen to, the HARM loses guidance and falls on a ballistic path: it will likely miss (guide p367).',
      'DCS AI does this by itself when the Mission Editor option "Evasion of ARM" is on, which is the default.',
    ],
  },
  pb: {
    label: 'PB, HARM pull-up', title: 'PB: fly to the point, then listen',
    narration: [
      'In PB the HARM is given a place and an emitter code, not a target it can already hear.',
      'It lofts high toward the designated waypoint, turns its receiver on near it, finds the radar of that code and homes (guide p373).',
      'With a HARM pull-up, the missile does the climbing itself, so you launch closer.',
    ],
  },
  ac: {
    label: 'PB, A/C pull-up', title: 'PB with an aircraft pull-up',
    narration: [
      'With an A/C pull-up, you climb the jet to about 45° before release (guide p375).',
      'The HARM leaves the rail already climbing and keeps its energy: the shot reaches further than a HARM pull-up.',
    ],
  },
};

/** What the steps check, refreshed every frame by the page. */
export interface HarmSnap {
  masterArm: boolean;
  master: MasterMode;
  harmSelected: boolean;
  page: 'SMS' | 'HARM' | 'CLASS' | 'SCAN';
  mode: HarmMode;
  tdc: boolean;
  cls: HarmClass;
  ewHud: boolean;
  hrmOvrd: boolean;
  spCue: string | null;
  tooBox: string | null;
  handoff: string | null;
  ufcOn: boolean;
  ufcOption: number | null;
  pbCode: number | null;
  pullupChosen: Pullup | null;
  designated: string | null;
  inRange: boolean;
  launches: number;
  pullbackShots: number;
  kills: VehicleId[];
  lockSeen: boolean;
  jetAlive: boolean;
  /** Pointing more than 90° away from the first site. */
  turnedAway: boolean;
  visited: SystemId[];
  watched: FilmId[];
}

export interface HarmStep {
  id: string;
  text: string;
  keys?: string;
  /** Why this step, for the coach. */
  why: string;
  check: (s: HarmSnap) => boolean;
  /** Trainer hint: pulse this control. */
  hint?: { ddi?: Osb; ew?: Osb; ufc?: UfcKey };
}

export interface HarmLesson {
  id: HarmLessonId;
  title: string;
  short: string;
  goal: string;
  kind: 'gallery' | 'film' | 'drill';
  steps: HarmStep[];
  /** Drill setup: the sim and the waypoints. */
  setup?: () => { sim: SimSetup; waypoints: (sitePos: (id: string) => Vec3) => Waypoint[] };
}

const NM = 1852;
/** Jet at the origin heading north at 25000 ft, 450 kt; sites `nm` ahead and `east` nm to the side. */
const at = (nm: number, east = 0) => ({ x: east * NM, z: -nm * NM });
const jet = { x: 0, z: 0, altFt: 25000, headingDeg: 0, speedKt: 450 };

const armed: HarmStep[] = [
  {
    id: 'arm', text: 'Master Arm to ARM.', keys: 'M',
    why: 'Nothing leaves the rails with the Master Arm switch in SAFE (guide p40).',
    check: s => s.masterArm,
  },
  {
    id: 'ag', text: 'Press A/G on the master mode panel.', keys: '2',
    why: 'The HARM is an air-to-ground weapon: the stores page offers it in A/G (guide p361).',
    check: s => s.master === 'AG',
  },
  {
    id: 'harm', text: 'On the right DDI stores page, press HARM (pushbutton 6, top row).',
    why: 'Selecting the HARM replaces the stores page with the HARM format, where the modes live (guide p362).',
    check: s => s.harmSelected, hint: { ddi: 6 },
  },
];

export const LESSONS: Record<HarmLessonId, HarmLesson> = {
  radars: {
    id: 'radars', title: 'Know the radars', short: 'Radars', kind: 'gallery',
    goal: 'Meet the five SAM systems the HARM hunts in DCS. For each one, find which vehicle carries the radar: that is the HARM\'s target.',
    steps: (['sa6', 'sa8', 'sa11', 'sa15', 'sa10'] as SystemId[]).map(id => ({
      id: `see-${id}`,
      text: `Look at the ${({ sa6: 'SA-6', sa8: 'SA-8', sa11: 'SA-11', sa15: 'SA-15', sa10: 'SA-10' })[id]} battery.`,
      why: 'Read which vehicle has the radar, its RWR symbol and its PB code. Drag the view to orbit.',
      check: (s: HarmSnap) => s.visited.includes(id),
    })),
  },
  homing: {
    id: 'homing', title: 'How a HARM flies', short: 'Homing', kind: 'film',
    goal: 'Watch four shots and see why the radar has to keep transmitting.',
    steps: FILM_ORDER.map(id => ({
      id: `film-${id}`, text: `Watch: ${FILMS[id].title}.`, why: FILMS[id].narration[0]!,
      check: (s: HarmSnap) => s.watched.includes(id),
    })),
  },
  sp: {
    id: 'sp', title: 'SP shot on an SA-6', short: 'SP', kind: 'drill',
    goal: 'An SA-6 holding fire 30 nm ahead, radar on. Let the HARM cue itself to it and fire in Self-Protect.',
    setup: () => ({ sim: { jet, sites: [{ id: 'r1', name: 'Range 1 SA-6', system: 'sa6', at: at(30) }] }, waypoints: p => [{ name: 'WP2 SA-6', pos: p('r1') }] }),
    steps: [
      ...armed,
      {
        id: 'ewhud', text: 'On the left DDI EW page, box HUD (pushbutton 14).',
        why: 'The emitters then also show in the HUD, with the one the HARM is cued to boxed (guide p365, p410).',
        check: s => s.ewHud, hint: { ew: 14 },
      },
      {
        id: 'cue', text: 'Check 6 is boxed on the EW page: SP cued the HARM to it.',
        why: 'In SP the HARM picks the highest radar threat by itself. HARM Sequence (I) would step to another one (guide p365).',
        check: s => s.harmSelected && s.mode === 'SP' && s.spCue === '6',
      },
      {
        id: 'fire', text: 'Fire: weapon release.', keys: 'RAlt+Space',
        why: 'SP shows no range (guide p367): WP2 sits on the radar, so its HUD distance is your ruler. 30 nm at 25000 ft is a comfortable shot.',
        check: s => s.launches > 0,
      },
      {
        id: 'kill', text: 'Watch the HARM hit the Straight Flush.',
        why: 'The 2P25 launchers have no radar: with the 1S91 gone, the battery is blind.',
        check: s => s.kills.includes('sa6-str'),
      },
    ],
  },
  too: {
    id: 'too', title: 'TOO: pick one radar out of two', short: 'TOO', kind: 'drill',
    goal: 'An SA-8 and an SA-15 ahead, both transmitting. Choose the SA-15 with the class filter and hand it off.',
    setup: () => ({
      sim: { jet, sites: [{ id: 'sa8', name: 'Range 2 SA-8', system: 'sa8', at: at(14.5, -1.2) }, { id: 'sa15', name: 'Range 2 SA-15', system: 'sa15', at: at(12.5, 1.3) }] },
      waypoints: p => [{ name: 'WP3', pos: { x: (p('sa8').x + p('sa15').x) / 2, y: 0, z: (p('sa8').z + p('sa15').z) / 2 } }],
    }),
    steps: [
      ...armed,
      {
        id: 'too', text: 'Press TOO (left column, second from the top).',
        why: 'In TOO the HARM becomes its own sensor: every radar inside its 30° field of view shows as its RWR number (guide p368).',
        check: s => s.mode === 'TOO', hint: { ddi: 4 },
      },
      {
        id: 'tdc', text: 'Give the HARM display the TDC: Sensor Control right.', keys: 'RAlt+/',
        why: 'HARM Sequence and Cage/Uncage act on the display that has the TDC: the small diamond top right (guide p368).',
        check: s => s.tdc,
      },
      {
        id: 'class', text: 'Press CLASS (pushbutton 11), then H2.',
        why: 'H1 is older hostile systems (the SA-8 is one), H2 newer ones (the SA-15). The filter hides everything else (guide p371, p420).',
        check: s => s.cls === 'H2' && s.page === 'HARM', hint: { ddi: 11 },
      },
      {
        id: 'box', text: 'Make sure 15 is boxed; HARM Sequence steps the box.', keys: 'I',
        why: 'The box is the priority target, the one a hand-off will give the HARM (guide p369).',
        check: s => s.tooBox === '15',
      },
      {
        id: 'handoff', text: 'Hand off: Cage/Uncage.', keys: 'C',
        why: 'H-OFF appears above the box, the others vanish, STBY becomes RDY: the HARM now knows exactly which radar to chase (guide p368).',
        check: s => s.handoff === '15',
      },
      { id: 'fire', text: 'Fire.', keys: 'RAlt+Space', why: 'With the hand-off done, weapon release sends the HARM at the SA-15.', check: s => s.launches > 0 },
      { id: 'kill', text: 'Watch the SA-15 go.', why: 'Next time, try CLASS H1 for the SA-8.', check: s => s.kills.includes('sa15') },
    ],
  },
  pb: {
    id: 'pb', title: 'PB shot on the SA-11 Snow Drift', short: 'PB', kind: 'drill',
    goal: 'You know where the SA-11 is: WP4 sits on its Snow Drift radar, 36 nm ahead. Program the code, designate WP4 and fly the HUD cues.',
    setup: () => ({
      sim: { jet, sites: [{ id: 'r3', name: 'Range 3 SA-11', system: 'sa11', at: at(36) }] },
      waypoints: p => [{ name: 'WP3', pos: { x: -8 * NM, y: 0, z: -20 * NM } }, { name: 'WP4 SA-11', pos: p('r3') }],
    }),
    steps: [
      ...armed,
      {
        id: 'pb', text: 'Press PB (left column, third). HARM is crossed out.',
        why: 'Pre-Briefed is for a radar at a known place. The X stays until the HARM knows what radar type to look for (guide p373-374).',
        check: s => s.mode === 'PB', hint: { ddi: 3 },
      },
      {
        id: 'ufc', text: 'Press UFC (pushbutton 14).',
        why: 'The PB options move to the Up-Front Controller, where you type numbers (guide p374).',
        check: s => s.ufcOn, hint: { ddi: 14 },
      },
      {
        id: 'opt', text: 'On the UFC, press option window 4: TGT.',
        why: 'TGT is the emitter type. The colon in front of it shows the window you are typing into.',
        check: s => s.ufcOption === 4, hint: { ufc: 'OPT4' },
      },
      {
        id: 'code', text: 'Type 1, 0, 7 and press ENT.',
        why: '107 is the ALIC code of the 9S18M1 Snow Drift in the guide\'s table (p420). Eastern land radars use 1xx codes; the Fire Dome on each launcher would be 115.',
        check: s => s.pbCode === 107, hint: { ufc: 'ENT' },
      },
      {
        id: 'pullup', text: 'Box HRM (bottom of the left column): HARM pull-up.',
        why: 'The HARM will do the loft itself. The other choice, A/C, means you climb the jet for a longer shot (guide p374).',
        check: s => s.pullupChosen === 'HRM', hint: { ddi: 1 },
      },
      {
        id: 'wpdsg', text: 'On the HSI, step to WP4 and press WPDSG.',
        why: 'The designated waypoint is where the HARM flies before it listens. A diamond marks it in the HUD (guide p122, p374).',
        check: s => s.designated === 'WP4 SA-11',
      },
      {
        id: 'range', text: 'Put the flight path marker on the steering line and wait for HRM RNG.',
        why: 'The in-range cue says the HARM has the energy to reach the point (guide p375).',
        check: s => s.inRange,
      },
      {
        id: 'fire', text: 'Hold weapon release and raise the nose to the HARM pull-up cue.', keys: 'RAlt+Space, Down arrow',
        why: 'The HARM leaves the rail when the flight path marker meets the cue within 1° of the steering line (guide p375).',
        check: s => s.launches > 0,
      },
      { id: 'kill', text: 'Watch it loft, listen near WP4, and hit the Snow Drift.', why: 'The SA-11 has lost its search radar; its launchers can still look for you with their Fire Domes.', check: s => s.kills.includes('sa11-sr') },
    ],
  },
  pullback: {
    id: 'pullback', title: 'Pullback: shoot the radar that locks you', short: 'Pullback', kind: 'drill',
    goal: 'A live SA-6 19 nm ahead. Arm Pullback, let it lock you, then shoot back at once and turn away.',
    setup: () => ({ sim: { jet, sites: [{ id: 'r1', name: 'SA-6', system: 'sa6', at: at(19, 2), live: true }] }, waypoints: p => [{ name: 'WP2 SA-6', pos: p('r1') }] }),
    steps: [
      { id: 'arm', text: 'Master Arm to ARM.', keys: 'M', why: 'Without it the pullback HARM shows crossed out (guide p366-367).', check: s => s.masterArm },
      {
        id: 'ovrd', text: 'Unbox HRM OVRD (bottom right, pushbutton 16) on the stores page.',
        why: 'Boxed is the default and keeps Pullback off: a lock would only show PLBK (guide p363, p367).',
        check: s => !s.hrmOvrd, hint: { ddi: 16 },
      },
      {
        id: 'lock', text: 'Keep flying toward WP2 until the SA-6 locks you: AI lamp, 6 on the inner ring.',
        why: 'A tracking lock is a critical threat: Pullback readies a HARM against it and HARM appears in the HUD (guide p365-366).',
        check: s => s.lockSeen,
      },
      {
        id: 'fire', text: 'HARM in the HUD with no X: weapon release now.', keys: 'RAlt+Space',
        why: 'No mode to select, no target to pick: the jet has done it. Works in any master mode (guide p366-367).',
        check: s => s.pullbackShots > 0,
      },
      {
        id: 'away', text: 'Turn away from the site.', keys: 'Left / Right arrow',
        why: 'Do not fly into its missiles. Your HARM keeps homing as long as the radar transmits; their missile needs that same radar.',
        check: s => s.turnedAway,
      },
      { id: 'kill', text: 'Radar dead: their missile, if any, goes dumb.', why: 'Kill the radar and the SA-6 loses its eyes and its guidance.', check: s => s.kills.includes('sa6-str') && s.jetAlive },
    ],
  },
  live: {
    id: 'live', title: 'Live SEAD run', short: 'Live', kind: 'drill',
    goal: 'Mission 2 in small: a live SA-6 that switches off when it sees a HARM, and a live SA-11 at WP4. Kill both radars and come home.',
    setup: () => ({
      sim: {
        jet,
        sites: [
          { id: 'sa6', name: 'SA-6', system: 'sa6', at: at(32, -3), live: true, evades: true },
          { id: 'sa11', name: 'SA-11', system: 'sa11', at: at(46, 6), live: true, evades: true },
        ],
      },
      waypoints: p => [{ name: 'WP2 SA-6', pos: p('sa6') }, { name: 'WP4 SA-11', pos: p('sa11') }],
    }),
    steps: [
      ...armed,
      {
        id: 'sa6', text: 'Kill the SA-6 radar from outside its reach (TOO or SP).',
        why: 'If the 6 goes quiet while your HARM flies, it switched off and the HARM will probably miss: wait for it to come back and shoot again.',
        check: s => s.kills.includes('sa6-str'),
      },
      {
        id: 'sa11', text: 'Kill the SA-11 Snow Drift with a PB shot (code 107, WPDSG on WP4).',
        why: 'From stand-off the SA-11 cannot reach you; PB gives you a range and a time of flight.',
        check: s => s.kills.includes('sa11-sr'),
      },
      { id: 'alive', text: 'Stay alive.', why: 'Beam a launch and drop chaff (E), or kill the radar guiding it.', check: s => s.jetAlive && s.kills.includes('sa6-str') && s.kills.includes('sa11-sr') },
    ],
  },
};

/** Downloadable missions (public/missions) and how they map to the lessons. */
export const MISSIONS = [
  {
    file: 'Fox3_HARM_1_Ranges.miz', title: 'Mission 1: safe ranges',
    text: 'Radars on, weapons hold, never switch off for a HARM. Range 1 SA-6 at WP2 on at start; Range 2 SA-8 + SA-15 near WP3 and Range 3 SA-11 at WP4 from F10 › Other. Fly the SP, TOO and PB lessons for real.',
  },
  {
    file: 'Fox3_HARM_2_Live.miz', title: 'Mission 2: live SEAD',
    text: 'The SA-6 and SA-11 shoot back and may go quiet when a HARM comes. Fly the Pullback and Live lessons. Options › Gameplay › Immortal helps the first time.',
  },
] as const;
