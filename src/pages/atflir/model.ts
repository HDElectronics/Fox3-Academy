/** Deterministic teaching abstraction, not sensor physics. */
import { type LessonId } from './lessons';
export type TrackMode = 'DESIGNATE' | 'INR' | 'SCENE' | 'AUTO' | 'VVSLV';
export const FOVS = ['WFOV', 'MFOV', 'NAR'] as const;
export const TARGETS = [
  { id: 'assigned', x: 140, y: -70, label: 'Single truck' },
  { id: 'wrong', x: -140, y: 30, label: 'Parked truck' },
] as const;
export type TargetId = typeof TARGETS[number]['id'];
export class AtflirSession {
  focused = false;
  mode: TrackMode = 'DESIGNATE';
  fov = 0;
  x = 0;
  y = 0;
  depressed = false;
  ir = true;
  whiteHot = true;
  tracked: TargetId | null = null;
  obscured = false;
  designation: { x: number; y: number } | null = { x: 0, y: 0 };
  done = [false, false, false];
  message = 'FLIR is on the right DDI. Use SCS Right to assign TDC.';
  constructor(readonly lesson: LessonId) {
    if (lesson === 'recover') {
      this.focused = true; this.mode = 'AUTO'; this.tracked = 'wrong'; this.x = -140; this.y = 30;
      this.designation = { x: this.x, y: this.y };
      this.message = 'Wrong truck tracked. AUTO inhibits ordinary slew; use Undesignate.';
    }
  }
  get target(): TargetId | null {
    return TARGETS.find(t => !(this.obscured && t.id === 'assigned') && Math.hypot(t.x - this.x, t.y - this.y) <= 6)?.id ?? null;
  }
  get complete(): boolean { return this.done.every(Boolean); }
  scs(): void {
    if (!this.focused) {
      this.focused = true; this.message = 'TDC assigned to FLIR. The next SCS Right changes track mode.';
      if (this.lesson === 'control' || this.lesson === 'find') this.done[0] = true;
      return;
    }
    if (this.depressed) { this.message = 'Release TDC depress before changing track mode.'; return; }
    if (this.mode === 'AUTO') {
      this.mode = 'DESIGNATE'; this.tracked = null;
      if (this.designation) { this.x = this.designation.x; this.y = this.designation.y; }
    } else if (this.mode === 'SCENE') {
      this.mode = 'AUTO'; this.tracked = this.target;
      if (this.tracked) this.designation = { x: this.x, y: this.y };
      if (this.tracked === 'assigned' && this.done[0] && this.done[1] && (this.lesson === 'track' || this.lesson === 'recover')) this.done[2] = true;
    } else {
      this.mode = 'SCENE'; this.tracked = null;
      this.designation = { x: this.x, y: this.y };
      if (this.lesson === 'track' && this.done[0] && this.target === 'assigned') this.done[1] = true;
    }
    this.message = this.mode === 'AUTO'
      ? this.tracked ? `AUTO acquired: ${TARGETS.find(t => t.id === this.tracked)!.label}.` : 'INR AUTO: no contrast target acquired. Undesignate, reposition and try again.'
      : `${this.mode}: ${this.mode === 'SCENE' ? 'image area tracked. SCS Right requests AUTO.' : 'line of sight slaved to the designation.'}`;
  }
  undesignate(): void {
    if (!this.focused) { this.message = 'Assign TDC to FLIR first.'; return; }
    this.mode = this.mode === 'INR' ? 'VVSLV' : 'INR';
    this.designation = null; this.tracked = null; this.depressed = false;
    if (this.mode === 'VVSLV') { this.x = 0; this.y = 0; }
    if (this.mode === 'INR') {
      if (this.lesson === 'control' && this.done[0]) this.done[1] = true;
      if (this.lesson === 'recover') this.done[0] = true;
    }
    this.message = this.mode === 'INR' ? 'INR. Slew to reposition the reticle.' : 'VVSLV. View reset to the synthetic flight-path centre.';
  }
  depress(value: boolean): void {
    this.depressed = value && this.focused && this.mode === 'DESIGNATE';
    if (value) this.message = this.depressed ? 'TDC depressed. Slewing now moves the designation.'
      : this.mode === 'AUTO' ? 'AUTO offset designation is outside this lesson. Undesignate to reposition.' : 'TDC depress is needed for slewing in designation mode only.';
  }
  slew(dx: number, dy: number): void {
    if (!this.focused) { this.message = 'No TDC control. Press SCS Right.'; return; }
    if (this.mode === 'AUTO') { this.message = 'AUTO inhibits ordinary slew. Undesignate to reposition.'; return; }
    if (this.mode === 'DESIGNATE' && !this.depressed) { this.message = 'Hold TDC depress to move the designation, or Undesignate for INR.'; return; }
    if (this.mode === 'VVSLV') this.mode = 'INR';
    this.x = Math.max(-300, Math.min(300, this.x + dx));
    this.y = Math.max(-220, Math.min(220, this.y + dy));
    if (this.mode === 'DESIGNATE' || this.mode === 'SCENE') this.designation = { x: this.x, y: this.y };
    if (this.lesson === 'control' && this.done[1] && (dx !== 0 || dy !== 0)) this.done[2] = true;
    if (this.target === 'assigned') {
      if (this.lesson === 'find' && this.done[0]) this.done[1] = true;
      if (this.lesson === 'recover' && this.done[0]) this.done[1] = true;
      if (this.lesson === 'track' && this.mode === 'DESIGNATE' && this.depressed) this.done[0] = true;
    }
    this.checkFind();
    this.message = this.mode === 'SCENE' ? 'INR SCENE while slewing; SCENE resumes on release.' : 'Slewing. Keep the assigned truck under the centre reticle.';
  }
  cycleFov(): void { this.fov = (this.fov + 1) % FOVS.length; this.checkFind(); this.message = `${FOVS[this.fov]}. Narrow views need smaller slew inputs.`; }
  private checkFind(): void {
    if (this.lesson === 'find' && this.done[1] && this.fov === 2 && this.target === 'assigned') this.done[2] = true;
  }
  loseTrack(): void {
    this.obscured = true;
    if (this.tracked === 'assigned') { this.tracked = null; this.message = 'Scripted obstruction: INR AUTO. Clear the obstruction, Undesignate, reposition and reacquire.'; }
  }
}
