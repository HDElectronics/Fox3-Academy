/**
 * [OWNER: displays] RwrDisplay: draws RwrContact[] in the jet's RWR, reading symbols and kind from
 * RWRS (src/data/rwr.ts). 'spo15' is the SPO-15 lamp panel; every other RWR is a round scope.
 * Crisp at devicePixelRatio, resize-aware, pickContact(x, y) -> emitter id.
 */
import type { RwrId, RwrSpec } from '../../data/types';
import { RWRS } from '../../data/rwr';
import type { EntityId, RwrContact } from '../../sim/types';
import { Gfx, Surface, nowS } from './surface';
import { hitTest, rwrPriority, type HitItem } from './geometry';
import type { RwrFrame } from './rwr/common';
import { drawSpo15 } from './rwr/spo15';
import { drawScope } from './rwr/scope';

export interface RwrDisplayOptions {
  rwr: RwrId;
  /** Glow strength multiplier, 0 = off. Default 1. */
  glow?: number;
  /** Seconds a new threat keeps its "new" mark. Default 2.5. */
  newThreatS?: number;
  /**
   * Emitter id to mark with an amber (--sym-hi) ring on the display (e.g. a quiz answer). On the SPO-15
   * every lamp that contact lights gets the ring. Trainer overlay, not cockpit symbology. Default null.
   */
  highlight?: EntityId | null;
}

export class RwrDisplay {
  readonly canvas: HTMLCanvasElement;
  private surf: Surface;
  private gfx: Gfx;
  private opts: Required<RwrDisplayOptions>;
  private hits: HitItem[] = [];
  private last: { contacts: readonly RwrContact[]; t: number } | null = null;
  lastDrawMs = 0;

  constructor(canvas: HTMLCanvasElement, options: RwrDisplayOptions) {
    this.canvas = canvas;
    this.surf = new Surface(canvas);
    this.gfx = new Gfx(this.surf.ctx, this.surf.theme);
    this.opts = { glow: 1, newThreatS: 2.5, highlight: null, ...options };
    if (!canvas.hasAttribute('role')) canvas.setAttribute('role', 'img');
    if (!canvas.hasAttribute('aria-label')) canvas.setAttribute('aria-label', `${RWRS[options.rwr].name} display`);
    this.surf.onResize = () => this.redraw();
  }

  /** The RWR spec being drawn (from RWRS). */
  get spec(): RwrSpec {
    return RWRS[this.opts.rwr];
  }

  setOptions(options: Partial<RwrDisplayOptions>): void {
    this.opts = { ...this.opts, ...options };
    this.redraw();
  }

  /** Mark one contact with an amber ring (null clears). Same as setOptions({ highlight }). */
  setHighlight(id: EntityId | null): void {
    if (this.opts.highlight === id) return;
    this.opts.highlight = id;
    this.redraw();
  }

  refreshTheme(): void {
    this.surf.refreshTheme();
    this.redraw();
  }

  /** Draw the contacts. `t` = sim time (new-threat marks and history age use it). */
  draw(contacts: readonly RwrContact[], t: number): void {
    this.last = { contacts, t };
    const t0 = nowS();
    this.render(contacts, t);
    this.lastDrawMs = (nowS() - t0) * 1000;
  }

  redraw(): void {
    if (this.last) this.render(this.last.contacts, this.last.t);
    else this.render([], 0);
  }

  /** Emitter id of the symbol / lit lamp under a client point, or null. */
  pickContact(clientX: number, clientY: number, slopPx = 0): EntityId | null {
    const p = this.surf.toLocal(clientX, clientY);
    return hitTest(this.hits, p.x, p.y, slopPx)?.id ?? null;
  }

  dispose(): void {
    this.surf.dispose();
    this.hits = [];
    this.last = null;
  }

  private render(contacts: readonly RwrContact[], t: number): void {
    const s = this.surf;
    if (!s.begin()) return;
    const th = s.theme;
    const W = s.w, H = s.h, S = Math.min(W, H);
    const u = S / 100;
    this.gfx.setup(s.dpr, u, this.opts.glow, th);
    this.gfx.reset();
    s.ctx.fillStyle = th.screen2 || '#000';
    s.ctx.fillRect(0, 0, W, H);
    this.hits = [];
    const spec = RWRS[this.opts.rwr];
    const f: RwrFrame = {
      g: this.gfx, th, S, ox: (W - S) / 2, oy: (H - S) / 2, u, spec, ranked: rwrPriority(contacts), t, now: nowS(),
      hits: this.hits, newS: this.opts.newThreatS,
    };
    if (spec.kind === 'lamps') drawSpo15(f);
    else drawScope(f);
    const hl = this.opts.highlight;
    if (hl) {
      // Trainer highlight: an amber ring around every symbol / lamp this emitter lights.
      const g = this.gfx;
      g.ink(th.symHi, 1.2, 0.45);
      g.dash([1.6, 0.9]);
      for (const it of this.hits) {
        if (it.id !== hl) continue;
        g.circle(it.x, it.y, it.kind === 'contact' ? 6.8 * u : it.r + 1.4 * u);
      }
      g.dash(null);
    }
    this.gfx.reset();
  }
}
