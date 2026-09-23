import { describe, expect, it } from 'vitest';
import { RWRS } from './rwr';
import { SAMS, SAM_CAVEATS, SAM_ORDER, samForClass, samRwrSymbol } from './sams';
import { sourcesFor } from './sources';
import type { RwrId } from './types';

describe('SAM catalogue', () => {
  it('covers each RWR SAM class once with a sane envelope', () => {
    expect(SAM_ORDER.map(id => SAMS[id].rwrClass)).toEqual(['sam-long', 'sam-medium', 'sam-short']);
    for (const id of SAM_ORDER) {
      const s = SAMS[id];
      expect(samForClass(s.rwrClass)).toBe(id);
      expect(s.minRangeKm).toBeLessThan(s.threatRingKm);
      expect(s.minAltM).toBeLessThan(s.maxAltM);
      expect(s.defeat.length).toBeGreaterThan(0);
      expect(s.uncertain.length).toBeGreaterThan(0);
    }
    expect(SAMS.sa10.threatRingKm).toBeGreaterThan(SAMS.sa11.threatRingKm);
    expect(SAMS.sa11.threatRingKm).toBeGreaterThan(SAMS.sa15.threatRingKm);
    expect(SAM_CAVEATS.length).toBeGreaterThanOrEqual(SAM_ORDER.length);
  });

  it('reuses the RWR symbol tables', () => {
    for (const rwr of Object.keys(RWRS) as RwrId[]) {
      for (const id of SAM_ORDER) expect(samRwrSymbol(rwr, id)).not.toBe('');
    }
    expect(samRwrSymbol('alr67', 'sa10')).toBe('10');
    expect(samRwrSymbol('spo15', 'sa11')).toBe('Х');
    expect(samRwrSymbol('jf17rwr', 'sa15')).toBe('SA8');
  });

  it('cites sources', () => {
    expect(sourcesFor('sam').length).toBeGreaterThanOrEqual(3);
  });
});
