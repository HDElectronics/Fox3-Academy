import { describe, expect, it } from 'vitest';
import type { DcsFrame } from '../dcs/protocol';
import { M_PER_NM } from '../sim/math';
import { LockTracker, ThreatTracker, aspectWord, clockOf, clockWords, lockOf, missileOf, rwrState, threatsOf } from './threats';

describe('RWR threats', () => {
  it('maps DCS signal types and clock positions', () => {
    expect(['scan', 'track_while_scan', 'lock', 'missile_radio_guided', undefined].map(rwrState)).toEqual(['search', 'track', 'lock', 'launch', 'search']);
    expect([0, 29, 90, 180, -90, -150, 359].map(clockOf)).toEqual([12, 1, 3, 6, 9, 7, 12]);
    expect(clockWords(3)).toBe("three o'clock");
  });

  it('sorts launches first and converts the azimuth', () => {
    const t = threatsOf([
      { id: 1, name: 'MiG-29S', signal: 'scan', az: 0 },
      { id: 2, name: 'Su-27', signal: 'missile_radio_guided', az: Math.PI / 2 },
      { id: 3, signal: 'lock', az: -Math.PI / 2 },
    ]);
    expect(t.map(x => [x.id, x.state, x.clock, x.name])).toEqual([[2, 'launch', 3, 'Su-27'], [3, 'lock', 9, 'Unknown'], [1, 'search', 12, 'MiG-29S']]);
  });

  it('calls a spike and a launch once per emitter, not searches', () => {
    const tr = new ThreatTracker();
    const step = (sig: string, t: number) => tr.update(threatsOf([{ id: 7, name: 'Su-27', signal: sig, az: Math.PI / 2 }]), t);
    expect(step('scan', 0).calls).toEqual([]);
    const spike = step('lock', 1);
    expect(spike.calls.map(c => c.say)).toEqual(["Spike, three o'clock, Su-27."]);
    expect(spike.active[0]).toMatchObject({ severity: 'caution', text: "SPIKE  3 O'CLOCK  SU-27" });
    expect(step('lock', 2).calls).toEqual([]);
    const launch = step('missile_radio_guided', 3);
    expect(launch.calls).toMatchObject([{ severity: 'warning', say: "Missile launch, three o'clock. Defend." }]);
    expect(step('missile_radio_guided', 4).calls).toEqual([]);
    expect(step('lock', 5).calls).toEqual([]); // a drop back to lock is not a new spike
    tr.update([], 6);
    expect(step('lock', 8).calls).toEqual([]); // gone 2 s: still remembered
    tr.update([], 9);
    tr.update([], 20);
    expect(step('lock', 21).calls).toHaveLength(1); // gone 12 s: new spike
  });
});

describe('radar lock picture', () => {
  // Own ship at the origin heading north at 7000 m, 250 m/s. DCS frame: x north, z east.
  const frame = (tg: Partial<NonNullable<DcsFrame['lock']>[number]>, sel = 'AIM-120C'): DcsFrame => ({
    type: 'frame', seq: 1, allow: { ownship: true, sensor: true, object: null },
    self: { name: 'FA-18C_hornet', x: 0, y: 7000, z: 0, hdg: 0, pitch: 0 }, tas: 250,
    stores: { counts: { 'AIM-120C': 4 }, sel },
    lock: [{ id: 9, name: 'Su-27', flags: 0x0008, closure: 500, ...tg }],
  });

  it('reads range, closure, bearing and aspect from the lock', () => {
    const hot = lockOf(frame({ dist: 40 * M_PER_NM, pos: { x: 40 * M_PER_NM, y: 7000, z: 0 }, vel: { x: -250, y: 0, z: 0 } }))!;
    expect(hot).toMatchObject({ name: 'Su-27', stt: true, aspect: 'HOT' });
    expect(hot.rangeNm).toBeCloseTo(40, 5);
    expect(hot.closureKt).toBeCloseTo(972, 0);
    expect(hot.relDeg).toBeCloseTo(0, 5);
    expect(hot.aspectDeg).toBeCloseTo(0, 5);
    expect(hot.altFt).toBeCloseTo(22966, 0);
    // Target due east (3 o'clock) flying north: beam.
    const beam = lockOf(frame({ dist: 20 * M_PER_NM, pos: { x: 0, y: 7000, z: 20 * M_PER_NM }, vel: { x: 250, y: 0, z: 0 } }))!;
    expect(beam.relDeg).toBeCloseTo(90, 5);
    expect(beam.aspect).toBe('BEAM');
    expect(lockOf({ ...frame({}), lock: [] })).toBeNull();
  });

  it('places the target in the selected missile launch zone', () => {
    const far = lockOf(frame({ dist: 60 * M_PER_NM, pos: { x: 60 * M_PER_NM, y: 7000, z: 0 }, vel: { x: -250, y: 0, z: 0 } }))!;
    expect(far.dlz).toMatchObject({ missile: 'aim120c', zone: 'out' });
    expect(far.dlz!.rmaxNm).toBeGreaterThan(far.dlz!.rneNm);
    const close = lockOf(frame({ dist: 12 * M_PER_NM, pos: { x: 12 * M_PER_NM, y: 7000, z: 0 }, vel: { x: -250, y: 0, z: 0 } }))!;
    expect(['in', 'no-escape']).toContain(close.dlz!.zone);
    expect(lockOf(frame({ dist: 12 * M_PER_NM, pos: { x: 12 * M_PER_NM, y: 7000, z: 0 }, vel: { x: -250, y: 0, z: 0 } }, 'Mk-82'))!.dlz).toBeUndefined();
  });

  it('names missiles and aspects', () => {
    expect(['AIM-120C', 'AIM-120B', 'AIM-7M', 'AIM-9X', 'AIM-9M', 'R-27ER', 'GBU-12', undefined].map(missileOf))
      .toEqual(['aim120c', 'aim120b', 'aim7m', 'aim9x', 'aim9m', 'r27er', undefined, undefined]);
    expect([10, 45, 90, 150].map(aspectWord)).toEqual(['HOT', 'FLANK', 'BEAM', 'DRAG']);
  });

  it('calls a new lock, the zones and a lost lock', () => {
    const tr = new LockTracker();
    const pic = (nm: number, zone: 'out' | 'in' | 'no-escape' | 'min') => ({
      name: 'Su-27', stt: true, jamming: false, rangeNm: nm, aspect: 'HOT' as const,
      dlz: { missile: 'aim120c' as const, rmaxNm: 30, rneNm: 15, rminNm: 1, zone },
    });
    expect(tr.update(pic(40, 'out'), 0).calls.map(c => c.say)).toEqual(['Locked, Su-27, 40 miles, hot.']);
    expect(tr.update(pic(35, 'out'), 1).calls).toEqual([]);
    expect(tr.update(pic(29, 'in'), 2).calls.map(c => c.say)).toEqual(['In range.']);
    expect(tr.update(pic(14, 'no-escape'), 3).calls.map(c => c.say)).toEqual(['No escape.']);
    expect(tr.update(null, 3.5).calls).toEqual([]); // a short dropout is not a lost lock
    expect(tr.update(null, 5).calls.map(c => c.say)).toEqual(['Lock lost.']);
    expect(tr.update(null, 6).calls).toEqual([]);
  });
});
