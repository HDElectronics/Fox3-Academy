/**
 * [OWNER: displays] Shared MFCD plumbing for the A-10C II pages (TGP, TAD, MSG): the 20 option select buttons
 * around a square page (OSB 1–5 across the top left to right, 6–10 down the right, 11–15 across the bottom right to
 * left, 16–20 up the left), the green SOI "container" box (docs/research/a10c.md §2) and a base class that owns the
 * Surface and draws into the largest centred square. Label positions are the trainer's layout, not measured art.
 */
import { Gfx, Surface, type Align } from '../surface';
import type { Theme } from '../../theme';

export type OsbSide = 'top' | 'right' | 'bottom' | 'left';

/** Where the legend of OSB `n` (1–20) sits on a square page of side `s` (px), and how it is aligned. */
export function osbAnchor(n: number, s: number): { x: number; y: number; align: Align; side: OsbSide } {
  if (!Number.isInteger(n) || n < 1 || n > 20) throw new RangeError(`OSB ${n} does not exist`);
  const pos = (i: number) => s * (0.2 + 0.15 * i);
  if (n <= 5) return { x: pos(n - 1), y: s * 0.05, align: 'center', side: 'top' };
  if (n <= 10) return { x: s * 0.97, y: pos(n - 6), align: 'right', side: 'right' };
  if (n <= 15) return { x: pos(15 - n), y: s * 0.95, align: 'center', side: 'bottom' };
  return { x: s * 0.03, y: pos(20 - n), align: 'left', side: 'left' };
}

/** How an OSB legend is lit: plain, boxed (selected / active) or inverse (a filled plate, the choice made). */
export type OsbStyle = 'plain' | 'boxed' | 'inverse';
export interface OsbLabel { osb: number; text: string; style?: OsbStyle; dim?: boolean }

/** Draw a legend next to its OSB, and a short tick at the page edge where the button is. */
export function drawOsb(g: Gfx, th: Theme, s: number, l: OsbLabel): void {
  const a = osbAnchor(l.osb, s);
  const u = g.u;
  g.font(3.2, 700, 8);
  const style = l.style ?? 'plain';
  const ink = l.dim ? th.symDim : th.sym;
  g.ink(ink, 0, 0.3, 1);
  if (style === 'inverse') {
    const w = g.measure(l.text), px = parseFloat(g.ctx.font) || 10, p = 0.6 * u;
    const x0 = a.align === 'left' ? a.x : a.align === 'right' ? a.x - w : a.x - w / 2;
    g.rect(x0 - p, a.y - px * 0.62 - p * 0.4, w + p * 2, px * 1.24 + p * 0.8, true);
    g.ctx.fillStyle = th.screen;
    g.text(l.text, a.x, a.y, a.align, 'middle');
  } else {
    g.boxText(l.text, a.x, a.y, a.align, 0.6, style === 'boxed');
  }
}

/** Faint ticks at the page edge for all 20 buttons, so the OSB positions read even where no legend is drawn. */
export function drawOsbTicks(g: Gfx, th: Theme, s: number): void {
  const u = g.u, segs: number[] = [];
  for (let n = 1; n <= 20; n++) {
    const a = osbAnchor(n, s);
    if (a.side === 'top') segs.push(a.x, 0, a.x, 1.2 * u);
    else if (a.side === 'bottom') segs.push(a.x, s, a.x, s - 1.2 * u);
    else if (a.side === 'left') segs.push(0, a.y, 1.2 * u, a.y);
    else segs.push(s, a.y, s - 1.2 * u, a.y);
  }
  g.ink(th.symDim, 0, 0.3, 0.8);
  g.segs(segs);
}

/** The green SOI box around the inside of the page (research §2). */
export function drawSoiBox(g: Gfx, th: Theme, s: number): void {
  const i = 1.6 * g.u;
  g.ink(th.sym, 0.6, 0.7, 1);
  g.rect(i, i, s - 2 * i, s - 2 * i);
}

/** Canvas owner for a square MFCD page: begin a frame, fill the glass, translate into the centred square. */
export abstract class MfcdPage<V> {
  readonly canvas: HTMLCanvasElement;
  protected surf: Surface;
  protected g: Gfx;
  protected view: V | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.surf = new Surface(canvas);
    this.g = new Gfx(this.surf.ctx, this.surf.theme);
    this.surf.onResize = () => this.render();
  }

  draw(view: V | null): void { this.view = view; this.render(); }
  refreshTheme(): void { this.surf.refreshTheme(); this.render(); }
  dispose(): void { this.surf.dispose(); this.view = null; }

  /** Canvas client coordinates → page pixels inside the centred square (side `s`), for picking. */
  toPage(clientX: number, clientY: number): { x: number; y: number; s: number } {
    const p = this.surf.toLocal(clientX, clientY);
    const s = Math.min(this.surf.w, this.surf.h);
    return { x: p.x - (this.surf.w - s) / 2, y: p.y - (this.surf.h - s) / 2, s };
  }

  protected render(): void {
    const sf = this.surf;
    if (!sf.begin()) return;
    const th = sf.theme, g = this.g, ctx = sf.ctx, W = sf.w, H = sf.h;
    const s = Math.min(W, H);
    g.setup(sf.dpr, s / 100, 0.5, th);
    g.reset();
    ctx.fillStyle = th.screen;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate((W - s) / 2, (H - s) / 2);
    ctx.beginPath();
    ctx.rect(0, 0, s, s);
    ctx.clip();
    this.paint(s, th);
    g.reset();
    ctx.restore();
  }

  protected abstract paint(s: number, th: Theme): void;
}
