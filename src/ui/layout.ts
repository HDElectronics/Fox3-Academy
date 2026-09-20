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
  /** On phones, show World / Displays / Controls as keyboard-accessible tabs. Opt-in. */
  mobileTabs?: boolean;
  /** Primary phone actions pinned to the bottom of the scrolling lab. Hidden above 900 px. */
  mobileActions?: Child;
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
  /** Select a phone tab and move focus to its tab. No-op for a missing Displays panel. */
  focus(panel: 'world' | 'displays' | 'controls'): void;
  /** Remove responsive observers and tab listeners. Safe to call more than once. */
  destroy(): void;
}

type LabPanel = 'world' | 'displays' | 'controls';
let labId = 0;

/** @internal Roving-tab target used by labLayout's phone tab list. */
export function labTabTarget(key: string, index: number, length: number): number {
  if (length < 1 || index < 0 || index >= length) return -1;
  if (key === 'ArrowRight' || key === 'ArrowDown') return (index + 1) % length;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (index - 1 + length) % length;
  if (key === 'Home') return 0;
  if (key === 'End') return length - 1;
  return -1;
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
  const uid = o.id ?? `ui-lab-${++labId}`;
  const panels: Partial<Record<LabPanel, HTMLElement>> = { world: view, controls: consoleEl };
  if (hasStrip) panels.displays = strip;
  const panelLabels: Record<LabPanel, string> = { world: 'World', displays: 'Displays', controls: 'Controls' };
  const available = (['world', 'displays', 'controls'] as const).filter(p => panels[p]);
  const tabButtons = new Map<LabPanel, HTMLButtonElement>();
  const tabs = o.mobileTabs ? h('div', {
    class: 'ui-lab__mobile-tabs', role: 'tablist', 'aria-label': 'Lab panels',
  }, available.map(panel => {
    const button = h('button', {
      class: 'ui-lab__mobile-tab', type: 'button', role: 'tab',
      id: `${uid}-tab-${panel}`, 'aria-controls': `${uid}-panel-${panel}`,
    }, panelLabels[panel]);
    tabButtons.set(panel, button);
    return button;
  })) : null;
  const actions = o.mobileActions !== undefined && o.mobileActions !== null && o.mobileActions !== false
    ? h('div', { class: 'ui-lab__mobile-actions', 'aria-label': 'Primary actions' }, o.mobileActions)
    : null;
  tabs?.style.setProperty('--lab-mobile-tab-count', String(available.length));
  const el = h('div', {
    class: cx('ui-lab', head && 'has-head', hasStrip && 'has-strip', o.mobileTabs && 'has-mobile-tabs', actions && 'has-mobile-actions', o.class), id: o.id,
    dataset: { mobile: o.mobileOrder ?? 'strip-first' },
  }, head, tabs, view, hasStrip ? strip : null, consoleEl, actions);

  let selected: LabPanel = 'world';
  let mobile = false;
  let destroyed = false;
  let resizeFrame = 0;
  let media: MediaQueryList | null = null;
  let ro: ResizeObserver | null = null;
  const cleanups: (() => void)[] = [];

  const refreshVisiblePanel = () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      const panel = panels[selected];
      if (!panel || panel.hidden) return;
      // Stage and display canvases also observe their own containers. This resize covers renderers
      // that only listen at window level after returning from display:none.
      window.dispatchEvent(new Event('resize'));
    });
  };
  const select = (panel: LabPanel, moveFocus: boolean) => {
    if (!panels[panel]) return;
    selected = panel;
    el.dataset.mobilePanel = panel;
    for (const name of available) {
      const active = name === panel;
      const button = tabButtons.get(name);
      if (button) {
        button.setAttribute('aria-selected', String(active));
        button.tabIndex = active ? 0 : -1;
      }
      const content = panels[name]!;
      content.hidden = mobile && !active;
    }
    if (moveFocus && mobile) tabButtons.get(panel)?.focus();
    if (mobile) refreshVisiblePanel();
  };
  const syncMode = (matches: boolean) => {
    mobile = matches;
    for (const name of available) {
      const content = panels[name]!;
      if (mobile) {
        content.id = `${uid}-panel-${name}`;
        content.setAttribute('role', 'tabpanel');
        content.setAttribute('aria-labelledby', `${uid}-tab-${name}`);
      } else {
        content.hidden = false;
        content.removeAttribute('role');
        content.removeAttribute('aria-labelledby');
      }
    }
    if (mobile) select(selected, false);
    else refreshVisiblePanel();
  };

  if (o.mobileTabs && tabs) {
    for (const panel of available) {
      const button = tabButtons.get(panel)!;
      const click = () => select(panel, false);
      button.addEventListener('click', click);
      cleanups.push(() => button.removeEventListener('click', click));
    }
    const keydown = (event: KeyboardEvent) => {
      const index = available.findIndex(p => tabButtons.get(p) === event.target);
      if (index < 0) return;
      const next = labTabTarget(event.key, index, available.length);
      if (next < 0) return;
      event.preventDefault();
      // Keep page-level flight/radar bindings from seeing navigation intended for this tab list.
      event.stopPropagation();
      select(available[next], true);
    };
    tabs.addEventListener('keydown', keydown);
    cleanups.push(() => tabs.removeEventListener('keydown', keydown));

    media = matchMedia('(max-width: 900px)');
    const mediaChange = (event: MediaQueryListEvent) => syncMode(event.matches);
    media.addEventListener('change', mediaChange);
    cleanups.push(() => media?.removeEventListener('change', mediaChange));
    syncMode(media.matches);

    if (typeof ResizeObserver === 'function') {
      ro = new ResizeObserver(entries => {
        if (!mobile || !entries.some(entry => entry.target === panels[selected])) return;
        refreshVisiblePanel();
      });
      for (const panel of available) ro.observe(panels[panel]!);
    }
  }

  const handle: LabLayoutHandle = {
    el, view, console: consoleEl, strip,
    overlay(corner, ...children) {
      let hud = huds[corner];
      if (!hud) { hud = h('div', { class: `ui-lab__hud ui-lab__hud--${corner}` }); huds[corner] = hud; view.append(hud); }
      append(hud, children);
      return hud;
    },
    focus(panel) { select(panel, true); },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(resizeFrame);
      resizeFrame = 0;
      ro?.disconnect();
      ro = null;
      while (cleanups.length) cleanups.pop()?.();
      media = null;
    },
  };
  return handle;
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
