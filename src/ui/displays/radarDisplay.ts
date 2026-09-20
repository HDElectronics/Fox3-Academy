/**
 * [OWNER: displays] RadarDisplay: draws a RadarPicture on a canvas in the jet's cockpit format
 * ('ru-hud', 'f15-vsd', 'mfd', 'tid', 'vtb'), crisp at devicePixelRatio, resize-aware, with
 * hit-testing (click -> target id) and screen -> radar coordinates for cursor slewing.
 * It only draws what the picture says the radar knows; targetId is used for picking only.
 */
import type { AircraftId, DisplayFormat } from '../../data/types';
import type { EntityId, RadarPicture } from '../../sim/types';
import { Gfx, Surface, nowS } from './surface';
import { MissileClock } from './glyphs';
import { hitTest, type HitItem, type Units } from './geometry';
import type { FormatRenderer, FrameCtx, Mapping, RadarDisplayOptions, ResolvedOptions } from './radar/common';
import { drawF15Vsd } from './radar/f15Vsd';
import { drawMfd } from './radar/mfd';
import { drawRuHud } from './radar/ruHud';
import { drawTid } from './radar/tid';
import { drawVtb } from './radar/vtb';
import { drawOff } from './radar/off';

export type { RadarDisplayOptions } from './radar/common';

const RENDERERS: Record<DisplayFormat, FormatRenderer> = {
  'ru-hud': drawRuHud,
  'f15-vsd': drawF15Vsd,
  mfd: drawMfd,
  tid: drawTid,
  vtb: drawVtb,
};

export interface RadarDrawExtra {
  /** Own true heading (rad). Needed for TID ground-stabilised mode and heading readouts. */
  ownHeading?: number;
}

export interface RadarPick {
  targetId: EntityId;
  kind: 'track' | 'brick' | 'stt';
}

export class RadarDisplay {
  readonly canvas: HTMLCanvasElement;
  private surf: Surface;
  private gfx: Gfx;
  private opts: ResolvedOptions;
  private clock = new MissileClock();
  private hits: HitItem[] = [];
  private mapping: Mapping | null = null;
  private last: { pic: RadarPicture | null; extra: RadarDrawExtra | undefined } | null = null;
  /** Milliseconds the last draw() took (for performance checks). */
  lastDrawMs = 0;

  constructor(canvas: HTMLCanvasElement, options: RadarDisplayOptions) {
    this.canvas = canvas;
    this.surf = new Surface(canvas);
    this.gfx = new Gfx(this.surf.ctx, this.surf.theme);
    this.opts = resolve(options);
    if (!canvas.hasAttribute('role')) canvas.setAttribute('role', 'img');
    if (!canvas.hasAttribute('aria-label')) canvas.setAttribute('aria-label', 'Radar display');
    this.surf.onResize = () => this.redraw();
  }

  /** Change options (format, units, wording, TID stabilisation, glow) and redraw. */
  setOptions(options: Partial<RadarDisplayOptions>): void {
    this.opts = resolve({ ...this.optionsAsInput(), ...options });
    this.redraw();
  }

  get format(): DisplayFormat {
    return this.opts.format;
  }

  /** Re-read design tokens after the cockpit skin changes, then redraw. */
  refreshTheme(): void {
    this.surf.refreshTheme();
    this.redraw();
  }

  /** Draw one frame. Pass null when there is no picture (radar off / own jet dead). */
  draw(picture: RadarPicture | null, extra?: RadarDrawExtra): void {
    this.last = { pic: picture, extra };
    const t0 = nowS();
    this.render(picture, extra);
    this.lastDrawMs = (nowS() - t0) * 1000;
  }

  /** Redraw the last picture (after a resize or font load). Before the first draw it shows empty glass. */
  redraw(): void {
    if (this.last) this.render(this.last.pic, this.last.extra);
    else this.render(null, undefined);
  }

  /**
   * Target under a client (mouse/touch) point: the locked target first, then tracks, then bricks.
   * `slopPx` widens the hit radius (use ~10 for touch).
   */
  pick(clientX: number, clientY: number, slopPx = 0): EntityId | null {
    return this.pickDetail(clientX, clientY, slopPx)?.targetId ?? null;
  }

  pickDetail(clientX: number, clientY: number, slopPx = 0): RadarPick | null {
    const p = this.surf.toLocal(clientX, clientY);
    const h = hitTest(this.hits, p.x, p.y, slopPx);
    if (!h) return null;
    return { targetId: h.id, kind: kindOf(h) };
  }

  /**
   * Everything pickable in the last frame, left to right (for keyboard cycling of designations).
   * x, y are CSS px inside the canvas.
   */
  pickables(): (RadarPick & { x: number; y: number })[] {
    const seen = new Set<EntityId>();
    return [...this.hits]
      .sort((a, b) => a.prio - b.prio || a.x - b.x)
      .filter(h => (seen.has(h.id) ? false : (seen.add(h.id), true)))
      .sort((a, b) => a.x - b.x)
      .map(h => ({ targetId: h.id, kind: kindOf(h), x: h.x, y: h.y }));
  }

  /** Radar coordinates (az rad rel nose, range m) under a client point, or null outside the plot. For cursor slewing. */
  toRadar(clientX: number, clientY: number): { az: number; range: number } | null {
    if (!this.mapping) return null;
    const p = this.surf.toLocal(clientX, clientY);
    return this.mapping.toRadar(p.x, p.y);
  }

  /** Screen position (CSS px inside the canvas) of a radar point, for overlays. */
  toScreen(az: number, range: number): { x: number; y: number } | null {
    return this.mapping ? this.mapping.toScreen(az, range) : null;
  }

  dispose(): void {
    this.surf.dispose();
    this.hits = [];
    this.mapping = null;
    this.last = null;
  }

  private optionsAsInput(): RadarDisplayOptions {
    const o = this.opts;
    return {
      format: o.format, units: o.units ?? undefined, aircraft: o.aircraft ?? undefined, nonFriendly: o.nonFriendly,
      tidStab: o.tidStab, manualCursor: o.manualCursor, glow: o.glow, color: o.color ?? undefined,
    };
  }

  private render(pic: RadarPicture | null, extra: RadarDrawExtra | undefined): void {
    const s = this.surf;
    if (!s.begin()) return;
    const th = s.theme;
    const ctx = s.ctx;
    const W = s.w, H = s.h;
    const S = Math.min(W, H);
    const ox = (W - S) / 2, oy = (H - S) / 2;
    const u = S / 100;
    this.gfx.setup(s.dpr, u, this.opts.glow, th);
    this.gfx.reset();
    ctx.fillStyle = th.screen || '#000';
    ctx.fillRect(0, 0, W, H);
    this.hits = [];
    const units: Units = this.opts.units ?? pic?.units ?? 'imperial';
    const aircraft: AircraftId = this.opts.aircraft ?? pic?.aircraftType ?? 'f15c';
    const f: Omit<FrameCtx, 'pic'> = {
      g: this.gfx, th, S, ox, oy, u, W, H, units, aircraft, opts: this.opts, now: nowS(), hits: this.hits,
      clock: this.clock, ownHeading: extra?.ownHeading ?? pic?.ownHeading ?? null,
    };
    if (!pic || pic.mode === 'off') {
      this.mapping = null;
      drawOff(f, this.opts.format, pic);
    } else {
      this.clock.frame(pic.t);
      this.mapping = RENDERERS[this.opts.format]({ ...f, pic });
      this.clock.prune(pic.t);
    }
    this.gfx.reset();
  }
}

const kindOf = (h: HitItem): RadarPick['kind'] => (h.kind === 'stt' ? 'stt' : h.kind === 'brick' ? 'brick' : 'track');

function resolve(o: RadarDisplayOptions): ResolvedOptions {
  return {
    format: o.format,
    units: o.units ?? null,
    aircraft: o.aircraft ?? null,
    nonFriendly: o.nonFriendly ?? 'unknown',
    tidStab: o.tidStab ?? 'aircraft',
    glow: o.glow ?? 1,
    color: o.color ?? null,
    manualCursor: o.manualCursor ?? false,
  };
}
