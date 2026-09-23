import { describe, expect, it } from 'vitest';
import { FLIGHT_OPS } from '../../data/flightOps';
import {
  FLIGHT_OPS_DT, INTERCEPT_NAME, NAV_CALLS, NAV_CALL_MIN_S, applyAction, approachGeometry, createFlightOpsState,
  demoPilot, hasNavStart, stepFlightOps, touchdownZone, updateNav, type FlightOpsJetId, type FlightOpsState,
} from './index';

const NAV_JETS: FlightOpsJetId[] = ['su27', 'j11a', 'su33', 'mig29s', 'f15c'];
const RU: FlightOpsJetId[] = ['su27', 'j11a', 'su33', 'mig29s'];

function flyRtb(id: FlightOpsJetId, onStep?: (s: FlightOpsState) => void) {
  const d = FLIGHT_OPS[id];
  const s = createFlightOpsState(id, 'rtb');
  demoPilot(s, d);
  for (let i = 0; i < 60 * 900 && s.phase !== 'stopped' && s.phase !== 'crashed'; i++) {
    const c = demoPilot(s, d);
    for (const a of c.actions) applyAction(s, a, d);
    stepFlightOps(s, c, FLIGHT_OPS_DT, d);
    onStep?.(s);
  }
  return s;
}

describe('nav data', () => {
  it('gives nav to the FC3 jets only', () => {
    for (const id of Object.keys(FLIGHT_OPS) as FlightOpsJetId[]) {
      expect(hasNavStart(FLIGHT_OPS[id]), id).toBe(NAV_JETS.includes(id));
    }
    expect(() => createFlightOpsState('fa18c', 'rtb')).toThrow(/nav/);
  });
});

describe('nav modes', () => {
  it('cycles МРШ → ВЗВ → ПОС → МРШ on the Russian jets', () => {
    for (const id of RU) {
      const s = createFlightOpsState(id, 'rtb');
      const seen = [s.nav!.label];
      for (let i = 0; i < 3; i++) { applyAction(s, 'navModeCycle'); seen.push(s.nav!.label); }
      expect(seen).toEqual(['ВЗВ', 'ПОС', 'МРШ', 'ВЗВ']);
    }
  });

  it('cycles NAV → ILSN on the F-15C and starts on the IAF', () => {
    const s = createFlightOpsState('f15c', 'rtb');
    expect(s.nav!.label).toBe('NAV');
    expect(s.nav!.target.name).toBe('IAF');
    applyAction(s, 'navModeCycle');
    expect([s.nav!.mode, s.nav!.label]).toEqual(['landing', 'ILSN']);
    applyAction(s, 'navModeCycle');
    expect(s.nav!.label).toBe('NAV');
  });

  it('cycles route waypoints and ignores the point key outside route mode', () => {
    const s = createFlightOpsState('su27', 'rtb');
    applyAction(s, 'navPointCycle');
    expect(s.nav!.target.name).toBe(INTERCEPT_NAME);
    applyAction(s, 'navModeCycle'); applyAction(s, 'navModeCycle');
    expect(s.nav!.target.name).toBe('WP1');
    applyAction(s, 'navPointCycle');
    expect(s.nav!.target.name).toBe('IAF');
    applyAction(s, 'navPointCycle');
    expect(s.nav!.target.name).toBe('WP1');
  });

  it('starts the rtb off-axis, clean, in return mode steering to the intercept point', () => {
    const d = FLIGHT_OPS.su27;
    const s = createFlightOpsState('su27', 'rtb');
    expect(s.gearDown).toBe(false);
    expect(s.flapIndex).toBe(0);
    expect(s.nav!.mode).toBe('return');
    expect(s.nav!.distM).toBeGreaterThan(25000);
    expect(s.nav!.commandAltM).toBe(d.nav!.interceptAltM.value);
    expect(s.nav!.steerHeading).toBeCloseTo(s.nav!.bearing, 6);
    expect(s.nav!.glideDevDeg).toBeNull();
  });

  it('switches ВЗВ to ПОС by itself near the intercept point, not the F-15C', () => {
    const s = createFlightOpsState('su33', 'rtb');
    s.pos = { x: 0, y: 700, z: FLIGHT_OPS.su33.nav!.interceptPointM.value + 2000 };
    updateNav(s, FLIGHT_OPS.su33);
    expect(s.nav!.label).toBe('ПОС');
    expect(s.nav!.call).toBe(NAV_CALLS.landing);
    const e = createFlightOpsState('f15c', 'rtb');
    e.pos = { x: 0, y: 700, z: FLIGHT_OPS.f15c.nav!.interceptPointM.value + 500 };
    updateNav(e, FLIGHT_OPS.f15c);
    expect(e.nav!.label).toBe('NAV');
  });
});

describe('landing mode', () => {
  function onFinal() {
    const d = FLIGHT_OPS.su27;
    // An rtb state (with its nav picture) moved onto a 'final' start, then landing mode selected.
    const r = createFlightOpsState('su27', 'rtb');
    Object.assign(r, { ...createFlightOpsState('su27', 'final'), nav: r.nav });
    applyAction(r, 'navModeCycle', d);
    return { s: r, d };
  }

  it('uses + for high and right, matching approachGeometry, and steers back to the centreline', () => {
    const { s, d } = onFinal();
    expect(s.nav!.mode).toBe('landing');
    expect(s.nav!.glideDevDeg!).toBeCloseTo(0, 3);
    s.pos.y += 40; s.pos.x = 80;
    updateNav(s, d);
    const g = approachGeometry(s, d);
    expect(s.nav!.glideDevDeg!).toBeGreaterThan(0);
    expect(s.nav!.locDevDeg!).toBeGreaterThan(0);
    expect(s.nav!.glideDevDeg!).toBeCloseTo(g.glideErrDeg, 9);
    expect(s.nav!.locDevDeg!).toBeCloseTo(g.lineupErrDeg, 9);
    // Right of the centreline: steer left (west of north).
    expect(s.nav!.steerHeading).toBeGreaterThan(Math.PI);
  });

  it('makes tower calls with hysteresis and a minimum interval', () => {
    const { s, d } = onFinal();
    const base = s.pos.y;
    const glideAt = (dy: number, t: number) => { s.pos.y = base + dy; s.t = t; updateNav(s, d); return s.nav!.call; };
    expect(glideAt(0, 1)).toBe(NAV_CALLS.landing); // too soon after the mode switch
    expect(glideAt(0, NAV_CALL_MIN_S + 0.1)).toBe(NAV_CALLS.on);
    expect(glideAt(40, NAV_CALL_MIN_S + 1)).toBe(NAV_CALLS.on); // high, but inside the interval
    expect(glideAt(40, 2 * NAV_CALL_MIN_S + 0.2)).toBe(NAV_CALLS.above);
    // Between the on and off thresholds the last band holds: no chatter back to "on".
    const range = s.pos.z + d.aimPointFt.value * 0.3048;
    const dyMid = range * (Math.tan((d.glideDeg.value + 0.35) * Math.PI / 180) - Math.tan(d.glideDeg.value * Math.PI / 180));
    expect(glideAt(dyMid, 20)).toBe(NAV_CALLS.above);
    expect(glideAt(-40, 30)).toBe(NAV_CALLS.below);
  });
});

describe('demo pilot rtb', () => {
  for (const id of NAV_JETS) {
    it(`flies the ${id} home in nav modes and lands in the zone`, () => {
      const labels = new Set<string>();
      const s = flyRtb(id, st => labels.add(st.nav!.label));
      expect(s.phase).toBe('stopped');
      const zone = touchdownZone(FLIGHT_OPS[id]);
      expect(s.touchdown!.z).toBeLessThanOrEqual(zone.zNear);
      expect(s.touchdown!.z).toBeGreaterThanOrEqual(zone.zFar);
      expect(s.touchdown!.gearDown).toBe(true);
      expect([...labels]).toEqual(id === 'f15c' ? ['NAV', 'ILSN'] : ['ВЗВ', 'ПОС']);
    });
  }

  it('is deterministic', () => {
    expect(flyRtb('mig29s')).toEqual(flyRtb('mig29s'));
  });
});
