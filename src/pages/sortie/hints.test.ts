import { describe, expect, test } from 'vitest';
import { D2R } from '../../sim/math';
import { flightHint, type HintState } from './hints';

function state(p: Partial<HintState> = {}): HintState {
  return {
    units: 'metric', alive: true,
    jet: { short: 'F-15C', hasTws: true, twsLaunch: true, autoStt: 0, gimbalDeg: 60 },
    keys: { designate: 'Enter', launch: 'RAlt + Space', mode: 'RAlt + I', chaff: 'Insert' },
    radarMode: 'tws', weapon: { name: 'AIM-120C', seeker: 'arh', count: 6 }, missilesLeft: 8,
    shootCue: false, cueLabel: '*', blocked: '', contacts: 0, primary: null, rwr: null, own: [],
    bandits: [{ name: 'Bandit-1', range: 90000, bearing: 5 * D2R, alt: 9000, inRne: false, rne: 20000, hot: true }],
    ownAlt: 9000,
    ...p,
  };
}

describe('flightHint', () => {
  test('cockpits without textual shoot cues get a clear trainer launch hint', () => {
    const h = flightHint(state({ shootCue: true, cueLabel: '', primary: { label: 'Bandit-1', range: 30000, rmax: 50000, rne: 20000 } }));
    expect(h.text).toBe('Launch available on Bandit-1: fire (RAlt + Space).');
  });

  test('an active missile beats everything, with the side to beam it on', () => {
    const h = flightHint(state({ rwr: { state: 'missile', bearing: 20 * D2R, elevation: 0, emitter: 'Missile', missile: 'R-77', seeker: 'arh' }, shootCue: true }));
    expect(h.tone).toBe('warning');
    expect(h.text).toMatch(/put it at 3 o'clock, dive, chaff \(Insert\)/);
  });

  test('on the beam but above the missile: go below it', () => {
    const h = flightHint(state({ rwr: { state: 'missile', bearing: 88 * D2R, elevation: 3 * D2R, emitter: 'Missile', missile: 'R-77', seeker: 'arh' } }));
    expect(h.text).toMatch(/dive below it/);
  });

  test('a SARH launch: notch his radar', () => {
    const h = flightHint(state({ rwr: { state: 'launch', bearing: -10 * D2R, elevation: 0, emitter: 'Bandit-1', missile: 'R-27ER', seeker: 'sarh' } }));
    expect(h.text).toMatch(/notch HIS radar.*9 o'clock/);
  });

  test('supporting a Fox 3: crank, or ease off near the gimbal', () => {
    const own = (off: number) => [{ label: 'M1', guidance: 'datalink', tta: 18, tti: 40, target: 'Bandit-1', targetOffDeg: off }];
    expect(flightHint(state({ own: own(5) })).text).toMatch(/^Crank: put Bandit-1 40–50° off the nose\. M1 active in 18 s/);
    expect(flightHint(state({ own: own(45) })).text).toMatch(/^Good crank/);
    expect(flightHint(state({ own: own(57) })).text).toMatch(/^Easy: Bandit-1 is 57° off the nose, gimbal is ±60°/);
  });

  test('the shoot cue names the jet key and hold time', () => {
    const h = flightHint(state({ shootCue: true, cueLabel: 'ПР', keys: { designate: 'Enter', launch: 'Space', mode: 'RAlt + I', chaff: 'Insert', launchHoldS: 1 }, primary: { label: 'Bandit-1', range: 40000, rmax: 55000, rne: 25000 } }));
    expect(h.text).toBe('ПР on Bandit-1: fire (Space held 1 s).');
  });

  test('FC3 СНП: the radar locks by itself at 85 % of Rmax', () => {
    const h = flightHint(state({ jet: { short: 'Su-27', hasTws: true, twsLaunch: false, autoStt: 0.85, gimbalDeg: 60 }, primary: { label: 'Bandit-1', range: 70000, rmax: 60000, rne: 25000 } }));
    expect(h.text).toMatch(/locks him by itself at 85 % of Rmax \(about 51 km\)/);
  });

  test('no contacts: the AWACS picture', () => {
    expect(flightHint(state()).text).toMatch(/^AWACS: Bandit-1 on the nose, 90 km/);
  });

  test('dead', () => {
    expect(flightHint(state({ alive: false })).tone).toBe('warning');
  });

  test('FC3 Russian contacts: the auto-lock fraction comes from the jet', () => {
    const h = flightHint(state({ jet: { short: 'Su-27', hasTws: true, twsLaunch: false, autoStt: 0.85, gimbalDeg: 60 }, contacts: 1, primary: null }));
    expect(h.text).toMatch(/locks by itself at 85 % of Rmax/);
    const h2 = flightHint(state({ jet: { short: 'Su-27', hasTws: true, twsLaunch: false, autoStt: 0.8, gimbalDeg: 60 }, contacts: 1, primary: null }));
    expect(h2.text).toMatch(/at 80 % of Rmax/);
  });

  test('M-2000C / JF-17: in range before the cue lights says you can fire', () => {
    const h = flightHint(state({
      jet: { short: 'M-2000C', hasTws: false, twsLaunch: false, autoStt: 0, gimbalDeg: 60 },
      keys: { designate: 'Enter', launch: 'Space', mode: null, chaff: null, launchHoldS: 2 },
      radarMode: 'stt', weapon: { name: 'Super 530D', seeker: 'sarh', count: 2 }, cueLabel: 'TIR', inRange: true,
      contacts: 1, primary: { label: 'Bandit-1', range: 33000, rmax: 45000, rne: 22000 },
    }));
    expect(h.text).toBe('Bandit-1 in range: you can fire now (Space held 2 s). TIR lights inside Rne (22 km).');
  });

  test('locked by him with your own shot valid: shoot first', () => {
    const rwr = { state: 'lock' as const, bearing: 0, elevation: 0, emitter: 'Bandit-1', missile: null, seeker: null };
    const primary = { label: 'Bandit-1', range: 30000, rmax: 40000, rne: 18000 };
    expect(flightHint(state({ rwr, shootCue: true, primary })).text).toBe('Bandit-1 has you locked, and your shot on Bandit-1 is valid: fire (RAlt + Space), then crank or beam.');
    expect(flightHint(state({ rwr, shootCue: false, primary })).text).toMatch(/^Bandit-1 has you locked at 12 o'clock/);
  });
});
