import { describe, expect, it } from 'vitest';
import { appliesInPlace, referenceQuery, sectionFromParam, sectionParam } from './sections';

const FIGHTER = ['ref-binds', 'ref-procs', 'ref-radar', 'ref-missiles', 'ref-jets', 'ref-rwr', 'ref-glossary', 'ref-sources'];
const ATTACK = ['ref-binds', 'ref-procs', 'ref-rwr', 'ref-glossary', 'ref-sources'];

describe('reference URL state', () => {
  it('names a section by its short form', () => {
    expect(sectionParam('ref-missiles')).toBe('missiles');
    expect(sectionParam('missiles')).toBe('missiles');
  });

  it('reads ?go= in short or full form, only for sections this jet renders', () => {
    expect(sectionFromParam('missiles', FIGHTER)).toBe('ref-missiles');
    expect(sectionFromParam('ref-rwr', FIGHTER)).toBe('ref-rwr');
    expect(sectionFromParam(' glossary ', FIGHTER)).toBe('ref-glossary');
    // An attack jet has no radar or missile tables: a link to them opens the top of the page.
    expect(sectionFromParam('radar', ATTACK)).toBeNull();
    expect(sectionFromParam('nope', FIGHTER)).toBeNull();
    expect(sectionFromParam('', FIGHTER)).toBeNull();
    expect(sectionFromParam(null, FIGHTER)).toBeNull();
  });

  it('writes the section in view and the filter, keeping other params in place', () => {
    const base = new URLSearchParams('x=1&go=radar&q=old');
    expect(referenceQuery(base, { q: ' notch ', section: 'ref-missiles', first: 'ref-binds' })).toBe('x=1&go=missiles&q=notch');
    // The first section is the top of the page: no ?go=. An empty filter drops ?q=.
    expect(referenceQuery(base, { q: '', section: 'ref-binds', first: 'ref-binds' })).toBe('x=1');
    expect(referenceQuery(new URLSearchParams(), { q: 'R-77', section: 'ref-sources', first: 'ref-binds' })).toBe('q=R-77&go=sources');
    expect(referenceQuery(new URLSearchParams(), { q: '', section: null, first: null })).toBe('');
  });

  it('applies ?go= and ?q= in place; one-shot params remount', () => {
    expect(appliesInPlace(new URLSearchParams('go=rwr&q=notch'))).toBe(true);
    expect(appliesInPlace(new URLSearchParams(''))).toBe(true);
    for (const k of ['ac=f15c', 'shot=missiles', 'open=r77', 'proc=bvr']) {
      expect(appliesInPlace(new URLSearchParams('go=rwr&' + k))).toBe(false);
    }
  });
});
