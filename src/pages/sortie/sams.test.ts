import { describe, expect, test } from 'vitest';
import type { SimEvent } from '../../sim/types';
import { World } from '../../sim/world';
import { SAMS } from '../../data/sams';
import { briefFacts, buildSortie, defaultSetup, parseSetup, samBriefLines, samPlacements } from './setup';
import { flightHint, type HintState } from './hints';
import { Namer, ruleSam, type CoachInput } from './coach';

describe('sortie SAM sites', () => {
  test('none by default, one or two sites off the centre line, at least just outside the ring', () => {
    const d = defaultSetup('f15c');
    expect(d.sams).toBe(0);
    expect(samPlacements(d)).toEqual([]);
    expect(briefFacts('f15c', d, 'metric').sams).toEqual([]);
    const two = samPlacements({ ...d, sams: 2, samType: 'sa10' });
    expect(two.map(p => p.offsetDeg)).toEqual([18, -18]);
    expect(two[0].range).toBeGreaterThanOrEqual(SAMS.sa10.threatRingKm * 1000 * 1.15);
    const one = samPlacements({ ...d, sams: 1, samType: 'sa15', range: 100_000 });
    expect(one[0].range).toBeCloseTo(55_000, 3);
  });

  test('the brief states ring and band as not verified and the AI gap as simplified', () => {
    const lines = samBriefLines({ sams: 1, samType: 'sa11', range: 100_000 }, 'metric');
    expect(lines[0]).toMatch(/SA-11 Gadfly site.*ring 35 km.*not verified/);
    expect(lines.join(' ')).toMatch(/Simplified: the AI jets ignore the SAM sites/);
    expect(lines.join(' ')).not.toMatch(/!/);
  });

  test('stored setups keep a valid SAM choice and drop a bad one', () => {
    expect(parseSetup('su27', JSON.stringify({ sams: 2, samType: 'sa15' }))).toMatchObject({ sams: 2, samType: 'sa15' });
    expect(parseSetup('su27', JSON.stringify({ sams: 7, samType: 'patriot' }))).toMatchObject({ sams: 0, samType: 'sa11' });
  });

  test('the engagement spawns the sites', () => {
    const w = new World(4);
    const eng = buildSortie(w, 'fa18c', { ...defaultSetup('fa18c'), sams: 2, samType: 'sa11' }, 'imperial');
    expect(eng.samIds).toEqual(['sam1', 'sam2']);
    expect(w.samSites.size).toBe(2);
  });
});

describe('SAM hints and debrief coaching', () => {
  const hint = (rwr: HintState['rwr']): HintState => ({
    units: 'metric', alive: true, jet: { short: 'F-15C', hasTws: true, twsLaunch: true, autoStt: 0, gimbalDeg: 60 },
    keys: { designate: null, launch: null, mode: null, chaff: 'Delete' }, radarMode: 'rws', weapon: null, missilesLeft: 4,
    shootCue: false, cueLabel: '', blocked: '', contacts: 0, primary: null, rwr, own: [], bandits: [], ownAlt: 9000,
  });

  test('a SAM launch says beam the site and chaff; a lock says leave the ring', () => {
    const base = { bearing: 0.5, elevation: -0.1, emitter: 'SA-11 Gadfly', missile: null, seeker: null, sam: 'sa11' as const };
    const l = flightHint(hint({ ...base, state: 'launch' }));
    expect(l.text).toMatch(/SA-11 launch.*beam the site.*chaff \(Delete\)/);
    expect(l.tone).toBe('warning');
    expect(flightHint(hint({ ...base, state: 'lock' })).text).toMatch(/SA-11 lock.*ring/);
    expect(flightHint(hint({ ...base, sam: 'sa10', state: 'launch' })).why).toMatch(/hardest/);
  });

  const input = (events: SimEvent[]): CoachInput => ({
    playerId: 'player', playerType: 'f15c', friends: [], enemies: ['b1'], names: { player: 'You', sam1: 'SA-11 Gadfly' }, units: 'metric',
    gimbalDeg: 60, twsLaunch: true, autoStt: false, events, shots: [], samples: [], actions: [], endT: 200, playerMissilesLeft: 4,
  });

  test('coaching: SAM kill is a mistake, a broken track is good', () => {
    const launch: SimEvent = { t: 50, type: 'sam', siteId: 'sam1', what: 'launch', targetId: 'player', missileId: 'S1', range: 25000 };
    const dead = input([launch, { t: 70, type: 'kill', targetId: 'player', by: 'sam1' }]);
    const d = ruleSam(dead, new Namer(dead));
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ kind: 'mistake', severity: 3 });
    expect(d[0].text).toMatch(/SA-11 Gadfly site shot you down, launched at 25 km/);
    const good = input([launch, { t: 58, type: 'sam', siteId: 'sam1', what: 'lost', targetId: 'player', why: 'chaff' }]);
    expect(ruleSam(good, new Namer(good))[0]).toMatchObject({ kind: 'good', title: 'SAM defeated' });
    const none = input([]);
    expect(ruleSam(none, new Namer(none))).toEqual([]);
  });
});
