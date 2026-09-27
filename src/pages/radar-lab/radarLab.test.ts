/** [OWNER: page-radar-lab] Scan geometry, key mapping, Why sentences, and every exercise on every jet. */
import { describe, expect, test } from 'vitest';
import { AIRCRAFT, FIGHTER_ORDER } from '../../data/aircraft';
import type { FighterId } from '../../data/types';
import { defaultAdversary, setManeuver } from '../../sim/scenarios';
import { D2R, M_PER_NM } from '../../sim/math';
import {
  azCenterLimitDeg, beamWindowDeg, clock, coverageAt, frameTime, lookDownCaveat, metresPerDegree, minFrame, niceRange,
  patternLimitsDeg, scanCombos, twsAllows, twsPatternFor,
} from './geometry';
import { labKeys } from './labKeys';
import { whySentence, type WhyData } from './whyPanel';
import {
  EXERCISE_DEFS, availableExercises, jammerType, notchButtons, notchPress, recordLockTry, strobeNearCursor,
  type ExerciseId, type JamSnap, type Mem, type Snap, type TargetSnap,
} from './exercises';
import { jamFacts, lockKeyOf } from './jamming';
import { BURN_THROUGH_M, OWN_JAMMER } from '../../data/ecm';
import { R2D } from '../../sim/math';
import { PLAYER, buildLabWorld, buildSnap, lastPaintOf, needsRestart, readScan, updatePaints, type PaintRec } from './labSim';
import { simplifiedLines } from './explainer';
import { IFF, IFF_CAVEATS } from '../../data/iff';
import { iffFacts } from './iff';
import type { IffSnap } from './exercises';
import { dlCue, type DlSnap, type DlTrackSnap } from './exercises';
import { dlFacts } from './datalink';
import { DATALINK, DATALINK_CAVEATS } from '../../data/datalink';

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
    for (const ac of ['su27', 'su33', 'j11a', 'mig29s'] as FighterId[]) expect(minFrame(ac)).toBeCloseTo(5, 5);
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
    for (const ac of ['fa18c', 'f16c'] as FighterId[]) {
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
    for (const ac of FIGHTER_ORDER) {
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
  test('a jammer in the scan is a strobe with the burn-through range, not "beyond range"', () => {
    const w = whySentence({ ...base, inBars: true, el: 0, beyond: true, range: 90000, jammed: { burnThrough: 25000, strobe: true } });
    expect(w.status).toBe('STROBE');
    expect(w.lead).toMatch(/burn-through at 25 km/);
    expect(whySentence({ ...base, jammed: { burnThrough: 25000, strobe: false } }).status).toBe('NOT SEEN');
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
function flyExercise(ac: FighterId, id: Exclude<ExerciseId, 'free'>): number | null {
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
    if (id === 'jam') {
      // The pilot: normal lock once the strobe shows (refused), then a jam lock with the cursor on the strobe.
      const st = me.radar;
      if (st.strobes.length && mem.reason === undefined) recordLockTry(mem, world.canLock(PLAYER, targetIds[0]));
      if (mem.reason !== undefined && st.mode !== 'stt') {
        const hit = strobeNearCursor(st.strobes.map(x => ({ targetId: x.targetId, azDeg: x.az * R2D })), st.strobes[0] ? st.strobes[0].az * R2D : 0);
        if (hit) world.lockJammer(PLAYER, hit);
      }
    }
    if (id === 'iff') {
      // The pilot: interrogate once both contacts paint (interrogating jets), then lock the one that did not answer.
      const x = buildSnap(world, me, units, scene, targetIds, paint, inspected, null).iff;
      const auto = IFF[ac].mode === 'auto';
      if (x && !auto && x.friendSeen && x.hostileSeen && !mem.latched[1]) world.interrogate(PLAYER);
      const identified = auto ? mem.latched[0] : mem.latched[1];
      if (x && identified && x.stt !== 'hostile') world.lock(PLAYER, x.hostileId);
    }
    if (id === 'dl') {
      // The pilot: radar on (FC3), then once the datalink tracks show, slew the scan onto the AWACS track and lock.
      const f = dlFacts(ac);
      const x = buildSnap(world, me, units, scene, targetIds, paint, inspected, null).dl;
      if (me.radar.mode === 'off' && world.t > 1) world.setRadarMode(PLAYER, 'rws');
      const nSeen = (f.radarOnFirst ? 1 : 0) + 1 + (f.wingType ? 1 : 0);
      if (x && f.has && mem.latched.slice(0, nSeen).filter(Boolean).length === nSeen && me.radar.mode !== 'stt') {
        const cue = dlCue(x.tracks);
        const corr = x.tracks.find(t => t.source !== 'ppli' && t.correlated);
        if (corr) world.lock(PLAYER, corr.targetId);
        else if (cue) world.setScan(PLAYER, { azCenter: (ru ? 30 : cue.az) * D2R, autoCenter: false });
      }
    }
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
    for (const ac of ['f15c', 'fa18c', 'f16c', 'f14b', 'jf17', 'm2000c'] as FighterId[]) expect(availableExercises(ac)).toHaveLength(8);
    expect(EXERCISE_DEFS.revisit.unavailable('su27')).toMatch(/fixed/);
  });
  test('scenes start with the problem visible: low bandit below the bars, notch bandit painted in the bars', () => {
    for (const ac of FIGHTER_ORDER) {
      const sc = EXERCISE_DEFS.low.scene(ac, AIRCRAFT[ac].units);
      const lw = buildLabWorld(ac, AIRCRAFT[ac].units, sc, sc.scan);
      const snap = buildSnap(lw.world, lw.me, 'metric', sc, lw.targetIds, new Map(), new Set(), null);
      expect(snap.targets[0].inBars, ac).toBe(false);
      expect(Math.abs(snap.cursorRange - snap.targets[0].groundRange) > 0.15 * snap.targets[0].groundRange, ac).toBe(true);
      expect(snap.targets[0].beyond, ac).toBe(false);
    }
  });
  test('free scan shows every reason on every jet, for the whole scene', () => {
    for (const ac of FIGHTER_ORDER) {
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
  for (const ac of FIGHTER_ORDER) {
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
  const snap = (ac: FighterId, targets: TargetSnap[], o: Partial<Snap> = {}): Snap => ({
    t: 10, ac, units: 'metric', mode: 'rws', ownAlt: 9000, frame: 8, revisit: 8, bars: 4, azHalfDeg: 60, azCenterDeg: 0,
    elCenterDeg: 0, cursorRange: 60000, covTop: 12000, covBottom: 6000, selectedId: null, targets, ...o,
  });

  test('aspect coach never prints "×1" for a radar without a look-down penalty', () => {
    for (const ac of ['f15c', 'mig29s'] as FighterId[]) {
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
    for (const ac of ['su27', 'su33', 'j11a'] as FighterId[]) {
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

// ------------------------------------------------------------------------------------------ jammer

describe('jammer and burn-through', () => {
  const jsnap = (j: Partial<JamSnap>): Snap => ({
    t: 10, ac: 'f15c', units: 'imperial', mode: 'rws', ownAlt: 9000, frame: 2, revisit: 2, bars: 4, azHalfDeg: 30, azCenterDeg: 0,
    elCenterDeg: 0, cursorRange: 40000, covTop: 12000, covBottom: 6000, selectedId: null, targets: [],
    jam: { targetId: 'target1', jamming: true, az: 6, range: 70000, burnThrough: 35000, strobe: false, hoj: false, stt: false, ...j },
  });
  const ev = (mem: Mem, j: Partial<JamSnap>) => EXERCISE_DEFS.jam.evaluate(jsnap(j), mem);

  test('steps tick in order: strobe, refused lock, jam lock, normal STT at burn-through', () => {
    const mem: Mem = { latched: [] };
    expect(ev(mem, {}).steps).toEqual([false, false, false, false]);
    expect(ev(mem, { strobe: true }).steps).toEqual([true, false, false, false]);
    recordLockTry(mem, { ok: false, reason: 'Jammer: no range until burn-through. Lock the strobe (jam lock)' });
    const refused = ev(mem, { strobe: true });
    expect(refused.steps).toEqual([true, true, false, false]);
    expect(refused.text).toMatch(/Refused: "Jammer: no range/);
    expect(ev(mem, { hoj: true }).steps).toEqual([true, true, true, false]);
    const done = ev(mem, { range: 34000, stt: true });
    expect(done.steps).toEqual([true, true, true, true]);
    expect(done.done).toBe(true);
  });
  test('a normal STT without a jam lock first does not finish the exercise', () => {
    const mem: Mem = { latched: [] };
    recordLockTry(mem, { ok: false, reason: 'x' });
    const e = ev(mem, { range: 30000, stt: true });
    expect(e.steps[3]).toBe(false);
    expect(e.done).toBe(false);
    expect(e.text).toMatch(/inside burn-through/);
  });
  test('an accepted lock records no refusal', () => {
    const mem: Mem = { latched: [] };
    recordLockTry(mem, { ok: true, reason: '' });
    expect(mem.reason).toBeUndefined();
  });
  test('cursor picks the nearest strobe within tolerance', () => {
    const s = [{ targetId: 'a', azDeg: 5 }, { targetId: 'b', azDeg: -10 }];
    expect(strobeNearCursor(s, 4)).toBe('a');
    expect(strobeNearCursor(s, -8)).toBe('b');
    expect(strobeNearCursor(s, 20)).toBeNull();
  });
  test('the jammer carries a jammer in DCS and flies for the other side', () => {
    for (const ac of FIGHTER_ORDER) {
      const j = jammerType(ac);
      expect(OWN_JAMMER[j], `${ac} -> ${j}`).not.toBeNull();
      expect(j === defaultAdversary(ac) || OWN_JAMMER[defaultAdversary(ac)] === null, `${ac} -> ${j}`).toBe(true);
      expect(j).not.toBe(ac);
    }
  });
  test('every jet: burn-through line, HOJ list, jam cue labels and a lock key', () => {
    for (const ac of FIGHTER_ORDER) {
      const f = jamFacts(ac, AIRCRAFT[ac].units);
      expect(f.burnThroughM).toBe(BURN_THROUGH_M[ac].value);
      expect(f.burnThrough, ac).toMatch(/^Burn-through \d/);
      if (!BURN_THROUGH_M[ac].verified) expect(f.burnThrough, ac).toMatch(/not verified/);
      expect(f.hojLine.length, ac).toBeGreaterThan(10);
      expect(f.pursuit).toMatch(/pure pursuit.*simplified/);
      for (const m of f.hoj) expect(AIRCRAFT[ac].missiles).toContain(m);
      expect(lockKeyOf(ac), ac).not.toBeNull();
    }
    expect(jamFacts('f15c', 'imperial').hoj).toEqual(['aim120b', 'aim120c', 'aim7m']);
    expect(jamFacts('j11a', 'metric').hoj).toEqual(['r27r', 'r27er']);
    expect(jamFacts('f14b', 'imperial').hoj).toEqual(['aim54a', 'aim54c', 'aim7m']);
    expect(jamFacts('jf17', 'imperial').hoj).toEqual([]);
    expect(jamFacts('jf17', 'imperial').hojLine).toMatch(/not verified/);
    expect(jamFacts('j11a', 'metric').strobe).toMatch(/not verified/);
    expect(jamFacts('f15c', 'imperial').strobe).not.toMatch(/not verified/);
    expect(jamFacts('su27', 'metric').burnThrough).toMatch(/^Burn-through 25 km: ED Su-27 manual/);
    expect(lockKeyOf('f16c')?.text).toBe('RCtrl + Up');
  });
  test('a jam lock is not a paint: the target stays off the scope until burn-through', () => {
    const sc = EXERCISE_DEFS.jam.scene('f15c', 'imperial');
    const { world, me, targetIds } = buildLabWorld('f15c', 'imperial', sc, sc.scan);
    while (!me.radar.strobes.length && world.t < 30) world.step(0.1);
    expect(me.radar.strobes.length).toBeGreaterThan(0);
    expect(world.canLock(PLAYER, targetIds[0]).ok).toBe(false);
    expect(world.lockJammer(PLAYER, targetIds[0])).toBe(true);
    world.step(1);
    expect(lastPaintOf(me, targetIds[0])).toBeNull();
    const snap = buildSnap(world, me, 'imperial', sc, targetIds, new Map(), new Set(), null);
    expect(snap.jam?.hoj).toBe(true);
    expect(snap.jam?.stt).toBe(false);
  });
  test('scene starts outside burn-through and inside strobe range', () => {
    for (const ac of FIGHTER_ORDER) {
      const sc = EXERCISE_DEFS.jam.scene(ac, AIRCRAFT[ac].units);
      const bt = BURN_THROUGH_M[ac].value;
      expect(sc.targets[0].range, ac).toBeGreaterThan(bt + 10000);
      expect(sc.targets[0].jamming).toBe(true);
    }
  });
});

// ------------------------------------------------------------------------------------------ IFF

describe('friend or foe', () => {
  const base: Snap = {
    t: 10, ac: 'f16c', units: 'imperial', mode: 'rws', ownAlt: 9000, frame: 4, revisit: 4, bars: 4, azHalfDeg: 30,
    azCenterDeg: 0, elCenterDeg: 0, cursorRange: 60000, covTop: 12000, covBottom: 6000, selectedId: null, targets: [],
  };
  const isnap = (ac: FighterId, x: Partial<IffSnap>): Snap => ({
    ...base, ac,
    iff: { friendId: 'target2', hostileId: 'target1', friendSeen: true, hostileSeen: true, friendAz: 4, hostileAz: -4, friendReply: false, replyAge: null, hostileAsked: false, stt: null, ...x },
  });
  const ev = (ac: FighterId, mem: Mem, x: Partial<IffSnap>) => EXERCISE_DEFS.iff.evaluate(isnap(ac, x), mem);

  test('interrogating jet: unknown, interrogate, lock the hostile', () => {
    const mem: Mem = { latched: [] };
    expect(ev('f16c', mem, { friendSeen: false, hostileSeen: false }).steps).toEqual([false, false, false]);
    let e = ev('f16c', mem, {});
    expect(e.steps).toEqual([true, false, false]);
    expect(e.text).toMatch(/RCtrl \+ Left/);
    e = ev('f16c', mem, { friendReply: true, replyAge: 0, hostileAsked: true });
    expect(e.steps).toEqual([true, true, false]);
    expect(e.text).toMatch(/right contact answered.*Lock the left one/);
    // Viper: the reply is gone after 2 s; the answer stays latched.
    e = ev('f16c', mem, { friendReply: false, replyAge: 3, hostileAsked: true });
    expect(e.steps[1]).toBe(true);
    expect(e.text).toMatch(/reply is gone/);
    e = ev('f16c', mem, { stt: 'hostile', hostileAsked: true });
    expect(e.done).toBe(true);
    expect(e.why).toMatch(/fire on a friend/);
  });

  test('auto-IFF jet: the friend cue by itself, then lock the other one', () => {
    const mem: Mem = { latched: [] };
    let e = ev('f15c', mem, { hostileAsked: true });
    expect(e.steps).toEqual([false, false]);
    expect(e.text).toMatch(/Circle instead of a rectangle/i);
    e = ev('f15c', mem, { friendReply: true, replyAge: 0, hostileAsked: true });
    expect(e.steps).toEqual([true, false]);
    e = ev('f15c', mem, { friendReply: true, stt: 'hostile' });
    expect(e.done).toBe(true);
  });

  test('locking the hostile before identifying the friend does not finish', () => {
    const mem: Mem = { latched: [] };
    const e = ev('f14b', mem, { stt: 'hostile' });
    expect(e.done).toBe(false);
    expect(e.tone).toBe('caution');
    expect(e.text).toMatch(/Locked before you identified/);
  });

  test('locking the friend: warning, not a failure, and explained when he was never identified', () => {
    const mem: Mem = { latched: [] };
    let e = ev('m2000c', mem, { stt: 'friend' });
    expect(e.tone).toBe('warning');
    expect(e.text).toMatch(/nothing on your scope said so/);
    expect(e.done).toBe(false);
    e = ev('m2000c', mem, { friendReply: true, replyAge: 0 });
    expect(e.steps[1]).toBe(true);
    expect(e.why).toMatch(/Earlier you locked the friend/);
    e = ev('m2000c', mem, { friendReply: true, stt: 'friend' });
    expect(e.text).toMatch(/locked on the friend: he answered/);
    expect(ev('m2000c', mem, { friendReply: true, stt: 'hostile' }).done).toBe(true);
  });

  test('every jet: auto vs interrogate steps, the key or the trainer button, the friend cue', () => {
    for (const ac of FIGHTER_ORDER) {
      const f = iffFacts(ac), spec = IFF[ac];
      const steps = EXERCISE_DEFS.iff.steps(ac, AIRCRAFT[ac].units, { elev: null, zone: null, width: null, cursor: null, expRange: null, lock: 'Enter' });
      expect(f.auto, ac).toBe(spec.mode === 'auto');
      expect(steps.length, ac).toBe(f.auto ? 2 : 3);
      expect(f.cue.startsWith(spec.friendCue), ac).toBe(true);
      expect(f.cue.includes('not verified'), ac).toBe(!spec.verified);
      expect(f.shoot, ac).toMatch(/fire on a friend/);
      expect(f.noReply, ac).toMatch(/hostile/);
      if (f.auto) {
        expect(f.how, ac).toMatch(/Automatic/);
        expect(steps[0].text.toLowerCase(), ac).toContain(spec.friendCue.toLowerCase());
      } else if (spec.key) {
        expect(f.how, ac).toContain(spec.key);
        expect(steps[1].keys, ac).toBe(spec.key);
        expect(f.chord, ac).not.toBeNull();
        if (spec.trainerKey) expect(f.how, ac).toMatch(/trainer key/);
        if (!spec.verified) expect(f.how, ac).toMatch(/not verified/);
      } else {
        expect(f.how, ac).toMatch(/designate or lock.*trainer control/);
        expect(steps[1].text, ac).toMatch(/press Interrogate/);
        expect(f.buttonTitle, ac).toMatch(/Trainer control/);
      }
      // The lab's other keys never collide with the IFF key.
      const k = labKeys(ac);
      const used = [k.elev, k.zone, k.width, k.range, k.expRange].flatMap(p => (p ? [p.a, p.b] : []));
      if (k.mode) used.push(k.mode.key);
      if (f.chord) {
        expect(used, ac).not.toContain(f.chord);
        expect(lockKeyOf(ac)?.chord, ac).not.toBe(f.chord);
      }
    }
    expect(iffFacts('fa18c').noReply).toMatch(/two/i);
    expect(iffFacts('f16c').show).toMatch(/2 s/);
    expect(iffFacts('jf17').noReply).toMatch(/red/);
    expect(iffFacts('f14b').how).toMatch(/trainer key/);
  });

  test('scene: the friend flies for the player, both inside detection, same altitude, a few degrees apart', () => {
    for (const ac of FIGHTER_ORDER) {
      const sc = EXERCISE_DEFS.iff.scene(ac, AIRCRAFT[ac].units);
      const lw = buildLabWorld(ac, AIRCRAFT[ac].units, sc, sc.scan);
      const [ho, fr] = lw.targetIds.map(id => lw.world.get(id));
      expect(fr?.side, ac).toBe(lw.me.side);
      expect(ho?.side, ac).not.toBe(lw.me.side);
      expect(sc.targets[0].alt).toBe(sc.targets[1].alt);
      const snap = buildSnap(lw.world, lw.me, 'metric', sc, lw.targetIds, new Map(), new Set(), null);
      for (const t of snap.targets) expect(t.beyond, `${ac} ${t.role}`).toBe(false);
      expect(snap.iff?.friendReply, ac).toBe(false);
    }
  });

  test('the explainer lists the IFF caveats', () => {
    for (const ac of FIGHTER_ORDER) for (const c of IFF_CAVEATS) expect(simplifiedLines(ac), ac).toContain(c);
  });
});

// ------------------------------------------------------------------------------------------ datalink

describe('datalink picture', () => {
  const base: Snap = {
    t: 10, ac: 'f16c', units: 'imperial', mode: 'rws', ownAlt: 9000, frame: 4, revisit: 4, bars: 4, azHalfDeg: 30,
    azCenterDeg: 0, elCenterDeg: 0, cursorRange: 60000, covTop: 12000, covBottom: 6000, selectedId: null, targets: [],
  };
  const trk = (x: Partial<DlTrackSnap>): DlTrackSnap => ({ targetId: 'target1', source: 'awacs', donorLabel: null, az: 42, range: 50000, correlated: false, age: 2, ...x });
  const AW = trk({});
  const DON = trk({ targetId: 'target3', source: 'donor', donorLabel: 'Wingman', az: -8, range: 90000 });
  const PP = trk({ targetId: 'target2', source: 'ppli', donorLabel: 'Wingman', az: -8, range: 40000 });
  const dsnap = (ac: FighterId, x: Partial<DlSnap>, extra: Partial<Snap> = {}): Snap => ({
    ...base, ac, ...extra, dl: { radarOn: true, tracks: [], lock: null, ...x },
  });
  const ev = (ac: FighterId, mem: Mem, x: Partial<DlSnap>, extra: Partial<Snap> = {}) => EXERCISE_DEFS.dl.evaluate(dsnap(ac, x, extra), mem);

  test('FC3: radar on, AWACS track, correlate, lock', () => {
    const mem: Mem = { latched: [] };
    let e = ev('su27', mem, { radarOn: false }, { mode: 'off' });
    expect(e.steps).toEqual([false, false, false, false]);
    expect(e.text).toMatch(/Switch it on \(I\)/);
    e = ev('su27', mem, { tracks: [AW] });
    expect(e.steps).toEqual([true, true, false, false]);
    expect(e.text).toMatch(/not on your own radar.*42° right.*slew the scan right/);
    // A lock on something off the datalink does not count.
    e = ev('su27', mem, { tracks: [trk({ correlated: true })], lock: 'other' });
    expect(e.steps).toEqual([true, true, true, false]);
    expect(e.text).toMatch(/not on the datalink/);
    e = ev('su27', mem, { tracks: [trk({ correlated: true })], lock: 'dl' });
    expect(e.done).toBe(true);
    expect(e.why).toMatch(/cannot be fired on/);
  });

  test('donor jet: AWACS track, wingman track, correlate, lock; locking the wingman warns', () => {
    const mem: Mem = { latched: [] };
    let e = ev('f16c', mem, { tracks: [AW, PP] });
    expect(e.steps).toEqual([true, false, false, false]);
    expect(e.text).toMatch(/Wait for his track/);
    e = ev('f16c', mem, { tracks: [AW, PP, DON] });
    expect(e.steps).toEqual([true, true, false, false]);
    expect(e.text).toMatch(/Wingman's track at .*beyond your radar/);
    e = ev('f16c', mem, { tracks: [AW, PP, { ...DON, correlated: true }], lock: 'ppli' });
    expect(e.tone).toBe('warning');
    expect(e.text).toMatch(/your wingman/);
    expect(e.steps[3]).toBe(false);
    e = ev('f16c', mem, { tracks: [AW, PP, { ...DON, correlated: true }], lock: 'dl' });
    expect(e.done).toBe(true);
  });

  test('steps keep their order: a correlated track alone does not skip the donor step', () => {
    expect(ev('su27', { latched: [] }, { radarOn: false }, { mode: 'off' }).steps[2]).toBe(false);
    expect(ev('f16c', { latched: [] }, { tracks: [trk({ correlated: true })] }).steps).toEqual([true, false, false, false]);
  });

  test('Hornet in RWS shows only correlated datalink tracks', () => {
    const mem: Mem = { latched: [] };
    let e = ev('fa18c', mem, { tracks: [AW, DON] }, { mode: 'rws' });
    expect(e.steps).toEqual([false, false, false, false]);
    expect(e.text).toMatch(/In RWS the Hornet shows only/);
    e = ev('fa18c', mem, { tracks: [AW, DON] }, { mode: 'tws' });
    expect(e.steps).toEqual([true, true, false, false]);
    expect(EXERCISE_DEFS.dl.scene('fa18c', 'imperial').scan.mode).toBe('tws');
  });

  test('jets without a picture: one step, own radar, and the reason', () => {
    for (const ac of ['f15c', 'm2000c'] as FighterId[]) {
      const steps = EXERCISE_DEFS.dl.steps(ac, 'imperial', { elev: null, zone: null, width: null, cursor: null, expRange: null, lock: 'Enter' });
      expect(steps.map(s => s.id), ac).toEqual(['own']);
      const tg: TargetSnap = {
        id: 'target1', role: 'bandit', callsign: 'Bandit', range: 50000, groundRange: 50000, alt: 9000, az: 5, el: 0, inGimbal: true, inAz: true,
        inBars: true, beyond: false, notched: false, detectable: true, detectRange: 70000, radial: 200, groundSpeed: 200, seenNow: false,
        lastPaint: null, firstSeenRange: null, inspected: false,
      };
      const mem: Mem = { latched: [] };
      let e = EXERCISE_DEFS.dl.evaluate({ ...base, ac, targets: [tg] }, mem);
      expect(e.done).toBe(false);
      expect(e.text).toMatch(/no (datalink display|air-to-air datalink) in DCS/);
      e = EXERCISE_DEFS.dl.evaluate({ ...base, ac, targets: [{ ...tg, seenNow: true, firstSeenRange: 50000 }] }, mem);
      expect(e.done).toBe(true);
    }
    expect(dlFacts('f15c').none).toMatch(/call AWACS on the radio/);
    expect(dlFacts('m2000c').none).toMatch(/TAF.*not verified/);
  });

  test('every jet: network name, where, symbol, donors line only with donors, coast and labels', () => {
    for (const ac of FIGHTER_ORDER) {
      const f = dlFacts(ac), d = DATALINK[ac];
      const steps = EXERCISE_DEFS.dl.steps(ac, AIRCRAFT[ac].units, { elev: null, zone: null, width: null, cursor: null, expRange: null, lock: 'Enter' });
      expect(f.has, ac).toBe(d.name !== null);
      expect(f.donors !== '', ac).toBe(d.donors.length > 0);
      expect(f.wingType !== null, ac).toBe(d.donors.length > 0);
      expect(f.fire, ac).toBe(DATALINK_CAVEATS[2]);
      if (!f.has) { expect(f.none, ac).not.toBe(''); continue; }
      expect(f.where, ac).toContain(d.name as string);
      expect(f.where, ac).toContain(d.where);
      expect(f.symbol, ac).toContain(d.symbol);
      expect(f.coast, ac).toMatch(/20 s/);
      expect(f.coast, ac).toMatch(ac === 'f16c' ? /verified/ : /simplified/);
      expect(f.awacs, ac).toContain(DATALINK_CAVEATS[0]);
      if (!d.verified) {
        expect(f.where, ac).toMatch(/not verified/);
        expect(f.source, ac).toMatch(/not verified/);
      }
      expect(steps.map(s => s.id), ac).toEqual([
        ...(f.radarOnFirst ? ['on'] : []), 'awacs', ...(d.donors.length ? ['donor'] : []), 'corr', 'lock',
      ]);
      if (f.radarOnFirst) expect(steps[0].keys, ac).toBe('I');
      if (f.wingType) expect(d.donors, ac).toContain(f.wingType);
      if (d.ppli) expect(f.ppli, ac).not.toBe(''); else expect(f.ppli, ac).toBe('');
    }
    expect(dlFacts('f14b').donors).toContain(DATALINK_CAVEATS[3]);
    expect(dlFacts('fa18c').where).toMatch(/In RWS only donor tracks/);
  });

  test('scene: AWACS behind, FC3 radar off, bandit outside the scan, wingman for the player, his bandit beyond your radar', () => {
    for (const ac of FIGHTER_ORDER) {
      const f = dlFacts(ac);
      const sc = EXERCISE_DEFS.dl.scene(ac, AIRCRAFT[ac].units);
      const lw = buildLabWorld(ac, AIRCRAFT[ac].units, sc, sc.scan);
      expect(lw.world.awacs[lw.me.side], ac).toBeDefined();
      expect(lw.me.radar.mode === 'off', ac).toBe(f.radarOnFirst);
      if (!f.has) continue;
      const snap = buildSnap(lw.world, lw.me, 'metric', sc, lw.targetIds, new Map(), new Set(), null);
      const by = (role: string) => snap.targets.find(x => x.role === role);
      expect(by('awacs')?.inAz, ac).toBe(false);
      expect(by('awacs')?.beyond, ac).toBe(false);
      if (f.wingType) {
        const wing = lw.world.get(lw.targetIds[1]);
        expect(wing?.side, ac).toBe(lw.me.side);
        expect(wing?.type, ac).toBe(f.wingType);
        expect(wing?.radar.mode, ac).toBe('tws');
        expect(by('donor')?.beyond, ac).toBe(true);
      }
    }
  });

  test('the cue prefers an uncorrelated AWACS track, never a friend', () => {
    expect(dlCue([PP, DON, AW])?.source).toBe('awacs');
    expect(dlCue([PP, DON, { ...AW, correlated: true }])?.source).toBe('donor');
    expect(dlCue([PP])).toBeNull();
  });

  test('the explainer lists the datalink caveats', () => {
    for (const ac of FIGHTER_ORDER) for (const c of DATALINK_CAVEATS) expect(simplifiedLines(ac), ac).toContain(c);
  });
});
