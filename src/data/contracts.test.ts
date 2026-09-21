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

  it('distinguishes an unmodelled single-target scan mode from multi-target TWS', () => {
    expect(AIRCRAFT.m2000c.radar.singleTargetTws).toEqual({ label: 'PSID', maxTracks: 1, bars: 1, launchFromTws: false, modelled: false });
    expect(AIRCRAFT.m2000c.radar.tws).toBeNull();
    expect(AIRCRAFT.m2000c.radar.modes).not.toContain('tws');
    expect(AIRCRAFT.fa18c.radar.tws?.capConfidence).toBe('unpublished');
    expect(AIRCRAFT.f15c.radar.tws?.capConfidence).toBe('documented');
  });

  it('keeps approximate activation ranges and flare factors attached to their missile', () => {
    for (const m of Object.values(MISSILES)) {
      expect(m.pitbullApprox).toBe(m.pitbullKm !== undefined);
      expect(m.flareSusceptibility).toBeGreaterThanOrEqual(0);
      expect(m.flareSusceptibility).toBeLessThanOrEqual(1);
      expect(FLARE_SUSCEPTIBILITY[m.id]).toBe(m.flareSusceptibility);
      if (m.seeker !== 'ir') expect(m.flareSusceptibility).toBe(0);
    }
    expect(MISSILES.aim9x.flareSusceptibility).toBe(0.2);
    expect(MISSILES.magic2.flareSusceptibility).toBe(1);
  });
});
