/**
 * Page layouts: labLayout (one-screen tool: 3D viewport, side console, display strip), docLayout
 * (reading page with a 65ch measure and a side contents list) and split (display + display).
 */
import { h, append, setAttr, cx, type Child } from './dom';

// ---- page header -------------------------------------------------------------------------------

export interface PageHeaderOptions {
  title: Child;
  lede?: Child;
  /** Right-aligned controls (e.g. a reset button). */
  actions?: Child;
  /** Small placard line under the title (e.g. 'Su-27 · N001 · FC3'). */
  meta?: Child;
  /** Compact variant for lab tool pages. */
  compact?: boolean;
  class?: string;
}

/** Page title in the display face (Russo One) with an optional lede. The only place Russo One is used. */
export function pageHeader(o: PageHeaderOptions): HTMLElement {
  return h('header', { class: cx('ui-pagehead', o.compact && 'ui-pagehead--compact', o.class) },
    h('div', { class: 'ui-pagehead__text' },
      h('h1', { class: 'ui-pagehead__title' }, o.title),
      o.meta ? h('div', { class: 'ui-pagehead__meta' }, o.meta) : null,
      o.lede ? h('p', { class: 'ui-pagehead__lede' }, o.lede) : null),
    o.actions ? h('div', { class: 'ui-pagehead__actions' }, o.actions) : null);
}

// ---- lab layout --------------------------------------------------------------------------------

export type HudCorner = 'tl' | 'tr' | 'bl' | 'br';
export interface LabLayoutOptions {
  /** The 3D container (give it to your Stage). It is stretched to fill the viewport area. */
  viewport: HTMLElement;
  /** Side console content: console panels, coach box, checklist... Scrolls internally on desktop. */
  console: Child;
  /** Bottom strip: screen bezels (radar, RWR) and small readout panels. */
  strip?: Child;
  /** Compact page header over the viewport (title in the display face). */
  header?: PageHeaderOptions;
  id?: string;
  /** Phone order: 'strip-first' = viewport, displays, console (default); 'console-first' = viewport, console, displays. */
  mobileOrder?: 'strip-first' | 'console-first';
  class?: string;
}
export interface LabLayoutHandle {
  el: HTMLElement;
  /** The viewport area (position: relative). Your viewport element is its first child. */
  view: HTMLElement;
  console: HTMLElement;
  strip: HTMLElement;
  /** Put small controls or readouts over a corner of the 3D view (camera buttons, legend). */
  overlay(corner: HudCorner, ...children: Child[]): HTMLElement;
}

/**
 * One-screen tool layout. Desktop (> 900 px): header + 3D viewport + display strip on the left, the
 * side console full height on the right; the page itself does not scroll. ≤ 900 px: one column.
 */
export function labLayout(o: LabLayoutOptions): LabLayoutHandle {
  o.viewport.classList.add('ui-fill');
  const huds: Partial<Record<HudCorner, HTMLElement>> = {};
  const view = h('div', { class: 'ui-lab__view' }, o.viewport);
  const consoleEl = h('aside', { class: 'ui-lab__console', 'aria-label': 'Controls' }, o.console);
  const strip = h('section', { class: 'ui-lab__strip', 'aria-label': 'Displays' }, o.strip ?? null);
  const hasStrip = o.strip !== undefined && o.strip !== null && o.strip !== false;
  const head = o.header ? pageHeader({ ...o.header, compact: true, class: cx('ui-lab__head', o.header.class) }) : null;
  const el = h('div', {
    class: cx('ui-lab', head && 'has-head', hasStrip && 'has-strip', o.class), id: o.id,
    dataset: { mobile: o.mobileOrder ?? 'strip-first' },
  }, head, view, hasStrip ? strip : null, consoleEl);
  return {
    el, view, console: consoleEl, strip,
    overlay(corner, ...children) {
      let hud = huds[corner];
      if (!hud) { hud = h('div', { class: `ui-lab__hud ui-lab__hud--${corner}` }); huds[corner] = hud; view.append(hud); }
      append(hud, children);
      return hud;
    },
  };
}

// ---- doc layout --------------------------------------------------------------------------------

export interface DocSection { id: string; title: string; content: Child }
export interface DocLayoutOptions {
  title: Child;
  lede?: Child;
  meta?: Child;
  actions?: Child;
  /** Sections rendered as <section id> with an h2, and listed in the contents. */
  sections?: DocSection[];
  /** Or your own content plus a contents list pointing at element ids inside it. */
  content?: Child;
  toc?: { id: string; label: string }[];
  /** Contents placard (default 'Contents'). */
  tocTitle?: string;
  /** Extra content at the top of the contents panel, under its placard (e.g. a filter box). */
  tocHeader?: Child;
  id?: string;
  class?: string;
}
export interface DocLayoutHandle {
  el: HTMLElement;
  main: HTMLElement;
  toc: HTMLElement | null;
  /** The contents buttons by section id (add count badges, hide filtered-out sections' links). */
  links: ReadonlyMap<string, HTMLButtonElement>;
  /** Scroll to a section by id (also used by the contents list). */
  go(id: string): void;
  /** Disconnect the scroll-spy observer (call in unmount). */
  destroy(): void;
}

/**
 * Reading page: page title, a sticky contents list on wide screens (a wrapped list on top when
 * narrow) and a 65ch prose measure. Contents links are buttons that scroll, because the app uses
 * hash routing and a '#id' link would navigate away.
 */
export function docLayout(o: DocLayoutOptions): DocLayoutHandle {
  const sections = o.sections ?? [];
  const tocItems = o.toc ?? sections.map(s => ({ id: s.id, label: s.title }));
  const main = h('div', { class: 'ui-doc__main ui-prose' },
    o.content ?? null,
    sections.map(s => h('section', { class: 'ui-doc__section', id: s.id, 'aria-labelledby': s.id + '-h' },
      h('h2', { id: s.id + '-h', tabindex: '-1' }, s.title), s.content)));

  const links = new Map<string, HTMLButtonElement>();
  const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const go = (id: string) => {
    const target = main.querySelector<HTMLElement>('#' + CSS.escape(id));
    if (!target) return;
    target.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
    const focusable = target.matches('h1, h2, h3, h4') ? target : target.querySelector<HTMLElement>('h2, h3');
    if (focusable) { if (!focusable.hasAttribute('tabindex')) focusable.setAttribute('tabindex', '-1'); focusable.focus({ preventScroll: true }); }
    setCurrent(id);
  };
  const setCurrent = (id: string) => { for (const [k, b] of links) setAttr(b, 'aria-current', k === id ? 'true' : null); };

  let toc: HTMLElement | null = null;
  if (tocItems.length) {
    toc = h('nav', { class: 'ui-doc__toc', 'aria-label': o.tocTitle ?? 'Contents' },
      h('div', { class: 'ui-placard ui-doc__toc-title' }, o.tocTitle ?? 'Contents'),
      o.tocHeader !== undefined && o.tocHeader !== null ? h('div', { class: 'ui-doc__toc-header' }, o.tocHeader) : null,
      h('ol', null, tocItems.map(t => {
        const b = h('button', { type: 'button', class: 'ui-doc__toc-link', onclick: () => go(t.id) }, t.label);
        links.set(t.id, b);
        return h('li', null, b);
      })));
  }
  const el = h('article', { class: cx('ui-doc', o.class), id: o.id },
    pageHeader({ title: o.title, lede: o.lede, meta: o.meta, actions: o.actions, class: 'ui-doc__head' }),
    h('div', { class: cx('ui-doc__grid', !toc && 'ui-doc__grid--solo') }, toc, main));

  // Scroll-spy: the topmost visible section is current.
  let io: IntersectionObserver | null = null;
  if (toc && typeof IntersectionObserver === 'function') {
    const visible = new Set<string>();
    io = new IntersectionObserver(entries => {
      for (const e of entries) { if (e.isIntersecting) visible.add(e.target.id); else visible.delete(e.target.id); }
      const first = tocItems.find(t => visible.has(t.id));
      if (first) setCurrent(first.id);
    }, { rootMargin: '-80px 0px -55% 0px' });
    for (const t of tocItems) { const n = main.querySelector('#' + CSS.escape(t.id)); if (n) io.observe(n); }
  }
  if (tocItems[0]) setCurrent(tocItems[0].id);

  return { el, main, toc, links, go, destroy() { io?.disconnect(); io = null; } };
}

// ---- split -------------------------------------------------------------------------------------

export interface SplitOptions {
  /** Usually two screen bezels (radar + RWR). */
  items: Child[];
  /** CSS grid columns when side by side (default equal). */
  columns?: string;
  /** Stack to one column when the split itself is narrower than this (px, default 480). */
  stackBelow?: 480 | 620 | 760;
  class?: string;
  id?: string;
}

/** Side-by-side displays that stack when their own container is narrow (container query). */
export function split(o: SplitOptions): HTMLElement {
  const grid = h('div', { class: 'ui-split__grid' }, o.items);
  if (o.columns) grid.style.setProperty('--split-cols', o.columns);
  return h('div', { class: cx('ui-split', 'ui-split--' + (o.stackBelow ?? 480), o.class), id: o.id }, grid);
}
