import { describe, expect, it } from 'vitest';
import { AIRCRAFT } from '../data/aircraft';
import { jetNameParts, jetNamePattern, jetNameTokens } from './jetName';

const jets = (text: string) => (jetNameParts(text) ?? []).filter(p => p.jet).map(p => p.text);

describe('jet names in prose', () => {
  it('reduces hyphenated names to base designations and keeps named variants', () => {
    const t = jetNameTokens(['Su-27S Flanker-B', 'Su-27', 'F/A-18C Hornet Lot 20', 'Mirage 2000C', 'M-2000C']);
    expect(t).toEqual(expect.arrayContaining(['Su-27', 'Flanker-B', 'F/A-18', 'M-2000']));
    expect(t).not.toContain('Mirage');
    expect(t.length).toBe(4);
  });

  it('finds every jet short name', () => {
    for (const spec of Object.values(AIRCRAFT)) {
      if (!spec.short.includes('-')) continue;
      expect(jets(`In the ${spec.short}, lock him.`)).toEqual([spec.short]);
    }
  });

  it('wraps variants, plurals and possessives without eating the rest', () => {
    expect(jets('Two MiG-29Ss and the Su-27S Flanker-B.')).toEqual(['MiG-29Ss', 'Su-27S', 'Flanker-B']);
    expect(jetNameParts("The F/A-18C's radar")).toEqual([
      { text: 'The ', jet: false }, { text: 'F/A-18C', jet: true }, { text: "'s radar", jet: false },
    ]);
    expect(jets('JF-17 vs M-2000C')).toEqual(['JF-17', 'M-2000C']);
  });

  it('keeps the text intact when joined back', () => {
    const s = 'Fight AI with the Su-27\'s rules: R-27ER from STT, then the F-15C.';
    expect((jetNameParts(s) ?? []).map(p => p.text).join('')).toBe(s);
  });

  it('ignores text with no jet name and designations embedded in other words', () => {
    expect(jetNameParts('No Fox 3 here')).toBeNull();
    expect(jetNameParts('R-27ER and AIM-120C')).toBeNull();
    const re = jetNamePattern(['F-16']);
    expect(jetNameParts('XF-16 and F-16C', re)).toEqual([
      { text: 'XF-16 and ', jet: false }, { text: 'F-16C', jet: true },
    ]);
  });
});
