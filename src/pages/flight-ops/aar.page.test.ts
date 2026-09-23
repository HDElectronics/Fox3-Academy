import { describe, expect, it } from 'vitest';
import { FLIGHT_OPS } from '../../data/flightOps';
import { TANKERS } from '../../data/tankers';
import {
  AarEvaluator, FLIGHT_OPS_DT, applyAction, createFlightOpsState, demoPilot, stepFlightOps, type FlightOpsJetId, type FlightOpsState,
} from '../../sim/flightOps';
import { MPS_PER_KT } from '../../sim/math';
import {
  aarCaption, aarCard, aarKeys, aarLessonSteps, aarProgressKey, aarStarts, aarStepsDone, aarTanker, bandRows, closureText, closureTone,
  fuelFraction, noAarNote, positionBox,
} from './aarLesson';

function demo(id: FlightOpsJetId, until: (s: FlightOpsState, ev: AarEvaluator) => boolean) {
  const d = FLIGHT_OPS[id];
  const s = createFlightOpsState(id, 'aarPrecontact', d);
  const ev = new AarEvaluator(d);
  for (let i = 0; i < 60 * 400 && !until(s, ev); i++) {
    const c = demoPilot(s, d);
    for (const a of c.actions) applyAction(s, a, d);
    stepFlightOps(s, c, FLIGHT_OPS_DT, d);
    ev.update(s);
  }
  return { s, ev, d };
}

describe('refuelling lesson helpers (#28)', () => {
  it('offers the starts only to jets with refuelling data and explains the others', () => {
    for (const id of ['su33', 'f15c', 'f16c', 'fa18c', 'f14b', 'jf17', 'm2000c'] as const) expect(aarStarts(FLIGHT_OPS[id])).toEqual(['aarRejoin', 'aarPrecontact']);
    for (const id of ['su27', 'j11a', 'mig29s'] as const) {
      expect(aarStarts(FLIGHT_OPS[id])).toEqual([]);
      expect(noAarNote('X', id)).toMatch(/No air-to-air refuelling/);
    }
    expect(noAarNote('MiG-29S', 'mig29s')).toMatch(/not verified/);
    expect(aarProgressKey('su33')).toBe('flight-ops:su33:aar');
    expect(aarTanker(FLIGHT_OPS.fa18c, 'kc130')).toBe('kc130');
    expect(aarTanker(FLIGHT_OPS.fa18c, 'il78m')).toBe('kc135mprs');
    expect(aarTanker(FLIGHT_OPS.su27, null)).toBeNull();
  });

  it('takes every key from the data: Su-33 probe and lights, F-16C door, fixed probes, the radio call', () => {
    const su = aarKeys(FLIGHT_OPS.su33);
    expect(su.map(k => [k.action, k.key])).toEqual([['probeToggle', 'LCtrl+R'], ['refuelLights', 'LAlt+R'], ['callTanker', '\\']]);
    expect(su[0]!.tag).toBeNull();
    expect(aarKeys(FLIGHT_OPS.f16c).map(k => k.touch)).toEqual(['DOOR', 'CALL']);
    expect(aarKeys(FLIGHT_OPS.f16c)[0]!.tag).toBe('not verified');
    expect(aarKeys(FLIGHT_OPS.jf17).map(k => k.action)).toEqual(['callTanker']);
    expect(aarKeys(FLIGHT_OPS.su27)).toEqual([]);
  });

  it('writes the lesson steps from the sourced numbers', () => {
    const su = aarLessonSteps(FLIGHT_OPS.su33, 'metric', 'aarRejoin', 'il78m').map(x => x.text).join(' | ');
    expect(su).toMatch(/2000–9000 m, 500–570 km\/h IAS/);
    expect(su).toMatch(/from 10 m/);
    expect(su).toMatch(/3–6 m below the pod, hose band green/);
    const f16 = aarLessonSteps(FLIGHT_OPS.f16c, 'imperial', 'aarPrecontact', 'kc135');
    expect(f16.map(x => x.id)).not.toContain('rejoin');
    expect(f16.find(x => x.id === 'door')!.text).toMatch(/below 400 kt \/ M0\.85; stay below 400 kt \/ M0\.95/);
    expect(aarLessonSteps(FLIGHT_OPS.m2000c, 'imperial', 'aarPrecontact', 'kc135mprs').find(x => x.id === 'contact')!.text).toMatch(/2–3 kt/);
    expect(aarLessonSteps(FLIGHT_OPS.jf17, 'imperial', 'aarPrecontact', 'kc130').find(x => x.id === 'probe')!.text).toMatch(/Fixed probe/);
    expect(bandRows(TANKERS.il78m).map(b => `${b.label} ${b.range}`)).toEqual(['Yellow 3–13 m', 'Yellow + green 13–16 m', 'Green 16–22 m', 'Green + red 22–24 m', 'Red 24–26 m']);
  });

  it('formats closure in the app units and grades it against the jet band', () => {
    expect(closureText(MPS_PER_KT * 2.4, 'imperial')).toBe('2.4 kt closing');
    expect(closureText(-0.6, 'metric')).toBe('0.6 m/s opening');
    expect(closureText(MPS_PER_KT * 2.4, 'imperial', true)).toBe('+2.4 kt');
    expect(closureText(0.01, 'imperial', true)).toBe('0.0 kt');
    const s = createFlightOpsState('su33', 'aarPrecontact');
    s.aar!.closureMs = 2.5 * MPS_PER_KT;
    expect(closureTone(s.aar!, FLIGHT_OPS.su33)).toBe('ok');
    s.aar!.closureMs = 6 * MPS_PER_KT;
    expect(closureTone(s.aar!, FLIGHT_OPS.su33)).toBe('warning');
  });

  it('puts the tip in the pre-contact box at the start and in the green-band box on contact (Su-33)', () => {
    const s = createFlightOpsState('su33', 'aarPrecontact');
    const b0 = positionBox(s.aar!, FLIGHT_OPS.su33);
    expect(b0.phase).toBe('precontact');
    expect(b0.inside).toBe(true);
    expect(Math.hypot(b0.err.aft, b0.err.right, b0.err.up)).toBeLessThan(0.1);
    const { s: s1, d } = demo('su33', st => !!st.aar?.connected && st.aar.hoseBand === 'green' && st.aar.fuel > 50);
    const b1 = positionBox(s1.aar!, d);
    expect(b1.phase).toBe('contact');
    expect(Math.abs(b1.err.aft)).toBeLessThanOrEqual(b1.lim.aft);
    expect(aarCaption(s1, d, 'metric').text).toMatch(/Hose band green/);
    expect(fuelFraction(s1.aar!)).toBeGreaterThan(0);
  });

  it('ticks the steps and gives a clean card after the demo (boom and probe)', () => {
    for (const id of ['f16c', 'fa18c'] as const) {
      const { s, ev } = demo(id, (_, e) => e.score(_).total !== null);
      const sco = ev.score(s);
      expect(sco.total).toBe(100);
      const done = aarStepsDone(s, sco.gates);
      for (const step of ['call', 'precontact', 'contact', 'refuel', 'disconnect'] as const) expect(done.has(step)).toBe(true);
      expect(aarCard(sco, false).tone).toBe('ok');
    }
  });
});
