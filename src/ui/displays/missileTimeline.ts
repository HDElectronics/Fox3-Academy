/**
 * [OWNER: displays] MissileTimeline: one row per missile in flight on a shared "seconds from now"
 * axis: the guided-by-you phase (datalink / inertial / SARH) up to the pitbull tick 'A', the active
 * phase up to impact 'T'. Feed it picture.missilesInFlight every frame.
 */
import type { MissileGuidance, EntityId } from '../../sim/types';
import { Gfx, Surface, blinkOn } from './surface';
import { niceCeil, secs } from './geometry';

export interface TimelineMissile {
  missileId: EntityId;
  label: string;
  targetLabel?: string;
  guidance: MissileGuidance;
  timeToActive: number | null;
  timeToImpact: number | null;
}

export interface MissileTimelineOptions {
  /** Minimum axis length in seconds. Default 30. */
  minHorizonS?: number;
  /** Rows drawn at most (the most imminent first). Default: as many as fit. */
  maxRows?: number;
  glow?: number;
  /** Text when there is nothing in the air. Default 'NO MISSILES IN FLIGHT'. */
  emptyText?: string;
}

const GUIDE_TAG: Record<MissileGuidance, string> = {
  datalink: 'DL', inertial: 'INS', active: 'ACT', sarh: 'SARH', ir: 'IR', ballistic: 'BAL',
};

export class MissileTimeline {
  readonly canvas: HTMLCanvasElement;
  private surf: Surface;
  private g: Gfx;
  private o: Required<Omit<MissileTimelineOptions, 'maxRows'>> & { maxRows: number | null };
  private last: { ms: readonly TimelineMissile[]; t: number } | null = null;

  constructor(canvas: HTMLCanvasElement, options: MissileTimelineOptions = {}) {
    this.canvas = canvas;
    this.surf = new Surface(canvas);
    this.g = new Gfx(this.surf.ctx, this.surf.theme);
    this.o = { minHorizonS: 30, glow: 1, emptyText: 'NO MISSILES IN FLIGHT', ...options, maxRows: options.maxRows ?? null };
    this.surf.onResize = () => this.redraw();
  }

  setOptions(options: Partial<MissileTimelineOptions>): void {
    this.o = { ...this.o, ...options, maxRows: options.maxRows ?? this.o.maxRows };
    this.redraw();
  }

  refreshTheme(): void {
    this.surf.refreshTheme();
    this.redraw();
  }

  draw(missiles: readonly TimelineMissile[], t: number): void {
    this.last = { ms: missiles, t };
    this.render();
  }

  redraw(): void {
    this.render();
  }

  dispose(): void {
    this.surf.dispose();
    this.last = null;
  }

  private render(): void {
    const s = this.surf;
    if (!s.begin()) return;
    const th = s.theme, g = this.g, ctx = s.ctx;
    const W = s.w, H = s.h;
    const k = Math.max(0.85, Math.min(1.5, W / 420));
    g.setup(s.dpr, k, this.o.glow, th);
    g.reset();
    ctx.fillStyle = th.screen;
    ctx.fillRect(0, 0, W, H);
    const ms = [...(this.last?.ms ?? [])].sort((a, b) => (a.timeToImpact ?? 1e9) - (b.timeToImpact ?? 1e9));
    const axisY = 12 * k, rowH = 20 * k;
    const labelW = Math.min(W * 0.34, 118 * k);
    const x0 = labelW + 8 * k, x1 = W - 10 * k;
    const fit = Math.max(1, Math.floor((H - axisY - 6 * k) / rowH));
    const rows = ms.slice(0, this.o.maxRows ?? fit);
    const longest = Math.max(this.o.minHorizonS, ...rows.map(m => m.timeToImpact ?? 0));
    const horizon = longest <= 60 ? niceCeil(longest) : Math.ceil(longest / 20) * 20;
    const X = (sec: number) => x0 + (x1 - x0) * Math.max(0, Math.min(1, sec / horizon));

    // Axis: seconds from now.
    g.ink(th.symDim, 0, 1, 1);
    g.font(9, 400, 8);
    const step = niceCeil(horizon / 6);
    const tk: number[] = [];
    for (let v = 0; v <= horizon + 1e-6; v += step) { const x = X(v); tk.push(x, axisY + 3 * k, x, H - 2 * k); g.text(v === 0 ? 'NOW' : `${v}s`, x, axisY - 2 * k, v === 0 ? 'left' : 'center'); }
    g.ink(th.screenLine, 0, 1, 1);
    g.segs(tk);

    if (!rows.length) {
      g.ink(th.symDim, 0, 1, 1);
      g.font(10, 400, 8);
      g.text(this.o.emptyText, (x0 + x1) / 2, axisY + (H - axisY) / 2);
      g.reset();
      return;
    }

    rows.forEach((m, i) => {
      const y = axisY + 6 * k + rowH * i + rowH / 2;
      const tti = m.timeToImpact;
      const tta = m.timeToActive;
      const act = m.guidance === 'active' || (tta != null && tta <= 0);
      const arh = tta != null || m.guidance === 'datalink' || m.guidance === 'inertial' || m.guidance === 'active';
      // Label: missile -> target, guidance tag.
      g.ink(th.sym, 0.5, 1, 1);
      g.font(10, 700, 8);
      g.text(`${m.label}${m.targetLabel ? ' > ' + m.targetLabel : ''}`, 6 * k, y - 3.5 * k, 'left');
      g.font(8.5, 400, 7.5);
      const tag = GUIDE_TAG[m.guidance];
      const warnTag = m.guidance === 'inertial';
      g.ink(warnTag ? th.caution : th.symDim, warnTag ? 0.8 : 0, 1, 1);
      g.text(tag, 6 * k, y + 5.5 * k, 'left');
      if (tti == null) return;
      const xe = X(tti);
      // Supported phase (you guide it) dashed; active / terminal phase solid.
      if (arh && !act && tta != null) {
        const xa = X(tta);
        g.ink(th.sym, 0.4, 1.4, 0.8).dash([3, 2.5]);
        g.line(x0, y, xa, y);
        g.dash(null);
        g.ink(th.sym, 1, 2.6, 1);
        g.line(xa, y, xe, y);
        g.ink(th.symHi, 1, 1.2, 1);
        g.line(xa, y - 5 * k, xa, y + 5 * k);
        g.font(9, 700, 8);
        g.text(`A ${secs(tta)}`, xa, y - 9.5 * k < axisY + 4 * k ? y + 9.5 * k : y - 8.5 * k);
      } else {
        const sarh = m.guidance === 'sarh';
        g.ink(sarh ? th.caution : th.sym, 1, 2.6, 1);
        if (sarh) g.dash([6, 3]);
        g.line(x0, y, xe, y);
        g.dash(null);
      }
      // Impact end.
      const on = tti > 5 || blinkOn(3, undefined, 0.6);
      g.ink(th.sym, on ? 1.2 : 0.3, 1.2, on ? 1 : 0.4);
      g.line(xe, y - 5 * k, xe, y + 5 * k);
      g.font(9, 700, 8);
      const tx = `T ${secs(tti)}`;
      const tw = g.measure(tx);
      g.text(tx, Math.min(xe + 3 * k, W - tw - 2 * k), y, 'left');
    });
    g.reset();
  }
}
