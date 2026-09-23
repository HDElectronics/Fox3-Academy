/**
 * [OWNER: displays] It23mDisplay: the Su-25T IT-23M TV monitor. Draws the Shkval black-and-white picture (any
 * CanvasImageSource, e.g. ShkvalTv.image) and the symbology the ED Su-25T Flight Manual (S1) describes: azimuth
 * scale on top (−40..+40°), elevation scale on the left (+20..−90°) with the aircraft pitch beside it, КС / АС
 * next to the radar altitude, magnification and target size upper left, the target frame in the centre, ЛД when
 * the laser is on (flashing while it cools), slant range in km at the bottom, the launch-authorised cue ПР above it
 * and the time of flight lower right. Positions of the items follow S1's description; exact glyphs are simplified.
 */
import { Gfx, Surface, blinkOn } from './surface';

export interface It23mState {
  on: boolean;
  mode: 'КС' | 'АС';
  zoom: number;
  targetSizeM: number;
  /** Sight line relative to the nose (az) and the horizon (el), degrees. */
  azDeg: number;
  elDeg: number;
  pitchDeg: number;
  /** Radar altitude (m), null when not shown. */
  radarAltM: number | null;
  laserOn: boolean;
  /** The laser tripped its limit and is cooling: ЛД flashes. */
  laserCooling: boolean;
  /** Slant range to the aim point (m). */
  rangeM: number | null;
  /** Time of flight (before launch) or time to impact (after), s. */
  tofS: number | null;
  pr: boolean;
  /** Horizontal field of view (deg), sizes the target frame. */
  fovHDeg: number;
  groundStab: boolean;
}

/** IT-23M scale limits (S1). */
export const IT23M_AZ = { min: -40, max: 40 } as const;
export const IT23M_EL = { max: 20, min: -90 } as const;

/** Azimuth (deg) → x between x0 (−40°) and x1 (+40°), clamped. */
export function azToX(azDeg: number, x0: number, x1: number): number {
  const k = (Math.max(IT23M_AZ.min, Math.min(IT23M_AZ.max, azDeg)) - IT23M_AZ.min) / (IT23M_AZ.max - IT23M_AZ.min);
  return x0 + (x1 - x0) * k;
}

/** Elevation (deg) → y between y0 (+20°, top) and y1 (−90°, bottom), clamped. */
export function elToY(elDeg: number, y0: number, y1: number): number {
  const k = (IT23M_EL.max - Math.max(IT23M_EL.min, Math.min(IT23M_EL.max, elDeg))) / (IT23M_EL.max - IT23M_EL.min);
  return y0 + (y1 - y0) * k;
}

/**
 * Target frame width (px): the set target size seen at the slant range through the field of view, clamped to
 * [minPx, 0.8 × width]. Without a range the frame takes a fixed 8 % of the width.
 */
export function targetFramePx(sizeM: number, rangeM: number | null, fovHDeg: number, widthPx: number, minPx = 8): number {
  if (!rangeM || rangeM <= 0 || fovHDeg <= 0) return Math.max(minPx, widthPx * 0.08);
  const fovM = 2 * rangeM * Math.tan((fovHDeg * Math.PI) / 360);
  return Math.max(minPx, Math.min(widthPx * 0.8, (sizeM / fovM) * widthPx));
}

/** Slant range in km as the IT-23M prints it: one decimal. */
export const fmtSlantKm = (m: number): string => (m / 1000).toFixed(1);

export class It23mDisplay {
  readonly canvas: HTMLCanvasElement;
  private surf: Surface;
  private g: Gfx;
  private last: { s: It23mState | null; img: CanvasImageSource | null } = { s: null, img: null };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.surf = new Surface(canvas);
    this.g = new Gfx(this.surf.ctx, this.surf.theme);
    this.surf.onResize = () => this.render();
  }

  draw(state: It23mState | null, image: CanvasImageSource | null): void {
    this.last = { s: state, img: image };
    this.render();
  }

  refreshTheme(): void { this.surf.refreshTheme(); this.render(); }

  /** Canvas-local CSS px → offset from the picture centre as fractions of the width / height (−0.5..0.5). */
  pickOffset(clientX: number, clientY: number): { fx: number; fy: number } {
    const p = this.surf.toLocal(clientX, clientY);
    return { fx: p.x / Math.max(1, this.surf.w) - 0.5, fy: p.y / Math.max(1, this.surf.h) - 0.5 };
  }

  dispose(): void { this.surf.dispose(); this.last = { s: null, img: null }; }

  private render(): void {
    const sf = this.surf;
    if (!sf.begin()) return;
    const th = sf.theme, g = this.g, ctx = sf.ctx, W = sf.w, H = sf.h;
    const u = Math.min(W, H) / 100;
    g.setup(sf.dpr, u, 0.6, th);
    g.reset();
    ctx.fillStyle = th.screen;
    ctx.fillRect(0, 0, W, H);
    const s = this.last.s;
    if (!s || !s.on) {
      g.font(4.2, 400, 9);
      g.ink(th.symDim, 0, 0.3, 0.9);
      g.text('Shkval off  [O]', W / 2, H / 2);
      return;
    }
    if (this.last.img) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.last.img, 0, 0, W, H);
    }
    // Symbology: phosphor ink with a dark halo so it reads on light and dark ground.
    const sym = th.sym;
    const halo = () => { ctx.shadowColor = th.screen; ctx.shadowBlur = 3 * sf.dpr; };
    g.ink(sym, 0, 0.35, 1); halo();

    // Azimuth scale (top).
    const ax0 = W * 0.22, ax1 = W * 0.78, ay = H * 0.07;
    const segs: number[] = [ax0, ay, ax1, ay];
    for (let a = IT23M_AZ.min; a <= IT23M_AZ.max; a += 10) {
      const x = azToX(a, ax0, ax1), big = a % 20 === 0;
      segs.push(x, ay, x, ay - (big ? 2.4 : 1.4) * u);
    }
    g.segs(segs);
    const cx = azToX(s.azDeg, ax0, ax1);
    g.poly([cx, ay + 0.6 * u, cx - 1.6 * u, ay + 3 * u, cx + 1.6 * u, ay + 3 * u], true, true);

    // Elevation scale (left) and aircraft pitch.
    const ex = W * 0.06, ey0 = H * 0.16, ey1 = H * 0.86;
    const es: number[] = [ex, ey0, ex, ey1];
    for (let e = IT23M_EL.max; e >= IT23M_EL.min; e -= 10) {
      const y = elToY(e, ey0, ey1), big = e % 30 === 0;
      es.push(ex, y, ex + (big ? 2.4 : 1.4) * u, y);
    }
    g.segs(es);
    g.font(3, 400, 8);
    for (const e of [0, -30, -60, -90]) g.text(String(e), ex + 3.4 * u, elToY(e, ey0, ey1), 'left');
    const cy = elToY(s.elDeg, ey0, ey1);
    g.poly([ex - 0.6 * u, cy, ex - 3 * u, cy - 1.6 * u, ex - 3 * u, cy + 1.6 * u], true, true);
    const py = elToY(s.pitchDeg, ey0, ey1);
    g.lw(0.5); g.line(ex + 1 * u, py, ex + 4.2 * u, py); g.lw(0.35);

    // Upper left: magnification and target size. Top: КС / АС and radar altitude.
    g.font(4, 700, 9);
    g.text(`${s.zoom}x`, W * 0.14, H * 0.2, 'left');
    g.font(3.6, 400, 9);
    g.text(`${s.targetSizeM} м`, W * 0.14, H * 0.2 + 5 * u, 'left');
    g.font(4.2, 700, 9);
    g.text(s.mode, W * 0.84, H * 0.07, 'left');
    if (s.radarAltM != null) { g.font(3.4, 400, 8); g.text(String(Math.round(s.radarAltM)), W * 0.84, H * 0.07 + 5 * u, 'left'); }

    // Centre: sight cross and the target frame.
    const mx = W / 2, my = H / 2, gap = 2.2 * u, arm = 7 * u;
    g.segs([mx - arm, my, mx - gap, my, mx + gap, my, mx + arm, my, mx, my - arm, mx, my - gap, mx, my + gap, mx, my + arm]);
    const fw = targetFramePx(s.targetSizeM, s.rangeM, s.fovHDeg, W);
    const fh = fw * 0.75;
    if (s.mode === 'АС') { g.lw(0.55); g.rect(mx - fw / 2, my - fh / 2, fw, fh); g.lw(0.35); }
    else {
      const c = Math.min(fw, fh) * 0.3, x0 = mx - fw / 2, y0 = my - fh / 2, x1 = mx + fw / 2, y1 = my + fh / 2;
      g.segs([x0, y0, x0 + c, y0, x0, y0, x0, y0 + c, x1, y0, x1 - c, y0, x1, y0, x1, y0 + c,
        x0, y1, x0 + c, y1, x0, y1, x0, y1 - c, x1, y1, x1 - c, y1, x1, y1, x1, y1 - c]);
    }

    // Bottom: ЛД, slant range, ПР, time of flight.
    const by = H * 0.93;
    if (s.laserOn || (s.laserCooling && blinkOn(2))) { g.font(4, 700, 9); g.text('ЛД', W * 0.1, by, 'left'); }
    if (s.rangeM != null) { g.font(4.4, 700, 9); g.text(fmtSlantKm(s.rangeM), mx, by); }
    if (s.pr) { g.font(4.4, 700, 9); g.text('ПР', mx, by - 6 * u); }
    if (s.tofS != null) { g.font(4.2, 700, 9); g.text(String(Math.max(0, Math.round(s.tofS))), W * 0.9, by, 'right'); }
    g.reset();
  }
}
