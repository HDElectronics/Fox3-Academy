/**
 * [OWNER: displays] A10cTgpPage: the Litening TGP A-G page on an A-10C II MFCD (docs/research/a10c.md §3).
 * Draws the pod video filling the page (NO VIDEO on a dark field without a picture; STBY while the pod is not
 * on), the crosshair with gaps (a centre box in POINT and on the laser spot in LTRACK, the open gate across the
 * display while LSS searches), the track text next to the crosshair (AREA / POINT / INR), WIDE / NARO (WSCH /
 * NSCH in LSS search) upper left, CCD upper right, the LSS state lower centre (LSRCH, DETECT, LTRACK, NO LSR),
 * the laser status letter L (2 Hz flash while firing) with the laser code, the range field `L / T / E x.x`,
 * SPI when the pod line of sight is the SPI, and the SOI box or NOT SOI. OSB legends: 2 A-G, 3 STBY, 4 A-A,
 * 6 LSS / LST, 7 LSR (verified); CNTL on OSB 1 and the LSS code under OSB 6 are the trainer's layout.
 */
import { blinkOn } from '../surface';
import type { Theme } from '../../theme';
import type { TgpPageView } from './types';
import { MfcdPage, drawOsb, drawOsbTicks, drawSoiBox, type OsbLabel } from './mfcd';

const NM = 1852;

/** Range field text: source letter and slant range, nm with one decimal (km in the trainer's metric units). */
export function fmtTgpRange(rangeM: number | null, source: TgpPageView['rangeSource'], units: TgpPageView['units']): string {
  if (rangeM == null || !source || !Number.isFinite(rangeM)) return '';
  const v = units === 'metric' ? rangeM / 1000 : rangeM / NM;
  return `${source} ${v.toFixed(1)}${units === 'metric' ? 'KM' : ''}`;
}

/** LSS state text lower centre (research §3); nothing when LSS is off. */
export function lssText(lss: TgpPageView['lss']): string {
  switch (lss) {
    case 'search': return 'LSRCH';
    case 'detect': return 'DETECT';
    case 'track': return 'LTRACK';
    case 'lost': return 'NO LSR';
    default: return '';
  }
}

/** OSB 6 legend: LSS, changing to LST once a spot is detected. */
export const lssOsbLabel = (lss: TgpPageView['lss']): 'LSS' | 'LST' => (lss === 'detect' || lss === 'track' ? 'LST' : 'LSS');

/** Field-of-view text upper left: WIDE / NARO, WSCH / NSCH while the spot search runs. */
export function fovText(fov: TgpPageView['fov'], lss: TgpPageView['lss']): string {
  const searching = lss === 'search' || lss === 'detect';
  if (fov === 'wide') return searching ? 'WSCH' : 'WIDE';
  return searching ? 'NSCH' : 'NARO';
}

/** Track mode text next to the crosshair. */
export const trackText = (t: TgpPageView['track']): string => (t === 'area' ? 'AREA' : t === 'point' ? 'POINT' : t === 'inr' ? 'INR' : '');

/** Source rectangle that covers a square page with an image of any aspect (centre crop). */
export function coverSource(iw: number, ih: number): { sx: number; sy: number; sw: number; sh: number } {
  if (!(iw > 0 && ih > 0)) return { sx: 0, sy: 0, sw: iw, sh: ih };
  const side = Math.min(iw, ih);
  return { sx: (iw - side) / 2, sy: (ih - side) / 2, sw: side, sh: side };
}

function imageSize(img: CanvasImageSource): { w: number; h: number } {
  const i = img as { videoWidth?: number; videoHeight?: number; naturalWidth?: number; naturalHeight?: number; width?: number | { baseVal?: { value: number } }; height?: number | { baseVal?: { value: number } } };
  const num = (v: unknown) => (typeof v === 'number' ? v : 0);
  const w = num(i.videoWidth) || num(i.naturalWidth) || num(i.width);
  const h = num(i.videoHeight) || num(i.naturalHeight) || num(i.height);
  return { w, h };
}

export class A10cTgpPage extends MfcdPage<TgpPageView> {
  protected paint(s: number, th: Theme): void {
    const v = this.view;
    const g = this.g, ctx = this.surf.ctx, u = g.u, cx = s / 2, cy = s / 2;
    const osbs: OsbLabel[] = [
      { osb: 1, text: 'CNTL' },
      { osb: 2, text: 'A-G', style: v?.on ? 'boxed' : 'plain' },
      { osb: 3, text: 'STBY', style: v?.on ? 'plain' : 'boxed' },
      { osb: 4, text: 'A-A' },
    ];
    if (!v || !v.on) {
      drawOsbTicks(g, th, s);
      for (const l of osbs) drawOsb(g, th, s, l);
      g.font(4.4, 700, 9);
      g.ink(th.symDim, 0, 0.3, 1);
      g.text('STBY', cx, cy);
      this.soi(s, th, v?.soi ?? false);
      return;
    }

    // Video (or NO VIDEO on a dark field).
    if (v.image) {
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

    // Symbology in the phosphor colour with a dark halo so it reads on bright ground.
    const halo = () => { ctx.shadowColor = th.screen; ctx.shadowBlur = 3 * this.surf.dpr; };
    g.ink(th.sym, 0, 0.35, 1); halo();

    // Crosshair: lines from the page edge to a gap round the centre; LSS search opens the gate across the display.
    const searching = v.lss === 'search' || v.lss === 'detect' || v.lss === 'lost';
    const gap = searching ? 9 * u : 4.5 * u;
    const edge = searching ? 3 * u : 16 * u;
    g.segs([edge, cy, cx - gap, cy, cx + gap, cy, s - edge, cy, cx, edge + 5 * u, cx, cy - gap, cx, cy + gap, cx, s - edge - 5 * u]);
    if (searching) {
      // Open gate: corner brackets.
      const b = gap, c = 2.4 * u;
      g.segs([cx - b, cy - b, cx - b + c, cy - b, cx - b, cy - b, cx - b, cy - b + c,
        cx + b, cy - b, cx + b - c, cy - b, cx + b, cy - b, cx + b, cy - b + c,
        cx - b, cy + b, cx - b + c, cy + b, cx - b, cy + b, cx - b, cy + b - c,
        cx + b, cy + b, cx + b - c, cy + b, cx + b, cy + b, cx + b, cy + b - c]);
    }
    // Track gate: a centre box in POINT (on the spot in LTRACK).
    if (v.track === 'point' || v.lss === 'track') {
      const b = 2.6 * u;
      g.lw(0.45); g.rect(cx - b, cy - b, 2 * b, 2 * b); g.lw(0.35);
    }
    if (!v.image) {
      // NO VIDEO on a plate so the crosshair does not run through it.
      g.font(4, 700, 9);
      const w = g.measure('NO VIDEO') + 3 * u, y = s * 0.33;
      ctx.shadowBlur = 0;
      ctx.fillStyle = th.screen2;
      ctx.fillRect(cx - w / 2, y - 3 * u, w, 6 * u);
      g.ink(th.symDim, 0, 0.3, 1);
      g.text('NO VIDEO', cx, y);
      g.ink(th.sym, 0, 0.35, 1); halo();
    }
    // Track mode text next to the crosshair.
    g.font(3.2, 700, 8); halo();
    const tt = trackText(v.track);
    if (tt) g.text(tt, cx + gap + 1.5 * u, cy - 3 * u, 'left');

    // Top line: FOV upper left, video mode upper right.
    g.font(3.4, 700, 8); halo();
    g.text(fovText(v.fov, v.lss), s * 0.1, s * 0.13, 'left');
    if (v.zoom != null) g.text(`${v.zoom}Z`, s * 0.1, s * 0.18, 'left');
    g.text('CCD', s * 0.9, s * 0.13, 'right');
    if (!v.soi) g.text('NOT SOI', cx, s * 0.2);

    // LSS state lower centre.
    const lt = lssText(v.lss);
    if (lt) { g.font(3.8, 700, 9); halo(); g.text(lt, cx, s * 0.78); }

    // Laser status and code lower left; SPI above them.
    g.font(3.6, 700, 9); halo();
    if (!v.laserFiring || blinkOn(2, v.t)) g.text('L', s * 0.1, s * 0.84, 'left');
    g.font(3.2, 400, 8); halo();
    g.text(String(v.laserCode), s * 0.1, s * 0.89, 'left');
    if (v.isSpi) { g.font(3.2, 700, 8); halo(); g.text('SPI', s * 0.1, s * 0.78, 'left'); }
    // Range field lower right.
    const rt = fmtTgpRange(v.rangeM, v.rangeSource, v.units);
    if (rt) { g.font(3.6, 700, 9); halo(); g.text(rt, s * 0.9, s * 0.84, 'right'); }
    g.reset();

    // OSB legends.
    osbs.push({ osb: 6, text: lssOsbLabel(v.lss), style: v.lss === 'off' ? 'plain' : 'boxed' }, { osb: 7, text: 'LSR' });
    for (const l of osbs) drawOsb(g, th, s, l);
    const o6 = { x: s * 0.97, y: s * 0.2 };
    g.font(2.8, 400, 8);
    g.ink(th.symDim, 0, 0.3, 1);
    g.text(String(v.lssCode), o6.x, o6.y + 4 * u, 'right');
    this.soi(s, th, v.soi);
  }

  private soi(s: number, th: Theme, soi: boolean): void {
    if (soi) drawSoiBox(this.g, th, s);
  }
}
