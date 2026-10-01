import { describe, expect, it } from 'vitest';
import { CopilotEngine, type Callout, type Rule } from './engine';
import { HORNET_DEFAULTS, HORNET_FACTS, HORNET_RULES, aoaState, type HornetConfig } from './hornet';
import { FuelTrend, phaseOf, situationOf, enduranceMin, type Situation } from './situation';
import { CopilotVoice, type SpeechLike } from './voice';
import type { DcsFrame } from '../dcs/protocol';

const sit = (p: Partial<Situation>): Situation => {
  const s = { masterWarning: false, phase: 'airborne' as const, ...p };
  return { ...s, phase: p.phase ?? phaseOf(s) };
};

describe('copilot engine timing', () => {
  const rule: Rule<{ on: boolean }> = { id: 'x', severity: 'caution', holdS: 1, repeatS: 5, rearmS: 3, test: (_s, { cfg }) => cfg.on, text: () => 'X' };
  const run = (engine: CopilotEngine<{ on: boolean }>, t: number) => engine.step(sit({}), t);

  it('holds, calls once, repeats, then rearms after staying clear', () => {
    const e = new CopilotEngine([rule], { on: true });
    expect(run(e, 0)).toEqual({ active: [], calls: [] });
    expect(run(e, 0.5).calls).toEqual([]);
    expect(run(e, 1).calls.map(c => c.id)).toEqual(['x']);
    expect(run(e, 1).active).toHaveLength(1);
    expect(run(e, 3).calls).toEqual([]);
    expect(run(e, 6).calls).toHaveLength(1);
    e.cfg.on = false;
    expect(run(e, 7)).toEqual({ active: [], calls: [] });
    e.cfg.on = true;
    run(e, 7.5);
    expect(run(e, 8.6).calls).toEqual([]); // back on after 1 s clear: shown, not spoken
    expect(run(e, 8.6).active).toHaveLength(1);
    e.cfg.on = false; run(e, 9);
    e.cfg.on = true; run(e, 12.5);
    expect(run(e, 13.5).calls).toHaveLength(1); // clear 3.5 s: rearmed
  });

  it('a throwing rule counts as false, and urgent calls come first', () => {
    const boom: Rule<unknown> = { id: 'boom', severity: 'warning', holdS: 0, test: () => { throw new Error('x'); }, text: () => '' };
    const adv: Rule<unknown> = { id: 'adv', severity: 'advisory', holdS: 0, test: () => true, text: () => 'A' };
    const warn: Rule<unknown> = { id: 'warn', severity: 'warning', holdS: 0, test: () => true, text: () => 'W' };
    const e = new CopilotEngine([boom, adv, warn], {});
    expect(e.step(sit({}), 0).calls.map(c => c.id)).toEqual(['warn', 'adv']);
  });
});

describe('situation from a DCS frame', () => {
  const frame: DcsFrame = {
    type: 'frame', seq: 1, allow: { ownship: true, sensor: null, object: null },
    self: { name: 'FA-18C_hornet' }, ias: 72.0222, altAgl: 152.4, vv: -3.81, aoa: 8.1, acc: { y: 1.1 },
    mech: { gear: 1, flaps: 1, hook: 0 }, engine: { fuelInt: 2000, fuelExt: 0, ffL: 0.1, ffR: 0.1 }, mcp: ['MasterWarning'],
  };

  it('converts to knots, feet, pounds and degrees and finds the phase', () => {
    const s = situationOf(frame);
    expect(s.iasKt).toBeCloseTo(140, 0);
    expect(s.aglFt).toBeCloseTo(500, 3);
    expect(s.vviFpm).toBeCloseTo(-750, 0);
    expect(s.aoaDeg).toBeCloseTo(8.1, 5);
    expect(s.fuelLb).toBeCloseTo(4409, 0);
    expect(s).toMatchObject({ type: 'FA-18C_hornet', masterWarning: true, phase: 'approach', gear: 1, hook: 0 });
    expect(enduranceMin({ ...s, fuelFlowLbH: 1587 }, 1000)).toBeCloseTo(((4409 - 1000) / 1587) * 60, 0);
    expect(enduranceMin(s)).toBeUndefined();
    expect(situationOf(null)).toEqual({ masterWarning: false, phase: 'ground' });
  });

  it('reads the Hornet as DCS really sends it: AoA in degrees, fuel from the IFEI, BINGO 0 = not set', () => {
    // Frame captured from DCS (F/A-18C, 2026-10-01): 4.3 G pull, IFEI 6930 lb, LoGetEngineInfo fuel a 0..1 fraction.
    const live: DcsFrame = {
      type: 'frame', seq: 9, allow: { ownship: true, sensor: true, object: true }, self: { name: 'FA-18C_hornet' },
      ias: 189.6, aoa: 9.0656, altAgl: 1799.4, acc: { y: 4.32 },
      mech: { gear: 0, flaps: 0.246, speedbrakes: 0 }, engine: { fuelInt: 0.658, fuelExt: 0, ffL: 3.571, ffR: 3.571, rpmL: 100.4, rpmR: 100.4 },
      mcp: [], args: { 226: 1, 234: 1, 293: 1, 49: 1, 13: 0, 304: 0 }, ind: { fuelUp: '6930T', fuelDown: '6930I', bingo: '0' },
    };
    const s = situationOf(live);
    expect(s.aoaDeg).toBeCloseTo(9.07, 2);
    expect(s.fuelLb).toBe(6930);
    expect(s.cockpit?.switches).toMatchObject({ gearHandle: 'UP', flapSwitch: 'AUTO', hookHandle: 'UP', masterArm: 'ARM' });
    const e = new CopilotEngine(HORNET_RULES, { ...HORNET_DEFAULTS });
    e.step(s, 0);
    expect(e.step(s, 11).active.map(a => a.id)).toEqual(['bingo-not-set']); // no joker or bingo at 6930 lb
    // Without the IFEI, a fraction is not a fuel quantity.
    expect(situationOf({ ...live, self: { name: 'Su-27' } }).fuelLb).toBeUndefined();
  });

  it('measures burn from the fuel trend', () => {
    const tr = new FuelTrend();
    for (let t = 0; t < 14; t += 2) expect(tr.update(t, 6000 - 3 * t)).toBeUndefined(); // under MIN_S
    expect(tr.update(20, 5940)).toBeUndefined(); // 6 s gap: data dropped, window restarts
    for (let t = 22; t <= 40; t += 2) tr.update(t, 5940 - 3 * (t - 20));
    expect(tr.update(42, 5940 - 66)).toBeCloseTo(10800, 0); // 3 lb/s
    expect(tr.update(21, 6500)).toBeUndefined(); // tanking: restart
    expect(tr.update(22, undefined)).toBeUndefined();
  });

  it('phases: ground, airborne, approach', () => {
    expect(phaseOf({ aglFt: 3, iasKt: 20 })).toBe('ground');
    expect(phaseOf({ aglFt: 3, iasKt: 150, gear: 1 })).toBe('approach');
    expect(phaseOf({ aglFt: 8000, iasKt: 300, gear: 1 })).toBe('airborne');
    expect(phaseOf({ aglFt: 2000, iasKt: 300, gear: 0 })).toBe('airborne');
  });
});

describe('F/A-18C rules', () => {
  const ids = (p: Partial<Situation>, cfg: Partial<HornetConfig> = {}) => {
    const e = new CopilotEngine(HORNET_RULES, { ...HORNET_DEFAULTS, ...cfg });
    const s = sit(p);
    e.step(s, 0);
    return e.step(s, 10).active.map(a => a.id);
  };
  const approach = { aglFt: 600, iasKt: 140, gear: 1, flaps: 1, hook: 1, aoaDeg: 8.1 };

  it('uses the sourced indexer band', () => {
    expect(HORNET_FACTS.onSpeedAoaDeg.value).toBe(8.1);
    expect(aoaState(8.1)).toBe('on');
    expect(aoaState(8.84)).toBe('on');
    expect(aoaState(8.86)).toBe('slow');
    expect(aoaState(7.36)).toBe('on'); // rounds to 7.4
    expect(aoaState(7.34)).toBe('fast');
  });

  it('calls on speed, slow and fast only on approach', () => {
    expect(ids(approach)).toEqual(['aoa-on']);
    expect(ids({ ...approach, aoaDeg: 9.5 })).toEqual(['aoa-slow']);
    expect(ids({ ...approach, aoaDeg: 6.5 })).toEqual(['aoa-fast']);
    expect(ids({ ...approach, gear: 0, aglFt: 3000, aoaDeg: 9.5 })).toEqual([]);
  });

  it('checks hook only to the carrier, and flaps on every approach', () => {
    expect(ids({ ...approach, hook: 0 })).toEqual(['aoa-on']);
    expect(ids({ ...approach, hook: 0 }, { mode: 'carrier' })).toEqual(['check-hook', 'aoa-on']);
    expect(ids({ ...approach, flaps: 0.5 })).toEqual(['check-flaps', 'aoa-on']);
    expect(ids({ ...approach, iasKt: 175 }, { mode: 'carrier' })).toContain('carrier-config-speed');
  });

  it('watches fuel against the pilot bingo', () => {
    expect(ids({ aglFt: 20000, iasKt: 300, fuelLb: 5000 })).toEqual([]);
    expect(ids({ aglFt: 20000, iasKt: 300, fuelLb: 4000 })).toEqual(['joker']);
    expect(ids({ aglFt: 20000, iasKt: 300, fuelLb: 2900 })).toEqual(['bingo']);
    expect(ids({ aglFt: 0, iasKt: 0, fuelLb: 2900 })).toEqual([]); // on deck: no bingo call
  });

  it('warns on master warning, over G, forgotten gear and gear speed; never on missing data', () => {
    expect(ids({ aglFt: 20000, masterWarning: true })).toEqual(['master-warning']);
    expect(ids({ aglFt: 20000, g: 8 })).toEqual(['over-g']);
    expect(ids({ aglFt: 800, iasKt: 170, vviFpm: -700, gear: 0 })).toEqual(['gear-up-low']);
    expect(ids({ aglFt: 3000, iasKt: 300, gear: 0.5 })).toEqual(['gear-speed']);
    expect(ids({ aglFt: 800 })).toEqual([]);
  });
});

describe('copilot voice', () => {
  class FakeSynth implements SpeechLike {
    spoken: string[] = [];
    pending: SpeechSynthesisUtterance[] = [];
    cancels = 0;
    get speaking() { return this.pending.length > 0; }
    speak(u: SpeechSynthesisUtterance) { this.spoken.push(u.text); this.pending.push(u); }
    cancel() { this.cancels++; this.pending = []; }
    getVoices() { return []; }
    finish() { const u = this.pending.shift(); u?.onend?.({} as SpeechSynthesisEvent); }
  }
  const utter = (text: string) => ({ text }) as SpeechSynthesisUtterance;
  const call = (id: string, severity: Callout['severity']): Callout => ({ id, severity, text: id, say: id, t: 0 });

  it('queues calls, lets warnings interrupt, and drops stale ones', () => {
    const synth = new FakeSynth();
    const v = new CopilotVoice(synth, utter);
    v.say(call('a', 'advisory'));
    for (const id of ['b', 'c', 'd', 'e']) v.say(call(id, 'caution'));
    expect(synth.spoken).toEqual(['a']);
    synth.finish();
    expect(synth.spoken).toEqual(['a', 'c']); // b dropped: queue keeps the newest 3
    v.say(call('w', 'warning'));
    expect(synth.cancels).toBe(1);
    expect(synth.spoken.at(-1)).toBe('w');
    synth.finish();
    expect(synth.spoken.at(-1)).toBe('w');
    v.muted = true;
    v.say(call('m', 'warning'));
    expect(synth.spoken.at(-1)).toBe('w');
    expect(new CopilotVoice(null).available).toBe(false);
  });
});
