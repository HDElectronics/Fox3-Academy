import { describe, expect, it } from 'vitest';
import { MergeAudio } from './audio';

class FakeParam { value = 0; setTargetAtTime(v: number) { this.value = v; } }
class FakeNode {
  connected = false;
  connect(n: FakeNode) { this.connected = true; return n; }
  disconnect() { this.connected = false; }
}
class FakeGain extends FakeNode { gain = new FakeParam(); }
class FakeOsc extends FakeNode {
  type = 'sine'; frequency = new FakeParam(); stopped = false;
  start() {} stop() { this.stopped = true; }
}

function setup(suspended = false) {
  const made: FakeCtx[] = [];
  class FakeCtx {
    state = suspended ? 'suspended' : 'running'; currentTime = 0; closed = false;
    destination = new FakeNode(); oscs: FakeOsc[] = []; gains: FakeGain[] = [];
    constructor() { made.push(this); }
    createGain() { const g = new FakeGain(); this.gains.push(g); return g; }
    createOscillator() { const o = new FakeOsc(); this.oscs.push(o); return o; }
    async resume() { this.state = 'running'; }
    async close() { this.closed = true; this.state = 'closed'; }
  }
  const doc = Object.assign(new EventTarget(), { hidden: false });
  const win = new EventTarget();
  const audio = new MergeAudio(doc, win, { ctor: FakeCtx as unknown as new () => AudioContext });
  return { doc, win, made, audio };
}

describe('Merge page seeker audio lifetime', () => {
  it.each(['visibilitychange', 'pagehide'])('%s stops and closes audio, then waits for a later gesture', async event => {
    const { doc, win, made, audio } = setup();
    audio.setTone('lock');
    expect(made).toHaveLength(0);
    await audio.start();
    audio.setTone('lock');
    expect(made[0]!.gains[1]!.gain.value).toBeGreaterThan(0);
    if (event === 'visibilitychange') { doc.hidden = true; doc.dispatchEvent(new Event(event)); }
    else win.dispatchEvent(new Event(event));
    expect(made[0]!.closed).toBe(true);
    expect(made[0]!.oscs.every(o => o.stopped && !o.connected)).toBe(true);
    expect(made[0]!.gains.every(g => !g.connected)).toBe(true);
    audio.setTone('lock');
    await audio.start(); // no restart while hidden
    expect(made).toHaveLength(1);
    doc.hidden = false;
    doc.dispatchEvent(new Event('visibilitychange'));
    win.dispatchEvent(new Event('pageshow'));
    audio.setTone('lock'); // rendering/returning to the page alone cannot recreate audio
    expect(made).toHaveLength(1);
    await audio.start(); // next gesture
    expect(made).toHaveLength(2);
    audio.setTone('growl');
    expect(made[1]!.gains[1]!.gain.value).toBeGreaterThan(0);
    audio.dispose();
    expect(made[1]!.closed).toBe(true);
    await audio.start();
    expect(made).toHaveLength(2);
  });

  it('cannot revive a graph when a pending start finishes after hiding', async () => {
    const { doc, made, audio } = setup(true);
    const starting = audio.start();
    doc.hidden = true;
    doc.dispatchEvent(new Event('visibilitychange'));
    await starting;
    expect(made[0]!.closed).toBe(true);
    expect(made[0]!.oscs.every(o => o.stopped)).toBe(true);
    audio.dispose();
  });

  it('removes all lifecycle listeners on unmount', () => {
    class TrackedTarget extends EventTarget {
      listeners = new Set<string>();
      override addEventListener(type: string, callback: EventListenerOrEventListenerObject | null) {
        super.addEventListener(type, callback); this.listeners.add(type);
      }
      override removeEventListener(type: string, callback: EventListenerOrEventListenerObject | null) {
        super.removeEventListener(type, callback); this.listeners.delete(type);
      }
    }
    const doc = Object.assign(new TrackedTarget(), { hidden: false }), win = new TrackedTarget();
    const audio = new MergeAudio(doc, win);
    expect(doc.listeners.size + win.listeners.size).toBe(3);
    audio.dispose();
    expect(doc.listeners.size + win.listeners.size).toBe(0);
  });
});
