/**
 * Pointer versus keyboard focus with real controls: segmented() and tabs() built on a small fake DOM that
 * dispatches events through capture and bubble phases and moves focus like Chrome (a removed cap drops focus
 * silently; focus() fires focusin). A click is pointerdown + focus + click; Safari's click does not focus.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bindKeys } from './keys';
import { segmented, tabs } from './controls';

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
  const d = dispatch(t, 'keydown', { code, key: KEY[code] ?? code });
  dispatch(doc.activeElement ?? docEl, 'keyup', { code, key: KEY[code] ?? code });
  return d;
}
/** A mouse click as Chrome does it: pointerdown, focus on the control, click. */
function click(el: FakeEl, opts: { focuses?: boolean } = {}) {
  dispatch(el, 'pointerdown');
  if (opts.focuses !== false) el.focus();
  dispatch(el, 'click');
}
/** Tab onto el: keydown Tab, the browser moves focus. */
function tabTo(el: FakeEl) {
  dispatch(doc.activeElement ?? docEl, 'keydown', { code: 'Tab', key: 'Tab' });
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
