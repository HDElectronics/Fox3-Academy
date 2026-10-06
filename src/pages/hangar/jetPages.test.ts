import { describe, expect, it } from 'vitest';
import { FIGHTER_ORDER } from '../../data/aircraft';
import { jetProgress } from '../progress/model';
import { jetPages, nextJetGoal } from './jetPages';

const none = () => undefined;

describe('Learn cards for a jet\'s own pages', () => {
  it('gives the F/A-18C its HARM and ATFLIR pages and the other fighters none', () => {
    expect(jetPages('fa18c', none).map(p => p.path)).toEqual(['harm', 'atflir']);
    for (const id of FIGHTER_ORDER.filter(x => x !== 'fa18c')) expect(jetPages(id, none), id).toEqual([]);
  });

  it('lists the attack jets\' cockpit page, then CAS & JTAC', () => {
    expect(jetPages('su25t', none).map(p => p.path)).toEqual(['strike', 'cas']);
    expect(jetPages('a10c', none).map(p => p.path)).toEqual(['tgp', 'cas']);
  });

  it('counts the same goals as the progress page, page by page', () => {
    for (const id of ['su25t', 'a10c', 'fa18c'] as const) {
      const pages = jetPages(id, none);
      const progress = jetProgress(id, none).goals.filter(g => pages.some(p => g.href.startsWith(`#/${p.path}?`)));
      expect(pages.reduce((n, p) => n + p.goals.length, 0), id).toBe(progress.length);
      for (const p of pages) expect(p.goals.length, `${id} ${p.path}`).toBeGreaterThan(0);
    }
  });

  it('continues with the first goal left, moving on when a page is done', () => {
    const start = nextJetGoal(jetPages('su25t', none))!;
    expect(start.page.path).toBe('strike');
    expect(start.goal.href).toMatch(/^#\/strike\?lesson=/);
    // Every Shkval & Vikhr lesson done: Continue moves to CAS & JTAC.
    const strikeDone = (key: string) => (key.startsWith('strike:') ? true : undefined);
    const next = nextJetGoal(jetPages('su25t', strikeDone))!;
    expect(next.page.path).toBe('cas');
    expect(jetPages('su25t', strikeDone)[0]!.done).toBe(jetPages('su25t', strikeDone)[0]!.goals.length);
  });
});
