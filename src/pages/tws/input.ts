/** Held trainer inputs. Release on pause, blur, reset and disposal; never accumulate paused commands. */
import type { KeyBinding } from '../../ui/keys';
import type { TwsLesson } from './drill';

export type LabInput = 'left' | 'right' | 'up' | 'down' | 'turnLeft' | 'turnRight' | 'climb' | 'descend';
export class FreeLabInput {
  private held = new Set<LabInput>();
  binding(action: LabInput): KeyBinding {
    return { down: () => { this.held.add(action); }, up: () => { this.held.delete(action); } };
  }
  clear(): void { this.held.clear(); }
  step(lesson: TwsLesson, dt: number, paused: boolean): void {
    if (paused || !lesson.freeLab) { this.clear(); return; }
    const axis = (pos: LabInput, neg: LabInput) => Number(this.held.has(pos)) - Number(this.held.has(neg));
    lesson.slewCursor(axis('right', 'left'), axis('up', 'down'), dt);
    lesson.steerInput(axis('turnRight', 'turnLeft'), axis('climb', 'descend'), dt);
  }
}

/** Wall-clock key holds are cancellable across resets, mode changes, pause, blur and unmount. */
export class LabTimers {
  private handles = new Map<string, ReturnType<typeof setTimeout>>();
  start(id: string, seconds: number, action: () => void): void {
    this.cancel(id);
    this.handles.set(id, setTimeout(() => { this.handles.delete(id); action(); }, seconds * 1000));
  }
  cancel(id: string): boolean {
    const timer = this.handles.get(id);
    if (timer === undefined) return false;
    clearTimeout(timer); this.handles.delete(id); return true;
  }
  clear(): void {
    for (const timer of this.handles.values()) clearTimeout(timer);
    this.handles.clear();
  }
}
