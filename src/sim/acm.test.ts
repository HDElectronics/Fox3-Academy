/**
 * Close-range acquisition and the IR seeker (issue #11): every jet's ACM areas and lock rules, the growl / tone
 * state machine, and the off-boresight launch limit. Gameplay rules only.
 */
import { describe, expect, it } from 'vitest';
import { World } from './world';
import type { Aircraft } from './types';
import { ACM, type AcmArea } from '../data/acm';
import { GUN_JET_IDS } from '../data/wvr';
import { AIRCRAFT } from '../data/aircraft';
import { MISSILES } from '../data/missiles';
import { D2R } from './math';
import {
  acmAngles, acmPressLock, fireIr, inArea, irShotCheck, newAcmState, setAcmMode, stepAcm, toggleUncage, type AcmState,
} from './acm';

const ALT = 4600;

/** You fly north, wings level; the bandit sits at (az, el) deg off your nose at `range` m, flying north too. */
function setup(type: string, az: number, el: number, range: number, banditHeading = 0) {
  const w = new World(3);
  w.record = false;
  const me = w.spawnAircraft({ side: 'blue', type: type as 'f15c', controller: 'script', pos: { x: 0, y: ALT, z: 0 }, heading: 0, speed: 230 });
  const a = az * D2R, e = el * D2R;
  const b = w.spawnAircraft({
    side: 'red', type: type === 'su27' ? 'f15c' : 'su27', controller: 'script',
    pos: { x: range * Math.sin(a) * Math.cos(e), y: ALT + range * Math.sin(e), z: -range * Math.cos(a) * Math.cos(e) }, heading: banditHeading, speed: 200,
  });
  const st = newAcmState(type)!;
  return { w, me, b, st };
}

function run(w: World, me: Aircraft, st: AcmState, seconds: number, each?: () => void): void {
  for (let t = 0; t < seconds - 1e-9; t += 0.05) { each?.(); stepAcm(w, me, st, 0.05); }
}

function centre(area: AcmArea): [number, number] {
  return area.kind === 'cone' ? [area.az, area.el] : [(area.az[0] + area.az[1]) / 2, (area.el[0] + area.el[1]) / 2];
}

describe('ACM data', () => {
  it('every fighter has modes and an IR missile it carries', () => {
    for (const id of GUN_JET_IDS) {
      const j = ACM[id];
      expect(j.modes.length, id).toBeGreaterThan(0);
      expect(MISSILES[j.ir.missile].seeker, id).toBe('ir');
      expect(AIRCRAFT[id].loadout.some(l => l.missile === j.ir.missile), id).toBe(true);
      for (const m of j.modes) expect(m.rangeM.value >= 0 && m.lockS.value >= 0, `${id} ${m.id}`).toBe(true);
    }
  });

  it('keeps the verified FC3 and Hornet geometry', () => {
    const su = ACM.su27.modes;
    expect(su.map(m => m.id)).toEqual(['vs', 'bore', 'helmet', 'fi0']);
    expect(su[0]!.area.value).toEqual({ kind: 'box', az: [-1.5, 1.5], el: [-10, 50] });
    expect(su[1]!.area.value).toMatchObject({ kind: 'cone', radiusDeg: 1.25 });
    expect(ACM.su27.ir.launchLimitDeg).toMatchObject({ value: 45, verified: true });
    expect(ACM.fa18c.modes.find(m => m.id === 'bst')!.area.value).toMatchObject({ radiusDeg: 1.65 });
    expect(ACM.fa18c.modes.find(m => m.id === 'vacq')!.rangeM.value).toBeCloseTo(5 * 1852);
    expect(ACM.f16c.modes.find(m => m.id === 'acm60')!.area.value).toEqual({ kind: 'box', az: [-5, 5], el: [-7, 53] });
  });
});

describe('ACM acquisition', () => {
  it('angles and areas agree', () => {
    const { me, b } = setup('f15c', 10, 20, 3000);
    const a = acmAngles(me, b.pos);
    expect(a.az).toBeCloseTo(10, 3);
    expect(a.el).toBeCloseTo(20, 0);
    expect(inArea({ kind: 'box', az: [-15, 15], el: [0, 30] }, a.az, a.el)).toBe(true);
    expect(inArea({ kind: 'cone', radiusDeg: 5, az: 0, el: 0 }, a.az, a.el)).toBe(false);
  });

  for (const id of GUN_JET_IDS) {
    for (const mode of ACM[id].modes) {
      if (mode.sensor === 'seeker') continue;
      it(`${id} ${mode.name}: locks inside its area, not outside`, () => {
        const [az, el] = centre(mode.area.value);
        const r = Math.min(3000, mode.rangeM.value * 0.5);
        const s = setup(id, az, el, r);
        setAcmMode(s.w, s.me, s.st, mode.id);
        run(s.w, s.me, s.st, mode.lockS.value + 0.2);
        if (mode.lock.value === 'enter') {
          expect(s.st.lockedId).toBeNull();
          expect(acmPressLock(s.w, s.me, s.st)).toBe(true);
        }
        expect(s.st.lockedId, s.st.msg).toBe(s.b.id);
        expect(s.st.lockSensor).toBe(mode.sensor);
        // Radar modes lock through the radar (STT); IRST modes leave it off.
        expect(s.me.radar.mode).toBe(mode.sensor === 'radar' ? 'stt' : 'off');

        const o = setup(id, az + 70, el, r);
        setAcmMode(o.w, o.me, o.st, mode.id);
        run(o.w, o.me, o.st, mode.lockS.value + 0.5);
        expect(acmPressLock(o.w, o.me, o.st)).toBe(false);
        expect(o.st.lockedId).toBeNull();
      });
    }
  }

  it('does not lock beyond the mode range, and drops the lock when he leaves it', () => {
    const s = setup('fa18c', 0, 0, 11 * 1852);
    setAcmMode(s.w, s.me, s.st, 'bst');
    run(s.w, s.me, s.st, 1);
    expect(s.st.lockedId).toBeNull();
    s.b.pos.z = -4000;
    run(s.w, s.me, s.st, 1);
    expect(s.st.lockedId).toBe(s.b.id);
    s.b.pos.z = -16 * 1852;
    run(s.w, s.me, s.st, 0.1);
    expect(s.st.lockedId).toBeNull();
    expect(s.me.radar.mode).not.toBe('stt');
  });

  it('FC3 VS locks after its 1–3 s dwell (2 s), not before', () => {
    const s = setup('su27', 0, 20, 3000);
    setAcmMode(s.w, s.me, s.st, 'vs');
    run(s.w, s.me, s.st, 1.5);
    expect(s.st.lockedId).toBeNull();
    run(s.w, s.me, s.st, 0.6);
    expect(s.st.lockedId).toBe(s.b.id);
  });
});

describe('IR seeker tone', () => {
  it('FC3 Fi0: growl, then lock tone on its own; no radar, no lock', () => {
    const s = setup('su27', 0, 0, 2500);
    setAcmMode(s.w, s.me, s.st, 'fi0');
    run(s.w, s.me, s.st, 0.1);
    expect(s.st.seeker.tone).toBe('growl');
    run(s.w, s.me, s.st, 0.4);
    expect(s.st.seeker).toMatchObject({ mode: 'track', tone: 'lock', targetId: s.b.id });
    expect(s.me.radar.mode).toBe('off');
    expect(s.st.lockedId).toBeNull();
    expect(s.st.lockT).not.toBeNull();
  });

  it('Hornet AIM-9: growl until uncaged, then high tone; cage again drops it', () => {
    const s = setup('fa18c', 0, 0, 2500);
    run(s.w, s.me, s.st, 2);
    expect(s.st.seeker).toMatchObject({ mode: 'caged', tone: 'growl' });
    toggleUncage(s.st);
    run(s.w, s.me, s.st, 0.05);
    expect(s.st.seeker).toMatchObject({ mode: 'track', tone: 'lock' });
    toggleUncage(s.st);
    expect(s.st.seeker.tone).toBe('none');
  });

  it('uncaging with no heat in the seeker does nothing', () => {
    const s = setup('fa18c', 30, 0, 2500);
    toggleUncage(s.st);
    run(s.w, s.me, s.st, 0.1);
    expect(s.st.seeker).toMatchObject({ mode: 'caged', tone: 'none' });
  });

  it('slaved to an ACM lock off the nose, and lost outside the gimbal', () => {
    const s = setup('su27', 30, 0, 2500);
    setAcmMode(s.w, s.me, s.st, 'helmet');
    expect(acmPressLock(s.w, s.me, s.st)).toBe(true);
    run(s.w, s.me, s.st, 0.5);
    expect(s.st.seeker).toMatchObject({ mode: 'track', tone: 'lock' });
    // Swing him to 80° (R-73 gimbal 75°): the seeker and the helmet lock both go.
    s.b.pos.set(2500 * Math.sin(80 * D2R), ALT, -2500 * Math.cos(80 * D2R));
    run(s.w, s.me, s.st, 0.1);
    expect(s.st.seeker.tone).toBe('none');
    expect(s.st.lockedId).toBeNull();
  });

  it('no missiles left: no tone', () => {
    const s = setup('su27', 0, 0, 2500);
    s.me.stores.r73 = 0;
    run(s.w, s.me, s.st, 1);
    expect(s.st.seeker.tone).toBe('none');
  });
});

describe('IR launch', () => {
  it('R-73: 45° off-boresight limit, even with the seeker tracking', () => {
    const s = setup('su27', 30, 0, 2500);
    setAcmMode(s.w, s.me, s.st, 'helmet');
    acmPressLock(s.w, s.me, s.st);
    run(s.w, s.me, s.st, 0.5);
    s.b.pos.set(2500 * Math.sin(50 * D2R), ALT, -2500 * Math.cos(50 * D2R));
    run(s.w, s.me, s.st, 0.05);
    expect(s.st.seeker.tone).toBe('lock');
    const c = irShotCheck(s.w, s.me, s.st);
    expect(c.ok).toBe(false);
    expect(c.reason).toContain('45°');
    const f = fireIr(s.w, s.me, s.st);
    expect(f.missile).toBeNull();

    const n = setup('su27', 30, 0, 2500);
    setAcmMode(n.w, n.me, n.st, 'helmet');
    acmPressLock(n.w, n.me, n.st);
    run(n.w, n.me, n.st, 0.5);
    const ok = irShotCheck(n.w, n.me, n.st);
    expect(ok.ok, ok.reason).toBe(true);
    expect(ok.inZone).toBe(true);
    const before = n.me.stores.r73 ?? 0;
    const shot = fireIr(n.w, n.me, n.st);
    expect(shot.missile?.type).toBe('r73');
    expect(n.me.stores.r73).toBe(before - 1);
    expect(n.st.seeker.tone).toBe('none');
  });

  it('a shot without the tone is allowed but not in the zone', () => {
    const s = setup('fa18c', 0, 0, 2500);
    run(s.w, s.me, s.st, 0.5);
    const c = irShotCheck(s.w, s.me, s.st);
    expect(c.ok).toBe(true);
    expect(c.inZone).toBe(false);
  });

  it('is deterministic', () => {
    const tones = () => {
      const s = setup('f16c', 0, 0, 2500);
      setAcmMode(s.w, s.me, s.st, 'acm20');
      const out: string[] = [];
      run(s.w, s.me, s.st, 2, () => out.push(`${s.st.seeker.tone}${s.st.lockedId ?? ''}`));
      return out.join(',');
    };
    expect(tones()).toBe(tones());
  });
});
