import { describe, expect, it } from 'vitest';
import { FLIGHT_OPS, FLIGHT_OPS_CAVEATS } from '../../data/flightOps';
import { D2R, MPS_PER_KT } from '../math';
import {
  ApproachEvaluator, FLIGHT_OPS_DT, aoaCue, applyAction, approachGeometry, configWarnings, createFlightOpsState,
  demoPilot, stepFlightOps, touchdownZone, type FlightOpsJetId, type FlightOpsState,
} from './index';

const JETS = Object.keys(FLIGHT_OPS) as FlightOpsJetId[];

function flyDemo(id: FlightOpsJetId, start: 'initial' | 'final' = 'initial', setup?: (s: FlightOpsState) => void) {
  const d = FLIGHT_OPS[id];
  const s = createFlightOpsState(id, start);
  demoPilot(s, d); // fixes the demo leg from the start position
  setup?.(s);
  const ev = new ApproachEvaluator(d);
  for (let i = 0; i < 60 * 400 && s.phase !== 'stopped' && s.phase !== 'crashed'; i++) {
    const c = demoPilot(s, d);
    for (const a of c.actions) applyAction(s, a, d);
    stepFlightOps(s, c, FLIGHT_OPS_DT, d);
    ev.update(s);
  }
  return { s, score: ev.score() };
}

describe('flight-ops data', () => {
  it('has consistent flap, band and caveat data for every jet', () => {
    for (const id of JETS) {
      const d = FLIGHT_OPS[id];
      expect(d.id).toBe(id);
      expect(d.landingFlap).toBeLessThan(d.flapLabels.length);
      const [lo, hi] = d.aoa.band.value;
      expect(lo).toBeLessThanOrEqual(d.aoa.onSpeed.value);
      expect(hi).toBeGreaterThanOrEqual(d.aoa.onSpeed.value);
    }
    expect(FLIGHT_OPS_CAVEATS.length).toBeGreaterThan(0);
  });
});

describe('demo pilot', () => {
  for (const id of JETS) {
    it(`flies the overhead pattern and lands the ${id} in the zone`, () => {
      const { s, score } = flyDemo(id);
      expect(s.phase).toBe('stopped');
      expect(s.touchdown?.gearDown).toBe(true);
      const zone = touchdownZone(FLIGHT_OPS[id]);
      expect(s.touchdown!.z).toBeLessThanOrEqual(zone.zNear);
      expect(s.touchdown!.z).toBeGreaterThanOrEqual(zone.zFar);
      expect(score.gates.map(g => g.id)).toEqual(['initial', 'break', 'downwind', 'abeam', 'ninety', 'groove', 'touchdown']);
      for (const g of score.gates) expect(g.ok, `${id} ${g.id}: ${g.notes.join('; ')}`).toBe(true);
      expect(score.touchdownInZone).toBe(true);
      expect(score.total).toBeGreaterThanOrEqual(75);
      expect(score.verdict).not.toMatch(/!/);
    });
  }

  it('is deterministic', () => {
    const a = flyDemo('fa18c').s;
    const b = flyDemo('fa18c').s;
    expect(b).toEqual(a);
  });
});

describe('model', () => {
  it('treats the AoA band edges as on speed, at the displayed resolution', () => {
    const d = FLIGHT_OPS.fa18c;
    const s = createFlightOpsState('fa18c', 'final');
    const [lo, hi] = d.aoa.band.value;
    for (const [aoa, cue] of [[lo, 'on'], [lo - 0.04, 'on'], [hi, 'on'], [hi + 0.04, 'on'], [lo - 0.1, 'fast'], [hi + 0.1, 'slow']] as const) {
      s.aoa = aoa;
      expect(aoaCue(s, d)).toBe(cue);
    }
  });
  it('reads on-speed AoA at the approach speed in landing configuration', () => {
    for (const id of JETS) {
      const d = FLIGHT_OPS[id];
      const s = createFlightOpsState(id, 'final');
      expect(s.speed / MPS_PER_KT).toBeCloseTo(d.approachKt.value, 3);
      expect(s.aoa).toBeCloseTo(d.aoa.onSpeed.value, 3);
      expect(aoaCue(s, d)).toBe('on');
      for (let i = 0; i < 60; i++) stepFlightOps(s, { pitch: 0, roll: 0, throttle: s.throttle }, FLIGHT_OPS_DT, d);
      expect(aoaCue(s, d)).toBe('on');
      s.speed *= 0.85;
      stepFlightOps(s, { pitch: 0, roll: 0, throttle: s.throttle }, FLIGHT_OPS_DT, d);
      // Same lift at lower speed needs more AoA: the pilot pulls, the indexer shows slow.
      s.aoa *= 1 / 0.85 ** 2;
      expect(aoaCue(s, d)).toBe('slow');
    }
  });

  it('crashes a gear-up landing and scores it zero', () => {
    const { s, score } = flyDemo('fa18c', 'final', st => applyAction(st, 'gearToggle'));
    expect(s.phase).toBe('crashed');
    expect(s.crashReason).toBe('Gear up at touchdown');
    expect(score.total).toBe(0);
    expect(score.touchdownInZone).toBe(false);
  });

  it('crashes a hard landing', () => {
    const d = FLIGHT_OPS.f16c;
    const s = createFlightOpsState('f16c', 'final');
    s.pos.y = 30; s.gamma = -8 * D2R;
    for (let i = 0; i < 60 * 30 && s.phase === 'air'; i++) stepFlightOps(s, { pitch: 0, roll: 0, throttle: s.throttle }, FLIGHT_OPS_DT, d);
    expect(s.phase).toBe('crashed');
    expect(s.crashReason).toBe('Hard landing');
  });

  it('animates the gear and warns on overspeed without breaking the jet', () => {
    const d = FLIGHT_OPS.fa18c;
    const s = createFlightOpsState('fa18c', 'initial');
    applyAction(s, 'gearToggle', d);
    stepFlightOps(s, { pitch: 0, roll: 0, throttle: s.throttle }, 3, d);
    expect(s.gearPos).toBeCloseTo(0.5, 2);
    expect(configWarnings(s, d).overspeed).toBe('gear');
    applyAction(s, 'gearToggle', d);
    for (let i = 0; i < 6 * 60; i++) stepFlightOps(s, { pitch: 0, roll: 0, throttle: s.throttle }, FLIGHT_OPS_DT, d);
    expect(s.gearPos).toBe(0);
    applyAction(s, 'flapsDown', d); applyAction(s, 'flapsDown', d);
    stepFlightOps(s, { pitch: 0, roll: 0, throttle: s.throttle }, 0.5, d);
    expect(configWarnings(s, d).overspeed).toBe('flaps');
    expect(s.phase).toBe('air');
  });

  it('moves the F-16 flaps with the gear and ignores the flap key', () => {
    const d = FLIGHT_OPS.f16c;
    const s = createFlightOpsState('f16c', 'initial');
    applyAction(s, 'flapsDown', d);
    expect(s.flapIndex).toBe(0);
    applyAction(s, 'gearToggle', d);
    expect(s.flapIndex).toBe(d.landingFlap);
  });
});

describe('approach geometry', () => {
  it('uses + for high, right of centreline and before the aim point', () => {
    const d = FLIGHT_OPS.fa18c;
    const s = createFlightOpsState('fa18c', 'final');
    const on = approachGeometry(s, d);
    expect(on.rangeM).toBeGreaterThan(0);
    expect(on.glideErrDeg).toBeCloseTo(0, 3);
    expect(on.lineupErrDeg).toBeCloseTo(0, 6);
    s.pos.y += 30; s.pos.x = 60;
    const off = approachGeometry(s, d);
    expect(off.glideErrDeg).toBeGreaterThan(0);
    expect(off.lineupErrDeg).toBeGreaterThan(0);
    s.pos.z = -2000;
    expect(approachGeometry(s, d).rangeM).toBeLessThan(0);
    expect(approachGeometry(s, d).onFinal).toBe(false);
  });
});
