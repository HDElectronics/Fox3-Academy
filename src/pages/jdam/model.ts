/** Deterministic, page-local DCS workflow exercise. No weapon engineering simulation. */
import { JDAM_TIMING } from '../../data/fa18cJdam';
export type JdamLesson = 'setup' | 'delivery' | 'troubleshoot';
export type JdamTarget = 'assigned' | 'wrong' | null;
export type JdamPhase = 'idle' | 'approach' | 'flight' | 'hit' | 'miss';
export class JdamSession {
  masterArm = false;
  ag = false;
  efuz: 'OFF' | 'INST' = 'OFF';
  mode: 'PP' | 'TOO' = 'PP';
  designation: JdamTarget = null;
  phase: JdamPhase = 'idle';
  timer = 0;
  done = [false, false, false];
  message = 'Select A/G, J-82 and TOO. Selection starts the weapon warmup.';
  private powered = false;
  private warmup = JDAM_TIMING.warmup as number;
  private releaseHeld = false;
  private targetAtRelease: JdamTarget = null;
  constructor(readonly lesson: JdamLesson) {
    if (lesson === 'troubleshoot') {
      this.ag = true; this.masterArm = true; this.mode = 'TOO'; this.efuz = 'INST';
      this.powered = true; this.warmup = 0; this.designation = 'wrong';
      this.message = 'A valid designation can still be the wrong target. Check the TOO target before release.';
    }
  }
  get selected(): boolean { return this.powered; }
  set selected(value: boolean) { this.selectWeapon(value); }
  get warmupRemaining(): number { return this.warmup; }
  get alignmentClock(): number { return JDAM_TIMING.alignmentClock - JDAM_TIMING.warmup + this.warmup; }
  get timing(): boolean { return this.powered && this.warmup > 0; }
  get status(): 'OFF' | 'STBY' | 'RDY' {
    if (!this.powered) return 'OFF';
    return this.ag && this.masterArm && !this.timing && this.mode === 'TOO'
      && this.efuz === 'INST' && this.designation !== null ? 'RDY' : 'STBY';
  }
  get inRange(): boolean { return this.phase === 'approach' && this.timer === 0; }
  get releasedTarget(): JdamTarget { return this.targetAtRelease; }
  get complete(): boolean { return this.done.every(Boolean); }
  selectWeapon(selected: boolean): void {
    if (this.powered === selected) return;
    this.powered = selected;
    this.warmup = JDAM_TIMING.warmup;
  }
  skipWarmup(): void {
    if (!this.powered) { this.message = 'Select J-82 before skipping its warmup.'; return; }
    this.warmup = 0;
    this.message = 'Training shortcut: 2 minutes 30 seconds of weapon warmup completed.';
    this.checkSteps();
  }
  setRelease(held: boolean): void { this.releaseHeld = held; }
  startRun(): void {
    if (this.lesson === 'setup' || this.phase === 'approach' || this.phase === 'flight') return;
    if (this.phase === 'hit' || this.phase === 'miss') this.retry();
    this.phase = 'approach'; this.timer = JDAM_TIMING.approach;
    this.message = 'Scripted aligned MAN pass. Check the target and wait for IN RNG, then hold Weapon Release.';
  }
  retry(): void {
    this.phase = 'idle'; this.timer = 0; this.releaseHeld = false; this.targetAtRelease = null;
    this.message = 'Training reload: one GBU-38 is loaded again. Check the TOO target before starting another pass.';
  }
  private checkSteps(): void {
    if (this.lesson === 'setup') {
      if (this.ag && this.selected && this.mode === 'TOO') this.done[0] = true;
      if (this.done[0] && this.selected && !this.timing && this.efuz === 'INST') this.done[1] = true;
      if (this.done[1] && this.status === 'RDY' && this.designation === 'assigned') {
        this.done[2] = true; this.message = 'Setup complete. J-82 is ready with the assigned TOO target.';
      }
    } else if (this.status === 'RDY' && this.designation === 'assigned') this.done[0] = true;
  }
  step(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    let remaining = dt;
    while (remaining > 1e-8) {
      this.checkSteps();
      if (this.inRange && this.releaseHeld) {
        if (this.status === 'RDY') {
          this.targetAtRelease = this.designation;
          this.phase = 'flight'; this.timer = JDAM_TIMING.flight; if (this.targetAtRelease === 'assigned') this.done[1] = true;
          this.message = 'J-82 released. Its target is fixed for this exercise; no laser is needed.';
        } else {
          this.message = this.timing ? 'No release: TIMING. Wait for warmup or use the training shortcut.'
            : this.designation === null ? 'No release: create a TOO target designation.'
              : 'No release: check A/G, J-82, TOO, EFUZ INST and Master Arm ARM.';
        }
      }
      let slice = remaining;
      if (this.timing) slice = Math.min(slice, this.warmup);
      if ((this.phase === 'approach' || this.phase === 'flight') && this.timer > 0) slice = Math.min(slice, this.timer);
      if (this.powered) this.warmup = Math.max(0, this.warmup - slice);
      if (this.phase === 'approach' || this.phase === 'flight') this.timer = Math.max(0, this.timer - slice);
      remaining -= slice;
      if (this.phase === 'flight' && this.timer === 0) {
        const hit = this.targetAtRelease === 'assigned';
        this.phase = hit ? 'hit' : 'miss';
        if (hit) this.done[2] = true;
        this.message = hit ? 'Training hit on the assigned target. No laser support was required.'
          : 'The bomb reached the wrong designated target. Correct TOO before releasing the next store.';
      }
    }
    this.checkSteps();
  }
}

/** MANUAL HUD range status: only the sourced TMR / IN RNG cues; blank otherwise. */
export function manualHudCue(session: JdamSession): string {
  if (session.inRange) return 'IN RNG';
  return session.phase === 'approach' ? `TMR ${Math.ceil(session.timer)}` : '';
}

/** STORES pushbuttons used by the lesson. Returns whether the EFUZ submenu stays open.
 * PB6 inside the submenu only closes it, so a misclick cannot deselect J-82 and restart the warmup. */
export function pressStoresOsb(session: JdamSession, osb: 3 | 5 | 6, fuzeMenu: boolean): boolean {
  if (osb === 6) {
    if (!fuzeMenu) session.selectWeapon(!session.selected);
    return false;
  }
  if (fuzeMenu) { session.efuz = osb === 5 ? 'OFF' : 'INST'; return false; }
  if (osb === 5) { session.mode = session.mode === 'TOO' ? 'PP' : 'TOO'; return false; }
  return true;
}
