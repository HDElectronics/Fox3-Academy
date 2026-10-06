import { describe, it, expect } from 'vitest';
import { LaserCodeEntry } from './codeEntry';
describe('laser UFC entry', () => {
  it('requires selecting an option, then commits only on ENT', () => {
    const u = new LaserCodeEntry(); u.open('LTDC'); u.key('1'); expect(u.digits).toBe('');
    u.key('OPT1'); for (const k of ['1','6','8','8'] as const) expect(u.key(k)).toBeNull();
    expect(u.key('ENT')).toEqual({ source: 'LTDC', code: '1688' });
  });
  it('separates bomb entry and clears stale input on page changes', () => {
    const u = new LaserCodeEntry(); u.open('LTDC'); u.key('OPT1'); u.key('1'); u.open('CODE');
    expect(u.digits).toBe(''); expect(u.selected).toBe(false); u.key('OPT1');
    for (const k of ['1','6','8','7'] as const) u.key(k);
    expect(u.key('ENT')).toEqual({ source: 'CODE', code: '1687' });
  });
  it('rejects incomplete or unsupported exercise codes without changing settings', () => {
    const u = new LaserCodeEntry(); u.open('CODE'); u.key('OPT1'); u.key('1'); expect(u.key('ENT')).toBeNull();
    u.key('CLR'); expect(u.digits).toBe('');
  });
});
