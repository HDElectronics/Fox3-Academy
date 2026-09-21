import { describe, expect, it } from 'vitest';
import { AIRCRAFT, AIRCRAFT_ORDER } from './aircraft';
import { MISSILES, FLARE_SUSCEPTIBILITY } from './missiles';
import { PROCEDURES } from './procedures';

describe('data contracts', () => {
  it('keeps known keyboard defaults explicit and uncertain defaults absent', () => {
    const bind = (ac: keyof typeof PROCEDURES, action: RegExp) => PROCEDURES[ac].binds.find(b => action.test(b.action));
    expect(bind('f16c', /^FCR as sensor/)?.keyboard).toBe('RAlt + .');
    expect(bind('fa18c', /^TDC to/)?.keyboard).toBe('RAlt + /');
    expect(bind('fa18c', /^Cursor/)?.keyboard).toBe('; . , /');
    expect(bind('f14b', /^Launch/)?.keyboard).toBeNull();
    expect(bind('jf17', /^Countermeasures/)?.keyboard).toBeNull();
    expect(bind('f15c', /^Remove one TWS/)?.keyboard).toBeNull();
    for (const ac of AIRCRAFT_ORDER) for (const b of PROCEDURES[ac].binds) {
      expect(b.note ?? '', `${ac}: ${b.action}`).not.toMatch(/^Keyboard:/);
      expect(['radar', 'weapons', 'defence']).toContain(b.group);
      expect(b.keyboard === null || b.keyboard.length > 0).toBe(true);
    }
  });

});
