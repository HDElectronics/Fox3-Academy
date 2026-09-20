/**
 * [OWNER: page-defense] Run metrics, score and coaching for the defense drills (pure, testable).
 * The page fills RunMetrics while the sim runs; debrief() turns them into the result the pilot reads.
 */
import type { MissileId } from '../../data/types';
import type { MissReason } from '../../sim/types';
import { MISSILES } from '../../data/missiles';
import { fmtRange, type Units } from '../../app/format';
import { DRILLS, type DrillId } from './drills';
import type { Maneuver } from './pilot';

export interface RunMetrics {
  drill: DrillId;
  missile: MissileId;
  method: 'stt' | 'tws';
  shooterName: string;
  radarName: string;
  /** Sim times (s), null when it did not happen. */
  launchT: number | null;
  launchRange: number | null;
  pitbullT: number | null;
  /** When your controls unlocked (the drill's cue). */
  unlockT: number | null;
  /** First maneuver after the unlock, and when. */
  reactT: number | null;
  reactMan: Maneuver | null;
  /** First maneuver that was a notch / drag, and when. */
  notchT: number | null;
  dragT: number | null;
  endT: number | null;
  result: 'hit' | 'miss' | null;
  reason: MissReason | 'hit' | null;
  /** Seconds with your radial speed inside his radar's gate (while it tracked you, missile in flight). */
  radarGateS: number;
  /** Seconds inside the seeker's gate while the seeker was on. */
  seekerGateS: number;
  /** Seconds the active seeker spent looking up at you (you above it). */
  lookUpS: number;
  /** Seconds after the reaction with the threat behind you (aspect ≥ 135°). */
  coldS: number;
  /** Seconds from the reaction to the end (or to the missile going dumb). */
  defendS: number;
  /** Seconds from the first moment you reached the gate to the end (turn time excluded). */
  settledS: number;
  chaffUsed: number;
  /** Bundles dropped while chaff could work (seeker on, inside chaff range, you in its gate). */
  chaffGood: number;
  flaresUsed: number;
  lockBrokenT: number | null;
  illumLostT: number | null;
  datalinkLostT: number | null;
  seekerLost: { t: number; why: MissReason }[];
  closest: number | null;
  /** Missile range when your controls unlocked, m. */
  rangeAtUnlock: number | null;
  /** Missile time to impact when your controls unlocked, s. */
  ttiAtUnlock: number | null;
  /** The shooter never fired: why. */
  noShot: string | null;
}

export function emptyMetrics(drill: DrillId, missile: MissileId, method: 'stt' | 'tws', shooterName: string, radarName: string): RunMetrics {
  return {
    drill, missile, method, shooterName, radarName,
    launchT: null, launchRange: null, pitbullT: null, unlockT: null, reactT: null, reactMan: null, notchT: null, dragT: null,
    endT: null, result: null, reason: null,
    radarGateS: 0, seekerGateS: 0, lookUpS: 0, coldS: 0, defendS: 0, settledS: 0,
    chaffUsed: 0, chaffGood: 0, flaresUsed: 0,
    lockBrokenT: null, illumLostT: null, datalinkLostT: null, seekerLost: [], closest: null,
    rangeAtUnlock: null, ttiAtUnlock: null, noShot: null,
  };
}

export interface ScorePart { id: 'survive' | 'timing' | 'discipline' | 'chaff'; label: string; pts: number; max: number; note: string }
export interface Debrief {
  survived: boolean;
  passed: boolean;
  headline: string;
  /** Why the missile missed or hit, one sentence. */
  why: string;
  score: number;
  parts: ScorePart[];
  coaching: string[];
}

const f1 = (n: number) => n.toFixed(1);

/** Plain-language miss reason, as the sim reports it. */
export function missText(reason: MissReason | 'hit' | null, m: RunMetrics): string {
  const name = MISSILES[m.missile].name;
  switch (reason) {
    case 'hit': return `The ${name} hit you.`;
    case 'lost-guidance': return `The ${name} went ballistic: the ${m.shooterName}'s radar lost you, and a SARH seeker has nothing to home on without his illumination.`;
    case 'notched': return `The ${name}'s seeker lost you in the notch and never found you again.`;
    case 'chaff': return `The ${name}'s seeker took your chaff while you sat in its Doppler gate.`;
    case 'kinematic': return `The ${name} ran out of energy: it could no longer close on you.`;
    case 'timeout': return `The ${name}'s battery ran out before it reached you.`;
    case 'no-acquisition': return `The ${name} went active where it expected you and found nothing: its aim point was stale.`;
    case 'overshoot': return `The ${name} overshot: it could not turn with you at the end.`;
    case 'ground': return `The ${name} flew into the ground.`;
    case 'target-dead': return `The ${name} lost its target.`;
    case 'flare': return `The ${name} took a flare.`;
    default: return m.noShot ? `No shot: ${m.noShot}.` : `The ${name} never resolved.`;
  }
}

/** The moment you should have started defending, and its name. */
export function cueFor(m: RunMetrics): { t: number | null; name: string } {
  const d = DRILLS[m.drill];
  if (d.cue === 'pitbull') return { t: m.unlockT ?? m.pitbullT, name: d.delayS > 0 ? 'you looked up' : 'the spike' };
  if (d.cue === 'launch') return { t: m.launchT, name: 'the launch' };
  // Free drill: a SARH or an STT shot warns at launch, a TWS Fox 3 only at pitbull.
  const arhTws = MISSILES[m.missile].seeker === 'arh' && m.method === 'tws';
  return arhTws ? { t: m.pitbullT, name: 'the spike' } : { t: m.launchT, name: 'the launch' };
}

export function debrief(m: RunMetrics, units: Units = 'metric'): Debrief {
  const d = DRILLS[m.drill];
  const spec = MISSILES[m.missile];
  const survived = m.result === 'miss';
  const passed = d.pass === 'fly' ? m.result !== null : survived;
  const cue = cueFor(m);
  const parts: ScorePart[] = [];

  parts.push({ id: 'survive', label: 'Survival', pts: survived ? 50 : 0, max: 50, note: survived ? 'Missile defeated' : m.result === 'hit' ? 'Hit' : 'No result' });

  // Timing: full marks within 2 s of the cue, nothing after 10 s.
  let react: number | null = null;
  let timingPts = 0;
  if (m.reactT !== null && cue.t !== null) {
    react = m.reactT - cue.t;
    timingPts = Math.round(20 * clamp01((10 - Math.max(0, react)) / 8));
  }
  parts.push({
    id: 'timing', label: 'Timing', pts: timingPts, max: 20,
    note: react === null ? 'You never maneuvered' : react < 0 ? `Before ${cue.name}` : `${f1(react)} s after ${cue.name}`,
  });

  // Discipline: time in the relevant gate (notch drills) or time cold (drag drill), over the defense.
  let disc = 0;
  let discNote = '';
  const window = Math.max(1, m.defendS);   // drag: the turn counts, it is part of the maneuver
  if (d.technique === 'drag') {
    const share = m.coldS / window;
    disc = Math.round(20 * clamp01(share / 0.8));
    discNote = `Cold ${Math.round(share * 100)} % of the defense`;
  } else if (semiActiveShot(m) && (m.illumLostT !== null || m.reason === 'lost-guidance')) {
    // The whole point against a SARH shot: his radar lost you and the missile went dumb.
    disc = 20;
    discNote = `His radar lost you ${m.launchT !== null && m.illumLostT !== null ? f1(m.illumLostT - m.launchT) + ' s after launch' : ''}`.trim();
  } else {
    const gateS = semiActiveShot(m) ? Math.max(m.radarGateS, m.seekerGateS) : Math.max(m.seekerGateS, m.radarGateS * 0.6);
    // Judge the time after you first reached the beam: the turn itself is not held against you.
    const held = m.settledS > 0 ? gateS / m.settledS : 0;
    disc = Math.round(20 * clamp01(held / 0.7));
    discNote = m.settledS > 0 ? `In the gate ${f1(gateS)} s of ${f1(m.settledS)} s on the beam` : 'Never reached the gate';
  }
  if (m.reactT === null) { disc = 0; discNote = 'No defense flown'; }
  parts.push({ id: 'discipline', label: d.technique === 'drag' ? 'Drag' : 'Notch', pts: disc, max: 20, note: discNote });

  // Chaff: in the notch or not at all.
  let chaffPts: number;
  let chaffNote: string;
  if (m.chaffUsed === 0) {
    chaffPts = d.wantsChaff ? 0 : 10;
    chaffNote = d.wantsChaff ? 'No chaff in the notch' : 'None needed';
  } else {
    chaffPts = Math.round(10 * clamp01(m.chaffGood / m.chaffUsed / 0.8));
    chaffNote = `${m.chaffGood} of ${m.chaffUsed} in the notch`;
  }
  parts.push({ id: 'chaff', label: 'Chaff', pts: chaffPts, max: 10, note: chaffNote });

  const score = parts.reduce((s, p) => s + p.pts, 0);
  const headline = m.result === null ? (m.noShot ? 'No shot' : 'Unfinished') : survived ? 'Survived' : 'Hit';
  return { survived, passed, headline, why: missText(m.reason, m), score, parts, coaching: coach(m, react, cue.name, units) };
}

function clamp01(x: number): number { return Math.max(0, Math.min(1, x)); }

/** Two to four sentences: what decided it, and what to do next time. */
export function coach(m: RunMetrics, react: number | null, cueName: string, units: Units = 'metric'): string[] {
  const d = DRILLS[m.drill];
  const spec = MISSILES[m.missile];
  const out: string[] = [];
  const survived = m.result === 'miss';
  const sarh = semiActiveShot(m);

  if (m.noShot) {
    if (m.notchT !== null && /lock|notch|track/i.test(m.noShot)) {
      out.push(`You beamed him before he could shoot, and his radar never got the lock it needs (${m.noShot}). In a real fight that is a good trade: no shot, no missile.`);
    } else {
      out.push(`He never fired (${m.noShot}). Shorten the launch range, or fly toward him until he shoots.`);
    }
    return out;
  }
  if (react === null) {
    out.push(sarh
      ? `You never defended. A SARH launch warning is your cue: beam the ${m.shooterName}'s radar at once and descend.`
      : `You never defended. When the RWR shows the missile, beam it, get low and chaff in the notch.`);
    return out;
  }
  if (react > 3) out.push(`You started defending ${f1(react)} s after ${cueName}. Every second there costs you: react inside two.`);
  else if (react >= 0) out.push(`Good reaction: ${f1(react)} s after ${cueName}.`);

  if (d.technique === 'drag') {
    if (survived && (m.reason === 'kinematic' || m.reason === 'timeout' || m.reason === 'no-acquisition')) {
      out.push(`Dragging early at full burner made it chase you from behind until it ran out of ${m.reason === 'timeout' ? 'battery' : 'energy'}. That only works outside his Rne: the missile has to cover your run too.`);
    } else if (!survived) {
      out.push(m.coldS < m.defendS * 0.6
        ? 'You did not stay cold long enough. Point the threat at your 6 o\'clock and hold it there with full afterburner.'
        : `The ${spec.name} still had the legs for this range. Drag earlier, or notch it at the spike instead.`);
    }
  } else if (sarh) {
    if (m.illumLostT !== null || m.reason === 'lost-guidance') {
      const when = m.launchT !== null && m.illumLostT !== null ? ` ${f1(m.illumLostT - m.launchT)} s after launch` : '';
      out.push(`His radar lost you${when}: with no illumination the ${spec.name} went dumb, and a dumb SARH missile ignores chaff.`);
    } else if (m.radarGateS < 1) {
      out.push(`You spent only ${f1(m.radarGateS)} s inside his ${m.radarName} gate. Put him exactly on your 3 or 9 o'clock: the beam window is a few degrees wide.`);
    }
  } else {
    if (survived && m.reason === 'kinematic') {
      out.push('Beaming also costs it energy: it has to turn to follow you sideways, and here it ran out before its seeker lost you.');
    }
    if (m.seekerGateS < 1 && !survived) {
      out.push(`The seeker saw you outside its gate for all but ${f1(m.seekerGateS)} s. Beam the missile itself once it is active, not the shooter.`);
    }
    if (m.lookUpS > 2) {
      out.push(`For ${Math.round(m.lookUpS)} s you were above the missile. With no ground behind you its notch is less than half as wide: get below it.`);
    }
    if (m.rangeAtUnlock !== null && m.ttiAtUnlock !== null && d.delayS > 0) {
      const when = `When you looked up it was ${fmtRange(m.rangeAtUnlock, units, 1)} out with about ${Math.round(m.ttiAtUnlock)} s to go`;
      out.push(survived
        ? `${when}, and you got away with it: the dice went your way. From there most runs end in a hit. Defend at the launch or the spike, never later.`
        : `${when}. That is not enough time to turn 90°, get low and chaff. Defend at the launch or the spike, never later.`);
    }
  }

  if (m.chaffUsed > 0 && m.chaffGood < m.chaffUsed) {
    const wasted = m.chaffUsed - m.chaffGood;
    out.push(`${wasted} of ${m.chaffUsed} chaff bundles went out when they could not work (outside the notch, or with the missile still far or its seeker off).`);
  } else if (m.chaffUsed === 0 && d.wantsChaff) {
    out.push(`No chaff. In the notch each bundle is a roll against the ${spec.name}'s chaff factor (${spec.chaffSusceptibility}); drop one every second or so.`);
  }
  if (m.flaresUsed > 0) out.push('Flares do nothing against a radar missile.');
  if (survived && out.length < 3) out.push(sarh ? 'Once it is dumb you can turn back hot.' : 'Once it is defeated, turn back hot: he may already have another in the air.');
  return out;
}

function semiActiveShot(m: RunMetrics): boolean {
  return MISSILES[m.missile].seeker === 'sarh' || ((m.missile === 'aim54a' || m.missile === 'aim54c') && m.method === 'stt' && (m.launchRange ?? Infinity) >= 18520);
}
