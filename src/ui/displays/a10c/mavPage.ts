/**
 * [OWNER: displays] A10cMavPage: the Maverick (MAV) page on an A-10C II MFCD (docs/research/a10c.md §6).
 * Without a Maverick profile the page reads SENSOR where the launch zone goes; with a profile the DLZ staple
 * replaces it (max tick fixed at 15 nm, min tick, range caret, range readout). AGM-65D / H: the seeker video (a dark
 * field without a picture), the crosshair, the tracking gate as open corner brackets that collapses to a small box
 * on lock with the pointing cross flashing, the crosshairs spreading to the edges in the first MAV_BREAK_SPREAD_S
 * after a break-lock, CAGED while caged. AGM-65L: no video; the synthetic view with the 15° launch circle and the
 * gimbal X, a solid square once a spot on the code is seen, and the code. Profile name upper left, status
 * ALN / RDY / EMPTY upper right, SOI box or NOT SOI. Shapes and positions of the gate, the pointing cross, the break
 * spread, the synthetic view, the staple and the OSB legends are the trainer's drawing (not verified).
 */
import { blinkOn, type Gfx } from '../surface';
import type { Theme } from '../../theme';
import type { MavPageView } from './types';
import { MfcdPage, drawOsb, drawOsbTicks, drawSoiBox, type OsbLabel } from './mfcd';
import { coverSource } from './tgpPage';

const NM = 1852;

/** The DLZ staple scale: its top (the max tick) is fixed at 15 nm (research §6, manual p.453). */
export const MAV_DLZ_SCALE_NM = 15;
/** After a break-lock the crosshairs spread to the edges over about this many seconds, then the page settles. */
export const MAV_BREAK_SPREAD_S = 2;

/** Profile name as the DSMS labels it. */
export function mavProfileLabel(p: MavPageView['profile']): string {
  return p === 'agm65d' ? '65D' : p === 'agm65h' ? '65H' : p === 'agm65l' ? '65L' : '';
}

/** Range readout: nm with one decimal (km with a KM suffix in the trainer's metric units). */
export function fmtMavRange(rangeM: number | null, units: MavPageView['units']): string {
  if (rangeM == null || !Number.isFinite(rangeM) || rangeM < 0) return '';
  return units === 'metric' ? `${(rangeM / 1000).toFixed(1)}KM` : (rangeM / NM).toFixed(1);
}

export interface MavStaple {
  /** Min tick as a fraction of the scale (0 bottom, 1 = 15 nm at the top), or null without a DLZ. */
  min: number | null;
  /** Max tick: always 1 (fixed at 15 nm). */
  max: 1;
  /** Range caret fraction (clamped to 0..1), or null without a range. */
  caret: number | null;
  /** The range is off the scale (beyond 15 nm). */
  beyond: boolean;
  /** Range inside [dlz.min, dlz.max]. */
  inZone: boolean;
}

/** Positions on the DLZ staple for a range and a launch zone (m). */
export function mavStaple(rangeM: number | null, dlz: { min: number; max: number } | null): MavStaple {
  const top = MAV_DLZ_SCALE_NM * NM;
  const f = (m: number) => Math.min(1, Math.max(0, m / top));
  const hasR = rangeM != null && Number.isFinite(rangeM);
  return {
    min: dlz && Number.isFinite(dlz.min) ? f(dlz.min) : null,
    max: 1,
    caret: hasR ? f(rangeM) : null,
    beyond: hasR && rangeM > top,
    inZone: !!dlz && hasR && rangeM >= dlz.min && rangeM <= dlz.max,
  };
}

/** How far the crosshairs have spread after a break-lock (0 at the break, 1 at the edges), or null when not recent. */
export function mavBreakSpread(sinceBreakS: number | null): number | null {
  if (sinceBreakS == null || !Number.isFinite(sinceBreakS) || sinceBreakS < 0 || sinceBreakS >= MAV_BREAK_SPREAD_S) return null;
  const k = sinceBreakS / MAV_BREAK_SPREAD_S;
  return 1 - (1 - k) * (1 - k);
}

/**
 * Draw the DLZ staple: a vertical line from 0 to the 15 nm max tick, the min tick, and a caret pointing at the
 * range from the left, with the range text beside it. `x` is the staple line, `y0` its bottom, `h` its height.
 */
export function drawMavStaple(g: Gfx, x: number, y0: number, h: number, st: MavStaple, rangeText: string): void {
  const u = g.u, tick = 1.8 * u;
  const yAt = (f: number) => y0 - f * h;
  g.segs([x, y0, x, yAt(1), x, yAt(1), x - tick, yAt(1), x, y0, x - tick * 0.6, y0]);
  if (st.min != null) {
    g.lw(0.5);
    g.line(x, yAt(st.min), x - tick * 1.3, yAt(st.min));
    g.lw(0.3);
  }
  if (st.caret != null) {
    const y = yAt(st.caret), cx = x - 1 * u;
    g.poly([cx, y, cx - 1.6 * u, y - 1.1 * u, cx - 1.6 * u, y + 1.1 * u], true, st.inZone);
    if (rangeText) g.text(rangeText, cx - 2.4 * u, y, 'right');
  }
}

function imageSize(img: CanvasImageSource): { w: number; h: number } {
  const i = img as { videoWidth?: number; videoHeight?: number; naturalWidth?: number; naturalHeight?: number; width?: unknown; height?: unknown };
  const num = (v: unknown) => (typeof v === 'number' ? v : 0);
  return { w: num(i.videoWidth) || num(i.naturalWidth) || num(i.width), h: num(i.videoHeight) || num(i.naturalHeight) || num(i.height) };
}

export class A10cMavPage extends MfcdPage<MavPageView> {
  protected paint(s: number, th: Theme): void {
    const v = this.view;
    const g = this.g, ctx = this.surf.ctx, u = g.u, cx = s / 2, cy = s * 0.47;
    const isL = v?.profile === 'agm65l';

    // Background: seeker video (D / H), the synthetic view field (L), or a dark field.
    if (v?.image && !isL) {
      const { w, h } = imageSize(v.image);
      const src = coverSource(w, h);
      ctx.imageSmoothingEnabled = true;
      if (src.sw > 0 && src.sh > 0) ctx.drawImage(v.image, src.sx, src.sy, src.sw, src.sh, 0, 0, s, s);
      else ctx.drawImage(v.image, 0, 0, s, s);
    } else {
      ctx.fillStyle = th.screen2;
      ctx.fillRect(0, 0, s, s);
    }
    drawOsbTicks(g, th, s);
    const halo = () => { ctx.shadowColor = th.screen; ctx.shadowBlur = 3 * this.surf.dpr; };
    g.ink(th.sym, 0, 0.35, 1); halo();

    if (v) {
      if (isL) this.paintL(v, s, cx, cy, halo);
      else this.paintSeeker(v, s, cx, cy, halo);

      // Profile upper left, status upper right, NOT SOI below them.
      g.font(3.4, 700, 8); halo();
      const pl = mavProfileLabel(v.profile);
      if (pl) g.text(pl, s * 0.1, s * 0.13, 'left');
      if (v.profile) g.text(v.status, s * 0.9, s * 0.13, 'right');
      if (!v.soi) g.text('NOT SOI', cx, s * 0.2);

      // Right side: SENSOR without a profile, else the DLZ staple (max tick 15 nm, min tick, range caret).
      const sx = s * 0.9, sy0 = s * 0.72, sh = s * 0.42;
      if (!v.profile) {
        g.font(3.4, 700, 8); halo();
        g.text('SENSOR', sx, s * 0.5, 'right');
      } else {
        g.font(2.8, 700, 8); halo();
        g.text('DLZ', sx, sy0 - sh - 3 * u, 'right');
        g.lw(0.35);
        drawMavStaple(g, sx, sy0, sh, mavStaple(v.rangeM, v.dlz), fmtMavRange(v.rangeM, v.units));
        g.font(2.6, 400, 8); halo();
        g.text(String(MAV_DLZ_SCALE_NM), sx + 1.2 * u, sy0 - sh, 'left');
      }
    }
    g.reset();

    const osbs: OsbLabel[] = [
      { osb: 12, text: 'TAD' },
      { osb: 13, text: 'TGP' },
      { osb: 14, text: 'MAV', style: 'boxed' },
      { osb: 15, text: 'DSMS' },
    ];
    for (const l of osbs) drawOsb(g, th, s, l);
    if (v?.soi) drawSoiBox(g, th, s);
  }

  /** AGM-65D / H: crosshair, gate brackets or the locked box with the flashing pointing cross, break spread, CAGED. */
  private paintSeeker(v: MavPageView, s: number, cx: number, cy: number, halo: () => void): void {
    const g = this.g, ctx = this.surf.ctx, u = g.u;
    const spread = v.locked ? null : mavBreakSpread(v.sinceBreakS);
    const gate = v.locked ? 1.6 * u : 7 * u;
    const edge = 6 * u;

    if (spread != null) {
      // Break-lock: the crosshair pair moves out from the centre to the page edges.
      const dx = gate + spread * (s / 2 - edge - gate), dy = gate + spread * (s / 2 - edge - gate);
      g.segs([cx - dx, edge, cx - dx, s - edge, cx + dx, edge, cx + dx, s - edge,
        edge, cy - dy, s - edge, cy - dy, edge, cy + dy, s - edge, cy + dy]);
    } else {
      // Crosshair from the edges to a gap round the gate.
      const gap = gate + 2.2 * u;
      g.segs([edge, cy, cx - gap, cy, cx + gap, cy, s - edge, cy, cx, edge + 8 * u, cx, cy - gap, cx, cy + gap, cx, s - edge - 8 * u]);
    }

    if (v.locked) {
      // Gate collapsed onto the target and the pointing cross flashing.
      g.lw(0.5);
      g.rect(cx - gate, cy - gate, 2 * gate, 2 * gate);
      g.lw(0.35);
      if (blinkOn(2, v.t)) {
        const p = 4 * u;
        g.segs([cx - p, cy, cx - gate - 0.6 * u, cy, cx + gate + 0.6 * u, cy, cx + p, cy, cx, cy - p, cx, cy - gate - 0.6 * u, cx, cy + gate + 0.6 * u, cx, cy + p]);
      }
    } else if (spread == null) {
      // Open gate: four corner brackets.
      const b = gate, c = 2.2 * u;
      g.segs([cx - b, cy - b, cx - b + c, cy - b, cx - b, cy - b, cx - b, cy - b + c,
        cx + b, cy - b, cx + b - c, cy - b, cx + b, cy - b, cx + b, cy - b + c,
        cx - b, cy + b, cx - b + c, cy + b, cx - b, cy + b, cx - b, cy + b - c,
        cx + b, cy + b, cx + b - c, cy + b, cx + b, cy + b, cx + b, cy + b - c]);
    }

    if (!v.image) {
      g.font(3.6, 700, 9);
      const w = g.measure('NO VIDEO') + 3 * u, y = s * 0.3;
      ctx.shadowBlur = 0;
      ctx.fillStyle = this.surf.theme.screen2;
      ctx.fillRect(cx - w / 2, y - 3 * u, w, 6 * u);
      g.ink(this.surf.theme.symDim, 0, 0.3, 1);
      g.text('NO VIDEO', cx, y);
      g.ink(this.surf.theme.sym, 0, 0.35, 1);
    }
    g.font(3.4, 700, 8); halo();
    if (v.caged) g.text('CAGED', cx, s * 0.8);
  }

  /** AGM-65L: synthetic view, 15° launch circle, gimbal X (solid square when a spot on the code is seen), code. */
  private paintL(v: MavPageView, s: number, cx: number, cy: number, halo: () => void): void {
    const g = this.g, u = g.u;
    const r = s * 0.25;
    g.dash([1.2, 1.2]);
    g.circle(cx, cy, r);
    g.dash(null);
    // Boresight ticks on the launch circle.
    const k = 0.025 * s;
    g.segs([cx - r - k, cy, cx - r + k, cy, cx + r - k, cy, cx + r + k, cy, cx, cy - r - k, cx, cy - r + k, cx, cy + r - k, cx, cy + r + k]);
    const a = 2.4 * u;
    if (v.spotSeen) {
      g.rect(cx - a, cy - a, 2 * a, 2 * a, true);
    } else {
      g.lw(0.5);
      g.segs([cx - a, cy - a, cx + a, cy + a, cx - a, cy + a, cx + a, cy - a]);
      g.lw(0.35);
    }
    g.font(3.4, 700, 8); halo();
    if (v.caged) g.text('CAGED', cx, s * 0.8);
    g.font(3.2, 700, 8); halo();
    g.text(`CODE ${v.laserCode ?? '----'}`, s * 0.1, s * 0.86, 'left');
  }
}
