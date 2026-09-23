/** [OWNER: displays] Gun sight mapping per jet and the sight picture geometry (pure). */
import { describe, expect, it } from 'vitest';
import { World } from '../../sim/world';
import type { AircraftId } from '../../data/types';
import { AIRCRAFT_ORDER } from '../../data/aircraft';
import { buildGunSight, hudAngles, noLockOptions, sightStyleFor } from './gunSightModel';

function pair(type: AircraftId, range: number) {
  const w = new World(3);
  w.record = false;
  const me = w.spawnAircraft({ side: 'blue', type, controller: 'script', pos: { x: 0, y: 5000, z: 0 }, heading: 0, speed: 220 });
  const tgt = w.spawnAircraft({ side: 'red', type: 'su27', controller: 'script', pos: { x: 0, y: 5000, z: -range }, heading: 0, speed: 220 });
  return { w, me, tgt };
}

describe('gun sight style per jet', () => {
  const expected: Record<AircraftId, [string, string]> = {
    su27: ['funnel', 'lcos'], su33: ['funnel', 'lcos'], j11a: ['funnel', 'lcos'], mig29s: ['funnel', 'lcos'],
    f15c: ['lcos', 'range-reticle'], fa18c: ['hornet-funnel', 'hornet-director'], f16c: ['eegs-funnel', 'eegs-pipper'],
    f14b: ['rtgs', 'rtgs-track'], jf17: ['ss', 'lcos'], m2000c: ['cclt', 'cclt'],
  };
  for (const id of AIRCRAFT_ORDER) {
    it(`${id}: no lock and lock sights match the data`, () => {
      expect(sightStyleFor(id, false)?.kind).toBe(expected[id][0]);
      expect(sightStyleFor(id, true)?.kind).toBe(expected[id][1]);
    });
  }
  it('JF-17 can pick SSLC without a lock; other jets ignore a foreign pick', () => {
    expect(noLockOptions('jf17')).toEqual(['ss', 'sslc']);
    expect(sightStyleFor('jf17', false, 'sslc')?.kind).toBe('sslc');
    expect(sightStyleFor('f16c', false, 'sslc')?.kind).toBe('eegs-funnel');
    expect(sightStyleFor('jf17', true, 'sslc')?.kind).toBe('lcos');
  });
  it('unverified F-16C sights carry verified: false', () => {
    expect(sightStyleFor('f16c', false)?.verified).toBe(false);
    expect(sightStyleFor('fa18c', true)?.verified).toBe(true);
  });
  it('jets without gun data get no sight', () => {
    expect(sightStyleFor('nope', false)).toBeNull();
  });
});

describe('gun sight picture', () => {
  it('a target dead ahead sits on the boresight and is in solution on a straight co-flying line', () => {
    const { me, tgt } = pair('f15c', 600);
    const a = hudAngles(me, tgt.pos);
    expect(a.ahead).toBe(true);
    expect(Math.abs(a.right)).toBeLessThan(1e-6);
    expect(Math.abs(a.up)).toBeLessThan(1e-6);
    const p = buildGunSight(me, tgt, { locked: true })!;
    expect(p.style.kind).toBe('range-reticle');
    expect(p.range).toBeCloseTo(600, 0);
    expect(p.inRange).toBe(true);
    expect(p.inSolution).toBe(true);
    expect(p.rounds).toBe(940);
  });
  it('FC3 funnel runs from its near to far range; the Russian LCOS range scale is 1200 m', () => {
    const { me, tgt } = pair('su27', 900);
    const f = buildGunSight(me, tgt, { locked: false })!;
    expect(f.funnel.length).toBe(9);
    expect(f.funnel[0]!.range).toBeCloseTo(200);
    expect(f.funnel[8]!.range).toBeCloseTo(1200);
    expect(f.range).toBeNull();
    const l = buildGunSight(me, tgt, { locked: true })!;
    expect(l.arcFullM).toBe(1200);
    expect(l.pipper!.range).toBeCloseTo(900, 0);
  });
  it('Hornet funnel has 1000 and 2000 ft cues; the director shows SHOOT on a small predicted miss', () => {
    const { me, tgt } = pair('fa18c', 500);
    const f = buildGunSight(me, tgt, { locked: false })!;
    expect(f.marks.map(m => Math.round(m.range / 0.3048))).toEqual([1000, 2000]);
    const d = buildGunSight(me, tgt, { locked: true })!;
    expect(d.shoot).toBe(true);
    tgt.pos.x += 30;                                    // 30 m off the line: predicted miss well over 30 ft
    expect(buildGunSight(me, tgt, { locked: true, prevShoot: true })!.shoot).toBe(false);
  });
  it('M-2000C tracer line runs to 1000 m with marks at 300 and 600 m; F-14 diamond at 2000 ft', () => {
    const m = buildGunSight(pair('m2000c', 700).me, null, { locked: false })!;
    expect(m.funnel.at(-1)!.range).toBe(1000);
    expect(m.marks.map(x => x.range)).toEqual([300, 600]);
    const t = buildGunSight(pair('f14b', 700).me, null, { locked: false })!;
    expect(Math.round(t.pipper!.range / 0.3048)).toBe(1000);
    expect(Math.round(t.diamond!.range / 0.3048)).toBe(2000);
  });
  it('in a pull the sight points sit below the gun line (lead against the turn)', () => {
    const { w, me } = pair('f16c', 600);
    me.cmd.bfm = { bank: 0, g: 6, throttle: 'ab' };
    for (let i = 0; i < 90; i++) w.step(1 / 60);
    const p = buildGunSight(me, null, { locked: false })!;
    expect(p.funnel.at(-1)!.up).toBeLessThan(p.funnel[0]!.up);
    expect(p.funnel.at(-1)!.up).toBeLessThan(0);
  });
});
