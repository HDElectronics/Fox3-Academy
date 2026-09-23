import { describe, expect, it } from 'vitest';
import { FLIGHT_OPS } from '../../data/flightOps';
import { SHIP_HULL } from '../../data/ships';
import {
  FLIGHT_OPS_DT, LaunchEvaluator, applyAction, createFlightOpsState, demoPilot, launchStrip, shipFrame, stepFlightOps,
  trimForWeight, type FlightOpsAction, type FlightOpsInput, type FlightOpsJetId, type FlightOpsState, type LaunchOptions,
} from './index';

type Pilot = (s: FlightOpsState) => FlightOpsInput & { actions: FlightOpsAction[] };

function fly(id: FlightOpsJetId, opts: LaunchOptions = {}, pilot?: Pilot, maxS = 120) {
  const d = FLIGHT_OPS[id];
  const s = createFlightOpsState(id, d.launch!.kind, d, opts);
  const ev = new LaunchEvaluator(d);
  const p: Pilot = pilot ?? (st => demoPilot(st, d));
  for (let i = 0; i < 60 * maxS && s.phase !== 'crashed' && ev.score(s).total === null; i++) {
    const c = p(s);
    for (const a of c.actions) applyAction(s, a, d);
    stepFlightOps(s, c, FLIGHT_OPS_DT, d);
    ev.update(s);
  }
  return { s, score: ev.score(s) };
}

/** Demo pilot with a hook: `edit` changes the command before it is applied. */
const demoWith = (id: FlightOpsJetId, edit: (s: FlightOpsState, c: ReturnType<Pilot>) => ReturnType<Pilot>): Pilot =>
  s => edit(s, demoPilot(s, FLIGHT_OPS[id]));

describe('launch data', () => {
  it('gives the catapult to the Hornet and Tomcat and the ski-jump to the Su-33', () => {
    expect(FLIGHT_OPS.fa18c.launch?.kind).toBe('catapult');
    expect(FLIGHT_OPS.f14b.launch?.kind).toBe('catapult');
    expect(FLIGHT_OPS.su33.launch?.kind).toBe('skiJump');
    expect(FLIGHT_OPS.f16c.launch).toBeUndefined();
    expect(() => createFlightOpsState('f16c', 'catapult')).toThrow();
    expect(() => createFlightOpsState('su33', 'catapult')).toThrow();
    expect(() => createFlightOpsState('su33', 'skiJump', FLIGHT_OPS.su33, { station: 2 })).toThrow();
  });
  it('trims the Hornet by gross weight', () => {
    const l = FLIGHT_OPS.fa18c.launch!;
    expect(trimForWeight(l, 40000)).toBe(16);
    expect(trimForWeight(l, 46000)).toBe(17);
    expect(trimForWeight(l, 49000)).toBe(19);
    expect(trimForWeight(FLIGHT_OPS.f14b.launch!, 60000)).toBeUndefined();
  });
  it('keeps the sourced keys', () => {
    const key = (id: FlightOpsJetId, step: string) => FLIGHT_OPS[id].launch!.steps.find(x => x.id === step)?.key;
    expect(key('fa18c', 'nwsHi')?.value).toBe('S');
    expect(key('fa18c', 'hookUp')?.value).toBe('U');
    expect(key('fa18c', 'salute')?.verified).toBe(false);
    expect(key('f14b', 'salute')?.value).toBe('LShift+U');
    expect(key('su33', 'specialAB')?.value).toBe('LShift+E');
    expect(FLIGHT_OPS.su33.launch!.avoid?.fodScreens.value).toBe('LAlt+I');
  });
});

describe('demo launch', () => {
  const cases: [FlightOpsJetId, LaunchOptions][] = [
    ['fa18c', {}], ['fa18c', { heavy: true, station: 2 }], ['f14b', {}], ['su33', {}], ['su33', { heavy: true, station: 3 }],
  ];
  for (const [id, opts] of cases) {
    it(`launches the ${id} ${JSON.stringify(opts)} and passes every gate`, () => {
      const { s, score } = fly(id, opts);
      expect(s.phase).toBe('air');
      expect(s.launch?.outcome).toBe('good');
      expect(s.launch?.errors).toEqual([]);
      for (const g of score.gates) expect(g.ok, `${id} ${g.id}: ${g.notes.join('; ')}`).toBe(true);
      expect(score.total).toBe(100);
      expect(score.verdict).not.toMatch(/!/);
      expect(s.gearDown).toBe(false);
      if (id === 'fa18c') expect(FLIGHT_OPS.fa18c.flapLabels[s.flapIndex]).toBe('AUTO');
      const order = FLIGHT_OPS[id].launch!.steps.map(x => x.id);
      expect(s.launch!.stepsDone.map(x => x.id)).toEqual(order);
      expect(launchStrip(s, FLIGHT_OPS[id]).every(x => x.state === 'done')).toBe(true);
    });
  }
  it('grades the catapult gates in flight order, with the clearing turn', () => {
    const { score } = fly('fa18c');
    expect(score.gates.map(g => g.id)).toEqual(['sequence', 'shot', 'handsOff', 'cleanUp', 'clearingTurn', 'climb']);
    expect(fly('su33').score.gates.map(g => g.id)).toEqual(['sequence', 'shot', 'cleanUp', 'climb']);
  });
  it('holds the jet on the shuttle until the salute, then strokes off the bow', () => {
    const d = FLIGHT_OPS.fa18c;
    const s = createFlightOpsState('fa18c', 'catapult', d);
    const a0 = shipFrame(s).a;
    for (let i = 0; i < 60 * 5; i++) stepFlightOps(s, { pitch: 0, roll: 0, throttle: 1 }, FLIGHT_OPS_DT, d);
    expect(s.launch!.stage).toBe('hold');
    expect(shipFrame(s).a).toBeCloseTo(a0, 3);
    const { s: done } = fly('fa18c');
    expect(done.launch!.endT! - done.launch!.strokeT!).toBeCloseTo(2.5, 1);
    expect(Math.abs(done.launch!.endKt! - (FLIGHT_OPS.fa18c.approachKt.value + 15))).toBeLessThan(1.5);
    expect(shipFrame(createFlightOpsState('fa18c', 'catapult')).a).toBeLessThan(SHIP_HULL.cvn.lengthM);
  });
  it('is deterministic', () => {
    for (const id of ['fa18c', 'su33'] as const) {
      const a = fly(id), b = fly(id);
      expect(a.s).toEqual(b.s);
      expect(a.score).toEqual(b.score);
    }
  });
});

describe('sequence errors', () => {
  it('refuses a salute before the power is set and keeps the jet on the shuttle', () => {
    const d = FLIGHT_OPS.fa18c;
    const s = createFlightOpsState('fa18c', 'catapult', d);
    for (const a of ['nwsHi', 'launchBar', 'hookUp', 'salute'] as FlightOpsAction[]) applyAction(s, a, d);
    expect(s.launch!.stage).toBe('hold');
    expect(s.launch!.errors[0]).toMatch(/Salute refused.*T\/O trim.*MIL.*Wipe out/);
  });
  it('refuses the hook-up with the launch bar up', () => {
    const d = FLIGHT_OPS.fa18c;
    const s = createFlightOpsState('fa18c', 'catapult', d);
    applyAction(s, 'hookUp', d);
    expect(s.launch!.stepsDone).toEqual([]);
    expect(s.launch!.errors[0]).toMatch(/launch bar/);
  });
  it('flags steps out of order and grades the sequence gate down', () => {
    // Wipe out first: the jet still launches, with a sequence error.
    let first = true;
    const { s, score } = fly('fa18c', {}, demoWith('fa18c', (st, c) => {
      if (first) { first = false; return { ...c, actions: ['wipeOut'] }; }
      return c;
    }));
    expect(s.launch!.outcome).toBe('sequence error');
    expect(s.launch!.errors.some(e => /out of order/.test(e))).toBe(true);
    expect(score.gates.find(g => g.id === 'sequence')?.ok).toBe(false);
    expect(score.total).toBeLessThan(100);
    expect(s.phase).toBe('air');
  });
  it('grades stick input during the stroke as hands on', () => {
    const { s, score } = fly('fa18c', {}, demoWith('fa18c', (st, c) => (st.launch!.stage === 'stroke' ? { ...c, pitch: 0.5 } : c)));
    expect(s.launch!.handsOn).toBe(true);
    expect(score.gates.find(g => g.id === 'handsOff')?.ok).toBe(false);
    expect(s.launch!.outcome).toBe('sequence error');
  });
  it('turns the wrong way off catapult 1 and fails the clearing turn', () => {
    const { score } = fly('fa18c', {}, demoWith('fa18c', (st, c) => (st.launch!.stage === 'free' ? { ...c, roll: -c.roll } : c)));
    expect(score.gates.find(g => g.id === 'clearingTurn')?.ok).toBe(false);
  });
});

describe('cold cat', () => {
  it('settles into the sea when the power comes off after the salute', () => {
    const { s, score } = fly('fa18c', {}, demoWith('fa18c', (st, c) => (st.launch!.stage === 'shot' ? { ...c, throttle: 0 } : c)));
    expect(s.launch!.outcome).toBe('cold cat');
    expect(s.phase).toBe('crashed');
    expect(s.crashReason).toBe('In the water');
    expect(score.total).toBe(0);
    expect(score.verdict).toMatch(/cold cat/);
  });
  it('needs the afterburner for the heavy Hornet', () => {
    const { s } = fly('fa18c', { heavy: true }, demoWith('fa18c', (st, c) => ({ ...c, afterburner: false })));
    // Without the afterburner the power step never completes, so the salute is never accepted.
    expect(s.launch!.stage).toBe('hold');
  });
});

describe('ski-jump', () => {
  it('warns heavy on a short position and ends in a short run', () => {
    const { s, score } = fly('su33', { heavy: true, station: 1 });
    expect(s.launch!.errors[0]).toMatch(/Use position 3/);
    expect(s.launch!.outcome).toBe('short run');
    expect(s.launch!.endKt!).toBeLessThan(s.launch!.minKt!);
    expect(s.crashReason).toBe('In the water');
    expect(score.total).toBe(0);
  });
  it('holds on the stoppers until full afterburner, and refuses special afterburner before it', () => {
    const d = FLIGHT_OPS.su33;
    const s = createFlightOpsState('su33', 'skiJump', d);
    applyAction(s, 'specialAB', d);
    expect(s.launch!.errors[0]).toMatch(/full afterburner first/);
    for (let i = 0; i < 60 * 10; i++) stepFlightOps(s, { pitch: 0, roll: 0, throttle: 1 }, FLIGHT_OPS_DT, d);
    expect(s.launch!.stage).toBe('hold');
  });
  it('costs thrust with the FOD screens up and flags them', () => {
    let first = true;
    const { s } = fly('su33', {}, demoWith('su33', (st, c) => {
      if (first) { first = false; return { ...c, actions: ['fodScreens'] }; }
      return c;
    }));
    const clean = fly('su33').s;
    expect(s.launch!.errors.some(e => /FOD screens/.test(e))).toBe(true);
    expect(s.launch!.endKt!).toBeLessThan(clean.launch!.endKt!);
    expect(s.launch!.outcome).not.toBe('good');
  });
  it('leaves the ramp nose up and climbing', () => {
    const d = FLIGHT_OPS.su33;
    const s = createFlightOpsState('su33', 'skiJump', d);
    for (let i = 0; i < 60 * 20 && s.launch!.stage !== 'settle'; i++) {
      const c = demoPilot(s, d);
      for (const a of c.actions) applyAction(s, a, d);
      stepFlightOps(s, c, FLIGHT_OPS_DT, d);
    }
    expect(s.launch!.stage).toBe('settle');
    expect(s.gamma).toBeGreaterThan(10 * Math.PI / 180);
    expect(s.vs).toBeGreaterThan(5);
  });
});
