/**
 * [OWNER: page-harm] Shared frame for the HARM page's animated guides (SP, TOO, PB): title, controls, SVG figures,
 * a step list that follows a timeline, an outcome line and a sources note. Each guide supplies its figures and a
 * draw(t) that poses them for time t (seconds). Reduced motion shows the last frame.
 */
import { h, button, type Child } from '../../ui';

export const SVG_NS = 'http://www.w3.org/2000/svg';

export function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, text?: string): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  return e;
}
export const setAttrs = (e: Element, attrs: Record<string, string | number>): void => { for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v)); };
export const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
export const ease = (x: number): number => x * x * (3 - 2 * x);
export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

/** Cubic Bezier point. */
export function bezier(p: [number, number][], s: number): [number, number] {
  const u = 1 - s;
  const a = u * u * u, b = 3 * u * u * s, c = 3 * u * s * s, d = s * s * s;
  return [a * p[0]![0] + b * p[1]![0] + c * p[2]![0] + d * p[3]![0], a * p[0]![1] + b * p[1]![1] + c * p[2]![1] + d * p[3]![1]];
}

export interface ExplainerSpec {
  title: string;
  intro: string;
  /** Controls row (segmented choices). Call `restart()` from their handlers. */
  controls: Child[];
  /** Figures: [svg, caption]. */
  figures: [SVGSVGElement, string][];
  /** Step texts, and the time each one starts. */
  steps: string[];
  marks: number[];
  /** Time the animation stops. */
  end: number;
  /** Pose the figures for time t; return the outcome text once there is one, and whether it is a miss. */
  draw(t: number): { outcome?: string; miss?: boolean } | void;
  /** Sources and trainer rules. */
  note: string;
  reducedMotion: boolean;
  onClose?: () => void;
}

export interface Explainer { el: HTMLElement; play(): void; stop(): void; seek(t: number): void; dispose(): void }

export function createExplainer(s: ExplainerSpec): Explainer {
  let t = 0, raf = 0, last = 0, running = false;
  const steps = h('ol', { class: 'harm-pbx__steps' }, s.steps.map(x => h('li', null, x)));
  const outcome = h('p', { class: 'harm-pbx__result', 'aria-live': 'polite' });
  const replay = button({ label: 'Replay', size: 's', onClick: () => play() });
  const close = s.onClose ? button({ label: 'Close: fly the drill', variant: 'primary', size: 's', onClick: () => s.onClose?.() }) : null;
  const el = h('section', { class: 'harm-pbx', 'aria-label': s.title },
    h('header', { class: 'harm-pbx__head' }, h('h2', null, s.title), h('p', null, s.intro)),
    h('div', { class: 'harm-pbx__controls' }, ...s.controls, h('div', { class: 'harm-pbx__btns' }, replay.el, close?.el ?? null)),
    h('div', { class: `harm-pbx__stage${s.figures.length === 1 ? ' is-single' : ''}` },
      s.figures.map(([svg, cap]) => h('figure', null, svg, h('figcaption', null, cap)))),
    steps, outcome, h('p', { class: 'harm-small' }, s.note));

  function render(): void {
    const r = s.draw(t) || {};
    let cur = 0;
    s.marks.forEach((m, i) => { if (t >= m) cur = i; });
    [...steps.children].forEach((li, i) => { if (i === cur) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current'); });
    outcome.textContent = r.outcome ?? '';
    outcome.classList.toggle('is-miss', !!r.miss);
  }
  function frame(now: number): void {
    if (!running) return;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    t += dt;
    render();
    if (t < s.end) raf = requestAnimationFrame(frame);
    else running = false;
  }
  function play(): void {
    cancelAnimationFrame(raf);
    if (s.reducedMotion) { t = s.end; render(); return; }
    t = 0; last = 0; running = true;
    render();
    raf = requestAnimationFrame(frame);
  }
  render();
  return {
    el, play,
    stop() { running = false; cancelAnimationFrame(raf); },
    seek(at: number) { running = false; cancelAnimationFrame(raf); t = at; render(); },
    dispose() { running = false; cancelAnimationFrame(raf); },
  };
}
