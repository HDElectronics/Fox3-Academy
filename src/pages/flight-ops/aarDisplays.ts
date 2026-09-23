/**
 * [OWNER: page-flight-ops] Refuelling displays (#28): the contact position box (probe tip or receptacle against
 * the limits of the phase, every AAR jet), the UPAZ hose-band gauge (Su-33 on the IL-78M) and the simplified boom
 * cues (boom jets; the KC-135 director lights are not modelled). Trainer displays, not DCS cockpit instruments.
 * Colours from design tokens (readTheme via Surface), mono font.
 */
import { Surface } from '../../ui/displays/surface';
import { alpha } from '../../ui/theme';
import type { AarState, TankerData } from '../../sim/flightOps';
import { bandStripes } from '../../render/flightOps/tanker';
import { BAND_LABEL, boomCueText, type PositionBox } from './aarLesson';

const PHASE: Record<PositionBox['phase'], string> = { rejoin: 'TO PRE-CONTACT', precontact: 'PRE-CONTACT', closing: 'CLOSING', contact: 'CONTACT' };
const fmt = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v) >= 100 ? Math.round(Math.abs(v)) : Math.abs(v).toFixed(1)}`;

/**
 * Position box: left, a square seen from behind (right +, up +) with the limit box drawn at half the square;
 * right, the fore/aft bar (forward up). The dot pins to the edge when outside the scale.
 */
export class PositionDisplay {
  private readonly s: Surface;
  private last: PositionBox | null = null;
  constructor(canvas: HTMLCanvasElement) {
    this.s = new Surface(canvas);
    this.s.onResize = () => this.draw(this.last);
  }

  draw(b: PositionBox | null): void {
    this.last = b;
    const s = this.s;
    if (!s.begin()) return;
    const { ctx, w, h, theme: th } = s;
    ctx.fillStyle = th.screen; ctx.fillRect(0, 0, w, h);
    const fs = Math.max(9, Math.round(Math.min(w / 16, h / 11)));
    ctx.font = `${fs}px ${th.fontMono}`; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    ctx.fillStyle = th.symDim;
    ctx.fillText(b ? PHASE[b.phase] : 'NO TANKER', 6, 5);
    if (!b) return;
    const top = fs + 12, bottom = h - fs - 10;
    const size = Math.min(w * 0.68, bottom - top);
    const cx = 6 + size / 2, cy = top + (bottom - top) / 2;
    const half = size / 2;
    const tone = b.inside ? th.ok : th.caution;
    // Frame and crosshair.
    ctx.strokeStyle = th.screenLine; ctx.lineWidth = 1;
    ctx.strokeRect(cx - half, cy - half, size, size);
    ctx.beginPath(); ctx.moveTo(cx - half, cy); ctx.lineTo(cx + half, cy); ctx.moveTo(cx, cy - half); ctx.lineTo(cx, cy + half); ctx.stroke();
    // Limit box at half scale.
    ctx.strokeStyle = tone; ctx.lineWidth = 2;
    ctx.strokeRect(cx - half / 2, cy - half / 2, half, half);
    const pin = (v: number, lim: number) => Math.max(-0.95, Math.min(0.95, (v / Math.max(0.01, lim)) * 0.5));
    const dx = pin(b.err.right, b.lim.right) * half, dy = -pin(b.err.up, b.lim.up) * half;
    ctx.fillStyle = th.symHi; ctx.shadowColor = th.symHi; ctx.shadowBlur = 6;
    ctx.beginPath(); ctx.arc(cx + dx, cy + dy, Math.max(3, size * 0.035), 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    // Fore/aft bar: forward up, target at the centre, limit ticks at half scale.
    const bx = Math.min(w - 14, cx + half + Math.max(18, (w - (cx + half)) / 2)), bw = 8;
    ctx.strokeStyle = th.screenLine; ctx.lineWidth = 1;
    ctx.strokeRect(bx - bw / 2, cy - half, bw, size);
    ctx.strokeStyle = tone; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(bx - bw, cy - half / 2); ctx.lineTo(bx + bw, cy - half / 2); ctx.moveTo(bx - bw, cy + half / 2); ctx.lineTo(bx + bw, cy + half / 2); ctx.stroke();
    ctx.strokeStyle = alpha(th.sym, 0.6); ctx.beginPath(); ctx.moveTo(bx - bw, cy); ctx.lineTo(bx + bw, cy); ctx.stroke();
    const ay = cy + pin(b.err.aft, b.lim.aft) * half;
    ctx.fillStyle = th.symHi;
    ctx.beginPath(); ctx.moveTo(bx - bw - 2, ay); ctx.lineTo(bx - bw - 9, ay - 5); ctx.lineTo(bx - bw - 9, ay + 5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = th.symDim; ctx.textAlign = 'center';
    ctx.fillText('FWD', bx, 5);
    // Numbers.
    ctx.textBaseline = 'bottom'; ctx.textAlign = 'left'; ctx.fillStyle = b.inside ? th.ok : th.sym;
    ctx.fillText(`R${fmt(b.err.right)} U${fmt(b.err.up)} A${fmt(b.err.aft)}`, 6, h - 4);
  }

  dispose(): void { this.s.dispose(); }
}

/**
 * Hose-band gauge (UPAZ, IL-78M): the hose from the pod (top) to full trail (bottom) with the colour bands by
 * cone-to-pod distance, the band limits, and the basket marker while connected. Boom tankers: elevation against
 * azimuth with the limit box and the nominal point, an extension bar, and the simplified cue words.
 */
export class AarGaugeDisplay {
  private readonly s: Surface;
  private last: { a: AarState | null; T: TankerData | null } = { a: null, T: null };
  constructor(canvas: HTMLCanvasElement) {
    this.s = new Surface(canvas);
    this.s.onResize = () => this.draw(this.last.a, this.last.T);
  }

  draw(a: AarState | null, T: TankerData | null): void {
    this.last = { a, T };
    const s = this.s;
    if (!s.begin()) return;
    const { ctx, w, h, theme: th } = s;
    ctx.fillStyle = th.screen; ctx.fillRect(0, 0, w, h);
    const fs = Math.max(9, Math.round(Math.min(w / 14, h / 13)));
    ctx.font = `${fs}px ${th.fontMono}`;
    const col = (k: 'caution' | 'ok' | 'warning') => (k === 'caution' ? th.caution : k === 'ok' ? th.ok : th.warning);
    if (T?.drogue) {
      const g = T.drogue, trail = g.trailM.value;
      const top = fs + 10, bottom = h - fs - 10;
      const y = (m: number) => top + (Math.max(0, Math.min(trail, m)) / trail) * (bottom - top);
      const hx = w * 0.42, hw = Math.max(10, w * 0.12);
      ctx.textBaseline = 'top'; ctx.textAlign = 'left'; ctx.fillStyle = th.symDim;
      ctx.fillText('POD', 6, 4);
      // Plain hose, then the bands.
      ctx.fillStyle = th.screenLine; ctx.fillRect(hx - hw / 2, top, hw, bottom - top);
      for (const b of g.bands.value) {
        const stripes = bandStripes(b.band);
        const y0 = y(b.from), y1 = y(b.to);
        stripes.forEach((k, i) => { ctx.fillStyle = col(k); ctx.fillRect(hx - hw / 2 + (i * hw) / stripes.length, y0, hw / stripes.length, y1 - y0); });
        ctx.fillStyle = th.symDim; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.fillText(String(b.from), hx - hw / 2 - 5, y0);
      }
      ctx.textAlign = 'right'; ctx.fillText(String(trail), hx - hw / 2 - 5, y(trail));
      // Basket marker at the cone-to-pod distance.
      const d = a?.connected ? a.coneToPodM : null;
      if (d !== null && d !== undefined) {
        const my = y(d);
        ctx.fillStyle = th.symHi; ctx.shadowColor = th.symHi; ctx.shadowBlur = 6;
        ctx.beginPath(); ctx.moveTo(hx + hw / 2 + 3, my); ctx.lineTo(hx + hw / 2 + 13, my - 6); ctx.lineTo(hx + hw / 2 + 13, my + 6); ctx.closePath(); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.textAlign = 'left'; ctx.fillText(`${d.toFixed(1)} m`, hx + hw / 2 + 16, my);
      }
      ctx.textBaseline = 'bottom'; ctx.textAlign = 'left';
      const band = a?.connected ? a.hoseBand : null;
      ctx.fillStyle = band ? col(bandStripes(band)[band === 'greenRed' ? 1 : 0]!) : th.symDim;
      ctx.fillText(band ? BAND_LABEL[band].toUpperCase() : a?.connected ? '—' : 'NOT IN CONTACT', 6, h - 4);
      return;
    }
    if (T?.boom) {
      const L = T.boom.limits.value, n = T.boom.nominal;
      const b = a?.boom;
      const top = fs + 12, bottom = h - fs * 2 - 12;
      const pw = w * 0.66, left = 8;
      const eMin = L.elevDeg[0] - 5, eMax = L.elevDeg[1] + 5, az = L.azDeg + 5;
      const px = (deg: number) => left + ((Math.max(-az, Math.min(az, deg)) + az) / (2 * az)) * pw;
      const py = (deg: number) => top + ((Math.max(eMin, Math.min(eMax, deg)) - eMin) / (eMax - eMin)) * (bottom - top);
      ctx.textBaseline = 'top'; ctx.textAlign = 'left'; ctx.fillStyle = th.symDim;
      ctx.fillText('BOOM', 6, 4);
      ctx.strokeStyle = th.screenLine; ctx.lineWidth = 1;
      ctx.strokeRect(left, top, pw, bottom - top);
      ctx.strokeStyle = b?.inLimits === false ? th.warning : th.ok; ctx.lineWidth = 2;
      ctx.strokeRect(px(-L.azDeg), py(L.elevDeg[0]), px(L.azDeg) - px(-L.azDeg), py(L.elevDeg[1]) - py(L.elevDeg[0]));
      ctx.strokeStyle = alpha(th.sym, 0.7); ctx.lineWidth = 1;
      const nx = px(0), ny = py(n.elevDeg);
      ctx.beginPath(); ctx.moveTo(nx - 6, ny); ctx.lineTo(nx + 6, ny); ctx.moveTo(nx, ny - 6); ctx.lineTo(nx, ny + 6); ctx.stroke();
      if (b && a?.connected) {
        ctx.fillStyle = th.symHi; ctx.beginPath(); ctx.arc(px(b.azDeg), py(b.elevDeg), 4, 0, Math.PI * 2); ctx.fill();
      }
      // Extension bar.
      const ex = left + pw + Math.max(14, (w - left - pw) / 2), eH = bottom - top;
      const ey = (m: number) => bottom - ((m - (L.extM[0] - 2)) / (L.extM[1] - L.extM[0] + 4)) * eH;
      ctx.strokeStyle = th.screenLine; ctx.strokeRect(ex - 4, top, 8, eH);
      ctx.strokeStyle = th.ok; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ex - 8, ey(L.extM[0])); ctx.lineTo(ex + 8, ey(L.extM[0])); ctx.moveTo(ex - 8, ey(L.extM[1])); ctx.lineTo(ex + 8, ey(L.extM[1])); ctx.stroke();
      if (b && a?.connected) { ctx.fillStyle = th.symHi; ctx.fillRect(ex - 6, ey(b.extM) - 2, 12, 4); }
      ctx.textAlign = 'center'; ctx.fillStyle = th.symDim; ctx.fillText('EXT', ex, 4);
      ctx.textBaseline = 'bottom'; ctx.textAlign = 'left';
      ctx.fillStyle = a?.connected ? (b?.inLimits ? th.ok : th.warning) : th.sym;
      ctx.fillText(a?.connected ? boomCueText(a) : a?.cleared ? 'CLEARED CONTACT' : 'STABILISE', 6, h - fs - 8);
      ctx.fillStyle = th.symDim;
      ctx.fillText('SIMPLIFIED CUES', 6, h - 4);
      return;
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = th.symDim;
    ctx.fillText('PLAIN HOSE', w / 2, h / 2);
  }

  dispose(): void { this.s.dispose(); }
}
