import { describe, expect, it } from 'vitest';
import { FLIGHT_OPS } from '../data/flightOps';
import { SHIP_HULL } from '../data/ships';
import { FLIGHT_OPS_DT, RAMP_DEG, RAMP_M, STATION_C, createFlightOpsState, demoPilot, shipFrame, stepFlightOps } from '../sim/flightOps';
import { deckOutline } from './flightOps/carrier';
import { JBD, catTracks, jbdRaise, launchPositions, skiJumpHeight, skiJumpProfile, stoppersUp } from './flightOps/launchDeck';

/** Point in polygon (ship frame a, c). */
function inside(poly: [number, number][], a: number, c: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ai, ci] = poly[i]!, [aj, cj] = poly[j]!;
    if ((ci > c) !== (cj > c) && a < ((aj - ai) * (c - ci)) / (cj - ci) + ai) hit = !hit;
  }
  return hit;
}

describe('launch deck render helpers (#27)', () => {
  it('draws the ski-jump on the sim curve: RAMP_M long, RAMP_DEG at the lip', () => {
    const p = skiJumpProfile(20);
    expect(p[0]).toEqual({ a: 0, h: 0 });
    expect(p[p.length - 1]!.a).toBeCloseTo(RAMP_M, 9);
    const lip = (skiJumpHeight(RAMP_M) - skiJumpHeight(RAMP_M - 0.01)) / 0.01;
    expect(Math.atan(lip) * 180 / Math.PI).toBeCloseTo(RAMP_DEG, 1);
    expect(skiJumpHeight(RAMP_M + 50)).toBe(skiJumpHeight(RAMP_M));
    // The Su-33 on the ramp sits on the drawn curve.
    const d = FLIGHT_OPS.su33;
    const s = createFlightOpsState('su33', 'skiJump', d, { station: 1 });
    const deck = s.pos.y;
    let checked = 0;
    for (let i = 0; i < 60 * 30 && s.launch!.stage !== 'settle' && s.launch!.stage !== 'free'; i++) {
      stepFlightOps(s, demoPilot(s, d), FLIGHT_OPS_DT, d);
      const into = shipFrame(s).a - (SHIP_HULL.kuznetsov.lengthM - RAMP_M);
      if (s.launch!.stage === 'stroke' && into > 1 && into < RAMP_M - 1) { expect(s.pos.y - deck).toBeCloseTo(skiJumpHeight(into), 1); checked++; }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('puts the catapult tracks under the held jets and the launch positions where the sim holds the Su-33', () => {
    for (const ac of ['fa18c', 'f14b'] as const) {
      for (const station of FLIGHT_OPS[ac].launch!.stations) {
        const f = shipFrame(createFlightOpsState(ac, 'catapult', FLIGHT_OPS[ac], { station }));
        const t = catTracks('cvn').find(x => x.station === station)!;
        expect(t.c).toBe(STATION_C.cvn[station]);
        expect(f.c).toBeCloseTo(t.c, 6);
        expect(f.a).toBeGreaterThan(t.a0);
        expect(f.a).toBeLessThan(t.a1);
      }
    }
    expect(catTracks('cvn')).toHaveLength(4);
    const poly = deckOutline('kuznetsov');
    for (const p of launchPositions('kuznetsov')) {
      if (FLIGHT_OPS.su33.launch!.stations.includes(p.station)) {
        const f = shipFrame(createFlightOpsState('su33', 'skiJump', FLIGHT_OPS.su33, { station: p.station }));
        expect(f.a).toBeCloseTo(p.a, 6);
        expect(f.c).toBeCloseTo(p.c, 6);
      }
      // Every position runs over the deck to the bow.
      expect(inside(poly, p.a, p.c)).toBe(true);
      expect(inside(poly, SHIP_HULL.kuznetsov.lengthM - 1, p.c)).toBe(true);
    }
    expect(launchPositions('kuznetsov').map(p => p.runM)).toEqual([90, 90, 180]);
  });

  it('raises the deflector while the jet is held and lowers it after the stroke; stoppers drop at the release', () => {
    expect(jbdRaise(null, 5)).toBe(0);
    expect(jbdRaise({ kind: 'catapult', stage: 'hold' }, 0)).toBe(0);
    expect(jbdRaise({ kind: 'catapult', stage: 'hold' }, JBD.raiseS / 2)).toBeCloseTo(0.5, 9);
    expect(jbdRaise({ kind: 'catapult', stage: 'stroke' }, 30)).toBe(1);
    expect(jbdRaise({ kind: 'catapult', stage: 'settle', endT: 30 }, 30)).toBe(1);
    expect(jbdRaise({ kind: 'catapult', stage: 'free', endT: 30 }, 30 + JBD.raiseS)).toBe(0);
    expect(jbdRaise({ kind: 'skiJump', stage: 'hold' }, 10)).toBe(0);
    const d = FLIGHT_OPS.su33;
    const s = createFlightOpsState('su33', 'skiJump', d);
    expect(stoppersUp(s.launch)).toBe(true);
    for (let i = 0; i < 60 * 20 && s.launch!.stage === 'hold'; i++) stepFlightOps(s, demoPilot(s, d), FLIGHT_OPS_DT, d);
    expect(stoppersUp(s.launch)).toBe(false);
    expect(stoppersUp(createFlightOpsState('fa18c', 'catapult', FLIGHT_OPS.fa18c).launch)).toBe(false);
  });
});
