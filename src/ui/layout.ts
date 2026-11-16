/**
 * Page layouts: labLayout (one-screen tool: 3D viewport, side console, display strip), docLayout
 * (reading page with a 65ch measure and a side contents list) and split (display + display).
 */
import { h, append, setAttr, cx, cleanup, type Child } from './dom';

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
  /** Contents placard (default 'Contents'); also the nav's accessible name unless `tocLabel` is set. */
  tocTitle?: string;
  /** Accessible name of the contents nav when the placard alone is terse ('Reference sections'). */
  tocLabel?: string;
  /** Extra content at the top of the contents panel, under its placard. */
  tocHeader?: Child;
  /**
   * Content above the contents panel and outside its nav landmark (a search box). Wide screens: one sticky side
   * column under the top bar. Narrow screens: it stays above the text and the contents become one sticky row.
   */
  side?: Child;
  /** The section marked current changed: the reading position moved, a jump, or a refresh that hid sections. */
  onCurrent?(id: string): void;
  id?: string;
  class?: string;
}
export interface DocJumpOptions {
  /** Smooth scroll (default true; reduced motion always jumps). */
  smooth?: boolean;
  /** Move keyboard focus to the section heading (default true, as for a contents click or Enter). */
  focus?: boolean;
  /** false: only mark the section current, without scrolling (the page already shows it, e.g. a screenshot pre-roll). */
  scroll?: boolean;
}
export interface DocLayoutHandle {
  el: HTMLElement;
  main: HTMLElement;
  toc: HTMLElement | null;
  /** The contents buttons by section id (add count badges). */
  links: ReadonlyMap<string, HTMLButtonElement>;
  /** Scroll to a section by id and mark it current until the reader scrolls on (also used by the contents list). */
  go(id: string, opts?: DocJumpOptions): void;
  /** The section marked current (null when no section is shown). */
  current(): string | null;
  /** After the page changed (a filter hid sections, content grew): list only shown sections, recompute the current. */
  refresh(): void;
  /** Remove the scroll-spy listeners (call in unmount). */
  destroy(): void;
}

/** A shown section's top edge, px from the top of the viewport. */
export interface SectionTop { id: string; top: number }

/**
 * The section a reader is in: the last one whose top has reached the probe line (the bottom of the sticky chrome, px
 * from the viewport top), else the first. At the end of the page a last section too short to reach the line counts
 * once its top is on screen. `tops` in document order, hidden sections left out.
 */
export function sectionInView(tops: readonly SectionTop[], probe: number, view: { height: number; atEnd: boolean }): string | null {
  if (!tops.length) return null;
  let id = tops[0]!.id;
  for (const t of tops) if (t.top <= probe) id = t.id;
  const last = tops[tops.length - 1]!;
  if (view.atEnd && last.top > probe && last.top < view.height) id = last.id;
  return id;
}

/**
 * Reading page: page title, a sticky contents list and a 65ch prose measure. With `side`, the contents share a sticky
 * side column with it on wide screens and become one sticky row on narrow ones; without, a wrapped list on top when
 * narrow. Contents links are buttons that scroll, because the app uses hash routing and a '#id' link would navigate
 * away. The current section follows the reading position; its probe line is each section's CSS scroll-margin-top,
 * so it sits wherever the page's sticky chrome ends.
 */
export function docLayout(o: DocLayoutOptions): DocLayoutHandle {
  const sections = o.sections ?? [];
  const tocItems = o.toc ?? sections.map(s => ({ id: s.id, label: s.title }));
  const main = h('div', { class: 'ui-doc__main ui-prose' },
    o.content ?? null,
    sections.map(s => h('section', { class: 'ui-doc__section', id: s.id, 'aria-labelledby': s.id + '-h' },
      h('h2', { id: s.id + '-h', tabindex: '-1' }, s.title), s.content)));
  const targets = new Map(tocItems.map(t => [t.id, main.querySelector<HTMLElement>('#' + CSS.escape(t.id))]));
  const shown = (id: string) => { const t = targets.get(id); return !!t && !t.hidden; };

  const links = new Map<string, HTMLButtonElement>();
  let list: HTMLOListElement | null = null;
  let toc: HTMLElement | null = null;
  if (tocItems.length) {
    list = h('ol', null, tocItems.map(t => {
      const b = h('button', { type: 'button', class: 'ui-doc__toc-link', onclick: () => go(t.id) }, t.label);
      links.set(t.id, b);
      return h('li', null, b);
    }));
    toc = h('nav', { class: 'ui-doc__toc', 'aria-label': o.tocLabel ?? o.tocTitle ?? 'Contents' },
      h('div', { class: 'ui-placard ui-doc__toc-title', 'aria-hidden': 'true' }, o.tocTitle ?? 'Contents'),
      o.tocHeader !== undefined && o.tocHeader !== null ? h('div', { class: 'ui-doc__toc-header' }, o.tocHeader) : null,
      list);
  }
  const side = o.side !== undefined && o.side !== null ? h('div', { class: 'ui-doc__side' }, o.side, toc) : toc;
  const el = h('article', { class: cx('ui-doc', side && side !== toc && 'ui-doc--side', o.class), id: o.id },
    pageHeader({ title: o.title, lede: o.lede, meta: o.meta, actions: o.actions, class: 'ui-doc__head' }),
    h('div', { class: cx('ui-doc__grid', !side && 'ui-doc__grid--solo') }, side, main));

  // ---- the current section
  let current: string | null = null;
  /** A jump holds its section current until the reader scrolls on (the end of the page may never reach it). */
  let hold: string | null = null;
  /** Where the jump's scroll came to rest: moving away from it (a scrollbar drag) also lets go. */
  let holdY: number | null = null;

  // Narrow screens: the contents row scrolls sideways. Keep the current link in view; fade the edge that hides more.
  const syncOverflow = () => {
    if (!list) return;
    const max = list.scrollWidth - list.clientWidth;
    list.dataset.overflow = max <= 1 ? 'none' : list.scrollLeft <= 1 ? 'end' : list.scrollLeft >= max - 1 ? 'start' : 'both';
  };
  const reveal = (id: string) => {
    const li = links.get(id)?.parentElement;
    if (!list || !li || list.scrollWidth <= list.clientWidth + 1) return;
    const r = li.getBoundingClientRect(), s = list.getBoundingClientRect();
    list.scrollLeft += (r.left - s.left) - (s.width - r.width) / 2;
    syncOverflow();
  };
  const setCurrent = (id: string | null) => {
    if (id === current) return;
    current = id;
    for (const [k, b] of links) setAttr(b, 'aria-current', k === id ? 'true' : null);
    if (id) { reveal(id); o.onCurrent?.(id); }
  };

  let frame = 0;
  const measure = () => {
    frame = 0;
    if (hold && shown(hold)) { setCurrent(hold); return; }
    hold = null;
    const tops: SectionTop[] = [];
    let probe = 0;
    for (const t of tocItems) {
      const n = targets.get(t.id);
      if (!n || n.hidden || !n.getClientRects().length) continue;
      if (!tops.length) probe = (parseFloat(getComputedStyle(n).scrollMarginTop) || 0) + 8;
      tops.push({ id: t.id, top: n.getBoundingClientRect().top });
    }
    if (!tops.length) return;
    const root = document.scrollingElement ?? document.documentElement;
    const atEnd = window.scrollY + window.innerHeight >= root.scrollHeight - 2;
    setCurrent(sectionInView(tops, probe, { height: window.innerHeight, atEnd }));
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };

  const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const go = (id: string, opts: DocJumpOptions = {}) => {
    const target = targets.get(id) ?? main.querySelector<HTMLElement>('#' + CSS.escape(id));
    if (!target || target.hidden) return;
    const smooth = opts.scroll !== false && opts.smooth !== false && !reduced();
    if (opts.scroll !== false) target.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
    if (opts.focus !== false) {
      const focusable = target.matches('h1, h2, h3, h4') ? target : target.querySelector<HTMLElement>('h2, h3');
      if (focusable) { if (!focusable.hasAttribute('tabindex')) focusable.setAttribute('tabindex', '-1'); focusable.focus({ preventScroll: true }); }
    }
    if (links.has(id)) { hold = id; holdY = smooth ? null : window.scrollY; setCurrent(id); }
  };

  const bag = cleanup();
  if (toc) {
    const release = () => { if (hold) { hold = null; holdY = null; schedule(); } };
    for (const type of ['wheel', 'touchstart', 'keydown', 'pointerdown']) bag.on(window, type, release, { capture: true, passive: true });
    bag.on(window, 'scrollend', () => { if (hold && holdY === null) holdY = window.scrollY; }, { passive: true });
    bag.on(window, 'scroll', () => {
      if (hold && holdY !== null && Math.abs(window.scrollY - holdY) > 4) release();
      schedule();
    }, { passive: true });
    bag.on(window, 'resize', () => { syncOverflow(); schedule(); }, { passive: true });
    if (list) bag.on(list, 'scroll', syncOverflow, { passive: true });
    bag.add(() => { cancelAnimationFrame(frame); frame = 0; });
    const first = tocItems.find(t => shown(t.id));
    if (first) setCurrent(first.id);
    // The page appends the layout after this returns: measure once it is in the document.
    schedule();
  }

  return {
    el, main, toc, links, go,
    current: () => current,
    refresh() {
      for (const [id, b] of links) { const li = b.parentElement; if (li) li.hidden = !shown(id); }
      if (hold && !shown(hold)) { hold = null; holdY = null; }
      syncOverflow();
      measure();
    },
    destroy() { bag.dispose(); },
  };
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
