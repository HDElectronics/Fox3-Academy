// F/A-18C threats and lock from display text, checked against a recorded flight (fixtures/hornet-flight.json).
import { describe, expect, it } from 'vitest';
import fixture from './fixtures/hornet-flight.json';
import { parseDcsMessage, type DcsFrame } from '../dcs/protocol';
import { HornetLockTracker, HornetThreatTracker, alr67Names, hornetLock, hornetThreats, sayCode } from './hornetSensors';

// Fixture args are keyed by number; the export sends a<number>, so go through the real parser.
const at = (t: number): DcsFrame => {
  const s = fixture.snapshots.find(x => x.t === t)!;
  const raw = { ...s.frame, v: 1, args: Object.fromEntries(Object.entries(s.frame.args).map(([k, v]) => [`a${k}`, v])) };
  return parseDcsMessage(raw) as DcsFrame;
};

describe('Hornet display decode (recorded flight)', () => {
  it('names ALR-67 symbols from the app RWR table', () => {
    expect(alr67Names('29')).toEqual(expect.arrayContaining(['Su-27', 'MiG-29S']));
    expect(sayCode('29')).toBe('two niner');
  });

  it('reads the lock from the HUD and the attack format', () => {
    expect(hornetLock(at(31.1))).toMatchObject({ rangeNm: 31.3, closureKt: 870, inLar: false, targetAltFt: 19000, targetHeadingDeg: 83, tof: { label: 'ACT', s: 56 } });
    expect(hornetLock(at(87.1))).toMatchObject({ rangeNm: 19.2, closureKt: 850, inLar: true });
    const late = hornetLock(at(105.1))!;
    expect(late.missiles.length).toBeGreaterThan(0);
    expect(hornetLock(at(159.6))).toBeNull();
  });

  it('reads RWR threats, the AI lock and CW guidance', () => {
    expect(hornetThreats(at(159.6))).toMatchObject({ threats: [{ symbol: '29', locked: false }], ai: false, cw: false });
    expect(hornetThreats(at(165.6))).toMatchObject({ threats: [{ symbol: '29', locked: true }], ai: true });
    // The symbol blinks off the RWR during guidance; the HUD repeat keeps it.
    expect(hornetThreats(at(167.7))).toMatchObject({ threats: [{ symbol: '29' }], cw: true });
    expect(hornetThreats(at(139))!.threats).toHaveLength(2);
  });

  it('calls the engagement in order', () => {
    const th = new HornetThreatTracker();
    const lk = new HornetLockTracker();
    const said: string[] = [];
    for (const t of [31.1, 87.1, 101, 105.1, 139, 159.6, 165.6, 167.7]) {
      const f = at(t);
      for (const c of [...th.update(hornetThreats(f), t).calls, ...lk.update(hornetLock(f), f, t).calls]) said.push(c.say);
    }
    expect(said).toEqual(expect.arrayContaining(['New threat, two niner.', 'Locked, 31 miles, closing 870.', 'In LAR.', 'Spike, two niner.', 'Missile guiding. Defend.', 'Lock lost.']));
    expect(said.indexOf('Locked, 31 miles, closing 870.')).toBeLessThan(said.indexOf('In LAR.'));
    expect(said.indexOf('Spike, two niner.')).toBeLessThan(said.indexOf('Missile guiding. Defend.'));
  });

  it('calls Fox three on an AMRAAM leaving, not when the jet is hit', () => {
    const lk = new HornetLockTracker();
    const f = (counts: Record<string, number>): DcsFrame => ({ type: 'frame', seq: 1, allow: { ownship: true, sensor: true, object: true }, stores: { counts } });
    lk.update(null, f({ 'AIM-120C': 4, 'AIM-9X': 2, FPU_8A: 1 }), 0);
    expect(lk.update(null, f({ 'AIM-120C': 3, 'AIM-9X': 2, FPU_8A: 1 }), 1).calls.map(c => c.say)).toEqual(['Fox three.']);
    expect(lk.update(null, f({ 'AIM-9X': 1 }), 2).calls).toEqual([]);
  });

  it('calls pitbull once per missile', () => {
    const lk = new HornetLockTracker();
    const base = { rangeNm: 15, inLar: true, missiles: [] as { slot: number; ttgS?: number; active: boolean }[] };
    lk.update({ ...base, missiles: [{ slot: 1, ttgS: 4, active: false }] }, null, 0);
    expect(lk.update({ ...base, missiles: [{ slot: 1, active: true }] }, null, 1).calls.map(c => c.say)).toEqual(['Pitbull.']);
    expect(lk.update({ ...base, missiles: [{ slot: 1, active: true }] }, null, 2).calls).toEqual([]);
    expect(lk.update({ ...base, memory: 'MEM 7', missiles: [] }, null, 3).calls.map(c => c.say)).toEqual(['Memory. Re-lock.']);
  });
});
