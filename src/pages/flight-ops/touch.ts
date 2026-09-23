/**
 * [OWNER: page-flight-ops] On-screen controls for Fly mode on phones and coarse pointers: a stick pad
 * (pitch and roll, springs back to centre), a throttle slider and the configuration buttons. Trainer
 * controls, not DCS bindings. Pointer events only; dispose() removes every listener.
 */
import { button, h, slider } from '../../ui';
import { clamp } from '../../sim/math';

export type TouchAction = 'gear' | 'flaps' | 'brake' | 'nav' | 'ab' | 'hook' | 'ball';

export interface TouchControlsOptions {
  /** Show the FLAPS button (jets with a flap selector). */
  flaps: boolean;
  /** Show the AB button (jets whose takeoff uses afterburner). */
  afterburner?: boolean;
  /** Wheel-brake key, shown on the BRAKES hold button. */
  brakesKey?: string;
  /** Nav mode button: title (the modes it cycles) and key; omit for jets without nav. */
  nav?: { title: string; key: string };
  /** HOOK and BALL buttons (jets that go to the boat): their keys. Shown on carrier starts (setCarrier). */
  carrier?: { hookKey: string; ballKey: string };
  onAction: (a: TouchAction) => void;
  onThrottle: (v: number) => void;
}

export interface TouchControlsHandle {
  el: HTMLElement;
  /** Stick deflection, −1..1: x = roll right +, y = pull (stick back, dragged down) +. */
  readonly stick: { x: number; y: number };
  readonly active: boolean;
  /** BRAKES button held (wheel brakes). */
  readonly wheelBrakes: boolean;
  setThrottle(v: number): void;
  /** Show the HOOK and BALL buttons (carrier starts only). */
  setCarrier(on: boolean): void;
  dispose(): void;
}

/** Stick deflection from a pointer position inside a pad (pure, for tests). */
export function stickFromPoint(px: number, py: number, rect: { left: number; top: number; width: number; height: number }): { x: number; y: number } {
  const r = Math.min(rect.width, rect.height) / 2 * 0.8;
  let x = (px - (rect.left + rect.width / 2)) / r;
  let y = (py - (rect.top + rect.height / 2)) / r;
  const m = Math.hypot(x, y);
  if (m > 1) { x /= m; y /= m; }
  return { x: clamp(x, -1, 1), y: clamp(y, -1, 1) };
}

export function touchControls(o: TouchControlsOptions): TouchControlsHandle {
  const stick = { x: 0, y: 0 };
  let pointer: number | null = null;
  const knob = h('div', { class: 'fo-stick__knob' });
  const pad = h('div', { class: 'fo-stick', role: 'img', 'aria-label': 'Stick: drag to roll and pitch; drag down to pull' }, knob);
  const show = () => { knob.style.transform = `translate(${stick.x * 40}%, ${stick.y * 40}%)`; };
  const move = (e: PointerEvent) => {
    if (e.pointerId !== pointer) return;
    const p = stickFromPoint(e.clientX, e.clientY, pad.getBoundingClientRect());
    stick.x = p.x; stick.y = p.y; show();
  };
  const down = (e: PointerEvent) => {
    if (pointer !== null) return;
    pointer = e.pointerId;
    try { pad.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
    pad.classList.add('is-held');
    move(e);
    e.preventDefault();
  };
  const up = (e: PointerEvent) => {
    if (e.pointerId !== pointer) return;
    pointer = null; stick.x = 0; stick.y = 0; show();
    pad.classList.remove('is-held');
  };
  pad.addEventListener('pointerdown', down);
  pad.addEventListener('pointermove', move);
  pad.addEventListener('pointerup', up);
  pad.addEventListener('pointercancel', up);
  pad.addEventListener('lostpointercapture', up);

  // Wheel brakes: held while the button is pressed.
  let wheel: number | null = null;
  const brakesBtn = button({ id: 'fo-touch-wheel', label: 'BRAKES', keys: o.brakesKey, title: 'Wheel brakes: hold' });
  const bEl = brakesBtn.el;
  bEl.style.touchAction = 'none';
  const bDown = (e: PointerEvent) => {
    if (wheel !== null) return;
    wheel = e.pointerId;
    try { bEl.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
    bEl.classList.add('is-held'); bEl.setAttribute('aria-pressed', 'true');
    e.preventDefault();
  };
  const bUp = (e: PointerEvent) => {
    if (e.pointerId !== wheel) return;
    wheel = null; bEl.classList.remove('is-held'); bEl.setAttribute('aria-pressed', 'false');
  };
  bEl.setAttribute('aria-pressed', 'false');
  bEl.addEventListener('pointerdown', bDown);
  bEl.addEventListener('pointerup', bUp);
  bEl.addEventListener('pointercancel', bUp);
  bEl.addEventListener('lostpointercapture', bUp);

  const thr = slider({
    id: 'fo-touch-thr', label: 'Throttle', min: 0, max: 100, step: 1, value: 60, unit: '%',
    onInput: v => o.onThrottle(v / 100), onChange: v => o.onThrottle(v / 100), class: 'fo-touch__thr',
  });
  const btns = [
    button({ id: 'fo-touch-gear', label: 'GEAR', onClick: () => o.onAction('gear') }),
    o.flaps ? button({ id: 'fo-touch-flaps', label: 'FLAPS', onClick: () => o.onAction('flaps') }) : null,
    brakesBtn,
    o.afterburner ? button({ id: 'fo-touch-ab', label: 'AB', title: 'Afterburner on or off', onClick: () => o.onAction('ab') }) : null,
    button({ id: 'fo-touch-brake', label: 'SPD BRK', title: 'Speed brake', onClick: () => o.onAction('brake') }),
    o.nav ? button({ id: 'fo-touch-nav', label: 'NAV', keys: o.nav.key, title: o.nav.title, onClick: () => o.onAction('nav') }) : null,
  ].filter(b => b !== null);
  const carrierBtns = o.carrier ? [
    button({ id: 'fo-touch-hook', label: 'HOOK', keys: o.carrier.hookKey, title: 'Tail hook up or down', onClick: () => o.onAction('hook') }),
    button({ id: 'fo-touch-ball', label: 'BALL', keys: o.carrier.ballKey, title: 'Call the ball', onClick: () => o.onAction('ball') }),
  ] : [];
  for (const b of carrierBtns) { b.el.hidden = true; btns.push(b); }
  const el = h('div', { class: 'fo-touch', id: 'fo-touch' },
    pad,
    h('div', { class: 'fo-touch__side' }, thr.el, h('div', { class: 'fo-touch__btns' }, btns.map(b => b.el))));

  return {
    el,
    stick,
    get active() { return pointer !== null; },
    get wheelBrakes() { return wheel !== null; },
    setThrottle(v) { if (document.activeElement !== thr.input) thr.set(Math.round(v * 100), false); },
    setCarrier(on) { for (const b of carrierBtns) b.el.hidden = !on; },
    dispose() {
      pad.removeEventListener('pointerdown', down);
      pad.removeEventListener('pointermove', move);
      pad.removeEventListener('pointerup', up);
      pad.removeEventListener('pointercancel', up);
      pad.removeEventListener('lostpointercapture', up);
      bEl.removeEventListener('pointerdown', bDown);
      bEl.removeEventListener('pointerup', bUp);
      bEl.removeEventListener('pointercancel', bUp);
      bEl.removeEventListener('lostpointercapture', bUp);
      el.remove();
    },
  };
}
