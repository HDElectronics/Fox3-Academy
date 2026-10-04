// The ALIC appendix (ED guide pp420-422) as the page stores it, and the PB explainer's outcomes, against the page's
// own data and sim rules.
import { describe, expect, it } from 'vitest';
import { AIRBORNE, AIR_DEFENCE, NAVAL } from './appendix';
import { ALIC_TABLE, SYSTEMS, SYSTEM_ORDER } from './data';
import { pbOutcome } from './pbExplain';
import { HarmSim } from './sim';

describe('ALIC appendix', () => {
  it('has unique codes and every page radar with the same symbol and class', () => {
    const ids = [...AIR_DEFENCE, ...NAVAL].map(r => r.id).filter((x): x is number => x !== null);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of SYSTEM_ORDER) for (const r of SYSTEMS[id].radars) {
      expect(AIR_DEFENCE.find(row => row.id === r.alic), `${r.name}`).toMatchObject({ rwr: r.rwr, cls: r.cls });
    }
    for (const r of ALIC_TABLE) expect(AIR_DEFENCE.find(row => row.id === r.alic), r.radar).toMatchObject({ rwr: r.rwr, cls: r.cls });
  });

  it('keeps the guide layout: Eastern land radars 1xx, Western 2xx, ships 3xx and 4xx', () => {
    const east = AIR_DEFENCE.filter(r => /SA-|ZSU|S-60|CSA|PPRU/.test(`${r.nato} ${r.system}`) && r.id !== null);
    expect(east.every(r => r.id! >= 100 && r.id! < 200)).toBe(true);
    expect(AIR_DEFENCE.filter(r => /Hawk|Patriot|NASAMS|Vulcan|Roland|Gepard/.test(r.nato) && r.id !== null).every(r => r.id! >= 200 && r.id! < 300)).toBe(true);
    expect(NAVAL.filter(r => r.id !== null).every(r => r.id! >= 300 && r.id! < 500)).toBe(true);
    expect(AIRBORNE.length).toBe(28);
  });
});

describe('PB explainer outcomes match the sim', () => {
  it('107 picks the Snow Drift, 115 a Fire Dome, 108 finds nothing at an SA-11', () => {
    expect(pbOutcome(107).hit?.rwr).toBe('SD');
    expect(pbOutcome(115).hit?.rwr).toBe('11');
    expect(pbOutcome(119).hit?.rwr).toBe('15');
    expect(pbOutcome(108).hit).toBeNull();
    // Same rule in the sim: a PB shot with code 115 at the Snow Drift's point homes on a Fire Dome.
    const sim = new HarmSim({ jet: { x: 0, z: 0, altFt: 25000, headingDeg: 0, speedKt: 450 }, sites: [{ id: 's', name: 's', system: 'sa11', at: { x: 0, z: -20 * 1852 } }] });
    sim.launchPb({ ...sim.sites[0]!.vehicles[0]!.pos }, 115, 'HRM');
    for (let i = 0; i < 3000 && !sim.events.some(e => e.type === 'harm-kill' || e.type === 'harm-miss'); i++) sim.step(0.05);
    expect(sim.events.find(e => e.type === 'harm-kill')).toMatchObject({ vehicle: 'sa11-telar' });
  });
});
