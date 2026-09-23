import { describe, expect, it } from 'vitest';
import { FLIGHT_OPS } from '../../data/flightOps';
import { SHIPS } from '../../data/ships';
import { D2R, M_PER_NM } from '../math';
import {
  BALL_CELL_DEG, CarrierEvaluator, FLIGHT_OPS_DT, HOOK_TIME_S, LSO_CALLS, LSO_MIN_INTERVAL_S, LSO_REPEAT_S, aimPointU,
  applyAction, ballFrom, carrierGeometry, carrierGrade, commentText, createFlightOpsState, demoPilot, grooveComments,
  hasCarrierStart, landingHeading, landingToWorld, shipData, stepFlightOps, updateLso, wireAt, wireU,
  type CarrierPassSummary, type FlightOpsJetId, type FlightOpsState,
} from './index';

const CARRIER_JETS: FlightOpsJetId[] = ['fa18c', 'f14b', 'su33'];

function flyCarrier(id: FlightOpsJetId, start: 'caseI' | 'carrierGroove', setup?: (s: FlightOpsState) => void, extraS = Infinity) {
  const d = FLIGHT_OPS[id];
  const s = createFlightOpsState(id, start);
  demoPilot(s, d);
  setup?.(s);
  const ev = new CarrierEvaluator(d);
  let endT = Infinity;
  for (let i = 0; i < 60 * 400 && s.phase !== 'stopped' && s.phase !== 'crashed' && s.t < endT; i++) {
    const c = demoPilot(s, d);
    for (const a of c.actions) applyAction(s, a, d);
    stepFlightOps(s, c, FLIGHT_OPS_DT, d);
    ev.update(s);
    if (s.trap && endT === Infinity) endT = s.t + extraS;
  }
  return { s, score: ev.score() };
}

/** Put the jet in the groove at `rangeM` astern of the ramp with the given glide and lineup errors. */
function placeInGroove(s: FlightOpsState, rangeM: number, glideErrDeg: number, lineupDeg = 0) {
  const ship = shipData(s);
  const toAim = rangeM + aimPointU(ship);
  const v = Math.tan(lineupDeg * D2R) * (ship.landingAreaLengthM + rangeM);
  const p = landingToWorld(s, -rangeM, v);
  s.pos = { x: p.x, y: ship.deckHeightM + toAim * Math.tan((ship.glideDeg.value + glideErrDeg) * D2R), z: p.z };
  s.heading = landingHeading(s);
  s.bank = 0;
}

describe('carrier data', () => {
  it('gives carrier data to the Hornet, Tomcat and Su-33 only', () => {
    for (const id of Object.keys(FLIGHT_OPS) as FlightOpsJetId[]) {
      expect(hasCarrierStart(FLIGHT_OPS[id])).toBe(CARRIER_JETS.includes(id));
    }
    expect(FLIGHT_OPS.fa18c.carrier!.ship).toBe('cvn');
    expect(FLIGHT_OPS.f14b.carrier!.ship).toBe('cvn');
    expect(FLIGHT_OPS.su33.carrier!.ship).toBe('kuznetsov');
    expect(FLIGHT_OPS.fa18c.carrier!.hookKey).toMatchObject({ value: 'H', verified: true });
    expect(FLIGHT_OPS.su33.carrier!.hookKey).toMatchObject({ value: 'LAlt+G', verified: true });
    expect(FLIGHT_OPS.f14b.carrier!.touchdownPower.value).toBe('MIL');
    for (const id of CARRIER_JETS) expect(FLIGHT_OPS[id].carrier!.ballCallKey.verified).toBe(false);
    expect(SHIPS.cvn.glideDeg.verified).toBe(false);
    expect(SHIPS.cvn.glideDeg.note).toMatch(/3\.6/);
    expect(SHIPS.kuznetsov.lso.value).toBe(false);
    expect(SHIPS.kuznetsov.lights).toBe('luna3');
    expect(() => createFlightOpsState('f16c', 'caseI')).toThrow();
  });

  it('maps the hook touchdown point to a wire', () => {
    const ship = SHIPS.cvn;
    expect(wireAt(ship, 0)).toBe(1);
    expect(wireAt(ship, wireU(ship, 1))).toBe(1);
    expect(wireAt(ship, aimPointU(ship))).toBe(3);
    expect(wireAt(ship, wireU(ship, 4) + 1)).toBeNull();
    expect(wireU(SHIPS.kuznetsov, 2) - wireU(SHIPS.kuznetsov, 1)).toBe(12);
  });
});

describe('carrier demo', () => {
  for (const id of CARRIER_JETS) {
    it(`flies Case I and traps the ${id}`, () => {
      const { s, score } = flyCarrier(id, 'caseI');
      expect(s.phase).toBe('stopped');
      expect(s.trap?.wire).toBe(3);
      expect(score.gates.map(g => g.id)).toEqual(['initial', 'break', 'downwind', 'abeam', 'ninety', 'groove', 'touchdown']);
      for (const g of score.gates) expect(g.ok, `${id} ${g.id}: ${g.notes.join('; ')}`).toBe(true);
      expect(['_OK_', 'OK']).toContain(score.grade);
      expect(score.total).toBeGreaterThanOrEqual(85);
      expect(score.verdict).not.toMatch(/!/);
      // The jet rides with the ship after the trap.
      const before = shipData(s).deckHeightM;
      expect(s.pos.y).toBeCloseTo(before);
      if (id === 'su33') expect(score.calls).toEqual([]);
      else expect(score.calls[0]?.text).toBe(LSO_CALLS.rogerBall);
    });

    it(`traps the ${id} from the groove start`, () => {
      const { s, score } = flyCarrier(id, 'carrierGroove');
      expect(s.trap?.wire).not.toBeNull();
      expect(score.grade).toBe('_OK_');
    });
  }

  it('bolters with the hook up and flies away', () => {
    const { s, score } = flyCarrier('fa18c', 'carrierGroove', st => { st.hookDown = false; st.hookPos = 0; }, 15);
    expect(s.trap?.bolter).toBe(true);
    expect(s.phase).toBe('air');
    expect(s.pos.y).toBeGreaterThan(shipData(s).deckHeightM);
    expect(score.grade).toBe('B');
    expect(score.calls.map(c => c.text)).toContain(LSO_CALLS.bolter);
  });

  it('is a ramp strike below deck height at the ramp', () => {
    const d = FLIGHT_OPS.fa18c;
    const s = createFlightOpsState('fa18c', 'carrierGroove');
    const ev = new CarrierEvaluator(d);
    const ship = shipData(s);
    const p = landingToWorld(s, -40, 0);
    s.pos = { x: p.x, y: ship.deckHeightM - 3, z: p.z };
    s.gamma = 0;
    for (let i = 0; i < 120 && s.phase === 'air'; i++) { stepFlightOps(s, { pitch: 0, roll: 0, throttle: 0.5 }, FLIGHT_OPS_DT, d); ev.update(s); }
    expect(s.phase).toBe('crashed');
    expect(s.crashReason).toBe('Ramp strike');
    expect(ev.score()).toMatchObject({ grade: 'C', total: 0 });
  });

  it('animates the hook', () => {
    const d = FLIGHT_OPS.fa18c;
    const s = createFlightOpsState('fa18c', 'caseI');
    applyAction(s, 'hookToggle', d);
    expect(s.hookDown).toBe(true);
    for (let t = 0; t < HOOK_TIME_S / 2; t += FLIGHT_OPS_DT) stepFlightOps(s, { pitch: 0, roll: 0, throttle: s.throttle }, FLIGHT_OPS_DT, d);
    expect(s.hookPos).toBeGreaterThan(0.4);
    expect(s.hookPos).toBeLessThan(0.6);
  });

  it('is deterministic', () => {
    expect(flyCarrier('fa18c', 'caseI').s).toEqual(flyCarrier('fa18c', 'caseI').s);
  });
});

describe('LSO and ball', () => {
  const d = FLIGHT_OPS.fa18c;
  /** LSO step at time t with the jet placed in the groove. */
  function lsoAt(s: FlightOpsState, t: number, rangeNm: number, glideErr: number, lineup = 0) {
    s.t = t;
    placeInGroove(s, rangeNm * M_PER_NM, glideErr, lineup);
    updateLso(s, d, FLIGHT_OPS_DT);
    return s.lso!.calls.map(c => c.text);
  }
  function called() {
    const s = createFlightOpsState('fa18c', 'carrierGroove');
    s.lso!.ballCalled = true;
    lsoAt(s, 0, 0.7, 0);
    return s;
  }

  it('answers the ball call and calls power beyond 1.5° low with hysteresis', () => {
    const s = called();
    expect(s.lso!.calls.map(c => c.text)).toEqual([LSO_CALLS.rogerBall]);
    expect(lsoAt(s, 3, 0.65, -1.4)).toHaveLength(1);
    expect(lsoAt(s, 3.5, 0.65, -1.6).at(-1)).toBe(LSO_CALLS.power);
    // Still low: no repeat until the repeat time.
    expect(lsoAt(s, 3.5 + LSO_MIN_INTERVAL_S + 0.1, 0.6, -1.6)).toHaveLength(2);
    expect(lsoAt(s, 3.5 + LSO_REPEAT_S + 0.1, 0.6, -1.6)).toHaveLength(3);
    // Back on glide path re-arms; low again after the minimum interval calls again.
    lsoAt(s, 8, 0.55, 0);
    expect(lsoAt(s, 8 + LSO_MIN_INTERVAL_S + 0.1, 0.55, -1.6).at(-1)).toBe(LSO_CALLS.power);
  });

  it('calls lineup beyond 1.7° and waves off far off in close', () => {
    const s = called();
    expect(lsoAt(s, 3, 0.7, 0, -1.6)).toHaveLength(1);
    expect(lsoAt(s, 3.2, 0.7, 0, -1.8).at(-1)).toBe(LSO_CALLS.right);
    expect(lsoAt(s, 6, 0.7, 0, 1.8).at(-1)).toBe(LSO_CALLS.left);
    // Far off low at 0.6 nm: power, not a waveoff.
    expect(lsoAt(s, 9, 0.6, -2.8).at(-1)).toBe(LSO_CALLS.power);
    expect(s.lso!.waveoff).toBe(false);
    expect(lsoAt(s, 12, 0.3, -2.8).at(-1)).toBe(LSO_CALLS.waveoff);
    expect(s.lso!.waveoff).toBe(true);
    expect(s.lso!.ball!.waveoffLights).toBe(true);
  });

  it('calls technique: wings, nose, power changes', () => {
    const s = called();
    s.bank = 0;
    lsoAt(s, 3, 0.7, 0);
    s.bank = 25 * D2R; s.t = 5; updateLso(s, d, FLIGHT_OPS_DT);
    expect(s.lso!.calls.at(-1)!.text).toBe(LSO_CALLS.wings);
    s.bank = 0;
    lsoAt(s, 8, 0.6, 0);
    s.pitch += 0.2 * D2R; s.t = 8 + FLIGHT_OPS_DT; updateLso(s, d, FLIGHT_OPS_DT);
    expect(s.lso!.calls.at(-1)!.text).toBe(LSO_CALLS.nose);
    lsoAt(s, 11, 0.55, 0);
    s.throttle += 0.01; s.t = 11 + FLIGHT_OPS_DT; updateLso(s, d, FLIGHT_OPS_DT);
    expect(s.lso!.calls.at(-1)!.text).toBe(LSO_CALLS.it);
  });

  it('stays silent at the Kuznetsov and shows Luna-3 colours', () => {
    const su = FLIGHT_OPS.su33;
    const s = createFlightOpsState('su33', 'carrierGroove');
    s.lso!.ballCalled = true;
    for (const [err, colour] of [[0, 'green'], [1, 'yellow'], [-1, 'red']] as const) {
      placeInGroove(s, 0.6 * M_PER_NM, err);
      updateLso(s, su, FLIGHT_OPS_DT);
      expect(s.lso!.ball!.luna).toBe(colour);
    }
    placeInGroove(s, 0.3 * M_PER_NM, -3);
    updateLso(s, su, FLIGHT_OPS_DT);
    expect(s.lso!.calls).toEqual([]);
    expect(s.lso!.waveoff).toBe(false);
  });

  it('draws the IFLOLS ball in cells', () => {
    expect(ballFrom(0, 0, 'iflols', false, false)).toMatchObject({ cell: 0, luna: null, waveoffLights: false });
    expect(ballFrom(2 * BALL_CELL_DEG, 0, 'iflols', false, false).cell).toBe(2);
    expect(ballFrom(-3, 0, 'iflols', true, false)).toMatchObject({ cell: -5, waveoffLights: true });
    expect(ballFrom(0, 0, 'luna3', true, true)).toMatchObject({ luna: 'green', waveoffLights: false, cutLights: false });
    const s = createFlightOpsState('fa18c', 'carrierGroove');
    expect(carrierGeometry(s).glideErrDeg).toBeCloseTo(0, 5);
    expect(carrierGeometry(s).inGroove).toBe(true);
  });
});

describe('carrier grade', () => {
  const base: CarrierPassSummary = {
    crashed: false, waveoff: false, ownWaveoff: false, bolter: false, wire: 3, targetWire: 3, comments: [],
    ballCalled: true, powerOk: true,
  };
  it('maps passes to DCS grades', () => {
    expect(carrierGrade(base).grade).toBe('_OK_');
    expect(carrierGrade({ ...base, wire: 2 }).grade).toBe('OK');
    expect(carrierGrade({ ...base, waveoff: true, wire: null }).grade).toBe('WO');
    expect(carrierGrade({ ...base, ownWaveoff: true, wire: null }).grade).toBe('OWO');
    expect(carrierGrade({ ...base, bolter: true, wire: null }).grade).toBe('B');
    expect(carrierGrade({ ...base, crashed: true }).grade).toBe('C');
    expect(carrierGrade({ ...base, comments: [{ code: 'LO', mark: 'IC', mag: 3 }] }).grade).toBe('C');
    expect(carrierGrade({ ...base, comments: [{ code: 'LO', mark: 'IC', mag: 2 }] }).grade).toBe('(OK)');
    expect(carrierGrade({ ...base, comments: [{ code: 'H', mark: 'X', mag: 1 }], ballCalled: false }).grade).toBe('OK');
    expect(carrierGrade({ ...base, comments: [{ code: 'H', mark: 'X', mag: 3 }, { code: 'F', mark: 'IM', mag: 1 }] }).grade).toBe('---');
  });

  it('writes comments with position marks', () => {
    const seg = (glide: number, lineup: number, aoa = 0) => ({ t: 1, glide, lineup, aoa, sink: 1, ideal: 1 });
    const c = grooveComments({ X: seg(0, -2), IM: seg(1.2, 0), IC: seg(-0.7, 0, -2.5), AR: seg(-3, 0) });
    expect(c.map(commentText)).toEqual(['LULX', '(H)IM', '(LO)IC', 'FIC', '_LO_AR']);
    expect(grooveComments({ IM: { t: 1, glide: 0, lineup: 0, aoa: 0, sink: 0.3, ideal: 1 } }).map(commentText)).toEqual(['NERDIM']);
  });
});
