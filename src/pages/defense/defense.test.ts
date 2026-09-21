/**
 * [OWNER: page-defense] Tests for the Defense page logic: drill defaults for every jet, headless drill runs
 * (the lesson each drill teaches actually happens in the sim), the debrief score and coaching, the gate
 * reads, the autopilot geometry and the countermeasure keys.
 */
import { describe, expect, test } from 'vitest';
import { Vector3 } from 'three';
import type { AircraftId } from '../../data/types';
import { AIRCRAFT, AIRCRAFT_ORDER } from '../../data/aircraft';
import { MISSILES } from '../../data/missiles';
import { carriersOf } from '../../sim/scenarios';
import { parseChord, splitAlternatives } from '../../ui/keys';
import { relBearing } from '../../sim/math';
import type { Aircraft, Missile } from '../../sim/types';
import { World } from '../../sim/world';
import { notchState } from '../../sim/missile';
import { missileModel } from '../../sim/missileModel';
import { DRILLS, DRILL_ORDER, SCORED_DRILLS, defaultSetup, drillGoal, normalizeSetup, rangeBounds, setupFor, threatsFor, type DrillId } from './drills';
import { DrillRunner } from './runner';
import { debrief, emptyMetrics, missText, type RunMetrics } from './debrief';
import { chaffOdds, seekerGate, signedClosing } from './gates';
import { newPilot, pilotHeading, pressManeuver } from './pilot';
import { RESERVED_KEYS, cmKeys } from './cmkeys';
import { beamWindowDeg } from './explainer';

function fly(ac: AircraftId, drill: DrillId, defend: boolean, seed = 1): DrillRunner {
  const r = new DrillRunner(ac, defaultSetup(drill, ac), AIRCRAFT[ac].units, seed);
  r.start();
  const st = { lastChaff: -9 };
  for (let i = 0; i < 30 * 220 && r.phase === 'run'; i++) {
    if (defend) r.autoDefend(st);
    r.tick(1 / 30, 1 / 30);
  }
  return r;
}

describe('drill defaults', () => {
  test.each(AIRCRAFT_ORDER)('%s: every drill has a threat, a shooter that carries it and a range inside its zone', ac => {
    for (const drill of DRILL_ORDER) {
      const s = defaultSetup(drill, ac);
      expect(threatsFor(drill)).toContain(s.threat);
      expect(DRILLS[drill].seekers).toContain(MISSILES[s.threat].seeker);
      expect(carriersOf(s.threat, ac)).toContain(s.shooter);
      expect(AIRCRAFT[s.shooter].missiles).toContain(s.threat);
      const b = rangeBounds(s, ac);
      expect(s.range).toBeGreaterThanOrEqual(b.min - 1000);
      expect(s.range).toBeLessThanOrEqual(b.max + 1000);
    }
  });

  test('threats follow the player\'s side', () => {
    expect(defaultSetup('lock', 'su27').threat).toBe('aim7m');
    expect(defaultSetup('lock', 'f15c').threat).toBe('r27er');
    expect(defaultSetup('pitbull', 'su27').threat).toBe('aim120c');
    expect(defaultSetup('pitbull', 'fa18c').threat).toBe('r77');
  });
});

describe('headless drills (the lesson happens in the sim)', () => {
  // Three jets from different blocs and RWRs keep this fast; the page itself runs all ten.
  const jets: AircraftId[] = ['su27', 'f15c', 'm2000c'];

  test.each(jets)('%s: every scored drill gets a shot off and resolves', ac => {
    for (const drill of SCORED_DRILLS) {
      const r = fly(ac, drill, true);
      expect(r.metrics.noShot, `${ac} ${drill}`).toBeNull();
      expect(r.metrics.launchT, `${ac} ${drill}`).not.toBeNull();
      expect(r.metrics.result, `${ac} ${drill}`).not.toBeNull();
      expect(r.phase).toBe('end');
    }
  }, 60_000);

  test.each(jets)('%s: break the lock: notching his radar kills the SARH shot, flying straight dies', ac => {
    const good = fly(ac, 'lock', true);
    expect(good.metrics.result).toBe('miss');
    expect(good.metrics.reason).toBe('lost-guidance');
    expect(fly(ac, 'lock', false).metrics.result).toBe('hit');
  }, 30_000);

  test.each(jets)('%s: pitbull: notch and chaff at the spike survives, no defense dies', ac => {
    const good = fly(ac, 'pitbull', true);
    expect(good.metrics.result).toBe('miss');
    expect(good.metrics.chaffUsed).toBeGreaterThan(0);
    expect(good.metrics.seekerGateS).toBeGreaterThan(2);
    expect(fly(ac, 'pitbull', false).metrics.result).toBe('hit');
  }, 30_000);

  test.each(jets)('%s: drag: turning cold at the launch runs a long shot out', ac => {
    const good = fly(ac, 'drag', true);
    expect(good.metrics.result).toBe('miss');
    expect(['kinematic', 'timeout', 'no-acquisition']).toContain(good.metrics.reason);
    expect(fly(ac, 'drag', false).metrics.result).toBe('hit');
  }, 30_000);

  test('late: reacting 4 s after the spike at close range is not enough', () => {
    const r = fly('su27', 'late', true);
    expect(r.metrics.unlockT).not.toBeNull();
    expect(r.metrics.pitbullT).not.toBeNull();
    expect((r.metrics.unlockT ?? 0) - (r.metrics.pitbullT ?? 0)).toBeCloseTo(DRILLS.late.delayS, 0);
    expect(r.metrics.result).toBe('hit');
    // The drill is passed by flying it.
    expect(r.result?.passed).toBe(true);
  }, 30_000);

  test('controls stay locked until the cue', () => {
    const r = new DrillRunner('su27', defaultSetup('pitbull', 'su27'), 'metric', 1);
    r.start();
    for (let i = 0; i < 30 * 20; i++) r.tick(1 / 30, 1 / 30);
    expect(r.metrics.launchT).not.toBeNull();
    expect(r.metrics.pitbullT).toBeNull();
    expect(r.canFly()).toBe(false);
    expect(r.maneuver('notch-l')).toBe(false);
    expect(r.chaff()).toBe(false);
  });
});

function metrics(p: Partial<RunMetrics>): RunMetrics {
  return { ...emptyMetrics('pitbull', 'aim120c', 'tws', 'F-15C', 'AN/APG-63(V)1'), ...p };
}

describe('debrief', () => {
  test('a clean notch with chaff scores high and passes', () => {
    const d = debrief(metrics({
      launchT: 10, pitbullT: 30, unlockT: 30, reactT: 30.8, result: 'miss', reason: 'chaff', endT: 45,
      seekerGateS: 9, defendS: 14, settledS: 10, chaffUsed: 10, chaffGood: 9,
    }));
    expect(d.survived).toBe(true);
    expect(d.passed).toBe(true);
    expect(d.score).toBeGreaterThanOrEqual(90);
    expect(d.why).toMatch(/chaff/);
  });

  test('against a SARH shot, breaking his illumination is full notch marks, however short', () => {
    const d = debrief({ ...metrics({ launchT: 8, unlockT: 8, reactT: 8.5, illumLostT: 20, result: 'miss', reason: 'lost-guidance', endT: 44, radarGateS: 1.1, defendS: 12, settledS: 1 }), drill: 'lock', missile: 'aim7m', method: 'stt' });
    expect(d.parts.find(p => p.id === 'discipline')?.pts).toBe(20);
    expect(d.score).toBeGreaterThanOrEqual(90);
  });

  test('no defense: zero timing, a hit, and coaching that says so', () => {
    const d = debrief(metrics({ launchT: 10, pitbullT: 30, unlockT: 30, result: 'hit', reason: 'hit', endT: 44 }));
    expect(d.survived).toBe(false);
    expect(d.passed).toBe(false);
    expect(d.parts.find(p => p.id === 'timing')?.pts).toBe(0);
    expect(d.coaching.join(' ')).toMatch(/never defended/);
  });

  test('wasted chaff and flares are called out', () => {
    const d = debrief(metrics({
      launchT: 10, pitbullT: 30, unlockT: 30, reactT: 31, result: 'miss', reason: 'notched', endT: 45,
      seekerGateS: 8, defendS: 14, chaffUsed: 10, chaffGood: 2, flaresUsed: 3,
    }));
    expect(d.parts.find(p => p.id === 'chaff')?.pts).toBeLessThan(5);
    const text = d.coaching.join(' ');
    expect(text).toMatch(/8 of 10 chaff/);
    expect(text).toMatch(/Flares do nothing/);
  });

  test('the late drill passes when flown, even when hit', () => {
    const d = debrief({ ...metrics({ launchT: 5, pitbullT: 13, unlockT: 17, reactT: 17.2, result: 'hit', reason: 'hit', endT: 26, rangeAtUnlock: 9000, ttiAtUnlock: 8 }), drill: 'late' });
    expect(d.passed).toBe(true);
    expect(d.coaching.join(' ')).toMatch(/not enough time/);
  });

  test('every miss reason has a pilot sentence', () => {
    const reasons = ['notched', 'chaff', 'flare', 'kinematic', 'lost-guidance', 'no-acquisition', 'target-dead', 'timeout', 'ground', 'overshoot', 'hit'] as const;
    for (const r of reasons) expect(missText(r, metrics({}))).toMatch(/^The AIM-120C/);
  });

  test('a shot denied by an early notch is coached as a good trade', () => {
    const d = debrief({ ...metrics({ notchT: 3, noShot: 'R-27ER needs a lock (STT)' }), drill: 'free', missile: 'r27er', method: 'stt' });
    expect(d.headline).toBe('No shot');
    expect(d.coaching.join(' ')).toMatch(/good trade/);
  });
});

describe('gates and geometry', () => {
  test('signed closing: + when the target flies at the observer', () => {
    const obs = new Vector3(0, 0, 0);
    expect(signedClosing(obs, new Vector3(0, 0, -1000), new Vector3(0, 0, 200))).toBeCloseTo(200);
    expect(signedClosing(obs, new Vector3(0, 0, -1000), new Vector3(0, 0, -200))).toBeCloseTo(-200);
    expect(signedClosing(obs, new Vector3(0, 0, -1000), new Vector3(200, 0, 0))).toBeCloseTo(0);
  });

  test('notch left puts the threat at 3 o\'clock, notch right at 9, drag at 6', () => {
    const me = { pos: new Vector3(0, 9000, 0), heading: 0, vel: new Vector3(0, 0, -250) } as unknown as Aircraft;
    const threat = new Vector3(0, 9000, -40000);
    const p = newPilot(me);
    pressManeuver(p, 'notch-l', me, threat);
    (me as { heading: number }).heading = pilotHeading(p, me, threat);
    expect(relBearing(me.pos, me.heading, threat) * 180 / Math.PI).toBeCloseTo(90, 5);
    pressManeuver(p, 'notch-r', me, threat);
    (me as { heading: number }).heading = pilotHeading(p, me, threat);
    expect(relBearing(me.pos, me.heading, threat) * 180 / Math.PI).toBeCloseTo(-90, 5);
    pressManeuver(p, 'drag', me, threat);
    (me as { heading: number }).heading = pilotHeading(p, me, threat);
    expect(Math.abs(relBearing(me.pos, me.heading, threat) * 180 / Math.PI)).toBeCloseTo(180, 5);
  });

  test('beam window matches the research table (54 kt gate at 450 kt: about ±6.9°)', () => {
    expect(beamWindowDeg(54, 450)).toBeCloseTo(6.9, 1);
    expect(beamWindowDeg(113, 450)).toBeCloseTo(14.5, 1);
  });
});

describe('countermeasure keys', () => {
  test.each(AIRCRAFT_ORDER)('%s: chaff and flare keys are real chords that do not steer', ac => {
    const k = cmKeys(ac);
    for (const key of [k.chaff, k.flare]) {
      const alts = splitAlternatives(key.bind);
      expect(alts.length).toBeGreaterThan(0);
      for (const a of alts) {
        expect(parseChord(a), `${ac}: ${a}`).not.toBeNull();
        if (!['C', 'F'].includes(a.trim())) expect(RESERVED_KEYS).not.toContain(a.trim());
      }
    }
  });

  test('FC3 jets use Insert / Delete; the Hornet keeps E for chaff and explains D', () => {
    expect(cmKeys('su27').chaff).toMatchObject({ dcsKey: 'Insert', exact: true });
    expect(cmKeys('f15c').flare).toMatchObject({ dcsKey: 'Delete', exact: true });
    expect(cmKeys('fa18c').chaff).toMatchObject({ dcsKey: 'E', exact: true });
    const fl = cmKeys('fa18c').flare;
    expect(fl.exact).toBe(false);
    expect(fl.note).toMatch(/steers/);
  });
});

describe('review fixes', () => {
  test('PD-STT Phoenix debrief teaches breaking radar support rather than waiting for active', () => {
    const result = debrief(metrics({ missile: 'aim54c', method: 'stt', launchRange: 40000, launchT: 5, unlockT: 5, reactT: 6, result: 'miss', reason: 'lost-guidance', illumLostT: 18, endT: 25 }));
    expect(result.coaching.join(' ')).toMatch(/no illumination.*went dumb/);
    expect(result.coaching.join(' ')).not.toMatch(/beam the missile itself/i);
  });

  test('setup: a SARH threat or a shooter without TWS never keeps TWS selected', () => {
    const sarh = { ...setupFor('free', 'su27', 'aim7m'), method: 'tws' as const };
    expect(normalizeSetup(sarh).method).toBe('auto');
    const noTws = { ...setupFor('pitbull', 'f15c', 'r77'), method: 'tws' as const };   // J-11A / MiG-29S: FC3, no TWS shot
    expect(normalizeSetup(noTws).method).toBe('auto');
    const stt = { ...setupFor('pitbull', 'su27', 'aim120c'), method: 'stt' as const };
    expect(normalizeSetup(stt).method).toBe('stt');
  });

  test('drill goal: the F-14 warns for an STT Phoenix; an STT R-77 is flagged as simplified', () => {
    const phoenix = { ...setupFor('pitbull', 'su27', 'aim54c'), method: 'stt' as const };
    expect(drillGoal(phoenix)).toMatch(/launch warning/);
    expect(drillGoal(phoenix)).not.toMatch(/no launch warning/);
    expect(drillGoal(phoenix)).toMatch(/never reaches pitbull/);
    expect(normalizeSetup(phoenix).method).toBe('tws');
    expect(normalizeSetup({ ...phoenix, drill: 'free' }).method).toBe('stt');
    const r77 = setupFor('pitbull', 'f15c', 'r77');
    expect(drillGoal(r77)).toMatch(/no launch warning \(simplified\)/);
  });

  test('late-drill coaching uses the pilot\'s units', () => {
    const late = { ...metrics({ launchT: 5, pitbullT: 13, unlockT: 17, reactT: 17.2, result: 'hit', reason: 'hit', endT: 26, rangeAtUnlock: 9260, ttiAtUnlock: 8 }), drill: 'late' as const };
    expect(debrief(late, 'imperial').coaching.join(' ')).toMatch(/5\.0 nm out/);
    expect(debrief(late, 'metric').coaching.join(' ')).toMatch(/9\.3 km out/);
  });

  test('chaff odds follow the sim: none once the seeker is on chaff, full only inside the gate after a notch drop', () => {
    const world = new World(1);
    const me = world.spawnAircraft({ side: 'blue', type: 'f15c', controller: 'player', pos: { x: 0, y: 5000, z: 0 }, heading: Math.PI / 2, speed: 250 });
    const m = { id: 'm1', type: 'aim120c', alive: true, guidance: 'active', pos: new Vector3(0, 8000, -8000), vel: new Vector3(0, 0, 600), aimPos: me.pos.clone(), aimVel: me.vel.clone(), targetId: me.id, seekerOn: me.id } as unknown as Missile;
    const full = missileModel('aim120c').chaffChance;
    expect(chaffOdds(world, m, me)).toBeGreaterThan(full * 0.9);           // beaming, tracked: about the full chance
    (m as { seekerOn: string | null }).seekerOn = 'chaff-7';
    expect(chaffOdds(world, m, me)).toBe(0);                               // already on a chaff cloud
    (m as { seekerOn: string | null }).seekerOn = null;
    expect(chaffOdds(world, m, me)).toBeCloseTo(full);                      // dropped you, still in the gate
    me.vel.set(0, 0, -250);                                                 // turned hot on it: out of the gate
    expect(chaffOdds(world, m, me)).toBe(0);
  });

  test('the seeker gauge follows the sim through live flight and clears after the missile ends', () => {
    const run = new DrillRunner('f15c', defaultSetup('pitbull', 'f15c'), 'imperial', 3);
    run.start();
    let checked = 0;
    for (let i = 0; i < 3000 && run.phase === 'run'; i++) {
      run.tick(1 / 30, 1 / 30);
      const missile = run.missile();
      if (!missile) continue;
      const state = notchState(run.world, missile);
      const gauge = seekerGate(run.world, missile, run.me);
      if (state?.targetId === run.me.id) {
        expect(gauge.gate).toBe(state.gateMps);
        expect(gauge.inGate).toBe(state.inNotch);
        expect(gauge.depth).toBe(state.depth);
        checked++;
      } else expect(gauge.on).toBe(false);
    }
    expect(checked).toBeGreaterThan(10);
    expect(seekerGate(run.world, run.missile(), run.me).on).toBe(false);
  });

  test('free practice: already cranking when the missile leaves the rail counts as reacting at the launch; Hot never counts', () => {
    const r = new DrillRunner('f15c', defaultSetup('free', 'f15c'), 'imperial', 3);
    r.start();
    expect(r.maneuver('hot')).toBe(true);
    for (let i = 0; i < 30 * 60 && r.metrics.launchT === null && r.phase === 'run'; i++) {
      if (i === 30) r.maneuver('crank');
      r.tick(1 / 30, 1 / 30);
    }
    expect(r.metrics.launchT).not.toBeNull();
    expect(r.metrics.reactT).toBe(r.metrics.launchT);

    const l = new DrillRunner('su27', defaultSetup('lock', 'su27'), 'metric', 1);
    l.start();
    for (let i = 0; i < 30 * 60 && !l.canFly(); i++) l.tick(1 / 30, 1 / 30);
    expect(l.canFly()).toBe(true);
    l.maneuver('hot');
    expect(l.metrics.reactT).toBeNull();
    l.maneuver('notch-l');
    expect(l.metrics.reactT).not.toBeNull();
  });
});
