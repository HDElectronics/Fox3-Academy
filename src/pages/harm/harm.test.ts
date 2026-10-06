// HARM page logic: the page-local sim and the Hornet HARM avionics (SP, TOO, PB, Pullback, UFC), against the rules in
// docs/research/fa18c-harm.md.
import { describe, expect, it } from 'vitest';
import { HarmSim, bearingDeg, type SimSetup } from './sim';
import { HarmAvionics, inClass, pbCues, pbRanges, threatOrder } from './avionics';
import { ALIC_TABLE, HARM_STATIONS, SYSTEMS, SYSTEM_ORDER } from './data';
import { LESSONS } from './lessons';
import { CLASS_OSB } from './types';

const NM = 1852;
/** Jet at the origin heading north (−z) at 25000 ft; sites placed `nm` ahead (north) and `eastNm` to the side. */
function setup(sites: { id: string; system: SimSetup['sites'][number]['system']; nm: number; eastNm?: number; live?: boolean; evades?: boolean }[]): SimSetup {
  return {
    jet: { x: 0, z: 0, altFt: 25000, headingDeg: 0, speedKt: 450 },
    sites: sites.map(s => ({ id: s.id, name: s.id, system: s.system, at: { x: (s.eastNm ?? 0) * NM, z: -s.nm * NM }, live: s.live, evades: s.evades })),
  };
}
function run(sim: HarmSim, av: HarmAvionics | null, seconds: number, until?: () => boolean): void {
  for (let i = 0; i < seconds * 20; i++) {
    sim.step(0.05);
    av?.update();
    if (until?.()) return;
  }
}
const ready = (av: HarmAvionics) => { av.toggleMasterArm(); av.setMaster('AG'); return av.osb(6); };
const types = (sim: HarmSim) => sim.events.map(e => e.type);

describe('data', () => {
  it('every system radar has its code in the ALIC table, and the stations fire 8, 2, 7, 3', () => {
    for (const id of SYSTEM_ORDER) for (const r of SYSTEMS[id].radars) {
      expect(ALIC_TABLE.find(row => row.alic === r.alic)?.rwr).toBe(r.rwr);
    }
    expect(HARM_STATIONS).toEqual([8, 2, 7, 3]);
    expect(new Set(Object.values(CLASS_OSB)).size).toBe(15);
  });

  it('PB ranges grow with altitude and the A/C pull-up reaches further', () => {
    const lo = pbRanges(15000), hi = pbRanges(30000);
    expect(hi.hrm).toBeGreaterThan(lo.hrm);
    expect(hi.ac).toBeGreaterThan(hi.hrm);
    // Release cues: the A/C cue is high at long range and comes down as you close; the HARM cue stays low.
    expect(pbCues(45, 25000).ac).toBeGreaterThan(pbCues(15, 25000).ac);
    expect(pbCues(30, 25000).hrm).toBeLessThan(11);
    expect(pbCues(30, 25000).min).toBeNull();
    expect(pbCues(6, 25000).min).not.toBeNull();
  });
});

describe('SP', () => {
  it('cues the only emitter, launches on release and kills the Straight Flush', () => {
    const sim = new HarmSim(setup([{ id: 'r1', system: 'sa6', nm: 25 }]));
    const av = new HarmAvionics(sim, []);
    expect(av.setRelease(true)?.ok).toBe(false); // SAFE
    av.setRelease(false);
    expect(ready(av).ok).toBe(true);
    expect(av.page).toBe('HARM');
    expect(av.spCue()?.emitter.radar.rwr).toBe('6');
    expect(av.formatView().weapon.crossed).toBe(false);
    const r = av.setRelease(true)!;
    expect(r.ok).toBe(true);
    expect(av.station).toBe(2); // 8 went first
    run(sim, av, 120, () => types(sim).includes('harm-kill'));
    expect(types(sim)).toContain('harm-kill');
    expect(sim.sites[0]!.vehicles[0]!.alive).toBe(false);
    expect(av.contacts()).toHaveLength(0); // a dead radar is silent
  });

  it('misses when the radar switches off during the flight (guide p367)', () => {
    const sim = new HarmSim(setup([{ id: 'r1', system: 'sa6', nm: 25 }]));
    const av = new HarmAvionics(sim, []);
    ready(av);
    av.setRelease(true);
    run(sim, av, 10);
    sim.sites[0]!.active = false;
    run(sim, av, 120, () => types(sim).includes('harm-miss'));
    expect(types(sim)).toContain('harm-lost');
    expect(sim.events.find(e => e.type === 'harm-miss')).toMatchObject({ reason: 'lost' });
    expect(sim.sites[0]!.vehicles[0]!.alive).toBe(true);
  });

  it('a site that evades goes quiet when the HARM closes', () => {
    const sim = new HarmSim(setup([{ id: 'r1', system: 'sa6', nm: 25, evades: true }]));
    const av = new HarmAvionics(sim, []);
    ready(av);
    av.setRelease(true);
    run(sim, av, 120, () => types(sim).includes('harm-miss') || types(sim).includes('harm-kill'));
    expect(types(sim)).toContain('radar-quiet');
    expect(types(sim)).not.toContain('harm-kill');
  });
});

describe('Live SEAD retry', () => {
  it.each(['SP', 'TOO'] as const)('kills the SA-6 with a second %s shot after its shutdown', mode => {
    const lesson = LESSONS.live.setup!();
    const sim = new HarmSim(lesson.sim);
    const av = new HarmAvionics(sim, lesson.waypoints(id => sim.sites.find(s => s.id === id)!.vehicles[0]!.pos));
    const radar = sim.emitters().find(e => e.site.id === 'sa6')!;
    ready(av);
    if (mode === 'TOO') { av.osb(4); av.tdcToHarm(); }
    const fire = () => {
      if (mode === 'TOO') expect(av.cage().ok).toBe(true);
      expect(av.setRelease(true)?.ok).toBe(true);
      av.setRelease(false);
    };
    fire();
    run(sim, av, 150, () => types(sim).includes('harm-lost'));
    expect(types(sim)).toContain('radar-quiet');
    expect(sim.harms[0]!.lost).toBe(true);
    run(sim, av, 50, () => sim.transmitting(radar));
    expect(sim.transmitting(radar)).toBe(true);
    fire();
    run(sim, av, 120, () => !radar.vehicle.alive);
    expect(radar.vehicle.alive).toBe(false);
    expect(sim.events.filter(e => e.type === 'radar-quiet' && e.siteId === 'sa6')).toHaveLength(1);
    expect(av.launches).toBe(2);

    // Finish the actual Live setup with the two remaining HARMs in PB.
    const snowDrift = sim.emitters().find(e => e.vehicle.id === 'sa11-sr')!;
    av.osb(3);
    av.osb(14);
    av.ufcKey('OPT4');
    for (const key of ['1', '0', '7', 'ENT'] as const) av.ufcKey(key);
    av.selectWaypoint(1);
    av.wpdsg();
    const firePb = () => {
      sim.jet.turnCmd = 0;
      sim.jet.headingRad = bearingDeg(sim.jet.pos, snowDrift.vehicle.pos) * Math.PI / 180;
      sim.jet.pitchRad = av.pbState()!.cue! * Math.PI / 180;
      expect(av.setRelease(true)?.ok).toBe(true);
      av.setRelease(false);
      // Orbit while the weapon flies to keep the test pilot outside the launch zone.
      sim.jet.turnCmd = 1;
    };
    firePb();
    run(sim, av, 150, () => sim.harms[2]!.lost);
    expect(sim.harms[2]!.lost).toBe(true);
    run(sim, av, 50, () => sim.transmitting(snowDrift));
    expect(sim.transmitting(snowDrift)).toBe(true);
    firePb();
    run(sim, av, 180, () => !snowDrift.vehicle.alive);
    expect(snowDrift.vehicle.alive).toBe(false);
    expect(sim.jet.alive).toBe(true);
    expect(av.launches).toBe(4);
    expect(av.stations).toHaveLength(0);
    expect(sim.events.filter(e => e.type === 'radar-quiet')).toHaveLength(2);
    expect(new HarmSim(lesson.sim).sites.every(s => !s.evaded)).toBe(true);
  });
});

describe('TOO', () => {
  const pair = () => new HarmSim(setup([{ id: 'sa8', system: 'sa8', nm: 14, eastNm: -1 }, { id: 'sa15', system: 'sa15', nm: 12, eastNm: 1.5 }]));

  it('needs the TDC, filters by class, hands off and kills the chosen radar', () => {
    const sim = pair();
    const av = new HarmAvionics(sim, []);
    ready(av);
    av.osb(4);
    expect(av.mode).toBe('TOO');
    expect(av.formatView().too!.targets.map(t => t.label).sort()).toEqual(['15', '8']);
    expect(av.cage().ok).toBe(false); // no TDC yet
    av.tdcToHarm();
    av.osb(11);
    expect(av.page).toBe('CLASS');
    expect(av.formatView().classPage!.detected).toEqual(expect.arrayContaining(['H1', 'H2']));
    av.osb(CLASS_OSB.H2);
    expect(av.page).toBe('HARM');
    expect(av.formatView().too!.targets.map(t => t.label)).toEqual(['15']);
    expect(av.formatView().status).toBe('STBY');
    expect(av.setRelease(true)!.ok).toBe(false);
    av.setRelease(false);
    expect(av.cage().ok).toBe(true);
    const v = av.formatView();
    expect(v.status).toBe('RDY');
    expect(v.weapon.crossed).toBe(false);
    expect(v.too!.targets[0]).toMatchObject({ label: '15', boxed: true, hoff: true });
    expect(av.setRelease(true)!.ok).toBe(true);
    run(sim, av, 90, () => types(sim).includes('harm-kill'));
    expect(sim.events.find(e => e.type === 'harm-kill')).toMatchObject({ vehicle: 'sa15' });
  });

  it('HARM Sequence moves the box and Cage/Uncage again cancels the hand-off', () => {
    const sim = pair();
    const av = new HarmAvionics(sim, []);
    ready(av);
    av.osb(4);
    av.tdcToHarm();
    const first = av.tooBox()!.key;
    av.sequence();
    expect(av.tooBox()!.key).not.toBe(first);
    av.cage();
    expect(av.handoffKey).not.toBeNull();
    expect(av.formatView().too!.targets).toHaveLength(1);
    av.cage();
    expect(av.handoffKey).toBeNull();
    expect(av.formatView().too!.targets).toHaveLength(2);
  });

  it('explains in clean text (no mis-encoded degree signs)', () => {
    const sim = pair();
    const av = new HarmAvionics(sim, []);
    ready(av);
    const too = av.osb(4).text;
    av.osb(3);
    const ac = av.osb(2).text;
    expect(too).toContain('30° field of view');
    expect(ac).toContain('45° nose up');
    expect(too + ac).not.toMatch(/Â|â€|Ã/);
  });

  it('class membership and threat order', () => {
    const sim = pair();
    const cs = sim.contacts();
    expect(cs.filter(c => inClass(c, 'H1')).map(c => c.emitter.radar.rwr)).toEqual(['8']);
    expect(cs.filter(c => inClass(c, 'PRI'))).toHaveLength(0);
    expect([...cs].sort(threatOrder)[0]!.emitter.radar.rwr).toBe('15'); // nearer
  });
});

describe('PB', () => {
  function pbSetup(code: string) {
    const sim = new HarmSim(setup([{ id: 'r3', system: 'sa11', nm: 32 }]));
    const sr = sim.sites[0]!.vehicles[0]!.pos;
    const av = new HarmAvionics(sim, [{ name: 'WP4', pos: { ...sr } }]);
    ready(av);
    av.osb(3);
    expect(av.formatView().weapon.crossed).toBe(true); // no code yet (p374)
    av.osb(14);
    expect(av.ufcKey('5').ok).toBe(false); // option not selected
    av.ufcKey('OPT4');
    for (const d of code) av.ufcKey(d as '1');
    const ent = av.ufcKey('ENT');
    av.osb(1); // HRM pull-up
    av.wpdsg();
    return { sim, av, ent };
  }

  it('code 107 on the Snow Drift: holds until the cue, launches, finds the radar and kills it', () => {
    const { sim, av, ent } = pbSetup('107');
    expect(ent.text).toMatch(/Snow Drift/);
    expect(av.formatView().pb).toMatchObject({ code: 107, inRange: 'HRM RNG', pullup: 'HRM' });
    expect(av.formatView().weapon.crossed).toBe(false);
    const press = av.setRelease(true)!;
    expect(press.ok).toBe(false); // nose not on the cue yet
    expect(av.releaseHeld).toBe(true);
    const cue = av.pbState()!.cue!;
    sim.jet.pitchCmd = 1;
    run(sim, av, 5, () => av.launches > 0);
    expect(sim.jet.pitchRad * 180 / Math.PI).toBeGreaterThanOrEqual(cue - 0.6);
    expect(av.launches).toBe(1);
    sim.jet.pitchCmd = 0;
    run(sim, av, 150, () => types(sim).includes('harm-kill') || types(sim).includes('harm-miss'));
    expect(types(sim)).toContain('harm-acquire');
    expect(sim.events.find(e => e.type === 'harm-kill')).toMatchObject({ vehicle: 'sa11-sr' });
  });

  it('a code with no matching radar at the point misses', () => {
    const { sim, av } = pbSetup('999');
    av.setRelease(true);
    sim.jet.pitchCmd = 1;
    run(sim, av, 5, () => av.launches > 0);
    sim.jet.pitchCmd = 0;
    run(sim, av, 150, () => types(sim).includes('harm-miss'));
    expect(sim.events.find(e => e.type === 'harm-miss')).toMatchObject({ reason: 'no-emitter' });
  });

  it('refuses outside the steering line', () => {
    const { sim, av } = pbSetup('107');
    sim.jet.headingRad = 20 * Math.PI / 180;
    av.setRelease(true);
    sim.jet.pitchCmd = 1;
    run(sim, av, 5);
    expect(av.launches).toBe(0);
  });
});

describe('Pullback', () => {
  it('PLBK while inhibited, HARM once HRM OVRD is unboxed; the kill takes their missile\'s guidance', () => {
    const sim = new HarmSim(setup([{ id: 'r1', system: 'sa6', nm: 13, live: true }]));
    const av = new HarmAvionics(sim, []);
    av.toggleMasterArm();
    av.setMaster('AA'); // Pullback works in any master mode (p367)
    run(sim, av, 8, () => types(sim).includes('sam-launch'));
    expect(av.pullbackLabel()).toBe('PLBK');
    expect(av.ewView().lamps.ai).toBe(true);
    av.osb(16);
    expect(av.hrmOvrd).toBe(false);
    expect(av.pullbackLabel()).toBe('HARM');
    expect(av.setRelease(true)!.ok).toBe(true);
    run(sim, av, 60, () => types(sim).includes('harm-kill') || !sim.jet.alive);
    expect(types(sim)).toContain('harm-kill');
    if (types(sim).includes('sam-launch')) expect(types(sim)).toContain('sam-miss');
    expect(sim.jet.alive).toBe(true);
  });

  it('crossed out with Master Arm SAFE', () => {
    const sim = new HarmSim(setup([{ id: 'r1', system: 'sa6', nm: 13, live: true }]));
    const av = new HarmAvionics(sim, []);
    av.osb(16);
    run(sim, av, 1);
    expect(av.pullbackLabel()).toBe('HARM-X');
    expect(av.setRelease(true)!.ok).toBe(false);
  });
});
