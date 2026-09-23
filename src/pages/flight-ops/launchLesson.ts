/**
 * [OWNER: page-flight-ops] Deck launch lesson (#27): the catapult (F/A-18C, F-14B) and ski-jump (Su-33) starts.
 * Pure helpers for the page: starts and stations, the keys for every launch action from the data, the Hornet
 * trim-by-weight readout, the power the launch needs, warnings, lesson steps, demo captions and the debrief card.
 * Facts come from `FLIGHT_OPS[jet].launch` (src/data/flightOps.ts); the rules live in src/sim/flightOps/launch.ts.
 */
import type { Units } from '../../app/format';
import {
  SHOOTER_DELAY_S, SETTLE_S, RAMP_DEG, catEndSpeedMs, launchPowerNeed, launchStrip, trimForWeight,
  type FlightOpsAction, type FlightOpsJetData, type FlightOpsLaunchData, type FlightOpsState, type GateResult, type LaunchOutcome,
  type LaunchScore, type LaunchStepId, type Sourced,
} from '../../sim/flightOps';
import { MPS_PER_KT } from '../../sim/math';
import { altFtText, ktText } from './logic';

export type LaunchStart = 'catapult' | 'skiJump';

const TOUCH_LABELS: Partial<Record<FlightOpsAction | 'ab', string>> = {
  nwsHi: 'NWS HI', launchBar: 'L-BAR', hookUp: 'HOOK UP', trimUp: 'TRIM UP', trimDown: 'TRIM DN', wipeOut: 'WIPE OUT',
  salute: 'SALUTE', specialAB: 'SPEC AB', fodScreens: 'FOD SCRN', ab: 'AB',
};
/** Short button legend for a launch action (on-screen controls). */
export const touchLabel = (a: FlightOpsAction | 'ab') => TOUCH_LABELS[a] ?? a.toUpperCase();

/** The launch start the jet offers (catapult or ski-jump), or none. */
export function launchStarts(d: FlightOpsJetData): LaunchStart[] {
  return d.launch ? [d.launch.kind] : [];
}

/** Station name: "Cat 1" on the CVN, "Position 3 (180 m)" on the Kuznetsov. */
export function stationLabel(l: FlightOpsLaunchData, station: number): string {
  if (l.kind === 'catapult') return `Cat ${station}`;
  const run = l.runM?.value[station];
  return run === undefined ? `Position ${station}` : `Position ${station} (${run} m)`;
}

/** Trainer keys for the Hornet takeoff trim (DCS sets it with the T/O TRIM button and the trim switch). */
export const TRIM_KEYS = { up: 'T', down: 'LShift+T' } as const;

/** Tag a launch key: not verified, a conflicting source, or none. */
export type KeyTag = 'not verified' | 'key conflict' | null;
export function keyTag(k: Sourced<string> | null | undefined): KeyTag {
  if (!k) return null;
  if (!k.verified) return 'not verified';
  return /conflict/i.test(k.note ?? '') ? 'key conflict' : null;
}

export interface LaunchKey {
  /** Sim action, or 'ab' (the page's afterburner toggle). */
  action: FlightOpsAction | 'ab';
  label: string;
  key: string;
  tag: KeyTag | 'trainer key';
  note?: string;
}

/** Every launch key the page binds, from the data: the sequence steps with a key, the Hornet trim keys. */
export function launchKeys(d: FlightOpsJetData): LaunchKey[] {
  const l = d.launch;
  if (!l) return [];
  const out: LaunchKey[] = [];
  for (const st of l.steps) {
    if (!st.key) continue;
    out.push({ action: st.id as FlightOpsAction, label: st.label, key: st.key.value, tag: keyTag(st.key), note: st.key.note });
  }
  if (l.trimByWeightLb) {
    out.push({ action: 'trimUp', label: 'Trim nose up', key: TRIM_KEYS.up, tag: 'trainer key' },
      { action: 'trimDown', label: 'Trim nose down', key: TRIM_KEYS.down, tag: 'trainer key' });
  }
  return out;
}

/** The key that must not be pressed for the launch (Su-33 intake FOD screens), bound so the mistake is graded. */
export function avoidKey(d: FlightOpsJetData): LaunchKey | null {
  const f = d.launch?.avoid?.fodScreens;
  return f ? { action: 'fodScreens', label: 'Intake FOD screens (do not use)', key: f.value, tag: keyTag(f), note: f.note } : null;
}

/** Trim table in words: "16° below 44000 lb · 17° · 19° from 49000 lb". */
export function trimTable(l: FlightOpsLaunchData): string | null {
  const t = l.trimByWeightLb?.value;
  if (!t?.length) return null;
  return t.map(([below, deg], i) => (i === 0 ? `${deg}° below ${below} lb` : i === t.length - 1 ? `${deg}° from ${t[i - 1]![0]} lb` : `${deg}°`)).join(' · ');
}

export interface TrimReadout { weightText: string; wantDeg: number; nowDeg: number; ok: boolean; table: string }
/** Hornet trim by weight: the weight, the trim it wants, the trim set now. Null for jets without the trim step. */
export function trimReadout(l: FlightOpsLaunchData, weight: number, trimDeg: number | undefined): TrimReadout | null {
  const want = trimForWeight(l, weight);
  if (want === undefined) return null;
  const now = trimDeg ?? want;
  return { weightText: `${weight} ${l.weights.unit}`, wantDeg: want, nowDeg: now, ok: now === want, table: trimTable(l) ?? '' };
}

/** Power for the launch in words: MIL, afterburner (heavy Hornet), or full then special afterburner (Su-33). */
export function powerText(d: FlightOpsJetData, weight: number): string {
  const l = d.launch;
  if (!l) return '';
  const need = launchPowerNeed(l, weight);
  const sp = l.steps.find(x => x.id === 'specialAB')?.key;
  if (need === 'AB' && sp) return `Full afterburner, then special afterburner ${sp.value}`;
  if (need === 'AB') return l.abFromLb ? `Afterburner: ${weight} lb is at or above ${l.abFromLb.value} lb` : 'Full afterburner';
  return l.abFromLb ? `MIL (afterburner from ${l.abFromLb.value} lb)` : 'MIL';
}

/** Live warnings on the deck: FOD screens on, heavy on a short position, the last refusal or fault. */
export function launchWarnings(d: FlightOpsJetData, s: FlightOpsState): string[] {
  const L = s.launch, l = d.launch;
  if (!L || !l) return [];
  const out: string[] = [];
  if (L.fodScreens) out.push(`FOD screens on: ${l.avoid?.fodScreens.value ?? 'LAlt+I'} again to stow them. 12 % less thrust.`);
  const run = l.runM?.value[L.station];
  const longest = l.runM ? Math.max(...Object.values(l.runM.value)) : 0;
  if (l.shortRunMaxWeight && run !== undefined && run < longest && L.weight > l.shortRunMaxWeight.value) {
    out.push(`Heavy (${L.weight} ${l.weights.unit}) on a ${run} m run: use position 3.`);
  }
  const last = L.errors[L.errors.length - 1];
  if (last && !last.startsWith('FOD') && !last.startsWith('Heavy')) out.push(last);
  return out;
}

/** Step keys and lesson text, per step id. */
function stepText(d: FlightOpsJetData, id: LaunchStepId, weight: number): string {
  const l = d.launch!;
  switch (id) {
    case 'nwsHi': return 'NWS HI: nosewheel steering high to taxi onto the catapult';
    case 'launchBar': return 'Launch bar down, behind the shuttle';
    case 'hookUp': return 'Hook up: the shuttle takes the launch bar';
    case 'trim': { const t = trimForWeight(l, weight); return `T/O trim ${t}° for ${weight} lb`; }
    case 'power': return l.kind === 'skiJump' ? 'Full afterburner against the deck stoppers' : launchPowerNeed(l, weight) === 'AB' ? 'Afterburner for the heavy launch' : 'Throttle to MIL';
    case 'wipeOut': return 'Wipe out the controls: full stick and rudder travel';
    case 'salute': return 'Salute the shooter: ready to launch';
    case 'handsOff': return 'Hands off the stick through the stroke and the settle';
    case 'specialAB': return 'Special afterburner';
    case 'release': return 'Stoppers release: the run to the ramp';
  }
}

export interface LaunchLessonStep { id: string; text: string; keys?: string; note?: string }

/** Lesson steps: the sequence in data order, then clean up, the clearing turn (catapult) and the climb. */
export function launchLessonSteps(d: FlightOpsJetData, u: Units, station: number, heavy: boolean): LaunchLessonStep[] {
  const l = d.launch;
  if (!l) return [];
  const weight = heavy ? l.weights.heavy : l.weights.normal;
  const steps: LaunchLessonStep[] = l.steps.map(st => {
    const tag = keyTag(st.key);
    const keys = st.id === 'trim' ? `${TRIM_KEYS.up} / ${TRIM_KEYS.down}` : st.id === 'power' ? (d.takeoff.keys.throttleMax?.value ?? 'PgUp') : st.key?.value;
    const note = st.id === 'trim' ? `Trainer keys. ${trimTable(l) ?? ''}` : [st.note, tag ? st.key?.note : null].filter(Boolean).join(' ');
    return { id: st.id, text: stepText(d, st.id, weight), keys, note: note || undefined };
  });
  const gearKt = ktText(d.takeoff.gearUpMaxKt.value, u);
  steps.push({ id: 'cleanUp', text: `Positive climb: gear up, flaps ${l.after.flapLabel} below ${gearKt}`, keys: `${d.keys.gear}, ${d.keys.flaps}` });
  const side = l.clearingTurn?.value[station];
  if (l.kind === 'catapult' && side) steps.push({ id: 'clearingTurn', text: `Clearing turn ${side} off ${stationLabel(l, station).toLowerCase()}`, keys: side === 'right' ? 'Right' : 'Left' });
  steps.push({ id: 'climb', text: `Climb through ${altFtText(1000, u)}, gear up` });
  return steps;
}

/** Lesson steps done: sequence steps the sim recorded, and the after-launch gates once graded. */
export function launchStepsDone(s: FlightOpsState, gates: readonly GateResult[]): Set<string> {
  const out = new Set<string>(s.launch?.stepsDone.map(x => x.id) ?? []);
  for (const g of gates) if (g.id === 'cleanUp' || g.id === 'clearingTurn' || g.id === 'climb') out.add(g.id);
  return out;
}

/** First lesson step not done yet. */
export function launchCurrent(order: readonly string[], done: ReadonlySet<string>): string | null {
  return order.find(id => !done.has(id)) ?? null;
}

/** Watch-mode caption for the launch: the next step on the deck, the shot, the stroke or run, the settle, the climb. */
export function launchCaption(s: FlightOpsState, d: FlightOpsJetData, u: Units): { text: string; why: string } {
  const L = s.launch, l = d.launch;
  if (!L || !l) return { text: '', why: '' };
  const cat = l.kind === 'catapult';
  switch (L.stage) {
    case 'hold': {
      const next = launchStrip(s, d).find(x => x.state === 'next');
      if (!next) return { text: 'Held on the deck.', why: l.cue + '.' };
      const st = l.steps.find(x => x.id === next.id)!;
      const key = next.id === 'trim' ? `${TRIM_KEYS.up} / ${TRIM_KEYS.down}` : st.key?.value;
      return { text: `${stepText(d, next.id, L.weight)}${key ? ` (${key})` : ''}.`, why: st.note ?? l.cue + '.' };
    }
    case 'shot': return { text: 'Salute given. The shooter touches the deck.', why: `The catapult fires about ${SHOOTER_DELAY_S} s later. Hands off the stick.` };
    case 'stroke': return cat
      ? { text: 'Catapult stroke. Hands off.', why: `About ${ktText(Math.round(catEndSpeedMs(d) / MPS_PER_KT), u)} at the end of the stroke.` }
      : { text: 'Stoppers down: the run to the ramp.', why: `Full afterburner. The ramp throws the jet up at ${RAMP_DEG}°.` };
    case 'settle': return cat
      ? { text: 'Off the bow. Hands off: the flight controls rotate the jet.', why: `About ${SETTLE_S} s, then take the stick.` }
      : { text: `Off the ramp at ${RAMP_DEG}°.`, why: 'Hold the attitude while the speed builds.' };
    case 'free': {
      const side = l.clearingTurn?.value[L.station];
      return { text: `${l.after.cue}.`, why: side ? `Clearing turn ${side} from ${stationLabel(l, L.station).toLowerCase()}, climb to ${altFtText(1500, u)}.` : `Climb to ${altFtText(1500, u)}.` };
    }
  }
}

const OUTCOME: Record<LaunchOutcome, { title: string; meaning: string; tone: 'ok' | 'caution' | 'warning' }> = {
  good: { title: 'Good launch', meaning: 'Sequence in order, the jet flew off the deck.', tone: 'ok' },
  'sequence error': { title: 'Sequence error', meaning: 'The jet launched with faults in the sequence.', tone: 'caution' },
  'cold cat': { title: 'Cold cat', meaning: 'Power below the need at the shot: the jet settled off the bow.', tone: 'warning' },
  'short run': { title: 'Short run', meaning: 'Too slow at the ramp: the jet settled off the bow.', tone: 'warning' },
};

/** Debrief card for a launch score: outcome words and tone. */
export function launchCard(sc: LaunchScore): { title: string; meaning: string; tone: 'ok' | 'caution' | 'warning' } {
  if (!sc.outcome) return { title: 'No launch', meaning: 'The jet did not leave the deck.', tone: 'warning' };
  return OUTCOME[sc.outcome];
}
