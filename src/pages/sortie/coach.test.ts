import { describe, expect, test } from 'vitest';
import type { SimEvent } from '../../sim/types';
import {
  coachSortie, describeShot, firstReaction, sampleAt, scoreSortie,
  type BanditSample, type CoachInput, type Sample, type ShotRecord, type ThreatSample,
} from './coach';

// ───────────────────────────────────────── builders

function shot(p: Partial<ShotRecord> & Pick<ShotRecord, 'id' | 'shooterId' | 't'>): ShotRecord {
  return {
    label: p.shooterId === 'player' ? 'M1' : 'R-77', missile: p.shooterId === 'player' ? 'aim120c' : 'r77',
    targetId: p.shooterId === 'player' ? 'bandit1' : 'player', side: p.shooterId === 'player' ? 'blue' : 'red',
    range: 40000, rmax: 60000, rne: 20000, rmin: 2000, radarMode: 'tws', targetAspectDeg: 10,
    shooterAlt: 9000, targetAlt: 9000, shooterMach: 0.9, endT: p.t + 40, outcome: 'miss', reason: 'kinematic',
    fPole: 20000, warnedAt: null, warnKind: null, pitbullAt: null, datalinkLost: null, seekerLost: null, support: null,
    ...p,
  };
}

function bandit(p: Partial<BanditSample> = {}): BanditSample {
  return { id: 'bandit1', alive: true, range: 60000, offNoseDeg: 5, banditHotDeg: 5, rne: 18000, rmax: 45000, defending: false, ...p };
}

function threat(p: Partial<ThreatSample> & Pick<ThreatSample, 'id'>): ThreatSample {
  return { shooterId: 'bandit1', missile: 'r77', seeker: 'arh', guidance: 'active', range: 10000, offNoseDeg: 5, altAbove: 0, ...p };
}

function sample(t: number, p: Partial<Sample> = {}): Sample {
  return { t, alive: true, alt: 9000, speed: 260, radarMode: 'tws', sttTarget: null, designated: [], rwrTop: 'none', bandits: [bandit()], threats: [], ...p };
}

/** Samples every 0.5 s from t0 to t1, shaped by fn. */
function run(t0: number, t1: number, fn: (t: number) => Partial<Sample>): Sample[] {
  const out: Sample[] = [];
  for (let t = t0; t <= t1 + 1e-9; t += 0.5) out.push(sample(t, fn(t)));
  return out;
}

function input(p: Partial<CoachInput>): CoachInput {
  return {
    playerId: 'player', playerType: 'f15c', friends: [], enemies: ['bandit1', 'bandit2'],
    names: { player: 'You', bandit1: 'Bandit-1', bandit2: 'Bandit-2', wingman: 'Wingman' },
    units: 'metric', gimbalDeg: 60, twsLaunch: true, autoStt: false,
    events: [], shots: [], samples: run(0, 120, () => ({})), actions: [], endT: 120, playerMissilesLeft: 4,
    ...p,
  };
}

const texts = (inp: CoachInput) => coachSortie(inp).map(i => `${i.kind}|${i.title}|${i.text}`);

// ───────────────────────────────────────── rules

describe('coachSortie', () => {
  test('locking another bandit while a Fox 3 is on datalink', () => {
    const m3 = shot({ id: 'M9', label: 'M3', shooterId: 'player', t: 20, targetId: 'bandit1', outcome: 'miss', reason: 'no-acquisition', datalinkLost: { t: 31, why: 'shooter lost the track' } });
    const events: SimEvent[] = [{ t: 30.8, type: 'lock', ownerId: 'player', targetId: 'bandit2', what: 'locked' }];
    const out = texts(input({ shots: [m3], events }));
    expect(out.some(t => t.startsWith('mistake|Datalink cut|You locked Bandit-2 while M3 was still on datalink to Bandit-1: M3 lost support and'))).toBe(true);
  });

  test('breaking the lock with a Fox 1 in the air is a mistake; the lesson names STT', () => {
    const m1 = shot({ id: 'M2', shooterId: 'player', t: 10, missile: 'r27er', radarMode: 'stt', outcome: 'miss', reason: 'lost-guidance', seekerLost: { t: 22, why: 'lost-guidance' } });
    const out = texts(input({ shots: [m1], actions: [{ t: 20.5, kind: 'unlock' }] }));
    expect(out.find(t => t.includes('Lock lost with a Fox 1'))).toMatch(/You unlocked while M1 still needed your lock.*STT all the way to impact/);
  });

  test('cranking past the gimbal is blamed on the gimbal', () => {
    const m1 = shot({ id: 'M2', shooterId: 'player', t: 10, outcome: 'miss', reason: 'no-acquisition', datalinkLost: { t: 30, why: 'shooter lost the track' } });
    const samples = run(0, 60, t => ({ bandits: [bandit({ offNoseDeg: t > 25 ? 64 : 40 })] }));
    const out = texts(input({ shots: [m1], samples }));
    expect(out.find(t => t.includes('Datalink cut'))).toMatch(/Bandit-1 went 64° off your nose, past the ±60° gimbal/);
  });

  test('at the gimbal limit (not past it) the wording says so', () => {
    const m1 = shot({ id: 'M2', shooterId: 'player', t: 10, outcome: 'miss', reason: 'no-acquisition', datalinkLost: { t: 30, why: 'shooter lost the track' } });
    const samples = run(0, 60, t => ({ bandits: [bandit({ offNoseDeg: t > 25 ? 59.6 : 40 })] }));
    const out = texts(input({ shots: [m1], samples }));
    expect(out.find(t => t.includes('Datalink cut'))).toMatch(/Bandit-1 went 60° off your nose, at the edge of the ±60° gimbal/);
  });

  test('shot down by an IR missile: no radar mode, and the RWR never saw it', () => {
    const r73 = shot({ id: 'X1', shooterId: 'bandit1', t: 100, missile: 'r73', radarMode: 'stt', range: 9000, outcome: 'hit', reason: null, endT: 115 });
    const events: SimEvent[] = [
      { t: 115, type: 'hit', missileId: 'X1', targetId: 'player' },
      { t: 115, type: 'kill', targetId: 'player', by: 'bandit1' },
    ];
    const death = coachSortie(input({ shots: [r73], events, endT: 116 })).find(i => i.id === 'death');
    expect(death?.text).toMatch(/Bandit-1's R-73 hit you\. Fired at 9\.0 km \(IR: nothing on the RWR\), 15 s of flight\./);
    expect(death?.text).not.toMatch(/from STT/);
  });

  test('a long shot on a cold target', () => {
    const m1 = shot({ id: 'M1', shooterId: 'player', t: 10, range: 33000, rmax: 30000, targetAspectDeg: 160, outcome: 'hit', reason: null });
    expect(texts(input({ shots: [m1] })).some(t => t.includes('You fired M1 at 1.1× Rmax on a cold target'))).toBe(true);
  });

  test('a missile that runs out of energy says Rne', () => {
    const m1 = shot({ id: 'M1', shooterId: 'player', t: 10, range: 50000, rmax: 55000, rne: 21000, targetAspectDeg: 20, outcome: 'miss', reason: 'kinematic' });
    expect(texts(input({ shots: [m1] })).find(t => t.includes('Out of energy'))).toMatch(/fired at 50 km on a hot target \(0\.91× Rmax, Rne 21 km\)/);
  });

  test('never going defensive after an R-77 pitbull', () => {
    const r77 = shot({ id: 'R1', shooterId: 'bandit1', t: 40, targetId: 'player', outcome: 'hit', reason: null, endT: 70, warnedAt: 58, warnKind: 'missile', pitbullAt: 58 });
    const samples = run(0, 70, t => ({ threats: t >= 40 ? [threat({ id: 'R1', offNoseDeg: 4 })] : [] }));
    const events: SimEvent[] = [{ t: 70, type: 'kill', targetId: 'player', by: 'bandit1' }, { t: 70, type: 'hit', missileId: 'R1', targetId: 'player' }];
    const out = texts(input({ shots: [r77], samples, events, endT: 72 }));
    expect(out.find(t => t.includes('No defence'))).toMatch(/You never went defensive after Bandit-1's R-77 pitbulled \(12 s before impact\): it hit you/);
    expect(out.some(t => t.includes('Shot down'))).toBe(true);
  });

  test('a quick beam that defeats the missile is praised; a late one is not', () => {
    const quick = shot({ id: 'R1', shooterId: 'bandit1', t: 40, outcome: 'miss', reason: 'notched', endT: 75, warnedAt: 58, warnKind: 'missile' });
    const s1 = run(0, 80, t => ({ threats: t >= 40 && t <= 75 ? [threat({ id: 'R1', offNoseDeg: t < 59 ? 5 : t < 60 ? 30 : 88, altAbove: -2000 })] : [] }));
    const good = coachSortie(input({ shots: [quick], samples: s1 })).find(i => i.kind === 'good');
    expect(good?.title).toBe('Good notch');
    expect(good?.text).toMatch(/You beamed Bandit-1's R-77 1 s after it pitbulled, and it lost him in the notch/);

    const late = shot({ id: 'R2', shooterId: 'bandit1', t: 40, outcome: 'hit', reason: null, endT: 75, warnedAt: 58, warnKind: 'missile' });
    const s2 = run(0, 75, t => ({ threats: t >= 40 ? [threat({ id: 'R2', offNoseDeg: t < 68 ? 5 : 90 })] : [] }));
    expect(texts(input({ shots: [late], samples: s2 })).find(t => t.includes('Defence failed'))).toMatch(/10 s after it pitbulled: too late/);
  });

  test('beaming above an active missile gets the ground-behind-you note when it fails', () => {
    const r = shot({ id: 'R1', shooterId: 'bandit1', t: 40, outcome: 'hit', reason: null, endT: 75, warnedAt: 58, warnKind: 'missile' });
    const samples = run(0, 75, t => ({ threats: t >= 40 ? [threat({ id: 'R1', offNoseDeg: t < 59 ? 5 : 90, altAbove: 3000 })] : [] }));
    expect(texts(input({ shots: [r], samples })).find(t => t.includes('Defence failed'))).toMatch(/stayed above it: in DCS a notch needs ground behind you/);
  });

  test('holding a hot aspect inside the bandit Rne', () => {
    const samples = run(0, 60, t => ({ bandits: [bandit({ range: 30000 - t * 300, offNoseDeg: 8, rne: 20000 })] }));
    const out = texts(input({ samples }));
    expect(out.find(t => t.includes('Hot inside his Rne'))).toMatch(/You held a hot aspect inside Bandit-1's Rne \(about 20 km\) for \d+ s/);
  });

  test('not while he is defending', () => {
    const samples = run(0, 60, () => ({ bandits: [bandit({ range: 15000, offNoseDeg: 8, rne: 20000, defending: true })] }));
    expect(texts(input({ samples })).some(t => t.includes('Hot inside his Rne'))).toBe(false);
  });

  test('good crank with the F-pole', () => {
    const m1 = shot({ id: 'M1', shooterId: 'player', t: 10, outcome: 'hit', reason: null, fPole: 18000, support: { meanOffNoseDeg: 45, maxOffNoseDeg: 52, seconds: 30 } });
    expect(texts(input({ shots: [m1] })).some(t => t === 'good|Good crank|You kept Bandit-1 at 45° off the nose while M1 flew, and F-pole was 18 km.')).toBe(true);
  });

  test('no crank', () => {
    const m1 = shot({ id: 'M1', shooterId: 'player', t: 10, outcome: 'hit', reason: null, fPole: 6000, support: { meanOffNoseDeg: 6, maxOffNoseDeg: 10, seconds: 30 } });
    expect(texts(input({ shots: [m1] })).find(t => t.includes('No crank'))).toMatch(/F-pole only 6\.0 km/);
  });

  test('early lock: flagged on a TWS jet, not on an FC3 auto-lock jet', () => {
    const samples = run(0, 60, t => ({ radarMode: t >= 5 ? 'stt' : 'tws', sttTarget: t >= 5 ? 'bandit1' : null }));
    const m1 = shot({ id: 'M1', shooterId: 'player', t: 40, radarMode: 'stt' });
    expect(texts(input({ samples, shots: [m1] })).find(t => t.includes('Early lock'))).toMatch(/for 35 s before firing.*Stay in TWS until the shot/);
    expect(texts(input({ samples, shots: [m1], autoStt: true, twsLaunch: false })).some(t => t.includes('Early lock'))).toBe(false);
  });

  test('chaff with no missile on the beam', () => {
    const events: SimEvent[] = [];
    for (let i = 0; i < 6; i++) events.push({ t: 20 + i, type: 'cm', ownerId: 'player', what: 'chaff' });
    const samples = run(0, 40, () => ({ threats: [threat({ id: 'R1', offNoseDeg: 10 })] }));
    expect(texts(input({ events, samples })).find(t => t.includes('Chaff off the beam'))).toMatch(/6 of your 6 chaff bundles/);
  });

  test('blue on blue', () => {
    const m1 = shot({ id: 'M1', shooterId: 'player', t: 10, targetId: 'bandit1', outcome: 'miss', reason: 'target-dead' });
    const events: SimEvent[] = [{ t: 40, type: 'hit', missileId: 'M1', targetId: 'wingman' }];
    expect(texts(input({ shots: [m1], events, friends: ['wingman'] })).some(t => t.startsWith('mistake|Blue on blue|'))).toBe(true);
  });

  test('worst first: a fatal mistake ranks above praise', () => {
    const r77 = shot({ id: 'R1', shooterId: 'bandit1', t: 40, outcome: 'hit', reason: null, endT: 70, warnedAt: 58, warnKind: 'missile' });
    const m1 = shot({ id: 'M1', shooterId: 'player', t: 10, outcome: 'hit', reason: null, support: { meanOffNoseDeg: 45, maxOffNoseDeg: 50, seconds: 20 } });
    const items = coachSortie(input({ shots: [m1, r77], samples: run(0, 70, t => ({ threats: t >= 40 ? [threat({ id: 'R1' })] : [] })) }));
    expect(items[0].kind).toBe('mistake');
    expect(items[0].severity).toBe(3);
  });
});

describe('helpers', () => {
  test('firstReaction finds the turn start, not the moment the beam is reached', () => {
    const samples = run(0, 30, t => ({ threats: [threat({ id: 'R1', offNoseDeg: t < 10 ? 5 : Math.min(90, 5 + (t - 10) * 12) })] }));
    const r = firstReaction({ samples, events: [], playerId: 'player' }, 'R1', 8, 30);
    expect(r?.how).toBe('beam');
    expect(r?.t).toBeCloseTo(11.5, 1);
    expect(r && r.reachedAt).toBeGreaterThan(r?.t ?? 0);
  });

  test('sampleAt picks the last sample at or before t', () => {
    const samples = run(0, 10, () => ({}));
    expect(sampleAt(samples, 3.7)?.t).toBe(3.5);
    expect(sampleAt(samples, -1)).toBeNull();
  });

  test('describeShot formats range, zone, warning and F-pole', () => {
    const inp = input({ units: 'imperial' });
    const row = describeShot(shot({ id: 'M1', shooterId: 'player', t: 10, range: 55560, rmax: 74080, rne: 37040, outcome: 'hit', reason: null, fPole: 33336, warnedAt: 40, warnKind: 'missile', endT: 58 }), inp);
    expect(row.title).toBe('M1 · AIM-120C → Bandit-1');
    expect(row.outcome).toBe('HIT');
    expect(row.launch).toBe('30 nm · 0.75 Rmax · outside Rne (20 nm)');
    expect(row.fPole).toBe('18 nm');
    expect(row.warning).toBe('none until pitbull, 18 s before impact');
  });

  test('score: zero on a loss, kills and survival on a win, harder AI scores more', () => {
    const m1 = shot({ id: 'M1', shooterId: 'player', t: 10, outcome: 'hit', reason: null, endT: 50 });
    const events: SimEvent[] = [{ t: 50, type: 'kill', targetId: 'bandit1', by: 'player' }];
    const inp = input({ shots: [m1], events, enemies: ['bandit1'] });
    expect(scoreSortie(inp, { outcome: 'loss', reason: 'shot-down', t: 60 }, 'regular', '1v1').score).toBe(0);
    const win = scoreSortie(inp, { outcome: 'win', reason: 'bandits-dead', t: 60 }, 'regular', '1v1');
    expect(win.parts.find(p => p.label === 'Your kills')?.value).toBe(300);
    expect(win.score).toBeGreaterThan(600);
    expect(scoreSortie(inp, { outcome: 'win', reason: 'bandits-dead', t: 60 }, 'ace', '1v1').score).toBeGreaterThan(win.score);
  });
});
