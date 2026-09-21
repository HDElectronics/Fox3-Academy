import { describe, expect, it } from 'vitest';
import { AIRCRAFT_ORDER } from '../../data/aircraft';
import { TwsLesson } from './drill';
import { resolveBinds } from './binds';
import { article, banditWhy, coachFor, detectWhy, endSummary, introFor, stepsFor } from './lesson';
import { MISSILES } from '../../data/missiles';
import { canLaunchSnp2 } from '../../sim/launch';
import { autopilotTick, newAutopilot } from './autopilot';

function fly(ac: (typeof AIRCRAFT_ORDER)[number], seconds = 300) {
  const L = new TwsLesson(ac);
  const ap = newAutopilot();
  const b = resolveBinds(ac);
  const steps = stepsFor(ac, b);
  const done = new Set<string>();
  const coach = new Set<string>();
  for (let i = 0; i < seconds * 10 && !L.ended; i++) {
    autopilotTick(L, ap);
    L.step(0.1);
    for (const s of steps) if (s.done(L)) done.add(s.id);
    if (i % 20 === 0) coach.add(coachFor(L, b).text);
    for (const x of L.bandits) {
      const why = banditWhy(L, x.id), m = L.missileOn(x.id);
      // "rides your beam" is only true of a semi-active missile.
      if (/rides your beam/.test(why)) expect(m && MISSILES[m.type].seeker, `${ac}: ${why}`).toBe('sarh');
      expect(why, ac).not.toMatch(/undefined|NaN/);
    }
  }
  return { L, steps, done, coach };
}

describe('tws lesson', () => {
  for (const ac of AIRCRAFT_ORDER) {
    it(`${ac}: the demo pilot finishes the checklist`, () => {
      const { L, steps, done, coach } = fly(ac);
      const missing = steps.filter(s => !done.has(s.id)).map(s => s.id);
      expect(missing, `${ac} coach:\n${[...coach].join('\n')}`).toEqual([]);
      expect(L.ended).not.toBeNull();
      const sum = endSummary(L);
      expect(sum.rows).toHaveLength(4);
      for (const t of coach) expect(t).not.toMatch(/!|undefined|NaN/);
    });
  }

  it('a TWS Fox 3 target hears search, not a lock, until pitbull (F-15C)', () => {
    const L = new TwsLesson('f15c');
    const ap = newAutopilot();
    let sawSearchWithMissile = false;
    for (let i = 0; i < 2000 && !L.ended; i++) {
      autopilotTick(L, ap);
      L.step(0.1);
      for (const b of L.bandits) {
        const s = L.banditState(b.id), m = L.missileOn(b.id);
        if (m && m.guidance === 'datalink') {
          expect(['search', 'quiet']).toContain(s);
          if (s === 'search') sawSearchWithMissile = true;
        }
      }
    }
    expect(sawSearchWithMissile).toBe(true);
  });

  it('an R-27ER target hears lock then launch (Su-27)', () => {
    const L = new TwsLesson('su27');
    const ap = newAutopilot();
    const seen = new Set<string>();
    for (let i = 0; i < 2000 && !L.ended; i++) {
      autopilotTick(L, ap);
      L.step(0.1);
      for (const b of L.bandits) seen.add(L.banditState(b.id));
    }
    expect(seen.has('lock')).toBe(true);
    expect(seen.has('launch')).toBe(true);
    const lead = [...L.banditLog.values()].find(l => l.lead !== null)?.lead ?? 0;
    expect(lead).toBeGreaterThan(20);
  });

  it('a bandit that notches loses your track and the coach says why (F-15C)', () => {
    const L = new TwsLesson('f15c');
    const b = resolveBinds('f15c');
    L.setMode('tws');
    for (let i = 0; i < 60; i++) L.step(0.1);
    const id = L.me.radar.tracks.find(t => t.firm)?.targetId;
    expect(id).toBeTruthy();
    if (!id) return;
    L.act(id);
    L.toggleNotch(id);
    let said = false, dropped = false;
    for (let i = 0; i < 400; i++) {
      L.step(0.1);
      if (/beaming you/.test(coachFor(L, b).text)) said = true;
      if (!L.me.radar.tracks.some(t => t.targetId === id)) dropped = true;
    }
    expect(said).toBe(true);
    expect(dropped).toBe(true);
    // His RWR still hears you while he is in your notch.
    expect(['search', 'quiet']).toContain(L.banditState(id));
  });

  it('search explanations use the selected units and include shared detection reasons', () => {
    const metric = new TwsLesson('f15c', { units: 'metric' });
    const imperial = new TwsLesson('f15c', { units: 'imperial' });
    for (const lesson of [metric, imperial]) {
      const target = lesson.bandits[0];
      target.pos.copy(lesson.me.pos).add({ x: 0, y: 0, z: -500000 });
      expect(detectWhy(lesson, target.id)).toContain('Beyond detection range:');
    }
    expect(detectWhy(metric, metric.bandits[0].id)).toContain('km');
    expect(detectWhy(imperial, imperial.bandits[0].id)).toContain('nm');
  });

  it('refuses TWS on the M-2000C in plain words', () => {
    const L = new TwsLesson('m2000c');
    expect(L.setMode('tws')).toMatch(/No TWS/);
    expect(L.me.radar.mode).toBe('rws');
  });

  it('keeps one designation in the MiG-29S СНП and two in СНП2', () => {
    const L = new TwsLesson('mig29s');
    L.setMode('tws');
    for (let i = 0; i < 900; i++) L.step(0.1);
    const firm = L.me.radar.tracks.filter(t => t.firm).map(t => t.targetId);
    expect(firm.length).toBeGreaterThanOrEqual(2);
    L.act(firm[0]); L.act(firm[1]);
    expect(L.me.radar.designated.length).toBe(1);
  });

  it('FC3 Russian СНП: the cursor snaps to a firm track and designates it; Enter on it then locks (Su-27)', () => {
    const L = new TwsLesson('su27');
    L.setMode('tws');
    for (let i = 0; i < 1200 && !L.me.radar.tracks.some(t => t.firm); i++) L.step(0.1);
    const firm = L.me.radar.tracks.find(t => t.firm);
    expect(firm).toBeTruthy();
    if (!firm) return;
    L.hooked = firm.targetId;
    expect(L.cursorSnap(L.hooked)).toBeNull();
    expect(L.me.radar.designated).toEqual([firm.targetId]);
    expect(L.me.radar.mode).toBe('tws');
    // A second snap on the same track does nothing; Enter (act) on it forces the early lock.
    L.cursorSnap(firm.targetId);
    expect(L.me.radar.mode).toBe('tws');
    const r = L.act(firm.targetId);
    if (r === null) expect(L.me.radar.mode).toBe('stt');
    else expect(r).toMatch(/Cannot lock/);
  });

  it('the cursor does not designate on its own in jets without the FC3 snap (F-15C)', () => {
    const L = new TwsLesson('f15c');
    L.setMode('tws');
    for (let i = 0; i < 1200 && !L.me.radar.tracks.some(t => t.firm); i++) L.step(0.1);
    const firm = L.me.radar.tracks.find(t => t.firm);
    expect(firm).toBeTruthy();
    L.cursorSnap(firm?.targetId ?? null);
    expect(L.me.radar.designated).toEqual([]);
  });

  it('MiG-29S: the demo pilot fires one СНП2 salvo per pair, never a second pair at the same targets', () => {
    const { L } = fly('mig29s');
    const snp2 = L.flags.shots.filter(s => s.mode === 'snp2').map(s => s.targetId);
    expect(snp2.length).toBeGreaterThanOrEqual(2);
    expect(new Set(snp2).size).toBe(snp2.length);
  });

  it('СНП2 with no R-77s left says so, not "select 77"', () => {
    const L = new TwsLesson('mig29s');
    L.me.stores.r77 = 0;
    L.me.selectedWeapon = 'r73';
    L.setMode('snp2');
    for (let i = 0; i < 900 && L.me.radar.designated.length < 2; i++) {
      L.step(0.1);
      const firm = L.me.radar.tracks.filter(t => t.firm);
      if (!L.me.radar.designated.length && firm.length) L.act(firm[0].targetId);
    }
    if (L.me.radar.designated.length >= 2) expect(canLaunchSnp2(L.world, L.me).reason).toMatch(/needs two R-77s/);
  });

  it('writes a and an the way a pilot says them', () => {
    expect(article('F-15C')).toBe('an');
    expect(article('AIM-120C')).toBe('an');
    expect(article('SD-10')).toBe('an');
    expect(article('R-77')).toBe('an');
    expect(article('M-2000C')).toBe('an');
    expect(article('Su-27')).toBe('a');
    expect(article('MiG-29S')).toBe('a');
    expect(article('J-11A')).toBe('a');
    expect(article('JF-17')).toBe('a');
    expect(article('Super 530D')).toBe('a');
    for (const ac of AIRCRAFT_ORDER) expect(introFor(ac).lede, ac).not.toMatch(/\ba [AEIO]|\ba [FHLMNRSX]-/);
  });

  it('a crank puts the group about 50° off the nose and slows the closure (Su-27)', () => {
    const straight = new TwsLesson('su27'), crank = new TwsLesson('su27');
    crank.setSteer('right');
    for (let i = 0; i < 600; i++) { straight.step(0.1); crank.step(0.1); }
    const near = (L: TwsLesson) => Math.min(...L.bandits.map(b => L.rangeTo(b.id)));
    expect(near(crank)).toBeGreaterThan(near(straight) + 2000);
    const c = crank.bandits.reduce((v, b) => v.add(b.pos), crank.me.pos.clone().multiplyScalar(0)).divideScalar(4);
    const off = Math.abs(bearingOff(crank, c));
    expect(off).toBeGreaterThan(crank.crankDeg - 8);
    expect(off).toBeLessThan(crank.crankDeg + 8);
    crank.reset();
    expect(crank.steer).toBe('straight');
  });
});

function bearingOff(L: TwsLesson, p: import('three').Vector3): number {
  const dx = p.x - L.me.pos.x, dz = p.z - L.me.pos.z;
  const brg = Math.atan2(dx, -dz);
  let d = (brg - L.me.heading) * 180 / Math.PI;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}
