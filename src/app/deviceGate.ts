/**
 * Desktop-only gate. Fox3 Academy flies the jet with a keyboard beside a 3D view, cockpit displays and a lesson
 * console; on a phone those cannot share the screen, so phones get a short panel instead of the app. Tablets,
 * touchscreen laptops and narrow desktop windows are not phones and keep the full app (its layouts still adapt).
 */
import { h } from '../ui/dom';

/** Shorter screen side (CSS px) below which a touch-only device counts as a phone (phones are about 320–480). */
export const PHONE_MAX_SHORT_SIDE = 600;

export interface DeviceInfo {
  /** Primary input is touch with no hover (no mouse or trackpad): `(pointer: coarse) and (hover: none)`. */
  touchOnly: boolean;
  screenWidth: number;
  screenHeight: number;
}

/** A phone: touch-only and a short screen side under PHONE_MAX_SHORT_SIDE, in portrait or landscape. */
export function isPhone(d: DeviceInfo): boolean {
  return d.touchOnly && Math.min(d.screenWidth, d.screenHeight) < PHONE_MAX_SHORT_SIDE;
}

/** Read the current device (browser only). */
export function currentDevice(win: Window = window): DeviceInfo {
  return {
    touchOnly: win.matchMedia?.('(pointer: coarse) and (hover: none)').matches ?? false,
    screenWidth: win.screen?.width ?? win.innerWidth,
    screenHeight: win.screen?.height ?? win.innerHeight,
  };
}

/** The panel phones see instead of the app, with the link to open on a computer. */
export function phoneGatePanel(url: string = location.href): HTMLElement {
  const status = h('p', { class: 'phone-gate__status', role: 'status', 'aria-live': 'polite' });
  const copy = h('button', {
    type: 'button', class: 'ui-btn ui-btn--primary', onclick: async () => {
      try { await navigator.clipboard.writeText(url); status.textContent = 'Link copied. Open it on your computer.'; }
      catch { status.textContent = url; }
    },
  }, 'Copy link');
  return h('main', { class: 'phone-gate' },
    h('div', { class: 'ui-console' },
      h('h1', { class: 'phone-gate__title' }, 'Fox3 Academy'),
      h('p', { class: 'phone-gate__lead' }, 'Open Fox3 Academy on a computer.'),
      h('p', null, 'The lessons fly the jet with a keyboard next to a 3D view, the cockpit displays and the lesson steps. A phone screen cannot show them together, so the app runs on desktop and laptop browsers, like DCS.'),
      copy, status));
}
