import { describe, expect, it } from 'vitest';
import { FLIGHT_OPS } from '../../data/flightOps';
import { FLIGHT_OPS_DT, LaunchEvaluator, applyAction, createFlightOpsState, demoPilot, stepFlightOps, type LaunchScore } from '../../sim/flightOps';
import { parseChord } from '../../ui';
import { FLIGHT_OPS_JETS, progressKey, stepOrder } from './logic';
import {
  TRIM_KEYS, avoidKey, keyTag, launchCaption, launchCard, launchCurrent, launchKeys, launchLessonSteps, launchStarts, launchStepsDone,
  launchWarnings, powerText, stationLabel, touchLabel, trimReadout, trimTable,
} from './launchLesson';

describe('flight-ops launch page logic (#27)', () => {
  it('offers the catapult to the Hornet and Tomcat and the ski-jump to the Su-33 only', () => {
    const withLaunch = FLIGHT_OPS_JETS.filter(id => launchStarts(FLIGHT_OPS[id]).length).sort();
    expect(withLaunch).toEqual(['f14b', 'fa18c', 'su33']);
    expect(launchStarts(FLIGHT_OPS.fa18c)).toEqual(['catapult']);
    expect(launchStarts(FLIGHT_OPS.su33)).toEqual(['skiJump']);
    expect(stationLabel(FLIGHT_OPS.fa18c.launch!, 2)).toBe('Cat 2');
    expect(stationLabel(FLIGHT_OPS.su33.launch!, 3)).toBe('Position 3 (180 m)');
    expect(progressKey('su33', 'launch')).toBe('flight-ops:su33:launch');
    expect(stepOrder('launch')).toEqual([]);
  });

  it('takes every launch key from the data, tags the unverified and conflicting ones, and binds parseable, unique chords', () => {
    const hornet = launchKeys(FLIGHT_OPS.fa18c);
    expect(hornet.map(k => k.key)).toEqual(['S', 'L', 'U', 'K', 'LCtrl+LShift+LAlt+S', TRIM_KEYS.up, TRIM_KEYS.down]);
    expect(hornet.find(k => k.action === 'launchBar')!.tag).toBe('not verified');
    expect(hornet.find(k => k.action === 'salute')!.tag).toBe('not verified');
    expect(hornet.find(k => k.action === 'trimUp')!.tag).toBe('trainer key');
    const tomcat = launchKeys(FLIGHT_OPS.f14b);
    expect(tomcat.find(k => k.action === 'salute')).toMatchObject({ key: 'LShift+U', tag: 'key conflict' });
    expect(launchKeys(FLIGHT_OPS.su33).map(k => [k.action, k.key])).toEqual([['specialAB', 'LShift+E']]);
    expect(avoidKey(FLIGHT_OPS.su33)).toMatchObject({ action: 'fodScreens', key: 'LAlt+I' });
    expect(keyTag(null)).toBeNull();
    for (const id of ['fa18c', 'f14b', 'su33'] as const) {
      const d = FLIGHT_OPS[id];
      const page = [d.keys.gear, d.keys.flaps, d.keys.speedbrake, d.carrier!.hookKey.value, d.carrier!.ballCallKey.value, 'P', 'R', 'C', 'Space', d.takeoff.keys.brakes.value];
      const keys = [...launchKeys(d), ...(avoidKey(d) ? [avoidKey(d)!] : [])];
      for (const k of keys) {
        expect(parseChord(k.key), `${id} ${k.key}`).not.toBeNull();
        expect(page.map(p => parseChord(p)?.text)).not.toContain(parseChord(k.key)!.text);
        expect(touchLabel(k.action).length).toBeLessThanOrEqual(8);
      }
      expect(new Set(keys.map(k => parseChord(k.key)!.text)).size).toBe(keys.length);
    }
  });

  it('reads the Hornet trim by weight and the power the launch needs', () => {
    const l = FLIGHT_OPS.fa18c.launch!;
    expect(trimReadout(l, 42000, 12)).toMatchObject({ wantDeg: 16, nowDeg: 12, ok: false, weightText: '42000 lb' });
    expect(trimReadout(l, 46000, 17)).toMatchObject({ wantDeg: 17, ok: true });
    expect(trimReadout(l, 50000, undefined)).toMatchObject({ wantDeg: 19, ok: true });
    expect(trimTable(l)).toBe('16° below 44000 lb · 17° · 19° from 49000 lb');
    expect(trimReadout(FLIGHT_OPS.f14b.launch!, 60000, undefined)).toBeNull();
    expect(powerText(FLIGHT_OPS.fa18c, 42000)).toBe('MIL (afterburner from 49000 lb)');
    expect(powerText(FLIGHT_OPS.fa18c, 50000)).toMatch(/^Afterburner/);
    expect(powerText(FLIGHT_OPS.su33, 26000)).toBe('Full afterburner, then special afterburner LShift+E');
  });

  it('warns about the FOD screens and a heavy jet on a short position', () => {
    const d = FLIGHT_OPS.su33;
    const s = createFlightOpsState('su33', 'skiJump', d, { station: 1, heavy: true });
    expect(launchWarnings(d, s)).toEqual(['Heavy (32000 kg) on a 90 m run: use position 3.']);
    applyAction(s, 'fodScreens', d);
    expect(launchWarnings(d, s)[0]).toMatch(/^FOD screens on: LAlt\+I/);
    expect(launchWarnings(d, createFlightOpsState('su33', 'skiJump', d, { station: 3, heavy: true }))).toEqual([]);
    const h = createFlightOpsState('fa18c', 'catapult', FLIGHT_OPS.fa18c);
    applyAction(h, 'salute', FLIGHT_OPS.fa18c);
    expect(launchWarnings(FLIGHT_OPS.fa18c, h)[0]).toMatch(/^Salute refused, the shooter holds/);
  });

  it('builds lesson steps per jet: the sequence, clean up, the clearing turn from catapults, the climb', () => {
    const ids = (id: 'fa18c' | 'f14b' | 'su33', st: number) => launchLessonSteps(FLIGHT_OPS[id], 'imperial', st, false).map(x => x.id);
    expect(ids('fa18c', 1)).toEqual(['nwsHi', 'launchBar', 'hookUp', 'trim', 'power', 'wipeOut', 'salute', 'handsOff', 'cleanUp', 'clearingTurn', 'climb']);
    expect(ids('f14b', 2)).toEqual(['hookUp', 'power', 'salute', 'handsOff', 'cleanUp', 'clearingTurn', 'climb']);
    expect(ids('su33', 3)).toEqual(['power', 'specialAB', 'release', 'cleanUp', 'climb']);
    const hornet = launchLessonSteps(FLIGHT_OPS.fa18c, 'imperial', 1, true);
    expect(hornet.find(x => x.id === 'trim')!.text).toBe('T/O trim 19° for 50000 lb');
    expect(hornet.find(x => x.id === 'clearingTurn')!.text).toBe('Clearing turn right off cat 1');
    for (const st of launchLessonSteps(FLIGHT_OPS.fa18c, 'imperial', 1, false)) expect(st.text).not.toMatch(/!/);
  });

  for (const [id, opts] of [['fa18c', { station: 1 }], ['fa18c', { station: 2, heavy: true }], ['f14b', { station: 1 }], ['su33', { station: 3, heavy: true }]] as const) {
    it(`demo ${id} ${JSON.stringify(opts)}: the steps light in order and the debrief reads a good launch`, () => {
      const d = FLIGHT_OPS[id];
      const s = createFlightOpsState(id, d.launch!.kind, d, opts);
      const ev = new LaunchEvaluator(d);
      const order = launchLessonSteps(d, 'imperial', opts.station, 'heavy' in opts).map(x => x.id);
      let sco: LaunchScore = ev.score(s);
      let prev = 0;
      const captions = new Set<string>();
      for (let i = 0; i < 60 * 300 && sco.total === null; i++) {
        const cmd = demoPilot(s, d);
        for (const a of cmd.actions) applyAction(s, a, d);
        stepFlightOps(s, cmd, FLIGHT_OPS_DT, d);
        ev.update(s);
        sco = ev.score(s);
        const done = launchStepsDone(s, sco.gates);
        const cur = launchCurrent(order, done);
        const at = cur === null ? order.length : order.indexOf(cur);
        expect(at).toBeGreaterThanOrEqual(prev);
        prev = at;
        if (i % 30 === 0) captions.add(launchCaption(s, d, 'imperial').text);
      }
      expect(sco.total).toBe(100);
      expect(launchCard(sco)).toMatchObject({ title: 'Good launch', tone: 'ok' });
      expect(launchCurrent(order, launchStepsDone(s, sco.gates))).toBeNull();
      expect(captions.size).toBeGreaterThan(3);
    });
  }

  it('names the bad outcomes', () => {
    const base: LaunchScore = { gates: [], outcome: 'cold cat', errors: [], total: 0, verdict: null };
    expect(launchCard(base)).toMatchObject({ title: 'Cold cat', tone: 'warning' });
    expect(launchCard({ ...base, outcome: 'short run' }).title).toBe('Short run');
    expect(launchCard({ ...base, outcome: 'sequence error' }).tone).toBe('caution');
    expect(launchCard({ ...base, outcome: null }).title).toBe('No launch');
  });
});
