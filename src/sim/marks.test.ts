import { describe, expect, it } from 'vitest';
import { World } from './world';
import { SMOKE_DURATION_S, marksNear } from './marks';

describe('target marks', () => {
  it('puts smoke on the ground, white by default, and emits mark on', () => {
    const w = new World(1);
    w.groundAlt = 120;
    const m = w.spawnMark({ type: 'smoke', side: 'blue', pos: { x: 300, z: -200 } });
    expect(m.pos.y).toBe(120);
    expect(m.colour).toBe('white');
    expect(m.code).toBeNull();
    expect(m.until).toBe(SMOKE_DURATION_S);
    expect(w.events.at(-1)).toMatchObject({ type: 'mark', markId: m.id, mark: 'smoke', what: 'on' });
  });

  it('keeps a laser code and has no colour; laser and IR are open-ended by default', () => {
    const w = new World(1);
    const laser = w.spawnMark({ type: 'laser', side: 'blue', pos: { x: 0, z: 0 }, code: 1688, colour: 'red' });
    const ir = w.spawnMark({ type: 'ir', side: 'blue', pos: { x: 10, z: 0 } });
    expect(laser.code).toBe(1688);
    expect(laser.colour).toBeNull();
    expect(laser.until).toBeNull();
    expect(ir.until).toBeNull();
  });

  it('expires smoke at its duration and emits mark off once', () => {
    const w = new World(1);
    const m = w.spawnMark({ type: 'smoke', colour: 'green', side: 'blue', pos: { x: 0, z: 0 }, durationS: 2 });
    w.step(1.9);
    expect(m.alive).toBe(true);
    w.step(0.2);
    expect(m.alive).toBe(false);
    w.step(1);
    expect(w.events.filter(e => e.type === 'mark' && e.what === 'off')).toHaveLength(1);
  });

  it('ends a mark when its owner unit dies, and endMark is idempotent', () => {
    const w = new World(1);
    const jtac = w.spawnGroundUnit({ kind: 'apc', side: 'blue', pos: { x: 0, z: 2000 } });
    const m = w.spawnMark({ type: 'laser', side: 'blue', ownerId: jtac.id, pos: { x: 0, z: 0 }, code: 1688 });
    jtac.alive = false;
    w.step(1 / 60);
    expect(m.alive).toBe(false);
    w.endMark(m.id);
    expect(w.events.filter(e => e.type === 'mark' && e.what === 'off')).toHaveLength(1);
  });

  it('records marks in the replay frames', () => {
    const w = new World(1);
    w.spawnMark({ type: 'smoke', colour: 'orange', side: 'blue', pos: { x: 50, z: 60 } });
    w.step(0.5);
    const f = w.recording.at(-1)!;
    expect(f.marks).toEqual([expect.objectContaining({ type: 'smoke', colour: 'orange', side: 'blue', alive: true })]);
    expect(f.marks![0]!.pos).toEqual([50, 0, 60]);
  });

  it('finds live marks near a point, nearest first', () => {
    const w = new World(1);
    const far = w.spawnMark({ type: 'smoke', side: 'blue', pos: { x: 400, z: 0 } });
    const near = w.spawnMark({ type: 'smoke', side: 'blue', pos: { x: 100, z: 0 } });
    const dead = w.spawnMark({ type: 'smoke', side: 'blue', pos: { x: 50, z: 0 } });
    w.endMark(dead.id);
    expect(marksNear(w, { x: 0, z: 0 }, 500).map(m => m.id)).toEqual([near.id, far.id]);
    expect(marksNear(w, { x: 0, z: 0 }, 200).map(m => m.id)).toEqual([near.id]);
  });

  it('is deterministic: the same script gives the same ids and events', () => {
    const run = () => {
      const w = new World(7);
      w.spawnMark({ type: 'smoke', side: 'blue', pos: { x: 0, z: 0 }, durationS: 1 });
      w.spawnMark({ type: 'laser', side: 'blue', pos: { x: 5, z: 5 }, code: 1688 });
      w.step(2);
      return w.events.map(e => JSON.stringify(e));
    };
    expect(run()).toEqual(run());
  });
});
