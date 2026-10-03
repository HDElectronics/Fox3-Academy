/**
 * [OWNER: page-harm displays] HarmDdi: the F/A-18C stores page and HARM format on a DDI, drawn from a FormatView
 * (types.ts). Facts: docs/research/fa18c-harm.md (S1 = ED F/A-18C guide, figs. 202, 203, 210, 212, 214). DCS numbers
 * the DDI pushbuttons with the left column 1 (bottom) to 5 (top), the top row 6-10 left to right, the right column
 * 11 (top) to 15 (bottom) and the bottom row 16 (right) to 20 (left). Side legends are stacked vertical letters,
 * top and bottom legends horizontal.
 *
 * Positions on the glass (legend spacing, the weapon block, the TOO scale, the PB timer block, the CLASS centre
 * text, the SCAN list and the stores wingform) are the trainer's layout in percent of the page, not measured art.
 * The hint ring and the bright/dim classes on the CLASS page are trainer aids, not in DCS.
 */
import { MfcdPage } from '../../ui/displays/a10c/mfcd';
import { nowS, type Align, type Gfx } from '../../ui/displays/surface';
import type { Theme } from '../../ui/theme';
import { CLASS_OSB, type FormatView, type HarmClass, type HarmMode, type Osb } from './types';

export type OsbSide = 'left' | 'top' | 'right' | 'bottom';
export interface OsbAnchor { x: number; y: number; side: OsbSide; align: Align }

/** Legend centres along an edge, in % of the page side, for the five buttons of that edge (trainer layout). */
const ALONG = [20, 35, 50, 65, 80];
/** Inset of the legend anchor from the page edge (% of the side). */
const INSET_SIDE = 3;
const INSET_TB = 4.5;
/** Picking: a band this deep (% of the side) along each edge, and how far along the edge a press may miss. */
const PICK_BAND = 12;
const PICK_ALONG = 9;

/**
 * Where the legend of pushbutton `n` sits on a square page of side `s` (px), using the DCS Hornet numbering.
 * Left / right anchors are at the inner edge of the legend (align left / right); top / bottom at its centre.
 */
export function hornetOsbAnchor(n: Osb, s: number): OsbAnchor {
  if (!Number.isInteger(n) || n < 1 || n > 20) throw new RangeError(`OSB ${n} does not exist`);
  const p = (pct: number) => (s * pct) / 100;
  if (n <= 5) return { x: p(INSET_SIDE), y: p(ALONG[5 - n]), side: 'left', align: 'left' };
  if (n <= 10) return { x: p(ALONG[n - 6]), y: p(INSET_TB), side: 'top', align: 'center' };
  if (n <= 15) return { x: p(100 - INSET_SIDE), y: p(ALONG[n - 11]), side: 'right', align: 'right' };
  return { x: p(ALONG[20 - n]), y: p(100 - INSET_TB), side: 'bottom', align: 'center' };
}

const ALL_OSB: Osb[] = Array.from({ length: 20 }, (_, i) => (i + 1) as Osb);

/** The pushbutton under page point (x, y) inside the centred square of side `s`, or null away from the edges. */
export function pickOsb(x: number, y: number, s: number): Osb | null {
  if (!(s > 0) || x < 0 || y < 0 || x > s || y > s) return null;
  const band = (s * PICK_BAND) / 100, tol = (s * PICK_ALONG) / 100;
  let best: Osb | null = null, bestD = Infinity;
  for (const n of ALL_OSB) {
    const a = hornetOsbAnchor(n, s);
    const inBand = a.side === 'left' ? x <= band : a.side === 'right' ? x >= s - band : a.side === 'top' ? y <= band : y >= s - band;
    if (!inBand) continue;
    const along = a.side === 'left' || a.side === 'right' ? Math.abs(y - a.y) : Math.abs(x - a.x);
    if (along > tol) continue;
    const d = Math.hypot(x - a.x, y - a.y);
    if (d < bestD) { bestD = d; best = n; }
  }
  return best;
}

/** Timer text m:ss; '--:--' with no value. Negative values (a difference) carry a minus sign. */
export function fmtTimer(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec)) return '--:--';
  const r = Math.round(sec);
  const a = Math.abs(r), m = Math.floor(a / 60), ss = a % 60;
  return `${r < 0 ? '-' : ''}${m}:${String(ss).padStart(2, '0')}`;
}

/** The third PB timer line: time of flight minus the time to impact of the HARM in flight; null if either is missing. */
export function timerDiff(tofS: number | null, ttiS: number | null): number | null {
  if (tofS == null || ttiS == null || !Number.isFinite(tofS) || !Number.isFinite(ttiS)) return null;
  return tofS - ttiS;
}

/** Reduced-motion preference (no pulse then). Safe outside a browser. */
export function reducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch { return false; }
}

/** Opacity of the pulsing hint ring (trainer aid): steady with reduced motion. */
export function hintAlpha(t = nowS()): number {
  if (reducedMotion()) return 1;
  return 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 1.2));
}

// ------------------------------------------------------------------ shared legend drawing (also used by ew.ts)

export interface LegendOpts {
  boxed?: boolean;
  crossed?: boolean;
  dim?: boolean;
  /** Font size in u (1 u = 1 % of the page side). */
  size?: number;
  /** Force horizontal text on a side button. */
  horizontal?: boolean;
}
export interface Bounds { x0: number; y0: number; x1: number; y1: number }

/** Write `text` stacked as vertical letters, column centred on x, block centred on y. Returns its bounds. */
export function stackedText(g: Gfx, text: string, x: number, y: number): Bounds {
  const px = parseFloat(g.ctx.font) || 10;
  const chars = [...text];
  const lh = px * 1.02;
  const top = y - (chars.length * lh) / 2;
  let w = 0;
  chars.forEach((ch, i) => {
    if (ch !== ' ') g.text(ch, x, top + lh * (i + 0.5), 'center', 'middle');
    w = Math.max(w, g.measure(ch));
  });
  return { x0: x - w / 2, y0: top, x1: x + w / 2, y1: top + chars.length * lh };
}

/** Write horizontal text at (x, y) with the given alignment. Returns its bounds. */
export function lineText(g: Gfx, text: string, x: number, y: number, align: Align): Bounds {
  const px = parseFloat(g.ctx.font) || 10;
  const w = g.measure(text);
  const x0 = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
  g.text(text, x, y, align, 'middle');
  return { x0, y0: y - px * 0.55, x1: x0 + w, y1: y + px * 0.55 };
}

/** Box and / or X over a legend's bounds. */
export function decorate(g: Gfx, b: Bounds, boxed: boolean, crossed: boolean): void {
  const p = 0.6 * g.u;
  if (boxed) g.rect(b.x0 - p, b.y0 - p * 0.5, b.x1 - b.x0 + 2 * p, b.y1 - b.y0 + p);
  if (crossed) g.segs([b.x0 - p, b.y0 - p * 0.5, b.x1 + p, b.y1 + p * 0.5, b.x0 - p, b.y1 + p * 0.5, b.x1 + p, b.y0 - p * 0.5]);
}

/** The legend of pushbutton `n`: stacked on the side columns, horizontal on the top and bottom rows. */
export function drawHornetLegend(g: Gfx, th: Theme, s: number, n: Osb, text: string, o: LegendOpts = {}): Bounds {
  const a = hornetOsbAnchor(n, s);
  g.font(o.size ?? 3.2, 700, 8);
  g.ink(o.dim ? th.symDim : th.sym, 1, 0.3, 1);
  let b: Bounds;
  if ((a.side === 'left' || a.side === 'right') && !o.horizontal) {
    const cw = g.measure('M');
    const x = a.side === 'left' ? a.x + cw / 2 : a.x - cw / 2;
    b = stackedText(g, text, x, a.y);
  } else {
    b = lineText(g, text, a.x, a.y, a.align);
  }
  decorate(g, b, !!o.boxed, !!o.crossed);
  return b;
}

/** Faint ticks at the page edge for all 20 pushbuttons. */
export function drawHornetOsbTicks(g: Gfx, th: Theme, s: number): void {
  const u = g.u, segs: number[] = [];
  for (const n of ALL_OSB) {
    const a = hornetOsbAnchor(n, s);
    if (a.side === 'top') segs.push(a.x, 0, a.x, 1.2 * u);
    else if (a.side === 'bottom') segs.push(a.x, s, a.x, s - 1.2 * u);
    else if (a.side === 'left') segs.push(0, a.y, 1.2 * u, a.y);
    else segs.push(s, a.y, s - 1.2 * u, a.y);
  }
  g.ink(th.symDim, 0, 0.3, 0.8);
  g.segs(segs);
}

/** Trainer aid (not in DCS): a pulsing ring at the edge position of pushbutton `n`, in the caution colour. */
export function drawOsbHint(g: Gfx, th: Theme, s: number, n: Osb, t = nowS()): void {
  const a = hornetOsbAnchor(n, s), u = g.u, r = 5 * u;
  const x = a.side === 'left' ? 2.5 * u : a.side === 'right' ? s - 2.5 * u : a.x;
  const y = a.side === 'top' ? 2.5 * u : a.side === 'bottom' ? s - 2.5 * u : a.y;
  g.ink(th.caution, 1.2, 0.5, hintAlpha(t));
  g.circle(x, y, r);
  g.reset();
}

/** Small filled triangle pointing in direction (dx, dy) with its tip at (x, y). */
export function arrowHead(g: Gfx, x: number, y: number, dx: number, dy: number, size: number): void {
  const nx = -dy, ny = dx;
  g.poly([x, y, x - dx * size + nx * size * 0.6, y - dy * size + ny * size * 0.6, x - dx * size - nx * size * 0.6, y - dy * size - ny * size * 0.6], true, true);
}

// ------------------------------------------------------------------ the DDI

/** Degrees to % of the page in the TOO body: ±15° sits on the T marks (trainer scale). */
const TOO_U_PER_DEG = 2;
const MODE_OSB: Record<HarmMode, Osb> = { SP: 5, TOO: 4, PB: 3 };

export class HarmDdi extends MfcdPage<FormatView> {
  private onOsb: (n: Osb) => void;
  private onClick = (e: Event): void => {
    const me = e as MouseEvent;
    const { x, y, s } = this.toPage(me.clientX, me.clientY);
    const n = pickOsb(x, y, s);
    if (n != null) this.onOsb(n);
  };

  constructor(canvas: HTMLCanvasElement, onOsb: (n: Osb) => void) {
    super(canvas);
    this.onOsb = onOsb;
    canvas.addEventListener('click', this.onClick);
  }

  override dispose(): void {
    this.canvas.removeEventListener('click', this.onClick);
    super.dispose();
  }

  protected paint(s: number, th: Theme): void {
    const g = this.g, v = this.view;
    drawHornetOsbTicks(g, th, s);
    if (!v) return;
    if (v.page === 'SMS') this.paintSms(v, s, th);
    else if (v.page === 'CLASS') this.paintClass(v, s, th);
    else if (v.page === 'SCAN') this.paintScan(v, s, th);
    else this.paintHarm(v, s, th);
    if (v.hintOsb != null) drawOsbHint(g, th, s, v.hintOsb);
  }

  /** HRM OVRD at 16 with the mode name above it (figs. 203, 210, 214). */
  private paintOvrd(v: FormatView, s: number, th: Theme, withMode: boolean): void {
    const g = this.g, u = g.u;
    drawHornetLegend(g, th, s, 16, 'HRM OVRD', { boxed: v.hrmOvrd, size: 3 });
    if (withMode) {
      const a = hornetOsbAnchor(16, s);
      g.font(3.2, 700, 8);
      g.ink(th.sym, 1, 0.3, 1);
      g.text(v.mode, a.x, a.y - 4.6 * u, 'center', 'middle');
    }
  }

  /** Weapon block top left: HARM (boxed / crossed), status, station. Position is the trainer's layout. */
  private paintWeapon(v: FormatView, th: Theme): void {
    const g = this.g, u = g.u;
    g.font(3.4, 700, 8);
    g.ink(th.sym, 1, 0.3, 1);
    const b = lineText(g, 'HARM', 10 * u, 10 * u, 'left');
    decorate(g, b, v.weapon.boxed, v.weapon.crossed);
    g.font(3, 700, 8);
    if (v.status) g.text(v.status, 10 * u, 15 * u, 'left', 'middle');
    if (v.station != null) g.text(`STA ${v.station}`, 10 * u, 19.5 * u, 'left', 'middle');
  }

  private paintHarm(v: FormatView, s: number, th: Theme): void {
    const g = this.g, u = g.u;
    this.paintWeapon(v, th);

    // Mode legends (left column), X when not available, box on the active one.
    for (const m of ['SP', 'TOO', 'PB'] as HarmMode[]) {
      drawHornetLegend(g, th, s, MODE_OSB[m], m, { boxed: v.mode === m, crossed: !v.modeAvailable[m] });
    }
    if (v.mode === 'PB' && v.pb) {
      drawHornetLegend(g, th, s, 2, 'A/C', { boxed: v.pb.pullup === 'AC' });
      drawHornetLegend(g, th, s, 1, 'HRM', { boxed: v.pb.pullup === 'HRM' });
      // 'PULLUP' written vertically beside A/C and HRM (fig. 214); column position is the trainer's layout.
      g.font(2.6, 700, 7);
      g.ink(th.sym, 1, 0.3, 1);
      stackedText(g, 'PULLUP', 10.5 * u, (s * 72.5) / 100);
    }

    // Right column.
    if (v.mode === 'TOO' && v.too) {
      const b = drawHornetLegend(g, th, s, 11, 'CLASS');
      g.font(3, 700, 8);
      g.ink(th.sym, 1, 0.3, 1);
      g.text(v.too.cls, b.x0 - 1.6 * u, hornetOsbAnchor(11, s).y, 'right', 'middle');
    }
    drawHornetLegend(g, th, s, 13, 'STEP');
    if (v.mode === 'PB') drawHornetLegend(g, th, s, 14, 'UFC');
    drawHornetLegend(g, th, s, 15, 'RSET');

    // Bottom row.
    this.paintOvrd(v, s, th, true);
    if (v.mode === 'TOO' && v.too) {
      drawHornetLegend(g, th, s, 17, 'SCAN');
      drawHornetLegend(g, th, s, 19, 'LIMIT', { boxed: v.too.limit });
    }

    // TDC priority diamond, top right (fig. 210). Exact spot is the trainer's layout.
    if (v.tdc) {
      const x = 93 * u, y = 6 * u, d = 1.5 * u;
      g.ink(th.sym, 1, 0.3, 1);
      g.poly([x, y - d, x + d, y, x, y + d, x - d, y], true);
    }

    if (v.mode === 'TOO' && v.too) this.paintToo(v.too, th);
    if (v.mode === 'PB' && v.pb) this.paintPb(v.pb, th);
  }

  private paintToo(too: NonNullable<FormatView['too']>, th: Theme): void {
    const g = this.g, u = g.u, cx = 50 * u, cy = 50 * u, k = TOO_U_PER_DEG * u, e = 15 * k;
    // Four T marks at ±15°, the bar across the edge of the field of view and the stem pointing inward
    // (orientation is the trainer's drawing; S1 only says four T marks frame the 30° field of view).
    const bar = 2 * u, stem = 2.4 * u;
    g.ink(th.sym, 1, 0.3, 1);
    g.segs([
      cx - bar, cy - e, cx + bar, cy - e, cx, cy - e, cx, cy - e + stem,
      cx - bar, cy + e, cx + bar, cy + e, cx, cy + e, cx, cy + e - stem,
      cx - e, cy - bar, cx - e, cy + bar, cx - e, cy, cx - e + stem, cy,
      cx + e, cy - bar, cx + e, cy + bar, cx + e, cy, cx + e - stem, cy,
    ]);

    // Arrows to emitters outside the field of view (positions: trainer layout).
    const ah = 2.2 * u;
    if (too.arrows.up) arrowHead(g, cx, cy - e - 4 * u, 0, -1, ah);
    if (too.arrows.down) arrowHead(g, cx, cy + e + 4 * u, 0, 1, ah);
    if (too.arrows.left) arrowHead(g, cx - e - 4 * u, cy, -1, 0, ah);
    if (too.arrows.right) arrowHead(g, cx + e + 4 * u, cy, 1, 0, ah);

    // Emitters at their seeker-relative position; anything past the frame (beyond ±16°) is left to the arrows.
    for (const t of too.targets) {
      if (Math.abs(t.xDeg) > 16 || Math.abs(t.yDeg) > 16) continue;
      const x = cx + t.xDeg * k, y = cy - t.yDeg * k;
      g.font(3.4, 700, 8);
      g.ink(th.sym, 1, 0.3, 1);
      const b = lineText(g, t.label, x, y, 'center');
      if (t.lockedYou) {
        const ly = b.y0 - 0.6 * u;
        g.line(b.x0, ly, b.x1, ly);
        b.y0 = ly;
      }
      if (t.boxed) decorate(g, b, true, false);
      if (t.hoff) {
        g.font(2.8, 700, 8);
        g.text('H-OFF', x, b.y0 - 3.2 * u, 'center', 'middle');
      }
    }
  }

  private paintPb(pb: NonNullable<FormatView['pb']>, th: Theme): void {
    const g = this.g, u = g.u;
    g.ink(th.sym, 1, 0.3, 1);
    // Upper right: in-range legend, then the FLT timer block (p374, fig. 214). Spacing is the trainer's layout.
    const xr = 88 * u;
    g.font(3, 700, 8);
    if (pb.inRange) g.text(pb.inRange, xr, 11 * u, 'right', 'middle');
    g.text('FLT', xr, 16 * u, 'right', 'middle');
    g.text(fmtTimer(pb.tofS), xr, 21 * u, 'right', 'middle');
    g.text(fmtTimer(pb.ttiS), xr, 25.5 * u, 'right', 'middle');
    g.line(xr - 11 * u, 28.3 * u, xr, 28.3 * u);
    g.text(fmtTimer(timerDiff(pb.tofS, pb.ttiS)), xr, 31 * u, 'right', 'middle');
    // TGT and the entered code at mid right; blank code until entered.
    g.font(3.2, 700, 8);
    g.text('TGT', 86 * u, 45 * u, 'right', 'middle');
    if (pb.code != null) g.text(String(pb.code).padStart(3, '0'), 86 * u, 50 * u, 'right', 'middle');
  }

  private paintClass(v: FormatView, s: number, th: Theme): void {
    const g = this.g, u = g.u, cp = v.classPage;
    const sel = cp?.selected ?? v.too?.cls ?? 'ALL';
    const det = new Set<HarmClass>(cp?.detected ?? []);
    for (const [cls, n] of Object.entries(CLASS_OSB) as [HarmClass, Osb][]) {
      // Bright = heard now, dim = not heard (trainer aid, not in DCS).
      drawHornetLegend(g, th, s, n, cls, { boxed: cls === sel, dim: !det.has(cls) && cls !== sel, size: 3 });
    }
    g.font(3.6, 700, 8);
    g.ink(th.sym, 1, 0.3, 1);
    g.text(`CLASS ${sel}`, 50 * u, 30 * u, 'center', 'middle');
    this.paintOvrd(v, s, th, false);
  }

  private paintScan(v: FormatView, s: number, th: Theme): void {
    const g = this.g, u = g.u;
    this.paintWeapon(v, th);
    drawHornetLegend(g, th, s, 17, 'SCAN', { boxed: true });
    this.paintOvrd(v, s, th, false);
    // Centre list of the classes heard; arrows for those outside the field of view (p372). Layout: trainer.
    const rows = v.scanPage?.rows ?? [];
    g.font(3.4, 700, 8);
    g.ink(th.sym, 1, 0.3, 1);
    rows.forEach((r, i) => {
      const y = (28 + i * 6) * u;
      g.circle(42 * u, y, 0.9 * u, true);
      g.text(r.cls, 45 * u, y, 'left', 'middle');
      if (r.side === 'left') arrowHead(g, 36 * u, y, -1, 0, 1.8 * u);
      if (r.side === 'right') arrowHead(g, 62 * u, y, 1, 0, 1.8 * u);
    });
  }

  /**
   * Stores page (fig. 202): HARM legend at OSB 6 (plain here; it is boxed on the HARM format), a stylised wingform
   * (trainer layout, not measured art) with HARM written under stations 2, 3 (left wing) and 7, 8 (right wing), the
   * selected one boxed with STBY / RDY under it, and HRM OVRD at 16.
   */
  private paintSms(v: FormatView, s: number, th: Theme): void {
    const g = this.g, u = g.u, sms = v.sms;
    drawHornetLegend(g, th, s, 6, 'HARM');
    this.paintOvrd(v, s, th, false);

    // Wingform, nose up: fuselage line and two swept wings.
    const cx = 50 * u, root = 46 * u, tipY = 52 * u;
    g.ink(th.symDim, 0.5, 0.4, 1);
    g.segs([
      cx, 30 * u, cx, 70 * u,
      cx - 3 * u, root, 12 * u, tipY, cx + 3 * u, root, 88 * u, tipY,
      cx - 3 * u, root + 6 * u, 14 * u, tipY + 2 * u, cx + 3 * u, root + 6 * u, 86 * u, tipY + 2 * u,
      cx - 7 * u, 66 * u, cx + 7 * u, 66 * u,
    ]);

    const X: Record<number, number> = { 2: 22, 3: 36, 7: 64, 8: 78 };
    for (const st of sms?.stations ?? []) {
      const xp = X[st.sta];
      if (xp == null) continue;
      const x = xp * u;
      g.font(3, 700, 8);
      g.ink(th.sym, 1, 0.3, 1);
      g.text(String(st.sta), x, 60 * u, 'center', 'middle');
      if (!st.loaded) continue;
      g.font(3.2, 700, 8);
      const b = lineText(g, 'HARM', x, 65 * u, 'center');
      if (st.selected) {
        decorate(g, b, true, false);
        if (sms?.status) { g.font(3, 700, 8); g.text(sms.status, x, 70 * u, 'center', 'middle'); }
      }
    }
  }
}
