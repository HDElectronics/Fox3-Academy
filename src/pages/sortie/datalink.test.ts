import { describe, expect, test } from 'vitest';
import { AWACS_ALT_M, AWACS_BEHIND_M, briefFacts, buildSortie, datalinkBriefLines, defaultSetup, parseAwacs, parseSetup } from './setup';
import { applyParams } from './index';
import { datalinkLine, datalinkOnly, flightHint, type HintState } from './hints';
import { FIGHTER_ORDER } from '../../data/aircraft';
import { World } from '../../sim/world';
import { buildRadarPicture } from '../../sim/picture';
import { D2R } from '../../sim/math';
import type { FighterId } from '../../data/types';

describe('AWACS option', () => {
  test('defaults to off and survives storage; junk falls back to off', () => {
    expect(defaultSetup('f16c').awacs).toBe(false);
    expect(parseSetup('f16c', JSON.stringify({ awacs: true })).awacs).toBe(true);
    expect(parseSetup('f16c', JSON.stringify({ awacs: 'yes' })).awacs).toBe(false);
    expect(parseSetup('f16c', JSON.stringify({})).awacs).toBe(false);
  });

  test('URL ?awacs=1 turns it on, ?awacs=0 off, junk keeps the stored value', () => {
    const d = defaultSetup('f16c');
    expect(applyParams(d, new URLSearchParams('awacs=1')).awacs).toBe(true);
    expect(applyParams({ ...d, awacs: true }, new URLSearchParams('awacs=0')).awacs).toBe(false);
    expect(applyParams({ ...d, awacs: true }, new URLSearchParams('awacs=maybe')).awacs).toBe(true);
    expect(parseAwacs('on')).toBe(true);
    expect(parseAwacs(null)).toBeNull();
  });

  test('setAwacs only when on: an orbit behind you, and the jet gets AWACS tracks', () => {
    const off = new World(1);
    buildSortie(off, 'f16c', defaultSetup('f16c'), 'imperial');
    expect(off.awacs.blue).toBeUndefined();

    const on = new World(1);
    const eng = buildSortie(on, 'f16c', { ...defaultSetup('f16c'), awacs: true }, 'imperial');
    const me = on.get(eng.playerId)!;
    const orbit = on.awacs.blue!;
    expect(orbit.y).toBe(AWACS_ALT_M);
    expect(Math.hypot(orbit.x - me.pos.x, orbit.z - me.pos.z)).toBeCloseTo(AWACS_BEHIND_M, 0);
    // Behind: the bandits are ahead, so the orbit is farther from them than you are.
    const bandit = on.get(eng.enemyIds[0])!;
    expect(Math.hypot(orbit.x - bandit.pos.x, orbit.z - bandit.pos.z)).toBeGreaterThan(me.pos.distanceTo(bandit.pos));
    expect(on.awacs.red).toBeUndefined();

    on.step(0.5); off.step(0.5);
    const pic = buildRadarPicture(on, eng.playerId, { units: 'imperial' });
    expect(pic?.datalink.some(d => d.source === 'awacs' && d.sovereignty === 'hostile')).toBe(true);
    expect(buildRadarPicture(off, eng.playerId, { units: 'imperial' })?.datalink ?? []).toHaveLength(0);
  });
});

describe('datalink brief lines', () => {
  const lines = (ac: FighterId, awacs = true, scenario: '1v1' | '2v2' = '1v1') => datalinkBriefLines(ac, { awacs, scenario }).join(' ');

  test('Link 16 jets: network, where it shows, update and coast times, no shot on a datalink track', () => {
    const viper = lines('f16c');
    expect(viper).toMatch(/MIDS \(Link 16\): shows on the FCR and HSD/);
    expect(viper).toMatch(/every 10 s .*coasts 20 s .*Viper manual/);
    expect(viper).toMatch(/cannot be fired on/);
    expect(lines('fa18c')).toMatch(/Attack radar and SA page/);
    expect(lines('fa18c')).toMatch(/In RWS only donor tracks that match a radar return show/);
  });

  test('FC3 Russian jets: open triangle on the HDD; family jets labelled not verified', () => {
    expect(lines('su27')).toMatch(/open triangle = AWACS track/i);
    expect(lines('su27')).not.toMatch(/not verified/);
    for (const ac of ['su33', 'j11a', 'mig29s'] as const) expect(lines(ac)).toMatch(/\(not verified\)/);
    expect(lines('jf17')).toMatch(/Link 17.*\(not verified\)/);
  });

  test('F-15C and M-2000C: no datalink picture', () => {
    expect(lines('f15c')).toMatch(/No datalink display on the F-15C \(ED manual\): in DCS you call AWACS by radio/);
    expect(lines('m2000c')).toMatch(/No air-to-air datalink on the M-2000C: None \(TAF ground link not modelled\) \(not verified\)/);
    expect(lines('f15c', true, '2v2')).not.toMatch(/wingman/);
  });

  test('AWACS off says so; 2v2 wingman shares tracks only on a donor network', () => {
    expect(lines('f16c', false)).toMatch(/AWACS off: no surveillance tracks/);
    expect(lines('f16c', false)).not.toMatch(/every 10 s/);
    expect(lines('f16c', true, '2v2')).toMatch(/wingman is on the same MIDS \(Link 16\) network: his radar tracks and his position/);
    expect(lines('f14b', true, '2v2')).toMatch(/wingman is on the same Link 4A \/ 4C network: his radar tracks show/);
    expect(lines('su27', true, '2v2')).toMatch(/wingman shares no tracks/);
    expect(lines('f16c', true, '1v1')).not.toMatch(/wingman/);
  });

  test('every jet gets datalink lines in the brief facts', () => {
    for (const ac of FIGHTER_ORDER) expect(briefFacts(ac, { ...defaultSetup(ac), awacs: true }, 'imperial').datalink.length).toBeGreaterThan(0);
  });
});

describe('datalink in flight', () => {
  const base = (p: Partial<HintState> = {}): HintState => ({
    units: 'imperial', alive: true,
    jet: { short: 'F-16C', hasTws: true, twsLaunch: true, autoStt: 0, gimbalDeg: 60 },
    keys: { designate: null, launch: null, mode: null, chaff: null },
    radarMode: 'rws', weapon: { name: 'AIM-120C', seeker: 'arh', count: 6 }, missilesLeft: 8,
    shootCue: false, cueLabel: '', blocked: '', contacts: 0, primary: null, rwr: null, own: [],
    bandits: [{ name: 'Bandit-1', range: 150000, bearing: 0, alt: 9000, inRne: false, rne: 20000, hot: true }],
    ownAlt: 9000, ...p,
  });
  const dl = (p: Partial<NonNullable<HintState['datalink']>[number]> = {}) => ({ from: 'AWACS', range: 120000, bearing: 40 * D2R, alt: 9000, correlated: false, sovereignty: 'hostile' as const, ...p });

  test('an uncorrelated datalink contact with an empty scope: point the scan at it', () => {
    const h = flightHint(base({ datalink: [dl()] }));
    expect(h.text).toMatch(/^AWACS has a contact your radar does not: point the scan at its bearing, 40° right/);
    expect(h.why).toMatch(/cannot be fired on/);
  });

  test('no datalink hint for correlated or friendly tracks, or with contacts on the scope', () => {
    expect(flightHint(base({ datalink: [dl({ correlated: true })] })).text).toMatch(/^GCI \(trainer picture\): Bandit-1/);
    expect(flightHint(base({ datalink: [dl({ sovereignty: 'friendly' })] })).text).toMatch(/^GCI \(trainer picture\): Bandit-1/);
    expect(flightHint(base({ datalink: [dl()], contacts: 1 })).text).toMatch(/^Contacts on the scope/);
    expect(datalinkOnly({ datalink: [dl({ range: 90000, correlated: true }), dl({ range: 130000, from: 'Wingman' })] })?.from).toBe('Wingman');
  });

  test('the log line names the source, range and ID', () => {
    const rng = (m: number) => `${Math.round(m / 1852)} nm`;
    expect(datalinkLine({ source: 'awacs', donorLabel: null, range: 222240, sovereignty: 'hostile', correlated: false }, rng))
      .toBe('Datalink: AWACS track, 120 nm, hostile, not on your radar');
    expect(datalinkLine({ source: 'donor', donorLabel: 'Wingman', range: 74080, sovereignty: 'unknown', correlated: true }, rng))
      .toBe('Datalink: Wingman track, 40 nm, unknown');
  });
});
