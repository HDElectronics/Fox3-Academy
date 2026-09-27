/**
 * [OWNER: data] The built-in DCS JTAC as the player meets it: the 9-line fields, the radio calls on both sides,
 * the radio (comms) menu, the marks and who can see them. Game level only (AGENTS.md rule 1): menu labels,
 * spoken phrases, mark types and the order of the dialogue, never real-world doctrine or weapon detail.
 *
 * Research: docs/research/cas-jtac.md (main source: ED A-10C II Flight Manual, "F4 JTAC" and "JTAC Engagement
 * Flow") and docs/research/cas-jets.md. `verified: true` only where an ED manual gives the wording; everything
 * else is simplified trainer wording and is listed in CAS_CAVEATS.
 */
import type { CommsMenuNode, JtacCallSpec, MarkColour, MarkKind } from './types';
import type { SourceKey } from './sources';

// ─── 9-line ──────────────────────────────────────────────────────────────────────────────────────────────

export type NineLineId =
  | 'ip' | 'heading' | 'distance' | 'elevation' | 'target' | 'location' | 'mark' | 'friendlies' | 'egress';

export interface NineLineFieldSpec {
  /** Line number as the JTAC reads it, 1..9. */
  line: number;
  id: NineLineId;
  label: string;
  /** What the pilot writes down, in one short line. */
  hint: string;
}

/** The nine lines in the order the DCS JTAC reads them (ED A-10C II manual, p. 785). */
export const NINE_LINE_FIELDS: readonly NineLineFieldSpec[] = [
  { line: 1, id: 'ip', label: 'IP', hint: 'Initial point, placed in the Mission Editor. Can be N/A.' },
  { line: 2, id: 'heading', label: 'Heading and offset', hint: 'Heading from the IP to the target, plus any offset.' },
  { line: 3, id: 'distance', label: 'Distance', hint: 'Distance from the IP to the target.' },
  { line: 4, id: 'elevation', label: 'Target elevation', hint: 'Target elevation above mean sea level (MSL).' },
  { line: 5, id: 'target', label: 'Target description', hint: 'What the target is, e.g. armour in the open.' },
  { line: 6, id: 'location', label: 'Target location', hint: 'Target position as a UTM grid.' },
  { line: 7, id: 'mark', label: 'Mark type', hint: 'None, WP (smoke), Laser or IR pointer.' },
  { line: 8, id: 'friendlies', label: 'Friendlies', hint: 'Where the nearest friendly ground forces are.' },
  { line: 9, id: 'egress', label: 'Egress', hint: 'Control point to egress to after the attack.' },
];

export interface NineLineRemarksSpec {
  id: 'remarks';
  label: string;
  hint: string;
  /** What the remarks usually carry (ED manual). */
  items: readonly string[];
}

/** Remarks follow line 9 after the pilot calls "Ready to copy remarks". */
export const NINE_LINE_REMARKS: NineLineRemarksSpec = {
  id: 'remarks',
  label: 'Remarks',
  hint: 'Weapon to use, weather, attack headings.',
  items: ['Weapon', 'Weather', 'Attack headings'],
};

// ─── Control types ───────────────────────────────────────────────────────────────────────────────────────

export interface ControlTypeSpec { type: 1 | 2 | 3; rule: string }

/** Control types as the ED A-10C II manual explains them (p. 784). The JTAC states one after check-in. */
export const JTAC_CONTROL_TYPES: readonly ControlTypeSpec[] = [
  { type: 1, rule: 'JTAC sees both you and the target. Most restrictive; used when friendlies are close.' },
  { type: 2, rule: 'JTAC controls each attack but cannot see you or the target at release.' },
  { type: 3, rule: 'Low risk to friendlies. Least restrictive; often coordinates only.' },
];

// ─── Radio calls ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * Placeholders the call templates use. Fill with `fillCall`. Units: distanceKm in km, elevM in metres MSL,
 * headings in degrees magnetic as three digits, code a four-digit laser code.
 */
export const CALL_PLACEHOLDERS = [
  'callsign', 'jtac', 'mission', 'ipPosition', 'altitude', 'weapons', 'playtime', 'controlType',
  'ip', 'heading', 'offset', 'distanceKm', 'elevM', 'target', 'grid', 'mark', 'friendlies', 'egress',
  'weapon', 'attackHdg', 'code', 'fromMark', 'bda',
] as const;
export type CallPlaceholder = typeof CALL_PLACEHOLDERS[number];

const A10: SourceKey = 'edA10c2Manual';
const CHUCK: SourceKey = 'chucksA10c';

function call(id: string, speaker: JtacCallSpec['speaker'], text: string, verified: boolean, sources: SourceKey[], note?: string): JtacCallSpec {
  return note ? { id, speaker, text, verified, sources, note } : { id, speaker, text, verified, sources };
}

/**
 * Every call in the JTAC dialogue, in flow order. `sources` holds SourceKey names (resolve with SOURCE_ID).
 * Pilot calls that are A-10C II menu items are verified; JTAC voice lines are verified only for the phrases the
 * ED manual quotes: "Standby for data", "mark is on the deck", "continue", "cleared hot", "abort".
 */
export const JTAC_CALLS: readonly JtacCallSpec[] = [
  // Check-in and 9-line
  call('check-in', 'pilot', '{jtac}, {callsign}, mission {mission}, {ipPosition}, {altitude}, {weapons}, {playtime} play time. Request tasking.', false, [A10],
    'The game sends this by itself. Content per the manual (mission number, position from the IP, altitude, weapons, time available); wording simplified.'),
  call('control-type', 'jtac', '{callsign}, {jtac}, type {controlType} in effect. Advise when ready for 9-line.', false, [A10, CHUCK],
    'Chuck\'s example: "Type 3 in effect". Exact wording not verified.'),
  call('ready-to-copy', 'pilot', 'Ready to copy.', true, [A10]),
  call('line-1', 'jtac', '{ip}.', false, [A10]),
  call('line-2', 'jtac', '{heading}, offset {offset}.', false, [A10]),
  call('line-3', 'jtac', '{distanceKm} kilometres.', false, [A10], 'The trainer reads line 3 in km for the Su-25T.'),
  call('line-4', 'jtac', '{elevM} metres MSL.', false, [A10], 'The trainer reads line 4 in metres for the Su-25T.'),
  call('line-5', 'jtac', '{target}.', false, [A10]),
  call('line-6', 'jtac', '{grid}.', false, [A10], 'Shown as a trainer grid, not a real UTM grid.'),
  call('line-7', 'jtac', '{mark}.', false, [A10]),
  call('line-8', 'jtac', '{friendlies}.', false, [A10]),
  call('line-9', 'jtac', 'Egress {egress}.', false, [A10]),
  call('remarks-query', 'jtac', 'Advise when ready for remarks.', false, [A10], 'The manual says the JTAC asks; wording not verified.'),
  call('ready-remarks', 'pilot', 'Ready to copy remarks.', false, [CHUCK], 'Menu label from Chuck\'s guide, not the ED manual.'),
  call('remarks', 'jtac', 'Request {weapon}. Final attack heading {attackHdg}.', false, [A10]),
  call('remarks-laser', 'jtac', 'Laser code {code}.', false, [A10],
    'The manual says the code is given during the 9-line (1688 by default); where it is spoken is not verified.'),
  call('readback', 'pilot', '{grid}, {elevM} metres, final attack heading {attackHdg}.', false, [A10, CHUCK],
    'Content per the manual (target location, elevation, attack heading if given). Menu label "9-line readback" is from Chuck\'s guide.'),
  call('standby-data', 'jtac', 'Standby for data.', true, [A10], 'A-10C II: the digital 9-line then arrives by datalink.'),

  // Attack run
  call('report-ip', 'jtac', 'Report IP inbound.', false, [A10]),
  call('ip-inbound', 'pilot', 'IP inbound.', true, [A10]),
  call('continue', 'jtac', 'Continue.', true, [A10]),
  call('mark-on-deck', 'jtac', 'Mark is on the deck.', true, [A10], 'Smoke goes down once you are inside 10 nm of the target.'),
  call('contact-mark', 'pilot', 'Contact the mark.', true, [A10]),
  call('talk-on', 'jtac', 'From the mark, {fromMark}. Your target is {target}.', false, [A10],
    'The manual says the JTAC gives the target position relative to the mark. Phrasing simplified.'),
  call('in', 'pilot', 'In.', true, [A10],
    'Human JTAC practice adds a direction ("IN from the south"); whether the AI line does is not verified.'),
  call('cleared-hot', 'jtac', 'Cleared hot.', true, [A10]),
  call('abort', 'jtac', 'Abort.', true, [A10]),
  call('abort-no-permission', 'jtac', 'ABORT ABORT ABORT. You do not have permission to fire.', false, ['fJtacAbort', 'fJtacClearedHot'],
    'Reported by players after a release without clearance; forum snippet only.'),
  call('off', 'pilot', 'Off.', true, [A10]),
  call('re-attack', 'jtac', 'Cleared to re-attack. Report IP inbound.', false, [A10],
    'The manual says the JTAC clears you to re-attack or to depart; wording not verified.'),
  call('depart', 'jtac', 'Cleared to depart.', false, [A10]),

  // Coordinates only
  call('coordinates-cleared', 'jtac', 'Cleared to engage.', false, [A10],
    'Coordinates only: the JTAC clears you once the point data is sent. Wording not verified.'),
  call('attack-complete', 'pilot', 'Attack complete.', true, [A10]),

  // Laser (for jets with a laser spot tracker)
  call('laser-on', 'pilot', 'Laser on.', true, [A10]),
  call('lasing', 'jtac', 'Lasing, code {code}.', false, [A10], 'Wording not verified.'),
  call('spot', 'pilot', 'Spot.', true, [A10]),
  call('shift', 'pilot', 'Shift.', true, [A10], 'Moves the laser to another target in the group.'),
  call('terminate', 'pilot', 'Terminate.', true, [A10], 'Stops the laser.'),

  // IR pointer (NVGs only)
  call('pulse', 'pilot', 'Pulse.', true, [A10], 'Flashes the IR pointer.'),
  call('rope', 'pilot', 'Rope.', true, [A10], 'Moves the IR pointer around.'),

  // Any time after check-in
  call('repeat-brief', 'pilot', 'Repeat brief.', true, [A10]),
  call('what-target', 'pilot', 'What is my target?', true, [A10]),
  call('what-target-reply', 'jtac', 'Your target is {target}, {grid}.', false, [A10], 'Wording simplified.'),
  call('request-bda', 'pilot', 'Request BDA.', true, [A10]),
  call('bda', 'jtac', '{bda}.', false, [A10], 'The manual says the JTAC reports the status of the target; wording not verified.'),
  call('unable', 'pilot', 'Unable to comply.', true, [A10]),
  call('check-out', 'pilot', 'Check out.', true, [A10], 'Ends JTAC control.'),
  call('check-out-reply', 'jtac', '{callsign}, copy, checking out.', false, [A10], 'Wording not verified.'),
];

const CALL_BY_ID = new Map(JTAC_CALLS.map(c => [c.id, c]));

/** A call by id. Throws on an unknown id: ids are data, a typo is a bug. */
export function jtacCall(id: string): JtacCallSpec {
  const c = CALL_BY_ID.get(id);
  if (!c) throw new Error(`unknown JTAC call '${id}'`);
  return c;
}

/** Fill `{placeholder}` fields. Unknown or missing placeholders are left as written. */
export function fillCall(text: string, vars: Partial<Record<CallPlaceholder, string | number>>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => {
    const v = (vars as Record<string, string | number | undefined>)[k];
    return v === undefined ? m : String(v);
  });
}

// ─── Radio menu ──────────────────────────────────────────────────────────────────────────────────────────

/**
 * Every action id a radio menu leaf can carry. The page maps them to JTAC calls and state changes.
 * 'menu-back' and 'menu-exit' are handled by the radio menu itself.
 */
export const JTAC_ACTIONS = [
  'check-in', 'ready-to-copy', 'ready-remarks', 'readback', 'ip-inbound', 'contact-mark', 'pulse', 'rope',
  'laser-on', 'spot', 'shift', 'terminate', 'in', 'off', 'attack-complete',
  'repeat-brief', 'what-target', 'request-bda', 'unable', 'check-out',
  'menu-back', 'menu-exit',
] as const;
export type JtacAction = typeof JTAC_ACTIONS[number];

/**
 * Where the dialogue stands, as it changes the JTAC submenu:
 * 'idle' (not checked in) → 'control' (type given, asks if ready for the 9-line) → 'remarks' (asks if ready for
 * remarks) → 'readback' → 'ip' (report IP inbound; coordinates-only: cleared to engage) → 'inbound' (after
 * "continue", waiting for the mark) → 'mark' (mark on the deck) or 'lasing' (after Laser On) → 'run-in' (talk-on
 * done, call In) → 'in' (waiting for cleared hot or abort) → 'cleared' → 'post' (after Off: re-attack or depart).
 */
export type JtacMenuState =
  | 'idle' | 'control' | 'remarks' | 'readback' | 'ip' | 'inbound' | 'mark' | 'lasing' | 'run-in' | 'in' | 'cleared' | 'post';

/** Line-7 mark types. 'none' is coordinates only. */
export type JtacMarkType = 'none' | 'wp' | 'laser' | 'ir';

type Leaf = Omit<CommsMenuNode, 'children'> & { action: JtacAction };
const leaf = (label: string, action: JtacAction, fkey?: number, unverified?: boolean): Leaf => {
  const n: Leaf = { label, action };
  if (fkey !== undefined) n.fkey = fkey;
  if (unverified) n.unverified = true;
  return n;
};

/** Items the manual lists as available once checked in. Their F-key positions are not documented. */
const COMMON: readonly Leaf[] = [
  leaf('Repeat Brief', 'repeat-brief'),
  leaf('What is my target?', 'what-target'),
  leaf('Request BDA', 'request-bda'),
  leaf('Unable to comply', 'unable'),
  leaf('Check Out', 'check-out'),
];

/** Standard submenu footer. Not in the research; common DCS layout, marked unverified. */
const FOOTER: readonly Leaf[] = [
  leaf('Previous menu', 'menu-back', 11, true),
  leaf('Exit', 'menu-exit', 12, true),
];

function stateItems(state: JtacMenuState, mark: JtacMarkType): Leaf[] {
  switch (state) {
    case 'idle': return [leaf('Check-in 15 min', 'check-in', 1, true)];
    case 'control': return [leaf('Ready to copy', 'ready-to-copy', 1)];
    case 'remarks': return [leaf('Ready to copy remarks', 'ready-remarks', 1, true)];
    case 'readback': return [leaf('9-line readback', 'readback', 1, true)];
    case 'ip': return mark === 'none' ? [leaf('Attack Complete', 'attack-complete', 1)] : [leaf('IP Inbound', 'ip-inbound', 1)];
    case 'inbound': return mark === 'laser' ? [leaf('Laser On', 'laser-on', 1)] : [];
    case 'mark': return mark === 'ir'
      ? [leaf('Contact the Mark', 'contact-mark', 1), leaf('Pulse', 'pulse', 2, true), leaf('Rope', 'rope', 3, true)]
      : [leaf('Contact the Mark', 'contact-mark', 1)];
    case 'lasing': return [leaf('Spot', 'spot', 1), leaf('Terminate', 'terminate', 2, true), leaf('Shift', 'shift', 3)];
    case 'run-in': return [leaf('In', 'in', 1)];
    case 'in': return [];
    case 'cleared': return [leaf('Off', 'off', 1)];
    case 'post': return [leaf('IP Inbound', 'ip-inbound', 1)];
  }
}

/**
 * The items under the JTAC's entry for a dialogue state, numbered: the state item first (F1 per the manual;
 * "Shift" is F3), then the always-available items (positions unverified), then F11 Previous menu and F12 Exit.
 * `mark` is line 7 of the 9-line: it picks IP Inbound vs Attack Complete, Laser On, and the IR extras.
 */
export function jtacMenuItems(state: JtacMenuState, mark: JtacMarkType = 'wp'): CommsMenuNode[] {
  const own = stateItems(state, mark);
  const out: CommsMenuNode[] = own.map(n => ({ ...n }));
  if (state !== 'idle') {
    let next = own.reduce((m, n) => Math.max(m, n.fkey ?? 0), 0) + 1;
    for (const n of COMMON) out.push({ ...n, fkey: next++, unverified: true });
  }
  for (const n of FOOTER) out.push({ ...n });
  return out;
}

/** Root list of the DCS radio menu (ED A-10C II manual, p. 768). Only F4 JTACs is live in the trainer. */
function rootMenu(jtacEntry: CommsMenuNode): CommsMenuNode[] {
  const off = (label: string, fkey: number): CommsMenuNode => ({ label, fkey, disabled: true });
  return [
    off('Wingman...', 1),
    off('Flight...', 2),
    off('Second Element...', 3),
    { label: 'JTACs...', fkey: 4, children: [jtacEntry, ...FOOTER.map(n => ({ ...n }))] },
    off('ATCs...', 5),
    off('Tankers...', 6),
    off('AWACSes...', 7),
    off('Ground Crew...', 8),
    off('Other...', 10),
    { label: 'Exit', fkey: 12, action: 'menu-exit' },
  ];
}

/**
 * The whole radio menu for one JTAC in one state. `callsign` replaces the '{callsign}' label, e.g. 'Axeman 1-1'.
 * With Easy Communication DCS also shows the frequency next to the callsign; pass it in `callsign` if wanted.
 */
export function buildCommsMenu(callsign: string, state: JtacMenuState, mark: JtacMarkType = 'wp'): CommsMenuNode[] {
  return rootMenu({ label: callsign, fkey: 1, children: jtacMenuItems(state, mark) });
}

/** Static template of the menu: the JTAC entry is labelled '{callsign}' and shows the check-in item. */
export const COMMS_MENU: readonly CommsMenuNode[] = buildCommsMenu('{callsign}', 'idle');

// ─── Marks ───────────────────────────────────────────────────────────────────────────────────────────────

/** Built-in JTAC laser code, "1688 by default" (ED A-10C II manual). No Mission Editor field to change it was found. */
export const JTAC_DEFAULT_LASER_CODE = 1688;
/** Smoke goes down once the aircraft is inside this range of the target, after IP Inbound (ED manual). */
export const SMOKE_MARK_RANGE_NM = 10;

export interface MarkOption {
  id: JtacMarkType;
  /** Line-7 wording (ED manual: None, White Phosphorus (WP), Laser, IR Pointer). */
  label: string;
  /** Sim mark kind; null for coordinates only. */
  kind: MarkKind | null;
  /** Smoke colour; null for everything else. The built-in JTAC smoke is always white. */
  colour: MarkColour | null;
  /** What the pilot needs to see it. */
  seenWith: string;
  /** How the mark is triggered. */
  trigger: string;
  verified: boolean;
  note?: string;
}

export const MARK_OPTIONS: readonly MarkOption[] = [
  { id: 'none', label: 'None', kind: null, colour: null, seenWith: 'Nothing to see: coordinates and talk-on only.',
    trigger: 'Used when the JTAC has no line of sight to the target. Cleared to engage once the data is sent.', verified: true },
  { id: 'wp', label: 'WP', kind: 'smoke', colour: 'white', seenWith: 'Eyes, or any TV sight. Built-in JTAC smoke is white.',
    trigger: 'After IP Inbound, once you are inside 10 nm: "mark is on the deck".', verified: true,
    note: 'Coloured smoke comes from Combined Arms (orange, red, green) or mission scripts.' },
  { id: 'laser', label: 'Laser', kind: 'laser', colour: null, seenWith: 'A laser spot tracker set to the JTAC code (1688 by default).',
    trigger: 'Only after you call Laser On. Call Spot when you see it.', verified: true,
    note: 'Players report the AI JTAC lases for about 5 minutes (community, not verified).' },
  { id: 'ir', label: 'IR Pointer', kind: 'ir', colour: null, seenWith: 'NVGs only: a line from the JTAC to the target.',
    trigger: 'Replaces smoke in low light. Same flow as smoke, plus Pulse and Rope.', verified: true },
];

/**
 * What the Su-25T pilot can use. Smoke: yes, by eye and in the Shkval TV. Laser: no, the Su-25T has no laser spot
 * tracker (research). IR pointer: needs NVGs; Su-25T NVG use was not researched, so the trainer treats it as unseen.
 */
export const SU25T_CAN_SEE: Readonly<Record<MarkKind, boolean>> = { smoke: true, laser: false, ir: false };

// ─── Callsigns ───────────────────────────────────────────────────────────────────────────────────────────

/** JTAC callsigns in the DCS enum (Hoggit wiki). */
export const JTAC_CALLSIGNS: readonly string[] = [
  'Axeman', 'Darknight', 'Warrior', 'Pointer', 'Eyeball', 'Moonbeam', 'Whiplash', 'Finger', 'Pinpoint', 'Ferret',
  'Shaba', 'Playboy', 'Hammer', 'Jaguar', 'Deathstar', 'Anvil', 'Firefly', 'Mantis', 'Badger',
];

// ─── Caveats ─────────────────────────────────────────────────────────────────────────────────────────────

/** Every simplified or unverified CAS item, in pilot words. Show next to lessons and in Reference. */
export const CAS_CAVEATS: readonly string[] = [
  'JTAC voice wording is simplified: ED quotes only "Standby for data", "mark is on the deck", "continue", "cleared hot" and "abort". The rest is trainer wording, not verified.',
  'Menu labels "Check-in 15 min", "Ready to copy remarks" and "9-line readback" come from Chuck\'s guide, not the ED manual. Other item positions after F1 are not verified.',
  'F11 Previous menu in JTAC submenus is the usual DCS layout, not verified from a manual.',
  'Abort rules are trainer rules: release without "cleared hot", release after "abort", attack heading outside the briefed window, aim point off the target. ED does not document the AI\'s rules.',
  '"ABORT ABORT ABORT. You do not have permission to fire." is reported by players (forum snippet); not verified.',
  'Talk-on from the mark is simplified: the JTAC gives direction and distance from the smoke to the target.',
  'Smoke lasts 300 s in the trainer. No ED source gives the built-in smoke duration.',
  'Line 6 is shown as a trainer grid, not a real UTM grid for the map.',
  'Danger close is a single trainer distance, not a DCS value.',
  'Where the laser code is spoken (line 7 or remarks) is not verified. The built-in JTAC code is 1688 by default.',
  'Su-25T and laser code 1113: community reports of a HUD diamond for the Kh-25ML, Kh-29L and S-25L (not the Vikhr) are not verified, may be broken since 2025, and are not modelled.',
  'Whether the Su-25T radio menu offers the built-in JTAC exactly as the A-10C II manual shows is not verified.',
  'Browsers cannot reliably capture F5, F11 and F12 (and sometimes F1): the trainer also accepts digits as trainer aliases for F-keys.',
  'IR pointer for the Su-25T: NVG use was not researched; the trainer treats the IR pointer as not visible.',
  'The AI JTAC lasing for about 5 minutes is a community report, not verified.',
];
