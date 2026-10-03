/**
 * [OWNER: page-harm displays] The Hornet UFC as DOM: scratchpad window on top, the five option windows on the right
 * (each window is its option select button, OPT1-OPT5 top to bottom, ':' in front when cued), and the keypad
 * 1-9, CLR, 0, ENT. Drawn from a UfcView; key presses go to `onKey`. Panel proportions are the trainer's layout;
 * the hint pulse is a trainer aid (steady with reduced motion, see cockpit.css).
 */
import { h, on, setText } from '../../ui/dom';
import type { UfcKey, UfcView } from './types';

const KEYPAD: UfcKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'CLR', '0', 'ENT'];
const OPTS: UfcKey[] = ['OPT1', 'OPT2', 'OPT3', 'OPT4', 'OPT5'];
const KEY_ARIA: Partial<Record<UfcKey, string>> = { CLR: 'UFC clear', ENT: 'UFC enter' };

export function createUfc(opts: { id: string; onKey: (k: UfcKey) => void }): { el: HTMLElement; draw(v: UfcView): void; dispose(): void } {
  const offs: (() => void)[] = [];
  const buttons = new Map<UfcKey, HTMLButtonElement>();
  const press = (k: UfcKey) => () => opts.onKey(k);

  const scratch = h('div', { class: 'harm-ufc__scratch', id: `${opts.id}-scratch`, role: 'status', 'aria-label': 'UFC scratchpad' });

  const optCue: HTMLElement[] = [];
  const optText: HTMLElement[] = [];
  const optRows = OPTS.map((k, i) => {
    const cue = h('span', { class: 'harm-ufc__cue', 'aria-hidden': 'true' });
    const text = h('span', { class: 'harm-ufc__opt-text' });
    optCue.push(cue);
    optText.push(text);
    const b = h('button', { type: 'button', class: 'harm-ufc__opt', 'aria-label': `UFC option ${i + 1}` }, cue, text);
    buttons.set(k, b);
    offs.push(on(b, 'click', press(k)));
    return b;
  });

  const keys = KEYPAD.map(k => {
    const b = h('button', { type: 'button', class: 'harm-ufc__key', 'aria-label': KEY_ARIA[k] ?? `UFC key ${k}` }, k);
    if (k === 'CLR' || k === 'ENT') b.classList.add('harm-ufc__key--fn');
    buttons.set(k, b);
    offs.push(on(b, 'click', press(k)));
    return b;
  });

  const el = h('div', { class: 'harm-ufc', id: opts.id, role: 'group', 'aria-label': 'Up-front controller' },
    scratch,
    h('div', { class: 'harm-ufc__body' },
      h('div', { class: 'harm-ufc__keypad' }, keys),
      h('div', { class: 'harm-ufc__opts' }, optRows)));

  let hint: UfcKey | null = null;
  return {
    el,
    draw(v) {
      setText(scratch, v.scratch);
      for (let i = 0; i < OPTS.length; i++) {
        const o = v.options[i];
        const t = o?.text ?? '';
        setText(optCue[i], o?.cued ? ':' : '');
        setText(optText[i], t);
        const b = buttons.get(OPTS[i])!;
        const label = `UFC option ${i + 1}${t ? `: ${t}` : ''}${o?.cued ? ', selected' : ''}`;
        if (b.getAttribute('aria-label') !== label) b.setAttribute('aria-label', label);
      }
      if (v.hint !== hint) {
        if (hint) buttons.get(hint)?.classList.remove('is-hint');
        hint = v.hint;
        if (hint) buttons.get(hint)?.classList.add('is-hint');
      }
    },
    dispose() {
      for (const f of offs.splice(0)) f();
      el.remove();
    },
  };
}
