/** [OWNER: page-radar-lab] Scan geometry, key mapping, Why sentences, and every exercise on every jet. */
import { describe, expect, test } from 'vitest';
import { AIRCRAFT, AIRCRAFT_ORDER } from '../../data/aircraft';
import type { AircraftId } from '../../data/types';
import { setManeuver } from '../../sim/scenarios';
import { D2R, M_PER_NM } from '../../sim/math';
import {
  azCenterLimitDeg, beamWindowDeg, clock, coverageAt, frameTime, lookDownCaveat, metresPerDegree, minFrame, niceRange,
  patternLimitsDeg, scanCombos, twsAllows, twsPatternFor,
} from './geometry';
import { labKeys } from './labKeys';
import { whySentence, type WhyData } from './whyPanel';
import { EXERCISE_DEFS, availableExercises, notchButtons, notchPress, type ExerciseId, type Mem, type Snap, type TargetSnap } from './exercises';
import { PLAYER, buildLabWorld, buildSnap, needsRestart, readScan, updatePaints, type PaintRec } from './labSim';
import { simplifiedLines } from './explainer';

describe('scan geometry', () => {
  test('frame times match the documented DCS values', () => {
    expect(frameTime(AIRCRAFT.su27.radar, 30, 4)).toBeCloseTo(5, 5);
    expect(frameTime(AIRCRAFT.f16c.radar, 60, 4)).toBeCloseTo(8, 5);
    expect(frameTime(AIRCRAFT.f16c.radar, 30, 2)).toBeCloseTo(2, 5);
    expect(frameTime(AIRCRAFT.f14b.radar, 20, 4)).toBeCloseTo(2, 5);
  });
  test('coverage is range × tan(angle), 1° ≈ 100 ft per nm', () => {
    const c = coverageAt(9000, 50000, 5, -5);
    expect(c.top).toBeCloseTo(9000 + 50000 * Math.tan(5 * D2R), 3);
    expect(c.bottom).toBeCloseTo(9000 - 50000 * Math.tan(5 * D2R), 3);
    expect(metresPerDegree(M_PER_NM) / 0.3048).toBeGreaterThan(100);
    expect(metresPerDegree(M_PER_NM) / 0.3048).toBeLessThan(110);
    const lim = patternLimitsDeg(AIRCRAFT.su27.radar, -2, 4);
    expect(lim.top).toBeCloseTo(3, 5);
    expect(lim.bottom).toBeCloseTo(-7, 5);
  });
  test('beam window asin(gate / speed): ±6.9° at 450 kt for a 54 kt gate', () => {
    expect(beamWindowDeg(54, 450)).toBeCloseTo(6.9, 1);
    expect(beamWindowDeg(133, 450)).toBeCloseTo(17.2, 1);
  });
  test('TWS limits reproduce the DCS pairs', () => {
    const h = AIRCRAFT.fa18c.radar;
    expect(twsAllows(h, 40, 2)).toBe(true);
    expect(twsAllows(h, 20, 4)).toBe(true);
    expect(twsAllows(h, 30, 4)).toBe(false);
    expect(twsAllows(AIRCRAFT.m2000c.radar, 15, 1)).toBe(false);
    const viper = scanCombos('f16c');
    expect(viper.find(c => c.azHalfDeg === 25)?.bugOnly).toBe(true);
    expect(viper.find(c => c.bars === 3)?.bugOnly).toBe(true);
    expect(azCenterLimitDeg(AIRCRAFT.f16c.radar, 60)).toBe(0);
  });
  test('Flankers cannot shorten their frame', () => {
    for (const ac of ['su27', 'su33', 'j11a', 'mig29s'] as AircraftId[]) expect(minFrame(ac)).toBeCloseTo(5, 5);
    expect(minFrame('f15c')).toBeCloseTo(2.5, 5);
  });
  test('nice ranges round down in the pilot units', () => {
    expect(niceRange(47000, 'metric')).toBe(45000);
    expect(niceRange(60000, 'imperial')).toBeCloseTo(30 * M_PER_NM, 3);
  });
});

describe('DCS keys per jet', () => {
  test('FC3 Russian: range-angle aiming and three scan positions', () => {
    const k = labKeys('su27');
    expect(k.elev).toMatchObject({ a: 'RShift+;', b: 'RShift+.', fallback: false });
    expect(k.zone).toMatchObject({ a: 'RShift+,', b: 'RShift+/', fallback: false });
    expect(k.expRange).toMatchObject({ a: 'RCtrl+=', b: 'RCtrl+-' });
    expect(k.width).toBeNull();
    expect(k.mode?.key).toBe('RAlt+I');
  });
  test('F-15C scan width on RCtrl + = / -', () => {
    const k = labKeys('f15c');
    expect(k.width).toMatchObject({ a: 'RCtrl+=', b: 'RCtrl+-', fallback: false });
    expect(k.range).toMatchObject({ a: '=', b: '-' });
  });
  test('Hornet and Viper antenna elevation on = / -, no clash with a range fallback', () => {
    for (const ac of ['fa18c', 'f16c'] as AircraftId[]) {
      const k = labKeys(ac);
      expect(k.elev).toMatchObject({ a: '=', b: '-', fallback: false });
      expect(k.range).toBeNull();
    }
    expect(labKeys('f16c').mode).toMatchObject({ key: 'RCtrl+Right', hold: true });
  });
  test('Mirage has no TWS key; missing keys fall back to FC3 defaults', () => {
    const k = labKeys('m2000c');
    expect(k.mode).toBeNull();
    expect(k.elev?.fallback).toBe(true);
    expect(k.cursor.fallback).toBe(false);
  });
  test('every jet gets unique chords', () => {
    for (const ac of AIRCRAFT_ORDER) {
      const k = labKeys(ac);
      const all = [k.elev, k.zone, k.width, k.range, k.expRange].flatMap(p => (p ? [p.a, p.b] : []));
      if (k.mode) all.push(k.mode.key);
      expect(new Set(all).size, ac).toBe(all.length);
    }
  });
});

describe('Why sentences', () => {
  const base: WhyData = {
    callsign: 'Bandit', type: 'Su-27', units: 'metric', range: 35000, groundRange: 34000, alt: 1000, ownAlt: 9000, aspectDeg: 5,
    az: 3, el: -13, azLo: -30, azHi: 30, gimbalAz: 60, top: 6.25, bottom: -6.25, inGimbal: true, inAz: true, inBars: false,
    detectRange: 48000, beyond: false, lookDown: true, radial: 250, gate: 58, notched: false, notchNeedsLookDown: false,
    seenNow: false, lastPaintAgo: null, frame: 5, radarOff: false, rcs: 6,
  };
  test('below the bars says how far and which way to tilt', () => {
    const w = whySentence(base);
    expect(w.status).toBe('NOT SEEN');
    expect(w.lead).toMatch(/6\.8° below the scan/);
    expect(w.lead).toMatch(/Tilt the antenna down/);
  });
  test('several reasons: lead plus the rest', () => {
    const w = whySentence({ ...base, notched: true, radial: 10 });
    expect(w.also).toEqual(['in the notch']);
  });
  test('painted and waiting states', () => {
    expect(whySentence({ ...base, inBars: true, el: 0, seenNow: true, lastPaintAgo: 1.2 }).status).toBe('PAINTED');
    expect(whySentence({ ...base, inBars: true, el: 0 }).status).toBe('IN SCAN');
    expect(whySentence({ ...base, inAz: false, az: 40 }).lead).toMatch(/right of the scan edge/);
  });
});

// ------------------------------------------------------------------------------------------ exercises

/** Fly an exercise with a pilot who sets the scan correctly; returns the time it took (s) or null. */
function flyExercise(ac: AircraftId, id: Exclude<ExerciseId, 'free'>): number | null {
  const def = EXERCISE_DEFS[id];
  const units = AIRCRAFT[ac].units;
  const scene = def.scene(ac, units);
  const { world, me, targetIds } = buildLabWorld(ac, units, scene, scene.scan);
  const r = AIRCRAFT[ac].radar;
  const paint = new Map<string, PaintRec>();
  const inspected = new Set<string>(id === 'aspect' ? targetIds : []);
  const mem: Mem = { latched: [] };
  const ru = AIRCRAFT[ac].display === 'ru-hud';
  const lead = () => { const t = world.get(targetIds[Math.min(1, targetIds.length - 1)]); return t ? t : undefined; };
  const elTo = (tg: { pos: { x: number; y: number; z: number } } | undefined) => {
    if (!tg) return 0;
    return Math.atan2(tg.pos.y - me.pos.y, Math.hypot(tg.pos.x - me.pos.x, tg.pos.z - me.pos.z));
  };
  const azTo = (tg: { pos: { x: number; z: number } } | undefined) => {
    if (!tg) return 0;
    return Math.atan2(tg.pos.x - me.pos.x, -(tg.pos.z - me.pos.z)) - me.heading;
  };
  const opts = scanCombos(ac).filter(c => !c.bugOnly);
  if (id === 'revisit') {
    const c = opts.filter(x => x.frame <= 3).sort((a, b) => b.azHalfDeg - a.azHalfDeg || b.bars - a.bars)[0];
    world.setScan(PLAYER, { azHalf: c.azHalfDeg * D2R, bars: c.bars, azCenter: azTo(lead()), autoCenter: false });
  }
  if (id === 'centre') {
    if (ru) world.setScan(PLAYER, { azCenter: 30 * D2R, elCenter: elTo(lead()) });
    else {
      const start = frameTime(r, Math.min(Math.max(...r.azHalfWidthOptionsDeg), r.gimbalAzDeg), r.barOptions.includes(4) ? 4 : r.barOptions[0]);
      const c = opts.filter(x => x.frame <= 0.55 * start && x.azHalfDeg >= 10).sort((a, b) => b.frame - a.frame)[0];
      world.setScan(PLAYER, { azHalf: c.azHalfDeg * D2R, bars: c.bars, autoCenter: false });
      world.setScan(PLAYER, { azCenter: azTo(lead()), elCenter: elTo(lead()) });
    }
  }
  for (let t = 0; t < scene.maxTime; t += 0.1) {
    if (id === 'low') {
      const tg = world.get(targetIds[0]);
      if (tg) world.setScan(PLAYER, { elCenter: elTo(tg), cursor: { az: 0, range: Math.hypot(tg.pos.x - me.pos.x, tg.pos.z - me.pos.z) } });
    }
    world.step(0.1);
    updatePaints(world, me, targetIds, paint);
    const ev = def.evaluate(buildSnap(world, me, units, scene, targetIds, paint, inspected, null), mem);
    if (ev.command) setManeuver(world, targetIds[ev.command.index], ev.command.maneuver, { refId: PLAYER });
    if (id === 'notch' && mem.phase === 'gone') {
      setManeuver(world, targetIds[0], 'hot', { refId: PLAYER });
      mem.phase = 'hotAgain'; mem.since = world.t;
    }
    if (ev.done) return world.t;
    if (needsRestart(world, me, targetIds, scene)) return null;
  }
  return null;
}

describe('exercises on every jet', () => {
  test('availability is data-driven: Flankers cannot trade frame time', () => {
    expect(availableExercises('su27')).not.toContain('revisit');
    expect(availableExercises('mig29s')).not.toContain('revisit');
    for (const ac of ['f15c', 'fa18c', 'f16c', 'f14b', 'jf17', 'm2000c'] as AircraftId[]) expect(availableExercises(ac)).toHaveLength(5);
    expect(EXERCISE_DEFS.revisit.unavailable('su27')).toMatch(/fixed/);
  });
  test('scenes start with the problem visible: low bandit below the bars, notch bandit painted in the bars', () => {
    for (const ac of AIRCRAFT_ORDER) {
      const sc = EXERCISE_DEFS.low.scene(ac, AIRCRAFT[ac].units);
      const lw = buildLabWorld(ac, AIRCRAFT[ac].units, sc, sc.scan);
      const snap = buildSnap(lw.world, lw.me, 'metric', sc, lw.targetIds, new Map(), new Set(), null);
      expect(snap.targets[0].inBars, ac).toBe(false);
      expect(Math.abs(snap.cursorRange - snap.targets[0].groundRange) > 0.15 * snap.targets[0].groundRange, ac).toBe(true);
      expect(snap.targets[0].beyond, ac).toBe(false);
    }
  });
  test('free scan shows every reason on every jet, for the whole scene', () => {
    for (const ac of AIRCRAFT_ORDER) {
      const sc = EXERCISE_DEFS.free.scene(ac, AIRCRAFT[ac].units);
      const lw = buildLabWorld(ac, AIRCRAFT[ac].units, sc, sc.scan);
      for (let t = 2; t < sc.maxTime; t += 4) {
        while (lw.world.t < t) lw.world.step(0.1);
        if (needsRestart(lw.world, lw.me, lw.targetIds, sc)) break;
        const snap = buildSnap(lw.world, lw.me, 'metric', sc, lw.targetIds, new Map(), new Set(), null);
        const by = (role: string) => snap.targets.find(x => x.role === role);
        expect(by('painted')?.detectable, `${ac} painted @${t}`).toBe(true);
        expect(by('high')?.inBars, `${ac} high @${t}`).toBe(false);
        expect(by('low beaming')?.notched, `${ac} notch @${t}`).toBe(true);
        expect(by('cold, far')?.beyond, `${ac} beyond @${t}`).toBe(true);
        expect(by('wide')?.inAz, `${ac} wide @${t}`).toBe(false);
      }
    }
  });
  for (const ac of AIRCRAFT_ORDER) {
    for (const id of availableExercises(ac)) {
      test(`${ac} ${id} can be completed`, () => {
        const t = flyExercise(ac, id);
        if (process.env.RL_TIMES) console.log(`${ac} ${id}: ${t?.toFixed(1)} s`);
        expect(t, `${ac} ${id}`).not.toBeNull();
      });
    }
  }
});

// ------------------------------------------------------------------------------------------ review fixes

describe('review fixes', () => {
  test('notch: Beam waits for the first hot paint, so step 1 can always tick', () => {
    const mem: Mem = { latched: [] };
    expect(notchButtons(mem).beam).toMatch(/first paint/);
    expect(notchPress(mem, 'beam', 1)).toBe(false);
    expect(mem.phase ?? 'hot').toBe('hot');
    mem.latched[0] = true;
    expect(notchButtons(mem).beam).toBeNull();
    expect(notchPress(mem, 'beam', 2)).toBe(true);
    expect(mem.phase).toBe('beaming');
    expect(notchPress(mem, 'beam', 3)).toBe(false);
    mem.phase = 'gone';
    expect(notchButtons(mem).hotLit).toBe(true);
    expect(notchPress(mem, 'hot', 9)).toBe(true);
    expect(mem).toMatchObject({ phase: 'hotAgain', since: 9 });
    // Done: Beam replays the exercise instead of doing nothing.
    mem.phase = 'done';
    expect(notchPress(mem, 'beam', 20)).toBe(true);
    expect(mem.phase).toBe('beaming');
  });

  const tgt = (o: Partial<TargetSnap>): TargetSnap => ({
    id: 'x', role: '', callsign: 'X', range: 60000, groundRange: 60000, alt: 9000, az: 0, el: 0, inGimbal: true, inAz: true,
    inBars: true, beyond: false, notched: false, detectable: true, detectRange: 70000, radial: 200, groundSpeed: 250,
    seenNow: false, lastPaint: null, firstSeenRange: null, inspected: false, ...o,
  });
  const snap = (ac: AircraftId, targets: TargetSnap[], o: Partial<Snap> = {}): Snap => ({
    t: 10, ac, units: 'metric', mode: 'rws', ownAlt: 9000, frame: 8, revisit: 8, bars: 4, azHalfDeg: 60, azCenterDeg: 0,
    elCenterDeg: 0, cursorRange: 60000, covTop: 12000, covBottom: 6000, selectedId: null, targets, ...o,
  });

  test('aspect coach never prints "×1" for a radar without a look-down penalty', () => {
    for (const ac of ['f15c', 'mig29s'] as AircraftId[]) {
      const ts = ['hot-high', 'hot-low', 'cold-high', 'cold-low'].map((role, i) => tgt({ id: role, role, firstSeenRange: i === 0 ? 50000 : null }));
      const ev = EXERCISE_DEFS.aspect.evaluate(snap(ac, ts), { latched: [] });
      expect(ev.why, ac).not.toMatch(/×1\b/);
      expect(ev.why, ac).toMatch(/no look-down penalty/);
    }
  });

  test('revisit coach gives the real bearing, not a clock code that is off by 20°', () => {
    const ts = [tgt({ az: 5 }), tgt({ az: 10 }), tgt({ az: 15, inAz: false })];
    const ev = EXERCISE_DEFS.revisit.evaluate(snap('f16c', ts, { frame: 8 }), { latched: [] });
    expect(ev.text).not.toMatch(/o'clock/);
    expect(ev.text).toMatch(/\+10° off the nose/);
    expect(clock(10)).toBe("12 o'clock");
    expect(clock(38)).toBe("1 o'clock");
    expect(clock(-90)).toBe("9 o'clock");
  });

  test('corrected N-001 geometry no longer carries the obsolete look-down caveat', () => {
    for (const ac of ['su27', 'su33', 'j11a'] as AircraftId[]) {
      expect(lookDownCaveat(ac)).toBeNull();
      expect(simplifiedLines(ac).some(l => /applies ×0.7 at every aspect/.test(l))).toBe(false);
    }
  });

  test('FC3 presets initialize expected range from the preset cursor, not the generic radar default', () => {
    const sc = EXERCISE_DEFS.free.scene('su27', 'metric');
    const lw = buildLabWorld('su27', 'metric', sc, { ...sc.scan, cursorM: 70000 });
    expect(lw.me.radar.expectedRange).toBe(70000);
    expect(lw.me.radar.cursor.range).toBe(70000);
  });

  test('FC3 scene restarts retain independently entered expected range, cursor and tilt', () => {
    const sc = EXERCISE_DEFS.free.scene('su27', 'metric');
    const lw = buildLabWorld('su27', 'metric', sc, sc.scan);
    lw.world.setScan(PLAYER, { expectedRange: 80000, cursor: { az: 0, range: 15000 }, elCenter: 3 * D2R });
    const saved = readScan(lw.me);
    expect(saved.expectedRangeM).toBe(80000);
    expect(saved.cursorM).toBe(15000);
    const again = buildLabWorld('su27', 'metric', sc, saved);
    expect(again.me.radar.expectedRange).toBe(80000);
    expect(again.me.radar.cursor.range).toBe(15000);
    expect(again.me.radar.elCenter).toBeCloseTo(3 * D2R);
  });

  test('non-FC3 presets leave expected range absent', () => {
    const sc = EXERCISE_DEFS.free.scene('f15c', 'imperial');
    const lw = buildLabWorld('f15c', 'imperial', sc, { ...sc.scan, expectedRangeM: 70000 });
    expect(lw.me.radar.expectedRange).toBeNull();
    expect(readScan(lw.me).expectedRangeM).toBeUndefined();
  });

  test('VS survives a scene restart; STT does not', () => {
    const sc = EXERCISE_DEFS.free.scene('fa18c', 'imperial');
    const lw = buildLabWorld('fa18c', 'imperial', sc, sc.scan);
    lw.world.setRadarMode(PLAYER, 'vs');
    expect(readScan(lw.me).mode).toBe('vs');
    const again = buildLabWorld('fa18c', 'imperial', sc, readScan(lw.me));
    expect(again.me.radar.mode).toBe('vs');
  });

  test('Why panel: an opening target in VS is explained, not "wait for the beam"', () => {
    const base: WhyData = {
      callsign: 'Bandit', type: 'Su-27', units: 'imperial', range: 50000, groundRange: 50000, alt: 9000, ownAlt: 9000, aspectDeg: 170,
      az: 0, el: 0, azLo: -30, azHi: 30, gimbalAz: 70, top: 5, bottom: -5, inGimbal: true, inAz: true, inBars: true,
      detectRange: 60000, beyond: false, lookDown: false, radial: 200, gate: 27.8, notched: false, notchNeedsLookDown: true,
      seenNow: false, lastPaintAgo: null, frame: 4, radarOff: false, rcs: 6,
    };
    expect(whySentence(base).status).toBe('IN SCAN');
    const w = whySentence({ ...base, vsOpening: true });
    expect(w.status).toBe('NOT SEEN');
    expect(w.lead).toMatch(/VS plots closure/);
  });

  test('F-14 TWS offers only ±20° 4-bar and ±40° 2-bar; a pick selects the matching pattern', () => {
    const tws = scanCombos('f14b').filter(c => c.tws).map(c => `${c.azHalfDeg}/${c.bars}`);
    expect(tws.sort()).toEqual(['20/4', '40/2']);
    expect(twsPatternFor('f14b', { azHalfDeg: 40, bars: 2 }, { azHalfDeg: 20 })).toEqual({ azHalfDeg: 20, bars: 4 });
    expect(twsPatternFor('f14b', { azHalfDeg: 20, bars: 4 }, { bars: 2 })).toEqual({ azHalfDeg: 40, bars: 2 });
    expect(twsPatternFor('f14b', { azHalfDeg: 65, bars: 4 }, {})).toEqual({ azHalfDeg: 40, bars: 2 });
    // Hornet: no 1-bar TWS; 6B only at ±10°.
    expect(scanCombos('fa18c').some(c => c.tws && c.bars === 1)).toBe(false);
    expect(twsPatternFor('fa18c', { azHalfDeg: 40, bars: 2 }, { bars: 6 })).toEqual({ azHalfDeg: 10, bars: 6 });
    expect(twsPatternFor('f15c', { azHalfDeg: 30, bars: 4 }, {})).toBeNull();
  });
});
