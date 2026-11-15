import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  changedParams, clearLessonPosition, lessonHref, lessonPicker, lessonPosition, onlyChanged, pickerPosition, positionText,
  rovingTarget, watchLessonPosition, type LessonPosition,
} from './lessonPicker';

// ---- minimal DOM (tests run in node) ------------------------------------------------------------

type Listener = (e: FakeEvent) => void;
interface FakeEvent { type: string; target: FakeEl; key?: string; code?: string; defaultPrevented: boolean; preventDefault(): void; relatedTarget?: FakeEl | null }
const doc = { activeElement: null as FakeEl | null };

class FakeText { nodeType = 3; parentElement: FakeEl | null = null; constructor(public data: string) {} get textContent() { return this.data; } }
class FakeEl {
  nodeType = 1; namespaceURI = 'http://www.w3.org/1999/xhtml'; tagName: string;
  childNodes: (FakeEl | FakeText)[] = []; parentElement: FakeEl | null = null;
  attrs = new Map<string, string>(); dataset: Record<string, string> = {}; style: Record<string, string> = {};
  hidden = false; className = ''; title = ''; tabIndex = 0; listeners = new Map<string, Set<Listener>>();
  constructor(tag: string) { this.tagName = tag.toUpperCase(); }
  get children() { return this.childNodes.filter((c): c is FakeEl => c instanceof FakeEl); }
  get lastElementChild() { const c = this.children; return c[c.length - 1] ?? null; }
  get textContent(): string { return this.childNodes.map(c => c.textContent).join(''); }
  set textContent(s: string) { this.replaceChildren(new FakeText(s)); }
  setAttribute(k: string, v: string) { this.attrs.set(k, String(v)); }
  getAttribute(k: string) { return this.attrs.get(k) ?? null; }
  hasAttribute(k: string) { return this.attrs.has(k); }
  removeAttribute(k: string) { this.attrs.delete(k); }
  addEventListener(t: string, fn: Listener) { if (!this.listeners.has(t)) this.listeners.set(t, new Set()); this.listeners.get(t)!.add(fn); }
  removeEventListener(t: string, fn: Listener) { this.listeners.get(t)?.delete(fn); }
  appendChild(c: FakeEl | FakeText) { c.parentElement = this; this.childNodes.push(c); return c; }
  replaceChildren(...cs: (FakeEl | FakeText | string)[]) { for (const c of this.childNodes) c.parentElement = null; this.childNodes = []; for (const c of cs) this.appendChild(typeof c === 'string' ? new FakeText(c) : c); }
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
  doc.activeElement = null;
  vi.stubGlobal('document', {
    createElement: (t: string) => new FakeEl(t),
    createTextNode: (s: string) => new FakeText(s),
    get activeElement() { return doc.activeElement; },
  });
});
afterEach(() => { clearLessonPosition(); vi.unstubAllGlobals(); });

const ITEMS = [
  { id: 'nine-line', label: '9-line', title: 'Radio and 9-line' },
  { id: 'talk-on', label: 'Talk-on' },
  { id: 'geometry', label: 'Cleared hot', disabled: true, note: 'not on this jet' },
  { id: 'sortie', label: 'Sortie', group: true },
];
type Id = typeof ITEMS[number]['id'];

describe('lesson picker rules', () => {
  it('builds lesson links from the page params without screenshot or jet parameters', () => {
    const base = new URLSearchParams('lesson=nine-line&cam=tv&shot=debrief&ac=a10c&t=12');
    expect(lessonHref('cas', base, { lesson: 'talk-on' })).toBe('#/cas?lesson=talk-on&cam=tv');
    expect(lessonHref('defense', new URLSearchParams('lab=free&drill=free'), { drill: 'lock', lab: null })).toBe('#/defense?drill=lock');
    expect(lessonHref('radar', new URLSearchParams('ex=low&sel=1'), { ex: 'free', lab: 'free' }, ['sel'])).toBe('#/radar?ex=free&lab=free');
    expect(lessonHref('jdam', new URLSearchParams(), {})).toBe('#/jdam');
  });
  it('tells which params changed, ignoring order', () => {
    const a = new URLSearchParams('lesson=a&cam=tv'), b = new URLSearchParams('cam=tv&lesson=b&shot=x');
    expect(changedParams(a, b)).toEqual(['lesson', 'shot']);
    expect(changedParams(a, new URLSearchParams('cam=tv&lesson=a'))).toEqual([]);
    expect(onlyChanged(a, b, ['lesson', 'shot'])).toBe(true);
    expect(onlyChanged(a, b, ['lesson'])).toBe(false);
    expect(onlyChanged(a, a, ['lesson'])).toBe(false);
  });
  it('places the open lesson and counts done ones', () => {
    expect(pickerPosition([{ id: 'a', done: true }, { id: 'b' }, { id: 'c', done: true }], 'b')).toEqual({ index: 1, total: 3, done: 2 });
    expect(pickerPosition([{ id: 'a' }], null)).toEqual({ index: null, total: 1, done: 0 });
    expect(pickerPosition([{ id: 'a' }], 'zz').index).toBeNull();
    expect(positionText({ noun: 'Lesson', index: 2, total: 8, done: 1 })).toBe('Lesson 3 of 8, 1 done');
    expect(positionText({ noun: 'Drill', index: null, total: 7, done: 4 })).toBe('4 of 7 drills done');
  });
  it('moves focus with arrows, Home and End, skipping disabled lessons and wrapping', () => {
    const off = [false, false, true, false];
    expect(rovingTarget(off, 1, 'ArrowRight')).toBe(3);
    expect(rovingTarget(off, 3, 'ArrowDown')).toBe(0);
    expect(rovingTarget(off, 0, 'ArrowLeft')).toBe(3);
    expect(rovingTarget(off, 3, 'ArrowUp')).toBe(1);
    expect(rovingTarget(off, 2, 'Home')).toBe(0);
    expect(rovingTarget([false, true], 0, 'End')).toBe(0);
    expect(rovingTarget(off, 0, 'Enter')).toBeNull();
    expect(rovingTarget([true, true], 0, 'ArrowRight')).toBeNull();
  });
});

describe('lesson picker component', () => {
  const make = (value: Id | null, done: Set<string> = new Set(), free = true) => {
    const href = vi.fn((id: Id) => `#/cas?lesson=${id}`);
    const p = lessonPicker<Id>({
      id: 'cas-lessons', topic: 'CAS', items: ITEMS, value, href, isDone: id => done.has(id),
      ...(free ? { free: { label: 'Free practice', href: '#/cas?lab=free' } } : {}),
    });
    const root = p.el as unknown as FakeEl;
    const links = byClass(root, 'ui-lessons__item');
    const freeLink = byClass(root, 'ui-lessons__free')[0] ?? null;
    return { p, root, links, freeLink, href };
  };

  it('renders numbered links with the open lesson current and done lessons marked for screen readers', () => {
    const { root, links } = make('talk-on', new Set(['nine-line']));
    expect(root.tagName).toBe('NAV');
    expect(root.getAttribute('aria-label')).toBe('CAS lessons');
    expect(links.map(a => a.children[0]!.textContent)).toEqual(['1', '2', '3', '4']);
    expect(links.map(a => a.getAttribute('href'))).toEqual(['#/cas?lesson=nine-line', '#/cas?lesson=talk-on', null, '#/cas?lesson=sortie']);
    expect(links[1]!.getAttribute('aria-current')).toBe('step');
    expect(links[0]!.getAttribute('aria-current')).toBeNull();
    expect(links[0]!.dataset.done).toBe('true');
    expect(links[0]!.lastElementChild!.textContent).toBe(', done');
    expect(links[2]!.getAttribute('aria-disabled')).toBe('true');
    expect(links[2]!.lastElementChild!.textContent).toBe(', not on this jet');
    // One tab stop, on the open lesson.
    expect(links.map(a => a.tabIndex)).toEqual([-1, 0, -1, -1]);
    expect(byClass(root, 'ui-lessons__li')[3]!.className).toContain('is-group-start');
    expect(byClass(root, 'ui-sr').at(0)!.textContent).toBe('Lesson 2 of 4, 1 done');
  });

  it('moves focus with the arrow keys and leaves Enter to the link', () => {
    const { links, freeLink } = make('nine-line');
    links[0]!.focus();
    const e = dispatch(links[0]!, 'keydown', { key: 'ArrowRight' });
    expect(e.defaultPrevented).toBe(true);
    expect(doc.activeElement).toBe(links[1]);
    dispatch(links[1]!, 'keydown', { key: 'ArrowRight' });
    expect(doc.activeElement).toBe(links[3]);   // the disabled lesson is skipped
    dispatch(links[3]!, 'keydown', { key: 'ArrowRight' });
    expect(doc.activeElement).toBe(freeLink);   // the free link closes the ring
    expect(dispatch(freeLink!, 'keydown', { key: 'Enter' }).defaultPrevented).toBe(false);
  });

  it('shows free mode with no current lesson and the done count', () => {
    const { p, links, freeLink, root } = make(null, new Set(['nine-line', 'sortie']));
    expect(links.every(a => a.getAttribute('aria-current') === null)).toBe(true);
    expect(freeLink!.getAttribute('aria-current')).toBe('true');
    expect(freeLink!.tabIndex).toBe(0);
    expect(byClass(root, 'ui-lessons__cap')[0]!.textContent).toBe('Done');
    expect(p.value).toBeNull();
    p.set('sortie');
    expect(freeLink!.getAttribute('aria-current')).toBeNull();
    expect(links[3]!.getAttribute('aria-current')).toBe('step');
  });

  it('re-reads done state and links on refresh, and publishes the position for the chrome', () => {
    const done = new Set<string>();
    const seen: (LessonPosition | null)[] = [];
    const off = watchLessonPosition(p => seen.push(p));
    const { p, links, href } = make('nine-line', done, false);
    expect(lessonPosition()).toMatchObject({ topic: 'CAS', noun: 'Lesson', index: 0, total: 4, done: 0, free: false });
    done.add('nine-line');
    p.refresh();
    expect(links[0]!.dataset.done).toBe('true');
    expect(lessonPosition()?.done).toBe(1);
    expect(href).toHaveBeenCalledTimes(3 * 2);   // three enabled lessons, two renders
    p.set('talk-on');
    expect(lessonPosition()?.index).toBe(1);
    p.destroy();
    expect(lessonPosition()).toBeNull();
    expect(seen.at(-1)).toBeNull();
    off();
  });

  it('lets the chrome drop a position a page left behind, and ignores a destroyed picker', () => {
    const seen: (LessonPosition | null)[] = [];
    const off = watchLessonPosition(p => seen.push(p));
    const { p } = make('talk-on', new Set(), false);
    clearLessonPosition();
    expect(lessonPosition()).toBeNull();
    p.destroy();
    p.set('sortie');
    expect(lessonPosition()).toBeNull();
    expect(seen).toHaveLength(2);
    off();
  });

  it('keeps focus on the same lesson when the list is replaced', () => {
    const { p, root } = make('talk-on');
    byClass(root, 'ui-lessons__item')[1]!.focus();
    p.setItems([{ id: 'talk-on', label: 'Talk-on' }, { id: 'nine-line', label: '9-line' }]);
    const links = byClass(root, 'ui-lessons__item');
    expect(doc.activeElement).toBe(links[0]);
    expect(links[0]!.getAttribute('aria-current')).toBe('step');
  });
});
