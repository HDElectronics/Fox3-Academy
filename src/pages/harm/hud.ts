/**
 * [OWNER: page-harm displays] HornetHud: the F/A-18C HUD items the HARM page teaches, drawn from a HudView on a
 * transparent canvas (overlay on the 3D view or on a dark bezel). Facts: docs/research/fa18c-harm.md (S1 p365-375,
 * fig. 216; TGT diamond p122). Symbology in the theme's symbol colour.
 *
 * Simplified (trainer layout, not verified): the field of view (±12° across the width, linear), the heading tape at
 * the top, the speed / altitude boxes, the G / Mach / master mode / ARM block lower left, the pitch ladder (no roll),
 * the flight path marker shape, where HARM / pullback / waypoint and PB texts sit, the EW symbol circle radius, and
 * the shapes of the PB release cues (bar, chevron, bar with dot).
 */
import { Gfx, Surface } from '../../ui/displays/surface';
import { decorate, lineText } from './ddi';
import type { HudView } from './types';

/** Half the HUD field of view across the canvas width (deg). */
export const HUD_HALF_FOV_DEG = 12;
/** Boresight height as a fraction of the canvas height from the top (trainer layout). */
export const HUD_BORE_Y = 0.45;

/** HUD degrees (x + right, y + up from the boresight) to canvas px. */
export function hudPx(xDeg: number, yDeg: number, w: number, h: number): { x: number; y: number } {
  const ppd = w / (2 * HUD_HALF_FOV_DEG);
  return { x: w / 2 + xDeg * ppd, y: h * HUD_BORE_Y - yDeg * ppd };
}

/** Heading tape label: three digits, 000-359. */
export function hudHeading(deg: number): string {
  const d = ((Math.round(deg) % 360) + 360) % 360;
  return String(d).padStart(3, '0');
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export class HornetHud {
  readonly canvas: HTMLCanvasElement;
  private surf: Surface;
  private g: Gfx;
  private last: HudView | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.surf = new Surface(canvas);
    this.g = new Gfx(this.surf.ctx, this.surf.theme);
    this.surf.onResize = () => this.render();
  }

  draw(v: HudView | null): void { this.last = v; this.render(); }
  refreshTheme(): void { this.surf.refreshTheme(); this.render(); }
  dispose(): void { this.surf.dispose(); this.last = null; }

  private render(): void {
    const sf = this.surf;
    if (!sf.begin()) return;
    const th = sf.theme, g = this.g, ctx = sf.ctx, W = sf.w, H = sf.h;
    const u = Math.min(W, H) / 100;
    g.setup(sf.dpr, u, 0.8, th);
    g.reset();
    ctx.clearRect(0, 0, W, H);
    const v = this.last;
    if (!v) return;
    // A dark edge keeps the symbology readable over a bright 3D view.
    ctx.filter = `drop-shadow(0 0 ${(1.2 * u).toFixed(1)}px ${th.screen})`;
    const ppd = W / (2 * HUD_HALF_FOV_DEG);
    const cx = W / 2, cy = H * HUD_BORE_Y;
    const P = (x: number, y: number) => hudPx(x, y, W, H);
    const margin = 4 * u;
    const cl = (p: { x: number; y: number }) => ({ x: clamp(p.x, margin, W - margin), y: clamp(p.y, margin, H - margin) });
    const sym = th.sym;
    g.ink(sym, 1, 0.3, 1);

    // ---- pitch ladder: a rung every 5°, dashed below the horizon, no roll (simplified).
    ctx.save();
    ctx.beginPath();
    ctx.rect(W * 0.18, H * 0.14, W * 0.64, H * 0.72);
    ctx.clip();
    g.font(2.6, 400, 8);
    for (let p = -85; p <= 85; p += 5) {
      const y = cy - (p - v.pitchDeg) * ppd;
      if (y < -20 || y > H + 20) continue;
      if (p === 0) { g.dash(null); g.segs([cx - W * 0.3, y, cx - W * 0.04, y, cx + W * 0.04, y, cx + W * 0.3, y]); continue; }
      const half = W * 0.11, gap = W * 0.04, tick = (p > 0 ? 1 : -1) * 1.2 * u;
      g.dash(p < 0 ? [1.4, 1] : null);
      g.segs([cx - half, y, cx - gap, y, cx + gap, y, cx + half, y]);
      g.dash(null);
      g.segs([cx - half, y, cx - half, y + tick, cx + half, y, cx + half, y + tick]);
      g.text(String(Math.abs(p)), cx - half - 0.8 * u, y, 'right', 'middle');
      g.text(String(Math.abs(p)), cx + half + 0.8 * u, y, 'left', 'middle');
    }
    ctx.restore();
    g.reset();
    g.ink(sym, 1, 0.3, 1);

    // ---- heading tape (top) with the heading box.
    {
      const y = H * 0.08, perDeg = (W * 0.22) / 15;
      const segs: number[] = [];
      g.font(2.6, 400, 8);
      for (let d = Math.ceil((v.headingDeg - 15) / 5) * 5; d <= v.headingDeg + 15; d += 5) {
        const x = cx + (d - v.headingDeg) * perDeg;
        const big = ((d % 10) + 10) % 10 === 0;
        segs.push(x, y + 2.6 * u, x, y + (big ? 0.6 : 1.4) * u);
        if (big && Math.abs(d - v.headingDeg) > 3) g.text(hudHeading(d).slice(0, 2), x, y - 0.6 * u, 'center', 'middle');
      }
      g.segs(segs);
      g.font(3.2, 700, 9);
      const b = lineText(g, hudHeading(v.headingDeg), cx, y - 0.6 * u, 'center');
      decorate(g, b, true, false);
    }

    // ---- IAS box left, altitude box right.
    g.font(3.4, 700, 9);
    decorate(g, lineText(g, String(Math.round(v.iasKt)), W * 0.22, H * 0.24, 'right'), true, false);
    decorate(g, lineText(g, String(Math.round(v.altFt)), W * 0.78, H * 0.24, 'left'), true, false);

    // ---- lower left: G, Mach, master mode, master arm.
    g.font(2.8, 700, 8);
    const lx = W * 0.14;
    g.text(`G ${v.g.toFixed(1)}`, lx, H * 0.66, 'left', 'middle');
    g.text(`M ${v.mach.toFixed(2)}`, lx, H * 0.7, 'left', 'middle');
    g.text(v.master === 'AG' ? 'A/G' : v.master === 'AA' ? 'A/A' : 'NAV', lx, H * 0.76, 'left', 'middle');
    g.text(v.masterArm ? 'ARM' : 'SAFE', lx, H * 0.8, 'left', 'middle');

    // ---- right side: HARM legend (S1 p365) and the pullback label under it (p366-367).
    // The pullback label's exact position in the DCS HUD is not verified; it is drawn under the HARM legend.
    g.font(3, 700, 8);
    const rx = W * 0.8;
    if (v.harmLegend) g.text('HARM', rx, H * 0.56, 'left', 'middle');
    if (v.pullback) {
      const crossed = v.pullback === 'HARM-X';
      const b = lineText(g, v.pullback === 'PLBK' ? 'PLBK' : 'HARM', rx, H * 0.61, 'left');
      if (crossed) decorate(g, b, false, true);
    }

    // ---- EW symbols on a small circle around the boresight (HUD EW boxed on the EW page, p410).
    if (v.ew.length) {
      const R = 10 * u;
      g.font(2.8, 700, 8);
      for (const e of v.ew) {
        const a = (e.azDeg * Math.PI) / 180;
        const b = lineText(g, e.label, cx + Math.sin(a) * R, cy - Math.cos(a) * R, 'center');
        if (e.boxed) decorate(g, b, true, false);
      }
    }

    // ---- TOO line of sight box, H-OFF above once handed off (p370).
    if (v.los) {
      const p = cl(P(v.los.xDeg, v.los.yDeg)), d = 2.2 * u;
      g.rect(p.x - d, p.y - d, 2 * d, 2 * d);
      if (v.los.hoff) { g.font(2.6, 700, 8); g.text('H-OFF', p.x, p.y - d - 2 * u, 'center', 'middle'); }
    }

    // ---- steering: TGT diamond when designated (p122), else a small waypoint circle; name and distance lower right.
    if (v.steer) {
      const p = cl(P(v.steer.xDeg, v.steer.yDeg)), d = 1.8 * u;
      if (v.steer.tgt) g.poly([p.x, p.y - d, p.x + d, p.y, p.x, p.y + d, p.x - d, p.y], true);
      else g.circle(p.x, p.y, 1.1 * u);
      g.font(2.8, 700, 8);
      g.text(v.steer.name, W * 0.8, H * 0.76, 'left', 'middle');
      g.text(v.steer.distNm.toFixed(1), W * 0.8, H * 0.8, 'left', 'middle');
    }

    // ---- PB cues (fig. 216): azimuth steering line, in-range cue, distance, release cues, min range cue.
    if (v.pb) {
      const pb = v.pb;
      const x = clamp(cx + pb.aslXDeg * ppd, margin, W - margin);
      const top = H * 0.14, bot = H * 0.86;
      g.ink(sym, 1, 0.3, 1);
      g.line(x, top, x, bot);
      const cueY = (deg: number) => clamp(cy - deg * ppd, top, bot);
      if (pb.acCueYDeg != null) {
        const y = cueY(pb.acCueYDeg);
        g.lw(0.5); g.line(x - 2.4 * u, y, x + 2.4 * u, y); g.lw(0.3);
      }
      if (pb.hrmCueYDeg != null) {
        const y = cueY(pb.hrmCueYDeg), c = 1.6 * u;
        g.poly([x - c * 1.4, y - c, x, y, x + c * 1.4, y - c], false);
      }
      if (pb.minCueYDeg != null) {
        const y = cueY(pb.minCueYDeg);
        g.line(x - 2 * u, y, x + 2 * u, y);
        g.circle(x + 3 * u, y, 0.6 * u, true);
      }
      g.font(2.8, 700, 8);
      if (pb.inRange) g.text(pb.inRange, cx + 12 * u, cy + 2 * u, 'left', 'middle');
      g.text(`${pb.distNm.toFixed(1)} TGT`, cx + 12 * u, cy + 6 * u, 'left', 'middle');
    }

    // ---- flight path marker: circle, wings, tail.
    {
      const p = cl(P(v.fpm.xDeg, v.fpm.yDeg)), r = 1.2 * u;
      g.ink(sym, 1, 0.35, 1);
      g.circle(p.x, p.y, r);
      g.segs([p.x - r - 2.4 * u, p.y, p.x - r, p.y, p.x + r, p.y, p.x + r + 2.4 * u, p.y, p.x, p.y - r, p.x, p.y - r - 1.6 * u]);
    }

    ctx.filter = 'none';
    g.reset();
  }
}
