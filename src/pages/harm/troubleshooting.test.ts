import { describe, expect, it } from 'vitest';
import { HarmAvionics } from './avionics';
import { HarmSim, bearingDeg } from './sim';
import { TROUBLE_CASES, TROUBLE_ORDER, troubleComplete, troubleId, troubleProgressKey, type TroubleId } from './troubleshooting';

function setup(id: TroubleId) {
  const exercise = TROUBLE_CASES[id];
  const def = exercise.lesson.setup!();
  const sim = new HarmSim(def.sim);
  const av = new HarmAvionics(sim, def.waypoints(id => sim.sites.find(s => s.id === id)!.vehicles[0]!.pos));
  exercise.prepare(av);
  return { sim, av };
}
function run(av: HarmAvionics, seconds: number, stop = () => false) {
  for (let i = 0; i < seconds * 30 && !stop(); i++) { av.sim.step(1 / 30); av.update(); }
}
function releasePb(av: HarmAvionics) {
  av.setRelease(true);
  av.sim.jet.pitchCmd = 1;
  run(av, 6, () => av.launches > 0);
  av.sim.jet.pitchCmd = 0;
  av.setRelease(false);
  expect(av.launches).toBe(1);
}
function expectKill(av: HarmAvionics, vehicle: string) {
  run(av, 150, () => av.sim.events.some(e => e.type === 'harm-kill'));
  expect(av.sim.events).toContainEqual(expect.objectContaining({ type: 'harm-kill', vehicle }));
  expect(av.sim.jet.alive).toBe(true);
}

describe('HARM troubleshooting', () => {
  it('requires a TOO hand-off before release and can then complete', () => {
    const { av } = setup('handoff');
    expect(av.formatView().status).toBe('STBY');
    expect(av.tooBox()?.emitter.radar.rwr).toBe('6');
    expect(av.setRelease(true)?.ok).toBe(false);
    av.setRelease(false);
    expect(av.cage().ok).toBe(true);
    expect(av.formatView().status).toBe('RDY');
    expect(av.setRelease(true)?.ok).toBe(true);
    expectKill(av, 'sa6-str');
  });

  it('accepts the wrong PB code but misses unless it is corrected', () => {
    const wrong = setup('code').av;
    expect(wrong.ready()).toBe(true);
    releasePb(wrong);
    run(wrong, 180);
    expect(wrong.sim.events).toContainEqual(expect.objectContaining({ type: 'harm-miss', reason: 'no-emitter' }));
    const { av } = setup('code');
    av.osb(14); av.ufcKey('OPT4');
    for (const k of ['1', '0', '7', 'ENT'] as const) av.ufcKey(k);
    releasePb(av);
    expectKill(av, 'sa11-sr');
  });

  it('needs a fresh WPDSG after stepping away from the wrong PB waypoint', () => {
    const wrong = setup('waypoint').av;
    wrong.sim.jet.headingRad = bearingDeg(wrong.sim.jet.pos, wrong.designatedPoint()!.pos) * Math.PI / 180;
    releasePb(wrong);
    run(wrong, 180);
    expect(wrong.sim.events).toContainEqual(expect.objectContaining({ type: 'harm-miss', reason: 'no-emitter' }));
    const { av } = setup('waypoint');
    expect(av.designatedPoint()?.name).toBe('WP3 empty ground');
    av.selectWaypoint(1);
    expect(av.designatedPoint()).toBeNull();
    expect(av.setRelease(true)?.ok).toBe(false);
    av.setRelease(false);
    av.wpdsg();
    releasePb(av);
    expectKill(av, 'sa11-sr');
  });

  it('waits out the scripted silence and hits with a fresh SP shot', () => {
    const { av, sim } = setup('silent');
    expect(av.launches).toBe(1);
    expect(sim.harms[0]!.lost).toBe(true);
    expect(av.spCue()).toBeNull();
    expect(av.setRelease(true)?.ok).toBe(false);
    av.setRelease(false);
    run(av, 31, () => av.spCue() !== null);
    expect(av.spCue()?.emitter.radar.rwr).toBe('6');
    expect(av.setRelease(true)?.ok).toBe(true);
    expectKill(av, 'sa6-str');
    expect(av.launches).toBe(2);
  });

  it('spends the last HARM on the assigned target after manual selection', () => {
    const { av } = setup('last');
    expect(av.stations).toEqual([3]);
    expect(av.spCue()?.emitter.radar.rwr).toBe('8');
    av.sequence();
    expect(av.spCue()?.emitter.radar.rwr).toBe('6');
    expect(av.setRelease(true)?.ok).toBe(true);
    expect(av.stations).toHaveLength(0);
    expectKill(av, 'sa6-str');
  });

  it('cannot recover a wasted last weapon without restarting the case', () => {
    const { av } = setup('last');
    av.setRelease(true); av.setRelease(false);
    expectKill(av, 'sa8');
    expect(av.setRelease(true)?.ok).toBe(false);
    expect(av.sim.events.some(e => e.type === 'harm-kill' && e.vehicle === 'sa6-str')).toBe(false);
    expect(setup('last').av.stations).toEqual([3]);
  });

  it('requires all five saved cases and safely defaults unknown deep links', () => {
    const saved = new Map<string, boolean>();
    expect(troubleComplete(k => saved.get(k))).toBe(false);
    for (const id of TROUBLE_ORDER.slice(0, -1)) saved.set(troubleProgressKey(id), true);
    expect(troubleComplete(k => saved.get(k))).toBe(false);
    saved.set(troubleProgressKey('last'), true);
    expect(troubleComplete(k => saved.get(k))).toBe(true);
    expect(troubleId('waypoint')).toBe('waypoint');
    expect(troubleId('bad')).toBe('handoff');
    expect(troubleId(null)).toBe('handoff');
  });
});
