import { describe, expect, it, vi } from 'vitest';
import { TwsLesson } from './drill';
import { FreeLabInput, LabTimers } from './input';
import { D2R } from '../../sim/math';
import { setCursor } from '../../sim/radar';

function scene(ac: 'f15c' | 'su27' = 'f15c') {
  const lesson = new TwsLesson(ac, { freeLab: true });
  lesson.me.selectedWeapon = null;
  lesson.setMode('tws');
  for (const b of lesson.bandits) {
    b.pos.sub(lesson.me.pos).multiplyScalar(0.35).add(lesson.me.pos);
  }
  for (let i = 0; i < 160; i++) lesson.step(0.1);
  return lesson;
}
const press = (input: ReturnType<FreeLabInput['binding']>) => input.down?.({} as KeyboardEvent);

describe('TWS free lab inputs', () => {
  it('slews a continuous cursor through empty space without cycling, designating or locking', () => {
    const L = scene('su27');
    expect(L.contacts().length).toBeGreaterThan(0);
    setCursor(L.world, L.me, { az: -20 * D2R, range: 1000 });
    const input = new FreeLabInput();
    const right = input.binding('right'); press(right);
    input.step(L, 0.2, false);
    expect(L.me.radar.cursor.az / D2R).toBeCloseTo(-15);
    expect(L.me.radar.cursor.range).toBe(1000);
    expect(L.hooked).toBeNull();
    expect(L.me.radar.designated).toEqual([]);
    expect(L.me.radar.mode).toBe('tws');
    right.up?.(); input.step(L, 0.2, false);
    expect(L.me.radar.cursor.az / D2R).toBeCloseTo(-15);
  });

  it('requires explicit designation and second action to lock, and supports unlock', () => {
    const L = scene();
    const contact = L.contacts().find(c => L.me.radar.tracks.some(t => t.targetId === c.id && t.firm))!;
    expect(contact).toBeTruthy();
    setCursor(L.world, L.me, contact);
    expect(L.contactAtCursor()).toBe(contact.id);
    L.slewCursor(0.001, 0, 0.01);
    expect(L.me.radar.designated).toEqual([]);
    expect(L.act(L.contactAtCursor()!)).toBeNull();
    expect(L.me.radar.designated).toEqual([contact.id]);
    expect(L.me.radar.mode).toBe('tws');
    expect(L.act(contact.id)).toBeNull();
    expect(L.me.radar.mode).toBe('stt');
    L.unlock();
    expect(L.me.radar.mode).toBe('tws');
    expect(L.me.radar.stt.targetId).toBeNull();
  });

  it('does not lock a previously hooked contact when the cursor is over empty space', () => {
    const L = scene();
    L.hooked = L.contacts()[0]!.id;
    setCursor(L.world, L.me, { az: -50 * D2R, range: 0 });
    expect(L.lockPrimary()).toMatch(/Nothing to lock/);
    expect(L.me.radar.mode).toBe('tws');
  });

  it('manual designation aid and optional DCS SNP snap are separate', () => {
    const L = scene('su27');
    const c = L.contacts()[0]!;
    setCursor(L.world, L.me, c);
    L.slewCursor(0.001, 0, 0.01);
    expect(L.me.radar.designated).toEqual([]);
    L.dcsCursorSnap = true;
    L.slewCursor(0.001, 0, 0.01);
    expect(L.me.radar.designated).toContain(c.id);
  });

  it('arrow controls adjust tactical heading/altitude and clear on pause and disposal', () => {
    const L = scene(); const input = new FreeLabInput();
    const heading = L.me.cmd.heading, altitude = L.me.cmd.altitude;
    press(input.binding('turnRight')); press(input.binding('climb'));
    input.step(L, 0.5, false);
    expect(L.me.cmd.heading).toBeCloseTo(heading + 6 * D2R);
    expect(L.me.cmd.altitude).toBe(altitude + 150);
    input.step(L, 1, true); input.step(L, 1, false);
    expect(L.me.cmd.altitude).toBe(altitude + 150);
    press(input.binding('climb')); input.clear(); input.step(L, 1, false);
    expect(L.me.cmd.altitude).toBe(altitude + 150);
  });

  it('free practice continues through merge and beyond the guided time limit', () => {
    const L = new TwsLesson('f15c', { freeLab: true });
    L.bandits[0]!.pos.copy(L.me.pos);
    L.bandits[0]!.pos.z -= 5000;
    L.world.t = 361; L.step(0.1);
    expect(L.ended).toBeNull();
    expect(L.world.t).toBeGreaterThan(361);
  });
});


describe('TWS key-hold timers', () => {
  it('cancels launch and mode holds together before a reset, then ignores their releases', () => {
    vi.useFakeTimers();
    try {
      const timers = new LabTimers(), fire = vi.fn(), mode = vi.fn();
      timers.start('fire', 1, fire); timers.start('mode', 1, mode);
      vi.advanceTimersByTime(500); timers.clear(); vi.advanceTimersByTime(1000);
      expect(fire).not.toHaveBeenCalled(); expect(mode).not.toHaveBeenCalled();
      expect(timers.cancel('mode')).toBe(false);
      timers.start('fire', 1, fire); vi.advanceTimersByTime(1000);
      expect(fire).toHaveBeenCalledOnce();
      expect(timers.cancel('fire')).toBe(false);
    } finally { vi.useRealTimers(); }
  });
});
