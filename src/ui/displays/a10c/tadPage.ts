/**
 * [OWNER: displays] A10cTadPage: the TAD (tactical awareness display) on an A-10C II MFCD (docs/research/a10c.md §4,
 * cas-jets.md §2). Heading-up, own ship centred (CEN). Draws the outer range ring at the scale (own ship to the
 * ring) and the inner ring at half, the north tick on the outer ring, the scale number, the solid own-ship
 * symbol, the steerpoint, the SPI "wedding cake", friendly ground units over SADL as green crosses, the digital
 * 9-line tasking as a red triangle with a dot (flashing, with ATTACK flashing at the top, until WILCO), the NEW
 * TASKING banner, the TAD cursor, the hooked symbol with an OWN hook line and bearing / range, and the SOI box.
 * OSB 10 NET is verified. North here is true north (DCS ticks magnetic north), bearings are true, and the
 * steerpoint circle, hook readout layout and banner position are the trainer's (not verified).
 */
import { blinkOn } from '../surface';
import type { Theme } from '../../theme';
import type { TadView } from './types';
import { MfcdPage, drawOsb, drawOsbTicks, drawSoiBox } from './mfcd';

const NM = 1852;
/** Outer ring radius as a fraction of the page side (own ship centred). */
export const TAD_RING = 0.4;
/** TAD scales in CEN (research §4). */
export const TAD_SCALES_NM = [5, 10, 20, 40, 80, 160] as const;

/**
 * World point (x east, z south, m) → TAD page pixels, heading-up, own ship at (cx, cy), `radiusPx` for `scaleNm`.
 * Straight ahead is up the page; right of the nose is right.
 */
export function tadProject(own: TadView['own'], scaleNm: number, cx: number, cy: number, radiusPx: number, p: { x: number; z: number }): { x: number; y: number } {
  const east = p.x - own.x, north = -(p.z - own.z);
  const c = Math.cos(own.heading), sn = Math.sin(own.heading);
  const right = east * c - north * sn;
  const fwd = east * sn + north * c;
  const k = radiusPx / (Math.max(0.1, scaleNm) * NM);
  return { x: cx + right * k, y: cy - fwd * k };
}

/** True bearing (deg 0–359) and range (nm) from own ship to a point. */
export function bearingRange(own: { x: number; z: number }, p: { x: number; z: number }): { brgDeg: number; rangeNm: number } {
  const east = p.x - own.x, north = -(p.z - own.z);
  const brg = ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360;
  return { brgDeg: Math.round(brg) % 360, rangeNm: Math.hypot(east, north) / NM };
}

/** Hook readout: "045/12.3" (bearing three digits, range nm one decimal). */
export function fmtBrgRng(own: { x: number; z: number }, p: { x: number; z: number }): string {
  const { brgDeg, rangeNm } = bearingRange(own, p);
  return `${String(brgDeg).padStart(3, '0')}/${rangeNm.toFixed(1)}`;
}

/** The symbol the hook refers to: the tasking, the SPI, or the friendly nearest the cursor. */
export function hookedPoint(v: TadView): { x: number; z: number } | null {
  if (v.hooked === 'tasking') return v.tasking;
  if (v.hooked === 'spi') return v.spi;
  if (v.hooked === 'friendly' && v.friendlies.length) {
    const c = v.cursor;
    if (!c) return v.friendlies[0];
    return v.friendlies.reduce((a, b) => (Math.hypot(b.x - c.x, b.z - c.z) < Math.hypot(a.x - c.x, a.z - c.z) ? b : a));
  }
  return null;
}

export class A10cTadPage extends MfcdPage<TadView> {
  protected paint(s: number, th: Theme): void {
    const v = this.view;
    const g = this.g, u = g.u, cx = s / 2, cy = s / 2, R = s * TAD_RING;
    drawOsbTicks(g, th, s);
    drawOsb(g, th, s, { osb: 10, text: 'NET' });
    if (!v) return;
    const P = (p: { x: number; z: number }) => tadProject(v.own, v.scaleNm, cx, cy, R, p);
    const inPage = (q: { x: number; y: number }) => q.x > 2 * u && q.x < s - 2 * u && q.y > 2 * u && q.y < s - 2 * u;

    // Range rings, north tick, scale.
    g.ink(th.symDim, 0, 0.3, 1);
    g.circle(cx, cy, R);
    g.dash([1, 1.2]); g.circle(cx, cy, R / 2); g.dash(null);
    const na = -v.own.heading;
    const nx = cx + Math.sin(na) * R, ny = cy - Math.cos(na) * R;
    const ox = Math.sin(na), oy = -Math.cos(na), px = -oy, py = ox, t = 2.2 * u;
    g.ink(th.sym, 0, 0.3, 1);
    g.poly([nx + ox * t, ny + oy * t, nx + px * t * 0.6, ny + py * t * 0.6, nx - px * t * 0.6, ny - py * t * 0.6], true, true);
    g.font(3.2, 700, 8);
    g.text(String(v.scaleNm), cx - R * 0.74, cy - R * 0.74, 'right', 'bottom');

    // Steerpoint: small circle and its name.
    if (v.steerpoint) {
      const q = P(v.steerpoint);
      if (inPage(q)) {
        g.ink(th.sym, 0, 0.3, 1);
        g.circle(q.x, q.y, 1.4 * u);
        g.font(2.8, 400, 8);
        g.text(v.steerpoint.name, q.x + 2.2 * u, q.y, 'left');
      }
    }
    // Friendly ground units: green crosses.
    for (const f of v.friendlies) {
      const q = P(f);
      if (!inPage(q)) continue;
      const a = 1.8 * u;
      g.ink(th.sym, 0.4, 0.45, 1);
      g.segs([q.x - a, q.y, q.x + a, q.y, q.x, q.y - a, q.x, q.y + a]);
      if (f.label) { g.font(2.6, 400, 8); g.text(f.label, q.x + a + 1 * u, q.y + a, 'left'); }
    }
    // Tasking: red triangle with a dot, flashing until accepted.
    if (v.tasking) {
      const q = P(v.tasking);
      if (inPage(q) && (v.tasking.accepted || blinkOn(1, v.t, 0.7))) {
        const r = 2.6 * u;
        g.ink(th.hostile, 0.4, 0.45, 1);
        g.poly([q.x, q.y - r, q.x + r * 0.9, q.y + r * 0.6, q.x - r * 0.9, q.y + r * 0.6], true);
        g.circle(q.x, q.y + r * 0.1, 0.45 * u, true);
      }
      if (!v.tasking.accepted && blinkOn(1, v.t, 0.6)) {
        g.font(4, 700, 9);
        g.ink(th.sym, 0, 0.3, 1);
        g.text('ATTACK', cx, s * 0.12);
      }
    }
    // SPI: three-step wedding cake standing on the point.
    if (v.spi) {
      const q = P(v.spi);
      if (inPage(q)) {
        g.ink(th.sym, 0.4, 0.35, 1);
        const h = 0.9 * u;
        [4.2, 2.8, 1.4].forEach((w, i) => g.rect(q.x - (w * u) / 2, q.y - (i + 1) * h, w * u, h));
      }
    }
    // Own ship: solid plan-view aircraft pointing up (straight wing, twin tail).
    {
      const a = u * 0.9;
      g.ink(th.sym, 0.5, 0.3, 1);
      g.poly([cx, cy - 3 * a, cx + 0.5 * a, cy - 1.2 * a, cx + 3.2 * a, cy - 0.6 * a, cx + 3.2 * a, cy + 0.3 * a, cx + 0.5 * a, cy + 0.2 * a,
        cx + 0.4 * a, cy + 2 * a, cx + 1.6 * a, cy + 2.6 * a, cx + 1.6 * a, cy + 3.1 * a, cx - 1.6 * a, cy + 3.1 * a, cx - 1.6 * a, cy + 2.6 * a,
        cx - 0.4 * a, cy + 2 * a, cx - 0.5 * a, cy + 0.2 * a, cx - 3.2 * a, cy + 0.3 * a, cx - 3.2 * a, cy - 0.6 * a, cx - 0.5 * a, cy - 1.2 * a], true, true);
    }
    // Hook: highlight, OWN hook line and bearing / range lower left.
    const hp = hookedPoint(v);
    if (hp) {
      const q = P(hp);
      g.ink(th.symHi, 0.4, 0.35, 1);
      g.dash([1, 1]); g.line(cx, cy, q.x, q.y); g.dash(null);
      g.rect(q.x - 3.4 * u, q.y - 3.4 * u, 6.8 * u, 6.8 * u);
      g.font(3, 700, 8);
      g.text('OWN', s * 0.08, s * 0.8, 'left');
      g.text(fmtBrgRng(v.own, hp), s * 0.08, s * 0.85, 'left');
    }
    // Cursor: cross with an open centre.
    if (v.cursor) {
      const q = P(v.cursor);
      const a = 3.4 * u, gp = 1 * u;
      g.ink(th.sym, 0.4, 0.35, 1);
      g.segs([q.x - a, q.y, q.x - gp, q.y, q.x + gp, q.y, q.x + a, q.y, q.x, q.y - a, q.x, q.y - gp, q.x, q.y + gp, q.x, q.y + a]);
    }
    // NEW TASKING banner.
    if (v.newTasking) {
      g.font(3.8, 700, 9);
      g.ink(th.sym, 0, 0.35, 1);
      g.boxText('NEW TASKING', cx, s * 0.88, 'center', 1, true);
    }
    if (v.soi) drawSoiBox(g, th, s);
  }
}
