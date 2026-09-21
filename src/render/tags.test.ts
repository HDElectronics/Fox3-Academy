import { describe, expect, it } from 'vitest';
import { LabelRegistry, layoutLabels, type DeclutterLabel, type LabelCandidate } from './tags';

const box = (left: number, top: number, priority = 1, width = 130, height = 30): LabelCandidate => ({ left, top, priority, width, height });
function visibleBoxes(labels: LabelCandidate[], width: number, height: number) {
  const result = layoutLabels(labels, width, height);
  const visible = labels.flatMap((l, i) => result[i].visible ? [{ ...l, left: l.left + result[i].x, top: l.top + result[i].y }] : []);
  for (const b of visible) {
    expect(b.left).toBeGreaterThanOrEqual(6);
    expect(b.top).toBeGreaterThanOrEqual(6);
    expect(b.left + b.width).toBeLessThanOrEqual(width - 6);
    expect(b.top + b.height).toBeLessThanOrEqual(height - 6);
  }
  for (let i = 0; i < visible.length; i++) for (let j = i + 1; j < visible.length; j++) {
    const a = visible[i], b = visible[j];
    expect(a.left + a.width <= b.left || b.left + b.width <= a.left || a.top + a.height <= b.top || b.top + b.height <= a.top).toBe(true);
  }
  return { result, visible };
}

describe('tactical label placement', () => {
  it('keeps clustered aircraft, missile and lesson-note labels readable at a phone edge', () => {
    const labels = [box(275, 250, 0), box(280, 250, 1), box(275, 250, 2), box(270, 255, 3, 110, 16)];
    const { visible } = visibleBoxes(labels, 390, 300);
    expect(visible).toHaveLength(4);
  });

  it('searches above a crowded anchor rather than pushing tags below the viewport', () => {
    const labels = [box(25, 155), box(25, 155, 2), box(25, 155, 3)];
    const { result, visible } = visibleBoxes(labels, 200, 190);
    expect(visible).toHaveLength(3);
    expect(result[1].y).toBeLessThan(0);
    expect(result[2].y).toBeLessThan(result[1].y);
  });

  it('reserves scarce space for the selected entity regardless of registration order', () => {
    const labels = [box(10, 10, 4, 170, 32), box(10, 10, 3, 170, 32), box(10, 10, 0, 170, 32)];
    const { result, visible } = visibleBoxes(labels, 190, 50);
    expect(visible).toHaveLength(1);
    expect(result.map(r => r.visible)).toEqual([false, false, true]);
  });

  it('does not stop checking collisions after eight labels', () => {
    const labels = Array.from({ length: 20 }, (_, i) => box(80, 80, i, 70, 12));
    const { visible } = visibleBoxes(labels, 390, 320);
    expect(visible.length).toBeGreaterThan(8);
  });

  it('restores labels when a viewport expands without preserving suppression as owner visibility', () => {
    const labels = [box(10, 10, 0, 170, 32), box(10, 10, 3, 170, 32)];
    expect(layoutLabels(labels, 190, 50)[1].visible).toBe(false);
    expect(layoutLabels(labels, 390, 200)[1].visible).toBe(true);
  });

  it('accounts for centered and left-aligned note bounds rather than treating anchors as rectangles', () => {
    const labels = [box(165, 100, 1, 150, 31), box(150 - 70, 110 - 21, 2, 140, 16), box(150 - 90 - 6, 110 - 7, 3, 90, 16)];
    expect(visibleBoxes(labels, 390, 240).visible).toHaveLength(3);
  });

  it('hides text that cannot fit instead of clipping or moving it far from its anchor', () => {
    expect(layoutLabels([box(0, 0, 0, 400)], 390, 200)[0].visible).toBe(false);
    expect(layoutLabels([box(600, 10)], 390, 200)[0].visible).toBe(false);
  });
});

function fakeLabel() {
  const calls: unknown[] = [];
  const label = {
    visible: false,
    place: (x: number, y: number) => calls.push([x, y]),
    setLayoutVisible: (v: boolean) => calls.push(v),
  } as unknown as DeclutterLabel;
  return { label, calls };
}

describe('page annotation registration lifecycle', () => {
  it('unregisters idempotently and restores layout without changing owner visibility', () => {
    const registry = new LabelRegistry(), { label, calls } = fakeLabel();
    const off = registry.register(label, { priority: 1 });
    expect([...registry.entries()]).toHaveLength(1);
    off(); off();
    expect([...registry.entries()]).toHaveLength(0);
    expect(calls).toEqual([[0, 0], true]);
    expect(label.visible).toBe(false);
  });

  it('rejects duplicate participation and releases all references on view disposal', () => {
    const registry = new LabelRegistry(), a = fakeLabel(), b = fakeLabel();
    registry.register(a.label); registry.register(b.label);
    expect(() => registry.register(a.label)).toThrow('already registered');
    registry.clear();
    expect([...registry.entries()]).toEqual([]);
    expect(a.calls).toEqual([[0, 0], true]);
    expect(b.calls).toEqual([[0, 0], true]);
  });

  it('an old unregister cannot delete a new registration after clear', () => {
    const registry = new LabelRegistry(), { label } = fakeLabel();
    const oldOff = registry.register(label);
    registry.clear();
    registry.register(label, { priority: 0 });
    oldOff();
    expect([...registry.entries()]).toHaveLength(1);
  });
});
