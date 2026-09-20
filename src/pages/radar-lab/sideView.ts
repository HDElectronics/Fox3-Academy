/**
 * [OWNER: page-radar-lab] 2D side view of the scan: own altitude, the bar wedges fanning out with range,
 * the cursor with the coverage altitudes, the detection range (look-up vs look-down) and every target at
 * its true altitude and ground range. The clearest picture of elevation coverage. Canvas 2D, token colours.
 */
import { readTheme, alpha, type Theme } from '../../ui/theme';
import { M_PER_FT, M_PER_NM } from '../../sim/math';
import type { Units } from '../../app/format';

export type SideTargetState = 'seen' | 'scan' | 'out';

export interface SideTarget {
  id: string;
  label: string;
  groundRange: number;
  alt: number;
  state: SideTargetState;
  selected: boolean;
}

export interface SideViewData {
  units: Units;
  ownAlt: number;
  /** Plotted range (m): the radar display range. */
  rangeMax: number;
  /** Bar bands [lo, hi] (rad rel horizon), bar 0 lowest. */
  bands: [number, number][];
  currentBar: number;
  beamEl: number;
  top: number;
  bottom: number;
  cursorRange: number;
  /** Reference-fighter detection ranges (m): hot look-up, hot look-down. */
  detectUp: number;
  detectDown: number;
  targets: SideTarget[];
  /** 'off' hides the scan. */
  radarOn: boolean;
}

interface Rect { l: number; t: number; w: number; h: number }

export class SideView {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private theme: Theme;
  private ro: ResizeObserver | null = null;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private last: SideViewData | null = null;
  private plot: Rect = { l: 0, t: 0, w: 1, h: 1 };
  private amax = 15000;
  private amin = -800;
  private pts: { id: string; x: number; y: number }[] = [];
  /** Vertical exaggeration of the last frame (vertical px per metre ÷ horizontal px per metre). */
  exaggeration = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.theme = readTheme();
    if (typeof ResizeObserver === 'function') {
      this.ro = new ResizeObserver(() => { this.measure(); if (this.last) this.draw(this.last); });
      this.ro.observe(canvas);
    }
    this.measure();
  }

  private measure(): void {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(3, window.devicePixelRatio || 1);
    this.w = Math.max(1, Math.round(r.width));
    this.h = Math.max(1, Math.round(r.height));
    const W = Math.round(this.w * this.dpr), H = Math.round(this.h * this.dpr);
    if (this.canvas.width !== W) this.canvas.width = W;
    if (this.canvas.height !== H) this.canvas.height = H;
  }

  /** Target under a client point (12 px slop), or null. */
  pick(clientX: number, clientY: number, slop = 12): string | null {
    const r = this.canvas.getBoundingClientRect();
    const x = clientX - r.left, y = clientY - r.top;
    let best: string | null = null, bd = slop;
    for (const p of this.pts) { const d = Math.hypot(p.x - x, p.y - y); if (d <= bd) { bd = d; best = p.id; } }
    return best;
  }

  draw(d: SideViewData): void {
    this.last = d;
    const g = this.ctx;
    if (!g) return;
    if (this.w < 4 || this.h < 4) this.measure();
    const T = this.theme, u = d.units;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.w, this.h);
    g.fillStyle = T.screen;
    g.fillRect(0, 0, this.w, this.h);
    const font = (px: number) => `${px}px ${T.fontMono}`;

    // Altitude span: at least 15 km / 50k ft, enough for everyone in the picture.
    const step = u === 'metric' ? 3000 : 10000 * M_PER_FT;
    const highest = Math.max(d.ownAlt + 3000, ...d.targets.map(t => t.alt + 1500), u === 'metric' ? 15000 : 50000 * M_PER_FT);
    this.amax = Math.ceil(highest / step) * step;
    this.amin = -0.07 * this.amax;
    const P = this.plot = { l: 34, t: 20, w: Math.max(10, this.w - 34 - 10), h: Math.max(10, this.h - 20 - 20) };
    const X = (m: number) => P.l + (m / d.rangeMax) * P.w;
    const Y = (a: number) => P.t + P.h - ((a - this.amin) / (this.amax - this.amin)) * P.h;
    this.exaggeration = (P.h / (this.amax - this.amin)) / (P.w / d.rangeMax);

    // Grid and axes.
    g.lineWidth = 1;
    g.strokeStyle = T.screenLine;
    g.fillStyle = alpha(T.sym, 0.55);
    g.font = font(10);
    g.textBaseline = 'middle';
    g.textAlign = 'right';
    for (let a = 0; a <= this.amax + 1; a += step) {
      const y = Math.round(Y(a)) + 0.5;
      g.beginPath(); g.moveTo(P.l, y); g.lineTo(P.l + P.w, y); g.stroke();
      if (a > 0) g.fillText(u === 'metric' ? String(Math.round(a / 1000)) : String(Math.round(a / M_PER_FT / 1000)) + 'k', P.l - 5, y);
    }
    const unitM = u === 'metric' ? 1000 : M_PER_NM;
    const span = d.rangeMax / unitM;
    const rStep = niceStep(span / 5);
    g.textAlign = 'center';
    g.textBaseline = 'top';
    for (let v = rStep; v < span - rStep * 0.3; v += rStep) {
      const x = Math.round(X(v * unitM)) + 0.5;
      g.beginPath(); g.moveTo(x, P.t); g.lineTo(x, Y(0)); g.stroke();
      g.fillText(String(Math.round(v)), x, P.t + P.h + 5);
    }
    g.textAlign = 'right';
    g.fillText(u === 'metric' ? 'km' : 'nm', P.l + P.w, P.t + P.h + 5);
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.fillText(u === 'metric' ? 'ALT km' : 'ALT ft', 4, 4);

    // Ground below altitude 0.
    g.fillStyle = alpha(T.earth, 0.55);
    g.fillRect(P.l, Y(0), P.w, P.t + P.h - Y(0));
    g.strokeStyle = alpha(T.sym, 0.35);
    g.beginPath(); g.moveTo(P.l, Y(0) + 0.5); g.lineTo(P.l + P.w, Y(0) + 0.5); g.stroke();

    const x0 = X(0), y0 = Y(d.ownAlt), xr = X(d.rangeMax);
    const yAt = (el: number, range: number) => Y(d.ownAlt + range * Math.tan(clampEl(el)));
    g.save();
    g.beginPath(); g.rect(P.l, P.t, P.w, Y(0) - P.t); g.clip();

    // Level line from own altitude (the antenna's zero).
    g.setLineDash([3, 4]);
    g.strokeStyle = alpha(T.sym, 0.35);
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(xr, y0); g.stroke();
    g.setLineDash([]);

    if (d.radarOn) {
      // Bar wedges: alternate shading so each bar reads as its own slice; the current bar lit.
      d.bands.forEach(([lo, hi], i) => {
        const cur = i === d.currentBar;
        g.fillStyle = alpha(cur ? T.symHi : T.sym, cur ? 0.26 : i % 2 ? 0.1 : 0.16);
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(xr, yAt(hi, d.rangeMax)); g.lineTo(xr, yAt(lo, d.rangeMax)); g.closePath(); g.fill();
      });
      // Pattern edges.
      g.strokeStyle = alpha(T.sym, 0.9);
      g.lineWidth = 1.3;
      for (const el of [d.top, d.bottom]) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(xr, yAt(el, d.rangeMax)); g.stroke(); }
      // Beam centre.
      g.strokeStyle = alpha(T.symHi, 0.85);
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(xr, yAt(d.beamEl, d.rangeMax)); g.stroke();
    }

    // Detection range for a hot fighter: look-up above your altitude, look-down below it.
    g.setLineDash([2, 3]);
    g.strokeStyle = alpha(T.sym, 0.6);
    g.lineWidth = 1;
    const xu = X(d.detectUp), xd = X(d.detectDown);
    if (d.detectUp <= d.rangeMax) { g.beginPath(); g.moveTo(xu, P.t); g.lineTo(xu, y0); g.stroke(); }
    if (d.detectDown <= d.rangeMax) { g.beginPath(); g.moveTo(xd, y0); g.lineTo(xd, Y(0)); g.stroke(); }
    g.setLineDash([]);
    g.restore();

    g.font = font(9);
    g.fillStyle = alpha(T.sym, 0.75);
    g.textBaseline = 'top';
    if (d.detectUp <= d.rangeMax) {
      // Just above your altitude line, where the look-up detection line meets it.
      g.textAlign = xu > P.l + P.w - 60 ? 'right' : 'left';
      g.textBaseline = 'bottom';
      g.fillText('DET HOT', xu + (g.textAlign === 'left' ? 3 : -3), y0 - 3);
    }
    if (d.detectDown <= d.rangeMax && Math.abs(xd - xu) > 2) {
      g.textAlign = xd > P.l + P.w - 60 ? 'right' : 'left';
      g.textBaseline = 'bottom';
      g.fillText('LOOK-DOWN', xd + (g.textAlign === 'left' ? 3 : -3), Y(0) - 2);
    }

    // Cursor: the range where the coverage numbers are read.
    const taken: Rect[] = [];
    if (d.radarOn && d.cursorRange > 0 && d.cursorRange <= d.rangeMax) {
      const xc = Math.round(X(d.cursorRange)) + 0.5;
      const covT = d.ownAlt + d.cursorRange * Math.tan(clampEl(d.top));
      const covB = d.ownAlt + d.cursorRange * Math.tan(clampEl(d.bottom));
      g.strokeStyle = alpha(T.symHi, 0.9);
      g.setLineDash([4, 3]);
      g.beginPath(); g.moveTo(xc, P.t); g.lineTo(xc, Y(0)); g.stroke();
      g.setLineDash([]);
      const yt = clampY(Y(covT), P), yb = clampY(Y(Math.max(0, covB)), P);
      g.fillStyle = T.symHi;
      g.beginPath(); g.arc(xc, yt, 2.5, 0, Math.PI * 2); g.arc(xc, yb, 2.5, 0, Math.PI * 2); g.fill();
      g.font = font(10);
      g.textAlign = xc > P.l + P.w - 70 ? 'right' : 'left';
      const dx = g.textAlign === 'left' ? 5 : -5;
      g.textBaseline = 'bottom';
      taken.push(plate(g, T, altLabel(covT, u), xc + dx, yt - 2));
      g.textBaseline = 'top';
      taken.push(plate(g, T, altLabel(covB, u), xc + dx, yb + 2));
    }

    // Targets.
    this.pts = [];
    for (const t of d.targets) {
      if (t.groundRange > d.rangeMax * 1.02) continue;
      const x = X(t.groundRange), y = Y(t.alt);
      if (y < P.t - 4) continue;
      this.pts.push({ id: t.id, x, y });
      g.strokeStyle = alpha(T.sym, 0.18);
      g.beginPath(); g.moveTo(Math.round(x) + 0.5, y); g.lineTo(Math.round(x) + 0.5, Y(0)); g.stroke();
      g.lineWidth = 1.5;
      if (t.state === 'seen') {
        g.fillStyle = T.sym;
        g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill();
      } else if (t.state === 'scan') {
        g.strokeStyle = T.caution;
        g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.stroke();
      } else {
        g.strokeStyle = alpha(T.sym, 0.5);
        g.beginPath(); g.arc(x, y, 3.5, 0, Math.PI * 2); g.stroke();
      }
      if (t.selected) {
        g.strokeStyle = T.symHi;
        g.lineWidth = 1.2;
        g.beginPath(); g.arc(x, y, 8, 0, Math.PI * 2); g.stroke();
        g.font = font(10);
        g.fillStyle = T.symHi;
        // First corner that clears the coverage plates and the plot edge: right-above, right-below, left-above, left-below.
        const tw = g.measureText(t.label).width, th = 12;
        const spots = [[1, -1], [1, 1], [-1, -1], [-1, 1]].map(([sx, sy]) => ({
          sx, sy, r: { l: sx > 0 ? x + 10 : x - 10 - tw, t: sy < 0 ? y - 4 - th : y + 4, w: tw, h: th },
        }));
        const fits = (r: Rect) => r.l >= P.l && r.l + r.w <= P.l + P.w && r.t >= P.t && r.t + r.h <= P.t + P.h
          && !taken.some(o => r.l < o.l + o.w && o.l < r.l + r.w && r.t < o.t + o.h && o.t < r.t + r.h);
        const spot = spots.find(sp => fits(sp.r)) ?? spots[x > P.l + P.w - 80 ? 2 : 0];
        g.textAlign = 'left';
        g.textBaseline = 'top';
        g.fillText(t.label, spot.r.l, spot.r.t);
      }
      g.lineWidth = 1;
    }

    // Own jet.
    g.fillStyle = T.symHi;
    g.beginPath(); g.moveTo(x0 + 7, y0); g.lineTo(x0 - 3, y0 - 4); g.lineTo(x0 - 3, y0 + 4); g.closePath(); g.fill();
    g.font = font(10);
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    plate(g, T, u === 'metric' ? (d.ownAlt / 1000).toFixed(1) : Math.round(d.ownAlt / M_PER_FT / 1000) + 'k', P.l - 4, y0);

    // Legend.
    g.font = font(9);
    g.textAlign = 'right';
    g.textBaseline = 'top';
    const lx = P.l + P.w - 2;
    g.fillStyle = alpha(T.sym, 0.7);
    g.fillText('VERT ×' + Math.max(1, Math.round(this.exaggeration)), lx, 3);
  }

  dispose(): void {
    this.ro?.disconnect();
    this.ro = null;
    this.last = null;
  }
}

function clampEl(e: number): number { return Math.max(-1.45, Math.min(1.45, e)); }
function clampY(y: number, P: Rect): number { return Math.max(P.t + 6, Math.min(P.t + P.h - 6, y)); }

function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-6))));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

function altLabel(m: number, u: Units): string {
  if (m < 0) m = 0;
  return u === 'metric' ? (m / 1000).toFixed(1) + ' km' : Math.round(m / M_PER_FT / 1000) + 'k ft';
}

/** Text on a small black plate so it stays readable over the wedges. Returns the plate's box. */
function plate(g: CanvasRenderingContext2D, T: Theme, text: string, x: number, y: number): Rect {
  const w = g.measureText(text).width + 6, hgt = 13;
  let left = x - 3;
  if (g.textAlign === 'right') left = x - w + 3;
  else if (g.textAlign === 'center') left = x - w / 2;
  let top = y - hgt / 2;
  if (g.textBaseline === 'bottom') top = y - hgt + 1;
  else if (g.textBaseline === 'top') top = y - 1;
  g.fillStyle = alpha(T.screen, 0.85);
  g.fillRect(left, top, w, hgt);
  g.fillStyle = T.symHi;
  g.fillText(text, x, y);
  return { l: left, t: top, w, h: hgt };
}
