import { describe, expect, it } from 'vitest';
import { FLIGHT_OPS } from '../../data/flightOps';
import { createFlightOpsState } from '../../sim/flightOps';
import { M_PER_FT, M_PER_NM } from '../../sim/math';
import { hudHeightM } from './displays';
import { TIME_HOLD_FT, TIME_SCALES, timeHold, timeHoldText } from './logic';

const hold = (s: ReturnType<typeof createFlightOpsState>) => timeHold(s, hudHeightM(s));

describe('time acceleration (trainer rule)', () => {
  it('offers 1×, 2×, 4× and 8× like the sortie page', () => {
    expect(TIME_SCALES).toEqual([1, 2, 4, 8]);
  });

  it('allows acceleration on the tanker rejoin, then holds 1× within 0.5 nm or in pre-contact', () => {
    const s = createFlightOpsState('fa18c', 'aarRejoin', FLIGHT_OPS.fa18c);
    const a = s.aar!;
    expect(Math.hypot(a.rel.aft, a.rel.right, a.rel.up)).toBeGreaterThan(M_PER_NM);
    expect(hold(s)).toBeNull();
    a.rel = { aft: 0.4 * M_PER_NM, right: 0, up: 0 };
    expect(hold(s)).toBe('tanker');
    expect(hold(createFlightOpsState('fa18c', 'aarPrecontact', FLIGHT_OPS.fa18c))).toBe('tanker');
  });

  it('holds 1× on the ground, gear down, or low; allows it on the initial', () => {
    expect(hold(createFlightOpsState('f15c', 'takeoff'))).toBe('ground');
    const s = createFlightOpsState('f15c', 'initial');
    expect(s.gearDown).toBe(false);
    expect(hold(s)).toBeNull();
    s.gearDown = true;
    expect(hold(s)).toBe('gear');
    s.gearDown = false;
    s.pos.y = (TIME_HOLD_FT - 50) * M_PER_FT;
    expect(hold(s)).toBe('low');
  });

  it('says the reason in the app units', () => {
    expect(timeHoldText('low', 'imperial')).toBe('below 500 ft');
    expect(timeHoldText('low', 'metric')).toBe('below 150 m');
    expect(timeHoldText('tanker', 'metric')).toBe('tanker within 900 m');
    expect(timeHoldText('tanker', 'imperial')).toBe('tanker within 0.5 nm');
  });
});
