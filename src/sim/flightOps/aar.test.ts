import { describe, expect, it } from 'vitest';
import { FLIGHT_OPS } from '../../data/flightOps';
import { TANKERS } from '../../data/tankers';
import {
  AarEvaluator, FLIGHT_OPS_DT, STATION_MS_PER_THROTTLE, applyAction, createFlightOpsState, basketRest, demoPilot,
  hoseBandAt, levelThrottle, stepFlightOps, tankerPose,
  type FlightOpsAction, type FlightOpsInput, type FlightOpsJetId, type FlightOpsState,
} from './index';

type Cmd = FlightOpsInput & { actions: FlightOpsAction[] };
type Pilot = (s: FlightOpsState) => Cmd;

function fly(id: FlightOpsJetId, start: 'aarRejoin' | 'aarPrecontact', pilot?: Pilot, maxS = 600) {
  const d = FLIGHT_OPS[id];
  const s = createFlightOpsState(id, start, d);
  const ev = new AarEvaluator(d);
  const p: Pilot = pilot ?? (st => demoPilot(st, d));
  for (let i = 0; i < 60 * maxS && s.phase !== 'crashed' && ev.score(s).total === null; i++) {
    const c = p(s);
    for (const a of c.actions) applyAction(s, a, d);
    stepFlightOps(s, c, FLIGHT_OPS_DT, d);
    ev.update(s);
  }
  return { s, score: ev.score(s) };
}

describe('refuelling data', () => {
  it('gives the Su-33 the IL-78M, the F-16C the boom and the Hornet a drogue; no AAR for the others', () => {
    expect(FLIGHT_OPS.su33.aar?.tanker).toBe('il78m');
    expect(FLIGHT_OPS.f16c.aar?.kind).toBe('boom');
    expect(FLIGHT_OPS.f15c.aar?.kind).toBe('boom');
    expect(FLIGHT_OPS.fa18c.aar?.kind).toBe('probe');
    for (const id of ['su27', 'j11a', 'mig29s'] as const) {
      expect(FLIGHT_OPS[id].aar).toBeUndefined();
      expect(() => createFlightOpsState(id, 'aarRejoin')).toThrow();
      expect(() => createFlightOpsState(id, 'aarPrecontact')).toThrow();
    }
    expect(() => createFlightOpsState('f16c', 'aarRejoin', FLIGHT_OPS.f16c, { tanker: 'il78m' })).toThrow();
  });
  it('keeps the sourced Su-33 and F-16C facts', () => {
    const su = FLIGHT_OPS.su33.aar!;
    expect(su.keys.probe).toMatchObject({ value: 'LCtrl+R', verified: true });
    expect(su.keys.lights).toMatchObject({ value: 'LAlt+R', verified: true });
    expect(su.window?.ias.value).toEqual([500, 570]);
    expect(su.window?.alt.value).toEqual([2000, 9000]);
    expect(su.holdBelowPodM?.value).toEqual([3, 6]);
    const f16 = FLIGHT_OPS.f16c.aar!;
    expect(f16.keys.door?.verified).toBe(false);
    expect(f16.doorLimit?.operateKt.value).toBe(400);
    expect(f16.doorLimit?.openMach.value).toBe(0.95);
    expect(FLIGHT_OPS.fa18c.aar!.keys.probe?.verified).toBe(false);
    expect(FLIGHT_OPS.m2000c.aar!.closureKt).toMatchObject({ value: [2, 3], verified: true });
  });
  it('maps cone-to-pod distance to the UPAZ hose bands', () => {
    const T = TANKERS.il78m;
    expect(hoseBandAt(T, 5)).toBe('yellow');
    expect(hoseBandAt(T, 14)).toBe('yellowGreen');
    expect(hoseBandAt(T, 19)).toBe('green');
    expect(hoseBandAt(T, 23)).toBe('greenRed');
    expect(hoseBandAt(T, 25)).toBe('red');
    expect(hoseBandAt(T, 1)).toBeNull();
  });
  it('flies the tanker on a closed racetrack', () => {
    const T = TANKERS.kc135;
    const a = tankerPose(T, 0);
    expect(a).toMatchObject({ x: 0, z: -0, heading: 0 });
    const v = T.speedKt.value * 0.514444;
    const r = v * v / (9.80665 * Math.tan(T.racetrack.bankDeg.value * Math.PI / 180));
    const per = (2 * T.racetrack.legNm.value * 1852 + 2 * Math.PI * r) / v;
    const b = tankerPose(T, per);
    expect(Math.hypot(b.x, b.z)).toBeLessThan(1);
    expect(tankerPose(T, per / 2).heading).toBeCloseTo(Math.PI, 3);
  });
});

describe('refuelling demo', () => {
  for (const id of ['su33', 'f16c', 'fa18c'] as const) {
    it(`rejoins, refuels and disconnects cleanly: ${id}`, () => {
      const { s, score } = fly(id, 'aarRejoin');
      const a = s.aar!;
      expect(s.phase).toBe('air');
      expect(a.refuelComplete).toBe(true);
      expect(a.timeInEnvelopeS).toBeGreaterThanOrEqual(29);
      expect(a.disconnects.at(-1)?.clean).toBe(true);
      expect(a.bounces + a.misses).toBe(0);
      expect(score.gates.map(g => g.id)).toEqual(['rejoin', 'precontact', 'contact', 'envelope', 'disconnect']);
      expect(score.gates.every(g => g.ok), JSON.stringify(score.gates)).toBe(true);
      expect(score.total).toBe(100);
    });
  }
  it('holds the Su-33 3–6 m below the pod in the green band', () => {
    const { score } = fly('su33', 'aarPrecontact');
    expect(score.total).toBe(100);
    expect(score.gates.map(g => g.id)).toEqual(['precontact', 'contact', 'envelope', 'disconnect']);
    const env = score.gates.find(g => g.id === 'envelope')!;
    const m = env.notes.join(' ').match(/Held ([\d.]+)–([\d.]+) m below/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(3);
    expect(Number(m![2])).toBeLessThanOrEqual(6);
  });
  it('is deterministic', () => {
    const a = fly('fa18c', 'aarRejoin').s;
    const b = fly('fa18c', 'aarRejoin').s;
    expect(b.pos).toEqual(a.pos);
    expect(b.aar!.calls).toEqual(a.aar!.calls);
    expect(b.t).toBe(a.t);
  });
});

/** Station-mode pilot that closes at a fixed rate once cleared (aligned by the demo until then). */
function closeAt(id: FlightOpsJetId, kt: number): Pilot {
  const d = FLIGHT_OPS[id];
  return s => {
    const c = demoPilot(s, d);
    const a = s.aar!;
    if (!a.cleared || a.connected || a.bounces > 0) return c;
    const want = kt * 0.514444;
    return { ...c, throttle: levelThrottle(s, d, a.tankerSpeedMs) + (want + 0.8 * (want - a.closureMs)) / STATION_MS_PER_THROTTLE };
  };
}

describe('refuelling rules', () => {
  it('bounces off the basket with too much closure', () => {
    const { s } = fly('fa18c', 'aarPrecontact', closeAt('fa18c', 9), 60);
    expect(s.aar!.bounces).toBeGreaterThan(0);
    expect(s.aar!.contacts[0]?.t ?? Infinity).toBeGreaterThan(s.aar!.calls.find(c => c.text.startsWith('Bounce'))!.t);
  });
  it('disconnects when the hose band stays red', () => {
    const d = FLIGHT_OPS.su33;
    // Hold just inside the full trail (red band) once connected.
    const pilot: Pilot = s => {
      const c = demoPilot(s, d);
      const a = s.aar!;
      if (!a.connected) return c;
      const T = TANKERS.il78m;
      const pod = T.drogue!.pod, rest = basketRest(T);
      const k = 25 / T.drogue!.trailM.value;
      const P = pod.aft + (rest.aft - pod.aft) * k;
      const want = clamp((a.tip.aft - P) * 0.25, -0.5, 0.5);
      return { ...c, throttle: levelThrottle(s, d, a.tankerSpeedMs) + (want + 0.8 * (want - a.closureMs)) / STATION_MS_PER_THROTTLE };
    };
    const { s, score } = fly('su33', 'aarPrecontact', pilot, 40);
    const a = s.aar!;
    expect(a.disconnects[0]?.reason).toBe('Hose band red');
    expect(a.disconnects[0]?.clean).toBe(false);
    expect(score.total).toBeNull();
  });
  it('refuses contact with the probe in', () => {
    const d = FLIGHT_OPS.fa18c;
    const pilot: Pilot = s => {
      const c = demoPilot(s, d);
      return { ...c, actions: s.aar!.probeOut && s.t < 0.1 ? ['probeToggle'] : c.actions.filter(x => x !== 'probeToggle') };
    };
    const { s } = fly('fa18c', 'aarPrecontact', pilot, 60);
    expect(s.aar!.contacts).toHaveLength(0);
    expect(s.aar!.misses).toBeGreaterThan(0);
  });
  it('refuses the F-16C door above 400 kt', () => {
    const s = createFlightOpsState('f16c', 'aarRejoin');
    s.speed = 420 * 0.514444;
    applyAction(s, 'doorToggle');
    expect(s.aar!.doorOpen).toBe(false);
    expect(s.aar!.errors[0]).toMatch(/400 kt/);
  });
});

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
