/**
 * [OWNER: displays] GunSightDisplay: the HUD gun sight of the selected jet on a canvas, from a GunSightPicture
 * (gunSightModel.ts). Two uses: a trainer HUD in a bezel (black glass, the target drawn as a wingspan bar) and a
 * transparent overlay over the 3D cockpit camera (projection matched to the camera's field of view).
 *
 * Symbols per kind, as the manuals describe them (docs/research/wvr-guns-bfm.md); geometry simplified:
 * - funnel (FC3 Russian, no lock): two funnel lines sized for the Target Size span.
 * - lcos: pipper; on the FC3 Russian jets a 0–1200 m range scale and the aiming crosshair inside 1200 m.
 * - range-reticle (F-15C lock): reticle with a range arc. hornet-funnel: funnel with 1000 / 2000 ft cues.
 * - hornet-director: director reticle with range arc and SHOOT. eegs-funnel / eegs-pipper: F-16C Level II / V.
 * - rtgs / rtgs-track: F-14 pipper and 2000 ft diamond. ss / sslc: JF-17 snapshot line, plus LCOS pipper.
 * - cclt: M-2000C tracer line with 300 / 600 m wingspan marks and the distance meter inside 1200 m.
 */
import { Gfx, Surface, blinkOn } from './surface';
import { diamond as diamondGlyph } from './glyphs';
import type { GunSightPicture } from './gunSightModel';
import type { SightPoint } from '../../sim/guns';

const FT = 0.3048;

export interface GunSightOptions {
  /** Vertical field of view the canvas spans (deg). Overlay: the 3D camera's fov. Default 26. */
  fovDeg?: number;
  /** Transparent overlay over the 3D view: no glass, no target bar. Default false. */
  overlay?: boolean;
  /** Boresight height as a fraction of the canvas height. Default 0.32 (HUD), 0.5 (overlay). */
  boreY?: number;
  glow?: number;
}

export class GunSightDisplay {
  readonly canvas: HTMLCanvasElement;
  private surf: Surface;
  private g: Gfx;
  private o: Required<GunSightOptions>;
  private last: GunSightPicture | null = null;

  constructor(canvas: HTMLCanvasElement, options: GunSightOptions = {}) {
    this.canvas = canvas;
    this.surf = new Surface(canvas);
    this.g = new Gfx(this.surf.ctx, this.surf.theme);
    const overlay = options.overlay ?? false;
    this.o = { fovDeg: 26, overlay, boreY: overlay ? 0.5 : 0.32, glow: 1, ...options };
    this.surf.onResize = () => this.render();
  }

  setFov(deg: number): void {
    if (Math.abs(deg - this.o.fovDeg) < 1e-3) return;
    this.o.fovDeg = deg;
    this.render();
  }

  refreshTheme(): void { this.surf.refreshTheme(); this.render(); }

  draw(pic: GunSightPicture | null): void { this.last = pic; this.render(); }

  redraw(): void { this.render(); }

  dispose(): void { this.surf.dispose(); this.last = null; }

  private render(): void {
    const s = this.surf;
    if (!s.begin()) return;
    const th = s.theme, g = this.g, ctx = s.ctx;
    const W = s.w, H = s.h;
    const k = Math.min(W, H) / 100;
    g.setup(s.dpr, k, this.o.glow, th);
    g.reset();
    if (this.o.overlay) ctx.clearRect(0, 0, W, H);
    else { ctx.fillStyle = th.screen; ctx.fillRect(0, 0, W, H); }
    const p = this.last;
    if (!p) {
      if (!this.o.overlay) { g.ink(th.symDim, 0, 0.3); g.font(3.4); g.text('NO GUN DATA', W / 2, H / 2); }
      return;
    }
    const cx = W / 2, cy = H * this.o.boreY;
    const f = (H / 2) / Math.tan((this.o.fovDeg * Math.PI / 180) / 2);
    const X = (q: { right: number }) => cx + Math.tan(q.right) * f;
    const Y = (q: { up: number }) => cy - Math.tan(q.up) * f;
    const hs = (q: SightPoint) => Math.max(1.5, Math.tan(q.halfSpan) * f);
    const ink = th.sym, dim = th.symDim;
    const u = Math.max(3.2, 1.6 * k);            // symbol unit in px

    // Target wingspan bar (trainer HUD only; the overlay has the 3D jet).
    if (!this.o.overlay && p.target && p.target.ahead) {
      const tx = X(p.target), ty = Y(p.target), w = Math.max(3, Math.tan(p.target.halfSpan) * f);
      g.ink(th.hostile, 0.6, 0.45);
      g.segs([tx - w, ty, tx + w, ty, tx, ty - w * 0.18, tx, ty + w * 0.35]);
    }
    // Locked target box (the designation the radar lock gives you).
    if (p.locked && p.target && p.target.ahead) {
      const tx = X(p.target), ty = Y(p.target), b = 2.4 * u;
      g.ink(ink, 1, 0.3); g.rect(tx - b, ty - b, 2 * b, 2 * b);
    }

    const kind = p.style.kind;
    const gunCross = () => { g.ink(ink, 1, 0.3); g.segs([cx - 1.6 * u, cy, cx - 0.5 * u, cy, cx + 0.5 * u, cy, cx + 1.6 * u, cy, cx, cy - 1.6 * u, cx, cy - 0.5 * u]); };
    const funnelLines = (pts: SightPoint[]) => {
      if (pts.length < 2) return;
      const L: number[] = [], R: number[] = [];
      for (const q of pts) { L.push(X(q) - hs(q), Y(q)); R.push(X(q) + hs(q), Y(q)); }
      g.ink(ink, 1, 0.3); g.poly(L, false); g.poly(R, false);
    };
    const rangeArc = (q: SightPoint, r: number, full: number) => {
      const x = X(q), y = Y(q);
      g.ink(ink, 1, 0.3); g.circle(x, y, r);
      if (p.range != null) {
        const frac = Math.max(0, Math.min(1, p.range / full));
        g.lw(0.7); g.arc(x, y, r + 0.55 * u, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); g.lw(0.3);
      }
    };
    const pipDot = (q: SightPoint, r = 0.35 * u) => { g.ink(ink, 1, 0.3); g.circle(X(q), Y(q), r, true); };

    switch (kind) {
      case 'funnel':
        funnelLines(p.funnel);
        break;
      case 'lcos': {
        const q = p.pipper!;
        if (p.arcFullM === 1200) {
          // FC3 Russian: pipper with the 0–1200 m range scale; aiming crosshair inside 1200 m.
          rangeArc(q, 3.2 * u, 1200);
          if (p.range != null && p.range <= 1200) { const x = X(q), y = Y(q); g.segs([x - 1.4 * u, y, x + 1.4 * u, y, x, y - 1.4 * u, x, y + 1.4 * u]); }
          else pipDot(q);
        } else { gunCross(); rangeArc(q, 3 * u, p.arcFullM); pipDot(q); }
        break;
      }
      case 'range-reticle':
        gunCross(); rangeArc(p.pipper!, 3.6 * u, p.arcFullM); pipDot(p.pipper!);
        break;
      case 'hornet-funnel':
        gunCross(); funnelLines(p.funnel);
        for (const m of p.marks) { const x = X(m), y = Y(m), w = hs(m) + 1.2 * u; g.segs([x - w, y, x - hs(m) - 0.2 * u, y, x + hs(m) + 0.2 * u, y, x + w, y]); }
        break;
      case 'hornet-director':
        gunCross(); rangeArc(p.pipper!, 3.4 * u, p.arcFullM); pipDot(p.pipper!);
        break;
      case 'eegs-funnel':
        gunCross(); funnelLines(p.funnel);
        break;
      case 'eegs-pipper':
        gunCross(); g.ink(dim, 0.6, 0.3); funnelLines(p.funnel);
        rangeArc(p.pipper!, 3 * u, p.arcFullM); pipDot(p.pipper!);
        break;
      case 'rtgs':
      case 'rtgs-track': {
        gunCross();
        const q = p.pipper!;
        g.ink(ink, 1, 0.3); g.circle(X(q), Y(q), 1.3 * u); pipDot(q, 0.28 * u);
        if (p.diamond) { g.ink(ink, 1, 0.3); diamondGlyph(g, X(p.diamond), Y(p.diamond), 1.1 * u); }
        break;
      }
      case 'ss':
      case 'sslc':
        gunCross();
        g.ink(ink, 1, 0.3);
        for (const q of p.funnel) g.circle(X(q), Y(q), 0.45 * u, true);
        if (kind === 'sslc' && p.pipper) { rangeArc(p.pipper, 3 * u, p.arcFullM); pipDot(p.pipper); }
        break;
      case 'cclt': {
        gunCross();
        const pts: number[] = [cx, cy];
        for (const q of p.funnel) pts.push(X(q), Y(q));
        g.ink(ink, 1, 0.3); g.poly(pts, false);
        for (const m of p.marks) { const x = X(m), y = Y(m), w = hs(m); g.lw(0.45); g.segs([x - w, y, x - w * 0.4, y, x + w * 0.4, y, x + w, y]); g.lw(0.3); }
        if (p.range != null && p.range <= 1200) {
          // Distance meter: a tick on the tracer line at the target range.
          const i = Math.min(p.funnel.length - 1, Math.max(0, Math.round((p.range - 100) / 100)));
          const q = p.funnel[i]!;
          g.ink(th.symHi, 1, 0.45); g.segs([X(q) - 1.4 * u, Y(q) - 0.9 * u, X(q) + 1.4 * u, Y(q) - 0.9 * u]);
        }
        break;
      }
    }

    // ---- text: sight name, rounds, range, cues (B612 Mono, no thousands separators)
    g.ink(ink, 0.8, 0.3);
    const fs = this.o.overlay ? 2.6 : 3.6;
    g.font(fs);
    const pad = 3 * k;
    g.text(p.style.name.toUpperCase(), pad, pad, 'left', 'top');
    g.text(`RDS ${p.rounds}`, W - pad, H - pad, 'right', 'bottom');
    if (p.range != null) {
      const txt = p.units === 'metric' ? `${Math.round(p.range / 10) * 10} M` : `${Math.round(p.range / FT / 50) * 50} FT`;
      g.text(txt, pad, H - pad, 'left', 'bottom');
    }
    if (p.shoot) {
      g.ink(th.symHi, 1.2, 0.3); g.font(fs * 1.4, 700);
      g.text('SHOOT', cx, Math.min(H - 8 * k, cy + 22 * k), 'center', 'middle');
    } else if (p.inRange && p.style.kind !== 'hornet-director') {
      g.ink(dim, 0.6, 0.3); g.font(fs);
      g.text('IN RNG', W - pad, pad, 'right', 'top');
    }
    if (p.firing && blinkOn(4)) { g.ink(th.symHi, 1, 0.3); g.font(fs, 700); g.text('GUN', cx, H - pad, 'center', 'bottom'); }
    else { g.ink(dim, 0, 0.3); g.font(fs * 0.8); g.text('SIMPLIFIED', cx, H - pad, 'center', 'bottom'); }
    g.reset();
  }
}
