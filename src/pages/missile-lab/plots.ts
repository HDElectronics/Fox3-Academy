/**
 * Missile Lab plots: crisp canvas-2D charts drawn on the black glass of a screen bezel, coloured only
 * from design tokens (readTheme). TimePlot (value vs time for several shots, with a playhead, hover
 * crosshair and click-to-scrub), EnergyChart (end-of-flight energy per shot) and DlzChart (Rmax / Rne vs
 * shooter altitude or Mach).
 */
import { alpha, readTheme, type Theme } from '../../ui/theme';

// ------------------------------------------------------------------------------------------ surface

/** A canvas that tracks its CSS size and device pixel ratio. */
class Surface {
  readonly ctx: CanvasRenderingContext2D;
  w = 0;
  h = 0;
  dpr = 1;
  private ro: ResizeObserver | null = null;

  constructor(readonly canvas: HTMLCanvasElement, private onResize: () => void) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx = ctx;
    if (typeof ResizeObserver === 'function') {
      this.ro = new ResizeObserver(() => { if (this.measure()) this.onResize(); });
      this.ro.observe(canvas);
    }
    this.measure();
  }

  /** Match the backing store to the CSS box. Returns true when the size changed. */
  measure(): boolean {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    if (w === this.w && h === this.h && dpr === this.dpr) return false;
    this.w = w; this.h = h; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    return true;
  }

  begin(bg: string): CanvasRenderingContext2D {
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.w, this.h);
    c.fillStyle = bg;
    c.fillRect(0, 0, this.w, this.h);
    return c;
  }

  dispose(): void { this.ro?.disconnect(); this.ro = null; }
}

/** A "nice" tick step for a span and a wanted tick count. */
export function niceStep(span: number, ticks: number): number {
  if (!(span > 0)) return 1;
  const raw = span / Math.max(1, ticks);
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
}

function fontOf(t: Theme, px: number): string {
  return `${px}px ${t.fontMono || 'monospace'}`;
}

// ------------------------------------------------------------------------------------------ time plot

export interface PlotLine {
  /** Shot letter (A, B, C), used in the hover readout and the end label. */
  key: string;
  color: string;
  dash: number[];
  width?: number;
  alpha?: number;
  t: number[];
  v: number[];
  /** Include in the hover readout (secondary lines like the target altitude may not). */
  readout?: boolean;
}
export interface PlotMark { t: number; v: number; color: string; shape: 'diamond' | 'dot' | 'cross'; label?: string }
export interface PlotBand { t0: number; t1: number; label: string }
/** A dashed reference line; its label sits at the left end unless align is 'right'. */
export interface PlotHLine { v: number; label: string; align?: 'left' | 'right' }

export interface TimePlotData {
  lines: PlotLine[];
  marks: PlotMark[];
  bands: PlotBand[];
  hlines: PlotHLine[];
  xMax: number;
  yMax: number;
}

export interface TimePlotOptions {
  /** Unit or quantity printed top-left ('MACH', 'km', 'kft'). */
  yTitle: string;
  yFmt?: (v: number) => string;
  valueFmt?: (v: number) => string;
  empty: string;
  onScrub?: (t: number) => void;
  ariaLabel: string;
  /** Data units per display unit (ticks are placed on round display values). Default 1. */
  yUnit?: number;
}

/** Top padding leaves the y title (drawn at y = 8) clear of the top tick label. */
const PAD = { l: 34, r: 10, t: 22, b: 18 };

export class TimePlot {
  private s: Surface;
  private theme: Theme;
  private data: TimePlotData | null = null;
  private playhead: number | null = null;
  private hoverT: number | null = null;
  private dragging = false;
  private offs: (() => void)[] = [];

  constructor(readonly canvas: HTMLCanvasElement, private o: TimePlotOptions) {
    this.theme = readTheme();
    this.s = new Surface(canvas, () => this.draw());
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', o.ariaLabel);
    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void) => {
      canvas.addEventListener(type, fn as EventListener);
      this.offs.push(() => canvas.removeEventListener(type, fn as EventListener));
    };
    on('pointermove', e => {
      const t = this.timeAt(e.clientX);
      this.hoverT = t;
      if (this.dragging && t !== null) this.o.onScrub?.(t);
      this.draw();
    });
    on('pointerleave', () => { this.hoverT = null; this.dragging = false; this.draw(); });
    on('pointerdown', e => {
      const t = this.timeAt(e.clientX);
      if (t === null) return;
      this.dragging = true;
      try { canvas.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
      this.o.onScrub?.(t);
    });
    on('pointerup', e => { this.dragging = false; try { canvas.releasePointerCapture(e.pointerId); } catch { /* fine */ } });
  }

  private timeAt(clientX: number): number | null {
    if (!this.data) return null;
    const r = this.canvas.getBoundingClientRect();
    const x = clientX - r.left;
    const pw = this.s.w - PAD.l - PAD.r;
    if (pw <= 0) return null;
    const k = (x - PAD.l) / pw;
    return Math.max(0, Math.min(this.data.xMax, k * this.data.xMax));
  }

  setData(d: TimePlotData | null): void { this.data = d; this.draw(); }

  setPlayhead(t: number | null): void {
    if (t === this.playhead) return;
    this.playhead = t;
    this.draw();
  }

  draw(): void {
    const s = this.s;
    s.measure();
    const T = this.theme;
    const c = s.begin(T.screen);
    const W = s.w, H = s.h;
    const px = PAD.l, py = PAD.t, pw = W - PAD.l - PAD.r, ph = H - PAD.t - PAD.b;
    if (pw < 20 || ph < 20) return;
    const d = this.data;
    const ink = alpha(T.sym, 0.78), faint = alpha(T.sym, 0.14), axis = alpha(T.sym, 0.4);
    c.font = fontOf(T, 10);
    c.textBaseline = 'middle';
    // y title
    c.fillStyle = ink;
    c.textAlign = 'left';
    c.fillText(this.o.yTitle, 4, 8);
    if (!d || !d.lines.length) {
      c.strokeStyle = axis; c.lineWidth = 1;
      c.strokeRect(px + 0.5, py + 0.5, pw, ph);
      c.fillStyle = alpha(T.sym, 0.6);
      c.textAlign = 'center';
      c.fillText(this.o.empty, px + pw / 2, py + ph / 2);
      return;
    }
    const xMax = Math.max(1, d.xMax), yMax = Math.max(1e-6, d.yMax);
    const X = (t: number) => px + (t / xMax) * pw;
    const Y = (v: number) => py + ph - (v / yMax) * ph;

    // burn bands
    for (const b of d.bands) {
      const x0 = X(Math.max(0, b.t0)), x1 = X(Math.min(xMax, b.t1));
      c.fillStyle = alpha(T.sym, 0.1);
      c.fillRect(x0, py, Math.max(1, x1 - x0), ph);
      c.fillStyle = alpha(T.sym, 0.55);
      c.textAlign = 'left';
      c.font = fontOf(T, 9);
      if (x1 - x0 > 22) c.fillText(b.label, x0 + 3, py + 7);
      c.font = fontOf(T, 10);
    }
    // grid + ticks
    c.lineWidth = 1;
    const yu = this.o.yUnit ?? 1;
    const ys = niceStep(yMax / yu, Math.max(2, Math.floor(ph / 34))) * yu;
    c.textAlign = 'right';
    for (let v = 0; v <= yMax + 1e-9; v += ys) {
      const y = Math.round(Y(v)) + 0.5;
      c.strokeStyle = faint;
      c.beginPath(); c.moveTo(px, y); c.lineTo(px + pw, y); c.stroke();
      c.fillStyle = ink;
      c.fillText((this.o.yFmt ?? (x => String(x)))(v), px - 4, y);
    }
    const xs = niceStep(xMax, Math.max(2, Math.floor(pw / 56)));
    c.textAlign = 'center';
    c.textBaseline = 'top';
    for (let t = 0; t <= xMax + 1e-9; t += xs) {
      const x = Math.round(X(t)) + 0.5;
      c.strokeStyle = faint;
      c.beginPath(); c.moveTo(x, py); c.lineTo(x, py + ph); c.stroke();
      c.fillStyle = ink;
      if (x < W - 22) c.fillText(String(Math.round(t)), x, py + ph + 4);
    }
    c.textAlign = 'right';
    c.fillText('s', W - 2, py + ph + 4);
    c.textBaseline = 'middle';
    // axes
    c.strokeStyle = axis;
    c.beginPath(); c.moveTo(px + 0.5, py); c.lineTo(px + 0.5, py + ph + 0.5); c.lineTo(px + pw, py + ph + 0.5); c.stroke();
    // reference lines
    for (const hl of d.hlines) {
      if (hl.v <= 0 || hl.v >= yMax) continue;
      const y = Math.round(Y(hl.v)) + 0.5;
      c.strokeStyle = alpha(T.sym, 0.45);
      c.setLineDash([3, 4]);
      c.beginPath(); c.moveTo(px, y); c.lineTo(px + pw, y); c.stroke();
      c.setLineDash([]);
      c.fillStyle = alpha(T.sym, 0.7);
      c.textAlign = hl.align === 'right' ? 'right' : 'left';
      c.font = fontOf(T, 9);
      c.fillText(hl.label, hl.align === 'right' ? px + pw - 4 : px + 4, y - 7);
      c.font = fontOf(T, 10);
    }
    // lines
    c.save();
    c.beginPath(); c.rect(px, py - 2, pw + 2, ph + 4); c.clip();
    c.lineJoin = 'round'; c.lineCap = 'round';
    for (const l of d.lines) {
      if (l.t.length < 2) continue;
      c.strokeStyle = l.alpha !== undefined ? alpha(l.color, l.alpha) : l.color;
      c.lineWidth = l.width ?? 2;
      c.setLineDash(l.dash);
      c.beginPath();
      c.moveTo(X(l.t[0]), Y(l.v[0]));
      for (let i = 1; i < l.t.length; i++) c.lineTo(X(l.t[i]), Y(l.v[i]));
      c.stroke();
    }
    c.setLineDash([]);
    c.restore();
    // marks (pitbull, end)
    for (const m of d.marks) {
      const x = X(m.t), y = Y(m.v);
      c.strokeStyle = m.color; c.fillStyle = m.color; c.lineWidth = 1.5;
      if (m.shape === 'diamond') {
        c.beginPath(); c.moveTo(x, y - 5); c.lineTo(x + 5, y); c.lineTo(x, y + 5); c.lineTo(x - 5, y); c.closePath();
        c.fillStyle = T.screen; c.fill(); c.stroke();
      } else if (m.shape === 'dot') {
        c.beginPath(); c.arc(x, y, 4, 0, Math.PI * 2);
        c.fillStyle = m.color; c.fill();
        c.strokeStyle = T.screen; c.lineWidth = 2; c.stroke();
      } else {
        c.beginPath(); c.moveTo(x - 4, y - 4); c.lineTo(x + 4, y + 4); c.moveTo(x + 4, y - 4); c.lineTo(x - 4, y + 4); c.stroke();
      }
      if (m.label) {
        c.fillStyle = ink;
        c.font = fontOf(T, 9);
        c.textAlign = x > px + pw - 30 ? 'right' : 'left';
        c.fillText(m.label, x + (c.textAlign === 'right' ? -7 : 7), y - 8);
        c.font = fontOf(T, 10);
      }
    }
    // playhead
    if (this.playhead !== null && this.playhead > 0) {
      const x = Math.round(X(Math.min(xMax, this.playhead))) + 0.5;
      c.strokeStyle = alpha(T.symHi, 0.75); c.lineWidth = 1;
      c.beginPath(); c.moveTo(x, py); c.lineTo(x, py + ph); c.stroke();
    }
    // hover crosshair + readout
    const ht = this.hoverT;
    if (ht !== null) {
      const x = Math.round(X(ht)) + 0.5;
      c.strokeStyle = alpha(T.sym, 0.6); c.lineWidth = 1;
      c.setLineDash([2, 3]);
      c.beginPath(); c.moveTo(x, py); c.lineTo(x, py + ph); c.stroke();
      c.setLineDash([]);
      const parts: { key: string; color: string; text: string }[] = [];
      for (const l of d.lines) {
        if (l.readout === false || !l.t.length || ht > l.t[l.t.length - 1] + 0.01) continue;
        const v = sampleAt(l.t, l.v, ht);
        if (v === null) continue;
        parts.push({ key: l.key, color: l.color, text: (this.o.valueFmt ?? this.o.yFmt ?? (z => z.toFixed(1)))(v) });
        c.fillStyle = l.color;
        c.beginPath(); c.arc(X(ht), Y(v), 3, 0, Math.PI * 2); c.fill();
      }
      c.textAlign = 'left';
      c.font = fontOf(T, 10);
      let tx = px + 6;
      const ty = py + 8;
      c.fillStyle = ink;
      const tl = `${ht.toFixed(0)} s`;
      c.fillText(tl, tx, ty);
      tx += c.measureText(tl).width + 8;
      for (const p of parts) {
        c.fillStyle = p.color;
        c.fillRect(tx, ty - 3, 6, 6);
        tx += 9;
        c.fillStyle = ink;
        const s2 = `${p.key} ${p.text}`;
        c.fillText(s2, tx, ty);
        tx += c.measureText(s2).width + 8;
      }
    }
  }

  dispose(): void { for (const f of this.offs) f(); this.offs = []; this.s.dispose(); }
}

/** Linear interpolation of v at time t (t ascending); null outside. */
export function sampleAt(t: ArrayLike<number>, v: ArrayLike<number>, x: number): number | null {
  const n = t.length;
  if (!n || x < t[0] - 1e-9 || x > t[n - 1] + 1e-9) return null;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (t[mid] <= x) lo = mid; else hi = mid; }
  if (hi === lo) return v[lo];
  const k = (x - t[lo]) / Math.max(1e-9, t[hi] - t[lo]);
  return v[lo] + (v[hi] - v[lo]) * Math.max(0, Math.min(1, k));
}

// ------------------------------------------------------------------------------------------ energy

export interface EnergyRow {
  key: string;
  color: string;
  peakMach: number;
  endMach: number;
  endG: number;
  hit: boolean;
  verdict: string;
  selected: boolean;
}

/** One row per shot: peak Mach (dim) and Mach at the end (bright), g left, verdict. */
export class EnergyChart {
  private s: Surface;
  private theme: Theme;
  private rows: EnergyRow[] = [];

  constructor(readonly canvas: HTMLCanvasElement, private empty: string) {
    this.theme = readTheme();
    this.s = new Surface(canvas, () => this.draw());
    canvas.setAttribute('role', 'img');
  }

  setRows(rows: EnergyRow[]): void {
    this.rows = rows;
    this.canvas.setAttribute('aria-label', rows.length
      ? 'Energy at the end: ' + rows.map(r => `${r.key} Mach ${r.endMach.toFixed(2)}, ${Math.round(r.endG)} g, ${r.verdict}`).join('; ')
      : this.empty);
    this.draw();
  }

  draw(): void {
    const s = this.s;
    s.measure();
    const T = this.theme;
    const c = s.begin(T.screen);
    const W = s.w, H = s.h;
    const ink = alpha(T.sym, 0.78);
    c.font = fontOf(T, 10);
    c.textBaseline = 'middle';
    if (!this.rows.length) {
      c.fillStyle = alpha(T.sym, 0.6);
      c.textAlign = 'center';
      c.fillText(this.empty, W / 2, H / 2);
      return;
    }
    const maxM = Math.max(2, Math.ceil(Math.max(...this.rows.map(r => r.peakMach)) * 2) / 2);
    const lx = 22, rx = W - 10, top = 22, bottom = H - 22;
    const scaleW = rx - lx;
    const X = (m: number) => lx + (m / maxM) * scaleW;
    // axis ticks along the bottom
    c.textAlign = 'center';
    c.textBaseline = 'top';
    for (let m = 0; m <= maxM + 1e-9; m += maxM > 3 ? 1 : 0.5) {
      const x = Math.round(X(m)) + 0.5;
      c.strokeStyle = alpha(T.sym, m === 1 ? 0.35 : 0.14);
      c.lineWidth = 1;
      c.beginPath(); c.moveTo(x, top - 4); c.lineTo(x, bottom); c.stroke();
      c.fillStyle = ink;
      c.fillText(m === 0 ? 'M0' : (m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)), x, bottom + 4);
    }
    c.textBaseline = 'middle';
    c.textAlign = 'left';
    c.fillStyle = ink;
    c.fillText('MACH AT END  ·  PEAK DIM', lx, 9);
    const n = this.rows.length;
    const rowH = Math.min(52, (bottom - top) / n);
    const off = Math.max(0, (bottom - top - rowH * n) / 2);
    this.rows.forEach((r, i) => {
      const y0 = top + off + i * rowH + 4;
      const bh = Math.max(6, Math.min(12, rowH * 0.3));
      // letter
      c.fillStyle = r.selected ? T.symHi : ink;
      c.font = fontOf(T, 11);
      c.fillText(r.key, 6, y0 + bh / 2);
      c.font = fontOf(T, 10);
      // peak (dim) and end (bright) bars
      c.fillStyle = alpha(r.color, 0.22);
      c.fillRect(lx, y0, Math.max(1, X(r.peakMach) - lx), bh);
      c.fillStyle = r.color;
      c.fillRect(lx, y0, Math.max(2, X(r.endMach) - lx), bh);
      // verdict line under the bar
      c.fillStyle = ink;
      let txt = `M${r.endMach.toFixed(2)} · ${Math.round(r.endG)} g left · ${r.verdict}`;
      if (c.measureText(txt).width > rx - lx) txt = `M${r.endMach.toFixed(2)} · ${Math.round(r.endG)} g · ${r.verdict}`;
      c.fillText(txt, lx, y0 + bh + 9);
    });
  }

  dispose(): void { this.s.dispose(); }
}

// ------------------------------------------------------------------------------------------ DLZ chart

export interface DlzCurve { x: number[]; rmax: number[]; rne: number[]; rmin: number[] }
export interface DlzChartData {
  curve: DlzCurve;
  xMin: number;
  xMax: number;
  xFmt: (x: number) => string;
  xTitle: string;
  yTitle: string;
  yFmt: (v: number) => string;
  names: { rmax: string; rne: string; rmin: string };
  /** Current setup: x and launch range (same units as the curve). */
  you: { x: number; range: number } | null;
}

export class DlzChart {
  private s: Surface;
  private theme: Theme;
  private d: DlzChartData | null = null;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.theme = readTheme();
    this.s = new Surface(canvas, () => this.draw());
    canvas.setAttribute('role', 'img');
  }

  setData(d: DlzChartData): void {
    this.d = d;
    const i = d.you ? nearestIndex(d.curve.x, d.you.x) : -1;
    this.canvas.setAttribute('aria-label', `${d.names.rmax} and ${d.names.rne} against ${d.xTitle.toLowerCase()}` +
      (i >= 0 ? `. At your setting: ${d.names.rmax} ${d.yFmt(d.curve.rmax[i])}, ${d.names.rne} ${d.yFmt(d.curve.rne[i])}` : ''));
    this.draw();
  }

  draw(): void {
    const s = this.s;
    s.measure();
    const T = this.theme;
    const c = s.begin(T.screen);
    const d = this.d;
    if (!d) return;
    const W = s.w, H = s.h;
    const pl = 34, pr = 44, pt = 16, pb = 26;
    const pw = W - pl - pr, ph = H - pt - pb;
    if (pw < 30 || ph < 30) return;
    const ink = alpha(T.sym, 0.78), faint = alpha(T.sym, 0.14);
    const yMax0 = Math.max(...d.curve.rmax, d.you?.range ?? 0) * 1.08;
    const ys = niceStep(yMax0, Math.max(2, Math.floor(ph / 30)));
    const yMax = Math.ceil(yMax0 / ys) * ys;
    const X = (x: number) => pl + ((x - d.xMin) / (d.xMax - d.xMin)) * pw;
    const Y = (v: number) => pt + ph - (v / yMax) * ph;
    c.font = fontOf(T, 10);
    c.textBaseline = 'middle';
    c.fillStyle = ink;
    c.textAlign = 'left';
    c.fillText(d.yTitle, 4, 8);
    c.lineWidth = 1;
    c.textAlign = 'right';
    for (let v = 0; v <= yMax + 1e-9; v += ys) {
      const y = Math.round(Y(v)) + 0.5;
      c.strokeStyle = faint;
      c.beginPath(); c.moveTo(pl, y); c.lineTo(pl + pw, y); c.stroke();
      c.fillStyle = ink;
      c.fillText(d.yFmt(v), pl - 4, y);
    }
    const xs = niceStep(d.xMax - d.xMin, Math.max(2, Math.floor(pw / 50)));
    c.textAlign = 'center';
    c.textBaseline = 'top';
    for (let x = Math.ceil(d.xMin / xs) * xs; x <= d.xMax + 1e-9; x += xs) {
      const px = Math.round(X(x)) + 0.5;
      c.strokeStyle = faint;
      c.beginPath(); c.moveTo(px, pt); c.lineTo(px, pt + ph); c.stroke();
      c.fillStyle = ink;
      c.fillText(d.xFmt(x), px, pt + ph + 4);
    }
    c.textAlign = 'right';
    c.fillText(d.xTitle, pl + pw, pt + ph + 14);
    c.textBaseline = 'middle';
    c.strokeStyle = alpha(T.sym, 0.4);
    c.beginPath(); c.moveTo(pl + 0.5, pt); c.lineTo(pl + 0.5, pt + ph + 0.5); c.lineTo(pl + pw, pt + ph + 0.5); c.stroke();

    const cv = d.curve;
    // zone fills: Rne..Rmax outlined band, Rmin..Rne solid (no-escape)
    const fillBetween = (a: number[], b: number[], col: string) => {
      c.beginPath();
      c.moveTo(X(cv.x[0]), Y(a[0]));
      for (let i = 1; i < cv.x.length; i++) c.lineTo(X(cv.x[i]), Y(a[i]));
      for (let i = cv.x.length - 1; i >= 0; i--) c.lineTo(X(cv.x[i]), Y(b[i]));
      c.closePath();
      c.fillStyle = col;
      c.fill();
    };
    fillBetween(cv.rne, cv.rmin, alpha(T.symHi, 0.16));
    fillBetween(cv.rmax, cv.rne, alpha(T.sym, 0.08));
    const line = (v: number[], col: string, w: number, dash: number[]) => {
      c.strokeStyle = col; c.lineWidth = w; c.setLineDash(dash);
      c.beginPath();
      c.moveTo(X(cv.x[0]), Y(v[0]));
      for (let i = 1; i < cv.x.length; i++) c.lineTo(X(cv.x[i]), Y(v[i]));
      c.stroke();
      c.setLineDash([]);
    };
    line(cv.rmin, alpha(T.sym, 0.5), 1, [3, 3]);
    line(cv.rmax, T.sym, 2, []);
    line(cv.rne, T.symHi, 2, [6, 3]);
    // direct labels at the right end
    const last = cv.x.length - 1;
    c.font = fontOf(T, 10);
    c.textAlign = 'left';
    const labels = [
      { y: Y(cv.rmax[last]), text: d.names.rmax, col: T.sym },
      { y: Y(cv.rne[last]), text: d.names.rne, col: T.symHi },
    ];
    if (Math.abs(labels[0].y - labels[1].y) < 12) labels[0].y = labels[1].y - 12;
    for (const l of labels) {
      c.fillStyle = l.col;
      c.fillRect(pl + pw + 5, l.y - 1, 6, 2);
      c.fillStyle = ink;
      c.fillText(l.text, pl + pw + 13, l.y);
    }
    // you
    if (d.you && d.you.x >= d.xMin - 1e-9 && d.you.x <= d.xMax + 1e-9) {
      const x = X(d.you.x), y = Y(d.you.range);
      c.strokeStyle = alpha(T.missile, 0.55); c.lineWidth = 1; c.setLineDash([2, 3]);
      c.beginPath(); c.moveTo(Math.round(x) + 0.5, pt); c.lineTo(Math.round(x) + 0.5, pt + ph); c.stroke();
      c.setLineDash([]);
      c.fillStyle = T.missile;
      c.beginPath(); c.arc(x, y, 4, 0, Math.PI * 2); c.fill();
      c.strokeStyle = T.screen; c.lineWidth = 2; c.stroke();
      c.fillStyle = ink;
      c.textAlign = x > pl + pw * 0.7 ? 'right' : 'left';
      c.fillText('YOU', x + (c.textAlign === 'right' ? -8 : 8), y - 9);
    }
  }

  dispose(): void { this.s.dispose(); }
}

function nearestIndex(xs: number[], x: number): number {
  let best = -1, bd = Infinity;
  xs.forEach((v, i) => { const dd = Math.abs(v - x); if (dd < bd) { bd = dd; best = i; } });
  return best;
}
