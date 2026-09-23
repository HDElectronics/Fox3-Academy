/**
 * [OWNER: displays] Su25tHud: the Su-25T head-up display in air-to-ground work, drawn from the items the ED Su-25T
 * Flight Manual (S1) names: mode label (ОПТ-ЗЕМЛЯ visual, ЗЕМЛЯ with the Shkval), the store label below the pitch
 * scale (9А4172, С8, АБ, ВПУ for the cannon), the launch range scale with the current and maximum range, the
 * launch-authorised cue ПР, the circular laser cursor where the Shkval looks, a launch-zone reticle, the CCIP
 * pipper for rockets, bombs and the gun, and the station boxes. Layout and glyph shapes are simplified.
 * CCRP (S1): the director circle the pilot flies the keel of the aircraft symbol into, and the range scale turned
 * into a time-to-release scale whose arrow starts 10 s before release. Kh-58 (S1): emitter diamonds inside ±30°,
 * a type code under each radar the missile can attack, a circle on the locked emitter, and the slewed square.
 */
import { Gfx, Surface } from './surface';
import { CCRP_TOL_DEG } from '../../sim/agWeapons';

export interface HudStation { station: number; label: string; count: number; selected: boolean }

export interface Su25tHudState {
  master: 'nav' | 'ag' | 'fixed';
  modeLabel: string | null;
  weaponLabel: string | null;
  rounds: number | null;
  pitchDeg: number;
  headingDeg: number;
  speedKmh: number;
  altM: number;
  /** Launch range scale (m): current slant range to the target / impact point and the band. */
  range: { cur: number | null; min: number; max: number } | null;
  pr: boolean;
  /** Shkval line of sight on the HUD (deg from the boresight, + right / + up). */
  laserCursor: { xDeg: number; yDeg: number } | null;
  /** CCIP impact point on the HUD (deg from the boresight). */
  ccip: { xDeg: number; yDeg: number } | null;
  /** Guided launch-zone reticle: shown with a guided store selected; solid inside the band. */
  reticle: 'in' | 'out' | null;
  stations: HudStation[];
  /** CCRP director: track error (deg, + right), keel inside the circle, seconds to release, release held. */
  ccrp?: { errDeg: number; inCircle: boolean; ttrS: number | null; held: boolean } | null;
  /** Kh-58 passive detection: emitters (HUD deg), their type code (null: cannot attack), lock, and the square. */
  arm?: { emitters: { xDeg: number; yDeg: number; code: string | null; locked: boolean }[]; cursor: { xDeg: number; yDeg: number } | null } | null;
}

/** Seconds on the CCRP time-to-release scale (S1: the arrow starts 10 s before release). */
export const CCRP_SCALE_S = 10;

/** HUD field of view across (deg); the trainer's scale for placing angular symbols. */
export const HUD_FOV_DEG = 26;

/** Shared Kh-58 symbol/cursor projection, including the HUD edge clamps. */
export function projectArmHudPoint(p: { xDeg: number; yDeg: number }): { xDeg: number; yDeg: number } {
  return { xDeg: clampDeg(p.xDeg), yDeg: clampDeg(p.yDeg, 8.5) };
}

/** Pixel geometry: the keel touches the circle at the simulation's release tolerance. */
export function ccrpDirectorGeometry(errDeg: number, width: number): { offset: number; radius: number } {
  const ppd = width / HUD_FOV_DEG;
  return { offset: clampDeg(errDeg) * ppd, radius: CCRP_TOL_DEG * ppd };
}

/** Angles (deg) of a world point from the boresight given the jet's heading and pitch (rad). + right, + up. */
export function hudAngles(from: { x: number; y: number; z: number }, heading: number, pitch: number, p: { x: number; y: number; z: number }): { xDeg: number; yDeg: number } {
  const dx = p.x - from.x, dy = p.y - from.y, dz = p.z - from.z;
  const brg = Math.atan2(dx, -dz);
  let rel = brg - heading;
  while (rel > Math.PI) rel -= 2 * Math.PI;
  while (rel < -Math.PI) rel += 2 * Math.PI;
  const el = Math.atan2(dy, Math.hypot(dx, dz));
  return { xDeg: (rel * 180) / Math.PI, yDeg: ((el - pitch) * 180) / Math.PI };
}

/** Mode label S1 gives for the master mode: [7] ОПТ-ЗЕМЛЯ, ЗЕМЛЯ once the Shkval is on; nothing in navigation. */
export function hudModeLabel(master: 'nav' | 'ag' | 'fixed', shkvalOn: boolean): string | null {
  if (master !== 'ag') return null;
  return shkvalOn ? 'ЗЕМЛЯ' : 'ОПТ-ЗЕМЛЯ';
}

/** Scale end (km) for the range bar: a round number above the band maximum and the current range. */
export function rangeScaleKm(maxM: number, curM: number | null): number {
  const top = Math.max(maxM, curM ?? 0) * 1.15 / 1000;
  const steps = [2, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 80, 100];
  return steps.find(s => s >= top) ?? Math.ceil(top / 10) * 10;
}

export class Su25tHud {
  readonly canvas: HTMLCanvasElement;
  private surf: Surface;
  private g: Gfx;
  private last: Su25tHudState | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.surf = new Surface(canvas);
    this.g = new Gfx(this.surf.ctx, this.surf.theme);
    this.surf.onResize = () => this.render();
  }

  draw(s: Su25tHudState | null): void { this.last = s; this.render(); }
  refreshTheme(): void { this.surf.refreshTheme(); this.render(); }
  dispose(): void { this.surf.dispose(); this.last = null; }

  private render(): void {
    const sf = this.surf;
    if (!sf.begin()) return;
    const th = sf.theme, g = this.g, ctx = sf.ctx, W = sf.w, H = sf.h;
    const u = Math.min(W, H) / 100;
    g.setup(sf.dpr, u, 0.8, th);
    g.reset();
    ctx.fillStyle = th.screen;
    ctx.fillRect(0, 0, W, H);
    const s = this.last;
    if (!s) return;
    const ppd = W / HUD_FOV_DEG;
    const cx = W / 2, cy = H * 0.42;
    const at = (xDeg: number, yDeg: number) => [cx + xDeg * ppd, cy - yDeg * ppd] as const;
    g.ink(th.sym, 1, 0.32, 1);

    // Horizon and pitch marks (every 10°, the horizon long).
    const segs: number[] = [];
    for (let p = -40; p <= 30; p += 10) {
      const y = cy + (s.pitchDeg - p) * ppd;
      if (y < H * 0.1 || y > H * 0.8) continue;
      const half = p === 0 ? W * 0.3 : W * 0.09, gap = W * 0.06;
      segs.push(cx - half, y, cx - gap, y, cx + gap, y, cx + half, y);
    }
    g.segs(segs);
    // Aircraft datum (boresight).
    g.segs([cx - 3.5 * u, cy, cx - 1.2 * u, cy, cx + 1.2 * u, cy, cx + 3.5 * u, cy, cx, cy - 1.2 * u, cx, cy - 2.8 * u]);

    // Speed, altitude, heading.
    g.font(3.6, 400, 9);
    g.text(String(Math.round(s.speedKmh)), W * 0.06, H * 0.06, 'left', 'top');
    g.text(String(Math.round(s.altM)), W * 0.94, H * 0.06, 'right', 'top');
    g.text(String(Math.round(((s.headingDeg % 360) + 360) % 360)).padStart(3, '0'), cx, H * 0.04, 'center', 'top');

    // Laser cursor (Shkval line of sight) and launch-zone reticle around it.
    if (s.laserCursor) {
      const [lx, ly] = at(clampDeg(s.laserCursor.xDeg), clampDeg(s.laserCursor.yDeg, 8.5));
      g.circle(lx, ly, 1.6 * u);
      if (s.reticle) {
        g.dash(s.reticle === 'in' ? null : [1.6, 1.4]);
        g.circle(lx, ly, 7 * u);
        g.dash(null);
      }
    }
    // CCIP pipper and bomb-fall line.
    if (s.ccip) {
      const clipped = Math.abs(s.ccip.xDeg) > HUD_FOV_DEG / 2 || s.ccip.yDeg < -16;
      const [px, py] = at(clampDeg(s.ccip.xDeg), Math.max(-16, s.ccip.yDeg));
      g.dash(clipped ? [1.2, 1.2] : null);
      g.line(cx, cy + 3 * u, px, py - 2.6 * u);
      g.dash(null);
      g.circle(px, py, 2.6 * u);
      g.circle(px, py, 0.5 * u, true);
    }

    // CCRP director circle at the keel height; the keel is the datum's vertical tick.
    if (s.ccrp) {
      const director = ccrpDirectorGeometry(s.ccrp.errDeg, W);
      g.dash(s.ccrp.inCircle ? null : [1.4, 1.2]);
      g.circle(cx + director.offset, cy - 2.8 * u, director.radius);
      g.dash(null);
    }
    // Kh-58 emitters: diamond (circle once locked), type code below, slewed square.
    if (s.arm) {
      g.font(2.8, 700, 8);
      for (const e of s.arm.emitters) {
        const p = projectArmHudPoint(e);
        const [ex, ey] = at(p.xDeg, p.yDeg);
        const r = 1.8 * u;
        if (e.locked) g.circle(ex, ey, r);
        else g.poly([ex, ey - r, ex + r, ey, ex, ey + r, ex - r, ey], true);
        if (e.code) g.text(e.code, ex, ey + r + 2 * u);
      }
      if (s.arm.cursor) {
        const p = projectArmHudPoint(s.arm.cursor);
        const [qx, qy] = at(p.xDeg, p.yDeg);
        g.rect(qx - 2.6 * u, qy - 2.6 * u, 5.2 * u, 5.2 * u);
      }
    }

    // Mode and store labels (below the pitch scale), ПР cue.
    g.font(3.8, 700, 9);
    if (s.modeLabel) g.text(s.modeLabel, W * 0.06, H * 0.8, 'left');
    if (s.weaponLabel) g.text(s.weaponLabel + (s.rounds != null ? `  ${s.rounds}` : ''), W * 0.06, H * 0.86, 'left');
    if (s.pr) { g.font(4.6, 700, 10); g.text('ПР', cx, H * 0.74); }

    // CCRP: the range scale becomes a time-to-release scale; the arrow shows inside the last 10 s.
    if (s.ccrp) {
      const top = H * 0.2, bot = H * 0.72, x = W * 0.9;
      const y = (sec: number) => bot - (bot - top) * Math.min(1, Math.max(0, sec / CCRP_SCALE_S));
      g.lw(0.3);
      g.line(x, top, x, bot);
      g.line(x - 1.2 * u, top, x + 1.2 * u, top);
      g.lw(0.32);
      g.font(3, 400, 8);
      g.text(String(CCRP_SCALE_S), x + 3.2 * u, top, 'left');
      g.text('0', x + 3.2 * u, bot, 'left');
      const ttr = s.ccrp.ttrS;
      if (ttr != null && ttr <= CCRP_SCALE_S && ttr >= -1) {
        const yc = y(Math.max(0, ttr));
        g.poly([x - 0.5 * u, yc, x - 3 * u, yc - 1.4 * u, x - 3 * u, yc + 1.4 * u], true, true);
        g.text(String(Math.max(0, Math.ceil(ttr))), x - 3.6 * u, yc, 'right');
      }
    } else if (s.range) {
    // Launch range scale (right): band, maximum mark, current caret.
      const top = H * 0.2, bot = H * 0.72, x = W * 0.9;
      const scale = rangeScaleKm(s.range.max, s.range.cur) * 1000;
      const y = (m: number) => bot - (bot - top) * Math.min(1, Math.max(0, m / scale));
      g.lw(0.3);
      g.line(x, top, x, bot);
      g.lw(0.9);
      g.line(x + 1 * u, y(s.range.min), x + 1 * u, y(s.range.max));
      g.lw(0.32);
      g.line(x - 2 * u, y(s.range.max), x + 2.5 * u, y(s.range.max));
      g.font(3, 400, 8);
      g.text(String(Math.round(s.range.max / 1000)), x + 3.2 * u, y(s.range.max), 'left');
      g.text(String(Math.round(scale / 1000)), x + 3.2 * u, top, 'left');
      if (s.range.cur != null) {
        const yc = y(s.range.cur);
        g.poly([x - 0.5 * u, yc, x - 3 * u, yc - 1.4 * u, x - 3 * u, yc + 1.4 * u], true, true);
        g.text((s.range.cur / 1000).toFixed(1), x - 3.6 * u, yc, 'right');
      }
    }

    // Station boxes.
    const st = s.stations;
    if (st.length) {
      const bw = Math.min(10 * u, (W * 0.9) / st.length), bh = 6 * u, y0 = H - bh - 2 * u;
      const x0 = cx - (bw * st.length) / 2;
      g.font(2.7, 400, 8);
      st.forEach((b, i) => {
        const x = x0 + i * bw;
        g.ink(b.selected ? th.sym : th.symDim, b.selected ? 1 : 0, 0.3, 1);
        g.rect(x + 0.4 * u, y0, bw - 0.8 * u, bh, b.selected);
        ctx.fillStyle = b.selected ? th.screen : th.symDim;
        g.text(b.count > 0 ? String(b.count) : '—', x + bw / 2, y0 + bh / 2);
      });
    }
    g.reset();
  }
}

function clampDeg(d: number, lim = HUD_FOV_DEG / 2 - 0.6): number { return Math.max(-lim, Math.min(lim, d)); }
