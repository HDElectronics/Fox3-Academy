/**
 * [OWNER: page-harm] Animated "How a PB shot works" for the PB lesson: the UFC code, WPDSG, the pull-up (HRM or A/C),
 * the flight to the point with the receiver off, the receiver coming on near the point, and which radar the code picks
 * in an SA-11 battery with an SA-15 next to it (or a miss when no radar of that code is there). Side view and top view
 * in SVG, coloured by design tokens. Steps follow ED's guide p373-375 and the code table p420; which radar is picked
 * when several share a code, and how far from the point the HARM listens, are trainer rules (HARM_CAVEATS).
 */
import { h, segmented, button } from '../../ui';
import type { Pullup } from './types';

const NS = 'http://www.w3.org/2000/svg';
const T = { ufc: 2.6, wp: 4.6, release: 7, seeker: 11.4, terminal: 13.6, end: 16.2, hold: 17.5 } as const;

type Code = 107 | 115 | 119 | 108;
interface Emitter { key: string; code: number; rwr: string; name: string; top: [number, number]; side: number }
/** The battery at the designated point (top view px; side view x of the target). */
const AT_POINT: Emitter[] = [
  { key: 'sd', code: 107, rwr: 'SD', name: 'Snow Drift', top: [130, 120], side: 380 },
  { key: 'fdA', code: 115, rwr: '11', name: 'Fire Dome', top: [98, 146], side: 368 },
  { key: 'fdB', code: 115, rwr: '11', name: 'Fire Dome', top: [168, 150], side: 392 },
  { key: 'tor', code: 119, rwr: '15', name: 'SA-15', top: [204, 70], side: 404 },
];
const CP: [number, number] = [150, 86];
const POINT: [number, number] = [130, 120];

const CODES: { code: Code; label: string }[] = [
  { code: 107, label: '107 Snow Drift' }, { code: 115, label: '115 Fire Dome' }, { code: 119, label: '119 SA-15' }, { code: 108, label: '108 SA-6' },
];

const STEPS = [
  'UFC, window 4 TGT, type the code, ENT: you tell the HARM what radar type to look for (guide p374; codes p420).',
  'HSI, WPDSG on the waypoint over the site: you tell it where to go (p122, p374).',
  'Hold release and fly the cue. HRM pull-up: the HARM climbs by itself, so you launch closer. A/C pull-up: you climb about 45° first and the HARM reaches further (p374-375).',
  'Receiver off: the HARM flies to the point, not to a radar. It cannot see anything yet (p373).',
  'Near the point the receiver comes on and listens for that one code (p373).',
  'It homes on the radar with the code, or finds none and misses.',
];

function result(code: Code): { text: string; hit: Emitter | null } {
  if (code === 108) return { hit: null, text: 'Code 108 is the SA-6 Straight Flush. There is none at this point: the HARM hears no radar of that code and falls near the point. A miss. It never homes on a radar it was not told about.' };
  if (code === 119) return { hit: AT_POINT[3]!, text: 'Code 119 is the SA-15 parked next to the battery. The HARM goes for it, not for the SA-11 radars: the code chooses the target, not the waypoint.' };
  if (code === 115) return { hit: AT_POINT[1]!, text: 'Code 115 is the Fire Dome, the tracking radar on each SA-11 launcher. Two match: the trainer takes the one nearest the point. The Snow Drift (107) is ignored.' };
  return { hit: AT_POINT[0]!, text: 'Code 107 matched the Snow Drift, the battery\'s search radar: the HARM homes on it. The Fire Domes (115) and the SA-15 (119) have other codes: ignored.' };
}

const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, text?: string): SVGElementTagNameMap[K] => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  return e;
};
const set = (e: Element, attrs: Record<string, string | number>) => { for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v)); };
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => x * x * (3 - 2 * x);
function bez(p: number[][], s: number): [number, number] {
  const u = 1 - s;
  const a = u * u * u, b = 3 * u * u * s, c = 3 * u * s * s, d = s * s * s;
  return [a * p[0]![0]! + b * p[1]![0]! + c * p[2]![0]! + d * p[3]![0]!, a * p[0]![1]! + b * p[1]![1]! + c * p[2]![1]! + d * p[3]![1]!];
}

export interface PbExplainer { el: HTMLElement; play(): void; stop(): void; dispose(): void; /** Jump to a time (s) and hold there (screenshots). */ seek(at: number): void }

export function createPbExplainer(o: { reducedMotion: boolean; onClose?: () => void }): PbExplainer {
  let code: Code = 107;
  let pullup: Pullup = 'HRM';
  let t = 0, raf = 0, last = 0, running = false;

  // ---- side view
  const side = el('svg', { viewBox: '0 0 420 230', class: 'harm-pbx__svg', role: 'img', 'aria-label': 'Side view of the PB shot' });
  side.append(
    el('rect', { x: 0, y: 0, width: 420, height: 230, class: 'pbx-sky' }),
    el('rect', { x: 0, y: 200, width: 420, height: 30, class: 'pbx-ground' }),
  );
  const rangeHrm = el('g', { class: 'pbx-range' });
  const rangeAc = el('g', { class: 'pbx-range' });
  const trail = el('path', { class: 'pbx-trail', d: '' });
  const cone = el('path', { class: 'pbx-cone', d: '' });
  const harm = el('g', {});
  harm.append(el('path', { d: 'M -7 0 L 6 0 M 6 0 L 2 -2 M 6 0 L 2 2', class: 'pbx-harm' }));
  const jet = el('g', {});
  jet.append(el('path', { d: 'M -12 0 L 10 0 L 4 -3 L -6 -3 Z M -10 0 L -14 -6 L -8 -1 Z', class: 'pbx-jet' }));
  const wp = el('g', { class: 'pbx-wp', opacity: 0 });
  wp.append(el('path', { d: 'M 380 172 l 6 6 l -6 6 l -6 -6 Z' }), el('text', { x: 380, y: 166, 'text-anchor': 'middle' }, 'WP4 · TGT'));
  const sideRadars = AT_POINT.map(e => {
    const g = el('g', { class: 'pbx-radar' });
    // Names are in the top view; here the radars are too close together to label.
    g.append(el('rect', { x: e.side - 3, y: 194, width: 6, height: 6 }));
    return g;
  });
  const flash = el('circle', { cx: 0, cy: 0, r: 0, class: 'pbx-flash', opacity: 0 });
  const ufcBox = el('g', { class: 'pbx-ufc' });
  const ufcText = el('text', { x: 14, y: 26 }, '');
  ufcBox.append(el('rect', { x: 6, y: 10, width: 96, height: 24, rx: 3 }), ufcText);
  const recv = el('text', { x: 210, y: 20, 'text-anchor': 'middle', class: 'pbx-recv' }, '');
  side.append(rangeAc, rangeHrm, ...sideRadars, wp, trail, cone, jet, harm, flash, ufcBox, recv);

  // ---- top view
  const top = el('svg', { viewBox: '0 0 260 230', class: 'harm-pbx__svg', role: 'img', 'aria-label': 'Top view of the battery at the designated point' });
  top.append(el('rect', { x: 0, y: 0, width: 260, height: 230, class: 'pbx-land' }));
  const search = el('circle', { cx: POINT[0], cy: POINT[1], r: 0, class: 'pbx-search', opacity: 0 });
  const searchLbl = el('text', { x: POINT[0], y: POINT[1] + 112, 'text-anchor': 'middle', class: 'pbx-lbl', opacity: 0 }, 'listening near the point');
  const topWp = el('path', { d: `M ${POINT[0]} ${POINT[1] - 14} l 7 7 l -7 7 l -7 -7 Z`, class: 'pbx-wp-top', opacity: 0 });
  const cp = el('g', { class: 'pbx-veh' });
  cp.append(el('rect', { x: CP[0] - 4, y: CP[1] - 4, width: 8, height: 8 }), el('text', { x: CP[0] + 7, y: CP[1] + 3 }, 'CP · no radar'));
  const topEm = AT_POINT.map(e => {
    const g = el('g', { class: 'pbx-veh pbx-em' });
    const ring = el('circle', { cx: e.top[0], cy: e.top[1], r: 9, class: 'pbx-ring', opacity: 0 });
    const box = el('rect', { x: e.top[0] - 11, y: e.top[1] - 11, width: 22, height: 22, class: 'pbx-box', opacity: 0 });
    g.append(ring, box, el('rect', { x: e.top[0] - 4, y: e.top[1] - 4, width: 8, height: 8 }),
      el('text', { x: e.top[0] + 8, y: e.top[1] - 6 }, `${e.rwr} · ${e.code}`), el('text', { x: e.top[0] + 8, y: e.top[1] + 6, class: 'pbx-sub' }, e.name));
    return { g, ring, box, e };
  });
  const topHarm = el('path', { class: 'pbx-trail', d: '' });
  const topFlash = el('circle', { cx: 0, cy: 0, r: 0, class: 'pbx-flash', opacity: 0 });
  top.append(search, searchLbl, cp, ...topEm.map(x => x.g), topWp, topHarm, topFlash);

  // ---- text
  const steps = h('ol', { class: 'harm-pbx__steps' }, STEPS.map(s => h('li', null, s)));
  const outcome = h('p', { class: 'harm-pbx__result', 'aria-live': 'polite' });
  const codeSeg = segmented<Code>({ id: 'harm-pbx-code', label: 'Code on the UFC (TGT)', size: 's', value: code, options: CODES.map(c => ({ value: c.code, label: c.label })), onChange: c => { code = c; restart(); } });
  const pullSeg = segmented<Pullup>({ id: 'harm-pbx-pull', label: 'Pull-up', size: 's', value: pullup, options: [{ value: 'HRM', label: 'HRM (HARM climbs)' }, { value: 'AC', label: 'A/C (you climb)' }], onChange: p => { pullup = p; restart(); } });
  const playBtn = button({ label: 'Replay', size: 's', onClick: () => restart() });
  const closeBtn = o.onClose ? button({ label: 'Close: fly the drill', variant: 'primary', size: 's', onClick: () => o.onClose?.() }) : null;

  const root = h('section', { class: 'harm-pbx', 'aria-label': 'How a PB shot works' },
    h('header', { class: 'harm-pbx__head' },
      h('h2', null, 'How a PB shot works'),
      h('p', null, 'Pick a code and a pull-up, then watch. Side view on the left (not to scale), the battery at the waypoint seen from above on the right.')),
    h('div', { class: 'harm-pbx__controls' }, codeSeg.el, pullSeg.el, h('div', { class: 'harm-pbx__btns' }, playBtn.el, closeBtn?.el ?? null)),
    h('div', { class: 'harm-pbx__stage' },
      h('figure', null, side, h('figcaption', null, 'Side view')),
      h('figure', null, top, h('figcaption', null, 'At the designated point, from above'))),
    steps, outcome,
    h('p', { class: 'harm-small' }, 'From the ED guide: PB flies to the location, then turns on the receiver and homes (p373); the code is the ALIC ID from the appendix (p420); HRM vs A/C pull-up (p374-375). Trainer rules, not in the guide: how far from the point it listens, and the nearest radar wins when two share a code.'),
  );

  // ---- frame
  function geometry() {
    const ac = pullup === 'AC';
    const start: [number, number] = ac ? [26, 120] : [86, 92];
    const rel: [number, number] = ac ? [70, 74] : [118, 92];
    const r = result(code);
    const end: [number, number] = r.hit ? [r.hit.side, 194] : [386, 199];
    const path = ac
      ? [rel, [rel[0] + 70, rel[1] - 70], [300, 6], end]
      : [rel, [rel[0] + 40, rel[1] - 50], [290, 10], end];
    return { ac, start, rel, end, path, r };
  }

  function draw(): void {
    const g = geometry();
    // UFC typing
    const digits = String(code);
    const nTyped = Math.min(3, Math.floor(clamp01(t / (T.ufc - 0.4)) * 3.999));
    ufcText.textContent = `:TGT ${digits.slice(0, nTyped)}${t >= T.ufc - 0.4 ? '  ENT' : ''}`;
    set(ufcBox, { opacity: t < T.release ? 1 : 0.35 });
    // waypoint
    const wpOn = clamp01((t - T.ufc) / 0.8);
    set(wp, { opacity: wpOn });
    set(topWp, { opacity: wpOn });
    // launch ranges (to scale with each other, trainer values)
    rangeHrm.replaceChildren(el('line', { x1: 118, y1: 224, x2: 380, y2: 224 }), el('text', { x: 124, y: 220 }, 'HRM pull-up range'));
    rangeAc.replaceChildren(el('line', { x1: 70, y1: 212, x2: 380, y2: 212 }), el('text', { x: 76, y: 208 }, 'A/C pull-up range: further'));
    set(rangeHrm, { opacity: g.ac ? 0.35 : 1 });
    set(rangeAc, { opacity: g.ac ? 1 : 0.35 });
    // jet
    const k = clamp01((t - T.wp) / (T.release - T.wp));
    const jx = g.start[0] + (g.rel[0] - g.start[0]) * ease(k) + (t > T.release ? (t - T.release) * 14 : 0);
    const jy = t > T.release ? g.rel[1] + (t - T.release) * (g.ac ? 6 : 0) : g.start[1] + (g.rel[1] - g.start[1]) * ease(k);
    const pitch = g.ac && t > T.wp && t < T.release + 1.5 ? -45 * clamp01(k * 1.4) : 0;
    set(jet, { transform: `translate(${jx.toFixed(1)} ${jy.toFixed(1)}) rotate(${pitch})` });
    // HARM along the path
    const f = clamp01((t - T.release) / (T.end - T.release));
    const s = f < 0.75 ? ease(f / 0.75) * 0.82 : 0.82 + (f - 0.75) / 0.25 * 0.18;
    const flying = t >= T.release && t < T.end;
    const [hx, hy] = bez(g.path, s);
    const [px, py] = bez(g.path, Math.max(0, s - 0.01));
    set(harm, { opacity: flying ? 1 : 0, transform: `translate(${hx.toFixed(1)} ${hy.toFixed(1)}) rotate(${(Math.atan2(hy - py, hx - px) * 180 / Math.PI).toFixed(1)})` });
    let d = '';
    if (t >= T.release) for (let i = 0; i <= 30; i++) { const [x, y] = bez(g.path, (i / 30) * s); d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)} `; }
    set(trail, { d });
    // receiver
    const on = t >= T.seeker;
    recv.textContent = t < T.release ? '' : on ? `Receiver ON: listening for code ${code}` : 'Receiver OFF: flying to the point';
    set(recv, { class: `pbx-recv${on ? ' is-on' : ''}` });
    set(cone, { d: on && flying ? `M ${hx} ${hy} L ${hx + 46} ${hy + 70} L ${hx - 10} ${hy + 80} Z` : '' });
    // impact
    const imp = clamp01((t - T.end) / 0.6);
    set(flash, { cx: g.end[0], cy: g.end[1], r: 4 + 16 * imp, opacity: t >= T.end ? (1 - imp) * 0.9 : 0 });
    sideRadars.forEach((rg, i) => set(rg, { class: `pbx-radar${t >= T.end && g.r.hit === AT_POINT[i] ? ' is-dead' : ''}` }));
    // top view: listening circle, matching radars, the HARM's line
    const sOn = clamp01((t - T.seeker) / 0.8);
    set(search, { r: 95 * sOn, opacity: on ? 0.9 : 0 });
    set(searchLbl, { opacity: on ? 1 : 0 });
    for (const x of topEm) {
      const match = x.e.code === code;
      const chosen = g.r.hit === x.e;
      const pulse = on && match ? 0.5 + 0.5 * Math.sin(t * 6) : 0;
      set(x.ring, { opacity: pulse, r: 9 + 4 * pulse });
      set(x.box, { opacity: t >= T.terminal && chosen ? 1 : 0 });
      set(x.g, { class: `pbx-veh pbx-em${on && !match ? ' is-ignored' : ''}${t >= T.end && chosen ? ' is-dead' : ''}` });
    }
    const topEnd = g.r.hit ? g.r.hit.top : [POINT[0] + 14, POINT[1] + 22] as [number, number];
    const ft = clamp01((t - T.release) / (T.terminal - T.release));
    const tt = clamp01((t - T.terminal) / (T.end - T.terminal));
    const mid: [number, number] = [POINT[0] - 30 * (1 - ft), POINT[1]];
    let td = '';
    if (t >= T.release) {
      td = `M 0 ${POINT[1]} L ${(POINT[0] - 30) * ft} ${POINT[1]}`;
      if (t >= T.terminal) td += ` L ${mid[0] + (topEnd[0] - mid[0]) * tt} ${mid[1] + (topEnd[1] - mid[1]) * tt}`;
    }
    set(topHarm, { d: td });
    set(topFlash, { cx: topEnd[0], cy: topEnd[1], r: 4 + 14 * imp, opacity: t >= T.end ? (1 - imp) * 0.9 : 0 });
    // steps and outcome
    const cur = t < T.ufc ? 0 : t < T.wp ? 1 : t < T.release ? 2 : t < T.seeker ? 3 : t < T.terminal ? 4 : 5;
    [...steps.children].forEach((li, i) => { if (i === cur) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current'); });
    outcome.textContent = t >= T.terminal ? g.r.text : '';
    outcome.classList.toggle('is-miss', !g.r.hit);
  }

  function frame(now: number): void {
    if (!running) return;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    t += dt;
    draw();
    if (t < T.hold) raf = requestAnimationFrame(frame);
    else running = false;
  }

  function restart(): void {
    cancelAnimationFrame(raf);
    if (o.reducedMotion) { t = T.hold; draw(); return; }
    t = 0; last = 0; running = true;
    draw();
    raf = requestAnimationFrame(frame);
  }

  draw();
  return {
    el: root,
    play: restart,
    stop() { running = false; cancelAnimationFrame(raf); },
    seek(at: number) { running = false; cancelAnimationFrame(raf); t = at; draw(); },
    dispose() { running = false; cancelAnimationFrame(raf); },
  };
}

/** For tests: the outcome text and target for a code. */
export const pbOutcome = result;
