import { describe, expect, it } from 'vitest';
import { FLIGHT_OPS } from '../../data/flightOps';
import {
  CarrierEvaluator, FLIGHT_OPS_DT, applyAction, createFlightOpsState, demoPilot, stepFlightOps, type BallState, type CarrierScore,
  type GateResult,
} from '../../sim/flightOps';
import {
  CARRIER_STEP_ORDER, FLIGHT_OPS_JETS, GROOVE_STEP_ORDER, ballPicture, ballPrompt, carrierPlannedGates, carrierStarts, commentPlain,
  gradeCard, progressKey, stepOrder, stepsDone, toLandingOverlay,
} from './logic';
import { carrierCaption, lessonSteps } from './lesson';

const ball = (p: Partial<BallState>): BallState => ({ glideDevDeg: 0, lineupDevDeg: 0, cell: 0, luna: null, waveoffLights: false, cutLights: false, ...p });
const gate = (id: GateResult['id'], ok = true): GateResult => ({ id, label: id, passedAt: 0, ok, notes: [] });
const score = (p: Partial<CarrierScore>): CarrierScore => ({
  gates: [], grade: 'OK', comments: [], wire: 3, bolter: false, waveoff: false, calls: [], total: 90, verdict: 'OK pass, 3 wire.', ...p,
});

describe('flight-ops carrier page logic (#26)', () => {
  it('offers Case I and In the groove only to the jets that go to the boat', () => {
    const boat = FLIGHT_OPS_JETS.filter(id => carrierStarts(FLIGHT_OPS[id]).length > 0).sort();
    expect(boat).toEqual(['f14b', 'fa18c', 'su33']);
    expect(carrierStarts(FLIGHT_OPS.fa18c)).toEqual(['caseI', 'carrierGroove']);
    expect(carrierStarts(FLIGHT_OPS.f16c)).toEqual([]);
  });

  it('maps the ball to lens cells, red low cells and Luna-3 colours', () => {
    expect(ballPicture(null, 'iflols')).toMatchObject({ cell: null, tone: null, words: 'No ball' });
    expect(ballPicture(ball({ cell: 0 }), 'iflols')).toMatchObject({ cell: 0, tone: 'caution', words: 'Centred ball' });
    expect(ballPicture(ball({ cell: 2 }), 'iflols').words).toBe('High ball, 2 cells');
    expect(ballPicture(ball({ cell: -1 }), 'iflols').words).toBe('Low ball, 1 cell');
    expect(ballPicture(ball({ cell: -4 }), 'iflols')).toMatchObject({ tone: 'warning', words: 'Red ball: very low' });
    expect(ballPicture(ball({ cell: 9 }), 'iflols').cell).toBe(5);
    expect(ballPicture(ball({ waveoffLights: true, cutLights: true }), 'iflols')).toMatchObject({ waveoff: true, cut: true });
    expect(ballPicture(ball({ luna: 'green' }), 'luna3')).toMatchObject({ cell: null, tone: 'ok' });
    expect(ballPicture(ball({ luna: 'yellow' }), 'luna3').tone).toBe('caution');
    expect(ballPicture(ball({ luna: 'red' }), 'luna3').tone).toBe('warning');
  });

  it('turns DCS comment codes into plain words and builds the grade card', () => {
    expect(commentPlain('(LO)IC')).toBe('a little low in close');
    expect(commentPlain('LULX')).toBe('lined up left at the start');
    expect(commentPlain('_F_AR')).toBe('very fast at the ramp');
    expect(commentPlain('TMRDIM')).toBe('too much rate of descent in the middle');
    expect(commentPlain('??')).toBe('??');
    const ok = gradeCard(score({ comments: ['(H)X'] }));
    expect(ok).toMatchObject({ mark: 'OK', tone: 'ok', result: '3 wire' });
    expect(ok.comments).toEqual([{ code: '(H)X', text: 'a little high at the start' }]);
    expect(gradeCard(score({ grade: 'B', wire: null, bolter: true, total: 40 }))).toMatchObject({ result: 'Bolter', tone: 'caution' });
    expect(gradeCard(score({ grade: 'WO', wire: null, waveoff: true, total: 30 }))).toMatchObject({ result: 'Waved off', tone: 'warning' });
    expect(gradeCard(score({ grade: 'C', wire: null, total: 0 })).result).toBe('Crashed');
  });

  it('has carrier lesson steps per jet and ticks the ball and the trap', () => {
    for (const id of ['fa18c', 'f14b', 'su33'] as const) {
      const d = FLIGHT_OPS[id];
      expect(lessonSteps(d, 'imperial', 'carrier').map(s => s.id)).toEqual(CARRIER_STEP_ORDER);
      expect(lessonSteps(d, 'metric', 'groove').map(s => s.id)).toEqual(GROOVE_STEP_ORDER);
      const steps = lessonSteps(d, 'imperial', 'carrier');
      expect(steps.find(s => s.id === 'configure')!.keys, id).toContain(d.carrier!.hookKey.value);
      const text = steps.map(s => s.text).join(' ');
      expect(text, id).not.toMatch(/!|not verified\) \(not verified/);
      expect(carrierCaption('final', d).text).toContain(id === 'su33' ? 'Luna-3' : 'the ball');
    }
    expect(lessonSteps(FLIGHT_OPS.f14b, 'imperial', 'carrier').find(s => s.id === 'trap')!.text).toContain('MIL');
    expect(stepOrder('groove')).toEqual(GROOVE_STEP_ORDER);
    const done = stepsDone({ gates: [gate('touchdown')], configured: false, onSpeedRunS: 0, ballCalled: true });
    expect(done.has('ball') && done.has('trap')).toBe(true);
    // The airfield lesson never ticks carrier steps.
    expect(stepsDone({ gates: [gate('touchdown')], configured: false, onSpeedRunS: 0 }).has('trap')).toBe(false);
    expect(progressKey('su33', 'carrier')).toBe('flight-ops:su33:carrier');
    expect(progressKey('fa18c', 'groove')).toBe('flight-ops:fa18c:carrier');
  });

  it('plans the Case I gates in the moving landing frame', () => {
    const plan = carrierPlannedGates(FLIGHT_OPS.fa18c);
    expect(plan.map(g => g.id)).toEqual(['initial', 'break', 'abeam', 'ninety', 'groove', 'touchdown']);
    const groove = plan.find(g => g.id === 'groove')!;
    expect(groove.pos.z).toBeGreaterThan(1300);      // astern: +z is aft of the ramp
    expect(groove.pos.y).toBeGreaterThan(70);         // on the glide path above the deck
    expect(plan.find(g => g.id === 'abeam')!.pos.x).toBeLessThan(-2000);   // port side
    expect(carrierPlannedGates(FLIGHT_OPS.fa18c, true).map(g => g.id)).toEqual(['groove', 'touchdown']);
    expect(carrierPlannedGates(FLIGHT_OPS.f16c)).toEqual([]);
  });

  it('prompts the ball call in range and the demo pass ends with a grade', () => {
    const d = FLIGHT_OPS.fa18c;
    const s = createFlightOpsState('fa18c', 'carrierGroove', d);
    const ev = new CarrierEvaluator(d);
    let prompted = false;
    for (let i = 0; i < 60 * 60 && ev.score().total === null; i++) {
      if (ballPrompt(s, d)) prompted = true;
      const cmd = demoPilot(s, d);
      for (const a of cmd.actions) applyAction(s, a, d);
      stepFlightOps(s, cmd, FLIGHT_OPS_DT, d);
      ev.update(s);
    }
    expect(prompted).toBe(true);
    expect(ballPrompt(s, d)).toBe(false);
    expect(gradeCard(ev.score()).result).toMatch(/wire/);
    expect(Math.abs(toLandingOverlay(s).x)).toBeLessThan(20);
  });
});
