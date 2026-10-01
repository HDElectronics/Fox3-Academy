/**
 * Spoken callouts through the browser's speech synthesis (works offline with the system voices).
 * A warning interrupts whatever is being said; other calls queue, and a queue that grows past a few calls
 * drops the oldest so the copilot never talks about the past. Mute and volume per viewer.
 */
import type { Callout } from './engine';

/** The part of window.speechSynthesis the voice uses (tests pass a fake). */
export interface SpeechLike {
  speak(u: SpeechSynthesisUtterance): void;
  cancel(): void;
  getVoices(): SpeechSynthesisVoice[];
  readonly speaking: boolean;
}

const MAX_QUEUE = 3;

export class CopilotVoice {
  muted = false;
  volume = 1;
  rate = 1.1;
  private queue: Callout[] = [];
  private busy = false;

  constructor(
    private synth: SpeechLike | null = typeof speechSynthesis === 'undefined' ? null : speechSynthesis,
    private makeUtterance: (text: string) => SpeechSynthesisUtterance = text => new SpeechSynthesisUtterance(text),
  ) {}

  get available(): boolean { return this.synth !== null; }

  say(c: Callout): void {
    if (!this.synth || this.muted || !c.say) return;
    if (c.severity === 'warning') {
      this.queue = [c];
      this.synth.cancel();
      this.busy = false;
    } else {
      this.queue.push(c);
      if (this.queue.length > MAX_QUEUE) this.queue.splice(0, this.queue.length - MAX_QUEUE);
    }
    this.next();
  }

  /** Speak a line now, for the voice test button. */
  test(text = 'Copilot voice check.'): void {
    this.say({ id: 'test', severity: 'advisory', text, say: text, t: 0 });
  }

  stop(): void {
    this.queue = [];
    this.busy = false;
    this.synth?.cancel();
  }

  private next(): void {
    if (!this.synth || this.busy) return;
    const c = this.queue.shift();
    if (!c) return;
    const u = this.makeUtterance(c.say);
    u.volume = this.volume;
    u.rate = this.rate;
    u.lang = 'en-US';
    const voice = this.synth.getVoices().find(v => v.lang.startsWith('en'));
    if (voice) u.voice = voice;
    const done = () => { this.busy = false; this.next(); };
    u.onend = done;
    u.onerror = done;
    this.busy = true;
    this.synth.speak(u);
  }
}
