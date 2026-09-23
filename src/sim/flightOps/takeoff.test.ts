import { describe, expect, it } from 'vitest';
import { F16_TAKEOFF_WEIGHT_LB, FLIGHT_OPS, vrAtWeight } from '../../data/flightOps';
import { M_PER_FT, MPS_PER_KT, R2D } from '../math';
import {
  ApproachEvaluator, FLIGHT_OPS_DT, TakeoffEvaluator, applyAction, createFlightOpsState, demoPilot, rotateAtKt,
  stepFlightOps, type FlightOpsAction, type FlightOpsInput, type FlightOpsJetId, type FlightOpsState,
} from './index';

const JETS = Object.keys(FLIGHT_OPS) as FlightOpsJetId[];
type Pilot = (s: FlightOpsState) => FlightOpsInput & { actions: FlightOpsAction[] };

function flyTakeoff(id: FlightOpsJetId, pilot?: Pilot, maxS = 120) {
  const d = FLIGHT_OPS[id];
  const s = createFlightOpsState(id, 'takeoff');
  const ev = new TakeoffEvaluator(d);
  const fly: Pilot = pilot ?? (st => demoPilot(st, d));
  for (let i = 0; i < 60 * maxS && s.phase !== 'crashed' && ev.score().total === null; i++) {
    const c = fly(s);
    for (const a of c.actions) applyAction(s, a, d);
    stepFlightOps(s, c, FLIGHT_OPS_DT, d);
    ev.update(s);
  }
  return { s, score: ev.score() };
}

describe('takeoff data', () => {
  it('has a takeoff for every jet with the pitch band below the tail-strike attitude', () => {
    for (const id of JETS) {
      const t = FLIGHT_OPS[id].takeoff;
      const [lo, hi] = t.pitchDeg.value;
      expect(lo).toBeLessThan(hi);
      expect(hi).toBeLessThan(t.tailStrikeDeg.value);
      expect(t.gearUpMaxKt.value).toBeGreaterThan(t.vrKt.value + 30);
      expect(t.cue).not.toMatch(/!/);
    }
  });
  it('interpolates the F-16C Vr table at the standard weight', () => {
    const t = FLIGHT_OPS.f16c.takeoff;
    expect(vrAtWeight(t.vrByWeightLb!.value, 20000)).toBe(128);
    expect(vrAtWeight(t.vrByWeightLb!.value, 44000)).toBe(198);
    expect(t.vrKt.value).toBe(vrAtWeight(t.vrByWeightLb!.value, F16_TAKEOFF_WEIGHT_LB));
    expect(rotateAtKt(FLIGHT_OPS.f16c)).toBe(t.vrKt.value - 10);
  });
});

describe('demo takeoff', () => {
  for (const id of JETS) {
    it(`takes off the ${id} and passes every gate`, () => {
      const { s, score } = flyTakeoff(id);
      expect(s.phase).toBe('air');
      expect(s.takeoff?.tailStrike).toBe(false);
      expect(score.tailStrike).toBe(false);
      expect(score.gates.map(g => g.id)).toEqual(['brakeRelease', 'rotate', 'liftoff', 'gearUp', 'climb']);
      for (const g of score.gates) expect(g.ok, `${id} ${g.id}: ${g.notes.join('; ')}`).toBe(true);
      expect(score.total).toBe(100);
      expect(score.verdict).not.toMatch(/!/);
      expect(s.gearDown).toBe(false);
      if (id === 'fa18c') expect(FLIGHT_OPS.fa18c.flapLabels[s.flapIndex]).toBe('AUTO');
      if (id !== 'm2000c') expect(s.flapIndex).toBe(0);
      // Liftoff inside the runway.
      expect(s.takeoff!.liftoffT).toBeDefined();
    });
  }

  it('is deterministic', () => {
    expect(flyTakeoff('f16c').s).toEqual(flyTakeoff('f16c').s);
  });
});

describe('takeoff model', () => {
  it('starts on the runway, stopped, gear down, takeoff flaps, throttle idle', () => {
    for (const id of JETS) {
      const d = FLIGHT_OPS[id];
      const s = createFlightOpsState(id, 'takeoff');
      expect(s.phase).toBe('ready');
      expect(s.speed).toBe(0);
      expect(s.throttle).toBe(0);
      expect(s.gearDown).toBe(true);
      expect(s.heading).toBe(0);
      expect(s.pos.z).toBeLessThan(0);
      const want = d.noFlapControl ? 0 : d.flapsWithGear ? d.landingFlap : d.takeoff.flapIndex;
      expect(s.flapIndex).toBe(want);
    }
  });

  it('holds the jet on the brakes at full power, then rolls on release', () => {
    const d = FLIGHT_OPS.su27;
    const s = createFlightOpsState('su27', 'takeoff');
    for (let i = 0; i < 60 * 10; i++) stepFlightOps(s, { pitch: 0, roll: 0, throttle: 1, afterburner: true, brakes: true }, FLIGHT_OPS_DT, d);
    expect(s.phase).toBe('ready');
    expect(s.speed).toBe(0);
    expect(s.throttle).toBeGreaterThan(0.99);
    expect(s.takeoff!.brakeReleaseT).toBeUndefined();
    stepFlightOps(s, { pitch: 0, roll: 0, throttle: 1, afterburner: true }, FLIGHT_OPS_DT, d);
    expect(s.phase).toBe('roll');
    expect(s.speed).toBeGreaterThan(0);
    expect(s.takeoff!.brakeReleaseT).toBeCloseTo(s.t, 6);
  });

  it('keeps the nose down below 0.8 Vr and fails the brake release without power set', () => {
    const d = FLIGHT_OPS.fa18c;
    const { score, s } = flyTakeoff('fa18c', st => {
      const kt = st.speed / MPS_PER_KT;
      // No brakes: the roll starts as the throttle comes up through the brake-away level.
      const c = demoPilot(st, d);
      if (st.phase === 'ready' || st.phase === 'roll') {
        if (kt < 0.75 * d.takeoff.vrKt.value) expect(st.pitch).toBe(0);
        return { ...c, pitch: kt < 0.75 * d.takeoff.vrKt.value ? 1 : c.pitch, brakes: false };
      }
      return c;
    });
    expect(score.gates.find(g => g.id === 'brakeRelease')?.ok).toBe(false);
    expect(score.verdict).toMatch(/power not set/);
    expect(s.takeoff?.rotateKt).toBeGreaterThanOrEqual(0.8 * d.takeoff.vrKt.value);
  });

  it('records a tail strike when the pull is too hard and zeroes the liftoff gate', () => {
    const d = FLIGHT_OPS.m2000c;
    const { s, score } = flyTakeoff('m2000c', st => {
      const c = demoPilot(st, d);
      // Full back stick from the moment the nose can come up (0.8 Vr).
      return st.phase === 'roll' && st.speed / MPS_PER_KT >= 0.8 * d.takeoff.vrKt.value ? { ...c, pitch: 1 } : c;
    });
    expect(s.takeoff!.tailStrike).toBe(true);
    expect(s.takeoff!.maxPitchOnGroundDeg).toBeCloseTo(d.takeoff.tailStrikeDeg.value, 6);
    expect(s.phase).not.toBe('crashed');
    expect(score.tailStrike).toBe(true);
    const lift = score.gates.find(g => g.id === 'liftoff')!;
    expect(lift.ok).toBe(false);
    expect(lift.notes.join(' ')).toMatch(/Tail strike/);
    expect(score.verdict).toMatch(/tail strike/);
  });

  it('fails the gear-up gate when the gear stays down past the limit', () => {
    const d = FLIGHT_OPS.f16c;
    const { score } = flyTakeoff('f16c', st => {
      const c = demoPilot(st, d);
      // Keep the gear down, full power.
      return { ...c, actions: c.actions.filter(a => a !== 'gearToggle'), throttle: 1 };
    });
    const g = score.gates.find(x => x.id === 'gearUp')!;
    expect(g.ok).toBe(false);
    expect(score.verdict).toMatch(/gear up late/);
  });

  it('fails the gear-up gate for a late gear-up command', () => {
    const d = FLIGHT_OPS.jf17;
    const limit = d.takeoff.gearUpMaxKt.value;
    const { score } = flyTakeoff('jf17', st => {
      const c = demoPilot(st, d);
      const kt = st.speed / MPS_PER_KT;
      const actions: FlightOpsAction[] = c.actions.filter(a => a !== 'gearToggle');
      if (st.phase === 'air' && st.gearDown && kt > limit + 5) actions.push('gearToggle');
      return { ...c, actions, throttle: 1 };
    });
    const g = score.gates.find(x => x.id === 'gearUp')!;
    expect(g.ok).toBe(false);
  });

  it('lifts off late and shallow when the pilot barely rotates', () => {
    const d = FLIGHT_OPS.f15c;
    const { s, score } = flyTakeoff('f15c', st => {
      const c = demoPilot(st, d);
      if (st.phase === 'roll') return { ...c, pitch: st.pitch * R2D < 4 && st.speed / MPS_PER_KT > rotateAtKt(d) ? 0.5 : 0 };
      return c;
    });
    expect(s.takeoff!.liftoffKt).toBeGreaterThanOrEqual(d.takeoff.vrKt.value + 25 - 0.5);
    expect(score.gates.find(g => g.id === 'liftoff')?.ok).toBe(false);
    expect(score.verdict).toMatch(/under-rotated/);
  });

  it('reaches the climb gate at 1000 ft', () => {
    const { s, score } = flyTakeoff('fa18c');
    expect(s.pos.y).toBeGreaterThanOrEqual(1000 * M_PER_FT);
    expect(score.gates.at(-1)!.id).toBe('climb');
  });
});

describe('M-2000C flaps', () => {
  it('ignores the flap keys', () => {
    const d = FLIGHT_OPS.m2000c;
    for (const start of ['initial', 'final', 'takeoff'] as const) {
      const s = createFlightOpsState('m2000c', start);
      const before = s.flapIndex;
      applyAction(s, 'flapsDown', d); applyAction(s, 'flapsDown', d);
      expect(s.flapIndex).toBe(before);
      applyAction(s, 'flapsUp', d);
      expect(s.flapIndex).toBe(before);
    }
  });

  it('grades the landing without mentioning flaps', () => {
    const d = FLIGHT_OPS.m2000c;
    const s = createFlightOpsState('m2000c', 'initial');
    const ev = new ApproachEvaluator(d);
    demoPilot(s, d);
    for (let i = 0; i < 60 * 400 && s.phase !== 'stopped' && s.phase !== 'crashed'; i++) {
      const c = demoPilot(s, d);
      for (const a of c.actions) applyAction(s, a, d);
      stepFlightOps(s, c, FLIGHT_OPS_DT, d);
      ev.update(s);
    }
    const score = ev.score();
    const text = [...score.gates.flatMap(g => g.notes), score.verdict ?? ''].join(' ');
    expect(text).not.toMatch(/flap/i);
    expect(score.gates.find(g => g.id === 'abeam')?.ok).toBe(true);
  });
});
