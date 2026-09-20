/**
 * [OWNER: displays] Symbol glyphs shared by the radar and RWR renderers. All sizes are CSS px;
 * colour, glow and line width are whatever the caller set on the Gfx.
 */
import type { Gfx } from './surface';
import type { EntityId } from '../../sim/types';

/** Five-point star (F-15C PDT, Hornet L&S). */
export function star(g: Gfx, x: number, y: number, r: number, fill = false): void {
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.42;
    pts.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.poly(pts, true, fill);
}

/** Asterisk-style star (six strokes), as the F-15C VSD draws the PDT. */
export function asterisk(g: Gfx, x: number, y: number, r: number): void {
  const s: number[] = [];
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI) / 3;
    s.push(x + Math.sin(a) * r, y - Math.cos(a) * r, x - Math.sin(a) * r, y + Math.cos(a) * r);
  }
  g.segs(s);
}

export function diamond(g: Gfx, x: number, y: number, r: number, fill = false): void {
  g.poly([x, y - r, x + r, y, x, y + r, x - r, y], true, fill);
}

export function cross(g: Gfx, x: number, y: number, r: number): void {
  g.segs([x - r, y, x + r, y, x, y - r, x, y + r]);
}

export function xMark(g: Gfx, x: number, y: number, r: number): void {
  g.segs([x - r, y - r, x + r, y + r, x - r, y + r, x + r, y - r]);
}

/** Horizontal brick centred at x,y. */
export function brick(g: Gfx, x: number, y: number, w: number, h: number, fill = true): void {
  g.rect(x - w / 2, y - h / 2, w, h, fill);
}

/** Line from (x,y) in screen direction `ang` (rad clockwise from up), length len, starting `from` px out. */
export function stick(g: Gfx, x: number, y: number, ang: number, len: number, from = 0): void {
  const sx = Math.sin(ang), sy = -Math.cos(ang);
  g.line(x + sx * from, y + sy * from, x + sx * (from + len), y + sy * (from + len));
}

/** Airborne "hat" (chevron) above a symbol. */
export function hat(g: Gfx, x: number, y: number, w: number, h: number): void {
  g.poly([x - w / 2, y + h / 2, x, y - h / 2, x + w / 2, y + h / 2], false);
}

/** Small V caret pointing down (tip at x,y). */
export function caretDown(g: Gfx, x: number, y: number, s: number): void {
  g.poly([x - s * 0.6, y - s, x, y, x + s * 0.6, y - s], false);
}

/** Caret pointing left (tip at x,y). */
export function caretLeft(g: Gfx, x: number, y: number, s: number): void {
  g.poly([x + s, y - s * 0.6, x, y, x + s, y + s * 0.6], false);
}

/** Caret pointing right (tip at x,y). */
export function caretRight(g: Gfx, x: number, y: number, s: number): void {
  g.poly([x - s, y - s * 0.6, x, y, x - s, y + s * 0.6], false);
}

/** Solid triangle pointing up with its tip at x,y (fly-out "pyramid", Raero mark). */
export function triUp(g: Gfx, x: number, y: number, s: number, fill = true): void {
  g.poly([x, y, x + s * 0.62, y + s, x - s * 0.62, y + s], true, fill);
}

/** Tiny missile icon, nose to the right, centred. */
export function missileIcon(g: Gfx, x: number, y: number, len: number): void {
  const h = len * 0.18;
  g.segs([
    x - len / 2, y, x + len / 2, y,
    x - len / 2, y - h, x - len / 2 + h * 1.4, y,
    x - len / 2, y + h, x - len / 2 + h * 1.4, y,
  ]);
}

/**
 * Tracks when each missile was first seen, to draw fly-out progress without a launch time in the
 * picture. Feed it every frame with the missiles present; forgotten missiles are pruned.
 */
export class MissileClock {
  private m = new Map<EntityId, { t0: number; seen: number }>();
  private lastT = -Infinity;

  /** Call once per frame before `progress`. `t` = picture/sim time. */
  frame(t: number): void {
    if (t < this.lastT - 1) this.m.clear(); // time went backwards (replay / restart)
    this.lastT = t;
  }

  /** Fraction of the flight done (0 launch .. 1 impact), from first sighting and time to impact. */
  progress(id: EntityId, t: number, tti: number | null): number {
    let e = this.m.get(id);
    if (!e) { e = { t0: t, seen: t }; this.m.set(id, e); }
    e.seen = t;
    const el = t - e.t0;
    if (tti == null || !isFinite(tti)) return Math.min(0.95, el / (el + 30));
    const tot = el + Math.max(0, tti);
    return tot > 0 ? Math.max(0, Math.min(1, el / tot)) : 1;
  }

  /** Seconds since the missile was first seen. */
  elapsed(id: EntityId, t: number): number {
    const e = this.m.get(id);
    return e ? t - e.t0 : 0;
  }

  /** Drop missiles not seen for `keep` seconds. */
  prune(t: number, keep = 2): void {
    for (const [k, e] of this.m) if (t - e.seen > keep) this.m.delete(k);
  }
}
