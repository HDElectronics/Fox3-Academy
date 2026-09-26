/**
 * DCS-style radio (comms) menu: the compact text list the game draws top-left when you press `\`.
 *
 *   const menu = radioMenu({ id: 'cas-radio', root: () => buildMenu(jtac), onSelect: (action) => jtac.call(action) });
 *   lab.overlay('tl', menu.el); console.append(menu.toggleEl);
 *   bag.add(bindKeys({ ...radioMenuKeys(menu), 'RAlt+I': ... }));
 *   bag.add(menu.destroy);
 *
 * Game-level behaviour only (docs/research/cas-jtac.md, sections 1 and 4): `\` opens the root list,
 * F-keys pick items by number, a submenu opens in place, sending a message closes the menu, F12 Exit
 * and Esc close it. The widget never binds keys itself: the page routes chords through handleKey()
 * (or spreads radioMenuKeys(menu) into its single bindKeys map). Digits 1..9, 0 alias F1..F10
 * because browsers reserve some F-keys (F5 reload, F11 full screen, F12 developer tools, F1 help).
 */
import type { CommsMenuNode } from '../data/types';
import { h, cleanup, setAttr, cx } from './dom';
import { parseChord, type KeyHandler, type KeyMap } from './keys';
import { button } from './controls';

export interface RadioMenuOptions {
  id: string;
  /** Title of the root list (default 'Radio menu', a trainer label: the in-game root title is not verified). Submenus show their own label. */
  title?: string;
  /** Called on every render, so the page can rebuild items as the JTAC state changes. */
  root: () => CommsMenuNode[];
  /** A leaf was sent. `path` = labels from the root list to the leaf. The menu is already closed. */
  onSelect(action: string, path: string[]): void;
  onClose?(): void;
}

export interface RadioMenuHandle {
  /** The menu panel (hidden while closed). Place it over the 3D view, e.g. lab.overlay('tl', menu.el). */
  el: HTMLDivElement;
  /** A "Radio \" push-button that opens and closes the menu for touch users. Place it anywhere. */
  toggleEl: HTMLButtonElement;
  /** Open the root list. `focus: true` moves keyboard focus to the first item (the toggle does this). */
  open(opts?: { focus?: boolean }): void;
  close(): void;
  toggle(opts?: { focus?: boolean }): void;
  isOpen(): boolean;
  /** Up one level (F11). No-op on the root list. */
  back(): void;
  /** Labels of the open submenus, root first ([] on the root list or when closed). */
  path(): string[];
  /** Re-read root() and redraw; keeps the open submenu when its label still exists. */
  refresh(): void;
  /** Act on the item with this F-number in the open list, as a click would. False when nothing matched. */
  select(fkey: number): boolean;
  /** Route one chord ('\\', 'F4', '4', 'Esc', 'Num4'). True when the menu consumed it. */
  handleKey(chord: string): boolean;
  destroy(): void;
}

/** One row of the list as the widget draws it. Exported for tests and custom renderers. */
export interface RadioMenuRow {
  /** F-key number (1..12). */
  n: number;
  /** Text after "Fn. ": submenus end with '...'. */
  label: string;
  kind: 'item' | 'back' | 'exit';
  node?: CommsMenuNode;
  submenu: boolean;
  disabled: boolean;
  unverified: boolean;
}

const SUB_SUFFIX = /(\.\.\.|…)$/;

/**
 * Rows for one list: items numbered by position from F1 unless `fkey` pins them, sorted by number.
 * Adds F11 "Previous menu" in submenus and F12 "Exit" unless an item already uses those numbers.
 * The F12 Exit row is in the A-10C II manual; the F11 wording is not verified.
 */
export function radioMenuRows(nodes: readonly CommsMenuNode[], atRoot: boolean): RadioMenuRow[] {
  const rows: RadioMenuRow[] = [];
  const used = new Set<number>();
  nodes.forEach((node, i) => {
    const n = node.fkey ?? i + 1;
    if (used.has(n)) return;
    used.add(n);
    const submenu = !!node.children;
    rows.push({
      n, kind: 'item', node, submenu,
      label: submenu && !SUB_SUFFIX.test(node.label) ? node.label + '...' : node.label,
      disabled: !!node.disabled || (!submenu && !node.action),
      unverified: !!node.unverified,
    });
  });
  if (!atRoot && !used.has(11)) rows.push({ n: 11, label: 'Previous menu', kind: 'back', submenu: false, disabled: false, unverified: true });
  if (!used.has(12)) rows.push({ n: 12, label: 'Exit', kind: 'exit', submenu: false, disabled: false, unverified: false });
  return rows.sort((a, b) => a.n - b.n);
}

/** What a chord means to the menu: an F-number, toggle, escape, or nothing. Modified chords mean nothing. */
export function radioMenuKey(chord: string): number | 'toggle' | 'esc' | null {
  const c = parseChord(chord);
  if (!c || c.mods.length) return null;
  if (c.key === '\\') return 'toggle';
  if (c.key === 'Esc') return 'esc';
  const f = /^F(\d+)$/.exec(c.key);
  if (f) { const n = Number(f[1]); return n >= 1 && n <= 12 ? n : null; }
  const d = /^(?:Num)?(\d)$/.exec(c.key);
  if (d) return d[1] === '0' ? 10 : Number(d[1]);
  return null;
}

const stripSuffix = (s: string) => s.replace(SUB_SUFFIX, '');

export function radioMenu(o: RadioMenuOptions): RadioMenuHandle {
  const bag = cleanup();
  const rootTitle = o.title ?? 'Radio menu';
  let openState = false;
  let stack: string[] = [];
  let rows: RadioMenuRow[] = [];
  let items: HTMLButtonElement[] = [];

  const titleId = o.id + '-title';
  const listId = o.id + '-list';
  const title = h('div', { class: 'ui-radio__title', id: titleId });
  const list = h('div', { class: 'ui-radio__list', id: listId, role: 'menu', 'aria-labelledby': titleId });
  // One polite line: announces open / submenu / close, not every redraw.
  const status = h('span', { class: 'ui-sr', 'aria-live': 'polite' });
  const el = h('div', { class: 'ui-radio', id: o.id }, title, list, status);
  el.hidden = true;

  const tb = button({ label: 'Radio', keys: '\\', size: 's', keepCase: true, class: 'ui-radio-toggle', title: 'Radio menu (\\)' });
  const toggleEl = tb.el;
  toggleEl.setAttribute('aria-controls', o.id);
  toggleEl.setAttribute('aria-expanded', 'false');
  toggleEl.setAttribute('aria-haspopup', 'menu');

  /** Walk root() along the stack; drop levels whose label no longer exists. */
  function level(): CommsMenuNode[] {
    let nodes = o.root();
    const kept: string[] = [];
    for (const label of stack) {
      const next = nodes.find(n => n.label === label && n.children);
      if (!next?.children) break;
      kept.push(label);
      nodes = next.children;
    }
    stack = kept;
    return nodes;
  }

  function focusInside(): boolean {
    const a = typeof document !== 'undefined' ? document.activeElement : null;
    return !!a && el.contains(a);
  }

  function render(focusFirst = false) {
    if (!openState) return;
    const refocus = focusFirst || focusInside();
    const nodes = level();
    rows = radioMenuRows(nodes, stack.length === 0);
    title.textContent = stack.length ? stripSuffix(stack[stack.length - 1]) : rootTitle;
    items = rows.map(r => h('button', {
      type: 'button', role: 'menuitem', tabindex: '-1',
      class: cx('ui-radio__item', r.disabled && 'is-disabled', r.kind !== 'item' && 'is-nav'),
      'aria-disabled': r.disabled ? 'true' : undefined,
      'aria-haspopup': r.submenu ? 'menu' : undefined,
      'aria-keyshortcuts': 'F' + r.n,
      dataset: { fkey: String(r.n) },
    },
    h('span', { class: 'ui-radio__key' }, 'F' + r.n + '.'),
    h('span', { class: 'ui-radio__label' }, r.label),
    r.unverified ? h('span', { class: 'ui-radio__nv' }, 'not verified') : null));
    list.replaceChildren(...items);
    const first = items[rows.findIndex(r => !r.disabled)] ?? items[0];
    if (first) first.setAttribute('tabindex', '0');
    if (refocus) first?.focus();
  }

  function announce(text: string) { status.textContent = text; }

  const handle: RadioMenuHandle = {
    el, toggleEl,
    open(opts = {}) {
      if (openState) { if (opts.focus) render(true); return; }
      openState = true; stack = [];
      el.hidden = false;
      setAttr(toggleEl, 'aria-expanded', 'true');
      tb.setLit(true);
      render(!!opts.focus);
      announce('Radio menu open');
    },
    close() {
      if (!openState) return;
      const hadFocus = focusInside();
      openState = false; stack = [];
      el.hidden = true;
      list.replaceChildren(); items = []; rows = [];
      setAttr(toggleEl, 'aria-expanded', 'false');
      tb.setLit(false);
      announce('Radio menu closed');
      if (hadFocus) toggleEl.focus();
      o.onClose?.();
    },
    toggle(opts) { if (openState) handle.close(); else handle.open(opts); },
    isOpen: () => openState,
    back() {
      if (!openState || !stack.length) return;
      stack.pop();
      render();
      announce(stack.length ? stripSuffix(stack[stack.length - 1]) : rootTitle);
    },
    path: () => (openState ? [...stack] : []),
    refresh() { render(); },
    select(n) {
      if (!openState) return false;
      const r = rows.find(x => x.n === n);
      if (!r || r.disabled) return false;
      if (r.kind === 'back') { handle.back(); return true; }
      if (r.kind === 'exit') { handle.close(); return true; }
      const node = r.node!;
      if (node.children) {
        stack.push(node.label);
        render();
        announce(stripSuffix(node.label));
        return true;
      }
      const path = [...stack, node.label];
      handle.close();
      o.onSelect(node.action!, path);
      return true;
    },
    handleKey(chord) {
      const k = radioMenuKey(chord);
      if (k === null) return false;
      if (k === 'toggle') { handle.toggle(); return true; }
      if (!openState) return false;
      if (k === 'esc') { handle.close(); return true; }
      // While open the menu owns F1..F12 and the digit aliases, even for empty numbers, as in DCS.
      handle.select(k);
      return true;
    },
    destroy() {
      bag.dispose();
      openState = false; stack = []; rows = []; items = [];
      el.remove(); toggleEl.remove();
    },
  };

  // Pointer / touch: one delegated listener for every row.
  bag.on<MouseEvent>(list, 'click', e => {
    let n = e.target as HTMLElement | null;
    while (n && n !== list) {
      const f = n.dataset?.fkey;
      if (f) { handle.select(Number(f)); return; }
      n = n.parentElement;
    }
  });
  // Keyboard inside the list: arrows move focus, Esc closes, Left / Backspace go back.
  bag.on<KeyboardEvent>(el, 'keydown', e => {
    if (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;
    const i = items.indexOf(e.target as HTMLButtonElement);
    const move = (to: number) => {
      if (!items.length) return;
      const j = (to + items.length) % items.length;
      items.forEach((b, k) => b.setAttribute('tabindex', k === j ? '0' : '-1'));
      items[j].focus();
    };
    switch (e.key) {
      case 'ArrowDown': move(i + 1); break;
      case 'ArrowUp': move(i < 0 ? items.length - 1 : i - 1); break;
      case 'Home': move(0); break;
      case 'End': move(items.length - 1); break;
      case 'Escape': handle.close(); break;
      case 'ArrowLeft': case 'Backspace': if (!stack.length) return; handle.back(); break;
      default: return;
    }
    e.preventDefault();
  });
  bag.on(toggleEl, 'click', () => handle.toggle({ focus: true }));

  return handle;
}

/** Chords radioMenuKeys binds, in bindKeys spelling. */
export const RADIO_MENU_CHORDS: readonly string[] = [
  '\\', 'Esc',
  ...Array.from({ length: 12 }, (_, i) => 'F' + (i + 1)),
  ...Array.from({ length: 10 }, (_, i) => String(i)),
  ...Array.from({ length: 10 }, (_, i) => 'Num' + i),
];

/**
 * A KeyMap to spread into the page's single bindKeys map. Each chord goes to menu.handleKey(); when
 * the menu does not consume it (closed, or a chord it ignores) the page's own handler for that chord
 * in `fallback` runs instead, and the browser default is left alone (F5 still reloads when closed).
 *   bindKeys({ ...radioMenuKeys(menu, { fallback: { '1': () => pickWeapon(1) } }), 'RAlt+I': ... })
 * Do not bind these chords elsewhere in the same map: put them in `fallback`.
 * `enabled` (default always) turns the whole set off, e.g. while a lesson hides the radio.
 */
export function radioMenuKeys(menu: Pick<RadioMenuHandle, 'handleKey'>, opts: { fallback?: Record<string, KeyHandler>; enabled?: () => boolean } = {}): KeyMap {
  const fallback = new Map<string, KeyHandler>();
  for (const [k, fn] of Object.entries(opts.fallback ?? {})) {
    const c = parseChord(k);
    if (c) fallback.set(c.text, fn);
  }
  const map: KeyMap = {};
  for (const chord of RADIO_MENU_CHORDS) {
    const text = parseChord(chord)!.text;
    map[chord] = {
      preventDefault: false,
      down: e => {
        if ((!opts.enabled || opts.enabled()) && menu.handleKey(chord)) { e.preventDefault(); return; }
        fallback.get(text)?.(e);
      },
    };
  }
  return map;
}
