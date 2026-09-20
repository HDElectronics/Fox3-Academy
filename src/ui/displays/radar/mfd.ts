/**
 * [OWNER: displays] Western MFD B-scope: Hornet attack radar (DDI), Viper FCR, JF-17 radar page.
 * Per docs/research/hornet-viper.md and tomcat-thunder-mirage.md:
 *  - Hornet: OSB legends (mode at PB5, RAID PB9, NCTR PB15, bars '4B 1', azimuth '140', range with
 *    arrows), B-sweep line, elevation caret, HAFU trackfiles (bracket unknown / caret hostile /
 *    hemisphere friendly, rank inside, star = L&S, diamond = DT2, Mach left / altitude right of the
 *    L&S), DLZ RMAX/RNE/RMIN with Vc caret, SHOOT (steady in RMAX, flashing in RNE), fly-out pyramid
 *    with seconds to active then 'A', HUD-style 'xx ACT' -> 'xx TTG'.
 *  - Viper: CRM / sub-mode / NORM / OVRD / CNTL, range with arrows, 'A6', '4B' on the left, T-scales,
 *    two scan-limit lines, cursor with blue upper / white lower altitude, search squares, 'tank'
 *    tracks with nose line, bug circle, AMRAAM tail (flashes when active, X in the last 8 s),
 *    RPI / RTR / RMIN scale, 'A nn' / 'T nn' for the missile of interest, TOI data line.
 *  - JF-17: mode, crossed STBY, IFF, CNTL on top; azimuth and bars left; range and '*' right; HPT
 *    circle; weapon scale with the NEZ as a bar; HPT data block; 'TOA nn' after launch.
 */
import { D2R, R2D } from '../../../sim/math';
import { mach } from '../../../sim/atmosphere';
import { blinkOn } from '../surface';
import { brick, caretRight, diamond, stick, star, triUp, xMark } from '../glyphs';
import {
  aspectSide, aspectTens, bscopeToScreen, fmtAltK, fmtClosure, fmtRangeShort, fmtScale, hornetWeapon, mfdFamily, rangeUnit,
  screenToBscope, secs, speedVal, viperAzLegend, viperWeapon, type MfdFamily, type Rect,
} from '../geometry';
import {
  X, Y, brickAlpha, hit, missileOfInterest, missilePhase, missilesAt, primaryTrack, rangeY, stickLen, visibleCoast, type DlzMarks,
  type FrameCtx, type Mapping, type PicTrack,
} from './common';

const OSB_POS = [20, 35, 50, 65, 80];

interface Osb { label: string; boxed?: boolean; crossed?: boolean; arrow?: 'up' | 'down' }

export function drawMfd(f: FrameCtx): Mapping {
  const { g, th, pic, u } = f;
  const fam = mfdFamily(f.aircraft);
  const color = f.opts.color ?? fam !== 'hornet';
  const plot: Rect = { x: X(f, 13), y: Y(f, 12), w: 71 * u, h: 73 * u };
  const gAz = pic.gimbalAz > 0 ? pic.gimbalAz : 60 * D2R;
  const map = (az: number, r: number) => bscopeToScreen(plot, gAz, pic.rangeScale, az, r);

  drawOsbs(f, fam);
  drawScales(f, fam, plot, map);

  // ---- contacts
  for (const b of pic.bricks) {
    if (b.range > pic.rangeScale || Math.abs(b.az) > gAz) continue;
    const p = map(b.az, b.range);
    g.ink(th.sym, 0.8, 0.2, brickAlpha(b));
    if (fam === 'hornet') brick(g, p.x, p.y, 2.6 * u, 1.3 * u, true);
    else g.rect(p.x - 0.8 * u, p.y - 0.8 * u, 1.6 * u, 1.6 * u, true);
    hit(f, p.x, p.y, b.targetId, 'brick');
  }
  g.reset();

  // Hornet threat rank: non-friendly trackfiles ordered by range (closest = 1). Stylised ranking.
  const ranked = pic.tracks.filter(t => !t.friendly).sort((a, b) => a.range - b.range);
  const rank = new Map(ranked.map((t, i) => [t.targetId, i + 1]));
  const prim = primaryTrack(pic);
  const sorted = [...pic.tracks].sort((a, b) => weight(a) - weight(b));
  for (const t of sorted) {
    if (t.range > pic.rangeScale * 1.001 || Math.abs(t.az) > gAz) continue;
    const p = map(t.az, t.range);
    hit(f, p.x, p.y, t.targetId, t.locked ? 'stt' : 'track');
    if (!visibleCoast(f, t)) continue;
    if (fam === 'hornet') drawHafu(f, t, p.x, p.y, rank.get(t.targetId) ?? 0, color);
    else if (fam === 'viper') drawViperTrack(f, t, p.x, p.y, color);
    else drawJfTrack(f, t, p.x, p.y);
  }
  if (pic.stt && !pic.tracks.some(t => t.targetId === pic.stt?.targetId) && pic.stt.range <= pic.rangeScale) {
    const p = map(pic.stt.az, pic.stt.range);
    if (!pic.stt.lost || blinkOn(2, f.now)) {
      g.ink(th.symHi, 1.2, 0.34);
      if (fam === 'hornet') { star(g, p.x, p.y, 1.6 * u); g.circle(p.x, p.y, 2.8 * u); } else g.circle(p.x, p.y, 2.6 * u);
    }
    hit(f, p.x, p.y, pic.stt.targetId, 'stt');
  }

  // ---- fly-out cues (missiles in flight at tracks)
  for (const t of pic.tracks) {
    if (!t.missiles.length || t.range > pic.rangeScale) continue;
    for (const m of t.missiles) {
      const k = f.clock.progress(m.missileId, pic.t, m.timeToImpact);
      if (fam === 'hornet') {
        const p = map(t.az, t.range * k);
        g.ink(th.sym, 1, 0.26);
        triUp(g, p.x, p.y - 0.9 * u, 1.8 * u, true);
        g.font(2.3);
        const ph = missilePhase(m);
        g.text(ph === 'toActive' ? secs(m.timeToActive) : ph === 'active' ? 'A' : secs(m.timeToImpact), p.x + 1.8 * u, p.y, 'left');
      }
    }
  }

  // ---- cursor with altitude coverage (hidden in STT: the display shows only the locked target)
  const cp = map(pic.cursor.az, Math.min(pic.cursor.range, pic.rangeScale));
  const showCursor = pic.mode !== 'stt';
  if (showCursor) {
    g.ink(th.sym, 1, 0.32);
    g.segs([cp.x - 0.9 * u, cp.y - 1.6 * u, cp.x - 0.9 * u, cp.y + 1.6 * u, cp.x + 0.9 * u, cp.y - 1.6 * u, cp.x + 0.9 * u, cp.y + 1.6 * u]);
  }
  g.font(2.3);
  const top = fmtAltK(pic.altCoverage.top, f.units), bot = fmtAltK(pic.altCoverage.bottom, f.units);
  if (!showCursor) {
    // no cursor readouts
  } else if (fam === 'viper') {
    g.ink(color ? th.datalink : th.sym, 0.7, 0.3);
    g.text(top, cp.x + 2 * u, cp.y - 1 * u, 'left');
    g.ink(color ? th.missile : th.sym, 0.5, 0.3);
    g.text(bot, cp.x + 2 * u, cp.y + 1.3 * u, 'left');
  } else if (fam === 'hornet') {
    g.ink(th.sym, 0.7, 0.3);
    g.text(top, cp.x, cp.y - 3 * u);
    g.text(bot, cp.x, cp.y + 3 * u);
  } else {
    g.ink(th.sym, 0.7, 0.3);
    g.text(top, cp.x + 2 * u, cp.y - 1 * u, 'left');
    g.text(bot, cp.x + 2 * u, cp.y + 1.3 * u, 'left');
  }

  // ---- DLZ on the right edge, on the display range scale
  const dm: DlzMarks = { x: X(f, 88.2), side: -1, yBottom: plot.y + plot.h, yTop: plot.y, rangeScale: pic.rangeScale };
  const closure = prim?.closure ?? pic.stt?.closure ?? null;
  if (pic.dlz) drawMfdDlz(f, fam, dm, closure);

  // ---- data lines
  drawTexts(f, fam, plot, prim);
  g.reset();
  return { toScreen: map, toRadar: (x, y) => screenToBscope(plot, gAz, pic.rangeScale, x, y) };
}

function weight(t: PicTrack): number {
  return t.locked ? 4 : t.designation === 'primary' ? 3 : t.designation === 'secondary' ? 2 : t.firm ? 1 : 0;
}

// ------------------------------------------------------------------ OSB legends

function osbLayout(f: FrameCtx, fam: MfdFamily): { top: Osb[]; left: Osb[]; right: Osb[]; bottom: Osb[]; rangeSide: 'left' | 'right' } {
  const { pic } = f;
  const mode = pic.modeLabel || pic.mode.toUpperCase();
  const azTot = String(Math.round((pic.scan.azHalf * 2 * 180) / Math.PI));
  const bars = `${pic.scan.bars}B`;
  const e: Osb = { label: '' };
  if (fam === 'hornet') {
    return {
      top: [{ label: 'SIL' }, { label: 'DATA' }, e, { label: 'RAID' }, e],
      left: [e, e, e, e, { label: mode, boxed: false }],
      right: [e, e, e, e, { label: 'NCTR' }],
      bottom: [{ label: `${bars} ${pic.scan.bar + 1}` }, { label: azTot }, { label: 'MENU' }, { label: 'SET' }, { label: 'RSET' }],
      rangeSide: 'right',
    };
  }
  if (fam === 'viper') {
    return {
      top: [{ label: 'CRM' }, { label: mode }, { label: 'NORM' }, { label: 'OVRD' }, { label: 'CNTL' }],
      left: [e, e, { label: viperAzLegend(pic.scan.azHalf) }, { label: bars }, e],
      right: [e, e, e, e, e],
      bottom: [{ label: 'SWAP' }, { label: 'FCR', boxed: true }, { label: 'TEST' }, { label: 'SMS' }, { label: 'DCLT' }],
      rangeSide: 'left',
    };
  }
  return {
    top: [{ label: mode }, { label: 'STBY', crossed: true }, e, { label: 'IFF' }, { label: 'CNTL' }],
    left: [e, e, { label: `±${Math.round((pic.scan.azHalf * 180) / Math.PI)}` }, { label: bars }, e],
    right: [e, e, e, e, e],
    bottom: [{ label: 'HSD' }, { label: 'SMS' }, { label: 'RDR', boxed: true }, e, { label: 'DCLT' }],
    rangeSide: 'right',
  };
}

function drawOsbs(f: FrameCtx, fam: MfdFamily): void {
  const { g, th, u, pic } = f;
  const L = osbLayout(f, fam);
  // Button stubs on the glass edge (where the physical push-buttons sit).
  g.ink(th.screenLine, 0, 0.3, 1);
  for (const p of OSB_POS) {
    g.rect(X(f, p) - 1.6 * u, Y(f, 0), 3.2 * u, 0.9 * u, true);
    g.rect(X(f, p) - 1.6 * u, Y(f, 100) - 0.9 * u, 3.2 * u, 0.9 * u, true);
    g.rect(X(f, 0), Y(f, p) - 1.6 * u, 0.9 * u, 3.2 * u, true);
    g.rect(X(f, 100) - 0.9 * u, Y(f, p) - 1.6 * u, 0.9 * u, 3.2 * u, true);
  }
  g.ink(th.sym, 0.6, 0.22);
  g.font(2.7);
  const put = (o: Osb, x: number, y: number, align: 'left' | 'center' | 'right') => {
    if (!o.label) return;
    g.boxText(o.label, x, y, align, 0.5, !!o.boxed);
    if (o.crossed) { const w = g.measure(o.label); const x0 = align === 'left' ? x : align === 'right' ? x - w : x - w / 2; g.line(x0 - 0.3 * u, y + 0.9 * u, x0 + w + 0.3 * u, y - 0.9 * u); }
  };
  L.top.forEach((o, i) => put(o, X(f, OSB_POS[i]), Y(f, 4.2), 'center'));
  L.bottom.forEach((o, i) => put(o, X(f, OSB_POS[i]), Y(f, 95.8), 'center'));
  L.left.forEach((o, i) => put(o, X(f, 2.4), Y(f, OSB_POS[i]), 'left'));
  L.right.forEach((o, i) => put(o, X(f, 97.6), Y(f, OSB_POS[i]), 'right'));
  // Range scale with up/down arrows (removed in STT on the Hornet).
  if (!(fam === 'hornet' && pic.mode === 'stt')) {
    const left = L.rangeSide === 'left';
    const x = left ? X(f, 4.6) : X(f, 95.4);
    g.ink(th.sym, 0.7, 0.24);
    triUp(g, x, Y(f, 18.6), 1.8 * u, false);
    g.poly([x, Y(f, 36.6), x + 1.1 * u, Y(f, 34.4), x - 1.1 * u, Y(f, 34.4)], true, false);
    g.font(3, 700);
    g.text(fmtScale(pic.rangeScale, f.units), x, Y(f, 27.5), 'center');
  }
  if (fam === 'jf17') {
    // SOI asterisk.
    g.ink(th.sym, 0.7, 0.26);
    const ax = X(f, 94), ay = Y(f, 9.5), r = 1.3 * u;
    g.segs([ax - r, ay, ax + r, ay, ax - r * 0.6, ay - r * 0.8, ax + r * 0.6, ay + r * 0.8, ax - r * 0.6, ay + r * 0.8, ax + r * 0.6, ay - r * 0.8]);
  }
  if (fam === 'hornet') {
    // SOI: TDC-assigned diamond with a dot, top right.
    g.ink(th.sym, 0.7, 0.24);
    diamond(g, X(f, 93.5), Y(f, 9.3), 1.4 * u);
    g.circle(X(f, 93.5), Y(f, 9.3), 0.3 * u, true);
  }
}

// ------------------------------------------------------------------ scales, scan limits, beam

function drawScales(f: FrameCtx, fam: MfdFamily, plot: Rect, map: (az: number, r: number) => { x: number; y: number }): void {
  const { g, th, u, pic } = f;
  const x0 = plot.x, x1 = plot.x + plot.w, y0 = plot.y, y1 = plot.y + plot.h;
  const azL = pic.scan.azCenter - pic.scan.azHalf, azR = pic.scan.azCenter + pic.scan.azHalf;
  const pl = map(azL, 0).x, pr = map(azR, 0).x;
  const bx = map(pic.scan.beamAz, 0).x;
  const elY = (el: number) => y1 - plot.h * (0.5 + Math.max(-60, Math.min(60, el * R2D)) / 120);
  if (fam === 'hornet') {
    // Range ticks at 1/4, 1/2, 3/4 on the right edge, scan-width brackets top and bottom, B-sweep line.
    g.ink(th.sym, 0.5, 0.22, 0.9);
    const s: number[] = [];
    for (let k = 1; k < 4; k++) { const y = y1 - (plot.h * k) / 4; s.push(x1, y, x1 - 1.4 * u, y); s.push(x0, y, x0 + 0.8 * u, y); }
    s.push(pl, y0, pl, y0 + 1.6 * u, pr, y0, pr, y0 + 1.6 * u, pl, y1, pl, y1 - 1.6 * u, pr, y1, pr, y1 - 1.6 * u);
    g.segs(s);
    g.ink(th.sym, 0.4, 0.2, 0.42);
    g.line(bx, y0 + 2 * u, bx, y1 - 2 * u);
    // Horizon line and velocity vector (centre overlay).
    const cx = x0 + plot.w / 2, cy = y0 + plot.h * 0.52;
    g.ink(th.sym, 0.5, 0.22, 0.7);
    g.segs([cx - 7 * u, cy, cx - 2 * u, cy, cx + 2 * u, cy, cx + 7 * u, cy]);
    g.circle(cx, cy, 0.8 * u);
    g.segs([cx - 1.8 * u, cy, cx - 0.8 * u, cy, cx + 0.8 * u, cy, cx + 1.8 * u, cy, cx, cy - 0.8 * u, cx, cy - 1.8 * u]);
    // Elevation caret, left edge.
    g.ink(th.sym, 1, 0.3);
    caretRight(g, x0 - 0.4 * u, elY(pic.scan.beamEl), 1.4 * u);
    return;
  }
  // Viper / JF-17: two scan-limit lines, azimuth 'T' at the bottom, elevation 'sideways T' at the left.
  g.ink(th.sym, 0.5, 0.22, 0.75);
  g.segs([pl, y0 + 1 * u, pl, y1, pr, y0 + 1 * u, pr, y1]);
  const ay = y1 + 2.4 * u, ex = x0 - 2.4 * u;
  g.ink(th.sym, 0.5, 0.22, 0.9);
  const s: number[] = [map(-60 * D2R, 0).x, ay, map(60 * D2R, 0).x, ay, ex, elY(60 * D2R), ex, elY(-60 * D2R)];
  for (let d = -60; d <= 60; d += 10) {
    const x = map(d * D2R, 0).x, y = elY(d * D2R);
    const tl = d === 0 ? 1.8 : d % 30 === 0 ? 1 : 0.6;
    s.push(x, ay, x, ay - tl * u);
    s.push(ex, y, ex + tl * u, y);
  }
  g.segs(s);
  g.ink(th.sym, 1, 0.34);
  g.line(bx, ay + 0.2 * u, bx, ay - 2.2 * u);
  g.line(ex - 0.2 * u, elY(pic.scan.beamEl), ex + 2.2 * u, elY(pic.scan.beamEl));
}

// ------------------------------------------------------------------ track symbols

function hafuColor(f: FrameCtx, t: PicTrack, color: boolean): string {
  const th = f.th;
  if (!color) return t.designation || t.locked ? th.symHi : th.sym;
  if (t.friendly) return th.ok;
  return f.opts.nonFriendly === 'hostile' ? th.hostile : th.symHi;
}

/** Hornet HAFU: top half = own-sensor ID (hemisphere friendly, bracket unknown, caret hostile). */
function drawHafu(f: FrameCtx, t: PicTrack, x: number, y: number, rank: number, color: boolean): void {
  const { g, u } = f;
  const r = 2.2 * u;
  const col = hafuColor(f, t, color);
  const strong = !!t.designation || t.locked;
  if (!t.firm && !strong && !t.friendly) {
    // Tentative trackfile (one hit, no velocity yet): still a raw hit on the Hornet.
    f.g.ink(f.th.sym, 0.8, 0.22, 0.85);
    brick(g, x, y, 2.6 * u, 1.3 * u, true);
    return;
  }
  g.ink(col, strong ? 1.2 : 0.9, strong ? 0.34 : 0.26, t.firm ? 1 : 0.7);
  if (t.friendly) g.arc(x, y, r, Math.PI, Math.PI * 2);
  else if (f.opts.nonFriendly === 'hostile') g.poly([x - r, y, x, y - r * 1.3, x + r, y], false);
  else g.poly([x - r, y, x - r, y - r, x + r, y - r, x + r, y], false);
  // Aspect stem from the symbol.
  if (t.firm) stick(g, x, y - r * 0.5, t.relHeading, stickLen(f, t.speed), r);
  const cy = y - r * 0.45;
  if (t.designation === 'primary' || t.locked) {
    star(g, x, cy, r * 0.62, true);
    // L&S data: Mach left, altitude right.
    g.font(2.3);
    g.text(mach(t.speed, t.alt).toFixed(1), x - r - 1 * u, cy, 'right');
    g.text(fmtAltK(t.alt, f.units), x + r + 1 * u, cy, 'left');
  } else if (t.designation === 'secondary' && t.designationIndex === 1) {
    diamond(g, x, cy, r * 0.55, true);
    g.font(2.1);
    g.text(fmtAltK(t.alt, f.units), x + r + 1 * u, cy, 'left');
  } else if (!t.friendly && rank > 0) {
    g.font(2.1, 700);
    g.text(String(rank), x, cy + 0.1 * u);
    if (t.designation === 'secondary') {
      g.font(1.9);
      g.text(`D${t.designationIndex + 1}`, x + r + 0.8 * u, cy, 'left');
    }
  }
  if (t.locked && f.pic.mode === 'stt') g.circle(x, cy, r * 1.7);
}

/** Viper: search square / 'tank' track rotated to the target's track, bug circle, AMRAAM tail and X. */
function drawViperTrack(f: FrameCtx, t: PicTrack, x: number, y: number, color: boolean): void {
  const { g, th, u } = f;
  const col = t.friendly ? (color ? th.friendly : th.sym) : color && f.opts.nonFriendly === 'hostile' ? th.hostile : th.sym;
  const strong = !!t.designation || t.locked;
  g.ink(col, strong ? 1.2 : 0.9, 0.26, t.firm ? 1 : 0.75);
  if (t.friendly) {
    g.circle(x, y, 1.1 * u, true);
  } else if (t.firm) {
    const a = t.relHeading, s = 1.05 * u;
    const ca = Math.cos(a), sa = Math.sin(a);
    const P = (px: number, py: number) => [x + px * ca - py * sa, y + px * sa + py * ca];
    g.poly([...P(-s, -s), ...P(s, -s), ...P(s, s), ...P(-s, s)], true, true);
    stick(g, x, y, a, stickLen(f, t.speed) * 0.8, s);
  } else {
    g.rect(x - 0.9 * u, y - 0.9 * u, 1.8 * u, 1.8 * u, false);
  }
  g.font(2.2);
  g.text(fmtAltK(t.alt, f.units), x, y + 3 * u);
  if (t.designation === 'primary' || t.locked) {
    g.ink(th.symHi, 1.2, 0.32);
    g.circle(x, y, 2.6 * u);
  } else if (t.designation === 'secondary') {
    g.ink(th.sym, 1, 0.28).dash([0.8, 0.7]);
    g.circle(x, y, 2.4 * u);
    g.dash(null);
    g.font(2, 700);
    g.text(String(t.designationIndex + 1), x + 2.6 * u, y - 2.2 * u, 'left');
  }
  // AMRAAM symbology: tail at launch (flashes once the seeker is active), X over the target in the last 8 s.
  if (t.missiles.length) {
    const m = t.missiles.reduce((a, b) => ((a.timeToImpact ?? 1e9) < (b.timeToImpact ?? 1e9) ? a : b));
    const act = missilePhase(m) === 'active';
    if (!act || blinkOn(2, f.now)) {
      g.ink(th.sym, 1, 0.26);
      const a = t.relHeading + Math.PI, sx = Math.sin(a), sy = -Math.cos(a);
      const px = -sy, py = sx;
      const c0 = 1.6 * u, c1 = 4 * u, hw = 0.55 * u;
      g.poly([x + sx * c0 + px * hw, y + sy * c0 + py * hw, x + sx * c1 + px * hw, y + sy * c1 + py * hw,
        x + sx * c1 - px * hw, y + sy * c1 - py * hw, x + sx * c0 - px * hw, y + sy * c0 - py * hw], true, false);
    }
    if (m.timeToImpact != null && m.timeToImpact <= 8) {
      g.ink(th.symHi, 1.2, 0.32);
      xMark(g, x, y, 2 * u);
    }
  }
}

/** JF-17: small track symbol with heading vector and altitude beneath; HPT gets a circle. */
function drawJfTrack(f: FrameCtx, t: PicTrack, x: number, y: number): void {
  const { g, th, u } = f;
  const col = t.friendly ? th.friendly : th.sym;
  g.ink(col, t.designation ? 1.2 : 0.9, 0.26, t.firm ? 1 : 0.75);
  if (t.friendly) g.circle(x, y, 1.1 * u, true);
  else if (t.firm) g.rect(x - 0.9 * u, y - 0.9 * u, 1.8 * u, 1.8 * u, true);
  else g.rect(x - 0.9 * u, y - 0.9 * u, 1.8 * u, 1.8 * u, false);
  if (t.firm) stick(g, x, y, t.relHeading, stickLen(f, t.speed) * 0.8, 1 * u);
  g.font(2.2);
  g.text(fmtAltK(t.alt, f.units), x, y + 3 * u);
  if (t.designation === 'primary' || t.locked) {
    g.ink(th.symHi, 1.2, 0.32);
    g.circle(x, y, 2.6 * u);
  } else if (t.designation === 'secondary') {
    g.ink(th.sym, 0.9, 0.26);
    g.font(2, 700);
    g.text('2', x + 2.2 * u, y - 1.8 * u, 'left');
  }
  if (t.missiles.length) {
    g.ink(th.sym, 0.7, 0.26);
    g.font(2);
    g.text(secs(t.missiles[0].timeToActive ?? t.missiles[0].timeToImpact), x - 2.2 * u, y - 1.8 * u, 'right');
  }
}

// ------------------------------------------------------------------ DLZ

function drawMfdDlz(f: FrameCtx, fam: MfdFamily, m: DlzMarks, closure: number | null): void {
  const { g, th, u, pic } = f;
  const d = pic.dlz;
  if (!d) return;
  const yMax = rangeY(m, d.rmax), yMin = rangeY(m, d.rmin);
  const tick = (r: number, w: number) => { const y = rangeY(m, r); g.line(m.x - w * u, y, m.x + w * u, y); };
  g.ink(th.sym, 0.9, 0.28);
  if (fam === 'hornet') {
    g.line(m.x, yMax, m.x, yMin);
    g.lw(0.34);
    tick(d.rmax, 1.4);
    g.lw(0.6);
    tick(d.rne, 1.2);
    g.lw(0.34);
    tick(d.rmin, 1.4);
  } else if (fam === 'viper') {
    const rpi = d.rpi ?? d.rmax, rtr = d.rtr ?? d.rne;
    g.line(m.x, rangeY(m, rpi), m.x, yMin);
    triUp(g, m.x, rangeY(m, rpi) - 0.2 * u, 1.6 * u, false);
    const yt = rangeY(m, rtr);
    g.rect(m.x - 0.9 * u, yt, 1.8 * u, yMin - yt, false);
    tick(d.rmin, 1.4);
  } else {
    g.line(m.x, yMax, m.x, yMin);
    tick(d.rmax, 1.2);
    tick(d.rmin, 1.2);
    const yne = rangeY(m, d.rne);
    g.ink(th.ok, 1, 0.3);
    g.rect(m.x - 0.7 * u, yne, 1.4 * u, yMin - yne, true);
  }
  // Target range caret with closure.
  const yr = rangeY(m, d.targetRange);
  g.ink(pic.shootCue ? th.symHi : th.sym, 1.1, 0.32);
  caretRight(g, m.x - 1.6 * u, yr, 1.3 * u);
  if (closure != null) {
    g.font(2.1);
    g.text(String(Math.round(speedVal(closure, f.units))), m.x - 3.3 * u, yr, 'right');
  }
}

// ------------------------------------------------------------------ texts

function drawTexts(f: FrameCtx, fam: MfdFamily, plot: Rect, prim: PicTrack | null): void {
  const { g, th, u, pic, units } = f;
  const cx = plot.x + plot.w / 2;
  const yTopLine = Y(f, 9.2), yBot = Y(f, 90.6);

  // SHOOT cue: Hornet steady inside RMAX, flashing inside RNE.
  if (fam !== 'viper' && pic.shootCue && pic.cueLabel) {
    const d = pic.dlz;
    const flash = fam === 'hornet' && d != null && d.targetRange <= d.rne;
    const on = !flash || blinkOn(2.5, f.now, 0.6);
    if (on) {
      g.ink(th.symHi, 1.3, 0.3);
      g.font(3.4, 700);
      g.text(pic.cueLabel, cx, Y(f, 15.2));
    }
  }
  if (pic.stt?.lost) {
    g.ink(th.caution, 1, 0.3);
    g.font(2.8, 700);
    g.text('MEM', cx, Y(f, 19));
  }

  g.ink(th.sym, 0.6, 0.3);
  g.font(2.6);
  if (fam === 'hornet') {
    g.text('OPR', X(f, 14), yTopLine, 'left');
    if (pic.weapon) g.text(hornetWeapon(pic.weapon.id, pic.weapon.count, pic.weapon.name), X(f, 84), yTopLine, 'right');
    g.text(`M${mach(pic.ownSpeed, pic.ownAlt).toFixed(2)}`, X(f, 14), yBot, 'left');
    g.text(fmtAltK(pic.ownAlt, units) + (units === 'metric' ? 'KM' : 'K'), X(f, 84), yBot, 'right');
    // HUD-style counter for the L&S missile: 'xx ACT' then 'xx TTG'.
    const ms = missilesAt(pic, prim?.targetId ?? pic.stt?.targetId ?? null);
    if (ms.length) {
      const m = ms[0];
      const act = missilePhase(m) !== 'toActive';
      g.ink(th.sym, 1, 0.3);
      g.font(3, 700);
      g.text(act ? `${secs(m.timeToImpact)} TTG` : `${secs(m.timeToActive)} ACT`, cx, yBot);
    }
  } else if (fam === 'viper') {
    if (prim) {
      const asp = aspectTens(prim.aspectDeg, aspectSide(prim.az, prim.relHeading));
      const trk = f.ownHeading != null ? String(Math.round(((f.ownHeading + prim.relHeading) * R2D + 720) % 360)).padStart(3, '0') : '';
      g.text(`${asp}  ${trk ? trk + '  ' : ''}${Math.round(speedVal(prim.speed, units))}  ${fmtClosure(prim.closure, units)}`, cx, yTopLine);
    }
    if (pic.weapon) g.text(viperWeapon(pic.weapon.id, pic.weapon.count), X(f, 14), yBot, 'left');
    // A / T for the missile of interest, under the DLZ scale.
    const moi = missileOfInterest(pic);
    if (moi) {
      const act = missilePhase(moi) !== 'toActive';
      g.ink(th.sym, 1, 0.3);
      g.font(2.6, 700);
      g.text(act ? `T ${secs(moi.timeToImpact)}` : `A ${secs(moi.timeToActive)}`, X(f, 84), yBot, 'right');
    }
  } else {
    // JF-17: HPT data block bottom right, TOA counter bottom left.
    if (prim) {
      const asp = aspectTens(prim.aspectDeg, aspectSide(prim.az, prim.relHeading));
      const blk = `${fmtRangeShort(prim.range, units)}${rangeUnit(units).toUpperCase()}  ${fmtClosure(prim.closure, units)}${units === 'metric' ? 'KMH' : 'KTS'}  ${asp}`;
      g.font(2.4);
      g.text(blk, X(f, 84), yBot, 'right');
    }
    const ms = missilesAt(pic, prim?.targetId ?? pic.stt?.targetId ?? null);
    const m = ms[0] ?? null;
    if (m) {
      const act = missilePhase(m) !== 'toActive';
      g.ink(th.sym, 1, 0.3);
      g.font(2.8, 700);
      g.text(act ? `TTI ${secs(m.timeToImpact)}` : `TOA ${secs(m.timeToActive)}`, X(f, 14), yBot, 'left');
    } else if (pic.weapon) {
      g.font(2.5);
      g.text(`${pic.weapon.name} ${pic.weapon.count}`, X(f, 14), yBot, 'left');
    }
  }
}
