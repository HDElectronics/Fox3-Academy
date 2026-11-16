import { describe, expect, it } from 'vitest';
import { AIRCRAFT_ORDER } from '../data/aircraft';
import { pathProgress } from '../pages/progress/model';
import { fixtureReader } from './progressFixture';

describe('dev progress fixtures', () => {
  it('knows start, mid and complete, and nothing else', () => {
    expect(fixtureReader(null)).toBeNull();
    expect(fixtureReader('everything')).toBeNull();
    for (const id of AIRCRAFT_ORDER) expect(pathProgress(id, fixtureReader('start')!).status.doneCount, id).toBe(0);
  });
  it('mid: three fighter steps done, the attack jets\' cockpit page done', () => {
    const mid = fixtureReader('mid')!;
    expect(pathProgress('su27', mid).status).toMatchObject({ doneCount: 3, complete: false });
    expect(pathProgress('su27', mid).status.next.label).toBe('Defense');
    expect(pathProgress('su25t', mid).status).toMatchObject({ doneCount: 1, total: 2 });
    expect(pathProgress('a10c', mid).status).toMatchObject({ doneCount: 1, total: 2 });
    expect(mid('sortie:su27:setup')).toBeUndefined();
  });
  it('complete: every step and sortie done, scores and saved setups left alone', () => {
    const all = fixtureReader('complete')!;
    for (const id of AIRCRAFT_ORDER) {
      const p = pathProgress(id, all);
      expect(p.status.complete, id).toBe(true);
      expect(p.fly.done, id).toBe(true);
    }
    expect(all('sortie:f15c:best')).toBeUndefined();
    expect(all('sortie:f15c:setup')).toBeUndefined();
    expect(all('merge:corner:f15c')).toBeUndefined();
  });
});
