/**
 * Lesson picker: the lessons of one page, the same thing as the lesson path in the top chrome one level down. A
 * numbered chip per lesson (lit when done, the open lesson pressed), its short label, and the position ('3/8') in a
 * small glass window. A page with a free mode gets a separate, quieter link to it after the numbers.
 *
 * Every lesson is a link: choosing one changes the page's own query parameter (?lesson=, ?ex=, ?drill=, ?start=), so
 * Back, Forward and shared links work. The page applies the new URL in `Page.update` (in place) or is remounted by
 * the router; afterwards it calls `set()`. The picker never restarts a lesson itself.
 *
 * Keyboard: one Tab stop; arrows, Home and End move focus (roving tabindex, disabled lessons skipped), Enter opens.
 * A picker the user clicked leaves bound arrow keys to the page (arrowsToPage), as `segmented` does.
 *
 * The open lesson's position is published for the app chrome (watchLessonPosition), which prints it beside the
 * lesson path position ('Lesson 8/10 · HARM 3/8'). The shell reads only this module, never page code.
 * Styles: .ui-lessons in components.css. API: docs/api/ui-kit.md, "Lesson picker".
 */
import { h, setAttr, setText } from './dom';
import { arrowsToPage } from './controls';

export interface LessonItem<T extends string = string> {
  id: T;
  /** Short label beside the number ('Talk-on'). */
  label: string;
  /** Full lesson name: tooltip and screen-reader description. */
  title?: string;
  /** Complete (from the progress store). `isDone` overrides it on refresh(). */
  done?: boolean;
  /** Listed but not selectable (not on this jet). Say why in `note`. */
  disabled?: boolean;
  /** One more fact for the tooltip and screen readers ('best 86', 'not on this jet'). */
  note?: string;
  /** Starts a group: a hairline divider before it, as between topics in the lesson path. */
  group?: boolean;
}

export interface LessonPickerOptions<T extends string> {
  id: string;
  /** What the lessons belong to: 'CAS' gives 'CAS lessons' and 'CAS 3/8' in the chrome. */
  topic: string;
  /** What one item is called: 'Lesson' (default), 'Drill', 'Exercise'. */
  noun?: string;
  items: LessonItem<T>[];
  /** The open lesson; null in free mode or when none is open. */
  value: T | null;
  /** Link of each lesson ('#/cas?lesson=talk-on'); build it with lessonHref(). Read again on refresh(). */
  href(id: T): string;
  /** Free mode: a link after the lessons, outside the numbering. It shows as open while `value` is null. */
  free?: { label: string; href: string; title?: string };
  /** Done state, read on create and on every refresh() (the progress store). */
  isDone?(id: T): boolean;
  /** Draw the header row (topic and position). False: place `status` yourself, e.g. in a console panel's title row. */
  header?: boolean;
  /** Publish the position to the app chrome (default true). Only one picker per page should. */
  publish?: boolean;
}

export interface LessonPickerHandle<T extends string> {
  /** The `nav` landmark. */
  el: HTMLElement;
  /** Position readout ('3/8' in a glass window); inside the header unless `header: false`. */
  status: HTMLElement;
  readonly value: T | null;
  /** The open lesson changed (after the page applied the URL); null for free mode. Does not navigate. */
  set(value: T | null): void;
  /** Re-read done states and links. Call it when progress is saved and when the page's other params change. */
  refresh(): void;
  /** Replace the lesson list (a jet with other lessons); keeps keyboard focus on the same lesson. */
  setItems(items: LessonItem<T>[]): void;
  /** Withdraw the chrome position. Call in unmount. */
  destroy(): void;
}

// ------------------------------------------------------------------------------------------------ pure rules

/**
 * Link for a lesson: the route, the current params with `set` applied (null deletes) and `drop` removed. Screenshot
 * pre-rolls (`shot`, `t`) and the one-time jet selection (`ac`) never travel into a lesson link.
 */
export function lessonHref(route: string, base: URLSearchParams, set: Record<string, string | null>, drop: readonly string[] = []): string {
  const q = new URLSearchParams(base);
  for (const k of ['ac', 'shot', 't', 'progress', ...drop]) q.delete(k);
  for (const [k, v] of Object.entries(set)) { if (v === null) q.delete(k); else q.set(k, v); }
  const qs = q.toString();
  return '#/' + route + (qs ? '?' + qs : '');
}

/** Keys whose values differ between two queries (order-independent). */
export function changedParams(a: URLSearchParams, b: URLSearchParams): string[] {
  const keys = new Set([...a.keys(), ...b.keys()]);
  return [...keys].filter(k => a.getAll(k).join('\u0000') !== b.getAll(k).join('\u0000')).sort();
}

/** True when only `keys` changed between two queries (and something did). Pages use it in `update`. */
export function onlyChanged(prev: URLSearchParams, next: URLSearchParams, keys: readonly string[]): boolean {
  const ch = changedParams(prev, next);
  return ch.length > 0 && ch.every(k => keys.includes(k));
}

export interface LessonPosition {
  topic: string;
  noun: string;
  /** Index of the open lesson; null in free mode. */
  index: number | null;
  total: number;
  done: number;
  /** Free mode is open. */
  free: boolean;
}

/** Position of the open lesson among `items` (numbered from 1 in the UI). */
export function pickerPosition(items: readonly { id: string; done?: boolean }[], value: string | null): { index: number | null; total: number; done: number } {
  const i = value === null ? -1 : items.findIndex(x => x.id === value);
  return { index: i < 0 ? null : i, total: items.length, done: items.filter(x => x.done).length };
}

/** Roving focus: the next focusable index from `from` for an arrow, Home or End key; null for other keys. */
export function rovingTarget(disabled: readonly boolean[], from: number, key: string): number | null {
  const n = disabled.length;
  if (!n || disabled.every(Boolean)) return null;
  const step = (dir: 1 | -1, start: number) => {
    for (let k = 1; k <= n; k++) {
      const j = ((start + dir * k) % n + n) % n;
      if (!disabled[j]) return j;
    }
    return from;
  };
  if (key === 'ArrowRight' || key === 'ArrowDown') return step(1, from);
  if (key === 'ArrowLeft' || key === 'ArrowUp') return step(-1, from);
  if (key === 'Home') return step(1, -1);
  if (key === 'End') return step(-1, n);
  return null;
}

/** Screen-reader text of the position: 'Lesson 3 of 8, 2 done' or, in free mode, '2 of 8 lessons done'. */
export function positionText(p: Pick<LessonPosition, 'noun' | 'index' | 'total' | 'done'>): string {
  const nouns = p.noun.toLowerCase() + 's';
  return p.index === null ? `${p.done} of ${p.total} ${nouns} done` : `${p.noun} ${p.index + 1} of ${p.total}, ${p.done} done`;
}

// ------------------------------------------------------------------------------------------------ chrome hook

let published: { owner: object; pos: LessonPosition } | null = null;
const watchers = new Set<(pos: LessonPosition | null) => void>();
const notify = () => { const pos = published?.pos ?? null; for (const fn of watchers) fn(pos); };

/** The open lesson of the mounted page's picker, or null. */
export function lessonPosition(): LessonPosition | null { return published?.pos ?? null; }
/** Follow the picker position (the shell). Returns unsubscribe. */
export function watchLessonPosition(fn: (pos: LessonPosition | null) => void): () => void {
  watchers.add(fn);
  return () => { watchers.delete(fn); };
}
/** Forget the position (the shell, when the route changes, in case a page forgot to destroy its picker). */
export function clearLessonPosition(): void {
  if (!published) return;
  published = null;
  notify();
}
function publish(owner: object, pos: LessonPosition | null): void {
  if (!pos) { if (published?.owner !== owner) return; published = null; notify(); return; }
  const prev = published?.owner === owner ? published.pos : null;
  published = { owner, pos };
  if (!prev || JSON.stringify(prev) !== JSON.stringify(pos)) notify();
}

// ------------------------------------------------------------------------------------------------ component

export function lessonPicker<T extends string>(o: LessonPickerOptions<T>): LessonPickerHandle<T> {
  const noun = o.noun ?? 'Lesson';
  let items = o.items.map(x => ({ ...x }));
  let value = o.value;
  let freeActive = value === null && !!o.free;
  const owner = {};
  let destroyed = false;

  const capEl = h('span', { class: 'ui-lessons__cap', 'aria-hidden': 'true' });
  const glassEl = h('span', { class: 'ui-lessons__glass', 'aria-hidden': 'true' });
  const spoken = h('span', { class: 'ui-sr' });
  const status = h('span', { class: 'ui-lessons__pos' }, capEl, glassEl, spoken);
  const list = h('ol', { class: 'ui-lessons__list' });
  const freeLink = o.free ? h('a', { class: 'ui-lessons__free', id: `${o.id}-free`, href: o.free.href, title: o.free.title }, o.free.label) : null;
  const el = h('nav', { class: 'ui-lessons', id: o.id, 'aria-label': `${o.topic} ${noun.toLowerCase()}s` },
    o.header === false ? null : h('div', { class: 'ui-lessons__head' }, h('span', { class: 'ui-lessons__topic' }, `${o.topic} ${noun.toLowerCase()}s`), status),
    list);
  let links: HTMLAnchorElement[] = [];

  const readDone = () => { if (o.isDone) for (const x of items) x.done = !!o.isDone(x.id); };
  const focusables = (): HTMLAnchorElement[] => (freeLink ? [...links, freeLink as HTMLAnchorElement] : links);
  const disabledFlags = (): boolean[] => [...items.map(x => !!x.disabled), ...(freeLink ? [false] : [])];

  /** Rebuild the links; `focusId` gets keyboard focus back (it was on that lesson before the rebuild). */
  const build = (focusId?: string) => {
    links = items.map((x, i) => h('a', {
      class: 'ui-lessons__item', id: `${o.id}-${x.id.replace(/[^\w-]/g, '_')}`,
    },
    h('span', { class: 'ui-lessons__num', 'aria-hidden': 'true' }, String(i + 1)),
    h('span', { class: 'ui-lessons__label' }, x.label),
    h('span', { class: 'ui-sr' }))) as HTMLAnchorElement[];
    list.replaceChildren(...links.map((a, i) => h('li', { class: items[i]!.group && i > 0 ? 'ui-lessons__li is-group-start' : 'ui-lessons__li' }, a)),
      ...(freeLink ? [h('li', { class: 'ui-lessons__li ui-lessons__li--free' }, freeLink)] : []));
    render();
    if (focusId !== undefined) links[items.findIndex(x => x.id === focusId)]?.focus();
  };

  const render = () => {
    const pos = pickerPosition(items, value);
    items.forEach((x, i) => {
      const a = links[i]!;
      const current = i === pos.index;
      setAttr(a, 'href', x.disabled ? null : o.href(x.id));
      setAttr(a, 'aria-disabled', x.disabled ? 'true' : null);
      setAttr(a, 'aria-current', current ? 'step' : null);
      a.dataset.state = current ? 'current' : x.done ? 'done' : 'todo';
      a.dataset.done = String(!!x.done);
      a.title = `${i + 1}. ${x.title ?? x.label}${x.note ? ` (${x.note})` : ''}`;
      const sr = a.lastElementChild as HTMLElement;
      setText(sr, [x.done ? ', done' : '', x.note ? `, ${x.note}` : ''].join(''));
    });
    if (freeLink && o.free) {
      setAttr(freeLink, 'href', o.free.href);
      setAttr(freeLink, 'aria-current', freeActive ? 'true' : null);
    }
    // Roving tabindex: the open lesson, else the first one that can be opened.
    const all = focusables(), off = disabledFlags();
    const tabAt = pos.index !== null && !off[pos.index] ? pos.index : freeActive && freeLink ? all.length - 1 : off.findIndex(d => !d);
    all.forEach((a, i) => { a.tabIndex = i === tabAt ? 0 : -1; });

    setText(capEl, pos.index === null ? 'Done' : '');
    capEl.hidden = pos.index !== null;
    glassEl.replaceChildren(h('b', null, String(pos.index === null ? pos.done : pos.index + 1)), '/' + pos.total);
    const p: LessonPosition = { topic: o.topic, noun, ...pos, free: freeActive };
    setText(spoken, positionText(p));
    if (o.publish !== false && !destroyed) publish(owner, p);
  };

  const toPage = arrowsToPage(el);
  el.addEventListener('keydown', e => {
    const all = focusables();
    const i = all.indexOf(e.target as HTMLAnchorElement);
    if (i < 0 || toPage(e)) return;
    const j = rovingTarget(disabledFlags(), i, e.key);
    if (j === null) return;
    e.preventDefault();
    all[j]?.focus();
  });

  readDone();
  build();

  return {
    el, status,
    get value() { return value; },
    set(v) {
      value = v !== null && items.some(x => x.id === v) ? v : null;
      freeActive = value === null && !!o.free;
      render();
    },
    refresh() { readDone(); render(); },
    setItems(next) {
      const had = links.findIndex(a => a === document.activeElement);
      const focusId = had >= 0 ? items[had]?.id : undefined;
      items = next.map(x => ({ ...x }));
      readDone();
      build(focusId);
    },
    destroy() { destroyed = true; publish(owner, null); },
  };
}
