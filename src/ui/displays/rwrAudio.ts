/**
 * [OWNER: displays] RwrAudio: optional RWR tones with WebAudio, off by default.
 * No AudioContext exists until start(), which must be called from a user gesture (click / key).
 *   - search: a short chirp each time a search radar paints you (lastSeen jumps) or a new threat appears
 *     (SPO-15: low tone; Western RWRs: high chirp);
 *   - lock: continuous tone (SPO-15 steady high tone; Western RWRs pulsed "chirping");
 *   - launch / active missile: warble (SPO-15: intermittent high tone).
 * Call update(contacts, t) every frame; the most severe state wins. dispose() closes the context.
 */
import type { RwrId } from '../../data/types';
import type { EntityId, RwrContact } from '../../sim/types';

export interface RwrAudioOptions {
  rwr?: RwrId;
  /** Master volume 0..1. Default 0.2. */
  volume?: number;
}

type Tone = 'none' | 'lock' | 'launch';

type AudioCtor = typeof AudioContext;

export class RwrAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private carrier: OscillatorNode | null = null;
  private amp: GainNode | null = null;
  private fm: OscillatorNode | null = null;
  private fmDepth: GainNode | null = null;
  private am: OscillatorNode | null = null;
  private amDepth: GainNode | null = null;
  private tone: Tone = 'none';
  private seen = new Map<EntityId, { last: number; stamp: number }>();
  private stamp = 0;
  private disposed = false;
  private lastChirp = -Infinity;
  private rwr: RwrId;
  private volume: number;
  /** True between start() and stop(). */
  enabled = false;

  constructor(options: RwrAudioOptions = {}) {
    this.rwr = options.rwr ?? 'alr56c';
    this.volume = options.volume ?? 0.2;
  }

  /** Whether WebAudio exists in this browser. */
  static get supported(): boolean {
    return typeof window !== 'undefined' && !!(window.AudioContext || (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext);
  }

  setRwr(rwr: RwrId): void {
    this.rwr = rwr;
    this.tone = 'none';
    this.applyTone('none');
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
  }

  /** Create / resume the audio graph. Call from a user gesture. */
  async start(): Promise<void> {
    if (!RwrAudio.supported || this.disposed) return;
    if (!this.ctx) {
      const C: AudioCtor = window.AudioContext || (window as unknown as { webkitAudioContext: AudioCtor }).webkitAudioContext;
      const ctx = new C();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(ctx.destination);
      this.amp = ctx.createGain();
      this.amp.gain.value = 0;
      this.amp.connect(this.master);
      this.carrier = ctx.createOscillator();
      this.carrier.type = 'square';
      this.carrier.frequency.value = 1000;
      // Soften the square wave.
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2600;
      this.carrier.connect(lp).connect(this.amp);
      this.fm = ctx.createOscillator();
      this.fm.frequency.value = 8;
      this.fmDepth = ctx.createGain();
      this.fmDepth.gain.value = 0;
      this.fm.connect(this.fmDepth).connect(this.carrier.frequency);
      this.am = ctx.createOscillator();
      this.am.type = 'square';
      this.am.frequency.value = 10;
      this.amDepth = ctx.createGain();
      this.amDepth.gain.value = 0;
      this.am.connect(this.amDepth).connect(this.amp.gain);
      this.carrier.start();
      this.fm.start();
      this.am.start();
    }
    const ctx = this.ctx;
    this.wantOn = true;
    if (ctx.state === 'suspended') await ctx.resume();
    // stop() or dispose() may have run while resume() was pending.
    if (this.disposed || this.ctx !== ctx || !this.wantOn) return;
    this.enabled = true;
    this.tone = 'none';
  }
  private wantOn = false;

  /** Silence and suspend (keeps the graph for a later start()). */
  stop(): void {
    this.enabled = false;
    this.wantOn = false;
    this.applyTone('none');
    this.tone = 'none';
    void this.ctx?.suspend();
  }

  /** Feed the current contacts every frame. */
  update(contacts: readonly RwrContact[], t: number): void {
    if (!this.enabled || !this.ctx) return;
    let want: Tone = 'none';
    for (const c of contacts) {
      if (c.state === 'launch' || c.state === 'missile') { want = 'launch'; break; }
      if (c.state === 'lock') want = 'lock';
    }
    if (want !== this.tone) { this.tone = want; this.applyTone(want); }
    // Search chirps: new threats and each new paint (lastSeen jumps), at most ~4 per second.
    const stamp = ++this.stamp;
    for (const c of contacts) {
      const rec = this.seen.get(c.emitterId);
      const prev = rec?.last;
      const fresh = prev === undefined || c.lastSeen - prev > 0.5;
      if (rec) { rec.last = c.lastSeen; rec.stamp = stamp; }
      else this.seen.set(c.emitterId, { last: c.lastSeen, stamp });
      if (fresh && c.state === 'search' && want === 'none' && t - this.lastChirp > 0.25) {
        this.chirp(prev === undefined);
        this.lastChirp = t;
      }
    }
    // Forget emitters that dropped off (deleting the current entry while iterating a Map is safe).
    for (const [id, rec] of this.seen) if (rec.stamp !== stamp) this.seen.delete(id);
  }

  dispose(): void {
    this.disposed = true;
    this.enabled = false;
    this.wantOn = false;
    for (const o of [this.carrier, this.fm, this.am]) { try { o?.stop(); } catch { /* already stopped */ } }
    void this.ctx?.close();
    this.ctx = null;
    this.master = this.amp = this.fmDepth = this.amDepth = null;
    this.carrier = this.fm = this.am = null;
    this.seen.clear();
  }

  private applyTone(tone: Tone): void {
    const ctx = this.ctx;
    if (!ctx || !this.amp || !this.carrier || !this.fmDepth || !this.amDepth || !this.fm || !this.am) return;
    const now = ctx.currentTime;
    const spo = this.rwr === 'spo15';
    const set = (p: AudioParam, v: number) => { p.cancelScheduledValues(now); p.setTargetAtTime(v, now, 0.015); };
    if (tone === 'none') {
      set(this.amp.gain, 0);
      set(this.amDepth.gain, 0);
      set(this.fmDepth.gain, 0);
      return;
    }
    if (tone === 'lock') {
      set(this.carrier.frequency, spo ? 1150 : 1050);
      set(this.fmDepth.gain, 0);
      if (spo) { set(this.amp.gain, 0.5); set(this.amDepth.gain, 0); }
      else { this.am.frequency.setValueAtTime(12, now); set(this.amp.gain, 0.25); set(this.amDepth.gain, 0.25); }
      return;
    }
    // launch
    if (spo) {
      set(this.carrier.frequency, 1450);
      set(this.fmDepth.gain, 0);
      this.am.frequency.setValueAtTime(5, now);
      set(this.amp.gain, 0.25);
      set(this.amDepth.gain, 0.25);
    } else {
      set(this.carrier.frequency, 950);
      this.fm.frequency.setValueAtTime(7, now);
      set(this.fmDepth.gain, 320);
      set(this.amp.gain, 0.45);
      set(this.amDepth.gain, 0);
    }
  }

  private chirp(isNew: boolean): void {
    const ctx = this.ctx, master = this.master;
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    const spo = this.rwr === 'spo15';
    const o = ctx.createOscillator();
    const gn = ctx.createGain();
    o.type = spo ? 'triangle' : 'square';
    const f0 = spo ? 420 : isNew ? 1400 : 900;
    const f1 = spo ? 420 : isNew ? 1400 : 1700;
    const dur = spo ? 0.14 : isNew ? 0.18 : 0.07;
    o.frequency.setValueAtTime(f0, now);
    o.frequency.linearRampToValueAtTime(f1, now + dur);
    gn.gain.setValueAtTime(0, now);
    gn.gain.linearRampToValueAtTime(0.35, now + 0.008);
    gn.gain.setValueAtTime(0.35, now + dur - 0.02);
    gn.gain.linearRampToValueAtTime(0, now + dur);
    o.connect(gn).connect(master);
    o.start(now);
    o.stop(now + dur + 0.02);
    o.onended = () => { o.disconnect(); gn.disconnect(); };
  }
}
