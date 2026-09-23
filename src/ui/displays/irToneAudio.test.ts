/** IR seeker tone audio: nothing before start(), tones follow the seeker, mute, and full cleanup on dispose. */
import { describe, expect, it } from 'vitest';
import { IrToneAudio } from './irToneAudio';

class FakeParam { value = 0; setTargetAtTime(v: number) { this.value = v; } }
class FakeNode { connected = 0; connect(n: FakeNode) { this.connected++; return n; } disconnect() { this.connected = 0; } }
class FakeGain extends FakeNode { gain = new FakeParam(); }
class FakeOsc extends FakeNode {
  type = 'sine'; frequency = new FakeParam(); started = false; stopped = false;
  start() { this.started = true; } stop() { this.stopped = true; }
}
const made: FakeCtx[] = [];
class FakeCtx {
  state = 'running'; currentTime = 0; closed = false; destination = new FakeNode();
  oscs: FakeOsc[] = []; gains: FakeGain[] = [];
  constructor() { made.push(this); }
  createGain() { const g = new FakeGain(); this.gains.push(g); return g; }
  createOscillator() { const o = new FakeOsc(); this.oscs.push(o); return o; }
  async resume() { this.state = 'running'; }
  async suspend() { this.state = 'suspended'; }
  async close() { this.closed = true; }
}
const ctor = FakeCtx as unknown as new () => AudioContext;

describe('IrToneAudio', () => {
  it('creates no audio context before a user gesture starts it', () => {
    made.length = 0;
    const a = new IrToneAudio({ ctor });
    a.setTone('lock');
    expect(made.length).toBe(0);
    expect(a.enabled).toBe(false);
    a.dispose();
  });

  it('growl, lock tone, mute, then dispose stops and closes everything', async () => {
    made.length = 0;
    const a = new IrToneAudio({ ctor, volume: 0.2 });
    await a.start();
    const ctx = made[0]!;
    const [master, amp] = ctx.gains as [FakeGain, FakeGain];
    const [osc] = ctx.oscs as [FakeOsc];
    expect(a.enabled).toBe(true);
    a.setTone('growl');
    expect(amp.gain.value).toBeGreaterThan(0);
    expect(osc.frequency.value).toBeLessThan(600);
    a.setTone('lock');
    expect(osc.frequency.value).toBeGreaterThan(1000);
    a.setMuted(true);
    expect(master.gain.value).toBe(0);
    a.setMuted(false);
    a.setTone('none');
    expect(amp.gain.value).toBe(0);
    a.stop();
    expect(ctx.state).toBe('suspended');
    a.dispose();
    expect(ctx.closed).toBe(true);
    expect(ctx.oscs.every(o => o.stopped)).toBe(true);
    await a.start();                 // no restart after dispose
    expect(made.length).toBe(1);
    a.dispose();                     // twice is safe
  });
});
