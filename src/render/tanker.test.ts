import { describe, expect, it } from 'vitest';
import { TANKERS } from '../data/tankers';
import { basketRest } from '../sim/flightOps';
import { TANKER_LAYOUT, bandStripes, hoseMarkAt, hosePoints, rollPoint } from './flightOps/tanker';

describe('tanker render helpers (#28)', () => {
  it('paints the UPAZ bands by distance from the cone, so the mark at the pod is the band the pilot reads', () => {
    const bands = TANKERS.il78m.drogue!.bands.value;
    expect(hoseMarkAt(bands, 1)).toBeNull();
    expect(hoseMarkAt(bands, 8)).toBe('yellow');
    expect(hoseMarkAt(bands, 14)).toBe('yellowGreen');
    expect(hoseMarkAt(bands, 19)).toBe('green');
    expect(hoseMarkAt(bands, 23)).toBe('greenRed');
    expect(hoseMarkAt(bands, 25)).toBe('red');
    expect(bandStripes('yellowGreen')).toEqual(['caution', 'ok']);
    expect(bandStripes('greenRed')).toEqual(['ok', 'warning']);
    expect(bandStripes('red')).toEqual(['warning']);
  });

  it('runs the hose from the pod to the basket with a sag in the middle', () => {
    const T = TANKERS.il78m, pod = T.drogue!.pod, b = basketRest(T);
    const pts = hosePoints(pod, b, 10, 1);
    expect(pts[0]).toEqual(pod);
    expect(pts[10]!.aft).toBeCloseTo(b.aft, 9);
    expect(pts[10]!.up).toBeCloseTo(b.up, 9);
    expect(pts[5]!.up).toBeCloseTo((pod.up + b.up) / 2 - 1, 9);
  });

  it('rolls airframe points with the bank (right wing down for a right bank) and keeps the pods under the wings', () => {
    const p = rollPoint({ aft: 0, right: 10, up: 0 }, 20 * Math.PI / 180);
    expect(p.up).toBeLessThan(0);
    expect(Math.hypot(p.right, p.up)).toBeCloseTo(10, 9);
    for (const id of ['il78m', 'kc135mprs', 'kc130'] as const) {
      const pod = TANKERS[id].drogue!.pod, w = TANKER_LAYOUT[id].wing;
      expect(Math.abs(pod.right)).toBeLessThan(w.semi);
    }
    expect(TANKER_LAYOUT.kc135.boom).toBe(true);
  });
});
