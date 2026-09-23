/**
 * [OWNER: page-flight-ops] Air-to-air refuelling lesson (#28): Tanker rejoin and Pre-contact starts for the jets
 * with `FLIGHT_OPS[jet].aar` (Su-33 on the IL-78M, F-15C and F-16C on the KC-135 boom, F/A-18C, F-14B, JF-17 and
 * M-2000C on the KC-135 MPRS or KC-130 hose). Pure helpers for the page: starts, keys, lesson steps, the contact
 * position box, the UPAZ hose-band table, closure and fuel readouts, coach captions and the debrief card.
 * Game-level only (AGENTS.md rule 1): what the player does and sees behind the tanker; the rules live in
 * src/sim/flightOps/aar.ts.
 */
import type { Units } from '../../app/format';
import { TANKERS } from '../../data/tankers';
import {
  PRECONTACT_TOL_M, BASKET_CAPTURE_M, BOOM_CAPTURE_M, boomPoint,
  type AarScore, type AarState, type FlightOpsAction, type FlightOpsJetData, type FlightOpsJetId, type FlightOpsState,
  type GateResult, type HoseBand, type Sourced, type TankerData, type TankerFrameVec, type TankerId,
} from '../../sim/flightOps';
import { MPS_PER_KT } from '../../sim/math';
import { altFtText, ktText } from './logic';

export type AarStart = 'aarRejoin' | 'aarPrecontact';
export type AarStepId = 'call' | 'probe' | 'door' | 'lights' | 'rejoin' | 'precontact' | 'contact' | 'refuel' | 'disconnect';

/** Refuelling starts the jet offers (none without refuelling data). */
export function aarStarts(d: FlightOpsJetData): AarStart[] {
  return d.aar ? ['aarRejoin', 'aarPrecontact'] : [];
}
export const isAarStart = (s: string | null | undefined): s is AarStart => s === 'aarRejoin' || s === 'aarPrecontact';
export const aarProgressKey = (ac: FlightOpsJetId) => `flight-ops:${ac}:aar`;

/** Tanker for the lesson: the URL choice when the jet uses it, else the jet's default. */
export function aarTanker(d: FlightOpsJetData, param?: string | null): TankerId | null {
  const r = d.aar;
  if (!r) return null;
  return param && (r.tankers as readonly string[]).includes(param) ? param as TankerId : r.tanker;
}

/** One-line note for jets without a refuelling lesson (Su-27, J-11A, MiG-29S). */
export function noAarNote(short: string, id: FlightOpsJetId): string {
  const why = id === 'mig29s' ? 'MiG-29S refuelling is not verified.' : id === 'j11a' ? 'The J-11A probe is only a Deka plan.' : 'The Su-27 has no refuelling probe.';
  return `No air-to-air refuelling for the ${short} in the trainer. ${why}`;
}

export interface AarKey { action: FlightOpsAction; label: string; key: string; tag: string | null; touch: string; title: string }

const tagOf = (s: Sourced<string>) => (s.verified ? null : 'not verified');

/** Refuelling keys from the data: probe (probe jets with a retractable probe), door (boom jets), lights, radio call. */
export function aarKeys(d: FlightOpsJetData): AarKey[] {
  const r = d.aar;
  if (!r) return [];
  const out: AarKey[] = [];
  if (r.keys.probe) out.push({ action: 'probeToggle', label: 'Refuelling probe out / in', key: r.keys.probe.value, tag: tagOf(r.keys.probe), touch: 'PROBE', title: r.keys.probe.note ?? 'Probe out or in' });
  if (r.keys.door) out.push({ action: 'doorToggle', label: 'Refuelling door open / close', key: r.keys.door.value, tag: tagOf(r.keys.door), touch: 'DOOR', title: r.keys.door.note ?? 'Refuelling door' });
  if (r.keys.lights) out.push({ action: 'refuelLights', label: 'Refuelling lights', key: r.keys.lights.value, tag: tagOf(r.keys.lights), touch: 'LIGHTS', title: r.keys.lights.note ?? 'Refuelling lights' });
  out.push({ action: 'callTanker', label: `Radio: "${r.callText.value}"`, key: r.keys.call.value, tag: 'trainer key: DCS uses the radio menu', touch: 'CALL', title: r.keys.call.note ?? 'Radio call to the tanker' });
  return out;
}

export const BAND_LABEL: Record<HoseBand, string> = {
  yellow: 'Yellow', yellowGreen: 'Yellow + green', green: 'Green', greenRed: 'Green + red', red: 'Red',
};
const BAND_WORDS: Record<HoseBand, string> = {
  yellow: 'Hose pushed in far: ease back',
  yellowGreen: 'Nearly in the green: ease back a little',
  green: 'Fuel flows: hold this position',
  greenRed: 'Drifting back: ease forward',
  red: 'About to pull out: move forward now',
};
export const bandWords = (b: HoseBand) => BAND_WORDS[b];

/** UPAZ band table (cone-to-pod distance, metres) for the gauge and the numbers panel. */
export function bandRows(T: TankerData): { band: HoseBand; label: string; range: string }[] {
  return (T.drogue?.bands.value ?? []).map(b => ({ band: b.band, label: BAND_LABEL[b.band], range: `${b.from}–${b.to} m` }));
}

/**
 * Contact position box: the probe tip or receptacle error on three axes (aft +, right +, up +) against the limit
 * for the phase, tanker frame metres. Pre-contact: from the pre-contact point (±3 m). Cleared: lateral and vertical
 * from the basket or boom contact point (capture radius), aft = distance still to close. Connected, drogue: aft
 * from the green-band centre, right from the pod line, up from the middle of the hold below the pod; boom: from
 * the nominal contact point inside the boom limits.
 */
export interface PositionBox { phase: 'rejoin' | 'precontact' | 'closing' | 'contact'; err: TankerFrameVec; lim: TankerFrameVec; inside: boolean }

export function positionBox(a: AarState, d: FlightOpsJetData): PositionBox {
  const T = TANKERS[a.tanker];
  const sub = (p: TankerFrameVec, q: TankerFrameVec): TankerFrameVec => ({ aft: p.aft - q.aft, right: p.right - q.right, up: p.up - q.up });
  const within = (e: TankerFrameVec, l: TankerFrameVec) => Math.abs(e.aft) <= l.aft && Math.abs(e.right) <= l.right && Math.abs(e.up) <= l.up;
  if (a.connected && T.drogue) {
    const g = T.drogue, green = g.bands.value.find(b => b.band === 'green');
    const mid = green ? (green.from + green.to) / 2 : g.trailM.value * 0.7;
    const half = green ? (green.to - green.from) / 2 : 3;
    const hold = d.aar?.holdBelowPodM?.value ?? g.envelope.value.belowPodM;
    const holdMid = (hold[0] + hold[1]) / 2;
    const err = { aft: (a.coneToPodM ?? mid) - mid, right: a.tip.right - g.pod.right, up: holdMid - (a.belowPodM ?? holdMid) };
    const lim = { aft: half, right: g.envelope.value.lateralM, up: (hold[1] - hold[0]) / 2 };
    return { phase: 'contact', err, lim, inside: within(err, lim) };
  }
  if (a.connected && T.boom) {
    const nom = boomPoint(T), L = T.boom.limits.value, n = T.boom.nominal;
    const lim = {
      aft: Math.min(n.extM - L.extM[0], L.extM[1] - n.extM) * Math.cos(n.elevDeg * Math.PI / 180),
      right: n.extM * Math.cos(n.elevDeg * Math.PI / 180) * Math.sin(L.azDeg * Math.PI / 180),
      up: Math.min(Math.abs(boomPoint(T, L.elevDeg[0]).up - nom.up), Math.abs(boomPoint(T, L.elevDeg[1]).up - nom.up)),
    };
    const err = sub(a.tip, nom);
    return { phase: 'contact', err, lim, inside: a.boom?.inLimits ?? within(err, lim) };
  }
  if (a.cleared) {
    const cap = T.kind === 'drogue' ? BASKET_CAPTURE_M : BOOM_CAPTURE_M;
    const err = { ...a.relTarget };
    const lim = { aft: T.kind === 'boom' ? 15 : d.aar?.closeFromM?.value ?? 10, right: cap, up: cap };
    return { phase: 'closing', err, lim, inside: Math.abs(err.right) <= cap && Math.abs(err.up) <= cap };
  }
  const err = sub(a.tip, a.precontact);
  const lim = { aft: PRECONTACT_TOL_M, right: PRECONTACT_TOL_M, up: PRECONTACT_TOL_M };
  return { phase: a.stage === 'rejoin' ? 'rejoin' : 'precontact', err, lim, inside: within(err, lim) };
}

/** "2.1 m aft · 0.4 m left · 0.8 m low" (where the tip is from the target). */
export function positionText(b: PositionBox): string {
  const f = (v: number, pos: string, neg: string) => `${Math.abs(v) < 0.05 ? '0.0' : Math.abs(v) >= 100 ? Math.round(Math.abs(v)) : Math.abs(v).toFixed(1)} m ${v >= 0 ? pos : neg}`;
  return `${f(b.err.aft, 'aft', 'fwd')} · ${f(b.err.right, 'right', 'left')} · ${f(b.err.up, 'high', 'low')}`;
}

/**
 * Closure on the target in the app's units ("2.4 kt closing", "0.6 m/s opening"); `short` gives a signed number
 * for the readout ("+2.4 kt", "−0.6 m/s").
 */
export function closureText(ms: number, u: Units, short = false): string {
  const v = u === 'metric' ? ms : ms / MPS_PER_KT;
  const unit = u === 'metric' ? 'm/s' : 'kt';
  const mag = Math.abs(v) >= 20 ? Math.round(Math.abs(v)).toString() : Math.abs(v).toFixed(1);
  if (Math.abs(v) < 0.05) return `0.0 ${unit}`;
  return short ? `${v > 0 ? '+' : '−'}${mag} ${unit}` : `${mag} ${unit} ${v > 0 ? 'closing' : 'opening'}`;
}

/** Closure tone: inside the jet's band (±tolerance) ok, above the tanker's limit warning, else caution. */
export function closureTone(a: AarState, d: FlightOpsJetData): 'ok' | 'caution' | 'warning' {
  const kt = a.closureMs / MPS_PER_KT;
  const T = TANKERS[a.tanker];
  const max = (T.drogue?.maxClosureKt ?? T.boom?.maxClosureKt)?.value ?? 5;
  const [lo, hi] = d.aar?.closureKt.value ?? [2, 3];
  if (kt > max) return 'warning';
  return kt >= lo - 0.5 && kt <= hi + 1 ? 'ok' : 'caution';
}

export const fuelFraction = (a: AarState) => (a.fuelTarget > 0 ? Math.max(0, Math.min(1, a.fuel / a.fuelTarget)) : 0);

/** Simplified boom cue words (the KC-135 director lights are not modelled). */
export function boomCueText(a: AarState): string {
  const b = a.boom;
  if (!b) return '';
  const parts = [b.cueUpDown === 'up' ? 'UP' : b.cueUpDown === 'down' ? 'DOWN' : null, b.cueForeAft === 'fwd' ? 'FORWARD' : b.cueForeAft === 'aft' ? 'BACK' : null]
    .filter((x): x is string => !!x);
  return parts.length ? parts.join(' · ') : 'HOLD';
}

export interface AarLessonStep { id: AarStepId; text: string; keys?: string; note?: string }

const nvNote = (s: Sourced<unknown> | undefined) => (s && !s.verified ? (s.note ?? 'not verified') : undefined);

/** Lesson steps per jet (Su-33 manual numbers, F-16C door limits, 2–3 kt for the M-2000C and JF-17). */
export function aarLessonSteps(d: FlightOpsJetData, u: Units, start: AarStart, tanker: TankerId): AarLessonStep[] {
  const r = d.aar;
  if (!r) return [];
  const T = TANKERS[tanker];
  const [lo, hi] = r.closureKt.value;
  const out: AarLessonStep[] = [];
  out.push({ id: 'call', text: `Call the tanker: "Tanker, ${r.callText.value.toLowerCase()}"`, keys: r.keys.call.value, note: 'Trainer key: DCS uses the radio menu' });
  if (r.kind === 'probe') {
    out.push(r.keys.probe
      ? { id: 'probe', text: 'Probe out', keys: r.keys.probe.value, note: nvNote(r.keys.probe) }
      : { id: 'probe', text: 'Fixed probe: nothing to extend', note: 'Fixed probe (not verified)' });
  } else {
    const dl = r.doorLimit;
    out.push({
      id: 'door', keys: r.keys.door?.value, note: nvNote(r.keys.door),
      text: dl ? `Refuelling door open below ${ktText(dl.operateKt.value, u)} / M${dl.operateMach.value}; stay below ${ktText(dl.openKt.value, u)} / M${dl.openMach.value} while open`
        : 'Refuelling door open',
    });
  }
  if (r.keys.lights) out.push({ id: 'lights', text: 'Refuelling lights on', keys: r.keys.lights.value, note: nvNote(r.keys.lights) });
  if (start === 'aarRejoin') {
    const win = r.window;
    const winText = win ? ` Refuel at ${win.alt.value[0]}–${win.alt.value[1]} m, ${win.ias.value[0]}–${win.ias.value[1]} km/h IAS.` : '';
    out.push({ id: 'rejoin', text: `Rejoin the ${T.name} at ${altFtText(T.altFt.value, u)}, ${ktText(T.speedKt.value, u)}: 15 kt closure or less into pre-contact.${winText}` });
  }
  const behind = T.kind === 'boom' ? '15 m behind and 3 m below the contact point' : `${r.closeFromM?.value ?? 10} m behind the basket`;
  out.push({ id: 'precontact', text: `Pre-contact: tip ${behind}, stable 3 s until "Cleared contact"` });
  out.push(T.kind === 'boom'
    ? { id: 'contact', text: `Move to contact at ${lo}–${hi} kt and hold still: the boom operator plugs you`, note: nvNote(r.closureKt) }
    : { id: 'contact', text: `Close on the basket at ${lo}–${hi} kt${r.closeFromM ? ` from ${r.closeFromM.value} m` : ''}`, note: nvNote(r.closureKt) });
  const hold = r.holdBelowPodM?.value;
  out.push({
    id: 'refuel',
    text: T.kind === 'boom' ? 'Hold inside the boom limits until the fuel is in (cues simplified)'
      : T.drogue?.gauge ? `Hold ${hold ? `${hold[0]}–${hold[1]} m below the pod, ` : ''}hose band green (16–22 m) until the fuel is in`
        : 'Hold the basket in the middle of the hose travel until the fuel is in',
  });
  out.push({ id: 'disconnect', text: T.kind === 'boom' ? 'Hold still: the boom operator disconnects, then drop back' : 'Back out slowly, 3 kt or less, straight back' });
  return out;
}

/** Steps done from the state and the gates. */
export function aarStepsDone(s: FlightOpsState, gates: readonly GateResult[]): Set<AarStepId> {
  const a = s.aar, out = new Set<AarStepId>();
  if (!a) return out;
  if (a.called) out.add('call');
  if (a.probeOut) out.add('probe');
  if (a.doorOpen) out.add('door');
  if (a.lights) out.add('lights');
  if (a.stage !== 'rejoin' || gates.some(g => g.id === 'rejoin')) out.add('rejoin');
  if (a.cleared || a.contacts.length) out.add('precontact');
  if (a.contacts.length) out.add('contact');
  if (a.refuelComplete) out.add('refuel');
  if (gates.some(g => g.id === 'disconnect')) out.add('disconnect');
  return out;
}

/** First step not done (steps done out of order keep their tick). */
export const aarCurrent = (ids: readonly string[], done: ReadonlySet<string>) => ids.find(id => !done.has(id)) ?? null;

export interface AarCaption { text: string; why: string; tone?: 'ok' | 'caution' | 'warning' }

/** Coach line from the refuelling state: rejoin, pre-contact, closing, contact, after the fuel. */
export function aarCaption(s: FlightOpsState, d: FlightOpsJetData, u: Units): AarCaption {
  const a = s.aar, r = d.aar;
  if (!a || !r) return { text: '', why: '' };
  const T = TANKERS[a.tanker];
  const box = positionBox(a, d);
  const clos = closureText(a.closureMs, u);
  const [lo, hi] = r.closureKt.value;
  const setup = r.kind === 'probe' ? (a.probeOut ? '' : r.keys.probe ? ` Probe out: ${r.keys.probe.value}.` : '')
    : a.doorOpen ? '' : ` Door open: ${r.keys.door?.value ?? ''}.`;
  if (s.phase === 'crashed') return { text: s.crashReason ?? 'Crashed.', why: 'Restart and try again.', tone: 'warning' };
  if (a.refuelComplete && !a.connected) {
    return { text: 'Refuelling complete. Back to pre-contact, then clear the tanker.', why: `${Math.round(a.fuel)} ${a.fuelUnit} transferred.`, tone: 'ok' };
  }
  if (a.connected) {
    const fuel = `${Math.round(a.fuel)} / ${a.fuelTarget} ${a.fuelUnit}`;
    if (T.drogue && a.hoseBand) {
      const below = a.belowPodM === null ? '' : `, ${a.belowPodM.toFixed(1)} m below the pod`;
      return { text: `Contact. Hose band ${BAND_LABEL[a.hoseBand].toLowerCase()}${below}.`, why: `${bandWords(a.hoseBand)}. Fuel ${fuel}.`,
        tone: a.hoseBand === 'green' ? 'ok' : a.hoseBand === 'red' ? 'warning' : 'caution' };
    }
    if (T.drogue) return { text: 'Contact.', why: `Hold the basket steady. Fuel ${fuel}.` };
    return { text: `Contact. Boom cue: ${boomCueText(a)} (simplified).`, why: `Hold still inside the limits. Fuel ${fuel}.`, tone: a.boom?.inLimits ? 'ok' : 'warning' };
  }
  if (a.stage === 'rejoin') {
    const dist = Math.hypot(box.err.aft, box.err.right, box.err.up);
    const distText = u === 'metric' ? `${(dist / 1000).toFixed(1)} km` : `${(dist / 1852).toFixed(1)} nm`;
    if (!a.called) return { text: `Call the tanker: ${r.keys.call.value}.${setup}`, why: `"Tanker, ${r.callText.value.toLowerCase()}" before you join.`, tone: 'caution' };
    return { text: `Rejoin: ${distText} to pre-contact, ${clos}.${setup}`, why: 'Close fast, then match the tanker: 15 kt or less into pre-contact.' };
  }
  if (!a.cleared) {
    return { text: `Pre-contact: ${positionText(box)}.${setup}`, why: 'Throttle sets closure, stick moves the jet. Hold still 3 s for "Cleared contact".', tone: box.inside ? 'ok' : 'caution' };
  }
  return {
    text: `Cleared contact: close at ${lo}–${hi} kt, now ${clos}.`,
    why: `${Math.abs(box.err.right).toFixed(1)} m ${box.err.right >= 0 ? 'right' : 'left'}, ${Math.abs(box.err.up).toFixed(1)} m ${box.err.up >= 0 ? 'high' : 'low'} of the ${T.kind === 'boom' ? 'contact point' : 'basket'}.`,
    tone: closureTone(a, d),
  };
}

/** Debrief card: refuelled, not refuelled or crashed. */
export function aarCard(sco: AarScore, crashed: boolean): { title: string; meaning: string; tone: 'ok' | 'caution' | 'warning' } {
  if (crashed) return { title: 'Crashed', meaning: sco.verdict ?? 'The jet hit the water.', tone: 'warning' };
  const env = sco.gates.find(g => g.id === 'envelope');
  if (env?.ok && sco.faultDisconnects === 0) return { title: 'Refuelled', meaning: `${Math.round(sco.fuel)} transferred, ${Math.round(sco.timeInEnvelopeS)} s in the envelope, no fault disconnects.`, tone: 'ok' };
  if (env) return { title: 'Refuelled with faults', meaning: `${sco.faultDisconnects} fault disconnect(s) on the way.`, tone: 'caution' };
  return { title: 'Not refuelled', meaning: 'The fuel target was not reached.', tone: 'warning' };
}
