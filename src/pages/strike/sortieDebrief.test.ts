import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountSortieDebrief } from './sortieDebrief';
import { SortieTracker, scoreSortie } from './sortie';
import { buildScenario } from './scenario';
import type { MapScene } from './sortieMap';

// Exercise the mounted controls and real RAF loop without a canvas or browser dependency.
const dom = vi.hoisted(() => {
  class Node extends EventTarget {
    textContent = '';
    clientWidth = 500;
    clientHeight = 100;
    width = 500;
    height = 100;
    constructor(readonly tag: string, readonly attrs: Record<string, unknown> = {}) { super(); }
    append() {}
    remove() {}
    getContext() { return null; }
    getBoundingClientRect() { return { left: 0, width: 500 }; }
    setAttribute(key: string, value: string) { this.attrs[key] = value; }
  }
  return { Node, nodes: [] as Node[], buttons: [] as { label: string; onClick(): void; setLabel: (s: string) => void }[] };
});

vi.mock('../../ui', async () => {
  const { cleanup } = await import('../../ui/dom');
  return {
    cleanup,
    h: (tag: string, attrs: Record<string, unknown> | null) => {
      const node = new dom.Node(tag, attrs ?? {}); dom.nodes.push(node); return node;
    },
    button: (o: { label: string; onClick(): void }) => {
      const setLabel = vi.fn(); dom.buttons.push({ ...o, setLabel });
      return { el: new dom.Node('button'), setLabel };
    },
    segmented: () => ({ el: new dom.Node('div') }),
    placard: () => new dom.Node('div'),
    dataTable: () => new dom.Node('table'),
  };
});
vi.mock('../../ui/theme', () => ({ readTheme: () => ({}), alpha: () => '' }));

describe('sortie replay playback', () => {
  let callbacks: Map<number, FrameRequestCallback>;
  let nextId: number;
  let debrief: { dispose(): void };
  beforeEach(() => {
    callbacks = new Map(); nextId = 0;
    dom.nodes.length = 0; dom.buttons.length = 0;
    vi.stubGlobal('window', new EventTarget());
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.stubGlobal('requestAnimationFrame', vi.fn((cb: FrameRequestCallback) => { callbacks.set(++nextId, cb); return nextId; }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => callbacks.delete(id)));
    const sc = buildScenario('sortie'), tracker = new SortieTracker(sc.world, sc);
    sc.world.t = 100;
    tracker.close(); tracker.dispose();
    const summary = tracker.summary('pilot', 'vikhr');
    debrief = mountSortieDebrief({
      view: new dom.Node('div') as unknown as HTMLElement,
      panel: new dom.Node('div') as unknown as HTMLElement,
      frames: [], scene: {} as MapScene, meId: sc.me.id, summary, score: scoreSortie(summary),
      markers: [{ t: 50, kind: 'egress', text: 'Egress', tone: 'dim' }],
      onAgain() {}, onBrief() {}, startAt: 10,
    });
  });
  afterEach(() => { debrief.dispose(); vi.unstubAllGlobals(); });

  const timeline = () => dom.nodes.find(n => n.attrs['aria-label'] === 'Replay time')!;
  const play = () => dom.buttons.find(b => b.label === 'Play')!;

  it.each(['event', 'keyboard', 'pointer'] as const)('pauses on %s seek and ignores a queued frame', kind => {
    play().onClick();
    const queued = callbacks.get(nextId)!;
    expect(callbacks.size).toBe(1);
    if (kind === 'event') {
      const eventButton = dom.nodes.find(n => String(n.attrs.class).includes('strk-sdb-res__seek'))!;
      (eventButton.attrs.onclick as () => void)();
    } else if (kind === 'keyboard') {
      const event = new Event('keydown'); Object.assign(event, { key: 'ArrowRight' });
      timeline().dispatchEvent(event);
    } else {
      const event = new Event('pointerdown'); Object.assign(event, { clientX: 281 });
      timeline().dispatchEvent(event);
    }
    const seekTime = timeline().attrs['aria-valuenow'];
    expect(seekTime).toBe(kind === 'event' ? '48' : kind === 'keyboard' ? '15' : '50');
    expect(cancelAnimationFrame).toHaveBeenCalledWith(nextId);
    expect(callbacks.size).toBe(0);
    expect(play().setLabel).toHaveBeenLastCalledWith('Play');
    const requests = vi.mocked(requestAnimationFrame).mock.calls.length;
    queued(performance.now() + 1000);
    expect(timeline().attrs['aria-valuenow']).toBe(seekTime);
    expect(vi.mocked(requestAnimationFrame).mock.calls).toHaveLength(requests);
    // Playback can be explicitly resumed from the selected time.
    play().onClick();
    callbacks.get(nextId)!(performance.now() + 1000);
    expect(Number(timeline().attrs['aria-valuenow'])).toBeGreaterThan(Number(seekTime));
  });

  it('cancels playback on disposal and ignores a late frame', () => {
    play().onClick();
    const queued = callbacks.get(nextId)!;
    debrief.dispose();
    expect(callbacks.size).toBe(0);
    queued(performance.now() + 1000);
    expect(timeline().attrs['aria-valuenow']).toBe('10');
    expect(callbacks.size).toBe(0);
  });
});
