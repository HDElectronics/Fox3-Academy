/**
 * Tiny DOM helper used everywhere. [OWNER: ui-kit may EXTEND this file; keep h() and its signature.]
 *   h('button', { class: 'btn', onclick: fn, 'aria-pressed': 'true' }, 'Label', childEl)
 * Attributes: `class`, `style` (string or object), `on*` functions become listeners, booleans toggle
 * attributes, `dataset` object, everything else setAttribute. Children: strings, nodes, arrays, null.
 */
export type Child = Node | string | number | null | undefined | false | Child[];
export type Attrs = Record<string, unknown>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attrs | null, ...children: Child[]): HTMLElementTagNameMap[K];
export function h(tag: string, attrs?: Attrs | null, ...children: Child[]): HTMLElement;
export function h(tag: string, attrs?: Attrs | null, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset' && typeof v === 'object') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  append(el, children);
  return el;
}

export function append(el: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
}

/** Set textContent only when it changed (cheap to call every frame). */
export function setText(el: Element, s: string): void {
  if (el.textContent !== s) el.textContent = s;
}

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T | null;
export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll(sel)] as T[];

// ---------------------------------------------------------------------------------------------
// Extensions (ui-kit). Everything above this line is the architect's contract and stays as is.
// ---------------------------------------------------------------------------------------------

/** Add an event listener and get back a function that removes it. */
export function on<E extends Event = Event>(
  target: EventTarget, type: string, fn: (e: E) => void, opts?: AddEventListenerOptions | boolean,
): () => void {
  const l = fn as EventListener;
  target.addEventListener(type, l, opts);
  return () => target.removeEventListener(type, l, opts);
}

/**
 * Collects cleanup work for a page or component so unmount() is one call:
 *   const bag = cleanup(); bag.on(window, 'resize', fit); bag.add(unbindKeys); ... bag.dispose();
 * dispose() runs the functions in reverse order, swallows (and logs) errors, and can be called twice.
 */
export interface Cleanup {
  add(fn: () => void): void;
  on<E extends Event = Event>(target: EventTarget, type: string, fn: (e: E) => void, opts?: AddEventListenerOptions | boolean): void;
  dispose(): void;
}
export function cleanup(): Cleanup {
  let fns: (() => void)[] = [];
  return {
    add(fn) { fns.push(fn); },
    on(target, type, fn, opts) { fns.push(on(target, type, fn, opts)); },
    dispose() {
      const list = fns; fns = [];
      for (let i = list.length - 1; i >= 0; i--) {
        try { list[i](); } catch (e) { console.error(e); }
      }
    },
  };
}

/** Set or remove an attribute only when it changed (cheap to call every frame). null removes it. */
export function setAttr(el: Element, name: string, value: string | null): void {
  if (value === null) { if (el.hasAttribute(name)) el.removeAttribute(name); }
  else if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

/** Remove every child. */
export function clear(el: Element): void {
  el.replaceChildren();
}

/** Text only screen readers hear (e.g. "done" next to a tick). */
export function srOnly(text: string): HTMLSpanElement {
  return h('span', { class: 'ui-sr' }, text);
}

/** Join class names, skipping falsy ones: cx('ui-btn', lit && 'is-lit'). */
export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(' ');
}
