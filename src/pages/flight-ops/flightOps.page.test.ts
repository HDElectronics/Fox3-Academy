import { describe, expect, it } from 'vitest';
import { FLIGHT_OPS } from '../../data/flightOps';
import { ROUTES, routeFor } from '../../app/routes';
import { LESSON_LINKS, PRACTICE_LINKS, destinationFor } from '../../app/navigation';
import { ApproachEvaluator, FLIGHT_OPS_DT, applyAction, createFlightOpsState, demoPilot, stepFlightOps, type GateResult, type NavState } from '../../sim/flightOps';
import {
  FLIGHT_OPS_JETS, NAV_STEP_ORDER, STEP_ORDER, currentStep, flapControl, gateState, gatesForStart, indexerLamps, isFlightOpsJet, lampToken,
  lessonPassed, navMilestones, navPicture, placeGates, plannedGates, pointAt, stepsDone, type FlownPoint,
} from './logic';
import { legCaption, lessonSteps } from './lesson';
import { stickFromPoint } from './touch';

const gate = (id: GateResult['id'], ok = true): GateResult => ({ id, label: id, passedAt: 0, ok, notes: [] });

describe('flight-ops page logic', () => {
  it('supports every jet with flight-ops data and rejects anything else', () => {
    expect(FLIGHT_OPS_JETS).toHaveLength(10);
    for (const id of Object.keys(FLIGHT_OPS)) expect(isFlightOpsJet(id)).toBe(true);
    for (const id of ['su27', 'm2000c', 'f14b', 'mig29s']) expect(isFlightOpsJet(id)).toBe(true);
    for (const id of ['a10c', 'toString', '', null, undefined]) expect(isFlightOpsJet(id)).toBe(false);
  });

  it('knows which jets have a flap selector', () => {
    expect(flapControl(FLIGHT_OPS.m2000c)).toBe('none');
    expect(flapControl(FLIGHT_OPS.f16c)).toBe('with-gear');
    expect(flapControl(FLIGHT_OPS.fa18c)).toBe('selector');
    expect(lessonSteps(FLIGHT_OPS.m2000c).find(s => s.id === 'configure')!.text).toContain('No flap selector');
    expect(lessonSteps(FLIGHT_OPS.m2000c).find(s => s.id === 'configure')!.keys).toBe('G');
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

  it('places a reached gate where the jet passed it and keeps pending gates on the plan', () => {
    const plan = plannedGates(FLIGHT_OPS.fa18c);
    const track: FlownPoint[] = [0, 1, 2, 3].map(t => ({ t, x: t * 100, y: 250, z: -t * 10, heading: 0.1 }));
    expect(pointAt([], 1)).toBeNull();
    expect(pointAt(track, 1.4)!.t).toBe(1);
    expect(pointAt(track, 1.6)!.t).toBe(2);
    const placed = placeGates(plan, [{ ...gate('initial'), passedAt: 2 }, { ...gate('break', false), passedAt: 3 }], track);
    const ini = placed.find(g => g.id === 'initial')!;
    expect(ini).toMatchObject({ state: 'ok', flown: true, pos: { x: 200, y: 250, z: -20 }, headingRad: 0.1 });
    expect(placed.find(g => g.id === 'break')).toMatchObject({ state: 'miss', flown: true, pos: { x: 300 } });
    const ninety = placed.find(g => g.id === 'ninety')!;
    expect(ninety.state).toBe('pending');
    expect(ninety.pos).toEqual(plan.find(g => g.id === 'ninety')!.pos);
    // No flown point near the result time: keep the planned ring, coloured.
    const far = placeGates(plan, [{ ...gate('initial'), passedAt: 50 }], track).find(g => g.id === 'initial')!;
    expect(far).toMatchObject({ state: 'ok', flown: false, pos: plan[0]!.pos });
    expect(gatesForStart(plan, true).map(g => g.id)).toEqual(['groove', 'touchdown']);
    expect(gatesForStart(plan, false)).toHaveLength(plan.length);
  });

  it('maps the nav state onto the display picture', () => {
    const nav: NavState = {
      mode: 'landing', label: 'ПОС', target: { x: 0, z: -150, name: 'Aim point' }, distM: 5500, bearing: 0.2, steerHeading: -0.1,
      commandAltM: 288, glideDevDeg: 0.7, locDevDeg: -5, call: 'Above glide path',
    };
    const p = navPicture(nav, 0.1, 'metric');
    expect(p.mode).toBe('ПОС');
    expect(p.relBearing).toBeCloseTo(0.1);
    expect(p.steerErrDeg).toBeCloseTo(-0.2 * 180 / Math.PI);
    expect(p.dist).toBe('5.5 km');
    expect(p.cmdAlt).toBe('290 m');
    expect(p.glideBar).toBeCloseTo(-0.5);   // high: the path is below
    expect(p.locBar).toBe(1);               // far left: the path is right, pinned at full scale
    expect(p.call).toBe('Above glide path');
    const q = navPicture({ ...nav, mode: 'return', label: 'ВЗВ', glideDevDeg: null, locDevDeg: null, commandAltM: null, distM: 30000, bearing: 3.2, steerHeading: 3.1 }, -3.1, 'imperial');
    expect(q.landing).toBe(false);
    expect(q.glideBar).toBeNull();
    expect(q.cmdAlt).toBeNull();
    expect(q.dist).toBe('16 nm');
    expect(Math.abs(q.relBearing)).toBeLessThan(Math.PI);
  });

  it('ticks the nav milestones: steering mode, intercept, on glide path', () => {
    const d = FLIGHT_OPS.su27;
    const base: NavState = { mode: 'route', label: 'МРШ', target: { x: -18000, z: 30000, name: 'WP1' }, distM: 9000, bearing: 0, steerHeading: 0, commandAltM: 3000, glideDevDeg: null, locDevDeg: null, call: null };
    expect(navMilestones(base, d, 0, 0.1)).toEqual({ steering: false, intercept: false, onGlideRunS: 0 });
    const icpt = { ...base, mode: 'return' as const, label: 'ВЗВ', target: { x: 0, z: 12000, name: 'Glide-slope intercept' }, distM: 2500 };
    expect(navMilestones(icpt, d, 0, 0.1)).toMatchObject({ steering: true, intercept: true });
    const land = { ...icpt, mode: 'landing' as const, label: 'ПОС', glideDevDeg: 0.2, locDevDeg: 0 };
    expect(navMilestones(land, d, 2.95, 0.1).onGlideRunS).toBeCloseTo(3.05);
    expect(navMilestones({ ...land, glideDevDeg: 1.5 }, d, 2.95, 0.1).onGlideRunS).toBe(0);
    // F-15C has no return mode: NAV on the IAF is the steering mode.
    const eagle = { ...icpt, mode: 'route' as const, label: 'NAV', target: { x: 0, z: 12000, name: 'IAF' }, distM: 20000 };
    expect(navMilestones(eagle, FLIGHT_OPS.f15c, 0, 0.1)).toMatchObject({ steering: true, intercept: false });
    expect(navMilestones(undefined, d, 5, 0.1)).toEqual({ steering: false, intercept: false, onGlideRunS: 0 });
    expect(stepsDone({ gates: [], configured: false, onSpeedRunS: 0, nav: { steering: true, intercept: true, onGlideRunS: 3 } }))
      .toEqual(new Set(['navmode', 'steer', 'glidepath']));
    expect(currentStep(new Set(['navmode']), NAV_STEP_ORDER)).toBe('steer');
  });

  it('gives nav jets the return-to-base steps and keeps the pattern steps for the others', () => {
    for (const id of FLIGHT_OPS_JETS) {
      const d = FLIGHT_OPS[id];
      expect(lessonSteps(d, 'imperial', true).map(s => s.id)).toEqual(d.nav ? NAV_STEP_ORDER : STEP_ORDER);
    }
    const ru = lessonSteps(FLIGHT_OPS.mig29s, 'metric', true);
    expect(ru[0]!.text).toContain('ВЗВ');
    expect(ru[0]!.keys).toBe('1');
    expect(ru[1]!.text).toContain('12 km');
    expect(ru[1]!.text).toContain('600 m');
    expect(ru[2]!.text).toContain('ПОС');
    expect(lessonSteps(FLIGHT_OPS.f15c, 'imperial', true)[2]!.text).toContain('ILSN');
    expect(lessonSteps(FLIGHT_OPS.su27, 'metric').find(s => s.id === 'initial')!.text).toContain(' m AGL');
    expect(legCaption('approach', FLIGHT_OPS.f15c).why).toContain('GSUP');
    expect(legCaption('nav', FLIGHT_OPS.su27, 'metric', { mode: 'return', label: 'ВЗВ', target: { x: 0, z: 12000, name: 'Glide-slope intercept' }, distM: 20000, bearing: 0, steerHeading: 0, commandAltM: 600, glideDevDeg: null, locDevDeg: null, call: null }).text)
      .toBe('ВЗВ: steering to Glide-slope intercept, 20 km.');
  });

  it('maps a touch on the stick pad to a clamped deflection, down = pull', () => {
    const rect = { left: 0, top: 0, width: 100, height: 100 };
    expect(stickFromPoint(50, 50, rect)).toEqual({ x: 0, y: 0 });
    const p = stickFromPoint(50, 90, rect);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(1);
    const c = stickFromPoint(200, 200, rect);
    expect(Math.hypot(c.x, c.y)).toBeCloseTo(1);
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
