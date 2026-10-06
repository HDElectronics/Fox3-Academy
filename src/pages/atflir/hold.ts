import type { Cleanup } from '../../ui';
/** Focused buttons keep hold semantics instead of the browser's click-on-keyup default. */
export function bindKeyboardHold(target: EventTarget, setHeld: (held: boolean) => void, clean: Cleanup): void {
  clean.on<KeyboardEvent>(target, 'keydown', e => {
    if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); if (!e.repeat) setHeld(true); }
  });
  clean.on<KeyboardEvent>(target, 'keyup', e => {
    if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); setHeld(false); }
  });
  clean.on(target, 'blur', () => setHeld(false));
}
