/**
 * [OWNER: displays] Round-scope RWRs: ALR-56C (F-15C TEWS), ALR-67 (Hornet, F-14), ALR-56M (Viper),
 * JF-17 RWR (HSD overlay) and Serval (M-2000C). Research: docs/research/f15c-fc3.md,
 * hornet-viper.md, tomcat-thunder-mirage.md, bvr-mechanics.md.
 *
 * Common rules: nose up, bearing = angle; the radial position encodes lethality / priority (or
 * signal strength on the DCS ALR-56C), never range. Airborne emitters wear a "hat" chevron, the top
 * threat a diamond, a new threat an upper semicircle for a few seconds. Lock = steady symbol with
 * emphasis (ALR-56M: box), launch = flashing symbol (ALR-56C: flashing circle and lower semicircle;
 * ALR-56M: inside the inner circle with a flashing circle), an active radar missile shows the
 * spec's missile symbol ('M').
 */
import type { RwrContact } from '../../../sim/types';
import { blinkOn } from '../surface';
import { diamond, hat } from '../glyphs';
import { isAirborne, missileDigits, rwrSymbolFor, scopeRadius } from '../geometry';
import { MISSILES } from '../../../data/missiles';
import { RX, RY, type RwrFrame } from './common';

interface Placed { c: RwrContact; x: number; y: number; r: number; ang: number; sym: string; rank: number }

export function drawScope(f: RwrFrame): void {
  const { g, th, u, spec } = f;
  const ctx = g.ctx;
  const cx = RX(f, 50), cy = RY(f, 50), R = 44 * u;

  // ---- glass
  ctx.fillStyle = th.screen2;
  ctx.fillRect(f.ox, f.oy, f.S, f.S);
  ctx.fillStyle = th.screen;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();
  g.ink(th.screenLine, 0, 0.45);
  g.circle(cx, cy, R);
  drawRings(f, cx, cy, R);

  // ---- place symbols (priority order). Overlapping symbols are spread along their ring (like the
  // ALR-67 OFFSET function): the band keeps its meaning, the bearing becomes approximate.
  const placed: Placed[] = [];
  const minD = 8.6 * u;
  f.ranked.forEach((c, rank) => {
    const rr = scopeRadius(spec.id, c, rank);
    let ang = c.bearing;
    const step = Math.min(0.9, minD / Math.max(1, rr * R));
    let x = 0, y = 0;
    for (let tries = 0; tries < 9; tries++) {
      const off = tries === 0 ? 0 : Math.ceil(tries / 2) * step * (tries % 2 ? 1 : -1);
      ang = c.bearing + off;
      x = cx + Math.sin(ang) * rr * R;
      y = cy - Math.cos(ang) * rr * R;
      if (!placed.some(p => Math.hypot(p.x - x, p.y - y) < minD)) break;
    }
    placed.push({ c, x, y, r: rr, ang, sym: symbolText(f, c), rank });
  });

  // Draw lower priority first so the top threat sits on top.
  for (let i = placed.length - 1; i >= 0; i--) drawSymbol(f, placed[i]);
  for (const p of placed) f.hits.push({ x: p.x, y: p.y, r: Math.max(12, 4 * u), id: p.c.emitterId, kind: 'contact', prio: p.rank });

  drawCornerLamps(f);
  g.reset();
}

function symbolText(f: RwrFrame, c: RwrContact): string {
  const s = rwrSymbolFor(f.spec, c);
  // JF-17 MAWS: an active missile shows its type number (e.g. 120), else 'M'.
  if (f.spec.id === 'jf17rwr' && (c.state === 'missile' || c.emitterType === 'missile') && c.missileType) {
    const name = MISSILES[c.missileType]?.name ?? '';
    const d = missileDigits(name);
    return d !== 'M' ? d : s;
  }
  return s;
}

function drawRings(f: RwrFrame, cx: number, cy: number, R: number): void {
  const { g, th, u, spec } = f;
  const ticks = (r0: number, r1: number) => {
    const s: number[] = [];
    for (let k = 0; k < 12; k++) {
      const a = (k * Math.PI) / 6;
      s.push(cx + Math.sin(a) * r0, cy - Math.cos(a) * r0, cx + Math.sin(a) * r1, cy - Math.cos(a) * r1);
    }
    g.segs(s);
  };
  switch (spec.id) {
    case 'alr56c': {
      // Inner and outer rings of dots (12 on the outer ring), small centre cross, bezel ticks.
      g.ink(th.sym, 0.6, 0.3, 0.9);
      for (let k = 0; k < 12; k++) {
        const a = (k * Math.PI) / 6;
        g.circle(cx + Math.sin(a) * R * 0.94, cy - Math.cos(a) * R * 0.94, 0.42 * u, true);
        g.circle(cx + Math.sin(a) * R * 0.42, cy - Math.cos(a) * R * 0.42, 0.34 * u, true);
      }
      g.ink(th.sym, 0.5, 0.26);
      g.segs([cx - 1.4 * u, cy, cx + 1.4 * u, cy, cx, cy - 1.4 * u, cx, cy + 1.4 * u]);
      g.ink(th.placard, 0, 0.35, 0.8);
      ticks(R + 1 * u, R + 3 * u);
      g.font(2.4, 700);
      verticalText(f, 'TEWS', RX(f, 2.6), cy - 17 * u);
      break;
    }
    case 'alr67': {
      // Critical (outer), lethal (middle), non-lethal (inner) bands and the status circle.
      g.ink(th.symDim, 0, 0.22, 0.9);
      g.circle(cx, cy, R * 0.72);
      g.circle(cx, cy, R * 0.45);
      g.ink(th.sym, 0.5, 0.26);
      g.circle(cx, cy, R * 0.18);
      g.line(cx - R * 0.18, cy, cx + R * 0.18, cy);
      g.line(cx, cy - R * 0.18, cx, cy);
      g.font(2.2, 700);
      g.text('N', cx - R * 0.085, cy - R * 0.085);
      g.ink(th.sym, 0.5, 0.3);
      ticks(R * 0.93, R);
      break;
    }
    case 'alr56m': {
      // Solid white inner circle; tracking symbols sit just outside it.
      g.ink(th.missile, 0.4, 0.34, 0.9);
      g.circle(cx, cy, R * 0.34);
      g.ink(th.sym, 0.5, 0.3);
      ticks(R * 0.93, R);
      g.ink(th.symDim, 0, 0.2, 0.8);
      g.segs([cx - 1 * u, cy, cx + 1 * u, cy, cx, cy - 1 * u, cx, cy + 1 * u]);
      break;
    }
    case 'jf17rwr': {
      // HSD overlay: inner ring lethal (tracking), outer ring non-lethal (search), compass ticks.
      g.ink(th.sym, 0.4, 0.24, 0.85);
      g.circle(cx, cy, R * 0.6);
      g.circle(cx, cy, R * 0.95);
      ticks(R * 0.95, R);
      g.ink(th.sym, 0.6, 0.3);
      // Own ship.
      g.poly([cx, cy - 2 * u, cx + 1.3 * u, cy + 1.6 * u, cx, cy + 0.8 * u, cx - 1.3 * u, cy + 1.6 * u], true, false);
      break;
    }
    case 'serval': {
      // Nearer the centre = more dangerous: high-threat zone inside.
      g.ink(th.symDim, 0, 0.22, 0.9);
      g.circle(cx, cy, R * 0.36);
      g.circle(cx, cy, R * 0.68);
      g.ink(th.sym, 0.5, 0.3);
      ticks(R * 0.93, R);
      g.ink(th.sym, 0.6, 0.3);
      g.segs([cx, cy - 2.2 * u, cx, cy + 2 * u, cx - 2.4 * u, cy - 0.2 * u, cx + 2.4 * u, cy - 0.2 * u, cx - 1 * u, cy + 1.8 * u, cx + 1 * u, cy + 1.8 * u]);
      break;
    }
  }
}

function verticalText(f: RwrFrame, s: string, x: number, cy: number): void {
  const { g, u } = f;
  const step = 2.8 * u;
  const y0 = cy - ((s.length - 1) * step) / 2;
  for (let i = 0; i < s.length; i++) g.text(s[i], x, y0 + i * step);
}

function drawSymbol(f: RwrFrame, p: Placed): void {
  const { g, th, u, spec, t, now } = f;
  const c = p.c;
  const top = p.rank === 0;
  const launch = c.state === 'launch';
  const missile = c.state === 'missile' || c.emitterType === 'missile';
  const lock = c.state === 'lock';
  const isNew = t - c.firstSeen < f.newS;
  const stale = t - c.lastSeen > 4;
  const flash = launch || (missile && spec.id !== 'alr56c');
  const on = !flash || blinkOn(3, now, 0.55);

  let col = th.sym;
  if (spec.id === 'jf17rwr') col = c.state === 'search' ? th.symHi : th.warning;
  const a = stale ? 0.55 : 1;
  const glow = lock || launch || missile ? 1.5 : 1;

  // Symbol text.
  if (on) {
    g.ink(col, glow, 0.3, a);
    g.font(lock || launch || missile || top ? 3.7 : 3.3, 700);
    g.text(p.sym, p.x, p.y + 0.15 * u);
  }
  const tw = Math.max(3.6 * u, g.measure(p.sym) + 1.2 * u);
  g.ink(col, glow * 0.9, 0.28, a);

  // Airborne hat.
  if (isAirborne(c) && on && spec.id !== 'jf17rwr') hat(g, p.x, p.y - 3 * u, Math.max(3.4 * u, tw * 0.9), 1.3 * u);

  // JF-17: air threats inside a rectangle; the main threat gets a vertical line through it.
  if (spec.id === 'jf17rwr' && !missile && on) {
    g.rect(p.x - tw / 2 - 0.4 * u, p.y - 2 * u, tw + 0.8 * u, 4 * u);
    if (top) g.line(p.x, p.y - 3.1 * u, p.x, p.y + 3.1 * u);
  }
  // JF-17 MAWS above / below marker for missiles.
  if (spec.id === 'jf17rwr' && missile && on) {
    const upSide = c.elevation >= 0;
    g.poly([p.x - 1 * u, p.y + (upSide ? -2.6 : 2.6) * u, p.x, p.y + (upSide ? -3.6 : 3.6) * u, p.x + 1 * u, p.y + (upSide ? -2.6 : 2.6) * u], false);
  }

  // Priority diamond on the top threat (the ALR-56C missile 'M' always sits in one).
  if ((top || (missile && spec.id === 'alr56c')) && spec.id !== 'jf17rwr') {
    g.ink(col, 1.3, 0.34, a);
    diamond(g, p.x, p.y - 0.4 * u, 4.4 * u);
  }

  // New threat: upper semicircle.
  if (isNew && spec.id !== 'jf17rwr') {
    g.ink(col, 1.1, 0.3, a);
    g.arc(p.x, p.y - 0.2 * u, 5.2 * u, Math.PI * 1.08, Math.PI * 1.92);
  } else if (isNew) {
    g.ink(th.missile, 1, 0.3, blinkOn(4, now) ? 1 : 0.3);
    g.rect(p.x - tw / 2 - 1.2 * u, p.y - 2.8 * u, tw + 2.4 * u, 5.6 * u);
  }

  // Lock emphasis.
  if (lock && spec.id === 'alr56m') {
    g.ink(col, 1.3, 0.34, a);
    g.rect(p.x - 3.6 * u, p.y - 3.4 * u, 7.2 * u, 6.8 * u);
  }

  // Launch / guidance marks.
  if (launch || missile) {
    const fl = blinkOn(3, now, 0.55);
    if (spec.id === 'alr56c') {
      if (launch && fl) { g.ink(col, 1.4, 0.32); g.circle(p.x, p.y - 0.2 * u, 5.4 * u); }
      if (fl) { g.ink(col, 1.4, 0.32); g.arc(p.x, p.y, 6.2 * u, Math.PI * 0.1, Math.PI * 0.9); }
    } else if (spec.id === 'alr56m' || spec.id === 'serval') {
      if (fl) { g.ink(col, 1.4, 0.32); g.circle(p.x, p.y - 0.2 * u, 5.2 * u); }
    } else if (spec.id === 'alr67') {
      if (fl) { g.ink(col, 1.4, 0.32); g.arc(p.x, p.y, 5.6 * u, Math.PI * 0.1, Math.PI * 0.9); }
    }
  }
}

/** Warning-panel lamps next to the scope (drawn in the square's corners). */
function drawCornerLamps(f: RwrFrame): void {
  const { g, th, spec, ranked, now } = f;
  const anyLock = ranked.some(c => c.state === 'lock');
  const anyLaunch = ranked.some(c => c.state === 'launch' || c.state === 'missile');
  const lampTxt = (s: string, x: number, y: number, lit: boolean, color: string, flash = false) => {
    const on = lit && (!flash || blinkOn(3, now, 0.55));
    g.ink(on ? color : th.symDim, on ? 1.4 : 0, 0.3, on ? 1 : 0.55);
    g.font(2.5, 700);
    g.text(s, x, y, x < RX(f, 50) ? 'left' : 'right');
  };
  const L = RX(f, 2), Rr = RX(f, 98), T = RY(f, 3.5), B = RY(f, 96.5);
  switch (spec.id) {
    case 'alr67':
      lampTxt('AI', L, T, anyLock || anyLaunch, th.warning, anyLaunch);
      lampTxt('CW', Rr, T, ranked.some(c => c.state === 'launch'), th.warning, true);
      break;
    case 'alr56m':
      lampTxt('LAUNCH', L, B, anyLaunch, th.warning, true);
      lampTxt('ACT/PWR', Rr, B, anyLock || anyLaunch, th.caution);
      break;
    case 'jf17rwr':
      lampTxt('MSL LCH', L, B, anyLaunch, th.warning, true);
      break;
    case 'serval':
      lampTxt('DA', L, T, true, th.ok);
      lampTxt('D2M', Rr, T, anyLaunch, th.warning, true);
      lampTxt('+', L, B, true, th.sym);
      break;
    default:
      break;
  }
}
