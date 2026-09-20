/**
 * [OWNER: displays] SPO-15 "Beryoza" lamp panel as FC3 shows it (docs/research/ru-fc3.md):
 * 8 large forward direction lamps on an arc (10 / 30 / 50 / 90° each side, angle printed on the lens)
 * lit yellow for the primary threat, small green lamps for secondary threats (a threat between two
 * lamp angles lights both), 2 large rear-quadrant lamps with triangles, an aircraft silhouette on the
 * signal-strength column (primary threat power), В / Н (above / below) half-circles for the primary
 * threat's elevation (both lit = co-altitude within ~15°), a large red lamp (steady = lock, flashing =
 * launch) and the bottom row of 6 threat-type letter lamps П З Х Н F С (primary yellow, others green).
 */
import { R2D } from '../../../sim/math';
import type { RwrContact } from '../../../sim/types';
import { blinkOn } from '../surface';
import { rwrSymbolFor, spoLamps, SPO_FWD_LAMPS } from '../geometry';
import { RX, RY, type RwrFrame } from './common';

/** The hardware row of type lamps (panel legend, not a threat table: letters come from the RWR spec). */
const TYPE_ROW = ['П', 'З', 'Х', 'Н', 'F', 'С'];
const POWER_LAMPS = 15;

type LampState = 'off' | 'yellow' | 'green' | 'red';

export function drawSpo15(f: RwrFrame): void {
  const { g, th, u, ranked, spec } = f;
  const ctx = g.ctx;
  const prim = ranked[0] ?? null;
  const secondary = ranked.slice(1);

  // ---- panel face
  ctx.fillStyle = th.screen2;
  ctx.fillRect(f.ox, f.oy, f.S, f.S);
  g.ink(th.screenLine, 0, 0.4);
  roundRect(g, RX(f, 2), RY(f, 2), 96 * u, 96 * u, 4 * u);

  // ---- direction lamps
  const arcC = { x: RX(f, 50), y: RY(f, 60) }, arcR = 40 * u;
  const lampPos = (deg: number, r: number) => {
    const th2 = (deg * 0.88 * Math.PI) / 180;
    return { x: arcC.x + Math.sin(th2) * r, y: arcC.y - Math.cos(th2) * r };
  };
  const bigOn = new Set<number>(prim ? spoLamps(prim.bearing) : []);
  const smallOn = new Map<number, RwrContact>();
  for (const c of secondary) for (const i of spoLamps(c.bearing)) if (!smallOn.has(i)) smallOn.set(i, c);
  // Forward lamps.
  SPO_FWD_LAMPS.forEach((deg, i) => {
    const p = lampPos(deg, arcR);
    lamp(f, p.x, p.y, 4.3 * u, bigOn.has(i) ? 'yellow' : 'off', String(Math.abs(deg)));
    const q = lampPos(deg, arcR - 7.4 * u);
    lamp(f, q.x, q.y, 1.5 * u, smallOn.has(i) ? 'green' : 'off', '');
    if (bigOn.has(i) && prim) hitAt(f, p.x, p.y, 4.6 * u, prim.emitterId, 0);
    const sc = smallOn.get(i);
    if (sc) hitAt(f, q.x, q.y, 2.6 * u, sc.emitterId, 1);
  });
  // Rear lamps (left rear 8, right rear 9) with triangle marks.
  for (const [i, xu] of [[8, 16], [9, 84]] as const) {
    const p = { x: RX(f, xu), y: RY(f, 76) };
    lamp(f, p.x, p.y, 4.3 * u, bigOn.has(i) ? 'yellow' : 'off', '');
    const on = bigOn.has(i);
    g.ink(on ? th.symInk : th.symDim, 0, 0.3, on ? 1 : 0.8);
    const s = i === 8 ? -1 : 1;
    g.poly([p.x + s * 1.9 * u, p.y + 1.6 * u, p.x - s * 1.6 * u, p.y + 1.6 * u, p.x + s * 1.9 * u, p.y - 1.9 * u], true, true);
    const q = { x: RX(f, xu + (i === 8 ? 7.5 : -7.5)), y: RY(f, 80.5) };
    lamp(f, q.x, q.y, 1.5 * u, smallOn.has(i) ? 'green' : 'off', '');
    if (on && prim) hitAt(f, p.x, p.y, 4.6 * u, prim.emitterId, 0);
    const sc = smallOn.get(i);
    if (sc) hitAt(f, q.x, q.y, 2.6 * u, sc.emitterId, 1);
  }

  // ---- signal-strength column along the fuselage, then the silhouette over it
  const colX = RX(f, 50), colTop = RY(f, 33), colBot = RY(f, 66);
  const lit = prim ? Math.max(1, Math.round(Math.max(0, Math.min(1, prim.strength)) * POWER_LAMPS)) : 0;
  for (let k = 0; k < POWER_LAMPS; k++) {
    const y = colBot - ((colBot - colTop) * k) / (POWER_LAMPS - 1);
    lamp(f, colX, y, 0.95 * u, k < lit ? 'yellow' : 'off', '');
  }
  silhouette(f, colX, RY(f, 50));

  // ---- В / Н elevation half-circles (primary threat)
  const el = prim ? prim.elevation * R2D : 0;
  const up = !!prim && el > -15, down = !!prim && el < 15;
  const bx = RX(f, 27), by = RY(f, 58), br = 4.4 * u;
  halfLamp(f, bx, by, br, true, up, 'В');
  halfLamp(f, bx, by, br, false, down, 'Н');

  // ---- red lock / launch lamp
  const rs = prim?.state;
  const launch = rs === 'launch' || rs === 'missile';
  const redOn = !!prim && (rs === 'lock' || (launch && blinkOn(3, f.now, 0.5)));
  const lx = RX(f, 50), ly = RY(f, 78.5);
  lamp(f, lx, ly, 4.6 * u, redOn ? 'red' : 'off', '');
  if (prim && (rs === 'lock' || launch)) hitAt(f, lx, ly, 5 * u, prim.emitterId, 0);

  // ---- type-letter lamps
  const primLetter = prim ? rwrSymbolFor(spec, prim) : null;
  const secLetters = new Map<string, RwrContact>();
  for (const c of secondary) { const l = rwrSymbolFor(spec, c); if (!secLetters.has(l)) secLetters.set(l, c); }
  const w = 9.6 * u, h = 6.4 * u, y = RY(f, 90);
  TYPE_ROW.forEach((letter, i) => {
    const x = RX(f, 50 + (i - 2.5) * 12.4);
    const st: LampState = letter === primLetter ? 'yellow' : secLetters.has(letter) ? 'green' : 'off';
    rectLamp(f, x, y, w, h, st, letter);
    const who = st === 'yellow' ? prim : secLetters.get(letter) ?? null;
    if (who) hitAt(f, x, y, 5 * u, who.emitterId, st === 'yellow' ? 0 : 1);
  });
  g.reset();
}

function hitAt(f: RwrFrame, x: number, y: number, r: number, id: string, prio: number): void {
  f.hits.push({ x, y, r: Math.max(10, r), id, kind: 'lamp', prio });
}

function lampColor(f: RwrFrame, s: LampState): string {
  return s === 'yellow' ? f.th.symHi : s === 'green' ? f.th.ok : s === 'red' ? f.th.warning : f.th.screen;
}

/** A round lamp lens; lit lamps glow and their printed legend turns dark. */
function lamp(f: RwrFrame, x: number, y: number, r: number, s: LampState, legend: string): void {
  const { g, th, u } = f;
  if (s === 'off') {
    g.ink(th.screen, 0, 0.3);
    g.circle(x, y, r, true);
    g.ink(th.screenLine, 0, Math.max(0.25, r / u / 12));
    g.circle(x, y, r);
  } else {
    g.ink(lampColor(f, s), 1.6, 0.3);
    g.circle(x, y, r, true);
  }
  if (legend) {
    g.ink(s === 'off' ? th.symDim : th.symInk, 0, 0.3, s === 'off' ? 0.9 : 1);
    g.font(r / u * 0.72, 700, 7);
    g.text(legend, x, y + 0.1 * u);
  }
}

function halfLamp(f: RwrFrame, x: number, y: number, r: number, top: boolean, on: boolean, legend: string): void {
  const { g, th, u } = f;
  const ctx = g.ctx;
  const gap = 0.35 * u;
  const cy = top ? y - gap : y + gap;
  ctx.beginPath();
  if (top) ctx.arc(x, cy, r, Math.PI, Math.PI * 2);
  else ctx.arc(x, cy, r, 0, Math.PI);
  ctx.closePath();
  if (on) { g.ink(th.symHi, 1.6, 0.3); ctx.fill(); }
  else { g.ink(th.screen, 0, 0.3); ctx.fill(); g.ink(th.screenLine, 0, 0.3); ctx.stroke(); }
  g.ink(on ? th.symInk : th.symDim, 0, 0.3, on ? 1 : 0.9);
  g.font(2.9, 700, 7);
  g.text(legend, x, top ? cy - r * 0.42 : cy + r * 0.45);
}

function rectLamp(f: RwrFrame, x: number, y: number, w: number, h: number, s: LampState, legend: string): void {
  const { g, th } = f;
  if (s === 'off') {
    g.ink(th.screen, 0, 0.3);
    g.rect(x - w / 2, y - h / 2, w, h, true);
    g.ink(th.screenLine, 0, 0.3);
    g.rect(x - w / 2, y - h / 2, w, h);
  } else {
    g.ink(lampColor(f, s), 1.6, 0.3);
    g.rect(x - w / 2, y - h / 2, w, h, true);
  }
  g.ink(s === 'off' ? th.symDim : th.symInk, 0, 0.3, s === 'off' ? 0.95 : 1);
  g.font(3.6, 700, 8);
  g.text(legend, x, y + 0.1 * f.u);
}

function roundRect(f: RwrFrame['g'], x: number, y: number, w: number, h: number, r: number): void {
  const c = f.ctx;
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
  c.stroke();
}

/** Flanker-like top-view silhouette outline (painted on the panel, so placard white, no glow). */
function silhouette(f: RwrFrame, cx: number, cy: number): void {
  const { g, th, u } = f;
  const s = u * 1.05;
  // Half outline (right side), nose up, mirrored for the left side. Units: s.
  const half = [
    0, -19, 1.1, -16, 1.6, -11, 2, -6, 3, -4, 12.5, 3, 13, 5, 3.4, 4, 3.2, 10, 3.8, 12, 7.5, 16, 7.5, 18, 3.4, 16.5, 2.4, 18.5, 0, 18.5,
  ];
  const pts: number[] = [];
  for (let i = 0; i < half.length; i += 2) pts.push(cx + half[i] * s, cy + half[i + 1] * s);
  for (let i = half.length - 2; i >= 0; i -= 2) pts.push(cx - half[i] * s, cy + half[i + 1] * s);
  g.ink(th.placard, 0, 0.22, 0.75);
  g.poly(pts, true, false);
}
