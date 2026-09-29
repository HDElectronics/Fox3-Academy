/**
 * [OWNER: displays] A10cHud: the A-10C II HUD in air-to-ground work (docs/research/a10c.md §2, §5). Draws a
 * simplified pitch ladder (5° rungs, dashed below the horizon) rolled with the jet, the heading tape at the bottom,
 * airspeed left and altitude right, the gun cross at the boresight, the master mode name (NAV / GUNS / CCIP / CCRP)
 * low in the centre, the selected profile and count and the SOI asterisk lower left, and the flashing L while the
 * own laser fires. CCIP / GUNS: the pipper reticle with the line from the boresight (PBIL); with consent held the
 * attack steering line (ASL) above the pipper and the solution cue running down it. CCRP: the ASL offset by the
 * track error, the reticle at the boresight, time to release inside 20 s and the solution cue in the last 6 s.
 * The SPI as a diamond (dashed at the HUD edge), and an X over the reticle below minimum altitude. With `mav`: the
 * Maverick wagon-wheel reticle on the seeker line of sight (dashed at the edge) with the range below it, a filled
 * centre on lock, an X below minimum range, and the DLZ staple at the right (max tick fixed at 15 nm).
 * Drawn over the world picture (`draw(view, world)`) or, with `overlay: true`, on a transparent canvas above the
 * 3D view. Layout, the SPI diamond, the TTR number format, the
 * wagon-wheel spokes and the staple position are simplified (not verified).
 */
import { alpha } from '../../theme';
import { Gfx, Surface, blinkOn } from '../surface';
import type { A10cHudView } from './types';
import { drawMavStaple, fmtMavRange, mavStaple } from './mavPage';

export interface A10cHudOptions {
  /** Transparent canvas (nothing filled): the page puts the 3D view under it. Default false. */
  overlay?: boolean;
  /** Field of view across the canvas width (deg). Default 26, as the Su-25T HUD. */
  fovDeg?: number;
  /** Boresight height as a fraction of the canvas height from the top. Default 0.4. */
  boreY?: number;
}

/** CCRP: time to release first shows at about 20 s; the solution cue slides down the ASL in the last 6 s (§5). */
export const CCRP_TTR_SHOW_S = 20;
export const CCRP_CUE_S = 6;
/** Tint over a world picture drawn under the HUD (0 none). */
export const A10C_HUD_TINT = 0.3;

/** Time-to-release text: whole seconds, shown only inside CCRP_TTR_SHOW_S. */
export function fmtTtr(ttrS: number): string {
  if (!Number.isFinite(ttrS) || ttrS > CCRP_TTR_SHOW_S) return '';
  return String(Math.max(0, Math.ceil(ttrS)));
}

/** CCRP solution cue position along the ASL: 0 at the top, 1 at the reticle; null before the last CCRP_CUE_S. */
export function ccrpCueFraction(ttrS: number): number | null {
  if (!Number.isFinite(ttrS) || ttrS > CCRP_CUE_S) return null;
  return Math.min(1, Math.max(0, 1 - ttrS / CCRP_CUE_S));
}

/** Heading tape label for a 10° mark: hundreds and tens ("03" for 030°, "36" for north). */
export function headingTapeLabel(deg: number): string {
  const d = ((Math.round(deg / 10) * 10) % 360 + 360) % 360;
  return String(d === 0 ? 36 : d / 10).padStart(2, '0');
}

/** HUD angles (rad from the boresight) → canvas px, clamped inside the glass; `clipped` when it was clamped. */
export function hudPoint(az: number, el: number, cx: number, cy: number, pxPerRad: number, w: number, h: number, margin: number): { x: number; y: number; clipped: boolean } {
  const x = cx + az * pxPerRad, y = cy - el * pxPerRad;
  const qx = Math.min(w - margin, Math.max(margin, x)), qy = Math.min(h - margin, Math.max(margin, y));
  return { x: qx, y: qy, clipped: qx !== x || qy !== y };
}

export class A10cHud {
  readonly canvas: HTMLCanvasElement;
  private surf: Surface;
  private g: Gfx;
  private o: Required<A10cHudOptions>;
  private last: A10cHudView | null = null;
  private world: CanvasImageSource | null = null;

  constructor(canvas: HTMLCanvasElement, options: A10cHudOptions = {}) {
    this.canvas = canvas;
    this.o = { overlay: false, fovDeg: 26, boreY: 0.4, ...options };
    this.surf = new Surface(canvas);
    this.g = new Gfx(this.surf.ctx, this.surf.theme);
    this.surf.onResize = () => this.render();
  }

  /** Draw the HUD; `world` (optional) is the view ahead seen through the combiner (ignored in overlay mode). */
  draw(view: A10cHudView | null, world: CanvasImageSource | null = null): void { this.last = view; this.world = world; this.render(); }
  refreshTheme(): void { this.surf.refreshTheme(); this.render(); }
  /** Change the field of view (e.g. to follow the 3D camera) and redraw. */
  setFov(fovDeg: number): void { this.o.fovDeg = fovDeg; this.render(); }
  dispose(): void { this.surf.dispose(); this.last = null; this.world = null; }

  private render(): void {
    const sf = this.surf;
    if (!sf.begin()) return;
    const th = sf.theme, g = this.g, ctx = sf.ctx, W = sf.w, H = sf.h;
    const u = Math.min(W, H) / 100;
    g.setup(sf.dpr, u, 0.8, th);
    g.reset();
    if (this.o.overlay) ctx.clearRect(0, 0, W, H);
    else {
      ctx.fillStyle = th.screen;
      ctx.fillRect(0, 0, W, H);
      if (this.world) {
        ctx.drawImage(this.world, 0, 0, W, H);
        ctx.fillStyle = alpha(th.screen, A10C_HUD_TINT);
        ctx.fillRect(0, 0, W, H);
      }
    }
    const v = this.last;
    if (!v) return;
    // Over a bright 3D view the symbology needs a dark edge to stay readable.
    if (this.o.overlay) ctx.filter = `drop-shadow(0 0 ${(1.2 * u).toFixed(1)}px ${th.screen})`;
    const ppr = W / ((this.o.fovDeg * Math.PI) / 180);
    const ppd = ppr * (Math.PI / 180);
    const cx = W / 2, cy = H * this.o.boreY;
    g.ink(th.sym, 1, 0.3, 1);

    // Pitch ladder, rolled about the boresight.
    ctx.save();
    ctx.beginPath();
    ctx.rect(W * 0.14, H * 0.08, W * 0.72, H * 0.7);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(-v.roll);
    const pitchDeg = (v.pitch * 180) / Math.PI;
    g.font(2.8, 400, 8);
    for (let p = -30; p <= 30; p += 5) {
      const y = (pitchDeg - p) * ppd;
      if (Math.abs(y) > H * 0.6) continue;
      if (p === 0) { g.dash(null); g.segs([-W * 0.36, y, -W * 0.05, y, W * 0.05, y, W * 0.36, y]); continue; }
      const half = W * 0.12, gap = W * 0.05, tick = (p > 0 ? 1 : -1) * 1.4 * u;
      g.dash(p < 0 ? [1.4, 1] : null);
      g.segs([-half, y, -gap, y, gap, y, half, y]);
      g.dash(null);
      g.segs([-half, y, -half, y + tick, half, y, half, y + tick]);
      g.text(String(Math.abs(p)), -half - 1 * u, y, 'right');
      g.text(String(Math.abs(p)), half + 1 * u, y, 'left');
    }
    ctx.restore();
    g.reset();
    g.ink(th.sym, 1, 0.3, 1);

    // Gun cross at the boresight.
    const gc = 1.6 * u;
    g.segs([cx - gc, cy, cx + gc, cy, cx, cy - gc, cx, cy + gc]);

    // Airspeed left, altitude right.
    g.font(3.6, 700, 9);
    g.text(String(Math.round(v.speedKt)), W * 0.08, H * 0.4, 'left');
    g.text(String(Math.round(v.altFt)), W * 0.92, H * 0.4, 'right');

    // Heading tape (bottom): ±15°, labels every 10°.
    {
      const hd = (((v.heading * 180) / Math.PI) % 360 + 360) % 360;
      const y = H * 0.9, span = W * 0.3, perDeg = span / 15;
      const segs: number[] = [];
      g.font(2.8, 400, 8);
      for (let d = Math.ceil((hd - 15) / 5) * 5; d <= hd + 15; d += 5) {
        const x = cx + (d - hd) * perDeg;
        const big = ((d % 10) + 10) % 10 === 0;
        segs.push(x, y, x, y - (big ? 2 : 1.1) * u);
        if (big) g.text(headingTapeLabel(d), x, y - 2.4 * u, 'center', 'bottom');
      }
      g.segs(segs);
      g.poly([cx, y + 0.6 * u, cx - 1.2 * u, y + 2.4 * u, cx + 1.2 * u, y + 2.4 * u], true, true);
    }

    // Master mode, low centre.
    g.font(3.6, 700, 9);
    g.text(v.master, cx, H * 0.78);

    // Lower left: laser L (flashing), profile and count, SOI asterisk.
    g.font(3.6, 700, 9);
    if (v.laserFiring && blinkOn(2, v.t)) g.text('L', W * 0.06, H * 0.74, 'left');
    if (v.weapon) g.text(`${v.weapon.label} ${v.weapon.count}`, W * 0.06, H * 0.8, 'left');
    if (v.soi) { g.font(5, 700, 10); g.text('*', W * 0.06, H * 0.87, 'left'); }

    const margin = 4 * u;
    let reticle: { x: number; y: number } | null = null;

    // CCIP / GUNS pipper and bomb-fall line; consent: ASL and the running solution cue.
    if ((v.master === 'CCIP' || v.master === 'GUNS') && v.pipper) {
      const p = hudPoint(v.pipper.az, v.pipper.el, cx, cy, ppr, W, H * 0.86, margin);
      const r = v.master === 'GUNS' ? 3.6 * u : 3 * u;
      reticle = p;
      g.dash(p.clipped ? [1.2, 1.2] : null);
      g.circle(p.x, p.y, r);
      g.dash(null);
      g.circle(p.x, p.y, 0.45 * u, true);
      if (v.master === 'GUNS') g.segs([p.x - r - 1.6 * u, p.y, p.x - r - 0.4 * u, p.y, p.x + r + 0.4 * u, p.y, p.x + r + 1.6 * u, p.y]);
      if (v.master === 'CCIP') {
        if (v.releaseCue != null) {
          const top = H * 0.1, bot = p.y - r;
          g.line(p.x, top, p.x, bot);
          const cyq = top + (bot - top) * Math.min(1, Math.max(0, v.releaseCue));
          g.lw(0.5); g.line(p.x - 1.8 * u, cyq, p.x + 1.8 * u, cyq); g.lw(0.3);
        } else {
          g.line(cx, cy + gc + 0.6 * u, p.x, p.y - r);
        }
      }
    }

    // CCRP: ASL offset by the track error, reticle at the boresight, TTR, solution cue.
    if (v.master === 'CCRP' && v.ccrp) {
      const x = Math.min(W - margin, Math.max(margin, cx + v.ccrp.errRad * ppr));
      const top = H * 0.1, ry = cy + 8 * u;
      g.line(x, top, x, H * 0.72);
      const r = 3 * u;
      reticle = { x: cx, y: ry };
      g.circle(cx, ry, r);
      g.circle(cx, ry, 0.45 * u, true);
      const ttr = fmtTtr(v.ccrp.ttrS);
      if (ttr) { g.font(3.4, 700, 9); g.text(ttr, cx + r + 1.6 * u, ry, 'left'); }
      const f = ccrpCueFraction(v.ccrp.ttrS);
      if (f != null) {
        const yq = top + (ry - top) * f;
        g.lw(0.5); g.line(x - 1.8 * u, yq, x + 1.8 * u, yq); g.lw(0.3);
      }
    }

    // SPI diamond.
    if (v.spi) {
      const p = hudPoint(v.spi.az, v.spi.el, cx, cy, ppr, W, H * 0.86, margin);
      const d = 1.8 * u;
      g.dash(p.clipped ? [0.8, 0.8] : null);
      g.poly([p.x, p.y - d, p.x + d, p.y, p.x, p.y + d, p.x - d, p.y], true);
      g.dash(null);
    }

    // Maverick: wagon-wheel reticle on the seeker line of sight (dashed when clamped), range below it, filled centre
    // on lock, X below minimum range, and the DLZ staple (max tick fixed at 15 nm, min tick, range caret) at the right.
    if (v.mav) {
      const m = v.mav;
      let q: { x: number; y: number } = { x: cx, y: cy };
      if (m.los) {
        const p = hudPoint(m.los.az, m.los.el, cx, cy, ppr, W, H * 0.86, margin);
        q = p;
        const r = 3.2 * u;
        g.dash(p.clipped ? [1.2, 1.2] : null);
        g.circle(p.x, p.y, r);
        g.dash(null);
        const spokes: number[] = [];
        for (let i = 0; i < 6; i++) {
          const a = (i * Math.PI) / 3 + Math.PI / 6;
          spokes.push(p.x + Math.cos(a) * r * 0.45, p.y + Math.sin(a) * r * 0.45, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
        }
        g.segs(spokes);
        g.circle(p.x, p.y, (m.locked ? 0.9 : 0.35) * u, true);
        const rt = fmtMavRange(m.rangeM, 'imperial');
        if (rt) { g.font(3.2, 700, 8); g.text(rt, p.x, p.y + r + 2.2 * u); }
      }
      if (m.tooClose) {
        const a = 2.8 * u;
        g.lw(0.45);
        g.segs([q.x - a, q.y - a, q.x + a, q.y + a, q.x - a, q.y + a, q.x + a, q.y - a]);
        g.lw(0.3);
      }
      g.font(2.6, 400, 8);
      drawMavStaple(g, W * 0.9, H * 0.72, H * 0.24, mavStaple(m.rangeM, m.dlz), '');
      g.lw(0.3);
    }

    // Below minimum altitude: X over the reticle.
    if (v.belowMinAlt) {
      const q = reticle ?? { x: cx, y: cy };
      const a = 2.6 * u;
      g.lw(0.45);
      g.segs([q.x - a, q.y - a, q.x + a, q.y + a, q.x - a, q.y + a, q.x + a, q.y - a]);
    }
    ctx.filter = 'none';
    g.reset();
  }
}
