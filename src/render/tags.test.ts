import { describe, expect, it } from 'vitest';
import { LabelPriority, LabelRegistry, layoutLabels, type DeclutterLabel, type LabelCandidate } from './tags';

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

describe('radar coverage annotations in shared placement', () => {
  const coverage = (left: number, top: number, extra: Partial<LabelCandidate> = {}): LabelCandidate =>
    ({ left, top, width: 150, height: 16, priority: LabelPriority.coverage, maxMove: 80, ...extra });

  it('ranks coverage below every entity and lesson label', () => {
    const { selected, aircraft, missile, annotation, coverage: cov } = LabelPriority;
    expect([selected, aircraft, missile, annotation, cov]).toEqual([0, 1, 2, 3, 4]);
  });

  it('nudges a coverage note off an aircraft tag and leaves the tag at its anchor', () => {
    // Crowded Radar Lab: the cursor-range note sits on top of a bandit tag (listed first so order cannot help).
    const labels = [coverage(560, 330), box(570, 335, LabelPriority.aircraft, 125, 31)];
    const { result, visible } = visibleBoxes(labels, 1040, 440);
    expect(visible).toHaveLength(2);
    expect(result[1]).toEqual({ x: 0, y: 0, visible: true });
    expect(Math.hypot(result[0].x, result[0].y)).toBeLessThanOrEqual(80);
  });

  it('hides a coverage note rather than moving it far from its frame', () => {
    // A column of tags around the anchor: the nearest free spot is beyond the coverage move limit.
    const tags = [0, 1, 2, 3, 4].map(i => box(540, 250 + i * 35, LabelPriority.aircraft, 200, 31));
    const labels = [...tags, coverage(565, 330)];
    const { result, visible } = visibleBoxes(labels, 1040, 600);
    expect(visible).toHaveLength(5);
    expect(result[5].visible).toBe(false);
    // Without the per-label limit the same note would be shoved elsewhere.
    expect(layoutLabels([...tags, coverage(565, 330, { maxMove: undefined })], 1040, 600)[5].visible).toBe(true);
  });

  it('stays on the same side of a tag instead of flipping when the anchor creeps', () => {
    // Tag spans y 300..331. Above the tag the note sits at y 280, below it at y 335.
    const tag = box(500, 300, LabelPriority.aircraft, 120, 31);
    const first = layoutLabels([tag, coverage(490, 306)], 1040, 600)[1];
    expect(first).toEqual({ x: 0, y: -26, visible: true });
    // Two px lower, "below" is now marginally closer; without memory the note would jump across the tag.
    expect(layoutLabels([tag, coverage(490, 308)], 1040, 600)[1].y).toBe(27);
    const next = layoutLabels([tag, coverage(490, 308, { prev: first })], 1040, 600)[1];
    expect(next).toEqual({ x: 0, y: -28, visible: true });
    // Well past the midpoint it does switch sides.
    expect(layoutLabels([tag, coverage(490, 318, { prev: next })], 1040, 600)[1].y).toBe(17);
  });

  it('returns home once the blocker leaves and the previous spot is well off', () => {
    const next = layoutLabels([coverage(490, 310, { prev: { x: 0, y: -40 } })], 1040, 600)[0];
    expect(next).toEqual({ x: 0, y: 0, visible: true });
  });

  it('ignores a previous spot that now overlaps a higher-priority tag', () => {
    const labels = [box(470, 250, LabelPriority.aircraft, 200, 31), coverage(490, 310, { prev: { x: 0, y: -45 } })];
    const { result, visible } = visibleBoxes(labels, 1040, 600);
    expect(visible).toHaveLength(2);
    expect(result[1].y).not.toBe(-45);
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
