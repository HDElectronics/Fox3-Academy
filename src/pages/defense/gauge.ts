/**
 * [OWNER: page-defense] Doppler gate gauge: your radial speed against the shooter's radar and against the
 * missile seeker, each with its notch gate as a band. "Keep the needle in the gate." Canvas 2D, black
 * glass, phosphor symbology, colours from readTheme(). Page-local (the displays kit has no such gauge).
 */
import { readTheme, alpha, type Theme } from '../../ui/theme';
import type { GateRead } from './gates';
import { MPS_PER_KT } from '../../sim/math';

export interface GaugeRow {
  /** Left title, e.g. 'RADAR  N001'. */
  title: string;
  /** Right status, e.g. 'LOCK'. */
  status: string;
  read: GateRead;
  /** The sensor is not looking at you (dim everything). */
  dim: boolean;
  /** Time held in the gate against what it takes (seeker drop / lock break). */
  hold: { t: number; need: number; label: string } | null;
  /** Extra line under the bar (look-up, chaff state). */
  note: string;
  /** Note is good news (lit) rather than a plain remark. */
  noteLit?: boolean;
}

export class DopplerGauge {
  private ctx: CanvasRenderingContext2D | null;
  private theme: Theme;
  private ro: ResizeObserver | null = null;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private last: GaugeRow[] = [];

  constructor(private canvas: HTMLCanvasElement, private units: 'metric' | 'imperial') {
    this.ctx = canvas.getContext('2d');
    this.theme = readTheme();
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Doppler gate gauge: your radial speed against the notch gate of his radar and of the missile seeker');
    if (typeof ResizeObserver === 'function') {
      this.ro = new ResizeObserver(() => { this.fit(); this.render(); });
      this.ro.observe(canvas);
    }
    this.fit();
  }

  private fit(): void {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(3, window.devicePixelRatio || 1);
    this.w = Math.max(1, Math.round(r.width));
    this.h = Math.max(1, Math.round(r.height));
    const W = Math.round(this.w * this.dpr), H = Math.round(this.h * this.dpr);
    if (this.canvas.width !== W) this.canvas.width = W;
    if (this.canvas.height !== H) this.canvas.height = H;
  }

  /** Speed in display units (kt or km/h). */
  private sp(mps: number): number { return this.units === 'metric' ? mps * 3.6 : mps / MPS_PER_KT; }
  private get unit(): string { return this.units === 'metric' ? 'km/h' : 'kt'; }
  private get scaleMax(): number { return this.units === 'metric' ? 600 : 300; }
  private get tickStep(): number { return this.units === 'metric' ? 100 : 50; }

  draw(rows: GaugeRow[]): void {
    this.last = rows;
    this.render();
  }

  private render(): void {
    const c = this.ctx;
    if (!c || this.w < 20 || this.h < 20) return;
    const T = this.theme;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.w, this.h);
    c.fillStyle = T.screen;
    c.fillRect(0, 0, this.w, this.h);
    const rows = this.last;
    if (!rows.length) return;
    const pad = 10;
    const rowH = (this.h - pad) / rows.length;
    rows.forEach((r, i) => this.row(c, r, pad, pad / 2 + i * rowH, this.w - 2 * pad, rowH));
  }

  private row(c: CanvasRenderingContext2D, r: GaugeRow, x: number, y: number, w: number, h: number): void {
    const T = this.theme;
    const mono = T.fontMono || 'monospace';
    const small = Math.max(9, Math.min(11, h * 0.11));
    const big = Math.max(10, Math.min(13, h * 0.13));
    const dimA = r.dim ? 0.45 : 1;
    const sym = alpha(T.sym, dimA);
    const symDim = alpha(T.symDim, dimA);
    const hi = T.symHi;

    // Title row.
    c.textBaseline = 'top';
    c.font = `${big}px ${mono}`;
    c.fillStyle = sym;
    c.textAlign = 'left';
    c.fillText(r.title, x, y + 2);
    c.textAlign = 'right';
    c.fillStyle = r.read.inGate && r.read.on ? hi : sym;
    c.fillText(r.status, x + w, y + 2);

    // Bar geometry.
    const barY = y + big + 14;
    const barH = Math.max(12, Math.min(22, h * 0.17));
    const max = this.scaleMax;
    const X = (v: number) => x + w / 2 + (Math.max(-max, Math.min(max, v)) / max) * (w / 2);

    // Gate band.
    const g = this.sp(r.read.gate);
    const gx0 = X(-g), gx1 = X(g);
    if (r.read.gate > 0) {
      if (r.read.applies) {
        c.fillStyle = alpha(r.read.inGate && r.read.on ? T.symHi : T.sym, r.dim ? 0.1 : 0.2);
        c.fillRect(gx0, barY, gx1 - gx0, barH);
      } else {
        // Gate does not apply (look-up): hatched outline.
        c.save();
        c.beginPath(); c.rect(gx0, barY, gx1 - gx0, barH); c.clip();
        c.strokeStyle = alpha(T.symDim, 0.8); c.lineWidth = 1;
        for (let k = gx0 - barH; k < gx1; k += 6) { c.beginPath(); c.moveTo(k, barY + barH); c.lineTo(k + barH, barY); c.stroke(); }
        c.restore();
      }
      c.strokeStyle = r.read.applies ? sym : symDim;
      c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(gx0, barY - 3); c.lineTo(gx0, barY + barH + 3); c.moveTo(gx1, barY - 3); c.lineTo(gx1, barY + barH + 3); c.stroke();
    }

    // Scale: baseline, ticks, labels.
    c.strokeStyle = symDim; c.lineWidth = 1;
    c.beginPath(); c.moveTo(x, barY + barH); c.lineTo(x + w, barY + barH); c.stroke();
    c.font = `${small}px ${mono}`;
    c.fillStyle = symDim;
    c.textAlign = 'center';
    const step = this.tickStep;
    for (let v = -max; v <= max + 1e-6; v += step) {
      const tx = X(v);
      const major = Math.abs(v) % (step * 2) < 1e-6;
      c.beginPath(); c.moveTo(tx, barY + barH); c.lineTo(tx, barY + barH - (major ? 7 : 4)); c.stroke();
      if (major && Math.abs(v) <= max * 0.5 && w > 200) c.fillText(v === 0 ? '0' : String(Math.abs(v)), tx, barY + barH + 3);
    }
    c.textAlign = 'left'; c.fillText('◂ OPENING', x, barY + barH + 3);
    c.textAlign = 'right'; c.fillText('CLOSING ▸', x + w, barY + barH + 3);

    // Needle.
    const v = this.sp(r.read.radial);
    const nx = X(v);
    const inside = r.read.inGate;
    const needle = r.dim ? alpha(T.sym, 0.5) : inside ? hi : T.sym;
    c.save();
    if (!r.dim) { c.shadowColor = needle; c.shadowBlur = 6; }
    c.strokeStyle = needle; c.fillStyle = needle; c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(nx, barY - 2); c.lineTo(nx, barY + barH + 2); c.stroke();
    c.beginPath(); c.moveTo(nx, barY - 2); c.lineTo(nx - 6, barY - 10); c.lineTo(nx + 6, barY - 10); c.closePath(); c.fill();
    if (Math.abs(v) > this.scaleMax) {
      const dir = v > 0 ? 1 : -1;
      c.beginPath(); c.moveTo(nx + dir * 10, barY + barH / 2); c.lineTo(nx + dir * 3, barY + 2); c.lineTo(nx + dir * 3, barY + barH - 2); c.closePath(); c.fill();
    }
    c.restore();

    // Readout line: your radial speed and the gate; the hold timer goes on the right when it fits.
    const lineH = big + 4;
    let ry = barY + barH + small + 7;
    c.font = `${big}px ${mono}`;
    c.textAlign = 'left';
    c.fillStyle = r.dim ? symDim : inside ? hi : T.sym;
    const sign = v > 0.5 ? '+' : v < -0.5 ? '−' : '';
    const gateTxt = r.read.gate > 0 ? `  GATE ±${Math.round(g)}` : '';
    const readout = `${sign}${Math.round(Math.abs(v))} ${this.unit}${gateTxt}`;
    c.fillText(readout, x, ry);
    const leftW = c.measureText(readout).width;

    if (r.hold && !r.dim) {
      c.font = `${small}px ${mono}`;
      const k = Math.max(0, Math.min(1, r.hold.t / r.hold.need));
      const lw = c.measureText(r.hold.label).width;
      const bw = 56, bh = 6;
      let lx = x + w - bw - 8 - lw, hy = ry + 1;
      if (lx < x + leftW + 14) { ry += lineH; lx = x; hy = ry; }   // no room: its own line
      if (hy + small <= y + h) {
        c.textAlign = 'left';
        c.fillStyle = k > 0 ? hi : symDim;
        c.fillText(r.hold.label, lx, hy);
        const bx = lx + lw + 8;
        c.strokeStyle = symDim; c.lineWidth = 1; c.strokeRect(bx, hy + 2, bw, bh);
        c.fillStyle = k >= 1 ? hi : T.sym; c.fillRect(bx + 1, hy + 3, (bw - 2) * k, bh - 2);
      }
    }
    ry += lineH;

    // Note.
    if (r.note && y + h - ry >= small) {
      c.font = `${small}px ${mono}`;
      c.textAlign = 'left';
      c.fillStyle = r.noteLit ? hi : symDim;
      c.fillText(this.fit1(c, r.note, w), x, ry);
    }
  }

  /** Trim text to a width with an ellipsis. */
  private fit1(c: CanvasRenderingContext2D, s: string, w: number): string {
    if (c.measureText(s).width <= w) return s;
    let t = s;
    while (t.length > 4 && c.measureText(t + '…').width > w) t = t.slice(0, -1);
    return t + '…';
  }

  dispose(): void {
    this.ro?.disconnect();
    this.ro = null;
    this.ctx = null;
  }
}
