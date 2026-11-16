/**
 * Pointer versus keyboard focus with real controls: segmented() and tabs() built on a small fake DOM that
 * dispatches events through capture and bubble phases and moves focus like Chrome (a removed cap drops focus
 * silently; focus() fires focusin). A click is pointerdown + focus + click; Safari's click does not focus.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bindKeys, focusedByKeyboard, releasePointerFocus, restorableFocus } from './keys';
import { segmented, select, tabs } from './controls';
import { radioMenu } from './radioMenu';

type Listener = (e: FakeEvent) => void;
interface FakeEvent {
  type: string; target: FakeEl; relatedTarget?: FakeEl | null; bubbles: boolean;
  code?: string; key?: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean; repeat: boolean; isComposing: boolean;
  defaultPrevented: boolean; preventDefault(): void;
}

class FakeText { nodeType = 3; parentElement: FakeEl | null = null; constructor(public data: string) {} get textContent() { return this.data; } }
class FakeEl {
  nodeType = 1; namespaceURI = 'http://www.w3.org/1999/xhtml'; tagName: string;
  childNodes: (FakeEl | FakeText)[] = []; parentElement: FakeEl | null = null;
  attrs = new Map<string, string>(); dataset: Record<string, string> = {}; style: Record<string, string> = {};
  hidden = false; className = ''; tabIndex = 0; isContentEditable = false;
  /** Chrome's focus ring: off for a click, on for Tab, and on for a clicked element after any key press. */
  focusVisible = false;
  listeners = new Map<string, { fn: Listener; capture: boolean }[]>();
  constructor(tag: string) { this.tagName = tag.toUpperCase(); }
  get children() { return this.childNodes.filter((c): c is FakeEl => c instanceof FakeEl); }
  get textContent(): string { return this.childNodes.map(c => c.textContent).join(''); }
  set textContent(s: string) { this.replaceChildren(new FakeText(s)); }
  get disabled() { return this.attrs.has('disabled'); }
  set disabled(d: boolean) { if (d) this.attrs.set('disabled', ''); else this.attrs.delete('disabled'); }
  get type() { return this.attrs.get('type') ?? ''; }
  setAttribute(k: string, v: string) { this.attrs.set(k, String(v)); }
  getAttribute(k: string) { return this.attrs.get(k) ?? null; }
  hasAttribute(k: string) { return this.attrs.has(k); }
  removeAttribute(k: string) { this.attrs.delete(k); }
  addEventListener(t: string, fn: Listener, opts?: boolean | { capture?: boolean }) {
    const capture = typeof opts === 'boolean' ? opts : !!opts?.capture;
    const list = this.listeners.get(t) ?? [];
    if (!list.some(l => l.fn === fn && l.capture === capture)) list.push({ fn, capture });
    this.listeners.set(t, list);
  }
  removeEventListener(t: string, fn: Listener, opts?: boolean | { capture?: boolean }) {
    const capture = typeof opts === 'boolean' ? opts : !!opts?.capture;
    this.listeners.set(t, (this.listeners.get(t) ?? []).filter(l => !(l.fn === fn && l.capture === capture)));
  }
  appendChild(c: FakeEl | FakeText) { if (c.parentElement) c.parentElement.childNodes = c.parentElement.childNodes.filter(x => x !== c); c.parentElement = this; this.childNodes.push(c); return c; }
  append(...cs: (FakeEl | FakeText)[]) { for (const c of cs) this.appendChild(c); }
  replaceChildren(...cs: (FakeEl | FakeText)[]) {
    // Like Chrome: removing the focused element moves focus to the body without a focus event.
    if (doc.activeElement && this.childNodes.some(c => c instanceof FakeEl && c.contains(doc.activeElement))) doc.activeElement = null;
    for (const c of this.childNodes) c.parentElement = null;
    this.childNodes = [];
    for (const c of cs) this.appendChild(c);
  }
  contains(n: FakeEl | null): boolean { for (let p = n; p; p = p.parentElement) if (p === this) return true; return false; }
  matches(sel: string): boolean {
    if (sel === ':focus-visible') return doc.activeElement === this && this.focusVisible;
    return sel.split(',').some(s => {
      const m = /^\s*([a-z]*)((?:\[[^\]]+\])*)\s*$/.exec(s);
      if (!m) return false;
      if (m[1] && m[1] !== this.tagName.toLowerCase()) return false;
      return [...m[2].matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)].every(a => this.attrs.has(a[1]) && (a[2] === undefined || this.attrs.get(a[1]) === a[2]));
    });
  }
  closest(sel: string): FakeEl | null { for (let e: FakeEl | null = this; e; e = e.parentElement) if (e.matches(sel)) return e; return null; }
  focus() {
    if (doc.activeElement === this) return;
    const from = doc.activeElement;
    doc.activeElement = this;
    dispatch(this, 'focusin', { relatedTarget: from });
  }
  blur() { if (doc.activeElement === this) doc.activeElement = null; }
}

/** The fake document: the root of every tree, and a listener target like the real one. A new one per test. */
function newDocument() {
  const root = new FakeEl('#document');
  return {
    root,
    activeElement: null as FakeEl | null,
    createElement: (t: string) => new FakeEl(t),
    createTextNode: (s: string) => new FakeText(s),
    addEventListener: (t: string, fn: Listener, o?: boolean) => root.addEventListener(t, fn, o),
    removeEventListener: (t: string, fn: Listener, o?: boolean) => root.removeEventListener(t, fn, o),
  };
}
let doc = newDocument();
let docEl = doc.root;

function dispatch(target: FakeEl, type: string, init: Partial<FakeEvent> = {}): FakeEvent {
  const e: FakeEvent = {
    type, target, bubbles: type !== 'focus' && type !== 'blur', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false,
    repeat: false, isComposing: false, defaultPrevented: false, preventDefault() { e.defaultPrevented = true; }, ...init,
  };
  const path: FakeEl[] = [];
  for (let n: FakeEl | null = target; n; n = n.parentElement) path.push(n);
  if (path[path.length - 1] !== docEl) path.push(docEl);
  const run = (n: FakeEl, capture: boolean) => { for (const l of [...(n.listeners.get(type) ?? [])]) if (l.capture === capture) l.fn(e); };
  for (let i = path.length - 1; i > 0; i--) run(path[i], true);
  run(target, true); run(target, false);
  if (e.bubbles) for (let i = 1; i < path.length; i++) run(path[i], false);
  return e;
}

const KEY: Record<string, string> = { ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', End: 'End', Home: 'Home', Enter: 'Enter', Space: ' ', Tab: 'Tab', KeyM: 'm' };
/** A key press on whatever has focus (the body when nothing does). Returns the keydown event. */
function press(code: string): FakeEvent {
  const t = doc.activeElement ?? docEl;
  if (doc.activeElement) doc.activeElement.focusVisible = true;
  const d = dispatch(t, 'keydown', { code, key: KEY[code] ?? code });
  dispatch(doc.activeElement ?? docEl, 'keyup', { code, key: KEY[code] ?? code });
  return d;
}
/** A mouse click as Chrome does it: pointerdown, focus on the control, click. */
function click(el: FakeEl, opts: { focuses?: boolean } = {}) {
  dispatch(el, 'pointerdown');
  if (opts.focuses !== false) { el.focusVisible = false; el.focus(); }
  dispatch(el, 'click');
}
/** Tab onto el: keydown Tab, the browser moves focus. */
function tabTo(el: FakeEl) {
  dispatch(doc.activeElement ?? docEl, 'keydown', { code: 'Tab', key: 'Tab' });
  el.focusVisible = true;
  el.focus();
}

beforeEach(() => {
  doc = newDocument();
  docEl = doc.root;
  vi.stubGlobal('document', doc);
});
afterEach(() => vi.unstubAllGlobals());

function mount(el: FakeEl) { docEl.appendChild(el); return el; }

describe('segmented() and tabs() after a click', () => {
  function steer() {
    const log: string[] = [];
    const seg = segmented<string>({
      id: 'steer', label: 'Steer', value: 'straight',
      options: [{ value: 'straight', label: 'Straight' }, { value: 'left', label: 'Crank L' }, { value: 'right', label: 'Crank R' }],
      onChange: v => log.push('seg ' + v),
    });
    mount(seg.el as unknown as FakeEl);
    const caps = (seg.group as unknown as FakeEl).children;
    const unbind = bindKeys({ 'Left': () => log.push('turn left'), 'Right': () => log.push('turn right'), 'Enter': () => log.push('designate') }, doc as unknown as EventTarget);
    return { seg, caps, log, unbind };
  }

  it('gives a bound arrow to the page after a click and keeps the arrows for a keyboard user', () => {
    const { seg, caps, log, unbind } = steer();
    tabTo(caps[0]);
    press('ArrowRight');
    expect(seg.value).toBe('left');
    expect(log).toEqual(['seg left']);
    log.length = 0;
    click(caps[2]);
    expect(seg.value).toBe('right');
    press('ArrowLeft');
    expect(log).toEqual(['seg right', 'turn left']);
    expect(seg.value).toBe('right');
    unbind();
  });

  it('keeps the page keys after a key the page does not bind moves focus between caps (End)', () => {
    const { seg, caps, log, unbind } = steer();
    click(caps[0]);
    const end = press('End');
    expect(end.defaultPrevented).toBe(true);
    expect(seg.value).toBe('right');
    expect(doc.activeElement).toBe(caps[2]);
    const left = press('ArrowLeft');
    expect(left.defaultPrevented).toBe(true);
    expect(log).toEqual(['seg right', 'turn left']);
    expect(seg.value).toBe('right');
    unbind();
  });

  it('keeps the page keys when setOptions rebuilds the caps under focus (a shot changes the count)', () => {
    const log: string[] = [];
    const seg = segmented<string>({
      id: 'wpn', label: 'Weapon', value: 'aim120',
      options: [{ value: 'aim9', label: 'AIM-9M x2' }, { value: 'aim120', label: 'AIM-120C x5' }],
      onChange: v => log.push('weapon ' + v),
    });
    mount(seg.el as unknown as FakeEl);
    const unbind = bindKeys({ 'Left': () => log.push('turn left'), 'Enter': () => log.push('designate') }, doc as unknown as EventTarget);
    click((seg.group as unknown as FakeEl).children[1]);
    press('ArrowLeft');
    seg.setOptions([{ value: 'aim9', label: 'AIM-9M x2' }, { value: 'aim120', label: 'AIM-120C x4' }]);
    const cap = (seg.group as unknown as FakeEl).children[1];
    expect(doc.activeElement).toBe(cap);   // focus is back on the same value, on a new cap
    press('ArrowLeft');
    press('Enter');
    expect(log).toEqual(['turn left', 'turn left', 'designate']);
    expect(seg.value).toBe('aim120');
    // Tabbing out and back in is a keyboard entry: the caps take the arrows again.
    const other = mount(new FakeEl('button'));
    tabTo(other);
    tabTo(cap);
    press('ArrowLeft');
    expect(seg.value).toBe('aim9');
    unbind();
  });

  it('treats Tab into a group as a keyboard entry after a click that did not focus (Safari, Firefox on macOS)', () => {
    const { seg, caps, log, unbind } = steer();
    click(caps[2], { focuses: false });   // Safari: pointerdown and click, no focus event
    expect(seg.value).toBe('right');
    expect(doc.activeElement).toBe(null);
    tabTo(caps[2]);                       // the next Tab lands on the checked cap
    const right = press('ArrowRight');
    expect(right.defaultPrevented).toBe(true);
    expect(seg.value).toBe('straight');   // the group moved; the page did not turn
    expect(log).toEqual(['seg right', 'seg straight']);
    // Out and back in with the keyboard: still the group's arrows.
    const before = mount(new FakeEl('button'));
    tabTo(before);
    tabTo((seg.group as unknown as FakeEl).children[0]);
    press('ArrowRight');
    expect(seg.value).toBe('left');
    expect(log).not.toContain('turn right');
    unbind();
  });

  it('does the same for a tab list', () => {
    const log: string[] = [];
    const t = tabs({ id: 'cam', tabs: [{ id: 'chase', label: 'Chase' }, { id: 'top', label: 'Top' }, { id: 'cockpit', label: 'Cockpit' }], onChange: id => log.push('tab ' + id) });
    mount(t.el as unknown as FakeEl);
    const unbind = bindKeys({ 'Right': () => log.push('turn right') }, doc as unknown as EventTarget);
    const list = (t.list as unknown as FakeEl).children;
    tabTo(list[0]);
    press('ArrowRight');
    expect(t.value).toBe('top');
    click(list[2]);
    press('End');        // not bound: the tab list moves (already on the last tab)
    press('Home');       // not bound: back to the first tab, focus moves inside the list
    expect(t.value).toBe('chase');
    press('ArrowRight');
    expect(t.value).toBe('chase');
    expect(log).toEqual(['tab top', 'tab cockpit', 'tab chase', 'turn right']);
    unbind();
  });
});

describe('a select picked with the mouse', () => {
  function brief() {
    const log: string[] = [];
    const s = select<string>({
      id: 'opp', label: 'Opponent', value: 'su27',
      options: [{ value: 'su27', label: 'Su-27' }, { value: 'mig29', label: 'MiG-29' }],
      onChange: v => log.push('pick ' + v),
    });
    mount(s.el as unknown as FakeEl);
    const unbind = bindKeys({ 'Enter': () => log.push('launch'), 'Space': () => log.push('start'), 'M': () => log.push('mode') }, doc as unknown as EventTarget);
    return { s, sel: s.select as unknown as FakeEl, log, unbind };
  }
  const pick = (sel: FakeEl, value: string) => { (sel as unknown as { value: string }).value = value; dispatch(sel, 'change'); };
  const nextTask = () => new Promise<void>(done => setTimeout(done, 0));

  it('keeps Enter and type-ahead letters while its list may be open, gives page keys back once it closed', async () => {
    const { s, sel, log, unbind } = brief();
    click(sel);                                            // the list opens
    expect(press('Enter').defaultPrevented).toBe(false);   // Firefox: Enter picks the highlighted option
    expect(log).toEqual([]);
    await nextTask();
    click(sel);                                            // the Enter closed it; open it again
    expect(press('KeyM').defaultPrevented).toBe(false);    // type-ahead in the open list
    expect(log).toEqual([]);
    pick(sel, 'mig29');                                    // picked with the mouse: the list closes with a change
    expect(s.value).toBe('mig29');
    expect(press('Space').defaultPrevented).toBe(true);
    press('Enter');
    expect(log).toEqual(['pick mig29', 'start', 'launch']);
    unbind();
  });

  it('counts a second click, Escape or a click on an option as closing the list', async () => {
    const { sel, log, unbind } = brief();
    click(sel); click(sel);                                // open, then closed without a change
    press('Space');
    expect(log).toEqual(['start']);
    click(sel);
    expect(press('Escape').defaultPrevented).toBe(false);
    await nextTask();
    press('Space');
    expect(log).toEqual(['start', 'start']);
    click(sel);
    dispatch(sel.children[0], 'click');                    // Firefox: the same option clicked in the list, no change
    press('Space');
    expect(log).toEqual(['start', 'start', 'start']);
    // Reached with Tab, the select keeps its keys.
    const other = mount(new FakeEl('button'));
    tabTo(other); tabTo(sel);
    expect(press('Space').defaultPrevented).toBe(false);
    expect(log).toEqual(['start', 'start', 'start']);
    unbind();
  });
});

describe('focusedByKeyboard (the lesson path keeps focus across a re-render only for keyboard users)', () => {
  const byKeyboard = (el: FakeEl) => focusedByKeyboard(el as unknown as Element);
  it('is false for a clicked link, even once a key press rings it, and true for a link reached with Tab', () => {
    const unbind = bindKeys({ 'Space': () => {} }, doc as unknown as EventTarget);
    const row = mount(new FakeEl('nav'));
    const next = new FakeEl('a'); next.setAttribute('href', '#/merge'); row.appendChild(next);
    const step = new FakeEl('a'); step.setAttribute('href', '#/defense'); row.appendChild(step);
    click(next);
    expect(byKeyboard(next)).toBe(false);
    press('Space');                       // Chrome now draws a ring on the clicked link
    expect(next.matches(':focus-visible')).toBe(true);
    expect(byKeyboard(next)).toBe(false);
    tabTo(step);
    expect(byKeyboard(step)).toBe(true);
    // Enter on it navigates; the row re-renders and puts focus on the new link by script: still the keyboard's.
    const again = new FakeEl('a'); again.setAttribute('href', '#/defense');
    row.replaceChildren(again);
    again.focusVisible = true; again.focus();
    expect(byKeyboard(again)).toBe(true);
    unbind();
  });
});

describe('releasePointerFocus (the jet picker and the units button remount the page)', () => {
  it('lets go of a control picked or clicked with the mouse and keeps one the keyboard used', () => {
    const log: string[] = [];
    const unbind = bindKeys({ 'Space': () => log.push('start') }, doc as unknown as EventTarget);
    const picker = mount(new FakeEl('select'));
    picker.addEventListener('change', () => releasePointerFocus(picker as unknown as HTMLElement));
    const units = mount(new FakeEl('button'));
    units.addEventListener('click', () => releasePointerFocus(units as unknown as HTMLElement));
    // Mouse: the list opens, a jet is picked, the page remounts with a new key map.
    click(picker);
    dispatch(picker, 'change');
    expect(doc.activeElement).toBe(null);
    unbind();
    const unbind2 = bindKeys({ 'Space': () => log.push('start') }, doc as unknown as EventTarget);
    press('Space');
    click(units);
    expect(doc.activeElement).toBe(null);
    press('Space');
    expect(log).toEqual(['start', 'start']);
    // Keyboard: Tab to the picker, an arrow changes the jet; focus stays to keep arrowing.
    tabTo(picker);
    dispatch(picker, 'change');
    expect(doc.activeElement).toBe(picker);
    tabTo(units);
    dispatch(units, 'click');                     // Enter or Space on the button
    expect(doc.activeElement).toBe(units);
    unbind2();
  });
});

describe('restorableFocus (where a dialog gives focus back on close)', () => {
  it('returns a control the keyboard reached or a text field, not a button the user clicked', () => {
    const unbind = bindKeys({ 'Space': () => {} }, doc as unknown as EventTarget);
    const debrief = mount(new FakeEl('button'));
    const notes = mount(new FakeEl('input')); notes.setAttribute('type', 'text');
    click(debrief);                       // the click opens the dialog
    press('Space');                       // a key inside it rings the button in Chrome
    expect(restorableFocus(debrief as unknown as Element)).toBe(null);
    click(notes);
    expect(restorableFocus(notes as unknown as Element)).toBe(notes);
    tabTo(debrief);
    expect(restorableFocus(debrief as unknown as Element)).toBe(debrief);
    expect(restorableFocus(null)).toBe(null);
    unbind();
  });
});

describe('radioMenu closing', () => {
  function comms() {
    const log: string[] = [];
    const menu = radioMenu({ id: 'radio', root: () => [{ label: 'Check in', action: 'checkin' }, { label: 'Status', action: 'status' }], onSelect: a => log.push('radio ' + a) });
    const host = mount(new FakeEl('div'));
    host.append(menu.toggleEl as unknown as FakeEl, menu.el as unknown as FakeEl);
    const unbind = bindKeys({ 'Space': () => log.push('trigger') }, doc as unknown as EventTarget);
    const items = () => (menu.el as unknown as FakeEl).children.flatMap(c => c.children).filter(c => c.className.includes('ui-radio__item'));
    return { menu, toggle: menu.toggleEl as unknown as FakeEl, items, log, unbind };
  }

  it('does not put focus back on the Radio toggle after a mouse pick, so Space is the trigger again', () => {
    const { menu, toggle, items, log, unbind } = comms();
    click(toggle);
    expect(menu.isOpen()).toBe(true);
    expect(doc.activeElement).toBe(items()[0]);
    click(items()[0]);
    expect(menu.isOpen()).toBe(false);
    expect(doc.activeElement).not.toBe(toggle);
    expect(press('Space').defaultPrevented).toBe(true);
    // Opened with the mouse, closed with Escape: the same.
    click(toggle);
    press('Escape');
    expect(menu.isOpen()).toBe(false);
    expect(doc.activeElement).not.toBe(toggle);
    press('Space');
    expect(log).toEqual(['radio checkin', 'trigger', 'trigger']);
    unbind();
  });

  it('puts focus back on the toggle when the keyboard opened the menu', () => {
    const { menu, toggle, unbind } = comms();
    tabTo(toggle);
    dispatch(toggle, 'click');            // Enter on the toggle
    expect(menu.isOpen()).toBe(true);
    press('Escape');
    expect(menu.isOpen()).toBe(false);
    expect(doc.activeElement).toBe(toggle);
    unbind();
  });
});
