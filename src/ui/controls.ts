/**
 * Cockpit controls: push-buttons, latching toggles, segmented selectors, sliders with a digital
 * readout, selects, chips and tabs. Every factory returns { el, ...small handle }.
 * set(value) never fires onChange unless you pass emit = true; user input always does.
 * Styles: src/styles/components.css (.ui-btn, .ui-seg, .ui-slider, ...).
 */
import { h, append, setText, setAttr, cx, type Child } from './dom';
import { kbd, ariaShortcut } from './keys';
import { layoutSliderZones, type SliderZones } from './sliderZones';
export type { SliderZoneBand, SliderZoneMark, SliderZones } from './sliderZones';

// ---- shared ------------------------------------------------------------------------------------

/** A placard: small uppercase letter-spaced label, as stencilled on a panel. */
export function placard(text: Child, o: { id?: string; for?: string; tag?: 'span' | 'label' | 'div' } = {}): HTMLElement {
  return h(o.tag ?? (o.for ? 'label' : 'span'), { class: 'ui-placard', id: o.id, for: o.for }, text);
}

/** A titled group of controls (fieldset + placard legend). */
export function group(o: { label: Child; children: Child[]; hint?: Child; inline?: boolean; id?: string; class?: string }): HTMLFieldSetElement {
  return h('fieldset', { class: cx('ui-group', o.inline && 'ui-group--inline', o.class), id: o.id },
    h('legend', { class: 'ui-placard' }, o.label),
    h('div', { class: 'ui-group__body' }, o.children),
    o.hint ? h('p', { class: 'ui-group__hint' }, o.hint) : null);
}

/** Horizontal row of controls that wraps on narrow screens. */
export function row(...children: Child[]): HTMLDivElement {
  return h('div', { class: 'ui-row' }, children);
}

function keyChild(keys: string | undefined): Child {
  return keys ? h('span', { class: 'ui-btn__keys', 'aria-hidden': 'true' }, kbd(keys)) : null;
}

// ---- button ------------------------------------------------------------------------------------

export interface ButtonOptions {
  label: Child;
  id?: string;
  onClick?: (e: MouseEvent) => void;
  /** 'cap' (default dark push-button), 'primary' (lit cap for the main action), 'ghost' (text only). */
  variant?: 'cap' | 'primary' | 'ghost';
  size?: 's' | 'm' | 'l';
  /** DCS key shown on the cap and exposed as aria-keyshortcuts, e.g. 'RAlt+Space'. */
  keys?: string;
  /** Give the cap a lamp strip that setLit() lights (e.g. a SHOOT cue button). */
  lamp?: boolean;
  lit?: boolean;
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
  /** Full width of its container. */
  block?: boolean;
  /** Keep the label's letter case (default: uppercase legend). */
  keepCase?: boolean;
  class?: string;
}
export interface ButtonHandle {
  el: HTMLButtonElement;
  setLabel(label: Child): void;
  setDisabled(disabled: boolean): void;
  /** Light the lamp strip (buttons made with lamp: true) and the legend. */
  setLit(on: boolean): void;
}

export function button(o: ButtonOptions): ButtonHandle {
  const legend = h('span', { class: 'ui-btn__legend' }, o.label);
  const el = h('button', {
    type: 'button', id: o.id, title: o.title, 'aria-label': o.ariaLabel,
    class: cx('ui-btn', 'ui-btn--' + (o.variant ?? 'cap'), o.size && o.size !== 'm' && 'ui-btn--' + o.size,
      o.lamp && 'has-lamp', o.block && 'ui-btn--block', o.keepCase && 'ui-btn--case', o.class),
    'aria-keyshortcuts': o.keys ? ariaShortcut(o.keys) || undefined : undefined,
    disabled: !!o.disabled,
    onclick: o.onClick,
  }, legend, keyChild(o.keys));
  const handle: ButtonHandle = {
    el,
    setLabel(label) { legend.replaceChildren(); append(legend, [label]); },
    setDisabled(d) { el.disabled = d; },
    setLit(on) { setAttr(el, 'data-lit', on ? '' : null); },
  };
  if (o.lit) handle.setLit(true);
  return handle;
}

// ---- toggle ------------------------------------------------------------------------------------

export interface ToggleOptions {
  id: string;
  label: Child;
  value?: boolean;
  onChange?: (value: boolean) => void;
  /** 'lamp': latching push-button, lamp lit when on (aria-pressed). 'switch': toggle lever with ON/OFF legend (role=switch). */
  style?: 'lamp' | 'switch';
  /** Legends for the switch style, default ['OFF', 'ON']. */
  states?: [string, string];
  keys?: string;
  size?: 's' | 'm';
  disabled?: boolean;
  title?: string;
  class?: string;
}
export interface ToggleHandle {
  el: HTMLButtonElement;
  readonly value: boolean;
  set(value: boolean, emit?: boolean): void;
  toggle(emit?: boolean): void;
  setDisabled(disabled: boolean): void;
}

export function toggle(o: ToggleOptions): ToggleHandle {
  let value = !!o.value;
  const style = o.style ?? 'lamp';
  const states = o.states ?? ['OFF', 'ON'];
  const stateEl = h('span', { class: 'ui-switch__state' });
  const el = style === 'switch'
    ? h('button', {
        type: 'button', id: o.id, role: 'switch', title: o.title, disabled: !!o.disabled,
        class: cx('ui-switch', o.class), 'aria-keyshortcuts': o.keys ? ariaShortcut(o.keys) || undefined : undefined,
      },
      h('span', { class: 'ui-switch__slot', 'aria-hidden': 'true' }, h('span', { class: 'ui-switch__lever' })),
      h('span', { class: 'ui-switch__text' }, h('span', { class: 'ui-switch__label' }, o.label), stateEl),
      keyChild(o.keys))
    : h('button', {
        type: 'button', id: o.id, title: o.title, disabled: !!o.disabled,
        class: cx('ui-btn', 'ui-btn--cap', 'has-lamp', o.size === 's' && 'ui-btn--s', o.class),
        'aria-keyshortcuts': o.keys ? ariaShortcut(o.keys) || undefined : undefined,
      },
      h('span', { class: 'ui-btn__legend' }, o.label), keyChild(o.keys));

  const render = () => {
    if (style === 'switch') { el.setAttribute('aria-checked', String(value)); setText(stateEl, value ? states[1] : states[0]); }
    else el.setAttribute('aria-pressed', String(value));
  };
  render();
  const handle: ToggleHandle = {
    el,
    get value() { return value; },
    set(v, emit = false) { if (v === value) return; value = v; render(); if (emit) o.onChange?.(value); },
    toggle(emit = true) { handle.set(!value, emit); },
    setDisabled(d) { el.disabled = d; },
  };
  el.addEventListener('click', () => handle.toggle(true));
  return handle;
}

// ---- segmented ---------------------------------------------------------------------------------

export interface SegOption<T extends string | number> {
  value: T;
  label: Child;
  /** Second line in small type (e.g. frame time under a scan width). */
  sub?: Child;
  title?: string;
  disabled?: boolean;
  keys?: string;
}
export interface SegmentedOptions<T extends string | number> {
  id: string;
  /** Visible placard above the selector (also its accessible name). */
  label?: Child;
  /** Accessible name when there is no visible label. */
  ariaLabel?: string;
  options: SegOption<T>[];
  value: T;
  onChange?: (value: T) => void;
  size?: 's' | 'm';
  /** Stretch segments to fill the row. */
  fill?: boolean;
  class?: string;
}
export interface SegmentedHandle<T extends string | number> {
  el: HTMLElement;
  /** The role=radiogroup element. */
  group: HTMLElement;
  readonly value: T;
  set(value: T, emit?: boolean): void;
  setDisabled(value: T, disabled: boolean): void;
  /**
   * Replace every option (rebuilds the caps). Keyboard focus stays on the segment with the same value
   * when it was focused. For label / sub / title / disabled changes of one segment prefer setOption().
   */
  setOptions(options: SegOption<T>[], value?: T): void;
  /** Update one segment in place (label, sub, title, disabled, keys) without rebuilding the caps or moving focus. */
  setOption(value: T, patch: Partial<Omit<SegOption<T>, 'value'>>): void;
}

/** One-of-N selector (radio group with arrow-key navigation), each segment a push-button cap. */
export function segmented<T extends string | number>(o: SegmentedOptions<T>): SegmentedHandle<T> {
  let options = o.options;
  let value = o.value;
  let buttons: HTMLButtonElement[] = [];
  const labelId = o.id + '-label';
  const group = h('div', {
    class: cx('ui-seg', o.size === 's' && 'ui-seg--s', o.fill && 'ui-seg--fill'), role: 'radiogroup', id: o.id,
    'aria-labelledby': o.label ? labelId : undefined, 'aria-label': o.label ? undefined : o.ariaLabel,
  });
  const el = h('div', { class: cx('ui-field', o.class) }, o.label ? placard(o.label, { id: labelId, tag: 'div' }) : null, group);

  const idx = (v: T) => options.findIndex(x => x.value === v);
  const render = () => {
    const cur = idx(value);
    const focusIdx = cur >= 0 && !options[cur].disabled ? cur : options.findIndex(x => !x.disabled);
    buttons.forEach((b, i) => {
      b.setAttribute('aria-checked', String(i === cur));
      b.tabIndex = i === focusIdx ? 0 : -1;
    });
  };
  const choose = (i: number, focus: boolean) => {
    const opt = options[i];
    if (!opt || opt.disabled) return;
    if (focus) buttons[i].focus();
    if (opt.value === value) return;
    value = opt.value; render(); o.onChange?.(value);
  };
  const inner = (opt: SegOption<T>): Child[] => [
    h('span', { class: 'ui-seg__legend' }, opt.label),
    opt.sub !== undefined && opt.sub !== null ? h('span', { class: 'ui-seg__sub' }, opt.sub) : null,
    keyChild(opt.keys),
  ];
  const build = () => {
    const had = buttons.findIndex(b => b === document.activeElement);
    const hadValue = had >= 0 ? options[had]?.value : undefined;
    buttons = options.map((opt, i) => {
      const b = h('button', {
        type: 'button', role: 'radio', id: `${o.id}-${String(opt.value).replace(/[^\w-]/g, '_')}`,
        class: 'ui-seg__opt', title: opt.title, disabled: !!opt.disabled,
        'aria-keyshortcuts': opt.keys ? ariaShortcut(opt.keys) || undefined : undefined,
        onclick: () => choose(i, false),
      }, inner(opt));
      return b;
    });
    group.replaceChildren(...buttons);
    render();
    if (had >= 0) {
      // Rebuilding removed the focused cap: put focus back on the same value (or the checked one).
      const j = hadValue !== undefined ? idx(hadValue as T) : -1;
      const target = buttons[j >= 0 && !options[j].disabled ? j : buttons.findIndex(b => b.tabIndex === 0)];
      target?.focus();
    }
  };
  group.addEventListener('keydown', e => {
    const i = buttons.indexOf(e.target as HTMLButtonElement);
    if (i < 0) return;
    const step = (dir: 1 | -1, from: number) => {
      for (let k = 1; k <= options.length; k++) {
        const j = (from + dir * k + options.length) % options.length;
        if (!options[j].disabled) return j;
      }
      return from;
    };
    let j = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = step(1, i);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = step(-1, i);
    else if (e.key === 'Home') j = step(1, -1);
    else if (e.key === 'End') j = step(-1, options.length);
    if (j < 0) return;
    e.preventDefault();
    choose(j, true);
  });
  build();

  return {
    el, group,
    get value() { return value; },
    set(v, emit = false) { if (v === value || idx(v) < 0) return; value = v; render(); if (emit) o.onChange?.(value); },
    setDisabled(v, d) {
      const i = idx(v); if (i < 0) return;
      options = options.map((x, k) => (k === i ? { ...x, disabled: d } : x));
      buttons[i].disabled = d; render();
    },
    setOptions(opts, v) {
      const prev = options;
      // Called ~per frame by some pages: skip the rebuild when nothing a cap shows has changed.
      const same = prev.length === opts.length && prev.every((x, i) => {
        const y = opts[i];
        return x.value === y.value && x.label === y.label && x.sub === y.sub && x.title === y.title && !!x.disabled === !!y.disabled && x.keys === y.keys;
      });
      options = opts;
      if (v !== undefined) value = v;
      if (same) render(); else build();
    },
    setOption(v, patch) {
      const i = idx(v); if (i < 0) return;
      const prev = options[i];
      const next: SegOption<T> = { ...prev, ...patch, value: prev.value };
      options = options.map((x, k) => (k === i ? next : x));
      const b = buttons[i];
      if ('label' in patch || 'sub' in patch || 'keys' in patch) {
        if (next.label !== prev.label || next.sub !== prev.sub || next.keys !== prev.keys) b.replaceChildren(...inner(next).filter((c): c is HTMLElement => c instanceof HTMLElement));
      }
      setAttr(b, 'title', next.title ?? null);
      setAttr(b, 'aria-keyshortcuts', next.keys ? ariaShortcut(next.keys) || null : null);
      b.disabled = !!next.disabled;
      render();
    },
  };
}

// ---- slider ------------------------------------------------------------------------------------

export interface SliderOptions {
  id: string;
  label: Child;
  min: number;
  max: number;
  step?: number;
  value: number;
  /** Unit shown after the readout ('km', 'kft', '°'). */
  unit?: string;
  /** Readout text for a value (default: value with the step's decimals). */
  format?: (v: number) => string;
  /** Live, while dragging. */
  onInput?: (v: number) => void;
  /** Committed (pointer released / key pressed). */
  onChange?: (v: number) => void;
  /** Tick marks under the track: values or { value, label }. Change them later with setMarks(). */
  marks?: SliderMark[];
  /** Decorative bands and labeled boundaries below the track, in slider units. */
  zones?: SliderZones;
  /** Readout width in characters so the layout does not jump (default: fits min/max). */
  readoutCh?: number;
  disabled?: boolean;
  hint?: Child;
  class?: string;
}
export interface SliderHandle {
  el: HTMLElement;
  input: HTMLInputElement;
  readonly value: number;
  set(v: number, emit?: boolean): void;
  setUnit(unit: string): void;
  setRange(min: number, max: number, step?: number): void;
  setDisabled(disabled: boolean): void;
  /** Replace the tick marks under the track (e.g. live Rmin / Rne / Rmax). Marks outside min..max are dropped. */
  setMarks(marks: SliderMark[]): void;
  /** Replace or remove the decorative zone band; leaves the native input and focus intact. */
  setZones(zones: SliderZones | null): void;
}

export type SliderMark = number | { value: number; label?: string; title?: string };

const decimals = (step: number) => { const s = String(step); const i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1; };

export function slider(o: SliderOptions): SliderHandle {
  let min = o.min, max = o.max, step = o.step ?? 1, unit = o.unit ?? '';
  const fmt = (v: number) => (o.format ? o.format(v) : v.toFixed(decimals(step)));
  const input = h('input', {
    type: 'range', id: o.id, class: 'ui-slider__input', min, max, step, value: o.value, disabled: !!o.disabled,
    'aria-describedby': o.hint ? o.id + '-hint' : undefined,
  });
  input.value = String(o.value);
  const num = h('span', { class: 'ui-slider__num' });
  const unitEl = h('span', { class: 'ui-slider__unit' });
  const out = h('output', { class: 'ui-slider__readout', for: o.id, id: o.id + '-out' }, num, unitEl);
  const readCh = o.readoutCh ?? Math.max(fmt(min).length, fmt(max).length, 3);
  out.style.setProperty('--ch', String(readCh));
  const marksEl = h('div', { class: 'ui-slider__marks', 'aria-hidden': 'true' });
  const zonesEl = h('div', { class: 'ui-slider-zones', 'aria-hidden': 'true' });
  const el = h('div', { class: cx('ui-slider', o.class) },
    h('div', { class: 'ui-slider__head' }, placard(o.label, { for: o.id }), out),
    h('div', { class: 'ui-slider__track' }, input, marksEl, zonesEl),
    o.hint ? h('p', { class: 'ui-slider__hint', id: o.id + '-hint' }, o.hint) : null);

  const pct = (v: number) => (max > min ? ((v - min) / (max - min)) * 100 : 0);
  let marks: SliderMark[] = o.marks ?? [];
  let marksKey = '';
  const renderMarks = () => {
    const key = min + '|' + max + '|' + JSON.stringify(marks);
    if (key === marksKey) return; // setMarks() is cheap to call every frame
    marksKey = key;
    marksEl.replaceChildren(...marks.flatMap(m => {
      const mv = typeof m === 'number' ? m : m.value;
      if (!Number.isFinite(mv) || mv < min || mv > max) return [];
      const lab = typeof m === 'number' ? fmt(m) : m.label ?? '';
      const tick = h('span', { class: 'ui-slider__mark', title: typeof m === 'number' ? undefined : m.title }, lab ? h('span', null, lab) : null);
      tick.style.setProperty('--p', String(pct(mv)));
      return [tick];
    }));
  };
  let zones = o.zones ?? null;
  let zonesKey = '';
  const renderZones = () => {
    const key = JSON.stringify([min, max, zones]);
    if (key === zonesKey) return;
    zonesKey = key;
    zonesEl.hidden = !zones;
    if (!zones) { zonesEl.replaceChildren(); return; }
    const layout = layoutSliderZones(zones, min, max);
    const bar = h('div', { class: 'ui-slider-zones__bar' });
    const labels = h('div', { class: 'ui-slider-zones__labels' });
    for (const band of layout.bands) {
      const span = h('span', { class: `ui-slider-zones__${band.tone}` });
      span.style.left = `${band.left}%`; span.style.width = `${band.width}%`;
      bar.append(span);
    }
    for (const mark of layout.marks) {
      if (mark.cue) {
        const cue = h('span', { class: 'ui-slider-zones__cue' });
        cue.style.left = `${mark.left}%`; bar.append(cue);
      }
      if (mark.showLabel) {
        const label = h('span', { class: cx('ui-slider-zones__label', mark.cue && 'is-cue') }, mark.label);
        label.style.left = `${mark.left}%`;
        if (mark.left < 6) label.style.transform = 'none';
        else if (mark.left > 94) label.style.transform = 'translateX(-100%)';
        labels.append(label);
      }
    }
    zonesEl.classList.toggle('is-exact', !!zones.exact);
    zonesEl.replaceChildren(bar, labels);
  };
  const render = () => {
    const v = Number(input.value);
    setText(num, fmt(v));
    setText(unitEl, unit);
    out.classList.toggle('is-tight', /^[°%′″']/.test(unit));
    input.style.setProperty('--p', String(pct(v)));
    input.setAttribute('aria-valuetext', fmt(v) + (unit ? ' ' + unit : ''));
  };
  renderMarks();
  renderZones();
  render();
  input.addEventListener('input', () => { render(); o.onInput?.(Number(input.value)); });
  input.addEventListener('change', () => { render(); o.onChange?.(Number(input.value)); });

  return {
    el, input,
    get value() { return Number(input.value); },
    set(v, emit = false) {
      const before = input.value;
      input.value = String(v); render();
      if (emit && input.value !== before) { o.onInput?.(Number(input.value)); o.onChange?.(Number(input.value)); }
    },
    setUnit(u) { unit = u; render(); },
    setRange(a, b, s) {
      min = a; max = b; if (s !== undefined) step = s;
      input.min = String(min); input.max = String(max); input.step = String(step);
      renderMarks(); renderZones(); render();
    },
    setDisabled(d) { input.disabled = d; },
    setMarks(m) { marks = m.slice(); renderMarks(); },
    setZones(value) { zones = value; renderZones(); },
  };
}

// ---- select ------------------------------------------------------------------------------------

export interface SelectOption<T extends string> { value: T; label: string; disabled?: boolean; group?: string }
export interface SelectOptions<T extends string> {
  id: string;
  label?: Child;
  ariaLabel?: string;
  options: SelectOption<T>[];
  value: T;
  onChange?: (value: T) => void;
  /** Label beside the box instead of above it. */
  inline?: boolean;
  disabled?: boolean;
  class?: string;
}
export interface SelectHandle<T extends string> {
  el: HTMLElement;
  select: HTMLSelectElement;
  readonly value: T;
  set(value: T, emit?: boolean): void;
  setOptions(options: SelectOption<T>[], value?: T): void;
  setDisabled(disabled: boolean): void;
}

export function select<T extends string>(o: SelectOptions<T>): SelectHandle<T> {
  const sel = h('select', { id: o.id, class: 'ui-select__input', 'aria-label': o.label ? undefined : o.ariaLabel, disabled: !!o.disabled });
  const build = (opts: SelectOption<T>[], v: T) => {
    const groups = new Map<string, HTMLOptGroupElement>();
    const nodes: HTMLElement[] = [];
    for (const x of opts) {
      const op = h('option', { value: x.value, disabled: !!x.disabled }, x.label);
      if (x.group) {
        let g = groups.get(x.group);
        if (!g) { g = h('optgroup', { label: x.group }); groups.set(x.group, g); nodes.push(g); }
        g.append(op);
      } else nodes.push(op);
    }
    sel.replaceChildren(...nodes);
    sel.value = v;
  };
  build(o.options, o.value);
  const el = h('div', { class: cx('ui-select', o.inline && 'ui-select--inline', o.class) },
    o.label ? placard(o.label, { for: o.id }) : null,
    h('span', { class: 'ui-select__box' }, sel));
  sel.addEventListener('change', () => o.onChange?.(sel.value as T));
  return {
    el, select: sel,
    get value() { return sel.value as T; },
    set(v, emit = false) { if (sel.value === v) return; sel.value = v; if (emit) o.onChange?.(v); },
    setOptions(opts, v) { build(opts, v ?? (sel.value as T)); },
    setDisabled(d) { sel.disabled = d; },
  };
}

// ---- chips -------------------------------------------------------------------------------------

export interface ChipOption<T extends string> { value: T; label: Child; title?: string; disabled?: boolean; keys?: string }
export interface ChipsOptions<T extends string> {
  id: string;
  label?: Child;
  ariaLabel?: string;
  options: ChipOption<T>[];
  /** Values switched on. */
  value: T[];
  onChange?: (value: T[], changed: T, on: boolean) => void;
  class?: string;
}
export interface ChipsHandle<T extends string> {
  el: HTMLElement;
  readonly value: T[];
  has(v: T): boolean;
  set(values: T[], emit?: boolean): void;
  toggle(v: T, on?: boolean, emit?: boolean): void;
}

/** Any-of-N switches (layer toggles, filters): small caps with an indicator lamp, aria-pressed. */
export function chips<T extends string>(o: ChipsOptions<T>): ChipsHandle<T> {
  const on = new Set<T>(o.value);
  const labelId = o.id + '-label';
  const btns = new Map<T, HTMLButtonElement>();
  const list = h('div', { class: 'ui-chips', role: 'group', id: o.id, 'aria-labelledby': o.label ? labelId : undefined, 'aria-label': o.label ? undefined : o.ariaLabel });
  const render = () => { for (const [v, b] of btns) b.setAttribute('aria-pressed', String(on.has(v))); };
  const handle: ChipsHandle<T> = {
    el: h('div', { class: cx('ui-field', o.class) }, o.label ? placard(o.label, { id: labelId, tag: 'div' }) : null, list),
    get value() { return o.options.map(x => x.value).filter(v => on.has(v)); },
    has: v => on.has(v),
    set(values, emit = false) {
      const next = new Set(values);
      const changed = o.options.map(x => x.value).filter(v => next.has(v) !== on.has(v));
      on.clear(); for (const v of next) on.add(v);
      render();
      if (emit) for (const v of changed) o.onChange?.(handle.value, v, on.has(v));
    },
    toggle(v, force, emit = true) {
      const want = force ?? !on.has(v);
      if (want === on.has(v)) return;
      if (want) on.add(v); else on.delete(v);
      render();
      if (emit) o.onChange?.(handle.value, v, want);
    },
  };
  for (const x of o.options) {
    const b = h('button', {
      type: 'button', class: 'ui-chip', id: `${o.id}-${x.value.replace(/[^\w-]/g, '_')}`, title: x.title, disabled: !!x.disabled,
      'aria-keyshortcuts': x.keys ? ariaShortcut(x.keys) || undefined : undefined,
      onclick: () => handle.toggle(x.value),
    }, h('span', { class: 'ui-chip__lamp', 'aria-hidden': 'true' }), h('span', { class: 'ui-chip__label' }, x.label), keyChild(x.keys));
    btns.set(x.value, b);
    list.append(b);
  }
  render();
  return handle;
}

// ---- tabs --------------------------------------------------------------------------------------

export interface TabDef { id: string; label: Child; content?: Child; keys?: string }
export interface TabsOptions {
  id: string;
  tabs: TabDef[];
  value?: string;
  onChange?: (id: string) => void;
  ariaLabel?: string;
  /** Stretch tabs across the full width. */
  fill?: boolean;
  class?: string;
}
export interface TabsHandle {
  el: HTMLElement;
  list: HTMLElement;
  /** Tab panels by tab id; put content in them any time. */
  panels: Record<string, HTMLElement>;
  readonly value: string;
  set(id: string, emit?: boolean): void;
}

/** Page selector (role=tablist) with panels; arrow keys move between tabs, selection follows focus. */
export function tabs(o: TabsOptions): TabsHandle {
  let value = o.value ?? o.tabs[0]?.id ?? '';
  const list = h('div', { class: cx('ui-tabs__list', o.fill && 'ui-tabs__list--fill'), role: 'tablist', 'aria-label': o.ariaLabel });
  const panels: Record<string, HTMLElement> = {};
  const btns: HTMLButtonElement[] = [];
  const panelWrap = h('div', { class: 'ui-tabs__panels' });
  for (const t of o.tabs) {
    const tabId = `${o.id}-tab-${t.id}`, panelId = `${o.id}-panel-${t.id}`;
    const b = h('button', {
      type: 'button', role: 'tab', id: tabId, class: 'ui-tab', 'aria-controls': panelId,
      'aria-keyshortcuts': t.keys ? ariaShortcut(t.keys) || undefined : undefined,
      onclick: () => handle.set(t.id, true),
    }, h('span', { class: 'ui-tab__legend' }, t.label), keyChild(t.keys));
    btns.push(b);
    list.append(b);
    const p = h('div', { role: 'tabpanel', id: panelId, class: 'ui-tabs__panel', 'aria-labelledby': tabId, tabindex: '0' }, t.content ?? null);
    panels[t.id] = p;
    panelWrap.append(p);
  }
  const render = () => {
    o.tabs.forEach((t, i) => {
      const sel = t.id === value;
      btns[i].setAttribute('aria-selected', String(sel));
      btns[i].tabIndex = sel ? 0 : -1;
      panels[t.id].hidden = !sel;
    });
  };
  list.addEventListener('keydown', e => {
    const i = btns.indexOf(e.target as HTMLButtonElement);
    if (i < 0) return;
    const n = btns.length;
    let j = -1;
    if (e.key === 'ArrowRight') j = (i + 1) % n;
    else if (e.key === 'ArrowLeft') j = (i - 1 + n) % n;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = n - 1;
    if (j < 0) return;
    e.preventDefault();
    btns[j].focus();
    handle.set(o.tabs[j].id, true);
  });
  const handle: TabsHandle = {
    el: h('div', { class: cx('ui-tabs', o.class), id: o.id }, list, panelWrap),
    list, panels,
    get value() { return value; },
    set(id, emit = false) {
      if (id === value || !panels[id]) return;
      value = id; render();
      if (emit) o.onChange?.(id);
    },
  };
  render();
  return handle;
}
