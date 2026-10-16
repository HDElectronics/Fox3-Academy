import { describe, expect, it } from 'vitest';
import { buildCasScenario, distM, type CasScenario } from './scenario';
import { makeNineLine, markFor, parseTrainerGrid, trainerGrid } from './nineLine';
import { JtacController } from './jtac';
import { A10cHotas, type HotasHost } from './a10cHotas';
import { A10cCdu } from './a10cCdu';
import { a10cAim, casSnap } from './snap';
import { A10C_LESSON_ORDER, A10C_PAGE_CAVEATS, CAS_LESSON_ORDER, lessonOrder, lessonsFor, progressKey, type CasSnap } from './lessons';

/** The CAS page's A-10C II wiring for the CDU grid lesson: CDU start database, HOTAS steering to the CDU steerpoint. */
function setup() {
  const sc: CasScenario = buildCasScenario('cdu-grid', 11, { jet: 'a10c' });
  const nl = makeNineLine(sc, markFor('a10c', 'cdu-grid'));
  let hotas!: A10cHotas;
  const j = new JtacController(sc.world, sc, nl, { aim: () => a10cAim(sc, hotas.spiSource), pilot: 'Hawg 1', datalink: true, weapons: 'GBU-12' });
  j.state = 'await-ip';
  const cdu = new A10cCdu({ groundHeightM: (x, z) => sc.world.groundHeight(x, z), marks: () => hotas.marks, log: () => {} }, {
    init: { x: sc.me.pos.x, z: sc.me.pos.z },
    plan: [{ id: sc.ip.name, x: sc.ip.x, z: sc.ip.z }, { id: sc.egress.name, x: sc.egress.x, z: sc.egress.z }],
  });
  const host: HotasHost = {
    world: () => sc.world, me: () => sc.me, jtac: () => j,
    steerpoint: () => { const sp = cdu.steerpoint(); return { x: sp.x, z: sp.z, name: sp.id }; },
    targets: () => sc.targets, friendlies: () => [{ id: sc.jtac, label: 'JTAC' }], log: () => {}, canFire: () => true,
  };
  hotas = new A10cHotas(host);
  hotas.reset();
  sc.world.tgpPower(sc.me.id, true);
  sc.world.tgpPointAt(sc.me.id, sc.ip);
  let open = false;
  const snap = (): CasSnap => casSnap({
    sc, jtac: j, aim: a10cAim(sc, hotas.spiSource), menuOpen: false, cardPassed: false, impacts: {},
    milestones: hotas.milestones, cdu: { cdu, open, grid: nl.grid },
  });
  const done: string[] = [];
  const check = () => {
    const s = snap();
    for (const st of lessonsFor('a10c')['cdu-grid'].steps) {
      if (done.includes(st.id)) continue;
      if (!st.check(s)) break;
      done.push(st.id);
    }
    return [...done];
  };
  const run = (sec: number) => { for (let i = 0; i < sec * 30; i++) { sc.world.step(1 / 30); j.step(); hotas.step(1 / 30); check(); } };
  const type = (t: string) => { for (const ch of t) cdu.key(ch); };
  return { sc, nl, cdu, hotas, snap, check, run, type, setOpen: (v: boolean) => { open = v; } };
}

describe('CDU grid lesson', () => {
  it('is A-10C II only, second after the 9-line, keyed per jet', () => {
    expect(A10C_LESSON_ORDER.slice(0, 3)).toEqual(['nine-line', 'cdu-grid', 'digital']);
    expect(lessonOrder('su25t')).toEqual(CAS_LESSON_ORDER);
    expect(CAS_LESSON_ORDER).not.toContain('cdu-grid');
    expect(progressKey('cdu-grid', 'a10c')).toBe('cas:cdu-grid:a10c');
    const def = lessonsFor('a10c')['cdu-grid'];
    expect(def.title).toBe('Grid to steerpoint');
    expect(def.short).toBe('CDU grid');
    expect(def.scored).toBe(false);
    expect(def.steps.map(s => s.id)).toEqual(['open', 'wp', 'waypt', 'copy', 'utm', 'grid', 'name', 'steer', 'slave', 'track']);
    expect(A10C_PAGE_CAVEATS.some(c => c.startsWith('A-10C II CDU:'))).toBe(true);
  });

  it('briefs coordinates only and starts with no datalink tasking', () => {
    const { nl, snap, sc } = setup();
    expect(nl.mark).toBe('none');
    expect(nl.grid).toBe(trainerGrid({ x: 1.7, z: 8.3 }));
    const s = snap();
    expect(s.tasking).toBe('none');
    expect(s.jtac).toBe('await-ip');
    expect(sc.me.ag!.spi).toBeNull();
    expect(s.cdu).toEqual({ open: false, milestones: new Set(), gridOk: false, steerOnGrid: false, podOnSteer: false });
  });

  it('Su-25T snapshots have no CDU', () => {
    const sc = buildCasScenario('talk-on');
    const nl = makeNineLine(sc, 'wp');
    const j = new JtacController(sc.world, sc, nl, { aim: () => ({ kind: 'none' }) });
    expect(casSnap({ sc, jtac: j, aim: { kind: 'none' }, menuOpen: false, cardPassed: false, impacts: {} }).cdu).toBeNull();
  });

  it('gridOk is false for a wrong grid and true for the 9-line grid', () => {
    const { cdu, snap, type, nl } = setup();
    cdu.fsk('WP'); cdu.lsk('R3'); cdu.lsk('R7'); cdu.lsk('R9');
    type('GH51004999'); cdu.lsk('L9');
    expect(cdu.milestones.has('grid')).toBe(true);
    expect(snap().cdu!.gridOk).toBe(false);
    type(nl.grid.replace(/\s+/g, '')); cdu.lsk('L9');
    expect(snap().cdu!.gridOk).toBe(true);
    // The grid in a flight plan point does not count: only a copied (user) waypoint.
    expect(snap().cdu!.steerOnGrid).toBe(false);
  });

  it('runs the ED flow headless and the steps complete in order', () => {
    const { cdu, hotas, check, run, type, nl, sc, setOpen } = setup();
    expect(check()).toEqual([]);
    setOpen(true);
    expect(check()).toEqual(['open']);
    cdu.fsk('WP');
    expect(check().at(-1)).toBe('wp');
    cdu.lsk('R3');
    expect(check().at(-1)).toBe('waypt');
    cdu.lsk('R7');
    expect(check().at(-1)).toBe('copy');
    // The start database is 0 INIT POSIT, 1 the IP, 2 the egress point: the copy is MSN003.
    expect(cdu.lines()[2]).toMatch(/^±3 .*MSN003\[\]$/);
    cdu.lsk('R9');
    expect(check().at(-1)).toBe('utm');
    type(nl.grid.replace(/\s+/g, '')); cdu.lsk('L9');
    expect(check().at(-1)).toBe('grid');
    type('TGT'); cdu.lsk('R3');
    expect(check().at(-1)).toBe('name');
    cdu.setDial('MISSION');
    cdu.steer(1);
    expect(check().at(-1)).toBe('name');
    cdu.steer(1);
    expect(cdu.steerpoint()).toMatchObject({ number: 3, id: 'TGT' });
    expect(check().at(-1)).toBe('steer');
    // A minute or so of flying while the pilot checks the digits: nothing else completes on its own.
    run(60);
    expect(check().at(-1)).toBe('steer');
    hotas.tap('coolieR', true); hotas.tap('chF', true);
    expect(check().at(-1)).toBe('slave');
    hotas.tap('tmsF');
    run(0.5);
    expect(check()).toEqual(lessonsFor('a10c')['cdu-grid'].steps.map(s => s.id));
    expect(sc.targets).toContain(sc.me.ag!.tgp!.trackedUnitId);
  });

  it('START keeps the jet clear of the target and the pod on it after 4 minutes of typing', () => {
    const { sc, nl } = setup();
    const w = sc.world, me = sc.me;
    const p = parseTrainerGrid(nl.grid)!;
    let closest = Infinity, farthest = 0;
    for (let i = 0; i < 240 * 30; i++) {
      w.step(1 / 30);
      const d = distM(me.pos, sc.target);
      closest = Math.min(closest, d); farthest = Math.max(farthest, d);
      for (const id of sc.friendlies) closest = Math.min(closest, distM(me.pos, w.groundUnits.get(id)!.pos));
    }
    expect(me.alive).toBe(true);
    expect(me.pos.y - w.groundHeight(me.pos.x, me.pos.z)).toBeGreaterThan(1500);
    expect(closest).toBeGreaterThan(5000);
    expect(farthest).toBeLessThan(18000);
    // Slave the pod to the grid and point track a tank.
    w.tgpPointAt(me.id, p);
    const r = w.tgpTrack(me.id, 'point');
    expect(r.ok).toBe(true);
    expect(sc.targets).toContain(r.unitId);
  });
});
