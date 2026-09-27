import { describe, expect, it } from 'vitest';
import { AIRCRAFT, AIRCRAFT_CAVEATS, ATTACK_ORDER, FIGHTER_ORDER } from './aircraft';
import { MISSILES, FLARE_SUSCEPTIBILITY } from './missiles';
import { AG_CAVEATS, AG_LOADOUTS, AG_WEAPONS, AG_WEAPON_ORDER, GUN_ROUNDS } from './agWeapons';
import { RWRS, RWR_CAVEATS } from './rwr';
import { sourcesFor } from './sources';
import { PROCEDURES } from './procedures';

describe('data contracts', () => {
  it('attributes both Su-25T laser limits to the manual while retaining the game caveat', () => {
    const laser = AIRCRAFT_CAVEATS.su25t.find(note => note.includes('laser'));
    expect(laser).toMatch(/manual.*1 minute.*continuous.*p\. 57.*20 minutes total per flight.*p\. 32/);
    expect(laser).toContain('separate limits');
    expect(laser).toContain('current-game behavior is not verified');
    expect(laser).not.toMatch(/conflict/i);
  });
  it('labels the recoverable A-G laser heat model as simplified and not verified', () => {
    const laser = AG_CAVEATS.find(note => note.startsWith('Laser'));
    expect(laser).toMatch(/1 minute.*continuous.*20 minutes total per flight/);
    expect(laser).toMatch(/simplified.*20.minute.*heat threshold.*recovery.*not verified/);
    expect(laser).not.toContain('implements the S1 rule');
  });
  it('keeps known keyboard defaults explicit and uncertain defaults absent', () => {
    const bind = (ac: keyof typeof PROCEDURES, action: RegExp) => PROCEDURES[ac].binds.find(b => action.test(b.action));
    expect(bind('f16c', /^FCR as sensor/)?.keyboard).toBe('RAlt + .');
    expect(bind('fa18c', /^TDC to/)?.keyboard).toBe('RAlt + /');
    expect(bind('fa18c', /^Cursor/)?.keyboard).toBe('; . , /');
    expect(bind('f14b', /^Launch/)?.keyboard).toBeNull();
    expect(bind('jf17', /^Countermeasures/)?.keyboard).toBeNull();
    expect(bind('f15c', /^Remove one TWS/)?.keyboard).toBeNull();
    for (const ac of FIGHTER_ORDER) for (const b of PROCEDURES[ac].binds) {
      expect(b.note ?? '', `${ac}: ${b.action}`).not.toMatch(/^Keyboard:/);
      expect(['radar', 'weapons', 'defence']).toContain(b.group);
      expect(b.keyboard === null || b.keyboard.length > 0).toBe(true);
    }
  });

  it('gives every attack jet loadouts of known stores, a gun load and procedures', () => {
    expect(ATTACK_ORDER).toEqual(['su25t', 'a10c']);
    const nonWeapons = ['l081', 'r60', 'r73', 'tgp', 'aim9m'];
    for (const ac of ATTACK_ORDER) {
      expect(AIRCRAFT[ac].role).toBe('attack');
      expect(AG_LOADOUTS[ac].length, ac).toBeGreaterThan(0);
      expect(GUN_ROUNDS[ac]).toBeGreaterThan(0);
      expect(PROCEDURES[ac].procedures.length, ac).toBeGreaterThan(0);
      expect(sourcesFor(ac).length, ac).toBeGreaterThan(0);
      for (const lo of AG_LOADOUTS[ac]) for (const st of lo.stations) {
        expect(st.station).toBeGreaterThanOrEqual(1);
        expect(st.station).toBeLessThanOrEqual(11);
        expect(nonWeapons.includes(st.weapon) || st.weapon in AG_WEAPONS, `${ac}/${lo.id}: ${st.weapon}`).toBe(true);
      }
    }
    expect(new Set(AG_WEAPON_ORDER)).toEqual(new Set(Object.keys(AG_WEAPONS)));
  });

  it('keeps the A-10C II laser-spot stores on code 1688 and its unverified keys out of the keyboard field', () => {
    for (const w of Object.values(AG_WEAPONS)) {
      expect(w.defaultLaserCode === 1688, w.id).toBe(w.guidance === 'laser-spot');
      if (w.guidance === 'laser-spot') expect(w.needsLaser, w.id).toBe(false); // the spot may come from the JTAC
    }
    expect(AG_LOADOUTS.a10c.every(lo => lo.stations.some(st => st.weapon === 'tgp'))).toBe(true);
    const bind = (action: RegExp) => PROCEDURES.a10c.binds.find(b => action.test(b.action));
    expect(bind(/^Weapon release/)?.keyboard).toBeNull();
    expect(bind(/^Weapon release/)?.note).toMatch(/RAlt \+ Space.*not verified/);
    expect(bind(/^Fire the gun/)?.keyboard).toBeNull();
    expect(bind(/^Fire the laser/)?.keyboard).toBe('Insert');
    expect(bind(/^Master mode/)?.keyboard).toBe('M');
    expect(bind(/^Set SPI/)?.keyboard).toBe('LCtrl + Up');
  });

  it('describes the ALR-69 for the A-10C II with its caveats', () => {
    expect(AIRCRAFT.a10c.rwr).toBe('alr69');
    expect(RWRS.alr69.aircraft).toEqual(['a10c']);
    expect(RWR_CAVEATS.alr69.length).toBeGreaterThan(0);
    expect(sourcesFor('alr69').length).toBeGreaterThan(0);
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
