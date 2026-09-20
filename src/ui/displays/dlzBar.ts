/**
 * [OWNER: displays] DlzBar: a compact launch-zone scale for lab pages (not a cockpit format):
 * Rmin / Rne / Rmax (and Rtr / Rpi when given) with the no-escape zone filled, the current range
 * caret, closure and an optional shoot cue. Horizontal (default) or vertical.
 */
import type { Dlz } from '../../sim/types';
import { Gfx, Surface, blinkOn } from './surface';
import { star, triUp } from './glyphs';
import { fmtClosure, niceCeil, rangeUnit, rangeVal, speedUnit, type Units } from './geometry';

export type DlzMarkKey = 'rmax' | 'rne' | 'rmin' | 'rtr' | 'rpi';

export interface DlzBarOptions {
  units?: Units;
  orientation?: 'horizontal' | 'vertical';
  /** Legend per mark. Defaults: RMAX, RNE, RMIN, RTR, RPI. Pass e.g. { rne: 'Rtr' } for the FC3 F-15C wording. */
  labels?: Partial<Record<DlzMarkKey, string>>;
  glow?: number;
}

export interface DlzBarExtra {
  /** Closure (m/s, + closing) printed by the caret. */
  closure?: number | null;
  /** Show the shoot cue (e.g. picture.shootCue). */
  shoot?: boolean;
  /** Cue text, default 'SHOOT'. */
  cue?: string;
}

const DEFAULT_LABELS: Record<DlzMarkKey, string> = { rmax: 'RMAX', rne: 'RNE', rmin: 'RMIN', rtr: 'RTR', rpi: 'RPI' };

export class DlzBar {
  readonly canvas: HTMLCanvasElement;
  private surf: Surface;
  private g: Gfx;
  private o: Required<Omit<DlzBarOptions, 'labels'>> & { labels: Record<DlzMarkKey, string> };
  private last: { dlz: (Dlz & { targetRange?: number | null }) | null; extra?: DlzBarExtra } | null = null;

  constructor(canvas: HTMLCanvasElement, options: DlzBarOptions = {}) {
    this.canvas = canvas;
    this.surf = new Surface(canvas);
    this.g = new Gfx(this.surf.ctx, this.surf.theme);
    this.o = { units: 'imperial', orientation: 'horizontal', glow: 1, ...options, labels: { ...DEFAULT_LABELS, ...(options.labels ?? {}) } };
    this.surf.onResize = () => this.redraw();
  }

  setOptions(options: Partial<DlzBarOptions>): void {
    this.o = { ...this.o, ...options, labels: { ...this.o.labels, ...(options.labels ?? {}) } };
    this.redraw();
  }

  refreshTheme(): void {
    this.surf.refreshTheme();
    this.redraw();
  }

  /** Draw a zone (null = no zone: an empty scale). targetRange in metres, optional. */
  draw(dlz: (Dlz & { targetRange?: number | null }) | null, extra?: DlzBarExtra): void {
    this.last = { dlz, extra };
    this.render();
  }

  redraw(): void {
    this.render();
  }

  dispose(): void {
    this.surf.dispose();
    this.last = null;
  }

  private render(): void {
    const s = this.surf;
    if (!s.begin()) return;
    const th = s.theme, g = this.g, ctx = s.ctx;
    const W = s.w, H = s.h;
    const horiz = this.o.orientation === 'horizontal';
    const k = Math.max(0.8, Math.min(1.6, (horiz ? H : W) / 64));
    g.setup(s.dpr, k, this.o.glow, th);
    g.reset();
    ctx.fillStyle = th.screen;
    ctx.fillRect(0, 0, W, H);
    const d = this.last?.dlz ?? null;
    const ex = this.last?.extra;
    const units = this.o.units;
    const tr = d?.targetRange ?? null;
    const maxM = Math.max(d ? d.rmax * 1.12 : 0, tr != null ? tr * 1.06 : 0, units === 'metric' ? 20000 : 18520);
    const maxV = niceCeil(rangeVal(maxM, units));
    const L = horiz ? 10 * k : H - 10 * k;
    const Rr = horiz ? W - 12 * k : 12 * k;
    const pos = (m: number) => L + (Rr - L) * Math.min(1.02, rangeVal(m, units) / maxV);
    // Bar geometry (across-axis).
    const c0 = horiz ? H * 0.58 : W * 0.34, bh = 9 * k;
    const band = (a: number, b: number) => {
      const p0 = pos(a), p1 = pos(b);
      if (horiz) return [Math.min(p0, p1), c0 - bh / 2, Math.abs(p1 - p0), bh] as const;
      return [c0 - bh / 2, Math.min(p0, p1), bh, Math.abs(p1 - p0)] as const;
    };

    // Scale line and numbers.
    g.ink(th.symDim, 0, 1, 1);
    const [sx, sy, sw, sh] = band(0, maxV * (units === 'metric' ? 1000 : 1852));
    g.rect(sx, sy, sw, sh);
    g.font(9.5, 400, 8);
    g.ink(th.symDim, 0, 1, 1);
    const step = niceCeil(maxV / 5);
    for (let v = 0; v <= maxV + 1e-6; v += step) {
      const p = pos(v * (units === 'metric' ? 1000 : 1852));
      const last = v + step > maxV + 1e-6;
      const txt = last ? `${v} ${rangeUnit(units)}` : String(v);
      if (horiz) { g.line(p, c0 + bh / 2, p, c0 + bh / 2 + 3 * k); g.text(txt, last ? p + 1 * k : p, c0 + bh / 2 + 10 * k, v === 0 ? 'left' : last ? 'right' : 'center'); }
      else { g.line(c0 + bh / 2, p, c0 + bh / 2 + 3 * k, p); g.text(txt, c0 + bh / 2 + 5 * k, p, 'left'); }
    }

    if (d) {
      // Too-close zone hatched, no-escape zone solid, Rne..Rmax outlined dim.
      const [ax, ay, aw, ah] = band(0, d.rmin);
      ctx.save();
      ctx.beginPath();
      ctx.rect(ax, ay, aw, ah);
      ctx.clip();
      g.ink(th.symDim, 0, 1, 0.9);
      const hs: number[] = [];
      for (let q = -bh * 2; q < (horiz ? aw : ah) + bh * 2; q += 4 * k) {
        if (horiz) hs.push(ax + q, ay + ah, ax + q + ah, ay);
        else hs.push(ax, ay + q, ax + aw, ay + q - aw);
      }
      g.segs(hs);
      ctx.restore();
      g.ink(th.sym, 0.8, 1, 0.9);
      const [nx, ny, nw, nh] = band(d.rmin, d.rne);
      g.rect(nx, ny, nw, nh, true);
      g.ink(th.symDim, 0, 1, 1);
      const [mx, my, mw, mh] = band(d.rne, d.rmax);
      g.rect(mx, my, mw, mh, true);
      g.ink(th.sym, 0.6, 1, 1);
      g.rect(mx, my, mw, mh);

      // Marks with legends.
      const marks: [DlzMarkKey, number][] = [['rmin', d.rmin], ['rne', d.rne], ['rmax', d.rmax]];
      // Rtr / Rpi only when they are distinct marks (the sim often sets Rtr = Rne, Rpi = Rmax).
      const distinct = (r: number, ref: number) => Math.abs(r - ref) > Math.max(250, ref * 0.02);
      if (d.rtr != null && distinct(d.rtr, d.rne)) marks.push(['rtr', d.rtr]);
      if (d.rpi != null && distinct(d.rpi, d.rmax)) marks.push(['rpi', d.rpi]);
      marks.sort((a, b) => a[1] - b[1]);
      g.font(9, 700, 8);
      let lastEnd = -Infinity;
      for (const [key, r] of marks) {
        const p = pos(r);
        g.ink(th.sym, 0.8, 1.2, 1);
        if (horiz) g.line(p, c0 - bh / 2 - 3 * k, p, c0 + bh / 2);
        else g.line(c0 - bh / 2 - 3 * k, p, c0 + bh / 2, p);
        const txt = this.o.labels[key];
        const w = g.measure(txt);
        if (horiz) {
          let x = p - w / 2;
          let row = 0;
          if (x < lastEnd + 3 * k) row = 1;
          x = Math.max(2 * k, Math.min(W - w - 2 * k, x));
          g.ink(th.sym, 0.5, 1, row ? 0.8 : 1);
          g.text(txt, x, c0 - bh / 2 - (row ? 16 : 8) * k, 'left');
          if (!row) lastEnd = x + w;
        } else {
          g.ink(th.sym, 0.5, 1, 1);
          g.text(txt, c0 - bh / 2 - 5 * k, p, 'right');
        }
      }
    }

    // Current range caret, value and closure.
    if (tr != null) {
      const p = pos(tr);
      const inZone = d != null && tr <= d.rmax && tr >= d.rmin;
      g.ink(inZone ? th.symHi : th.sym, 1.2, 1.2, 1);
      if (horiz) {
        const y = c0 + bh / 2 + 1 * k;
        g.poly([p, c0 - bh / 2 - 1 * k, p + 4 * k, c0 - bh / 2 - 7 * k, p - 4 * k, c0 - bh / 2 - 7 * k], true, true);
        g.line(p, c0 - bh / 2, p, y);
      } else {
        g.poly([c0 + bh / 2 + 1 * k, p, c0 + bh / 2 + 7 * k, p - 4 * k, c0 + bh / 2 + 7 * k, p + 4 * k], true, true);
      }
      g.font(10, 700, 8);
      const v = rangeVal(tr, units);
      const txt = `${v < 10 ? v.toFixed(1) : Math.round(v)}${ex?.closure != null ? '  ' + fmtClosure(ex.closure, units) + ' ' + speedUnit(units) : ''}`;
      if (horiz) g.text(txt, W - 4 * k, 9 * k, 'right');
      else g.text(txt, W - 4 * k, H - 8 * k, 'right');
    }
    if (ex?.shoot) {
      const on = blinkOn(2.5, undefined, 0.65);
      g.ink(th.symHi, on ? 1.4 : 0.3, 1, on ? 1 : 0.4);
      const cue = ex.cue ?? 'SHOOT';
      // F-15C cues are symbols, not text: star (AIM-120 / AIM-9) or triangle (AIM-7).
      if (cue === '*') star(g, 10 * k, 9 * k, 5.5 * k, true);
      else if (cue === '▲') triUp(g, 10 * k, 4 * k, 9 * k, true);
      else { g.font(10.5, 700, 8); g.text(cue, 4 * k, 9 * k, 'left'); }
    }
    g.reset();
  }
}
