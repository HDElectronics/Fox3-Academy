import { describe, expect, it } from 'vitest';
import { A10cCdu, CDU_COLS, CDU_ROWS, SCRATCH_MAX, type CduHost, type CduLsk, type CduSteerpoint } from './a10cCdu';
import type { Markpoint } from './a10cHotas';
import { parseTrainerGrid, trainerGrid, trainerGrid5, trainerLatLon } from './nineLine';

function setup(opts: { plan?: { id: string; x: number; z: number }[] } = {}) {
  const log: { text: string; tone?: 'ok' | 'caution' }[] = [];
  const marks: Markpoint[] = [];
  const steers: CduSteerpoint[] = [];
  const host: CduHost = {
    groundHeightM: (x, z) => 100 + x / 1000 + z / 2000,
    marks: () => marks,
    log: (text, tone) => { log.push({ text, tone }); },
    steerChanged: sp => { steers.push(sp); },
  };
  const plan = opts.plan ?? [
    { id: 'IP', x: -10000, z: 5000 },
    { id: 'TGT', x: 0, z: 0 },
    { id: 'EGRESS', x: 10000, z: 5000 },
  ];
  const cdu = new A10cCdu(host, { init: { x: -30000, z: 20000 }, plan });
  const type = (s: string) => { for (const ch of s) { if (ch === ' ') cdu.space(); else cdu.key(ch); } };
  const enter = (s: string, k: CduLsk) => { type(s); cdu.lsk(k); };
  const lastLog = () => log.at(-1)?.text;
  return { cdu, host, log, marks, steers, type, enter, lastLog };
}

/** Every line fits the 24-column screen and there are always 10. */
function checkScreen(cdu: A10cCdu) {
  const l = cdu.lines();
  expect(l).toHaveLength(CDU_ROWS);
  for (const s of l) expect(s.length).toBeLessThanOrEqual(CDU_COLS);
  return l;
}

describe('trainer grid helpers', () => {
  it('formats the 5 + 5 digit grid', () => {
    expect(trainerGrid5({ x: 0, z: 10 })).toBe('GH 50000 49990');
    expect(trainerGrid5({ x: 1234.4, z: -2345.6 })).toBe('GH 51234 52346');
    expect(trainerGrid5({ x: -60000, z: 70000 })).toBe('GH 00000 00000');
    expect(trainerGrid5({ x: 60000, z: -60000 })).toBe('GH 99999 99999');
  });

  it('pads 6, 8 and 10 digit grids on the right', () => {
    expect(parseTrainerGrid('GH083998')).toEqual({ x: 8300 - 50000, z: 50000 - 99800 });
    expect(parseTrainerGrid('GH50004999')).toEqual({ x: 0, z: 10 });
    expect(parseTrainerGrid('gh 51234 52346')).toEqual({ x: 1234, z: -2346 });
  });

  it('rejects other grids', () => {
    for (const s of ['GH5000499', 'DQ083998', 'GH', 'GHABCDEF', '12345678', 'GH0839981', 'G083998', 'GH50004999X', ''])
      expect(parseTrainerGrid(s), s).toBeNull();
  });

  it('round-trips the 4 + 4 and 5 + 5 grids', () => {
    for (const p of [{ x: 0, z: 0 }, { x: 1234, z: -5678 }, { x: -23456.7, z: 34567.8 }, { x: 49000, z: -49000 }]) {
      const a = parseTrainerGrid(trainerGrid(p))!;
      expect(Math.hypot(a.x - p.x, a.z - p.z)).toBeLessThanOrEqual(10);
      const b = parseTrainerGrid(trainerGrid5(p))!;
      expect(Math.hypot(b.x - p.x, b.z - p.z)).toBeLessThanOrEqual(1);
    }
  });

  it('gives trainer lat/long around N42 E042', () => {
    expect(trainerLatLon({ x: 0, z: 0 })).toEqual({ lat: 'N42°00.000', lon: 'E042°00.000' });
    // 1' of latitude = 111320 / 60 m.
    expect(trainerLatLon({ x: 0, z: -111320 / 60 * 3.12 }).lat).toBe('N42°03.120');
    const ew = 111320 * Math.cos((42 * Math.PI) / 180) / 60;
    expect(trainerLatLon({ x: ew * 1.234, z: 0 }).lon).toBe('E042°01.234');
    expect(trainerLatLon({ x: -ew * 42 * 60 - ew, z: 111320 * 43 }).lat).toBe('S01°00.000');
    expect(trainerLatLon({ x: -ew * 42 * 60 - ew, z: 0 }).lon).toBe('W000°01.000');
  });
});

describe('A-10C II CDU', () => {
  it('starts blank with the first flight plan point as the steerpoint', () => {
    const { cdu } = setup();
    expect(cdu.page).toBe('blank');
    expect(cdu.dial).toBe('FLT PLAN');
    expect(cdu.steerpoint()).toMatchObject({ kind: 'waypoint', number: 1, id: 'IP' });
    const wps = cdu.waypoints();
    expect(wps.map(w => w.id)).toEqual(['INIT POSIT', 'IP', 'TGT', 'EGRESS']);
    expect(wps[0]).toMatchObject({ number: 0, flightPlan: false, user: false, cr: true });
    expect(wps[2]).toMatchObject({ number: 2, flightPlan: true, elevFt: Math.round(100 * 3.28084) });
    expect(cdu.shown()).toEqual({ kind: 'waypoint', number: 0 });
    const l = checkScreen(cdu);
    expect(l[0]).toMatch(/^ {7}F1 {2}1 +D5\/B1$/);
    expect(l[9]).toBe('[');
    expect(cdu.cursorCol()).toBe(1);
  });

  it('steers to waypoint 0 without a flight plan', () => {
    const { cdu, lastLog } = setup({ plan: [] });
    expect(cdu.steerpoint()).toMatchObject({ number: 0, id: 'INIT POSIT' });
    cdu.steer(1);
    expect(lastLog()).toBe('No flight plan waypoints');
    cdu.setDial('MISSION');
    cdu.steer(1);
    expect(cdu.steerpoint().number).toBe(0);
  });

  it('runs the ED grid-to-waypoint flow (research §3)', () => {
    const { cdu, type, steers, lastLog } = setup();
    cdu.fsk('WP');
    expect(cdu.page).toBe('wpmenu');
    let l = checkScreen(cdu);
    expect(l[0].startsWith('WP MENU F1  1')).toBe(true);
    expect(l[2]).toBe('→STEERPOINT'.padEnd(15) + 'WAYPOINT←');
    expect(l[4].endsWith('FROM PT←')).toBe(true);
    expect(l[8].endsWith('WG84[]')).toBe(true);

    cdu.lsk('R3');
    expect(cdu.page).toBe('waypt');
    expect(cdu.shown()).toEqual({ kind: 'waypoint', number: 0 });
    l = checkScreen(cdu);
    expect(l[2]).toMatch(/^±0 +INIT POSIT\[\]$/);
    expect(l[6].endsWith('?4⊕')).toBe(true);
    expect(l[8].endsWith('L/L↕')).toBe(true);
    expect(l[9]).toMatch(/^\[ +P1\/2$/);

    cdu.lsk('R7');
    expect(cdu.shown()).toEqual({ kind: 'waypoint', number: 4 });
    expect(cdu.waypoints().at(-1)).toMatchObject({ number: 4, id: 'MSN004', user: true, flightPlan: false, x: -30000, z: 20000 });
    l = checkScreen(cdu);
    expect(l[2]).toMatch(/^±4 +MSN004\[\]$/);
    expect(l[6].endsWith('?5⊕')).toBe(true);

    cdu.lsk('R9');
    expect(cdu.utm).toBe(true);
    l = checkScreen(cdu);
    expect(l[6]).toMatch(/^\[\]37T WG84 +\?5⊕$/);
    expect(l[8]).toMatch(/^\[\]GH 20000 30000 +UTM↕$/);

    type('GH50004999');
    expect(cdu.scratch).toBe('GH50004999');
    expect(cdu.cursorCol()).toBe(11);
    cdu.lsk('L9');
    expect(cdu.error).toBe(false);
    expect(cdu.scratch).toBe('');
    const wp4 = cdu.waypoints().find(w => w.number === 4)!;
    expect(wp4).toMatchObject({ x: 0, z: 10, cr: true, elevFt: Math.round((100 + 10 / 2000) * 3.28084) });
    expect(checkScreen(cdu)[8]).toMatch(/^\[\]GH 50000 49990 +UTM↕$/);

    type('JTAC1');
    cdu.lsk('R3');
    expect(wp4.id).toBe('JTAC1');
    expect(checkScreen(cdu)[2]).toMatch(/^±4 +JTAC1\[\]$/);

    cdu.setDial('MISSION');
    expect(lastLog()).toBe('STEER PT MISSION');
    expect(checkScreen(cdu)[0].startsWith('WAYPT      1')).toBe(true);
    for (let i = 0; i < 10 && cdu.steerpoint().id !== 'JTAC1'; i++) cdu.steer(1);
    const sp = cdu.steerpoint();
    expect(sp).toMatchObject({ kind: 'waypoint', number: 4, id: 'JTAC1' });
    expect(Math.hypot(sp.x - 0, sp.z - 10)).toBeLessThanOrEqual(10);
    expect(steers.at(-1)).toMatchObject({ number: 4, id: 'JTAC1' });
    expect(lastLog()).toBe('Steerpoint 4 JTAC1');
    expect(checkScreen(cdu)[2]).toMatch(/^±4 SP +JTAC1\[\]$/);
    expect([...cdu.milestones]).toEqual(['wp-menu', 'waypt', 'copy', 'utm', 'grid', 'named', 'steer-user']);
  });

  it('never cycles FLT PLAN to a copied point; MISSION includes 0 and copies', () => {
    const { cdu } = setup();
    cdu.fsk('WP'); cdu.lsk('R3'); cdu.lsk('R7');
    const seen = new Set<number>();
    for (let i = 0; i < 8; i++) { cdu.steer(1); seen.add(cdu.steerpoint().number!); }
    expect([...seen].sort()).toEqual([1, 2, 3]);
    expect(cdu.milestones.has('steer-user')).toBe(false);
    const before = cdu.steerpoint().number;
    cdu.setDial('MISSION');
    expect(cdu.steerpoint().number).toBe(before); // the dial changes the database only
    const all = new Set<number>();
    for (let i = 0; i < 10; i++) { cdu.steer(-1); all.add(cdu.steerpoint().number!); }
    expect([...all].sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it('wraps the steerpoint both ways', () => {
    const { cdu } = setup();
    cdu.steer(-1);
    expect(cdu.steerpoint().number).toBe(3);
    cdu.steer(1);
    expect(cdu.steerpoint().number).toBe(1);
  });

  it('cycles markpoints with STEER PT MARK and logs an empty list', () => {
    const { cdu, marks, log, steers, lastLog } = setup();
    cdu.setDial('MARK');
    cdu.steer(1);
    expect(log.at(-1)).toEqual({ text: 'No markpoints', tone: 'caution' });
    expect(cdu.steerpoint().number).toBe(1);
    expect(steers).toHaveLength(0);
    marks.push({ letter: 'B', x: 200, z: 0 }, { letter: 'Z', x: 900, z: 0 }, { letter: 'A', x: 100, z: 0 });
    cdu.steer(1);
    expect(cdu.steerpoint()).toMatchObject({ kind: 'mark', letter: 'A', id: 'MRK A', x: 100, number: null });
    expect(lastLog()).toBe('Steerpoint A MRK A');
    cdu.steer(1);
    expect(cdu.steerpoint().letter).toBe('B');
    cdu.steer(1);
    expect(cdu.steerpoint().letter).toBe('Z');
    cdu.steer(1);
    expect(cdu.steerpoint().letter).toBe('A');
    cdu.steer(-1);
    expect(cdu.steerpoint().letter).toBe('Z');
    expect(checkScreen(cdu)[0]).toMatch(/^ {7} {2} {2}Z +D5\/B1$/);
    // The mark steerpoint keeps its coordinates when the letter is overwritten or gone.
    marks.splice(0, marks.length, { letter: 'Z', x: 5000, z: 5000 });
    expect(cdu.steerpoint()).toMatchObject({ letter: 'Z', x: 900, z: 0 });
    marks.length = 0;
    expect(cdu.steerpoint()).toMatchObject({ letter: 'Z', x: 900, z: 0 });
  });

  it('looks points up with L3 and steps them with the ± rocker', () => {
    const { cdu, marks, enter } = setup();
    marks.push({ letter: 'A', x: 100, z: 0 }, { letter: 'C', x: 300, z: 0 });
    cdu.rocker(1);
    expect(cdu.shown()).toEqual({ kind: 'waypoint', number: 0 }); // not on the WAYPT page
    cdu.fsk('WP'); cdu.lsk('L3');
    expect(cdu.shown()).toEqual({ kind: 'waypoint', number: 1 });
    enter('3', 'L3');
    expect(cdu.shown()).toEqual({ kind: 'waypoint', number: 3 });
    expect(cdu.scratch).toBe('');
    cdu.rocker(1);
    expect(cdu.shown()).toEqual({ kind: 'waypoint', number: 0 });
    cdu.rocker(-1);
    expect(cdu.shown()).toEqual({ kind: 'waypoint', number: 3 });
    enter('c', 'L3');
    expect(cdu.shown()).toEqual({ kind: 'mark', letter: 'C' });
    let l = checkScreen(cdu);
    expect(l[2]).toMatch(/^±C +MRK C\[\]$/);
    expect(l[4]).toMatch(/^EL:\d+ +DTOT\[\]$/);
    expect(l[5]).toBe('');
    expect(l[6]).toMatch(/^N42°00\.000 +\?4⊕$/);
    cdu.rocker(1);
    expect(cdu.shown()).toEqual({ kind: 'mark', letter: 'A' });
    cdu.rocker(-1);
    expect(cdu.shown()).toEqual({ kind: 'mark', letter: 'C' });
    cdu.lsk('R9');
    l = checkScreen(cdu);
    expect(l[6]).toMatch(/^37T WG84 +\?4⊕$/);
    expect(l[8]).toMatch(/^GH 50300 50000 +UTM↕$/);
    // WP MENU R3 goes back to the last shown waypoint.
    cdu.fsk('WP'); cdu.lsk('R3');
    expect(cdu.shown()).toEqual({ kind: 'waypoint', number: 3 });
    // Lookup errors.
    enter('9', 'L3');
    expect(cdu.error).toBe(true);
    cdu.clr();
    enter('B', 'L3');
    expect(cdu.error).toBe(true);
    cdu.clr();
    enter('AB', 'L3');
    expect(cdu.error).toBe(true);
    cdu.clr();
    cdu.lsk('L3'); // empty scratchpad: nothing
    expect(cdu.error).toBe(false);
    expect(cdu.shown()).toEqual({ kind: 'waypoint', number: 3 });
  });

  it('copies a markpoint into a mission waypoint', () => {
    const { cdu, marks, enter } = setup();
    marks.push({ letter: 'A', x: 1000, z: -2000 });
    cdu.fsk('WP'); cdu.lsk('R3');
    enter('A', 'L3');
    cdu.lsk('R7');
    expect(cdu.shown()).toEqual({ kind: 'waypoint', number: 4 });
    expect(cdu.waypoints().at(-1)).toMatchObject({ id: 'MSN004', x: 1000, z: -2000, user: true, cr: true });
  });

  it('PREV goes back one page', () => {
    const { cdu, lastLog } = setup();
    cdu.fsk('WP'); cdu.lsk('R3');
    expect(cdu.page).toBe('waypt');
    cdu.fsk('PREV');
    expect(cdu.page).toBe('wpmenu');
    cdu.fsk('PREV');
    expect(cdu.page).toBe('waypt');
    cdu.fsk('NAV');
    expect(cdu.page).toBe('blank');
    expect(lastLog()).toBe('CDU NAV page: not modelled');
    cdu.fsk('PREV');
    expect(cdu.page).toBe('waypt');
  });

  it('logs the WP MENU and WAYPT keys that are not modelled', () => {
    const { cdu, log } = setup();
    cdu.fsk('WP');
    cdu.lsk('L5'); cdu.lsk('R5'); cdu.lsk('R9');
    expect(log.map(l => l.text)).toEqual(['ANCHOR PT: not modelled', 'FROM PT: not modelled', 'WG84: not modelled']);
    cdu.lsk('R3'); cdu.lsk('R5');
    expect(log.at(-1)?.text).toBe('DTOT: not modelled');
  });

  it('rejects bad grid, zone and elevation entries', () => {
    const { cdu, enter, log } = setup();
    cdu.fsk('WP'); cdu.lsk('R3'); cdu.lsk('R7');
    // L/L mode: L7 and L9 explain instead of failing, and keep the scratchpad.
    enter('GH50004999', 'L9');
    expect(cdu.error).toBe(false);
    expect(cdu.scratch).toBe('GH50004999');
    expect(log.at(-1)).toEqual({ text: 'L/L entry is not modelled: switch to UTM with R9', tone: 'caution' });
    cdu.lsk('L7');
    expect(log.at(-1)?.tone).toBe('caution');
    cdu.clr();
    cdu.lsk('R9');
    for (const bad of ['GH5000499', 'DQ50004999', 'JTAC']) {
      enter(bad, 'L9');
      expect(cdu.error, bad).toBe(true);
      const l = checkScreen(cdu);
      expect(l[9]).toMatch(/^CDU INPUT ERR +P1\/2$/);
      expect(cdu.cursorCol()).toBeNull();
      cdu.clr();
      expect(cdu.error).toBe(false);
      expect(cdu.scratch).toBe('');
    }
    expect(cdu.milestones.has('grid')).toBe(false);
    enter('37T', 'L7');
    expect(cdu.error).toBe(false);
    expect(cdu.scratch).toBe('');
    enter('38T', 'L7');
    expect(cdu.error).toBe(true);
    cdu.clr();
    enter('123456', 'L5');
    expect(cdu.error).toBe(true);
    cdu.clr();
    enter('570', 'L5');
    const w = cdu.waypoints().at(-1)!;
    expect(w).toMatchObject({ elevFt: 570, cr: false });
    const l = checkScreen(cdu);
    expect(l[4]).toMatch(/^\[\]EL:570 +DTOT\[\]$/);
    expect(l[5]).toBe('NO CR');
    // A grid entry takes the ground elevation again.
    enter('GH083998', 'L9');
    expect(w).toMatchObject({ x: 8300 - 50000, z: 50000 - 99800, cr: true });
    expect(checkScreen(cdu)[8]).toMatch(/^\[\]GH 08300 99800 +UTM↕$/);
  });

  it('reports a grid entry on the steerpoint to the host', () => {
    const { cdu, enter, steers } = setup();
    cdu.fsk('WP'); cdu.lsk('L3'); cdu.lsk('R9');
    enter('GH5100050000', 'L9');
    expect(steers.at(-1)).toMatchObject({ number: 1, x: 1000, z: 0 });
    expect(cdu.steerpoint()).toMatchObject({ x: 1000, z: 0 });
  });

  it('keeps a markpoint position read-only', () => {
    const { cdu, marks, enter } = setup();
    marks.push({ letter: 'A', x: 100, z: 0 });
    cdu.fsk('WP'); cdu.lsk('R3'); cdu.lsk('R9');
    enter('A', 'L3');
    for (const [text, k] of [['500', 'L5'], ['GH50004999', 'L9'], ['37T', 'L7']] as const) {
      enter(text, k);
      expect(cdu.error, k).toBe(true);
      cdu.clr();
    }
    expect(marks[0]).toEqual({ letter: 'A', x: 100, z: 0 });
    // A mark can be renamed.
    enter('TGT A', 'R3');
    expect(cdu.error).toBe(false);
    expect(checkScreen(cdu)[2]).toMatch(/^±A +TGT A\[\]$/);
    expect(cdu.milestones.has('named')).toBe(false);
  });

  it('validates names', () => {
    const { cdu, marks, enter } = setup();
    marks.push({ letter: 'A', x: 100, z: 0 });
    cdu.fsk('WP'); cdu.lsk('R3'); cdu.lsk('R7');
    for (const bad of ['1TGT', 'TGT', 'tgt', 'MRK A', 'ABCDEFGHIJKLM', 'TGT/A', 'TGT ']) {
      cdu.clr();
      enter(bad, 'R3');
      expect(cdu.error, bad).toBe(true);
    }
    cdu.clr();
    enter('TGT.A 2', 'R3');
    expect(cdu.error).toBe(false);
    expect(cdu.waypoints().at(-1)!.id).toBe('TGT.A 2');
    expect(cdu.milestones.has('named')).toBe(true);
    // Its own name again is fine.
    enter('TGT.A 2', 'R3');
    expect(cdu.error).toBe(false);
    enter('ABCDEFGHIJKL', 'R3');
    expect(cdu.error).toBe(false);
    expect(checkScreen(cdu)[2]).toMatch(/ABCDEFGHIJKL\[\]$/);
  });

  it('caps the scratchpad and ignores typing while the error shows', () => {
    const { cdu, type, enter } = setup();
    type('ABCDEFGHIJKLMNOPQRST');
    expect(cdu.scratch).toHaveLength(SCRATCH_MAX);
    expect(cdu.cursorCol()).toBe(16);
    expect(checkScreen(cdu)[9]).toBe('[ABCDEFGHIJKLMNO');
    cdu.bck();
    expect(cdu.scratch).toBe('ABCDEFGHIJKLMN');
    cdu.clr();
    cdu.key('a'); cdu.key('#'); cdu.key('/'); cdu.key('.'); cdu.space(); cdu.key('7'); cdu.key('12');
    expect(cdu.scratch).toBe('A/. 7');
    cdu.clr();
    cdu.fsk('WP'); cdu.lsk('R3');
    enter('GH', 'L3');
    expect(cdu.error).toBe(true);
    cdu.key('X'); cdu.space(); cdu.bck();
    expect(cdu.scratch).toBe('GH');
    cdu.lsk('L3');
    expect(cdu.error).toBe(true);
    cdu.clr();
    expect(cdu.error).toBe(false);
    expect(cdu.scratch).toBe('');
  });

  it('opens a new mark page and the MARK annunciation; FA clears it', () => {
    const { cdu, marks } = setup();
    const a = { letter: 'A', x: 100, z: 200 };
    marks.push(a);
    cdu.onMark(a);
    expect(cdu.page).toBe('waypt');
    expect(cdu.shown()).toEqual({ kind: 'mark', letter: 'A' });
    expect(cdu.annunciation).toBe('MARK A');
    expect(checkScreen(cdu)[1]).toBe('MARK A');
    cdu.fa();
    expect(cdu.annunciation).toBeNull();
    cdu.fsk('WP');
    const z = { letter: 'Z', x: 0, z: 0 };
    marks.push(z);
    cdu.onMark(z);
    expect(cdu.page).toBe('wpmenu');
    expect(cdu.annunciation).toBeNull();
  });

  it('draws 10 lines of at most 24 characters in every page state', () => {
    const { cdu, marks, enter } = setup({ plan: [{ id: 'ABCDEFGHIJKL', x: -49999, z: 49999 }] });
    marks.push({ letter: 'Y', x: 49999, z: -49999 });
    const states: (() => void)[] = [
      () => {},
      () => cdu.fsk('WP'),
      () => cdu.lsk('R3'),
      () => cdu.lsk('R9'),
      () => cdu.lsk('R9'),
      () => enter('1', 'L3'),
      () => { cdu.setDial('MARK'); cdu.steer(1); },
      () => enter('Y', 'L3'),
      () => cdu.lsk('R9'),
      () => cdu.onMark(marks[0]!),
      () => enter('ABCDEFGHIJKLMNOP', 'L9'),
      () => cdu.fsk('SYS'),
    ];
    for (const s of states) {
      s();
      checkScreen(cdu);
      expect(cdu.lines()[9].startsWith(cdu.error ? 'CDU INPUT ERR' : '[')).toBe(true);
    }
    cdu.fsk('WP'); cdu.lsk('L3');
    expect(checkScreen(cdu)[2]).toMatch(/^±Y SP +MRK Y\[\]$/);
  });

  it('resets to the start state', () => {
    const { cdu, enter } = setup();
    cdu.fsk('WP'); cdu.lsk('R3'); cdu.lsk('R7'); cdu.lsk('R9');
    enter('X', 'L9');
    cdu.setDial('MISSION');
    cdu.reset({ init: { x: 0, z: 0 }, plan: [{ id: 'ONE', x: 5, z: 5 }] });
    expect(cdu.page).toBe('blank');
    expect(cdu.dial).toBe('FLT PLAN');
    expect(cdu.error).toBe(false);
    expect(cdu.scratch).toBe('');
    expect(cdu.utm).toBe(false);
    expect(cdu.milestones.size).toBe(0);
    expect(cdu.waypoints().map(w => w.id)).toEqual(['INIT POSIT', 'ONE']);
    expect(cdu.steerpoint()).toMatchObject({ number: 1, id: 'ONE' });
  });
});
