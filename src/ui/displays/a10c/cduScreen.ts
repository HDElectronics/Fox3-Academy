/**
 * [OWNER: displays] A10cCduScreen: the A-10C II CDU screen (docs/research/a10c-cdu.md §1): 10 lines of 24
 * characters, green text, line 10 left is the scratchpad. The page model lays the text out; this display only
 * draws it on a fixed character grid (every character in its own cell, so columns line up exactly) with an
 * optional filled block cursor on line 10. Steady cursor (no blink). No CDU logic here.
 *
 * Grid geometry from B612 Mono (the app's instrument face): advance width 1300 / 2000 units = 0.65 em for every
 * glyph. Rows are 1.4 em tall (comfortable for capitals with a little air). Padding: 0.6 em left and right,
 * 0.5 em top and bottom. Canvas = (24 x 0.65 + 1.2) em wide x (10 x 1.4 + 1.0) em tall = 16.8 x 15 em, so
 * CDU_ASPECT = 16.8 / 15 = 1.12 and CDU_PAD_Y = 0.5 / 15 = 1/30.
 *
 * Glyph coverage, checked against node_modules/@fontsource/b612-mono latin 400 (the file fonts.css loads, whose
 * unicode-range is U+0000-00FF plus a few others): ± (U+00B1), ° (U+00B0), [ ] / . : A-Z 0-9 are in the font.
 * → (U+2192), ← (U+2190), ↕ (U+2195) and ⊕ (U+2295) are not (outside both the cmap and the unicode-range), so
 * those cells are drawn as vector symbols (CDU_VECTOR_GLYPHS) rather than falling back to another font.
 */
import { Gfx, Surface } from '../surface';
import type { Theme } from '../../theme';
import type { CduView } from './types';

export const CDU_COLS = 24, CDU_ROWS = 10;

/** B612 Mono advance width (em) and the row height (em) the grid is built on. */
const ADV_EM = 0.65, ROW_EM = 1.4, PAD_X_EM = 0.6, PAD_Y_EM = 0.5;
const W_EM = CDU_COLS * ADV_EM + 2 * PAD_X_EM; // 16.8
const H_EM = CDU_ROWS * ROW_EM + 2 * PAD_Y_EM; // 15

/** Canvas width / height that fits the 24 x 10 grid plus padding (1.12). */
export const CDU_ASPECT = W_EM / H_EM;
/** Top and bottom padding, each as a fraction of the canvas height (1/30). */
export const CDU_PAD_Y = PAD_Y_EM / H_EM;
/** Left and right padding, each as a fraction of the canvas width (1/28). */
const CDU_PAD_X = PAD_X_EM / W_EM;

/** Vertical centre of row 1..10 as a fraction 0..1 of the canvas height (equal rows between the paddings). */
export function cduRowCentre(row: number): number {
  if (!Number.isInteger(row) || row < 1 || row > CDU_ROWS) throw new RangeError(`CDU row ${row} does not exist`);
  return CDU_PAD_Y + ((row - 0.5) * (1 - 2 * CDU_PAD_Y)) / CDU_ROWS;
}

/** Glyphs B612 Mono lacks, drawn as vector symbols in their cell. */
export const CDU_VECTOR_GLYPHS: readonly string[] = ['→', '←', '↕', '⊕'];

/** Draw a vector glyph centred in a cell (cx, cy), cell width cw, font size px. False if `ch` is not one of them. */
function drawVectorGlyph(g: Gfx, ch: string, cx: number, cy: number, cw: number, px: number): boolean {
  const hw = cw * 0.38, hd = cw * 0.22, vh = px * 0.36;
  switch (ch) {
    case '→': g.segs([cx - hw, cy, cx + hw, cy, cx + hw, cy, cx + hw - hd, cy - hd, cx + hw, cy, cx + hw - hd, cy + hd]); return true;
    case '←': g.segs([cx + hw, cy, cx - hw, cy, cx - hw, cy, cx - hw + hd, cy - hd, cx - hw, cy, cx - hw + hd, cy + hd]); return true;
    case '↕': g.segs([cx, cy - vh, cx, cy + vh, cx, cy - vh, cx - hd, cy - vh + hd, cx, cy - vh, cx + hd, cy - vh + hd,
      cx, cy + vh, cx - hd, cy + vh - hd, cx, cy + vh, cx + hd, cy + vh - hd]); return true;
    case '⊕': { const r = Math.min(hw, vh); g.circle(cx, cy, r); g.segs([cx - r, cy, cx + r, cy, cx, cy - r, cx, cy + r]); return true; }
    default: return false;
  }
}

/** The 10 lines as drawn: cut to 24 characters, missing lines blank. */
export function cduGrid(lines: readonly string[]): string[][] {
  const out: string[][] = [];
  for (let r = 0; r < CDU_ROWS; r++) out.push(Array.from(lines[r] ?? '').slice(0, CDU_COLS));
  return out;
}

export class A10cCduScreen {
  readonly canvas: HTMLCanvasElement;
  private surf: Surface;
  private g: Gfx;
  private view: CduView | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.surf = new Surface(canvas);
    this.g = new Gfx(this.surf.ctx, this.surf.theme);
    this.surf.onResize = () => this.render();
  }

  draw(view: CduView | null): void { this.view = view; this.render(); }
  refreshTheme(): void { this.surf.refreshTheme(); this.render(); }
  dispose(): void { this.surf.dispose(); this.view = null; }

  private render(): void {
    const sf = this.surf;
    if (!sf.begin()) return;
    const th = sf.theme, g = this.g, ctx = sf.ctx, W = sf.w, H = sf.h;
    g.setup(sf.dpr, H / 100, 0.5, th);
    g.reset();
    ctx.fillStyle = th.screen;
    ctx.fillRect(0, 0, W, H);
    if (this.view) this.paint(this.view, th, W, H);
    g.reset();
  }

  private paint(v: CduView, th: Theme, W: number, H: number): void {
    const g = this.g;
    const x0 = W * CDU_PAD_X, cw = (W * (1 - 2 * CDU_PAD_X)) / CDU_COLS;
    const rh = (H * (1 - 2 * CDU_PAD_Y)) / CDU_ROWS;
    // Font size fitted to the cell: the advance fills the cell width, capped by the row height.
    const px = Math.max(1, Math.min(cw / ADV_EM, rh / ROW_EM));
    const grid = cduGrid(v.lines);
    const cur = v.cursorCol != null && v.cursorCol >= 0 && v.cursorCol < CDU_COLS ? Math.floor(v.cursorCol) : null;

    if (cur != null) {
      g.ink(th.sym, 0.3, 0.3, 1);
      const cy = H * cduRowCentre(CDU_ROWS);
      g.rect(x0 + cur * cw, cy - rh * 0.42, cw, rh * 0.84, true);
    }

    g.font(px / g.u, 400, 1);
    for (let r = 0; r < CDU_ROWS; r++) {
      const cy = H * cduRowCentre(r + 1);
      const row = grid[r];
      for (let c = 0; c < row.length; c++) {
        const ch = row[c];
        if (ch === ' ') continue;
        const inverse = r === CDU_ROWS - 1 && c === cur;
        g.ink(inverse ? th.screen : th.sym, inverse ? 0 : 0.3, Math.max(0.08, (px * 0.09) / g.u), 1);
        const cx = x0 + (c + 0.5) * cw;
        if (!drawVectorGlyph(g, ch, cx, cy, cw, px)) g.text(ch, cx, cy, 'center', 'middle');
      }
    }
  }
}
