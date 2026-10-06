import { describe, expect, it } from 'vitest';
import { LaserDeliverySession } from './delivery';
const target = { onTarget: true };
function ready(): LaserDeliverySession {
  const s = new LaserDeliverySession('delivery');
  s.setBombCode('1688'); s.armed = true; s.masterArm = true;
  s.setRelease(true); s.startRun(); return s;
}
describe('laser delivery workflow', () => {
  it('requires bomb CODE configuration and held consent at the release gate', () => {
    const s = new LaserDeliverySession('delivery'); s.masterArm = true;
    s.setRelease(true); s.startRun(); s.step(8, target);
    expect(s.phase).toBe('idle'); expect(s.done[1]).toBe(false);
    s.setBombCode('1688'); s.setRelease(false); s.startRun(); s.step(8, target);
    expect(s.phase).toBe('idle');
    s.setRelease(true); s.startRun(); s.step(8, target); expect(s.phase).toBe('flight');
  });
  it('sequences REL, LASER, TTI and completes the scripted AUTO delivery', () => {
    const s = ready(); expect(s.cue).toBe('REL');
    s.step(8, target); expect(s.cue).toBe('LASER'); expect(s.cueTime).toBe(6);
    s.step(6, target); expect(s.cue).toBe('TTI'); expect(s.laserOn).toBe(true);
    s.step(6, target); expect(s.phase).toBe('hit'); expect(s.complete).toBe(true); expect(s.laserOn).toBe(false);
  });
  it('permits mismatched code release but misses, and captures the bomb code at release', () => {
    const s = ready(); s.setLaserCode('1687'); s.step(8, target);
    expect(s.phase).toBe('flight'); s.setBombCode('1687'); s.step(12, target);
    expect(s.phase).toBe('miss');
  });
  it('can correct the pod code after release', () => {
    const s = ready(); s.setLaserCode('1687'); s.step(16, target);
    s.setLaserCode('1688'); s.step(4, target); expect(s.phase).toBe('hit');
  });
  it('requires sustained final illumination, not a single impact-frame flash', () => {
    const s = ready(); s.step(17, target); s.armed = false; s.step(2.9, target);
    s.armed = true; s.step(.1, target); expect(s.phase).toBe('miss');
  });
  it('allows early reacquisition but fails a late loss of track', () => {
    const s = ready(); s.step(15, target); s.step(1, { onTarget: false }); s.step(4, target);
    expect(s.phase).toBe('hit');
    const late = ready(); late.step(19, target); late.step(1, { onTarget: false }); expect(late.phase).toBe('miss');
  });
  it('supports two-second taps and continuous trigger holds only with TRIG and ARM', () => {
    const s = new LaserDeliverySession('laser'); s.setTrigger(true); expect(s.laserOn).toBe(false);
    s.setTrigger(false); s.armed = true; s.trig = true; s.setTrigger(true); s.setTrigger(false);
    s.step(1.9, target); expect(s.laserOn).toBe(true); s.step(.1, target); expect(s.laserOn).toBe(false);
    s.setTrigger(true); s.step(10, target); expect(s.laserOn).toBe(true);
    s.setTrigger(false); expect(s.laserOn).toBe(false);
    s.armed = false; s.setTrigger(true); expect(s.laserOn).toBe(false);
  });
  it('requires matching codes, ARM and manual emission on target for the laser lesson', () => {
    const s = new LaserDeliverySession('laser'); s.armed = true; s.trig = true; s.setTrigger(true);
    s.step(.1, target); expect(s.complete).toBe(false);
    s.setBombCode('1688'); s.setLaserCode('1688'); s.step(.1, { onTarget: false }); expect(s.complete).toBe(false);
    s.step(.1, target); expect(s.complete).toBe(true);
  });
  it('resets transient inputs on retry and ignores invalid dt', () => {
    const s = ready(); for (const dt of [NaN, Infinity, -1, 0]) s.step(dt, target);
    expect(s.timer).toBe(8); s.retry(); expect(s.phase).toBe('idle'); expect(s.bombCode).toBe('1688');
    s.startRun(); s.step(8, target); expect(s.phase).toBe('idle');
  });
  it('has equivalent outcomes for coarse and small time steps', () => {
    const coarse = ready(); coarse.step(20, target);
    const fine = ready(); for (let i = 0; i < 1200; i++) fine.step(1 / 60, target);
    expect(fine.phase).toBe(coarse.phase); expect(fine.done).toEqual(coarse.done);
  });
});
