/** Pilot-workflow exercise only: all countdowns and hit rules are trainer abstractions. */
import { LGB_TRAINING_TIMING } from '../../data/fa18cLgb';
export type DeliveryLesson = 'laser' | 'delivery' | 'troubleshoot';
export type TroubleCase = 'code' | 'track' | 'laser';
export type LaserCode = '1688' | '1687';
export type DeliveryPhase = 'idle' | 'approach' | 'flight' | 'hit' | 'miss';
export interface DeliveryPod { onTarget: boolean }
const APPROACH = LGB_TRAINING_TIMING.approach;
const FLIGHT = LGB_TRAINING_TIMING.flight;
const AUTO_WINDOW = LGB_TRAINING_TIMING.autoLaserLead;
export const REQUIRED_CONTINUOUS_LIGHT = LGB_TRAINING_TIMING.requiredIllumination;
const EPSILON = 1e-8;

export class LaserDeliverySession {
  armed = false;
  masterArm = false;
  trig = false;
  laserCode: LaserCode = '1688';
  bombCode: LaserCode | 'XXXX' = 'XXXX';
  phase: DeliveryPhase = 'idle';
  /** Seconds remaining in the current trainer phase. */
  timer = 0;
  done = [false, false, false];
  message = 'Set the bomb CODE and pod LTDC, then arm the LTD/R.';
  private triggerHeld = false;
  private triggerPulse = 0;
  private releaseHeld = false;
  private releasedCode: LaserCode | null = null;
  private continuousLight = 0;

  constructor(readonly lesson: DeliveryLesson, readonly troubleCase: TroubleCase = 'code') {
    if (lesson === 'laser') this.laserCode = '1687';
    if (lesson === 'troubleshoot') {
      this.bombCode = '1688'; this.armed = true; this.masterArm = true;
      if (troubleCase === 'code') this.laserCode = '1687';
      if (troubleCase === 'laser') this.armed = false;
      this.message = troubleCase === 'code' ? 'Check the bomb CODE against the pod LTDC.'
        : troubleCase === 'track' ? 'The pod is off the assigned truck. Recover the target before release.'
          : 'The LTD/R is SAFE. Restore laser emission before the final trainer window.';
    }
  }
  get complete(): boolean { return this.done.every(Boolean); }
  get cue(): 'REL' | 'LASER' | 'TTI' | null {
    return this.phase === 'approach' ? 'REL' : this.phase === 'flight' ? this.timer > AUTO_WINDOW ? 'LASER' : 'TTI' : null;
  }
  /** LASER counts to automatic lasing, TTI counts to the scripted impact. */
  get cueTime(): number { return this.cue === 'LASER' ? Math.max(0, this.timer - AUTO_WINDOW) : this.timer; }
  get laserOn(): boolean {
    return this.armed && (this.trig ? this.triggerHeld || this.triggerPulse > EPSILON
      : this.phase === 'flight' && this.timer <= AUTO_WINDOW + EPSILON && this.timer > EPSILON);
  }
  setLaserCode(code: LaserCode): void { this.laserCode = code; }
  setBombCode(code: LaserCode): void { this.bombCode = code; }
  setTrigger(held: boolean): void {
    if (held && !this.triggerHeld && this.armed && this.trig) this.triggerPulse = LGB_TRAINING_TIMING.triggerPulse;
    this.triggerHeld = held;
  }
  setRelease(held: boolean): void { this.releaseHeld = held; }
  startRun(): void {
    if (this.lesson === 'laser' || this.phase === 'approach' || this.phase === 'flight') return;
    this.phase = 'approach'; this.timer = APPROACH; this.continuousLight = 0; this.releasedCode = null;
    this.message = 'Scripted aligned AUTO run. Hold Weapon Release through REL zero.';
  }
  /** New training store, retaining the settings the learner corrected. */
  retry(): void {
    this.phase = 'idle'; this.timer = 0; this.triggerHeld = false; this.triggerPulse = 0;
    this.releaseHeld = false; this.releasedCode = null; this.continuousLight = 0;
    this.message = 'New training store ready. Check settings and start another run.';
  }
  step(dt: number, pod: DeliveryPod): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    // Split at phase, emission and pulse boundaries so results do not depend on frame rate.
    let remaining = dt;
    while (remaining > EPSILON) {
      let slice = remaining;
      if (this.phase === 'approach' || this.phase === 'flight') slice = Math.min(slice, this.timer);
      if (this.phase === 'flight' && this.timer > AUTO_WINDOW + EPSILON) slice = Math.min(slice, this.timer - AUTO_WINDOW);
      if (this.triggerPulse > EPSILON) slice = Math.min(slice, this.triggerPulse);
      const lit = this.laserOn;
      if (this.lesson === 'laser') {
        if (this.bombCode !== 'XXXX' && this.laserCode === this.bombCode) this.done[0] = true;
        if (this.done[0] && this.armed) this.done[1] = true;
        if (this.done[1] && this.trig && lit && pod.onTarget && this.laserCode === this.bombCode) {
          this.done[2] = true; this.message = 'Matching code and manual laser emission confirmed on the assigned truck.';
        }
      } else {
        if (this.bombCode !== 'XXXX' && this.laserCode === this.bombCode && this.armed && this.masterArm && pod.onTarget) this.done[0] = true;
        if (this.phase === 'flight') {
          if (lit && pod.onTarget && this.laserCode === this.releasedCode) this.continuousLight += slice;
          else this.continuousLight = 0;
        }
      }
      this.triggerPulse = Math.max(0, this.triggerPulse - slice);
      if (this.phase === 'approach' || this.phase === 'flight') this.timer = Math.max(0, this.timer - slice);
      remaining -= slice;
      if (this.timer <= EPSILON && this.phase === 'approach') {
        if (this.releaseHeld && this.masterArm && this.bombCode !== 'XXXX' && pod.onTarget) {
          this.releasedCode = this.bombCode; this.phase = 'flight'; this.timer = FLIGHT; this.done[1] = true;
          this.message = 'Store released. Keep the pod on the truck and check laser emission.';
        } else {
          this.phase = 'idle'; this.timer = 0;
          this.message = !this.masterArm ? 'No release: Master Arm is SAFE. Correct and start another run.'
            : this.bombCode === 'XXXX' ? 'No release: set the training bomb CODE.'
              : !pod.onTarget ? 'No release: recover the assigned target for this exercise.'
                : 'Release cue passed without consent. Hold Weapon Release through REL zero.';
        }
      } else if (this.timer <= EPSILON && this.phase === 'flight') {
        const hit = this.continuousLight + EPSILON >= REQUIRED_CONTINUOUS_LIGHT;
        this.phase = hit ? 'hit' : 'miss'; this.timer = 0;
        if (hit) this.done[2] = true;
        this.message = hit ? 'Training hit. Matching laser illumination held through the final 3 seconds.'
          : 'Training miss. Keep matching laser illumination on the truck for the final 3 seconds; reacquire earlier or retry.';
      }
    }
  }
}
