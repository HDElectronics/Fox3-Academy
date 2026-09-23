/**
 * [OWNER: displays] IrToneAudio: the IR missile seeker tone with WebAudio, in the RwrAudio pattern. Off by default:
 * no AudioContext exists until start(), which must be called from a user gesture. Tones (gameplay, simplified):
 *   - growl: a low, rough tone while the seeker sees heat;
 *   - lock: a steady high tone while it tracks (AIM-9 / PL-5 high tone, FC3 ПР).
 * setTone() every frame; setMuted() for the page's mute toggle; dispose() in the page's unmount closes the context.
 */
import type { IrTone } from '../../sim/acm';

type AudioCtor = new () => AudioContext;

export interface IrToneOptions {
  /** Master volume 0..1. Default 0.15. */
  volume?: number;
  /** AudioContext constructor (tests inject a fake). Default: the browser's. */
  ctor?: AudioCtor;
}

const GROWL_HZ = 420;
const LOCK_HZ = 1250;

function browserCtor(): AudioCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export class IrToneAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private amp: GainNode | null = null;
  private osc: OscillatorNode | null = null;
  private fm: OscillatorNode | null = null;
  private fmDepth: GainNode | null = null;
  private tone: IrTone = 'none';
  private volume: number;
  private readonly ctor: AudioCtor | null;
  private disposed = false;
  /** True between start() and stop(). */
  enabled = false;
  muted = false;

  constructor(o: IrToneOptions = {}) {
    this.volume = o.volume ?? 0.15;
    this.ctor = o.ctor ?? browserCtor();
  }

  get supported(): boolean { return !!this.ctor; }
  get current(): IrTone { return this.tone; }

  /** Create / resume the audio graph. Call from a user gesture. */
  async start(): Promise<void> {
    if (!this.ctor || this.disposed) return;
    if (!this.ctx) {
      const ctx = new this.ctor();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(ctx.destination);
      this.amp = ctx.createGain();
      this.amp.gain.value = 0;
      this.amp.connect(this.master);
      this.osc = ctx.createOscillator();
      this.osc.type = 'triangle';
      this.osc.frequency.value = GROWL_HZ;
      this.osc.connect(this.amp);
      this.fm = ctx.createOscillator();
      this.fm.frequency.value = 23;
      this.fmDepth = ctx.createGain();
      this.fmDepth.gain.value = 0;
      this.fm.connect(this.fmDepth).connect(this.osc.frequency);
      this.osc.start();
      this.fm.start();
    }
    const ctx = this.ctx;
    if (ctx.state === 'suspended') await ctx.resume();
    if (this.disposed || this.ctx !== ctx) return;
    this.enabled = true;
    this.apply(this.tone);
  }

  /** Silence and suspend (keeps the graph for a later start()). */
  stop(): void {
    this.enabled = false;
    this.apply('none');
    void this.ctx?.suspend();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.02);
  }

  /** Feed the seeker tone every frame. */
  setTone(t: IrTone): void {
    if (t === this.tone) return;
    this.tone = t;
    if (this.enabled) this.apply(t);
  }

  private apply(t: IrTone): void {
    const ctx = this.ctx;
    if (!ctx || !this.amp || !this.osc || !this.fmDepth) return;
    const now = ctx.currentTime;
    const on = this.enabled && t !== 'none';
    this.amp.gain.setTargetAtTime(on ? (t === 'lock' ? 0.8 : 0.6) : 0, now, 0.015);
    this.osc.frequency.setTargetAtTime(t === 'lock' ? LOCK_HZ : GROWL_HZ, now, 0.01);
    this.fmDepth.gain.setTargetAtTime(t === 'growl' ? 70 : 0, now, 0.01);
  }

  /** Stop everything and close the context. Safe to call twice. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.enabled = false;
    try { this.osc?.stop(); this.fm?.stop(); } catch { /* already stopped */ }
    this.osc?.disconnect(); this.fm?.disconnect(); this.fmDepth?.disconnect(); this.amp?.disconnect(); this.master?.disconnect();
    void this.ctx?.close();
    this.ctx = null; this.osc = null; this.fm = null; this.fmDepth = null; this.amp = null; this.master = null;
  }
}
