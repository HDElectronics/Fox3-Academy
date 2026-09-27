import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommsMenuNode } from '../data/types';
import { radioMenu, radioMenuKey, radioMenuKeys, radioMenuRows, type RadioMenuHandle } from './radioMenu';

// ---- minimal DOM (tests run in node) ------------------------------------------------------------

type Listener = (e: FakeEvent) => void;
interface FakeEvent { type: string; target: FakeEl; key?: string; defaultPrevented: boolean; preventDefault(): void; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean }
let listenerCount = 0;
const doc = { activeElement: null as FakeEl | null };

class FakeText { nodeType = 3; parentElement: FakeEl | null = null; constructor(public data: string) {} get textContent() { return this.data; } remove() { this.parentElement?.detach(this); } }
class FakeEl {
  nodeType = 1; namespaceURI = 'http://www.w3.org/1999/xhtml'; tagName: string;
  childNodes: (FakeEl | FakeText)[] = []; parentElement: FakeEl | null = null;
  attrs = new Map<string, string>(); dataset: Record<string, string> = {}; style: Record<string, string> = {};
  hidden = false; className = ''; listeners = new Map<string, Set<Listener>>();
  constructor(tag: string) { this.tagName = tag.toUpperCase(); }
  get children() { return this.childNodes.filter((c): c is FakeEl => c instanceof FakeEl); }
  get lastElementChild() { const c = this.children; return c[c.length - 1] ?? null; }
  get classList() {
    const set = () => new Set(this.className.split(/\s+/).filter(Boolean));
    return {
      contains: (c: string) => set().has(c),
      toggle: (c: string, on?: boolean) => { const s = set(); const v = on ?? !s.has(c); if (v) s.add(c); else s.delete(c); this.className = [...s].join(' '); return v; },
    };
  }
  get textContent(): string { return this.childNodes.map(c => c.textContent).join(''); }
  set textContent(s: string) { this.replaceChildren(new FakeText(s)); }
  setAttribute(k: string, v: string) { this.attrs.set(k, String(v)); }
  getAttribute(k: string) { return this.attrs.get(k) ?? null; }
  hasAttribute(k: string) { return this.attrs.has(k); }
  removeAttribute(k: string) { this.attrs.delete(k); }
  addEventListener(t: string, fn: Listener) { if (!this.listeners.has(t)) this.listeners.set(t, new Set()); const s = this.listeners.get(t)!; if (!s.has(fn)) { s.add(fn); listenerCount++; } }
  removeEventListener(t: string, fn: Listener) { if (this.listeners.get(t)?.delete(fn)) listenerCount--; }
  appendChild(c: FakeEl | FakeText) { c.parentElement?.detach(c); c.parentElement = this; this.childNodes.push(c); return c; }
  prepend(c: FakeEl | FakeText) { c.parentElement?.detach(c); c.parentElement = this; this.childNodes.unshift(c); }
  replaceChildren(...cs: (FakeEl | FakeText)[]) { for (const c of this.childNodes) c.parentElement = null; this.childNodes = []; for (const c of cs) this.appendChild(c); }
  detach(c: FakeEl | FakeText) { this.childNodes = this.childNodes.filter(x => x !== c); c.parentElement = null; }
  remove() { this.parentElement?.detach(this); }
  contains(n: FakeEl | null): boolean { for (let p = n; p; p = p.parentElement) if (p === this) return true; return false; }
  focus() { doc.activeElement = this; }
}
function dispatch(target: FakeEl, type: string, init: Partial<FakeEvent> = {}): FakeEvent {
  const e: FakeEvent = { type, target, defaultPrevented: false, preventDefault() { e.defaultPrevented = true; }, ...init };
  for (let n: FakeEl | null = target; n; n = n.parentElement) for (const fn of [...(n.listeners.get(type) ?? [])]) fn(e);
  return e;
}
const all = (root: FakeEl): FakeEl[] => [root, ...root.children.flatMap(all)];
const byClass = (root: FakeEl, c: string) => all(root).filter(e => e.className.split(' ').includes(c));

beforeEach(() => {
  listenerCount = 0; doc.activeElement = null;
  vi.stubGlobal('document', {
    createElement: (t: string) => new FakeEl(t),
    createTextNode: (s: string) => new FakeText(s),
    get activeElement() { return doc.activeElement; },
  });
});
afterEach(() => vi.unstubAllGlobals());

// ---- fixtures -----------------------------------------------------------------------------------

function tree(state = { checkedIn: false }): CommsMenuNode[] {
  return [
    { label: 'Wingman', children: [{ label: 'Attack my target', action: 'wing-attack' }] },
    { label: 'Flight', children: [] },
    { label: 'JTACs', fkey: 4, children: [
      { label: 'Axeman 11', children: state.checkedIn
        ? [{ label: 'Ready to copy', action: 'ready' }, { label: 'Repeat brief', action: 'repeat', unverified: true }]
        : [{ label: 'Check-in 15 min', action: 'checkin', unverified: true }] },
    ] },
    { label: 'ATCs', fkey: 5, disabled: true, children: [] },
    { label: 'Other', fkey: 10, children: [{ label: 'JTAC status', action: 'status' }] },
  ];
}

function make(state = { checkedIn: false }) {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  const menu = radioMenu({ id: 'radio', root: () => tree(state), onSelect, onClose });
  return { menu, onSelect, onClose, el: menu.el as unknown as FakeEl, state };
}
const rowText = (m: RadioMenuHandle) => byClass(m.el as unknown as FakeEl, 'ui-radio__item').map(b => b.textContent);
const title = (m: RadioMenuHandle) => byClass(m.el as unknown as FakeEl, 'ui-radio__title')[0].textContent;

// ---- tests --------------------------------------------------------------------------------------

describe('radioMenuRows and radioMenuKey', () => {
  it('numbers by position, honours pinned F-keys, adds F11 back in submenus and F12 Exit', () => {
    const root = radioMenuRows(tree(), true);
    expect(root.map(r => `F${r.n} ${r.label}`)).toEqual(['F1 Wingman...', 'F2 Flight...', 'F4 JTACs...', 'F5 ATCs...', 'F10 Other...', 'F12 Exit']);
    const sub = radioMenuRows([{ label: 'Ready to copy', action: 'x' }], false);
    expect(sub.map(r => [r.n, r.kind])).toEqual([[1, 'item'], [11, 'back'], [12, 'exit']]);
    expect(sub[1].unverified).toBe(true);
    const pinned = radioMenuRows([{ label: 'Custom', fkey: 12, action: 'c' }], false);
    expect(pinned.filter(r => r.n === 12).map(r => r.kind)).toEqual(['item']);
  });

  it('parses the chords it cares about and ignores modified ones', () => {
    expect(radioMenuKey('\\')).toBe('toggle');
    expect(radioMenuKey('Escape')).toBe('esc');
    expect(radioMenuKey('F4')).toBe(4);
    expect(radioMenuKey('4')).toBe(4);
    expect(radioMenuKey('Num4')).toBe(4);
    expect(radioMenuKey('0')).toBe(10);
    expect(radioMenuKey('F13')).toBeNull();
    expect(radioMenuKey('RAlt+4')).toBeNull();
    expect(radioMenuKey('A')).toBeNull();
  });
});

describe('radioMenu', () => {
  it('opens and closes with backslash and ignores menu keys while closed', () => {
    const { menu, onClose, el } = make();
    expect(el.hidden).toBe(true);
    expect(menu.handleKey('F4')).toBe(false);
    expect(menu.handleKey('1')).toBe(false);
    expect(menu.handleKey('Esc')).toBe(false);
    expect(menu.handleKey('\\')).toBe(true);
    expect(menu.isOpen()).toBe(true);
    expect(el.hidden).toBe(false);
    expect(title(menu)).toBe('Radio menu');
    expect(rowText(menu)[0]).toBe('F1.Wingman...');
    expect(menu.toggleEl.getAttribute('aria-expanded')).toBe('true');
    expect(menu.handleKey('\\')).toBe(true);
    expect(menu.isOpen()).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('descends with pinned F4, goes back with F11, exits with F12 and Escape', () => {
    const { menu } = make();
    menu.open();
    expect(menu.handleKey('F4')).toBe(true);
    expect(menu.path()).toEqual(['JTACs']);
    expect(title(menu)).toBe('JTACs');
    expect(rowText(menu)).toEqual(['F1.Axeman 11...', 'F11.Previous menunot verified', 'F12.Exit']);
    menu.handleKey('F1');
    expect(menu.path()).toEqual(['JTACs', 'Axeman 11']);
    menu.handleKey('F11');
    expect(menu.path()).toEqual(['JTACs']);
    menu.handleKey('F11');
    expect(menu.path()).toEqual([]);
    menu.handleKey('F11'); // on the root list: consumed, nothing happens
    expect(menu.isOpen()).toBe(true);
    menu.handleKey('F10');
    expect(menu.path()).toEqual(['Other']);
    menu.handleKey('F12');
    expect(menu.isOpen()).toBe(false);
    menu.open(); menu.handleKey('4');
    expect(menu.handleKey('Escape')).toBe(true);
    expect(menu.isOpen()).toBe(false);
    menu.open();
    expect(menu.path()).toEqual([]); // reopens on the root list
  });

  it('selects a leaf with digit aliases, calls onSelect with the path and closes', () => {
    const { menu, onSelect } = make();
    menu.handleKey('\\');
    menu.handleKey('4'); menu.handleKey('1'); menu.handleKey('1');
    expect(onSelect).toHaveBeenCalledWith('checkin', ['JTACs', 'Axeman 11', 'Check-in 15 min']);
    expect(menu.isOpen()).toBe(false);
    menu.handleKey('\\'); menu.handleKey('0'); menu.handleKey('Num1');
    expect(onSelect).toHaveBeenLastCalledWith('status', ['Other', 'JTAC status']);
  });

  it('ignores disabled items and empty numbers but still consumes the key while open', () => {
    const { menu, onSelect } = make();
    menu.open();
    expect(menu.handleKey('F5')).toBe(true);
    expect(menu.path()).toEqual([]);
    expect(menu.handleKey('F7')).toBe(true);
    expect(menu.isOpen()).toBe(true);
    expect(onSelect).not.toHaveBeenCalled();
    const atc = byClass(menu.el as unknown as FakeEl, 'ui-radio__item').find(b => b.dataset.fkey === '5')!;
    expect(atc.getAttribute('aria-disabled')).toBe('true');
    expect(atc.getAttribute('role')).toBe('menuitem');
    dispatch(atc, 'click');
    expect(menu.path()).toEqual([]);
  });

  it('refresh() picks up new items and keeps the open submenu', () => {
    const { menu, state } = make();
    menu.open(); menu.handleKey('F4'); menu.handleKey('F1');
    expect(rowText(menu)[0]).toBe('F1.Check-in 15 minnot verified');
    state.checkedIn = true;
    menu.refresh();
    expect(menu.path()).toEqual(['JTACs', 'Axeman 11']);
    expect(rowText(menu).slice(0, 2)).toEqual(['F1.Ready to copy', 'F2.Repeat briefnot verified']);
    expect(byClass(menu.el as unknown as FakeEl, 'ui-radio__nv').map(e => e.textContent)).toContain('not verified');
  });

  it('works by pointer: row clicks select, the toggle opens and focuses the first item', () => {
    const { menu, onSelect } = make();
    const toggle = menu.toggleEl as unknown as FakeEl;
    dispatch(toggle, 'click');
    expect(menu.isOpen()).toBe(true);
    const items = byClass(menu.el as unknown as FakeEl, 'ui-radio__item');
    expect(doc.activeElement).toBe(items[0]);
    const jtacs = items.find(b => b.dataset.fkey === '4')!;
    dispatch(jtacs.children[1], 'click'); // the label span inside the row
    expect(menu.path()).toEqual(['JTACs']);
    const esc = dispatch(byClass(menu.el as unknown as FakeEl, 'ui-radio__item')[0], 'keydown', { key: 'Escape' });
    expect(esc.defaultPrevented).toBe(true);
    expect(menu.isOpen()).toBe(false);
    expect(doc.activeElement).toBe(toggle); // focus returns to the toggle
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('destroy() removes every listener it added', () => {
    const { menu } = make();
    expect(listenerCount).toBeGreaterThan(0);
    menu.destroy();
    expect(listenerCount).toBe(0);
    expect(menu.isOpen()).toBe(false);
  });
});

describe('radioMenuKeys', () => {
  function ev() {
    const e = { defaultPrevented: false, preventDefault() { e.defaultPrevented = true; } };
    return e as unknown as KeyboardEvent;
  }
  const down = (map: ReturnType<typeof radioMenuKeys>, k: string, e: KeyboardEvent) => {
    const b = map[k];
    if (typeof b === 'function') b(e); else b.down?.(e);
  };

  it('forwards to the menu, prevents the browser default only when consumed, falls back when closed', () => {
    const { menu } = make();
    const weapon = vi.fn();
    const map = radioMenuKeys(menu, { fallback: { '1': weapon } });
    expect(Object.keys(map)).toEqual(expect.arrayContaining(['\\', 'Esc', 'F1', 'F12', '0', '9', 'Num0']));
    for (const b of Object.values(map)) expect(typeof b === 'object' && b.preventDefault).toBe(false);
    let e = ev(); down(map, 'F5', e);
    expect(e.defaultPrevented).toBe(false); // closed: F5 still reloads
    e = ev(); down(map, '1', e);
    expect(weapon).toHaveBeenCalledTimes(1);
    e = ev(); down(map, '\\', e);
    expect(e.defaultPrevented).toBe(true);
    e = ev(); down(map, '1', e);
    expect(e.defaultPrevented).toBe(true);
    expect(weapon).toHaveBeenCalledTimes(1);
    expect(menu.path()).toEqual(['Wingman']);
  });

  it('enabled guard turns the whole set off', () => {
    const { menu } = make();
    let on = false;
    const map = radioMenuKeys(menu, { enabled: () => on });
    down(map, '\\', ev());
    expect(menu.isOpen()).toBe(false);
    on = true;
    down(map, '\\', ev());
    expect(menu.isOpen()).toBe(true);
  });
});
