import { describe, expect, it } from 'vitest';
import { FLIGHT_OPS } from '../../data/flightOps';
import { ROUTES, routeFor } from '../../app/routes';
import { LESSON_LINKS, PRACTICE_LINKS, destinationFor } from '../../app/navigation';
import { ApproachEvaluator, FLIGHT_OPS_DT, applyAction, createFlightOpsState, demoPilot, stepFlightOps, type GateResult } from '../../sim/flightOps';
import {
  FLIGHT_OPS_JETS, STEP_ORDER, currentStep, gateState, indexerLamps, isFlightOpsJet, lampToken, lessonPassed, plannedGates, stepsDone,
} from './logic';
import { lessonSteps } from './lesson';

const gate = (id: GateResult['id'], ok = true): GateResult => ({ id, label: id, passedAt: 0, ok, notes: [] });

describe('flight-ops page logic', () => {
  it('supports the three jets with data and rejects the others', () => {
    for (const id of FLIGHT_OPS_JETS) expect(isFlightOpsJet(id)).toBe(true);
    for (const id of ['su27', 'm2000c', 'f14b', '', null, undefined]) expect(isFlightOpsJet(id)).toBe(false);
  });

  it('lights only the indexer lamp for the cue, top = slow, bottom = fast', () => {
    const d = FLIGHT_OPS.f16c;
    expect(indexerLamps(d, 'slow').map(l => l.lit)).toEqual([true, false, false]);
    expect(indexerLamps(d, 'on').map(l => l.lit)).toEqual([false, true, false]);
    expect(indexerLamps(d, 'fast').map(l => l.lit)).toEqual([false, false, true]);
    expect(indexerLamps(d, null).some(l => l.lit)).toBe(false);
    expect(indexerLamps(d, 'slow').map(l => lampToken(l.color))).toEqual(['warning', 'ok', 'caution']);
    // Colours the manual does not give draw neutral.
    expect(indexerLamps(FLIGHT_OPS.f15c, 'on').every(l => lampToken(l.color) === 'neutral')).toBe(true);
    expect(lampToken(indexerLamps(FLIGHT_OPS.fa18c, 'on')[1]!.color)).toBe('caution');
  });

  it('ticks lesson steps from gates, configuration and on-speed time, in order', () => {
    const none = stepsDone({ gates: [], configured: false, onSpeedRunS: 0 });
    expect(none.size).toBe(0);
    expect(currentStep(none)).toBe('initial');
    const some = stepsDone({ gates: [gate('initial'), gate('break', false)], configured: true, onSpeedRunS: 1 });
    expect([...some].sort()).toEqual(['break', 'configure', 'initial']);
    expect(currentStep(some)).toBe('abeam');
    // A touchdown outside the zone does not complete the last step.
    expect(stepsDone({ gates: [gate('touchdown', false)], configured: false, onSpeedRunS: 0 }).has('touchdown')).toBe(false);
    const all = stepsDone({ gates: ['initial', 'break', 'abeam', 'groove', 'touchdown'].map(id => gate(id as GateResult['id'])), configured: true, onSpeedRunS: 5 });
    expect(all.size).toBe(STEP_ORDER.length);
    expect(currentStep(all)).toBeNull();
  });

  it('maps gate results onto the planned rings, downwind shares the abeam ring', () => {
    expect(gateState('abeam', [])).toBe('pending');
    expect(gateState('abeam', [gate('downwind'), gate('abeam')])).toBe('ok');
    expect(gateState('abeam', [gate('downwind', false), gate('abeam')])).toBe('miss');
    for (const id of FLIGHT_OPS_JETS) {
      const gs = plannedGates(FLIGHT_OPS[id]);
      expect(gs.map(g => g.id)).toEqual(['initial', 'break', 'abeam', 'ninety', 'groove', 'touchdown']);
      for (const g of gs) expect(Number.isFinite(g.pos.x + g.pos.y + g.pos.z)).toBe(true);
      expect(lessonSteps(FLIGHT_OPS[id]).map(s => s.id)).toEqual(STEP_ORDER);
    }
  });

  it('passes the lesson at 70 or more', () => {
    expect(lessonPassed(null)).toBe(false);
    expect(lessonPassed(69.9)).toBe(false);
    expect(lessonPassed(70)).toBe(true);
  });

  it('flags unverified numbers in the lesson copy', () => {
    const f15 = lessonSteps(FLIGHT_OPS.f15c);
    expect(f15.find(s => s.id === 'initial')!.text).toContain('not verified');
    const hornet = lessonSteps(FLIGHT_OPS.fa18c);
    expect(hornet.find(s => s.id === 'initial')!.text).not.toContain('not verified');
  });

  it('registers the route, the lesson link and the practice link', () => {
    expect(routeFor('flight-ops').path).toBe('flight-ops');
    expect(ROUTES.filter(r => r.path === 'flight-ops')).toHaveLength(1);
    expect(LESSON_LINKS.some(l => l.path === 'flight-ops')).toBe(true);
    const fly = PRACTICE_LINKS.find(l => l.path.startsWith('flight-ops?'))!;
    const [path, query] = fly.path.split('?');
    expect(destinationFor(path!, new URLSearchParams(query))).toBe('practice');
  });

  it('the demo lands every supported jet and the debrief has a total', () => {
    for (const id of FLIGHT_OPS_JETS) {
      const d = FLIGHT_OPS[id];
      const s = createFlightOpsState(id, 'initial', d);
      const ev = new ApproachEvaluator(d);
      for (let i = 0; i < 60 * 400 && s.phase !== 'stopped' && s.phase !== 'crashed'; i++) {
        const cmd = demoPilot(s, d);
        for (const a of cmd.actions) applyAction(s, a, d);
        stepFlightOps(s, cmd, FLIGHT_OPS_DT, d);
        ev.update(s);
      }
      const sc = ev.score();
      expect(s.phase).toBe('stopped');
      expect(sc.total).not.toBeNull();
    }
  });
});
