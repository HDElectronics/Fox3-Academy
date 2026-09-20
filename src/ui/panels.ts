/**
 * Cockpit panels: console panels, black-glass screen bezels, the coach box, step checklist, event
 * log, readout rows, callouts, annunciator lamps, result modal, toasts and data tables.
 * Every factory returns { el, ...small handle }. Styles live in src/styles/components.css.
 */
import { h, append, setText, setAttr, cx, srOnly, type Child } from './dom';
import { kbd } from './keys';
import { button } from './controls';

export type Tone = 'caution' | 'warning' | 'ok' | 'hi' | 'dim';

/** Sim seconds → 'mm:ss' for log stamps. */
const mmss = (s: number) => {
  const t = Math.max(0, Math.floor(s));
  return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
};

// ---- console panel -----------------------------------------------------------------------------

export interface ConsolePanelOptions {
  title: Child;
  id?: string;
  /** Small controls at the right of the title row (e.g. a reset button). */
  actions?: Child;
  children?: Child;
  /** Tighter padding for dense consoles. */
  dense?: boolean;
  /** Show the four quarter-turn fasteners in the corners (default true). */
  fasteners?: boolean;
  class?: string;
}
export interface ConsolePanelHandle {
  el: HTMLElement;
  body: HTMLElement;
  setTitle(title: Child): void;
}

/** A cockpit-painted panel with a placard title, as on a side console. */
export function consolePanel(o: ConsolePanelOptions): ConsolePanelHandle {
  const titleId = o.id ? o.id + '-title' : undefined;
  const title = h('h3', { class: 'ui-console__title', id: titleId }, o.title);
  const body = h('div', { class: 'ui-console__body' }, o.children ?? null);
  const el = h('section', {
    class: cx('ui-console', o.dense && 'ui-console--dense', o.fasteners === false && 'ui-console--plain', o.class),
    id: o.id, 'aria-labelledby': titleId,
  },
  h('header', { class: 'ui-console__head' }, title, o.actions ? h('div', { class: 'ui-console__actions' }, o.actions) : null),
  body);
  return { el, body, setTitle(t) { title.replaceChildren(); append(title, [t]); } };
}

// ---- screen bezel ------------------------------------------------------------------------------

export type Corner = 'tl' | 'tr' | 'bl' | 'br';
export interface ScreenBezelOptions {
  /** Placard on the frame, e.g. 'RADAR' or 'SPO-15'. */
  label: Child;
  id?: string;
  /** What the glass hosts: a canvas, a 3D container, anything. Sized to fill the glass. */
  content?: HTMLElement | null;
  /** Readouts in the glass corners (phosphor mono text). */
  corners?: Partial<Record<Corner, Child>>;
  /** Glass aspect ratio as CSS (e.g. '1', '4 / 3'). Omit to let the container decide the height. */
  aspect?: string;
  /** Right side of the frame's label row (e.g. a mode readout or a small toggle). */
  status?: Child;
  /** Row under the glass (e.g. soft keys / small controls). */
  footer?: Child;
  class?: string;
}
export interface ScreenBezelHandle {
  el: HTMLElement;
  /** The black glass; position: relative, overflow hidden. */
  glass: HTMLElement;
  setCorner(corner: Corner, content: Child): void;
  setLabel(label: Child): void;
  setStatus(status: Child): void;
}

/** A black-glass display in a dark frame with a placard label, hosting a canvas or 3D view. */
export function screenBezel(o: ScreenBezelOptions): ScreenBezelHandle {
  const label = h('span', { class: 'ui-bezel__label', id: o.id ? o.id + '-label' : undefined }, o.label);
  const status = h('span', { class: 'ui-bezel__status' }, o.status ?? null);
  const corners: Record<Corner, HTMLElement> = {
    tl: h('div', { class: 'ui-bezel__corner ui-bezel__corner--tl' }),
    tr: h('div', { class: 'ui-bezel__corner ui-bezel__corner--tr' }),
    bl: h('div', { class: 'ui-bezel__corner ui-bezel__corner--bl' }),
    br: h('div', { class: 'ui-bezel__corner ui-bezel__corner--br' }),
  };
  const glass = h('div', { class: 'ui-bezel__glass' }, o.content ?? null, Object.values(corners));
  if (o.aspect) { glass.style.setProperty('--bezel-aspect', o.aspect); glass.classList.add('has-aspect'); }
  const el = h('figure', {
    class: cx('ui-bezel', o.class), id: o.id, 'aria-labelledby': o.id ? o.id + '-label' : undefined,
  },
  h('figcaption', { class: 'ui-bezel__head' }, label, status),
  glass,
  o.footer ? h('div', { class: 'ui-bezel__foot' }, o.footer) : null);
  const setCorner = (c: Corner, content: Child) => {
    const node = corners[c];
    if (typeof content === 'string' || typeof content === 'number') setText(node, String(content));
    else { node.replaceChildren(); append(node, [content]); }
  };
  for (const [c, v] of Object.entries(o.corners ?? {}) as [Corner, Child][]) setCorner(c, v);
  return {
    el, glass, setCorner,
    setLabel(l) { label.replaceChildren(); append(label, [l]); },
    setStatus(s) { status.replaceChildren(); append(status, [s]); },
  };
}

// ---- coach box ---------------------------------------------------------------------------------

export interface CoachOptions {
  id?: string;
  /** Title placard, default 'NOW'. */
  title?: string;
  text?: Child;
  why?: Child;
  tone?: Tone | null;
  class?: string;
}
export interface CoachHandle {
  el: HTMLElement;
  /** Update the advice; cheap when unchanged (text compared as strings). */
  set(text: Child, why?: Child, tone?: Tone | null): void;
  setTone(tone: Tone | null): void;
  /** Change the title placard (e.g. the exercise name, 'A · MISS · OUT OF ENERGY'). Cheap when unchanged. */
  setTitle(title: string): void;
}

/** "What to do now + why" box. Polite live region; the lamp blinks once when the advice changes. */
export function coachBox(o: CoachOptions = {}): CoachHandle {
  const text = h('p', { class: 'ui-coach__text' });
  const why = h('p', { class: 'ui-coach__why' });
  const title = h('span', { class: 'ui-coach__title' }, o.title ?? 'NOW');
  const el = h('section', { class: cx('ui-coach', o.class), id: o.id, role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' },
    h('header', { class: 'ui-coach__head' }, h('span', { class: 'ui-coach__lamp', 'aria-hidden': 'true' }), title),
    text, why);
  let lastKey = '';
  const fill = (node: HTMLElement, c: Child) => {
    if (typeof c === 'string' || typeof c === 'number') setText(node, String(c));
    else { node.replaceChildren(); append(node, [c]); }
  };
  const keyOf = (c: Child) => (typeof c === 'string' || typeof c === 'number' ? String(c) : c === null || c === undefined || c === false ? '' : null);
  const handle: CoachHandle = {
    el,
    set(t, w, tone) {
      const kt = keyOf(t), kw = keyOf(w ?? null);
      const key = kt !== null && kw !== null ? kt + '\u0000' + kw : null;
      if (tone !== undefined) handle.setTone(tone);
      if (key !== null && key === lastKey) return;
      lastKey = key ?? '';
      fill(text, t);
      fill(why, w ?? null);
      why.hidden = !w;
      el.classList.remove('is-new');
      void el.offsetWidth; // restart the blink
      el.classList.add('is-new');
    },
    setTone(tone) { setAttr(el, 'data-tone', tone ?? null); },
    setTitle(t) { setText(title, t); },
  };
  handle.set(o.text ?? '', o.why ?? null, o.tone ?? null);
  el.classList.remove('is-new');
  return handle;
}

// ---- step checklist ----------------------------------------------------------------------------

export interface StepDef { id?: string; text: Child; keys?: string; note?: Child }
export interface ChecklistOptions {
  id?: string;
  steps: StepDef[];
  /** Ids (or indexes) already done. */
  done?: (string | number)[];
  class?: string;
}
export interface ChecklistHandle {
  el: HTMLOListElement;
  setDone(step: string | number, done?: boolean): void;
  isDone(step: string | number): boolean;
  /** Highlight the step to do now (null clears). */
  setCurrent(step: string | number | null): void;
  reset(): void;
  readonly doneCount: number;
  readonly total: number;
}

/** Ordered steps with a done tick; the current step is highlighted (aria-current="step"). */
export function checklist(o: ChecklistOptions): ChecklistHandle {
  const items = o.steps.map((s, i) => {
    const sr = srOnly('');
    const li = h('li', { class: 'ui-step', id: o.id && s.id ? `${o.id}-${s.id}` : undefined },
      h('span', { class: 'ui-step__mark', 'aria-hidden': 'true' }, h('span', { class: 'ui-step__num' }, String(i + 1))),
      h('div', { class: 'ui-step__body' },
        h('span', { class: 'ui-step__text' }, s.text),
        s.keys ? kbd(s.keys) : null,
        s.note ? h('span', { class: 'ui-step__note' }, s.note) : null,
        sr));
    return { li, sr, id: s.id };
  });
  const find = (k: string | number) => (typeof k === 'number' ? items[k] : items.find(x => x.id === k));
  const el = h('ol', { class: cx('ui-steps', o.class), id: o.id }, items.map(x => x.li));
  const handle: ChecklistHandle = {
    el,
    setDone(k, done = true) {
      const it = find(k); if (!it) return;
      it.li.classList.toggle('is-done', done);
      setText(it.sr, done ? ' (done)' : '');
    },
    isDone(k) { return !!find(k)?.li.classList.contains('is-done'); },
    setCurrent(k) {
      const it = k === null ? undefined : find(k);
      for (const x of items) setAttr(x.li, 'aria-current', x === it ? 'step' : null);
    },
    reset() { for (let i = 0; i < items.length; i++) handle.setDone(i, false); handle.setCurrent(null); },
    get doneCount() { return items.filter(x => x.li.classList.contains('is-done')).length; },
    get total() { return items.length; },
  };
  for (const k of o.done ?? []) handle.setDone(k, true);
  return handle;
}

// ---- event log ---------------------------------------------------------------------------------

export interface EventLogOptions {
  id?: string;
  /** Newest entries kept (default 40). */
  max?: number;
  /** Placard title above the log (optional). */
  title?: Child;
  /** Announce new lines to screen readers (default false; sim logs are chatty). */
  live?: boolean;
  /** Text when empty. */
  empty?: string;
  class?: string;
}
export interface EventLogHandle {
  el: HTMLElement;
  /** Add a line at the top. t = sim seconds shown as mm:ss. */
  push(text: Child, opts?: { t?: number; tone?: Tone }): void;
  clear(): void;
  readonly size: number;
}

/** Monospace event log, latest first, capped. */
export function eventLog(o: EventLogOptions = {}): EventLogHandle {
  const max = o.max ?? 40;
  const list = h('ol', { class: 'ui-log__list', role: 'log', 'aria-live': o.live ? 'polite' : 'off', 'aria-label': typeof o.title === 'string' ? o.title : 'Event log' });
  const emptyEl = h('p', { class: 'ui-log__empty' }, o.empty ?? 'No events yet.');
  const el = h('div', { class: cx('ui-log', o.class), id: o.id },
    o.title ? h('div', { class: 'ui-placard ui-log__title' }, o.title) : null, emptyEl, list);
  const handle: EventLogHandle = {
    el,
    push(text, opts = {}) {
      const li = h('li', { class: cx('ui-log__row', opts.tone && 'is-' + opts.tone) },
        opts.t !== undefined ? h('span', { class: 'ui-log__t' }, mmss(opts.t)) : null,
        h('span', { class: 'ui-log__msg' }, text));
      list.prepend(li);
      while (list.children.length > max) list.lastElementChild?.remove();
      emptyEl.hidden = true;
    },
    clear() { list.replaceChildren(); emptyEl.hidden = false; },
    get size() { return list.children.length; },
  };
  return handle;
}

// ---- readouts ----------------------------------------------------------------------------------

export interface ReadoutRow { id: string; label: Child; value?: string; unit?: string; title?: string }
export interface ReadoutsOptions {
  id?: string;
  rows: ReadoutRow[];
  /** 'panel': ink on the painted panel (default). 'glass': phosphor digits on a black window. */
  variant?: 'panel' | 'glass';
  /** Two label/value pairs per line on wide containers. */
  columns?: 1 | 2;
  class?: string;
}
export interface ReadoutsHandle {
  el: HTMLDListElement;
  /** Cheap when unchanged; call every frame if you like (throttle to ~10 Hz anyway). */
  set(id: string, value: string, unit?: string): void;
  setTone(id: string, tone: Tone | null): void;
  row(id: string): HTMLElement | undefined;
}

/** Label / value rows with tabular numbers, like an instrument data block. */
export function readouts(o: ReadoutsOptions): ReadoutsHandle {
  const rows = new Map<string, { row: HTMLElement; val: HTMLElement; unit: HTMLElement }>();
  const el = h('dl', { class: cx('ui-readouts', 'ui-readouts--' + (o.variant ?? 'panel'), o.columns === 2 && 'ui-readouts--2col', o.class), id: o.id });
  for (const r of o.rows) {
    const val = h('span', { class: 'ui-readout__num' }, r.value ?? '—');
    const unit = h('span', { class: 'ui-readout__unit' }, r.unit ?? '');
    const row = h('div', { class: 'ui-readout', dataset: { id: r.id }, title: r.title },
      h('dt', { class: 'ui-readout__label' }, r.label),
      h('dd', { class: 'ui-readout__value' }, h('span', { class: 'ui-readout__lamp', 'aria-hidden': 'true' }), val, unit));
    rows.set(r.id, { row, val, unit });
    el.append(row);
  }
  return {
    el,
    set(id, value, unitText) {
      const r = rows.get(id); if (!r) return;
      setText(r.val, value);
      if (unitText !== undefined) setText(r.unit, unitText);
    },
    setTone(id, tone) { const r = rows.get(id); if (r) setAttr(r.row, 'data-tone', tone ?? null); },
    row(id) { return rows.get(id)?.row; },
  };
}

// ---- callout -----------------------------------------------------------------------------------

export interface CalloutOptions {
  /** 'simplified' → "Simplified here", 'dcs' → "In DCS", 'real' → "Real jet", 'note' → your title. */
  kind: 'simplified' | 'dcs' | 'real' | 'note';
  title?: Child;
  body: Child;
  id?: string;
  class?: string;
}
const CALLOUT_TITLE = { simplified: 'Simplified here', dcs: 'In DCS', real: 'Real jet', note: 'Note' } as const;

/** Honest side notes: where the trainer simplifies, what DCS does, how the real jet differs. */
export function callout(o: CalloutOptions): HTMLElement {
  return h('aside', { class: cx('ui-callout', 'ui-callout--' + o.kind, o.class), id: o.id },
    h('div', { class: 'ui-callout__title' }, o.title ?? CALLOUT_TITLE[o.kind]),
    h('div', { class: 'ui-callout__body' }, o.body));
}

// ---- annunciator lamp --------------------------------------------------------------------------

export type LampState = 'off' | 'on' | 'flash';
export interface LampOptions {
  label: string;
  /** Lamp colour when lit: caution amber, warning red, ok green, hi (designation amber-yellow), advisory (--btn-on). */
  tone?: 'caution' | 'warning' | 'ok' | 'hi' | 'advisory';
  state?: LampState;
  id?: string;
  title?: string;
  class?: string;
}
export interface LampHandle {
  el: HTMLElement;
  readonly state: LampState;
  set(state: LampState | boolean): void;
}

/** Annunciator legend (LOCK, LAUNCH, ПР, SHOOT). Flashing becomes steady with reduced motion. */
export function lamp(o: LampOptions): LampHandle {
  let state: LampState = o.state ?? 'off';
  const sr = srOnly('');
  const el = h('span', { class: cx('ui-lamp', o.class), id: o.id, title: o.title, dataset: { tone: o.tone ?? 'caution' } },
    h('span', { class: 'ui-lamp__legend' }, o.label), sr);
  const render = () => { el.dataset.state = state; setText(sr, state === 'off' ? ' off' : state === 'flash' ? ' flashing' : ' on'); };
  render();
  return {
    el,
    get state() { return state; },
    set(s) { const n: LampState = s === true ? 'on' : s === false ? 'off' : s; if (n !== state) { state = n; render(); } },
  };
}

// ---- modal / result overlay --------------------------------------------------------------------

export interface ModalAction {
  label: Child;
  onClick?: () => void;
  primary?: boolean;
  keys?: string;
  id?: string;
  /** Close the modal after onClick (default true). */
  closes?: boolean;
}
export interface ModalOptions {
  title: Child;
  body?: Child;
  actions?: ModalAction[];
  id?: string;
  /** Mount inside this element as an overlay (e.g. over the 3D viewport). Default: document.body, full screen. */
  within?: HTMLElement;
  /** Escape / backdrop click / close button close it (default true). */
  dismissable?: boolean;
  /** Lamp tone next to the title (e.g. 'ok' for a kill, 'warning' for a loss). */
  tone?: Tone | null;
  onClose?: () => void;
  /** Open immediately (default false). */
  open?: boolean;
  class?: string;
}
export interface ModalHandle {
  el: HTMLElement;
  dialog: HTMLElement;
  body: HTMLElement;
  readonly isOpen: boolean;
  open(): void;
  close(): void;
  setTitle(title: Child): void;
  setBody(body: Child): void;
  setTone(tone: Tone | null): void;
  /** Close and remove from the DOM (call in unmount). */
  destroy(): void;
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Result overlay / modal dialog: focus moves in and is trapped, Escape closes, focus returns to
 * where it was. With `within`, it covers only that element (which gets position: relative).
 */
export function modal(o: ModalOptions): ModalHandle {
  const dismissable = o.dismissable !== false;
  const titleId = (o.id ?? 'ui-modal') + '-title';
  const title = h('h2', { class: 'ui-modal__title', id: titleId }, o.title);
  const body = h('div', { class: 'ui-modal__body' }, o.body ?? null);
  let isOpen = false;
  let returnTo: HTMLElement | null = null;
  const closeBtn = dismissable
    ? h('button', { type: 'button', class: 'ui-modal__x', 'aria-label': 'Close', onclick: () => close() }, h('span', { 'aria-hidden': 'true' }, '×'))
    : null;
  const actions = (o.actions ?? []).map(a => button({
    label: a.label, id: a.id, keys: a.keys, variant: a.primary ? 'primary' : 'cap',
    onClick: () => { a.onClick?.(); if (a.closes !== false) close(); },
  }).el);
  const dialog = h('div', { class: 'ui-modal__dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, id: o.id, tabindex: '-1' },
    h('header', { class: 'ui-modal__head' }, h('span', { class: 'ui-modal__lamp', 'aria-hidden': 'true' }), title, closeBtn),
    body,
    actions.length ? h('footer', { class: 'ui-modal__actions' }, actions) : null);
  const el = h('div', { class: cx('ui-modal', o.within && 'ui-modal--within', o.class), hidden: true },
    h('div', { class: 'ui-modal__backdrop', onclick: () => { if (dismissable) close(); } }),
    dialog);

  const focusables = () => [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(x => x.getClientRects().length > 0);
  dialog.addEventListener('keydown', e => {
    if (e.key === 'Escape' && dismissable) { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab') return;
    const f = focusables();
    if (!f.length) { e.preventDefault(); dialog.focus(); return; }
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  // Tab from outside (or a click on the page behind a `within` overlay) brings focus back inside.
  const onFocusIn = (e: FocusEvent) => { if (isOpen && !dialog.contains(e.target as Node)) dialog.focus(); };

  function open() {
    if (isOpen) return;
    const host = o.within ?? document.body;
    if (!el.isConnected) host.append(el);
    if (o.within && getComputedStyle(o.within).position === 'static') o.within.style.position = 'relative';
    returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    el.hidden = false; isOpen = true;
    document.addEventListener('focusin', onFocusIn);
    const first = dialog.querySelector<HTMLElement>('.ui-modal__actions .ui-btn--primary') ?? focusables()[0];
    (first ?? dialog).focus();
  }
  function close() {
    if (!isOpen) return;
    isOpen = false; el.hidden = true;
    document.removeEventListener('focusin', onFocusIn);
    if (returnTo && returnTo.isConnected) returnTo.focus();
    returnTo = null;
    o.onClose?.();
  }
  const handle: ModalHandle = {
    el, dialog, body,
    get isOpen() { return isOpen; },
    open, close,
    setTitle(t) { title.replaceChildren(); append(title, [t]); },
    setBody(b) { body.replaceChildren(); append(body, [b]); },
    setTone(t) { setAttr(dialog, 'data-tone', t ?? null); },
    destroy() {
      if (isOpen) { isOpen = false; document.removeEventListener('focusin', onFocusIn); }
      el.remove();
    },
  };
  handle.setTone(o.tone ?? null);
  if (o.open) handle.open();
  return handle;
}

// ---- toast -------------------------------------------------------------------------------------

export interface ToastOptions {
  tone?: Tone;
  /** Milliseconds on screen (default 3200; 0 = until dismissed). */
  ms?: number;
  /** Put the toast stack inside this element instead of the page (bottom centre). */
  within?: HTMLElement;
}

/**
 * Short status message at the bottom ("Designated T2", "Chaff: 0 left"). Returns dismiss().
 * The stack element is created on demand and removed when the last toast goes.
 */
export function toast(text: Child, o: ToastOptions = {}): () => void {
  const host = o.within ?? document.body;
  let stack = host.querySelector<HTMLElement>(':scope > .ui-toasts');
  if (!stack) {
    stack = h('div', { class: cx('ui-toasts', o.within && 'ui-toasts--within'), role: 'status', 'aria-live': 'polite' });
    host.append(stack);
  }
  const item = h('div', { class: cx('ui-toast', o.tone && 'is-' + o.tone) }, h('span', { class: 'ui-toast__lamp', 'aria-hidden': 'true' }), h('span', null, text));
  stack.append(item);
  while (stack.children.length > 4) stack.firstElementChild?.remove();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const dismiss = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    const s = item.parentElement;
    item.remove();
    if (s && !s.children.length) s.remove();
  };
  const ms = o.ms ?? 3200;
  if (ms > 0) timer = setTimeout(dismiss, ms);
  return dismiss;
}

/** Remove every toast (call in unmount if the page made long-lived ones). */
export function clearToasts(within: ParentNode = document.body): void {
  within.querySelectorAll(':scope > .ui-toasts').forEach(n => n.remove());
}

// ---- data table --------------------------------------------------------------------------------

export interface TableColumn<R> {
  key: string;
  label: Child;
  /** Cell content; default String(row[key]). */
  cell?: (row: R) => Child;
  /** Right-aligned tabular numbers. */
  num?: boolean;
  /** Mono text (keys, ids). */
  mono?: boolean;
}
export interface TableOptions<R> {
  columns: TableColumn<R>[];
  rows: R[];
  caption?: Child;
  id?: string;
  /** Row highlight test (e.g. the selected jet). */
  highlight?: (row: R) => boolean;
  class?: string;
}

/** A reference table that scrolls sideways inside its own box on narrow screens, never the page. */
export function dataTable<R>(o: TableOptions<R>): HTMLElement {
  const head = h('tr', null, o.columns.map(c => h('th', { scope: 'col', class: cx(c.num && 'is-num') }, c.label)));
  const body = o.rows.map(r => h('tr', { class: o.highlight?.(r) ? 'is-hl' : undefined },
    o.columns.map(c => h('td', { class: cx(c.num && 'is-num', c.mono && 'is-mono') },
      c.cell ? c.cell(r) : String((r as Record<string, unknown>)[c.key] ?? '')))));
  return h('div', { class: cx('ui-table-wrap', o.class), id: o.id, tabindex: '0', role: 'region', 'aria-label': typeof o.caption === 'string' ? o.caption : 'Table' },
    h('table', { class: 'ui-table' }, o.caption ? h('caption', null, o.caption) : null, h('thead', null, head), h('tbody', null, body)));
}
