/**
 * [OWNER: sim] Deck launch (issue #27): the catapult sequence on the CVN (F/A-18C, F-14B) and the Su-33 ski-jump
 * from the Kuznetsov. Game-level only (AGENTS.md rule 1): the steps the player performs and what follows.
 * The catapult stroke and the ski-jump ramp are scripted arcade effects, not catapult or ramp performance.
 *
 * Catapult: the jet sits on the shuttle ('hold') until a salute with every earlier step done, the trim right
 * and the power set. A refused salute logs a sequence error and the shooter holds. After SHOOTER_DELAY_S the
 * cat fires ('stroke'): STROKE_S at constant acceleration to the approach speed + 15 kt. Power below the need
 * at the shot is a cold cat: the jet leaves slow and settles into the sea. Then 'settle' (SETTLE_S hands off)
 * and 'free'. Stick input from the salute to the end of the settle is a hands-on fault.
 * Ski-jump: the stoppers hold the jet until full afterburner has been held STOPPER_S (the real release is not
 * verified), then the run accelerates along the deck (weight, special afterburner and FOD screens scale it),
 * the last RAMP_M rise to the RAMP_DEG ramp and the jet leaves at the ramp angle. Below the minimum ramp speed
 * (MIN_RAMP_VA · approach speed) it is a short run and the jet settles.
 * Deterministic: no randomness.
 */
import { D2R, M_PER_FT, MPS_PER_KT, clamp } from '../math';
import { SHIPS, SHIP_HULL } from '../../data/ships';
import { aoaForLoad, approachSpeedMs, takeoffFlapIndex } from './model';
import { moveShip, shipData, shipFrame, shipToWorld } from './carrier';
import type {
  FlightOpsAction, FlightOpsInput, FlightOpsJetData, FlightOpsLaunchData, FlightOpsState, LaunchOptions, LaunchStepId,
} from './types';

/** Seconds from the accepted salute to the shot (the shooter's delay; gameplay value). */
export const SHOOTER_DELAY_S = 2;
/** Catapult stroke time, seconds (gameplay value). */
export const STROKE_S = 2.5;
/** Catapult end airspeed over the approach speed, knots (gameplay value). */
export const CAT_END_OVER_VA_KT = 15;
/** Hands-off settle after the stroke or the ramp, seconds. */
export const SETTLE_S = 3;
/** Stick deflection that counts as hands on. */
export const HANDS_ON = 0.1;
/** Cold cat: end speed factor. */
export const COLD_CAT_FACTOR = 0.85;
/** Load factor a settling jet (cold cat, short run) can hold: it sinks into the sea. */
export const SETTLE_N = 0.3;
/** Ski-jump: stoppers let go after full afterburner held this long, seconds (not verified). */
export const STOPPER_S = 3;
/** Ski-jump run acceleration at the normal weight with special afterburner, m/s² (gameplay value). */
export const RUN_ACC = 15;
export const NO_SPECIAL_AB_FACTOR = 0.9;
export const FOD_SCREEN_FACTOR = 0.88;
/** Ramp length and exit angle (gameplay values). */
export const RAMP_M = 25;
export const RAMP_DEG = 12;
/** Minimum ramp airspeed as a fraction of the approach speed. */
export const MIN_RAMP_VA = 0.85;
/** Catapult and ski-jump positions across the deck, metres to starboard (drawing values). */
export const STATION_C: Record<'cvn' | 'kuznetsov', Record<number, number>> = {
  cvn: { 1: 10, 2: -10, 3: -25, 4: -35 },
  kuznetsov: { 1: 7, 2: -7, 3: -14 },
};

const CAT_POWER_MIN = 0.95;

export const hasLaunchStart = (d: FlightOpsJetData) => d.launch !== undefined;
export function launchData(d: FlightOpsJetData): FlightOpsLaunchData {
  if (!d.launch) throw new Error(`No launch data for ${d.id}`);
  return d.launch;
}

/** Takeoff trim for a gross weight (Hornet table), degrees, or undefined when the jet has no trim step. */
export function trimForWeight(l: FlightOpsLaunchData, weight: number): number | undefined {
  const t = l.trimByWeightLb?.value;
  if (!t) return undefined;
  for (const [below, deg] of t) if (weight < below) return deg;
  return t[t.length - 1]![1];
}

/** Power the launch needs at this weight. */
export function launchPowerNeed(l: FlightOpsLaunchData, weight: number): 'MIL' | 'AB' {
  if (l.abFromLb && weight >= l.abFromLb.value) return 'AB';
  return l.power.value;
}

export function powerMet(s: FlightOpsState, need: 'MIL' | 'AB') {
  return need === 'AB' ? s.afterburner : s.throttle >= CAT_POWER_MIN;
}

/** Catapult end airspeed, m/s. */
export const catEndSpeedMs = (d: FlightOpsJetData) => (d.approachKt.value + CAT_END_OVER_VA_KT) * MPS_PER_KT;
/** Ski-jump minimum ramp airspeed, m/s. */
export const minRampSpeedMs = (d: FlightOpsJetData) => MIN_RAMP_VA * approachSpeedMs(d);
/** Initial trim the trainer starts the Hornet with, degrees (trainer value). */
export const TRIM_START_DEG = 12;

/** Place the jet on a catapult or a ski-jump position, held, gear down, takeoff flaps, idle. */
export function placeLaunchStart(s: FlightOpsState, d: FlightOpsJetData, opts: LaunchOptions = {}): void {
  const l = launchData(d);
  const ship = SHIPS[l.ship];
  const station = opts.station ?? l.stations[0]!;
  if (!l.stations.includes(station)) throw new Error(`Station ${station} not offered for ${d.id}`);
  const heavy = !!opts.heavy;
  const weight = heavy ? l.weights.heavy : l.weights.normal;
  s.ship = { id: ship.id, x: 0, z: 0, heading: 0, speedMs: ship.speedKt.value * MPS_PER_KT };
  s.gearDown = true; s.gearPos = 1;
  s.flapIndex = takeoffFlapIndex(d); s.flapPos = s.flapIndex / Math.max(1, d.flapLabels.length - 1);
  s.hookDown = false; s.hookPos = 0;
  s.phase = 'ready';
  s.throttle = 0;
  s.heading = 0;
  s.speed = s.ship.speedMs;
  const hull = SHIP_HULL[ship.id].lengthM;
  let a: number;
  if (l.kind === 'catapult') {
    const vDeck = catEndSpeedMs(d) - s.ship.speedMs;
    a = hull - 0.5 * vDeck * STROKE_S - 3;
  } else {
    a = hull - (l.runM?.value[station] ?? 90);
  }
  const p = shipToWorld(s, a, STATION_C[ship.id][station] ?? 0);
  s.pos = { x: p.x, y: ship.deckHeightM, z: p.z };
  const trimWant = trimForWeight(l, weight);
  s.launch = {
    kind: l.kind, station, weight, heavy, stage: 'hold', stepsDone: [], errors: [], handsOn: false,
    ...(trimWant !== undefined ? { trimDeg: TRIM_START_DEG, trimWantDeg: trimWant } : {}),
    ...(l.kind === 'skiJump' ? { specialAB: false, fodScreens: false } : {}),
  };
  const run = l.runM?.value[station];
  if (l.shortRunMaxWeight && run !== undefined && weight > l.shortRunMaxWeight.value && run < Math.max(...Object.values(l.runM!.value))) {
    s.launch.errors.push(`Heavy on position ${station}: a ${run} m run. Use position 3`);
  }
}

const done = (s: FlightOpsState, id: LaunchStepId) => !!s.launch?.stepsDone.some(x => x.id === id);
function mark(s: FlightOpsState, id: LaunchStepId) {
  if (!done(s, id)) s.launch!.stepsDone.push({ id, t: s.t });
}
const stepLabel = (l: FlightOpsLaunchData, id: LaunchStepId) => l.steps.find(x => x.id === id)?.label ?? id;
const hasStep = (l: FlightOpsLaunchData, id: LaunchStepId) => l.steps.some(x => x.id === id);

/** Apply a launch action. Returns true when the action is a launch action (handled or refused). */
export function applyLaunchAction(s: FlightOpsState, action: FlightOpsAction, d: FlightOpsJetData): boolean {
  const L = s.launch;
  const launchActions: FlightOpsAction[] = ['nwsHi', 'launchBar', 'hookUp', 'trimUp', 'trimDown', 'wipeOut', 'salute', 'specialAB', 'fodScreens'];
  if (!launchActions.includes(action)) return false;
  if (!L || !d.launch) return true;
  const l = d.launch;
  if (action === 'fodScreens') {
    L.fodScreens = !L.fodScreens;
    if (L.fodScreens && L.stage !== 'free' && L.stage !== 'settle') L.errors.push(`FOD screens on (${l.avoid?.fodScreens.value ?? 'LAlt+I'}): 12 % less thrust`);
    return true;
  }
  if (L.stage !== 'hold') return true;
  const refuse = (msg: string) => { L.errors.push(msg); };
  switch (action) {
    case 'nwsHi': case 'wipeOut': case 'launchBar':
      if (hasStep(l, action)) mark(s, action);
      return true;
    case 'hookUp':
      if (!hasStep(l, 'hookUp')) return true;
      if (hasStep(l, 'launchBar') && !done(s, 'launchBar')) { refuse('Hook up refused: launch bar up'); return true; }
      mark(s, 'hookUp');
      return true;
    case 'trimUp': case 'trimDown':
      if (L.trimDeg === undefined) return true;
      L.trimDeg = clamp(L.trimDeg + (action === 'trimUp' ? 1 : -1), 0, 24);
      if (L.trimDeg === L.trimWantDeg) mark(s, 'trim');
      return true;
    case 'specialAB':
      if (!hasStep(l, 'specialAB')) return true;
      if (!s.afterburner) { refuse('Special afterburner needs full afterburner first'); return true; }
      L.specialAB = true;
      mark(s, 'specialAB');
      return true;
    case 'salute': {
      if (l.kind !== 'catapult') return true;
      const idx = l.steps.findIndex(x => x.id === 'salute');
      const missing = l.steps.slice(0, idx).filter(x => {
        if (x.id === 'trim') return L.trimDeg !== L.trimWantDeg;
        if (x.id === 'power') return !powerMet(s, launchPowerNeed(l, L.weight));
        return !done(s, x.id);
      });
      if (missing.length) { refuse(`Salute refused, the shooter holds: ${missing.map(x => x.label).join(', ')}`); return true; }
      mark(s, 'salute');
      L.saluteT = s.t;
      L.stage = 'shot';
      return true;
    }
  }
  return true;
}

/** Order faults: a step done before one the sequence puts ahead of it. */
export function orderFaults(l: FlightOpsLaunchData, stepsDone: readonly { id: LaunchStepId }[]): string[] {
  const rank = (id: LaunchStepId) => l.steps.findIndex(x => x.id === id);
  const out: string[] = [];
  for (let i = 1; i < stepsDone.length; i++) {
    const prev = stepsDone[i - 1]!.id, cur = stepsDone[i]!.id;
    if (rank(cur) < rank(prev)) out.push(`${stepLabel(l, cur)} after ${stepLabel(l, prev)}: out of order`);
  }
  return out;
}

/**
 * Deck step while held, on the shot delay and during the stroke or run (mutates s). Returns true while the jet
 * is on the deck; false once it flies (the caller runs the air step).
 */
export function stepLaunchDeck(s: FlightOpsState, input: FlightOpsInput, dt: number, d: FlightOpsJetData): boolean {
  const L = s.launch!;
  const l = launchData(d);
  if (L.stage === 'settle' || L.stage === 'free') return false;
  const ship = shipData(s);
  const need = launchPowerNeed(l, L.weight);
  const tracksHands = hasStep(l, 'handsOff');
  if (tracksHands && L.stage !== 'hold' && (Math.abs(input.pitch) > HANDS_ON || Math.abs(input.roll) > HANDS_ON)) handsOn(s);
  if (hasStep(l, 'power') && powerMet(s, need) && L.stage === 'hold') mark(s, 'power');

  const f = shipFrame(s);
  let vDeck = Math.max(0, s.speed - s.ship!.speedMs);
  s.gamma = 0; s.vs = 0; s.bank = 0; s.aoa = 0; s.pitch = 0;

  if (L.stage === 'hold' && l.kind === 'skiJump') {
    // Stoppers: full afterburner held STOPPER_S lets them go.
    if (s.afterburner) {
      const since = stopperMem.get(s) ?? s.t;
      stopperMem.set(s, since);
      if (s.t - since >= STOPPER_S - 1e-9) {
        mark(s, 'release');
        if (!L.specialAB) L.errors.push('Stoppers released without special afterburner');
        L.stage = 'stroke'; L.strokeT = s.t; s.phase = 'roll';
      }
    } else stopperMem.delete(s);
  }
  if (L.stage === 'shot' && s.t - (L.saluteT ?? s.t) >= SHOOTER_DELAY_S - 1e-9) {
    L.stage = 'stroke'; L.strokeT = s.t; s.phase = 'roll';
    if (!powerMet(s, need)) L.outcome = 'cold cat';
  }

  if (L.stage === 'stroke') {
    let acc: number;
    if (l.kind === 'catapult') acc = (catEndSpeedMs(d) - s.ship!.speedMs) / STROKE_S;
    else {
      acc = RUN_ACC * (l.weights.normal / L.weight) * (L.specialAB ? 1 : NO_SPECIAL_AB_FACTOR)
        * (L.fodScreens ? FOD_SCREEN_FACTOR : 1) * (s.afterburner ? 1 : 0.6);
    }
    vDeck += acc * dt;
  }
  moveShip(s, dt);
  const a = f.a + vDeck * dt;
  const p = shipToWorld(s, a, f.c);
  s.pos.x = p.x; s.pos.z = p.z;
  s.speed = s.ship!.speedMs + vDeck;
  s.heading = s.ship!.heading;
  const hull = SHIP_HULL[ship.id].lengthM;
  let h = 0;
  if (l.kind === 'skiJump') {
    const into = a - (hull - RAMP_M);
    if (into > 0) {
      h = (Math.min(into, RAMP_M) ** 2 * Math.tan(RAMP_DEG * D2R)) / (2 * RAMP_M);
      s.pitch = Math.atan(Math.min(into, RAMP_M) / RAMP_M * Math.tan(RAMP_DEG * D2R));
    }
  }
  s.pos.y = ship.deckHeightM + h;

  if (L.stage !== 'stroke') return true;
  const catDone = l.kind === 'catapult' && s.t - L.strokeT! >= STROKE_S - 1e-9;
  const rampDone = l.kind === 'skiJump' && a >= hull;
  if (!catDone && !rampDone) return true;
  release(s, d, l);
  return false;
}
const stopperMem = new WeakMap<FlightOpsState, number>();

function handsOn(s: FlightOpsState) {
  const L = s.launch!;
  if (!L.handsOn) L.errors.push('Hands on the stick during the stroke');
  L.handsOn = true;
}

/** End of the stroke or the ramp: the jet flies. */
function release(s: FlightOpsState, d: FlightOpsJetData, l: FlightOpsLaunchData) {
  const L = s.launch!;
  if (L.outcome === 'cold cat') s.speed *= COLD_CAT_FACTOR;
  L.endT = s.t;
  L.endKt = s.speed / MPS_PER_KT;
  L.endHeading = s.heading;
  L.stage = 'settle';
  s.phase = 'air';
  L.errors.push(...orderFaults(l, L.stepsDone));
  let n = 1.1;
  if (l.kind === 'skiJump') {
    L.minKt = minRampSpeedMs(d) / MPS_PER_KT;
    if (s.speed < minRampSpeedMs(d)) L.outcome = 'short run';
    s.gamma = RAMP_DEG * D2R;
    n = 1;
  } else {
    s.gamma = 0;
    s.pos.y += 1;
    if (L.trimWantDeg !== undefined && L.trimDeg !== L.trimWantDeg) {
      L.errors.push(`Trim ${L.trimDeg}°, want ${L.trimWantDeg}° for ${L.weight} lb`);
      n = L.trimDeg! < L.trimWantDeg ? 1 : 1.3;
    }
  }
  s.aoa = aoaForLoad(s, d, L.outcome === 'cold cat' || L.outcome === 'short run' ? SETTLE_N : n);
  s.vs = s.speed * Math.sin(s.gamma);
  s.pitch = s.gamma + (d.aoa.unit === 'deg' ? s.aoa : s.aoa * 0.4) * D2R;
  L.outcome ??= L.errors.length ? 'sequence error' : 'good';
}

/**
 * Air-phase launch rules, before the stick is applied: the hands-off settle and the sink after a cold cat or
 * a short run. Mutates s.
 */
export function stepLaunchAir(s: FlightOpsState, input: FlightOpsInput, d: FlightOpsJetData): void {
  const L = s.launch;
  if (!L || L.stage === 'hold' || L.stage === 'shot' || L.stage === 'stroke') return;
  const l = launchData(d);
  if (L.stage === 'settle') {
    if (hasStep(l, 'handsOff') && (Math.abs(input.pitch) > HANDS_ON || Math.abs(input.roll) > HANDS_ON)) handsOn(s);
    if (s.t - (L.endT ?? s.t) >= SETTLE_S - 1e-9) {
      L.stage = 'free';
      if (hasStep(l, 'handsOff') && !L.handsOn) mark(s, 'handsOff');
      if (L.handsOn && L.outcome === 'good') L.outcome = 'sequence error';
    }
  }
  if (L.outcome === 'cold cat' || L.outcome === 'short run') s.aoa = Math.min(s.aoa, aoaForLoad(s, d, SETTLE_N));
}

/** Sequence strip for the page: each step with done / next / pending. */
export function launchStrip(s: FlightOpsState, d: FlightOpsJetData): { id: LaunchStepId; label: string; state: 'done' | 'next' | 'pending'; t?: number }[] {
  const l = launchData(d);
  let nextGiven = false;
  return l.steps.map(st => {
    const rec = s.launch?.stepsDone.find(x => x.id === st.id);
    if (rec) return { id: st.id, label: st.label, state: 'done' as const, t: rec.t };
    const state = nextGiven ? 'pending' as const : 'next' as const;
    nextGiven = true;
    return { id: st.id, label: st.label, state };
  });
}

/** Height above the sea for the climb gate, metres. */
export const LAUNCH_CLIMB_M = 1000 * M_PER_FT;
