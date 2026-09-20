/**
 * [OWNER: displays] Shared canvas plumbing for the cockpit displays: a DPR-crisp, resize-aware
 * surface, and a small drawing kit (Gfx) with phosphor glow, token colours and the mono font.
 */
import { alpha, readTheme, type Theme } from '../theme';

/** Real-time clock in seconds, used for blinking (cockpit lamps blink in real time, even when the sim is paused). */
export const nowS = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

/** True during the "on" part of a blink cycle. */
export function blinkOn(hz: number, now = nowS(), duty = 0.5): boolean {
  const ph = (now * hz) % 1;
  return ph < duty;
}

let fontsRequested = false;
const fontListeners = new Set<() => void>();
/** Ask the browser for the mono face (Latin and Cyrillic) once; call `cb` when it is ready. */
export function whenFontsReady(fontMono: string, cb: () => void): () => void {
  fontListeners.add(cb);
  if (!fontsRequested && typeof document !== 'undefined' && 'fonts' in document) {
    fontsRequested = true;
    const fam = fontMono || 'monospace';
    Promise.all([
      document.fonts.load(`12px ${fam}`, 'SHOOT 0123456789'),
      document.fonts.load(`700 12px ${fam}`, 'SHOOT 0123456789'),
      document.fonts.load(`12px ${fam}`, 'ОБЗСНПАТКДВБЭРЦ'),
    ]).catch(() => undefined).then(() => { for (const f of fontListeners) f(); });
  }
  return () => { fontListeners.delete(cb); };
}

/**
 * Owns a canvas: keeps its backing store at CSS size x devicePixelRatio (crisp at any DPR),
 * watches size with ResizeObserver and calls `onResize` so the owner can redraw immediately.
 * Size the canvas with CSS (e.g. width:100%; aspect-ratio:1). With no CSS size it stays 300x150.
 */
export class Surface {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  theme: Theme;
  /** CSS pixel size and the effective device-pixel ratio of the backing store. */
  w = 0;
  h = 0;
  dpr = 1;
  onResize: (() => void) | null = null;
  private cssW = 0;
  private cssH = 0;
  private devW = 0;
  private devH = 0;
  private ro: ResizeObserver | null = null;
  private unfont: () => void;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
    this.theme = readTheme();
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(entries => {
        for (const e of entries) {
          const cb = e.contentBoxSize?.[0];
          this.cssW = cb ? cb.inlineSize : e.contentRect.width;
          this.cssH = cb ? cb.blockSize : e.contentRect.height;
          const dp = (e as ResizeObserverEntry & { devicePixelContentBoxSize?: ReadonlyArray<ResizeObserverSize> }).devicePixelContentBoxSize?.[0];
          this.devW = dp ? dp.inlineSize : 0;
          this.devH = dp ? dp.blockSize : 0;
        }
        if (!this.disposed) this.onResize?.();
      });
      try {
        this.ro.observe(canvas, { box: 'device-pixel-content-box' });
      } catch {
        this.ro.observe(canvas);
      }
    }
    this.unfont = whenFontsReady(this.theme.fontMono, () => { if (!this.disposed) this.onResize?.(); });
  }

  /** Re-read design tokens (after the cockpit skin changes). */
  refreshTheme(): void {
    this.theme = readTheme();
  }

  /** Sync the backing store with the element size; set the CSS-pixel transform. False if nothing to draw. */
  begin(): boolean {
    const c = this.canvas;
    let cw = this.cssW, ch = this.cssH;
    if (!(cw > 0 && ch > 0)) { cw = c.clientWidth; ch = c.clientHeight; }
    if (!(cw > 0 && ch > 0)) return false;
    const ratio = Math.min(3, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    let pw = Math.round(cw * ratio), ph = Math.round(ch * ratio);
    // Trust the exact device-pixel box when it matches the current ratio (avoids 1px blur).
    if (this.devW > 0 && Math.abs(this.devW - pw) <= 2 && Math.abs(this.devH - ph) <= 2) { pw = this.devW; ph = this.devH; }
    if (c.width !== pw || c.height !== ph) {
      c.width = pw;
      c.height = ph;
      // A canvas without a CSS size takes its layout size from these attributes and would grow by the
      // DPR on every resize. Pin its CSS size in that case.
      if (Math.abs(c.clientWidth - cw) > 1 || Math.abs(c.clientHeight - ch) > 1) {
        c.style.width = `${cw}px`;
        c.style.height = `${ch}px`;
      }
    }
    this.w = cw;
    this.h = ch;
    this.dpr = pw / cw;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    return true;
  }

  /** Client (event) coordinates to CSS pixels inside the canvas. */
  toLocal(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    const sx = r.width > 0 ? this.w / r.width : 1, sy = r.height > 0 ? this.h / r.height : 1;
    return { x: (clientX - r.left) * sx, y: (clientY - r.top) * sy };
  }

  dispose(): void {
    this.disposed = true;
    this.ro?.disconnect();
    this.ro = null;
    this.unfont();
    this.onResize = null;
  }
}

export type Align = 'left' | 'center' | 'right';
export type Baseline = 'top' | 'middle' | 'bottom' | 'alphabetic';

/**
 * Drawing kit bound to one frame. `u` is 1 % of the display's square side (CSS px), so layouts are
 * written in percent and scale with the display. Colours come from the theme; glow is shadowBlur.
 */
export class Gfx {
  ctx: CanvasRenderingContext2D;
  th: Theme;
  dpr = 1;
  u = 4;
  /** Global glow multiplier (0 disables glow). */
  glowK = 1;
  private shadowCache = new Map<string, string>();

  constructor(ctx: CanvasRenderingContext2D, th: Theme) {
    this.ctx = ctx;
    this.th = th;
  }

  setup(dpr: number, u: number, glowK: number, th: Theme): void {
    if (th !== this.th) this.shadowCache.clear();
    this.dpr = dpr;
    this.u = u;
    this.glowK = glowK;
    this.th = th;
  }

  /** Font-size in px for a size given in u, never below `minPx`. */
  px(sizeU: number, minPx = 9): number {
    return Math.max(minPx, sizeU * this.u);
  }

  font(sizeU: number, weight: 400 | 700 = 400, minPx = 9): number {
    const px = this.px(sizeU, minPx);
    this.ctx.font = `${weight === 700 ? '700 ' : ''}${px.toFixed(2)}px ${this.th.fontMono || 'monospace'}`;
    return px;
  }

  /** Set stroke + fill colour, glow strength (0 = none), line width (u) and opacity. */
  ink(color: string, glow = 1, lwU = 0.3, a = 1): this {
    const c = this.ctx;
    c.strokeStyle = color;
    c.fillStyle = color;
    c.globalAlpha = Math.max(0, Math.min(1, a));
    c.lineWidth = Math.max(1, lwU * this.u);
    const g = glow * this.glowK;
    if (g > 0) {
      let sc = this.shadowCache.get(color);
      if (!sc) { sc = color.startsWith('#') ? alpha(color, 0.85) : color; this.shadowCache.set(color, sc); }
      c.shadowColor = sc;
      c.shadowBlur = g * Math.max(2, 0.9 * this.u) * this.dpr;
    } else {
      c.shadowBlur = 0;
      c.shadowColor = 'rgba(0,0,0,0)';
    }
    return this;
  }

  /** Change only the line width (in u, min 1 CSS px). */
  lw(lwU: number): this {
    this.ctx.lineWidth = Math.max(1, lwU * this.u);
    return this;
  }

  dash(segU: number[] | null): this {
    this.ctx.setLineDash(segU ? segU.map(s => s * this.u) : []);
    return this;
  }

  reset(): void {
    const c = this.ctx;
    c.globalAlpha = 1;
    c.shadowBlur = 0;
    c.shadowColor = 'rgba(0,0,0,0)';
    c.setLineDash([]);
    c.lineCap = 'butt';
    c.lineJoin = 'miter';
  }

  line(x1: number, y1: number, x2: number, y2: number): void {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
  }

  /** Several segments as one path (one glow pass). segs = [x1,y1,x2,y2, ...]. */
  segs(s: number[]): void {
    const c = this.ctx;
    c.beginPath();
    for (let i = 0; i + 3 < s.length; i += 4) { c.moveTo(s[i], s[i + 1]); c.lineTo(s[i + 2], s[i + 3]); }
    c.stroke();
  }

  poly(pts: number[], close = true, fill = false): void {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(pts[0], pts[1]);
    for (let i = 2; i + 1 < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
    if (close) c.closePath();
    if (fill) c.fill(); else c.stroke();
  }

  rect(x: number, y: number, w: number, h: number, fill = false): void {
    if (fill) this.ctx.fillRect(x, y, w, h);
    else this.ctx.strokeRect(x, y, w, h);
  }

  circle(x: number, y: number, r: number, fill = false): void {
    const c = this.ctx;
    c.beginPath();
    c.arc(x, y, Math.max(0.5, r), 0, Math.PI * 2);
    if (fill) c.fill(); else c.stroke();
  }

  arc(x: number, y: number, r: number, a0: number, a1: number): void {
    const c = this.ctx;
    c.beginPath();
    c.arc(x, y, Math.max(0.5, r), a0, a1);
    c.stroke();
  }

  text(s: string, x: number, y: number, align: Align = 'center', base: Baseline = 'middle'): void {
    const c = this.ctx;
    c.textAlign = align;
    c.textBaseline = base;
    c.fillText(s, x, y);
  }

  measure(s: string): number {
    return this.ctx.measureText(s).width;
  }

  /** Text on a filled plate (used for lit legends / boxed OSB labels). */
  boxText(s: string, x: number, y: number, align: Align, padU: number, boxed: boolean): void {
    const w = this.measure(s);
    const px = parseFloat(this.ctx.font) || 10;
    const x0 = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
    this.text(s, x, y, align, 'middle');
    if (boxed) {
      const p = padU * this.u;
      this.rect(x0 - p, y - px * 0.62 - p * 0.4, w + p * 2, px * 1.24 + p * 0.8);
    }
  }
}
