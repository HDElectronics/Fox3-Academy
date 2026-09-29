import { describe, expect, it } from 'vitest';
import { buildCasScenario, bearingDeg, type CasLessonId, type CasScenario } from './scenario';
import { lineText, makeNineLine, markFor } from './nineLine';
import { JtacController, type AimState, type JtacAction } from './jtac';
import { A10cHotas, LONG_PRESS_S, type HotasHost } from './a10cHotas';
import { a10cAim, casSnap } from './snap';
import { A10C_LESSON_ORDER, CAS_LESSON_ORDER, lessonOrder, lessonsFor, progressKey, LESSONS, type CasSnap } from './lessons';

const LOG: string[] = [];

function setup(lesson: CasLessonId, opts: { aim?: () => AimState } = {}) {
  const sc = buildCasScenario(lesson, 11, { jet: 'a10c' });
  const nl = makeNineLine(sc, markFor('a10c', lesson));
  let hotas!: A10cHotas;
  const j = new JtacController(sc.world, sc, nl, {
    aim: () => (opts.aim ? opts.aim() : a10cAim(sc, hotas.spiSource)), pilot: 'Hawg 1', datalink: true, weapons: 'GBU-12',
  });
  const host: HotasHost = {
    world: () => sc.world, me: () => sc.me, jtac: () => j, steerpoint: () => sc.ip, targets: () => sc.targets,
    friendlies: () => [{ id: sc.jtac, label: 'JTAC' }], log: t => { LOG.push(t); }, canFire: () => true,
  };
  hotas = new A10cHotas(host);
  hotas.reset();
  sc.world.tgpPower(sc.me.id, true);
  const done = new Set<string>();
  const run = (sec: number, stop: () => boolean = () => false) => {
    for (let i = 0; i < sec * 30 && !stop(); i++) {
      sc.world.step(1 / 30); j.step(); hotas.step(1 / 30);
      // The page samples the checklist every tick.
      stepsDone(lesson, snap(), done);
    }
  };
  const wait = (s: JtacController['state']) => { run(120, () => !j.busy && j.state === s); expect(j.state).toBe(s); };
  const act = (a: JtacAction) => { expect(j.act(a)).toBe(true); };
  const snap = (): CasSnap => casSnap({ sc, jtac: j, aim: a10cAim(sc, hotas.spiSource), menuOpen: false, cardPassed: false, impacts: {}, milestones: hotas.milestones });
  return { sc, j, hotas, run, wait, act, snap, done };
}

function steerAtTarget(sc: CasScenario) {
  sc.me.heading = sc.me.cmd.heading = (bearingDeg(sc.me.pos, sc.target) * Math.PI) / 180;
}

/** Run the lesson checklist as the page does: steps complete in order, each once. */
function stepsDone(lesson: CasLessonId, s: CasSnap, done: Set<string>): Set<string> {
  for (const st of lessonsFor('a10c')[lesson].steps) {
    if (done.has(st.id)) continue;
    if (!st.check(s)) break;
    done.add(st.id);
  }
  return done;
}

describe('A-10C II scenario and brief', () => {
  it('spawns the A-10C II with a pod loadout and briefs the laser with code 1688', () => {
    const { sc } = setup('jtac-laser');
    expect(sc.me.type).toBe('a10c');
    expect(sc.me.ag!.tgp).not.toBeNull();
    expect(sc.me.ag!.stores.gbu12).toBe(2);
    const nl = makeNineLine(sc, 'laser');
    expect(nl.laserCode).toBe(1688);
    expect(lineText(nl, 'mark')).toBe('Laser, code 1688');
    expect(nl.remarks).toContain('Laser code 1688');
    expect(nl.remarks[0]).toMatch(/GBU-12/);
  });

  it('keeps the Su-25T on smoke and its own lesson list', () => {
    expect(markFor('su25t', 'sortie')).toBe('wp');
    expect(lessonOrder('su25t')).toEqual(CAS_LESSON_ORDER);
    expect(lessonsFor('su25t')).toBe(LESSONS);
    expect(buildCasScenario('talk-on').me.type).toBe('su25t');
    expect(lessonOrder('a10c')).toEqual(A10C_LESSON_ORDER);
    expect(progressKey('digital', 'a10c')).toBe('cas:digital:a10c');
    expect(A10C_LESSON_ORDER.every(id => lessonsFor('a10c')[id].steps.length > 0)).toBe(true);
    // The Su-25T texts are untouched; the A-10C II texts drop the Shkval.
    expect(LESSONS['talk-on'].steps[3]!.text).toMatch(/Shkval/);
    expect(lessonsFor('a10c')['talk-on'].steps[3]!.text).not.toMatch(/Shkval/);
  });
});

describe('JTAC laser hand-off', () => {
  it('Laser On lases the target with its code, Shift moves the spot, Terminate ends it', () => {
    const { sc, j, wait, act } = setup('jtac-laser');
    j.state = 'await-ip';
    expect(j.allowed()).not.toContain('laser-on');
    act('ip-inbound'); wait('inbound');
    expect(j.allowed()).toContain('laser-on');
    const menu = j.menu().find(n => n.fkey === 4)!.children![0]!.children!;
    expect(menu.find(n => n.action === 'laser-on')!.disabled).toBeFalsy();
    act('laser-on'); wait('lasing');
    expect(j.calls.at(-1)!.text).toBe('Lasing, code 1688.');
    const m = sc.world.marks.get(j.laserId!)!;
    expect(m).toMatchObject({ type: 'laser', code: 1688, followUnitId: sc.targets[0], ownerId: sc.jtac, alive: true });
    act('shift'); wait('lasing');
    expect(j.laserId).toBe(m.id);
    expect(m.followUnitId).toBe(sc.targets[1]);
    const t2 = sc.world.groundUnits.get(sc.targets[1]!)!.pos;
    expect(Math.hypot(m.pos.x - t2.x, m.pos.z - t2.z)).toBeLessThan(1);
    act('terminate'); wait('inbound');
    expect(m.alive).toBe(false);
    expect(j.laserId).toBeNull();
    // Laser On again after Terminate.
    act('laser-on'); wait('lasing');
    act('spot'); wait('talk-on');
    expect(j.allowed()).toContain('in');
  });

  it('the Su-25T flow never offers Laser On', () => {
    const sc = buildCasScenario('talk-on');
    const j = new JtacController(sc.world, sc, makeNineLine(sc), { aim: () => ({ kind: 'none' }) });
    j.state = 'inbound';
    expect(j.allowed()).not.toContain('laser-on');
  });
});

describe('digital 9-line', () => {
  it('readback → Standby for data → NEW TASKING → WILCO → cleared to engage → Attack Complete', () => {
    const { j, wait, act, run } = setup('digital');
    j.state = 'readback';
    act('readback');
    run(30, () => !!j.tasking);
    const calls = j.calls.filter(c => c.from === 'jtac');
    expect(calls.at(-1)).toMatchObject({ text: 'Standby for data.', verified: true });
    expect(j.state).toBe('data');
    expect(j.tasking).toMatchObject({ state: 'new', newShown: true });
    expect(j.tasking!.lines[6]!.value).toBe('None');
    // Coordinates only: nothing to call until WILCO; the menu shows Attack Complete, disabled.
    const items = j.menu().find(n => n.fkey === 4)!.children![0]!.children!;
    expect(items.find(n => n.action === 'attack-complete')!.disabled).toBe(true);
    j.clearNewTasking();
    expect(j.tasking!.newShown).toBe(false);
    expect(j.wilco()).toBe(true);
    expect(j.wilco()).toBe(false);
    wait('cleared');
    expect(j.calls.at(-1)!.text).toBe('Hawg 1, cleared to engage.');
    expect(j.allowed()).toContain('attack-complete');
    act('attack-complete'); run(5);
    expect(j.attacks).toBe(1);
    expect(j.state).toBe('cleared');
  });

  it('CNTCO removes the triangle and the trainer JTAC sends the data again', () => {
    const { j, act, run } = setup('digital');
    j.state = 'readback';
    act('readback'); run(30, () => !!j.tasking);
    expect(j.cntco()).toBe(true);
    expect(j.tasking!.state).toBe('cntco');
    run(10, () => j.tasking!.state === 'new');
    expect(j.tasking!.state).toBe('new');
  });

  it('hooks the triangle on the TAD and makes it the SPI with a long TMS press only', () => {
    const { sc, j, hotas, act, run } = setup('digital');
    j.state = 'readback';
    act('readback'); run(30, () => !!j.tasking);
    j.wilco();
    // Coolie Left Long: the TAD becomes the SOI only after 1 s.
    hotas.press('coolieL'); hotas.step(LONG_PRESS_S / 2);
    expect(hotas.soi).toBe('hud');
    hotas.step(LONG_PRESS_S); hotas.release('coolieL');
    expect(hotas.soi).toBe('tad');
    const tk = j.tasking!;
    hotas.cursor = { x: tk.pos.x + 150, z: tk.pos.z };
    hotas.tap('tmsF');
    expect(hotas.hooked).toBe('tasking');
    // A short press on TMS Forward does not set the SPI.
    hotas.press('tmsF'); hotas.step(0.3); hotas.release('tmsF');
    expect(sc.me.ag!.spi).toBeNull();
    hotas.press('tmsF'); hotas.step(LONG_PRESS_S + 0.1); hotas.release('tmsF');
    expect(sc.me.ag!.spi!.x).toBeCloseTo(tk.pos.x);
    expect(hotas.spiSource).toBe('tasking');
    expect([...hotas.milestones]).toEqual(expect.arrayContaining(['hook-tasking', 'spi-tasking']));
    // China Hat Forward Long: the pod looks at the SPI.
    hotas.tap('coolieR', true);
    hotas.tap('chF', true);
    expect(Math.hypot(sc.me.ag!.tgp!.aim.x - tk.pos.x, sc.me.ag!.tgp!.aim.z - tk.pos.z)).toBeLessThan(1);
    expect(hotas.milestones.has('slave')).toBe(true);
    // The triangle is coordinates: no clearance from it alone.
    expect(a10cAim(sc, hotas.spiSource).kind).toBe('none');
  });

  it('completes the digital lesson steps from sim snapshots and kills a tank with a GBU-12 on the own laser', () => {
    const { sc, j, hotas, act, run, snap, done } = setup('digital');
    const w = sc.world, id = sc.me.id;
    j.state = 'readback';
    hotas.setMaster('CCRP');
    w.selectAgWeapon(id, 'gbu12');
    act('readback'); run(30, () => !!j.tasking);
    stepsDone('digital', snap(), done);
    expect([...done]).toEqual(['readback']);
    j.wilco(); run(3);
    hotas.tap('coolieL', true);
    hotas.cursor = { ...j.tasking!.pos };
    hotas.tap('tmsF'); hotas.tap('tmsF', true);
    hotas.tap('coolieR', true); hotas.tap('chF', true);
    const tank = w.groundUnits.get(sc.targets[1]!)!;
    w.tgpPointAt(id, tank.pos);
    hotas.tap('tmsF');
    expect(sc.me.ag!.tgp!.track).toBe('point');
    hotas.tap('tmsF', true);
    run(0.2);
    stepsDone('digital', snap(), done);
    expect([...done]).toEqual(['readback', 'wilco', 'hook', 'spi', 'slave', 'track', 'spi-tgp']);
    expect(j.state).toBe('cleared');
    steerAtTarget(sc);
    run(90, () => w.canAgLaunch(id).ok);
    expect(w.canAgLaunch(id).reason).toBe('');
    hotas.tap('coolieU');
    expect(hotas.releaseWeapon()).toBe(true);
    hotas.setLaserHeld(true);
    run(60, () => ![...w.agWeapons.values()].some(x => x.alive));
    hotas.setLaserHeld(false); run(0.1);
    expect(tank.alive).toBe(false);
    act('attack-complete'); run(4);
    stepsDone('digital', snap(), done);
    expect(done.size).toBe(lessonsFor('a10c').digital.steps.length);
    expect(j.violations).toEqual([]);
  });
});

describe('A-10C II e2e: JTAC lases, LSS finds the spot, GBU-12 kills the target', () => {
  it('flies the jtac-laser lesson with the checklist and clearance', () => {
    const { sc, j, hotas, wait, act, run, snap, done } = setup('jtac-laser');
    const w = sc.world, id = sc.me.id;
    // Past the brief: the digital 9-line accepted, its triangle is the SPI (as the page starts the lesson).
    j.state = 'await-ip';
    j.presetTasking();
    sc.me.ag!.spi = w.groundUnits.get(sc.targets[1]!)!.pos.clone().set(j.tasking!.pos.x, sc.groundM, j.tasking!.pos.z);
    hotas.spiSource = 'tasking';
    hotas.setMaster('CCRP');
    w.selectAgWeapon(id, 'gbu12');
    steerAtTarget(sc);

    act('ip-inbound'); wait('inbound');
    act('laser-on'); wait('lasing');
    hotas.tap('coolieR', true);
    hotas.tap('chF', true);
    hotas.toggleLss();
    expect(sc.me.ag!.tgp!.lss).toBe('search');
    run(5, () => sc.me.ag!.tgp!.lss === 'track');
    expect(sc.me.ag!.tgp!.lss).toBe('track');
    const spot = w.marks.get(j.laserId!)!;
    expect(sc.me.ag!.tgp!.aim.distanceTo(spot.pos)).toBeLessThan(1);
    act('spot'); wait('talk-on');
    hotas.tap('tmsF', true);
    expect(hotas.spiSource).toBe('tgp');
    expect(a10cAim(sc, hotas.spiSource)).toEqual({ kind: 'target', unitId: sc.targets[0] });
    act('in'); wait('cleared');
    expect(j.calls.at(-1)).toMatchObject({ text: 'Hawg 1, cleared hot.', verified: true });
    run(60, () => w.canAgLaunch(id).ok);
    expect(w.canAgLaunch(id).ok).toBe(true);
    hotas.tap('coolieU');
    expect(hotas.releaseWeapon()).toBe(true);
    const target = w.groundUnits.get(sc.targets[0]!)!;
    run(60, () => !target.alive);
    expect(target.alive).toBe(false);
    run(1);
    // The JTAC stops lasing a destroyed vehicle.
    expect(spot.alive).toBe(false);
    expect(j.laserId).toBeNull();
    // NO LSR for 1 s, then the LSS searches again.
    run(2);
    expect(sc.me.ag!.tgp!.lss).toBe('search');
    act('off'); run(5);
    stepsDone('jtac-laser', snap(), done);
    expect(done.size).toBe(lessonsFor('a10c')['jtac-laser'].steps.length);
    expect(j.violations).toEqual([]);
    expect([...j.releases.values()].every(r => r.cleared)).toBe(true);
    expect(j.calls.at(-1)!.text).toMatch(/Good hits, 1 of 3 destroyed\. Cleared re-attack/);
  });
});
