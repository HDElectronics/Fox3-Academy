import { describe, expect, it, vi } from 'vitest';
import { HoldAction } from './input';

const key = {} as KeyboardEvent;
describe('Sortie hold actions', () => {
  it.each([1, 2])('fires once after a %s-second hold and cancels early release', seconds => {
    let now = 0;
    const fire = vi.fn();
    const hold = new HoldAction(seconds, fire, undefined, () => true, () => now);
    hold.binding.down?.(key); now = seconds * 1000 - 1; hold.tick();
    expect(fire).not.toHaveBeenCalled();
    hold.binding.up?.(key); now += 2000; hold.tick();
    expect(fire).not.toHaveBeenCalled();
    hold.binding.down?.(key); now += seconds * 1000; hold.tick(); hold.tick();
    expect(fire).toHaveBeenCalledOnce();
  });
  it.each([1, 2])('settles a completed %s-second hold on release between animation frames', seconds => {
    let now = 0;
    const action = vi.fn(), tap = vi.fn();
    const hold = new HoldAction(seconds, action, tap, () => true, () => now);
    hold.binding.down?.(key); now = seconds * 1000; hold.binding.up?.(key);
    expect(action).toHaveBeenCalledOnce(); expect(tap).not.toHaveBeenCalled();
    hold.tick(); expect(action).toHaveBeenCalledOnce();
    hold.binding.down?.(key); now += seconds * 1000; hold.binding.up?.();
    expect(action).toHaveBeenCalledOnce();
  });
  it('taps the Viper bug only on a real short release, never on lost focus', () => {
    let now = 0;
    const mode = vi.fn(), tap = vi.fn();
    const hold = new HoldAction(1, mode, tap, () => true, () => now);
    hold.binding.down?.(key); hold.binding.up?.();
    expect(tap).not.toHaveBeenCalled();
    hold.binding.down?.(key); hold.binding.up?.(key);
    expect(tap).toHaveBeenCalledOnce();
    hold.binding.down?.(key); now = 1000; hold.tick(); hold.binding.up?.(key);
    expect(mode).toHaveBeenCalledOnce(); expect(tap).toHaveBeenCalledOnce();
  });
  it('discards elapsed holds across pause, resume and disposal', () => {
    let now = 0, enabled = true;
    const action = vi.fn(), tap = vi.fn();
    const hold = new HoldAction(1, action, tap, () => enabled, () => now);
    hold.binding.down?.(key); now = 500; enabled = false; hold.tick();
    now = 2500; enabled = true; hold.tick(); hold.binding.up?.(key);
    expect(action).not.toHaveBeenCalled(); expect(tap).not.toHaveBeenCalled();
    enabled = false; hold.binding.down?.(key); enabled = true; now = 5000; hold.tick();
    expect(action).not.toHaveBeenCalled();
    hold.binding.down?.(key); hold.cancel(); now = 7000; hold.tick(); hold.binding.up?.(key);
    expect(action).not.toHaveBeenCalled(); expect(tap).not.toHaveBeenCalled();
  });
});
