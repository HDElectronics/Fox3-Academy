/**
 * [OWNER: sim-sensors] Radar, RWR, launch rules and radar picture.
 * Most tests step only radar + RWR (run() below) so they do not depend on the flight / missile models.
 * Expectations are derived from data/aircraft.ts so they survive data tuning.
 */
import { describe, expect, it } from 'vitest';
import { World } from './world';
import type { Aircraft, SimEvent } from './types';
import type { AircraftId, MissileId } from '../data/types';
import { AIRCRAFT } from '../data/aircraft';
import {
  cycleDesignation, designate, detectionRange, explainDetection, frameTimeFor, guidanceSupport, lastPainted, lockTarget, radarRules,
  revisitTime, scanElevationLimits, setCursor, setRadarMode, setScan, setSnp2, snp2Eligibility, stepRadar, undesignate,
} from './radar';
import { updateRwr } from './rwr';
import { canLaunch, canLaunchSnp2, launchSnp2 } from './launch';
import { buildRadarPicture } from './picture';
import { dlzFor } from './dlz';
import { D2R, bearingTo, dirFrom, elevationTo } from './math';

const H = 1 / 60;

/** Radar + RWR only. move=false keeps every position fixed (velocities still count for aspect/notch). */
function run(w: World, seconds: number, move = true): void {
  const n = Math.round(seconds / H);
  for (let i = 0; i < n; i++) {
    w.t += H;
    if (move) for (const a of w.aircraft.values()) if (a.alive) a.pos.addScaledVector(a.vel, H);
    for (const a of w.aircraft.values()) if (a.alive) stepRadar(w, a, H);
    updateRwr(w, H);
  }
}

function jet(w: World, type: AircraftId, side: 'blue' | 'red', pos: { x: number; y: number; z: number }, heading: number, stores?: Partial<Record<MissileId, number>>): Aircraft {
  return w.spawnAircraft({ side, type, controller: 'script', pos, heading, speed: 250, stores });
}

/** A point `range` m (slant) from `from`, `azDeg` off its nose, at altitude `alt`. */
function off(from: Aircraft, range: number, azDeg: number, alt: number): { x: number; y: number; z: number } {
  const dy = alt - from.pos.y;
  const g = Math.sqrt(Math.max(0, range * range - dy * dy));
  const d = dirFrom(from.heading + azDeg * D2R);
  return { x: from.pos.x + d.x * g, y: alt, z: from.pos.z + d.z * g };
}

/** Spawn a bandit pointing straight at `from` (hot). */
function bandit(w: World, from: Aircraft, range: number, azDeg: number, alt: number, type: AircraftId = 'su27'): Aircraft {
  const p = off(from, range, azDeg, alt);
  const b = jet(w, type, from.side === 'blue' ? 'red' : 'blue', p, 0);
  b.heading = bearingTo(b.pos, from.pos);
  b.vel.copy(dirFrom(b.heading)).multiplyScalar(250);
  return b;
}

function collect(w: World): SimEvent[] {
  const ev: SimEvent[] = [];
  w.on(e => ev.push(e));
  return ev;
}

const evenBars = (type: AircraftId) => AIRCRAFT[type].radar.barOptions.find(b => b % 2 === 0) ?? AIRCRAFT[type].radar.barOptions[0];

/** Build firm TWS tracks on everything in front of `me`. */
function buildTracks(w: World, me: Aircraft, move = false): void {
  run(w, revisitTime(me.radar) * 2.3, move);
}

describe('scan pattern', () => {
  it('sweeps azCenter ± azHalf at the scan rate, steps a bar at each edge and repeats every frame', () => {
    const w = new World();
    const me = jet(w, 'f15c', 'blue', { x: 0, y: 9000, z: 0 }, 0);
    const spec = AIRCRAFT.f15c;
    setScan(w, me, { bars: evenBars('f15c') });
    const st = me.radar;
    expect(st.frameTime).toBeCloseTo(frameTimeFor(spec, st.azHalf, st.bars), 9);
    expect(st.frameTime).toBeCloseTo((st.bars * 2 * st.azHalf) / (spec.radar.scanRateDegPerS * D2R), 9);
    const start = { az: st.beamAz, bar: st.bar, dir: st.sweepDir };
    const seenBars = new Set<number>();
    let minAz = Infinity, maxAz = -Infinity;
    const ticks = Math.round(st.frameTime / H);
    for (let i = 0; i < ticks; i++) {
      w.t += H;
      stepRadar(w, me, H);
      seenBars.add(st.bar);
      minAz = Math.min(minAz, st.beamAz); maxAz = Math.max(maxAz, st.beamAz);
      expect(st.beamEl).toBeCloseTo(st.elCenter + (st.bar - (st.bars - 1) / 2) * spec.radar.barSpacingDeg * D2R, 9);
    }
    const step = spec.radar.scanRateDegPerS * D2R * H;
    expect(seenBars.size).toBe(st.bars);
    expect(minAz).toBeGreaterThanOrEqual(st.azCenter - st.azHalf - 1e-9);
    expect(maxAz).toBeLessThanOrEqual(st.azCenter + st.azHalf + 1e-9);
    expect(st.bar).toBe(start.bar);
    expect(st.sweepDir).toBe(start.dir);
    expect(Math.abs(st.beamAz - start.az)).toBeLessThanOrEqual(step + 1e-9);
  });

  it('FC3 Russian scan centre has three positions; Western centres are continuous', () => {
    const w = new World();
    const su = jet(w, 'su27', 'red', { x: 0, y: 9000, z: 0 }, 0);
    setScan(w, su, { azCenter: 22 * D2R });
    expect(su.radar.azCenter).toBeCloseTo(30 * D2R, 9);
    setScan(w, su, { azCenter: -8 * D2R });
    expect(su.radar.azCenter).toBeCloseTo(0, 9);
    const f = jet(w, 'f15c', 'blue', { x: 5000, y: 9000, z: 0 }, 0);
    setScan(w, f, { azHalf: 30 * D2R, azCenter: 22 * D2R });
    expect(f.radar.azCenter).toBeCloseTo(22 * D2R, 9);
  });

  it('enforces TWS scan limits on entry and in setScan', () => {
    const w = new World();
    const me = jet(w, 'f15c', 'blue', { x: 0, y: 9000, z: 0 }, 0);
    const tws = AIRCRAFT.f15c.radar.tws;
    expect(tws).not.toBeNull();
    expect(setRadarMode(w, me, 'tws')).toBe(true);
    setScan(w, me, { azHalf: 90 * D2R, bars: Math.max(...AIRCRAFT.f15c.radar.barOptions) });
    if (tws?.maxAzHalfWidthDeg != null) expect(me.radar.azHalf).toBeLessThanOrEqual(tws.maxAzHalfWidthDeg * D2R + 1e-9);
    if (tws?.maxBars != null) expect(me.radar.bars).toBeLessThanOrEqual(tws.maxBars);
    if (tws?.maxFrameTimeS != null) expect(me.radar.frameTime).toBeLessThanOrEqual(tws.maxFrameTimeS + 1e-9);
    // M-2000C has no TWS.
    const m = jet(w, 'm2000c', 'blue', { x: 5000, y: 9000, z: 0 }, 0);
    expect(setRadarMode(w, m, 'tws')).toBe(AIRCRAFT.m2000c.radar.modes.includes('tws') && !!AIRCRAFT.m2000c.radar.tws);
  });
});

describe('detection', () => {
  it('only detects targets inside the scan azimuth and bars', () => {
    const w = new World();
    const me = jet(w, 'f15c', 'blue', { x: 0, y: 9000, z: 0 }, 0);
    const spec = AIRCRAFT.f15c;
    setScan(w, me, { azHalf: Math.min(...spec.radar.azHalfWidthOptionsDeg) * D2R, bars: evenBars('f15c'), elCenter: 0 });
    const lim = scanElevationLimits(spec, me.radar);
    const inside = bandit(w, me, 30000, 0, 9000);
    const aboveEl = lim.top + 5 * D2R;
    const above = bandit(w, me, 30000, 0, 9000 + 30000 * Math.sin(aboveEl));
    const wide = bandit(w, me, 30000, me.radar.azHalf / D2R + 10, 9000);
    expect(elevationTo(me.pos, above.pos)).toBeGreaterThan(lim.top);
    run(w, revisitTime(me.radar) * 1.5, false);
    const seen = new Set(me.radar.bricks.map(b => b.targetId));
    expect(seen.has(inside.id)).toBe(true);
    expect(seen.has(above.id)).toBe(false);
    expect(seen.has(wide.id)).toBe(false);
    expect(lastPainted(me, above.id)).toBeNull();
    expect(lastPainted(me, inside.id)).not.toBeNull();
    const why = explainDetection(w, me, above);
    expect(why.inBars).toBe(false);
    expect(why.reasons.join(' ')).toMatch(/bars/i);
    expect(explainDetection(w, me, wide).inAzimuth).toBe(false);
    // distances in the reasons follow the units option (default km)
    const far = bandit(w, me, 400000, 0, 9000);
    expect(explainDetection(w, me, far).reasons.join(' ')).toMatch(/\d+ km/);
    expect(explainDetection(w, me, far, { units: 'imperial' }).reasons.join(' ')).toMatch(/216 nm/);
    // cursor-only setter: clamps to the gimbal and range scales, leaves the scan alone
    const scan = { az: me.radar.azHalf, bars: me.radar.bars, c: me.radar.azCenter };
    setCursor(w, me, { az: 3, range: 1e9 });
    expect(me.radar.cursor.az).toBeCloseTo(spec.radar.gimbalAzDeg * D2R, 6);
    expect(me.radar.cursor.range).toBe(Math.max(...spec.radar.rangeScalesKm) * 1000);
    expect({ az: me.radar.azHalf, bars: me.radar.bars, c: me.radar.azCenter }).toEqual(scan);
    // Bricks are measurements: close to the truth, not equal to it.
    const b = me.radar.bricks.find(x => x.targetId === inside.id);
    expect(b && b.pos.distanceTo(inside.pos)).toBeLessThan(300);
  });

  it('a beaming target in look-down hides in the notch; the same target hot is seen', () => {
    for (const beaming of [true, false]) {
      const w = new World();
      const me = jet(w, 'f15c', 'blue', { x: 0, y: 9000, z: 0 }, 0);
      const tgt = bandit(w, me, 30000, 0, 3000);
      if (beaming) { tgt.heading = Math.PI / 2; tgt.vel.copy(dirFrom(tgt.heading)).multiplyScalar(250); }
      setScan(w, me, { elCenter: elevationTo(me.pos, tgt.pos), bars: evenBars('f15c') });
      run(w, revisitTime(me.radar) * 2, false);
      const seen = me.radar.bricks.some(b => b.targetId === tgt.id);
      const why = explainDetection(w, me, tgt);
      expect(why.lookDown).toBe(true);
      expect(why.inBars && why.inAzimuth).toBe(true);
      expect(why.notched).toBe(beaming);
      expect(seen).toBe(!beaming);
      // The RWR still hears the radar: the notch hides you from the radar, not from your RWR.
      expect(tgt.rwr.some(c => c.emitterId === me.id && c.state === 'search')).toBe(true);
    }
  });
});

describe('TWS track files', () => {
  it('builds a firm track after two looks and drops it after losing it', () => {
    const w = new World();
    const ev = collect(w);
    const me = jet(w, 'f15c', 'blue', { x: 0, y: 9000, z: 0 }, 0);
    setRadarMode(w, me, 'tws');
    const tgt = bandit(w, me, 40000, 0, 9000);
    run(w, revisitTime(me.radar) * 1.1);
    const t1 = me.radar.tracks.find(t => t.targetId === tgt.id);
    expect(t1?.label).toBe('T1');
    expect(ev.some(e => e.type === 'track' && e.what === 'new' && e.targetId === tgt.id)).toBe(true);
    run(w, revisitTime(me.radar) * 1.2);
    const trk = me.radar.tracks.find(t => t.targetId === tgt.id);
    expect(trk?.firm).toBe(true);
    expect(trk?.coasting).toBe(false);
    expect(ev.some(e => e.type === 'track' && e.what === 'firm' && e.targetId === tgt.id)).toBe(true);
    // Velocity estimate from two looks: close to truth.
    expect(trk && trk.vel.distanceTo(tgt.vel)).toBeLessThan(40);
    // Target vanishes (far beyond detection range): coast after the missed look, then drop.
    tgt.pos.set(0, 9000, -900000);
    const lostAt = trk ? trk.lastHit : w.t;
    run(w, revisitTime(me.radar) * 1.3 + 0.6, false);
    expect(me.radar.tracks.find(t => t.targetId === tgt.id)?.coasting).toBe(true);
    const dropAfter = Math.max(3 * me.radar.frameTime, 2 * revisitTime(me.radar), 6);
    expect(dropAfter).toBeGreaterThanOrEqual(6);
    run(w, Math.max(0, lostAt + dropAfter - w.t - 0.5), false);
    expect(me.radar.tracks.some(t => t.targetId === tgt.id)).toBe(true);
    run(w, 1.5, false);
    expect(me.radar.tracks.some(t => t.targetId === tgt.id)).toBe(false);
    expect(ev.some(e => e.type === 'track' && e.what === 'dropped' && e.targetId === tgt.id)).toBe(true);
  });
});

describe('designation', () => {
  function twoBandits(type: AircraftId) {
    const w = new World();
    const me = jet(w, type, 'blue', { x: 0, y: 9000, z: 0 }, 0);
    me.selectedWeapon = null; // no FC3 auto-lock while we test designation
    setRadarMode(w, me, 'tws');
    setScan(w, me, { autoCenter: false });
    const a = bandit(w, me, 40000, -8, 9000);
    const b = bandit(w, me, 40000, 8, 9000);
    buildTracks(w, me);
    expect(me.radar.tracks.filter(t => t.firm).length).toBe(2);
    return { w, me, a, b };
  }

  it('F-15C keeps several designations in order; Enter again on one gives STT and drops the others', () => {
    const { w, me, a, b } = twoBandits('f15c');
    expect(radarRules('f15c').designationCap).toBeGreaterThanOrEqual(2);
    designate(w, me, a.id);
    designate(w, me, b.id);
    expect(me.radar.designated).toEqual([a.id, b.id]);
    const pic = buildRadarPicture(w, me.id);
    expect(pic?.tracks.find(t => t.targetId === a.id)?.designation).toBe('primary');
    expect(pic?.tracks.find(t => t.targetId === b.id)?.designation).toBe('secondary');
    undesignate(w, me, a.id);
    expect(me.radar.designated).toEqual([b.id]);
    designate(w, me, a.id);
    expect(me.radar.designated).toEqual([b.id, a.id]);
    designate(w, me, a.id);
    expect(me.radar.mode).toBe('stt');
    expect(me.radar.stt.targetId).toBe(a.id);
    expect(me.radar.tracks.map(t => t.targetId)).toEqual([a.id]);
  });

  it('Su-27 has one designation: a new one replaces it; Enter again forces STT', () => {
    const { w, me, a, b } = twoBandits('su27');
    expect(radarRules('su27').designationCap).toBe(1);
    designate(w, me, a.id);
    expect(me.radar.designated).toEqual([a.id]);
    designate(w, me, b.id);
    expect(me.radar.designated).toEqual([b.id]);
    designate(w, me, b.id);
    expect(me.radar.mode).toBe('stt');
    expect(me.radar.stt.targetId).toBe(b.id);
  });

  it('unlock from STT: F-15C keeps the target designated in TWS, Su-27 clears its track', () => {
    for (const type of ['f15c', 'su27'] as AircraftId[]) {
      const { w, me, a } = twoBandits(type);
      designate(w, me, a.id);
      expect(lockTarget(w, me, a.id)).toBe(true);
      run(w, 0.5, false);
      w.unlock(me.id);
      expect(me.radar.mode).toBe('tws');
      const keeps = radarRules(type).unlockKeepsDesignation;
      expect(keeps).toBe(type === 'f15c');
      expect(me.radar.designated).toEqual(keeps ? [a.id] : []);
      expect(me.radar.tracks.some(t => t.targetId === a.id)).toBe(keeps);
    }
  });

  it('Hornet: L&S is automatic (closest), designating DT2 again swaps, L&S again locks', () => {
    const w = new World();
    const me = jet(w, 'fa18c', 'blue', { x: 0, y: 9000, z: 0 }, 0);
    me.selectedWeapon = null;
    setRadarMode(w, me, 'tws');
    setScan(w, me, { autoCenter: false });
    const near = bandit(w, me, 30000, -6, 9000);
    const far = bandit(w, me, 40000, 6, 9000);
    buildTracks(w, me);
    expect(me.radar.designated).toEqual([near.id]);
    designate(w, me, far.id);
    expect(me.radar.designated).toEqual([near.id, far.id]);
    designate(w, me, far.id);
    expect(me.radar.designated).toEqual([far.id, near.id]);
    cycleDesignation(w, me);
    expect(me.radar.designated).toEqual([near.id, far.id]);
    designate(w, me, near.id);
    expect(me.radar.mode).toBe('stt');
  });

  it('F-16: bugging a track forces the ±25° 3-bar bug scan, restored when the bug goes', () => {
    const w = new World();
    const me = jet(w, 'f16c', 'blue', { x: 0, y: 9000, z: 0 }, 0);
    me.selectedWeapon = null;
    setRadarMode(w, me, 'tws');
    const before = { az: me.radar.azHalf, bars: me.radar.bars };
    const tgt = bandit(w, me, 30000, 0, 9000);
    buildTracks(w, me);
    designate(w, me, tgt.id);
    run(w, 0.1, false);
    const bug = radarRules('f16c').bugScan;
    expect(bug).not.toBeNull();
    expect(me.radar.azHalf).toBeCloseTo((bug?.azHalfDeg ?? 0) * D2R, 6);
    expect(me.radar.bars).toBe(bug?.bars);
    undesignate(w, me, tgt.id);
    run(w, 0.1, false);
    expect(me.radar.azHalf).toBeCloseTo(before.az, 6);
    expect(me.radar.bars).toBe(before.bars);
  });

  it('FC3 Russian TWS auto-locks the designated target at autoSttAtRmaxFraction × Rmax', () => {
    const frac = AIRCRAFT.su27.radar.tws?.autoSttAtRmaxFraction;
    expect(frac).not.toBeNull();
    const w = new World();
    const me = jet(w, 'su27', 'blue', { x: 0, y: 9000, z: 0 }, 0, { r27er: 2 });
    me.selectedWeapon = null;
    setRadarMode(w, me, 'tws');
    const tgt = bandit(w, me, 20000, 0, 9000);
    const rmax = dlzFor(me.pos, me.vel, tgt.pos, tgt.vel, 'r27er').rmax;
    tgt.pos.copy(me.pos).add(dirFrom(0).multiplyScalar(Math.min(0.55 * (frac ?? 0.85) * rmax, 0.6 * AIRCRAFT.su27.radar.detectKm.headOn * 1000)));
    buildTracks(w, me);
    designate(w, me, tgt.id);
    expect(me.radar.mode).toBe('tws');
    me.selectedWeapon = 'r27er';
    run(w, 0.6, false);
    expect(me.radar.mode).toBe('stt');
    expect(me.radar.stt.targetId).toBe(tgt.id);
  });
});

describe('STT', () => {
  it('breaks in the notch after its memory and falls back to TWS with the target designated', () => {
    const w = new World();
    const ev = collect(w);
    const me = jet(w, 'f15c', 'blue', { x: 0, y: 9000, z: 0 }, 0);
    setRadarMode(w, me, 'tws');
    const tgt = bandit(w, me, 25000, 0, 3000);
    expect(lockTarget(w, me, tgt.id)).toBe(true);
    expect(ev.some(e => e.type === 'lock' && e.what === 'locked')).toBe(true);
    run(w, 1, false);
    expect(me.radar.stt.lostFor).toBe(0);
    // Target beams (look-down): notched.
    tgt.heading = Math.PI / 2;
    tgt.vel.copy(dirFrom(tgt.heading)).multiplyScalar(250);
    const mem = radarRules('f15c').sttMemoryS;
    run(w, mem - 0.4, false);
    expect(me.radar.mode).toBe('stt');
    expect(me.radar.stt.lostFor).toBeGreaterThan(0);
    expect(guidanceSupport(w, me, tgt.id).illuminating).toBe(false);
    run(w, 0.8, false);
    expect(me.radar.mode).toBe('tws');
    expect(me.radar.stt.targetId).toBeNull();
    const brk = ev.find(e => e.type === 'lock' && e.what === 'broken');
    expect(brk && brk.type === 'lock' ? brk.why : '').toMatch(/notch/);
    expect(me.radar.designated).toEqual([tgt.id]);
  });

  it('cannot lock a notched target; ACM auto-locks the nearest target on the nose', () => {
    const w = new World();
    const me = jet(w, 'f15c', 'blue', { x: 0, y: 9000, z: 0 }, 0);
    const tgt = bandit(w, me, 20000, 0, 3000);
    tgt.heading = Math.PI / 2;
    tgt.vel.copy(dirFrom(tgt.heading)).multiplyScalar(250);
    expect(lockTarget(w, me, tgt.id)).toBe(false);

    const w2 = new World();
    const f = jet(w2, 'f15c', 'blue', { x: 0, y: 9000, z: 0 }, 0);
    const far = bandit(w2, f, 30000, 0, 9000);
    const near = bandit(w2, f, 8000, 1, 9000);
    expect(setRadarMode(w2, f, 'acm')).toBe(true);
    run(w2, 0.1, false);
    expect(f.radar.mode).toBe('stt');
    expect(f.radar.stt.targetId).toBe(near.id);
    expect(far.id).not.toBe(near.id);
  });
});

describe('RWR', () => {
  it('shows search for RWS/TWS painting and lock for STT; a TWS Fox 3 gives no warning', () => {
    const w = new World();
    const ev = collect(w);
    const me = jet(w, 'f15c', 'blue', { x: 0, y: 9000, z: 0 }, 0, { aim120c: 4, aim7m: 2 });
    setRadarMode(w, me, 'tws');
    const su = bandit(w, me, 20000, 0, 9000);
    buildTracks(w, me, false);
    const mine = () => su.rwr.find(c => c.emitterId === me.id);
    expect(mine()?.state).toBe('search');
    expect(mine()?.bearing ?? 1).toBeCloseTo(0, 1);
    // The Su-27 radar (RWS) paints us too: RWS and TWS look the same.
    expect(me.rwr.find(c => c.emitterId === su.id)?.state).toBe('search');

    // TWS AIM-120: still only search.
    designate(w, me, su.id);
    me.selectedWeapon = 'aim120c';
    const chk = canLaunch(w, me);
    expect(chk.ok).toBe(true);
    const m = w.launch(me.id);
    expect('kind' in m).toBe(true);
    run(w, 0.5, false);
    expect(mine()?.state).toBe('search');

    // STT: lock.
    expect(lockTarget(w, me, su.id)).toBe(true);
    run(w, 0.2, false);
    expect(mine()?.state).toBe('lock');
    expect(su.rwr[0].emitterId).toBe(me.id);
    expect(ev.some(e => e.type === 'rwr' && e.ownerId === su.id && e.emitterId === me.id && e.state === 'lock')).toBe(true);

    // SARH launch from STT: launch warning while guided.
    me.selectedWeapon = 'aim7m';
    const s = w.launch(me.id);
    expect('kind' in s).toBe(true);
    run(w, 0.1, false);
    expect(mine()?.state).toBe('launch');
    expect(mine()?.missileType).toBe('aim7m');

    // Unlock: back to TWS, the SARH missile is no longer guided, search again.
    w.unlock(me.id);
    run(w, 0.2, false);
    expect(me.radar.mode).toBe('tws');
    expect(mine()?.state).toBe('search');
  });

  it('shows an active ARH seeker as a missile contact from the missile bearing', () => {
    const w = new World();
    const me = jet(w, 'f15c', 'blue', { x: 0, y: 9000, z: 0 }, 0, { aim120c: 2 });
    setRadarMode(w, me, 'tws');
    const su = bandit(w, me, 20000, 0, 9000);
    buildTracks(w, me, false);
    designate(w, me, su.id);
    me.selectedWeapon = 'aim120c';
    const m = w.launch(me.id);
    if (!('kind' in m)) throw new Error(m.reason);
    m.pos.copy(su.pos).add(dirFrom(Math.PI / 2).multiplyScalar(5000)); // 5 km off the Su-27's right... in world east
    m.guidance = 'active';
    m.seekerOn = su.id;
    run(w, 0.05, false);
    const c = su.rwr[0];
    expect(c.state).toBe('missile');
    expect(c.emitterId).toBe(m.id);
    expect(c.emitterType).toBe('missile');
  });
});

describe('launch rules', () => {
  function setup(type: AircraftId, stores: Partial<Record<MissileId, number>>, range = 20000) {
    const w = new World();
    const me = jet(w, type, 'blue', { x: 0, y: 9000, z: 0 }, 0, stores);
    me.selectedWeapon = null;
    setRadarMode(w, me, 'tws');
    const tgt = bandit(w, me, range, 0, 9000);
    buildTracks(w, me);
    designate(w, me, tgt.id);
    expect(me.radar.mode).toBe('tws');
    return { w, me, tgt };
  }

  it('F-15C: AIM-120 from TWS on a designated firm track; AIM-7 needs STT', () => {
    const { w, me, tgt } = setup('f15c', { aim120c: 4, aim7m: 2 });
    const a = canLaunch(w, me, undefined, 'aim120c');
    expect(a.reason).toBe('');
    expect(a.ok).toBe(true);
    expect(a.targetId).toBe(tgt.id);
    expect(a.dlz).not.toBeNull();
    const s = canLaunch(w, me, undefined, 'aim7m');
    expect(s.ok).toBe(false);
    expect(s.reason).toMatch(/STT/);
    // only the lock is missing: the zone still comes from the firm track, and the picture shows it with no cue
    expect(s.dlz).not.toBeNull();
    expect(s.range).toBeGreaterThan(0);
    me.selectedWeapon = 'aim7m';
    const pic = buildRadarPicture(w, me.id);
    expect(pic?.dlz).not.toBeNull();
    expect(pic?.shootCue).toBe(false);
    expect(pic?.launchBlockedReason).toMatch(/STT/);
    expect(lockTarget(w, me, tgt.id)).toBe(true);
    expect(canLaunch(w, me, undefined, 'aim7m').ok).toBe(true);
  });

  it('Su-27: R-27ER refused in TWS, allowed in STT inside ПР range', () => {
    const { w, me, tgt } = setup('su27', { r27er: 4 });
    const c = canLaunch(w, me, undefined, 'r27er');
    expect(c.ok).toBe(false);
    expect(c.reason).toMatch(/STT/);
    expect(c.dlz?.rmax).toBeGreaterThan(0); // СНП before the auto-lock still shows the zone
    expect(lockTarget(w, me, tgt.id)).toBe(true);
    const d = canLaunch(w, me, undefined, 'r27er');
    expect(d.reason).toBe('');
    expect(d.ok).toBe(true);
  });

  it('J-11A fires the R-77 from STT only; RWS without a lock is refused; out of range is refused', () => {
    const { w, me, tgt } = setup('j11a', { r77: 2 });
    expect(canLaunch(w, me, undefined, 'r77').reason).toMatch(/STT/);
    expect(guidanceSupport(w, me, tgt.id).datalink).toBe(false);

    const w2 = new World();
    const f = jet(w2, 'f15c', 'blue', { x: 0, y: 9000, z: 0 }, 0, { aim120c: 2, aim7m: 2 });
    const far = bandit(w2, f, 60000, 0, 9000);
    run(w2, 0.1, false);
    const r = canLaunch(w2, f, undefined, 'aim120c');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/lock|designate/i);
    if (lockTarget(w2, f, far.id)) {
      const rmax = dlzFor(f.pos, f.vel, far.pos, far.vel, 'aim7m').rmax;
      const o = canLaunch(w2, f, undefined, 'aim7m');
      if (60000 > rmax) { expect(o.ok).toBe(false); expect(o.reason).toMatch(/range/i); }
    }
  });
});

describe('guidance support', () => {
  it('TWS datalinks designated firm tracks; STT on another target drops that support', () => {
    const w = new World();
    const me = jet(w, 'f15c', 'blue', { x: 0, y: 9000, z: 0 }, 0, { aim120c: 4 });
    me.selectedWeapon = null;
    setRadarMode(w, me, 'tws');
    setScan(w, me, { autoCenter: false });
    const a = bandit(w, me, 25000, -8, 9000);
    const b = bandit(w, me, 25000, 8, 9000);
    buildTracks(w, me);
    designate(w, me, a.id);
    designate(w, me, b.id);
    me.selectedWeapon = 'aim120c';
    const m = w.launch(me.id);
    if (!('kind' in m)) throw new Error(m.reason);
    expect(m.targetId).toBe(a.id); // ripple starts at the PDT
    const ga = guidanceSupport(w, me, a.id);
    expect(ga.datalink).toBe(true);
    expect(ga.illuminating).toBe(false);
    expect(ga.estimate && ga.estimate.pos.distanceTo(a.pos)).toBeLessThan(500);
    const next = canLaunch(w, me);
    expect(next.targetId).toBe(b.id); // then the SDT
    designate(w, me, b.id); // Enter again on the SDT: STT on B
    expect(me.radar.mode).toBe('stt');
    expect(guidanceSupport(w, me, a.id).datalink).toBe(false);
    const gb = guidanceSupport(w, me, b.id);
    expect(gb.datalink && gb.illuminating).toBe(true);
  });
});

describe('radar picture', () => {
  it('shows only radar-known data with the jet labels', () => {
    const w = new World();
    const me = jet(w, 'f15c', 'blue', { x: 0, y: 9000, z: 0 }, 0, { aim120c: 2 });
    me.selectedWeapon = null;
    const su = jet(w, 'su27', 'red', { x: 0, y: 9000, z: -30000 }, Math.PI);
    run(w, revisitTime(su.radar) * 1.5, false);
    const rp = buildRadarPicture(w, su.id);
    expect(rp?.modeLabel).toBe(AIRCRAFT.su27.radar.modeLabels.rws ?? 'RWS');
    expect(rp?.cueLabel).toBe('ПР');
    expect(rp?.bricks.some(b => b.targetId === me.id)).toBe(true);
    expect(rp?.tracks.length).toBe(0);
    const top = rp ? rp.altCoverage.top : 0, bottom = rp ? rp.altCoverage.bottom : 0;
    expect(top).toBeGreaterThan(bottom);

    setRadarMode(w, me, 'tws');
    buildTracks(w, me, true); // moving, so the two-look velocity estimate is real
    designate(w, me, su.id);
    me.selectedWeapon = 'aim120c';
    const p = buildRadarPicture(w, me.id);
    expect(p?.modeLabel).toBe(AIRCRAFT.f15c.radar.modeLabels.tws);
    const t = p?.tracks[0];
    expect(t?.label).toBe('T1');
    expect(t?.designation).toBe('primary');
    expect(t?.friendly).toBe(false);
    expect(Math.abs(t?.aspectDeg ?? 99)).toBeLessThan(15);
    expect(p?.dlz?.targetRange ?? 0).toBeGreaterThan(25000);
    expect(p?.weapon?.id).toBe('aim120c');
    expect(p?.shootCue).toBe(canLaunch(w, me).ok);
    const m = w.launch(me.id);
    if (!('kind' in m)) throw new Error(m.reason);
    const p2 = buildRadarPicture(w, me.id);
    expect(p2?.missilesInFlight[0].label).toBe('M1');
    expect(p2?.missilesInFlight[0].targetLabel).toBe('T1');
    expect(p2?.tracks[0].missiles.length).toBe(1);
  });
});

describe('integration with World.step', () => {
  it('RWS sees a head-on bandit within a frame and the bandit RWR hears it', () => {
    const w = new World();
    const me = w.spawnAircraft({ side: 'blue', type: 'f15c', controller: 'script', pos: { x: 0, y: 9000, z: 0 }, heading: 0, speed: 250 });
    const su = w.spawnAircraft({ side: 'red', type: 'su27', controller: 'script', pos: { x: 0, y: 9000, z: -40000 }, heading: Math.PI, speed: 250 });
    for (let i = 0, n = Math.round((revisitTime(me.radar) + 0.5) / H); i < n; i++) w.step(H);
    expect(me.radar.bricks.some(b => b.targetId === su.id)).toBe(true);
    expect(su.rwr.some(c => c.emitterId === me.id)).toBe(true);
  });
});


describe('P1 sourced radar corrections', () => {
  it('N-001 preserves the head-on look-down endpoint and reduces only the tail endpoint', () => {
    const w = new World();
    const me = jet(w, 'su27', 'blue', { x: 0, y: 9000, z: 0 }, 0);
    const target = bandit(w, me, 40000, 0, 7000, 'f15c');
    target.vel.copy(me.pos).sub(target.pos).normalize().multiplyScalar(250);
    expect(detectionRange(w, me, target)).toBeCloseTo(68400, 5);
    target.vel.negate();
    expect(detectionRange(w, me, target)).toBeCloseTo(26600, 5);
    target.pos.y = 11000;
    target.vel.copy(target.pos).sub(me.pos).normalize().multiplyScalar(250);
    expect(detectionRange(w, me, target)).toBeCloseTo(38000, 5);
  });

  it('N-019M scales from its own 3 m² reference rather than the 5 m² default', () => {
    const w = new World();
    const me = jet(w, 'mig29s', 'blue', { x: 0, y: 9000, z: 0 }, 0);
    const target = bandit(w, me, 40000, 0, 9000, 'f15c');
    expect(detectionRange(w, me, target)).toBeCloseTo(60000 * Math.pow(5 / 3, 0.25), 5);
  });

  for (const type of ['fa18c', 'f14b', 'jf17'] as const) {
    it(`${type} rejects unlisted TWS patterns on entry, scan changes and STT return`, () => {
      const w = new World();
      const me = jet(w, type, 'blue', { x: 0, y: 9000, z: 0 }, 0);
      const r = AIRCRAFT[type].radar;
      const valid = () => expect(r.twsPatterns!.some(([az, bars]) => Math.abs(me.radar.azHalf / D2R - az) < 1e-8 && me.radar.bars === bars)).toBe(true);
      setScan(w, me, { bars: 1 });
      setRadarMode(w, me, 'tws'); valid();
      if (type === 'f14b') { expect(me.radar.bars).toBe(4); expect(me.radar.azHalf / D2R).toBeCloseTo(20); }
      for (const az of r.azHalfWidthOptionsDeg) for (const bars of r.barOptions) {
        setScan(w, me, { azHalf: az * D2R, bars }); valid();
      }
      const target = bandit(w, me, 20000, 0, 9000);
      expect(lockTarget(w, me, target.id)).toBe(true);
      setScan(w, me, { bars: 1, azHalf: 10 * D2R });
      setRadarMode(w, me, 'tws'); valid();
    });
  }
});

describe('shared MiG-29S СНП2', () => {
  function scene() {
    const w = new World();
    const me = jet(w, 'mig29s', 'blue', { x: 0, y: 9000, z: 0 }, 0, { r77: 4 });
    const lead = bandit(w, me, 16000, 0, 9000, 'f15c');
    const second = bandit(w, me, 16000, 4, 9000, 'f15c');
    me.selectedWeapon = 'r77';
    setSnp2(w, me, true);
    buildTracks(w, me);
    designate(w, me, lead.id);
    stepRadar(w, me, H);
    return { w, me, lead, second };
  }

  it('selects Ц2 automatically and launches two R-77s with shared datalink support', () => {
    const { w, me, lead, second } = scene();
    expect(me.radar.designated).toEqual([lead.id, second.id]);
    expect(canLaunchSnp2(w, me).ok).toBe(true);
    const missiles = launchSnp2(w, me);
    expect(missiles.map(m => m.targetId)).toEqual([lead.id, second.id]);
    expect(me.stores.r77).toBe(2);
    expect(me.radar.mode).toBe('tws');
    for (const target of [lead, second]) expect(guidanceSupport(w, me, target.id).datalink).toBe(true);
    me.radar.tracks.find(t => t.targetId === second.id)!.coasting = true;
    expect(canLaunchSnp2(w, me).ok).toBe(false);
    expect(guidanceSupport(w, me, second.id).datalink).toBe(true);
  });

  it('accepts 3 g but rejects over 3 g, ECM, and more than 8° separation for launch and support', () => {
    const { w, me, second } = scene();
    second.g = 3;
    expect(canLaunchSnp2(w, me).ok).toBe(true);
    second.g = 3.01;
    expect(canLaunchSnp2(w, me).reason).toMatch(/3 g/);
    expect(guidanceSupport(w, me, second.id).datalink).toBe(false);
    second.g = 1; second.jamming = true;
    expect(canLaunchSnp2(w, me).reason).toMatch(/jamming/);
    second.jamming = false;
    me.radar.tracks.find(t => t.targetId === second.id)!.pos.copy(me.pos).addScaledVector(dirFrom(9 * D2R), 16000);
    expect(snp2Eligibility(w, me).reason).toMatch(/8°/);
    expect(launchSnp2(w, me)).toEqual([]);
    expect(me.stores.r77).toBe(4);
    second.jamming = true;
    stepRadar(w, me, H);
    expect(me.radar.snp2).toBe(false);
    expect(me.radar.designated.length).toBe(1);
  });

  it('requires two rounds and cannot grant ordinary СНП or another jet a TWS R-77 launch', () => {
    const { w, me, lead } = scene();
    me.stores.r77 = 1;
    expect(canLaunchSnp2(w, me).reason).toMatch(/two R-77/);
    expect(launchSnp2(w, me)).toEqual([]);
    setSnp2(w, me, false);
    expect(canLaunch(w, me, lead.id).ok).toBe(false);
    const other = jet(w, 'j11a', 'blue', { x: 0, y: 9000, z: 0 }, 0);
    expect(setSnp2(w, other, true)).toBe(false);
  });
});
