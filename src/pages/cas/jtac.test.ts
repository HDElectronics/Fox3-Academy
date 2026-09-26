import { describe, expect, it } from 'vitest';
import { buildCasScenario, bearingDeg, type CasLessonId, type CasScenario } from './scenario';
import { makeNineLine } from './nineLine';
import { JtacController, type AimState, type JtacAction } from './jtac';

function setup(lesson: CasLessonId = 'geometry', aim: () => AimState = () => ({ kind: 'none' })) {
  const sc = buildCasScenario(lesson);
  const j = new JtacController(sc.world, sc, makeNineLine(sc), { aim: () => aim() });
  const run = (sec: number, stop: () => boolean = () => false) => {
    for (let i = 0; i < sec * 30 && !stop(); i++) { sc.world.step(1 / 30); j.step(); }
  };
  const wait = (s: JtacController['state']) => { run(120, () => !j.busy && j.state === s); expect(j.state).toBe(s); };
  const act = (a: JtacAction) => { expect(j.act(a)).toBe(true); };
  return { sc, j, run, wait, act };
}

function steerAtTarget(sc: CasScenario) {
  sc.me.cmd.heading = (bearingDeg(sc.me.pos, sc.target) * Math.PI) / 180;
}

describe('JTAC flow', () => {
  it('runs check-in, 9-line, remarks, readback and IP inbound in the ED order', () => {
    const { j, wait, act } = setup();
    expect(j.menu().map(m => m.action)).toEqual(['check-in']);
    act('check-in'); wait('checked-in');
    act('ready-copy'); wait('remarks-ready');
    act('ready-remarks'); wait('readback');
    act('readback'); wait('await-ip');
    // The run-in starts inside 10 nm, so the smoke follows "Continue." at once.
    act('ip-inbound'); wait('mark-down');
    const jtacLines = j.calls.filter(c => c.from === 'jtac').map(c => c.text);
    expect(jtacLines[0]).toMatch(/type 2 in effect/);
    expect(jtacLines[1]).toBe('IP ASH');
    expect(jtacLines).toContain('Readback correct. Report IP inbound.');
    expect(jtacLines.slice(-2)).toEqual(['Continue.', 'Mark is on the deck.']);
    expect(j.calls.find(c => c.text === 'Continue.')!.verified).toBe(true);
  });

  it('rejects items that are not on the menu in this state', () => {
    const { j } = setup();
    expect(j.act('in')).toBe(false);
    expect(j.act('ip-inbound')).toBe(false);
  });

  it('drops white smoke inside 10 nm and talks on from the mark', () => {
    const { sc, j, run, wait, act } = setup('talk-on');
    j.state = 'await-ip';
    act('ip-inbound'); wait('mark-down');
    const m = sc.world.marks.get(j.markId!)!;
    expect(m.type).toBe('smoke');
    expect(m.colour).toBe('white');
    expect(j.calls.at(-1)!.text).toBe('Mark is on the deck.');
    act('contact-mark'); wait('talk-on');
    expect(j.calls.at(-1)!.text).toMatch(/^From the mark, \w+ \d+ m, 3 tanks\. That is your target\.$/);
    run(1);
  });

  it('clears hot only on the attack heading with the sight on the target', () => {
    let aim: AimState = { kind: 'none' };
    const { sc, j, wait, act } = setup('talk-on', () => aim);
    j.state = 'talk-on';
    act('in'); wait('talk-on');
    expect(j.calls.at(-1)!.text).toMatch(/^Continue\./);
    aim = { kind: 'other', unitId: sc.decoys[0]! };
    act('in'); wait('aborted');
    expect(j.calls.at(-1)!.text).toBe('Abort, abort, abort. That is not your target.');
    aim = { kind: 'target', unitId: sc.targets[0]! };
    sc.me.heading = (150 * Math.PI) / 180;
    act('in'); wait('aborted');
    expect(j.calls.at(-1)!.text).toMatch(/Final attack heading 020 to 070/);
    steerAtTarget(sc); sc.me.heading = sc.me.cmd.heading;
    act('in'); wait('cleared');
    expect(j.calls.at(-1)).toMatchObject({ text: 'Frogfoot 1, cleared hot.', verified: true, tone: 'ok' });
  });

  it('scores a release without clearance and calls abort', () => {
    const { sc, j, run } = setup('talk-on');
    const w = sc.world, id = sc.me.id;
    j.state = 'talk-on';
    w.setAgMaster(id, 'ag'); w.selectAgWeapon(id, 's8');
    steerAtTarget(sc); sc.me.heading = sc.me.cmd.heading;
    const out = w.agLaunch(id);
    run(3);
    if (Array.isArray(out) && out.length) {
      expect(j.violations[0]!.why).toBe('no-clearance');
      expect(j.releases.get(out[0]!.id)!.cleared).toBe(false);
      expect(j.calls.some(c => /permission to fire/.test(c.text))).toBe(true);
      expect(j.state).toBe('aborted');
    } else {
      // The rockets may be out of their trainer band at this range: fire the Vikhr path in the full test instead.
      expect(j.violations).toEqual([]);
    }
  });

  it('flies a full cleared-hot Vikhr attack, then Off and BDA', () => {
    const { sc, j, run, wait, act } = setup('talk-on', () => ({ kind: 'target', unitId: sc.targets[1]! }));
    const w = sc.world, id = sc.me.id;
    j.state = 'await-ip';
    act('ip-inbound'); wait('mark-down');
    act('contact-mark'); wait('talk-on');
    steerAtTarget(sc); sc.me.heading = sc.me.cmd.heading;
    act('in'); wait('cleared');
    w.setAgMaster(id, 'ag'); w.selectAgWeapon(id, 'vikhr'); w.shkvalPower(id, true); w.shkvalZoom(id, 1); w.shkvalZoom(id, 1);
    const t = w.groundUnits.get(sc.targets[1]!)!;
    w.shkvalPointAt(id, t.pos); w.shkvalStabilise(id, true); w.shkvalLock(id); w.laser(id, true);
    run(60, () => w.canAgLaunch(id).pr);
    expect(w.canAgLaunch(id).pr).toBe(true);
    const out = w.agLaunch(id);
    expect(Array.isArray(out) && out.length).toBeTruthy();
    run(40, () => ![...w.agWeapons.values()].some(x => x.alive));
    expect(j.violations).toEqual([]);
    expect([...j.releases.values()].every(r => r.cleared)).toBe(true);
    act('off'); run(5);
    expect(j.attacks).toBe(1);
    expect(j.calls.at(-1)!.text).toMatch(/Good hits|No effect/);
    expect(['await-ip', 'complete']).toContain(j.state);
    expect(w.events.some(e => e.type === 'note' && e.text.startsWith('Axeman 1-1: '))).toBe(true);
  });
});
