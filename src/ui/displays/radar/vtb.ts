/**
 * [OWNER: displays] M-2000C VTB (head-down radar display), per docs/research/tomcat-thunder-mirage.md:
 * green B-scope; range (nm) top left, azimuth scan arc at the top; contacts are 'V' (closing) or
 * inverted 'Λ' (opening) with the closing speed in Mach beside tracks; the TDC 'alidade' is a '+'
 * with the beam's top / bottom altitude at the cursor range (thousands of feet); PSIC (STT) data
 * block (Mach, heading, closure kt, altitude in hundreds of feet, aspect, 'H' locked); bars and
 * own altitude / speed at the bottom with the heading scale; mode at the bottom right. The Super 530D
 * only guides from STT, so the missile counter is tied to the lock. DLZ as the HUD shows it: two
 * long-range marks (the thick one = Rne) and the short-range mark, with the range caret.
 */
import { D2R, M_PER_FT, R2D, wrap2Pi } from '../../../sim/math';
import { mach } from '../../../sim/atmosphere';
import { blinkOn } from '../surface';
import { caretRight, cross } from '../glyphs';
import {
  aspectSide, aspectTens, bscopeToScreen, fmtAltK, fmtScale, screenToBscope, secs, speedVal, type Rect,
} from '../geometry';
import {
  X, Y, brickAlpha, hit, missilesAt, primaryTrack, rangeY, visibleCoast, type DlzMarks, type FrameCtx, type Mapping, type PicTrack,
} from './common';

export function drawVtb(f: FrameCtx): Mapping {
  const { g, th, pic, u, units } = f;
  const plot: Rect = { x: X(f, 12), y: Y(f, 15), w: 74 * u, h: 67 * u };
  const gAz = pic.gimbalAz > 0 ? pic.gimbalAz : 60 * D2R;
  const map = (az: number, r: number) => bscopeToScreen(plot, gAz, pic.rangeScale, az, r);
  const y0 = plot.y, y1 = plot.y + plot.h;

  // ---- frame: corner ticks and quarter-range ticks on both edges (CRT graticule)
  g.ink(th.symDim, 0, 0.2, 0.8);
  const s: number[] = [];
  for (let k = 1; k < 4; k++) {
    const y = y1 - (plot.h * k) / 4;
    s.push(plot.x, y, plot.x + 1.2 * u, y, plot.x + plot.w, y, plot.x + plot.w - 1.2 * u, y);
  }
  for (const d of [-30, 0, 30]) { const x = map(d * D2R, 0).x; s.push(x, y1, x, y1 - 1.2 * u); }
  s.push(plot.x, y0, plot.x, y1, plot.x + plot.w, y0, plot.x + plot.w, y1);
  g.segs(s);

  // ---- azimuth scan arc (top) with beam tick
  const azL = pic.scan.azCenter - pic.scan.azHalf, azR = pic.scan.azCenter + pic.scan.azHalf;
  const pl = map(azL, 0).x, pr = map(azR, 0).x, ya = Y(f, 11);
  g.ink(th.sym, 0.8, 0.3);
  g.segs([pl, ya, pr, ya, pl, ya - 1 * u, pl, ya + 1 * u, pr, ya - 1 * u, pr, ya + 1 * u]);
  const bx = map(pic.scan.beamAz, 0).x;
  g.ink(th.sym, 1.1, 0.5);
  g.line(bx, ya - 1.4 * u, bx, ya + 1.4 * u);

  // ---- contacts
  const trackById = new Map(pic.tracks.map(t => [t.targetId, t]));
  for (const b of pic.bricks) {
    if (b.range > pic.rangeScale || Math.abs(b.az) > gAz) continue;
    if (trackById.has(b.targetId)) continue; // the track symbol replaces its echo
    const p = map(b.az, b.range);
    g.ink(th.sym, 0.8, 0.24, brickAlpha(b));
    vee(f, p.x, p.y, true);
    hit(f, p.x, p.y, b.targetId, 'brick');
  }
  g.reset();
  const prim = primaryTrack(pic);
  for (const t of pic.tracks) {
    if (t.range > pic.rangeScale * 1.001 || Math.abs(t.az) > gAz) continue;
    const p = map(t.az, t.range);
    hit(f, p.x, p.y, t.targetId, t.locked ? 'stt' : 'track');
    if (!visibleCoast(f, t)) continue;
    drawVtbTrack(f, t, p.x, p.y);
  }
  if (pic.stt && !pic.tracks.some(t => t.targetId === pic.stt?.targetId) && pic.stt.range <= pic.rangeScale) {
    const p = map(pic.stt.az, pic.stt.range);
    if (!pic.stt.lost || blinkOn(2, f.now)) {
      g.ink(th.symHi, 1.2, 0.32);
      vee(f, p.x, p.y, pic.stt.closure >= 0);
      g.rect(p.x - 2.4 * u, p.y - 2.4 * u, 4.8 * u, 4.8 * u);
    }
    hit(f, p.x, p.y, pic.stt.targetId, 'stt');
  }

  // ---- TDC alidade '+' with beam top / bottom altitude at the cursor range
  if (pic.mode !== 'stt') {
    const cp = map(pic.cursor.az, Math.min(pic.cursor.range, pic.rangeScale));
    g.ink(th.sym, 1, 0.3);
    cross(g, cp.x, cp.y, 1.8 * u);
    g.font(2.3);
    g.text(fmtAltK(pic.altCoverage.top, units), cp.x + 2.2 * u, cp.y - 1.5 * u, 'left');
    g.text(fmtAltK(pic.altCoverage.bottom, units), cp.x + 2.2 * u, cp.y + 1.7 * u, 'left');
  }

  // ---- DLZ on the right edge (HUD-style marks)
  const dm: DlzMarks = { x: X(f, 90), side: -1, yBottom: y1, yTop: y0, rangeScale: pic.rangeScale };
  if (pic.dlz) {
    const d = pic.dlz;
    g.ink(th.sym, 0.9, 0.28);
    g.line(dm.x, rangeY(dm, d.rmax), dm.x, rangeY(dm, d.rmin));
    g.lw(0.3);
    g.line(dm.x - 1.4 * u, rangeY(dm, d.rmax), dm.x + 1.4 * u, rangeY(dm, d.rmax));
    g.lw(0.8);
    g.line(dm.x - 1.4 * u, rangeY(dm, d.rne), dm.x + 1.4 * u, rangeY(dm, d.rne));
    g.lw(0.3);
    g.line(dm.x - 1.4 * u, rangeY(dm, d.rmin), dm.x + 1.4 * u, rangeY(dm, d.rmin));
    const yr = rangeY(dm, d.targetRange);
    g.ink(pic.shootCue ? th.symHi : th.sym, 1.1, 0.32);
    caretRight(g, dm.x - 2 * u, yr, 1.3 * u);
  }

  // ---- top: range, mode, PSIC data block
  g.ink(th.sym, 0.6, 0.3);
  g.font(3);
  g.text(fmtScale(pic.rangeScale, units), X(f, 4), Y(f, 5.5), 'left');
  const tgt = prim ?? null;
  if (pic.mode === 'stt' && (tgt || pic.stt)) {
    const alt = tgt?.alt ?? pic.stt?.alt ?? 0;
    const clo = tgt?.closure ?? pic.stt?.closure ?? 0;
    const asp = tgt ? aspectTens(tgt.aspectDeg, aspectSide(tgt.az, tgt.relHeading)) : String(Math.round((180 - (pic.stt?.aspectDeg ?? 0)) / 10));
    const mn = tgt ? mach(tgt.speed, alt).toFixed(1) : '';
    const hdg = tgt && f.ownHeading != null ? String(Math.round(wrap2Pi(f.ownHeading + tgt.relHeading) * R2D) % 360).padStart(3, '0') : '';
    const altTxt = units === 'metric' ? (alt / 1000).toFixed(1) : String(Math.round(alt / M_PER_FT / 100));
    g.font(2.6);
    g.text([mn, hdg, String(Math.round(speedVal(clo, units))), altTxt, asp].filter(Boolean).join('  '), X(f, 50), Y(f, 5.5));
    g.font(3, 700);
    g.text(pic.stt?.lost ? 'V' : 'H', X(f, 96), Y(f, 5.5), 'right');
  }
  if (pic.shootCue && pic.cueLabel) {
    g.ink(th.symHi, 1.3, 0.3);
    g.font(3.4, 700);
    g.text(pic.cueLabel, plot.x + plot.w / 2, y0 + 4 * u);
  }

  // ---- bottom: bars, own altitude / speed, heading scale, mode
  const yb = Y(f, 87.5);
  g.ink(th.sym, 0.6, 0.3);
  g.font(2.7);
  g.text(`${pic.scan.bars}`, X(f, 4), yb, 'left');
  g.text(`${fmtAltK(pic.ownAlt, units)}${units === 'metric' ? 'KM' : 'K'}  ${Math.round(speedVal(pic.ownSpeed, units))}`, X(f, 12.5), yb, 'left');
  g.text(pic.modeLabel || pic.mode.toUpperCase(), X(f, 96), yb, 'right');
  if (f.ownHeading != null) headingTape(f, f.ownHeading, Y(f, 94));

  // Missile counter: Super 530D time to impact (it needs the lock the whole way).
  const ms = missilesAt(pic, tgt?.targetId ?? pic.stt?.targetId ?? null);
  const all = pic.missilesInFlight;
  if (all.length) {
    const m = ms[0] ?? all[0];
    const lockOk = pic.mode === 'stt' && !pic.stt?.lost;
    const on = lockOk || blinkOn(2, f.now);
    g.ink(lockOk ? th.sym : th.caution, on ? 1.1 : 0.3, 0.3, on ? 1 : 0.4);
    g.font(3, 700);
    g.text(`T ${secs(m.timeToImpact)}`, X(f, 62), yb, 'center');
  }
  g.reset();
  return { toScreen: map, toRadar: (x, y) => screenToBscope(plot, gAz, pic.rangeScale, x, y) };
}

/** 'V' = closing, inverted 'Λ' = opening. */
function vee(f: FrameCtx, x: number, y: number, closing: boolean): void {
  const { g, u } = f;
  const w = 1.1 * u, h = 1.3 * u;
  if (closing) g.poly([x - w, y - h / 2, x, y + h / 2, x + w, y - h / 2], false);
  else g.poly([x - w, y + h / 2, x, y - h / 2, x + w, y + h / 2], false);
}

function drawVtbTrack(f: FrameCtx, t: PicTrack, x: number, y: number): void {
  const { g, th, u } = f;
  const hi = t.locked || t.designation != null;
  g.ink(hi ? th.symHi : t.friendly ? th.friendly : th.sym, hi ? 1.2 : 0.9, 0.3, t.firm ? 1 : 0.75);
  vee(f, x, y, t.closure >= 0);
  // Detection-bar tick under the symbol.
  g.line(x - 0.7 * u, y + 1.4 * u, x + 0.7 * u, y + 1.4 * u);
  if (t.firm) {
    // Closing speed in Mach beside the symbol (tentative tracks have no closure yet).
    g.font(2.2);
    g.text(Math.abs(t.closure / 340).toFixed(1), x + 1.8 * u, y, 'left');
  }
  if (t.locked) g.rect(x - 2.4 * u, y - 2.4 * u, 4.8 * u, 4.8 * u);
  if (t.friendly) { g.font(2.2, 700); g.text('A', x - 1.8 * u, y, 'right'); }
}

function headingTape(f: FrameCtx, hdg: number, y: number): void {
  const { g, th, u } = f;
  const cx = X(f, 50), span = 60, w = 60 * u;
  const hd = wrap2Pi(hdg) * R2D;
  g.ink(th.sym, 0.5, 0.24, 0.9);
  g.font(2.2);
  const s: number[] = [];
  for (let d = Math.ceil((hd - span / 2) / 10) * 10; d <= hd + span / 2; d += 10) {
    const x = cx + ((d - hd) / span) * w;
    const big = ((d % 30) + 30) % 30 === 0;
    s.push(x, y - (big ? 1.6 : 0.9) * u, x, y);
    if (big) g.text(String(Math.round(((d % 360) + 360) % 360 / 10)).padStart(2, '0'), x, y + 1.8 * u);
  }
  g.segs(s);
  g.line(cx, y - 2.2 * u, cx, y - 1.4 * u);
}
