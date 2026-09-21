/** Real-time hold actions. Losing focus or pausing cancels without producing a short press. */
import type { KeyBinding } from '../../ui/keys';

export class HoldAction {
  private started: number | null = null;
  private fired = false;
  constructor(private seconds: number, private action: () => void, private tap?: () => void,
    private enabled: () => boolean = () => true, private now: () => number = () => performance.now()) {}
  readonly binding: KeyBinding = {
    down: () => { if (this.enabled()) { this.started = this.now(); this.fired = false; } },
    up: e => {
      // A keyup can arrive after the threshold but before the next animation frame.
      if (e) this.tick();
      const tap = !!e && this.started !== null && !this.fired && this.enabled();
      this.cancel();
      if (tap) this.tap?.();
    },
  };
  cancel(): void { this.started = null; this.fired = false; }
  tick(): void {
    if (!this.enabled()) { this.cancel(); return; }
    if (this.started !== null && !this.fired && this.now() - this.started >= this.seconds * 1000) {
      this.fired = true;
      this.action();
    }
  }
}
