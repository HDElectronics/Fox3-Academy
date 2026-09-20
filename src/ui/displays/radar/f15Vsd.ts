/**
 * [OWNER: displays] F-15C VSD (vertical situation display), FC3, per docs/research/f15c-fc3.md:
 * green B-scope with a 4x4 grid, range number top-right, PDT data top-left (TAS, aspect, heading),
 * elevation scale on the left with coverage circles and altitudes at the TDC range and a '<' antenna
 * caret, azimuth scale at the bottom with scan-limit circles and a 'V' caret, LRS bricks, TWS tracks
 * (filled brick + altitude + aspect stick; SDT hollow; PDT star), DLZ on the right (Raero triangle,
 * Rpi / Rtr bars, Rmin, range caret with closure), stores code 'A4C' and the HUD-style 'T tta tti'
 * / 'M tti' missile counter.
 */
import { D2R, R2D, wrap2Pi } from '../../../sim/math';
import { blinkOn } from '../surface';
import { asterisk, brick, caretDown, caretLeft, caretRight, star, stick, triUp } from '../glyphs';
import {
  aspectSide, aspectTens, bscopeToScreen, f15StoresCode, fmtAltK, fmtScale, fmtVsdAlt, rangeVal, screenToBscope, secs,
  speedVal, type Rect,
} from '../geometry';
import { AIRCRAFT } from '../../../data/aircraft';
import {
  X, Y, brickAlpha, hit, missilePhase, missilesAt, primaryTrack, rangeY, stickLen, visibleCoast, type DlzMarks, type FrameCtx, type Mapping,
  type PicTrack,
} from './common';

export function drawF15Vsd(f: FrameCtx): Mapping {
  const { g, th, pic, u, units } = f;
  const plot: Rect = { x: X(f, 16), y: Y(f, 12), w: 67 * u, h: 68 * u };
  const gAz = pic.gimbalAz > 0 ? pic.gimbalAz : 60 * D2R;
  const map = (az: number, r: number) => bscopeToScreen(plot, gAz, pic.rangeScale, az, r);

  // ---- grid (4 x 4) and corner marks, no glow: it is the CRT raster, not symbology
  g.ink(th.symDim, 0, 0.18, 0.55);
  const s: number[] = [];
  for (let k = 1; k < 4; k++) {
    const x = plot.x + (plot.w * k) / 4, y = plot.y + (plot.h * k) / 4;
    s.push(x, plot.y, x, plot.y + plot.h, plot.x, y, plot.x + plot.w, y);
  }
  g.segs(s);
  g.ink(th.symDim, 0, 0.22, 0.8);
  const c = 2.2 * u, x0 = plot.x, x1 = plot.x + plot.w, y0 = plot.y, y1 = plot.y + plot.h;
  g.segs([x0, y0, x0 + c, y0, x0, y0, x0, y0 + c, x1, y0, x1 - c, y0, x1, y0, x1, y0 + c,
    x0, y1, x0 + c, y1, x0, y1, x0, y1 - c, x1, y1, x1 - c, y1, x1, y1, x1, y1 - c]);

  // Scan limits: faint dotted verticals in the plot (the real VSD shows them only on the azimuth scale).
  const azL = pic.scan.azCenter - pic.scan.azHalf, azR = pic.scan.azCenter + pic.scan.azHalf;
  g.ink(th.sym, 0, 0.16, 0.28).dash([0.5, 1.4]);
  const pl = map(azL, 0), pr = map(azR, 0);
  g.segs([pl.x, plot.y, pl.x, plot.y + plot.h, pr.x, plot.y, pr.x, plot.y + plot.h]);
  g.dash(null);

  // ---- elevation scale (left)
  const ex = X(f, 11), eyT = Y(f, 16), eyB = Y(f, 76);
  const elY = (el: number) => eyB - (eyB - eyT) * (0.5 + Math.max(-60, Math.min(60, el * R2D)) / 120);
  g.ink(th.sym, 0.6, 0.22);
  g.segs([ex, eyT, ex, eyB, ex - 1 * u, eyT, ex + 1 * u, eyT, ex - 1 * u, eyB, ex + 1 * u, eyB,
    ex - 1.4 * u, elY(0), ex + 1.4 * u, elY(0), ex - 0.6 * u, elY(30 * D2R), ex, elY(30 * D2R), ex - 0.6 * u, elY(-30 * D2R), ex, elY(-30 * D2R)]);
  // Antenna elevation caret '<'.
  g.ink(th.sym, 1, 0.3);
  caretLeft(g, ex + 0.5 * u, elY(pic.scan.beamEl), 1.5 * u);
  // Coverage circles at the scan's upper and lower elevation, with altitudes at the TDC range.
  const spec = AIRCRAFT[pic.aircraftType];
  const halfCov = ((Math.max(1, pic.scan.bars) * (spec?.radar.barSpacingDeg ?? 2.5)) / 2) * D2R;
  const yTop = elY(pic.scan.elCenter + halfCov), yBot = elY(pic.scan.elCenter - halfCov);
  g.ink(th.sym, 0.8, 0.22);
  g.circle(ex, yTop, 0.7 * u);
  g.circle(ex, yBot, 0.7 * u);
  g.font(2.5);
  const covTop = fmtAltK(pic.altCoverage.top, units), covBot = fmtAltK(pic.altCoverage.bottom, units);
  const yTopT = Math.min(yTop, yBot - 3.2 * u), yBotT = Math.max(yBot, yTop + 3.2 * u);
  g.text(covTop, ex - 1.4 * u, yTopT, 'right');
  g.text(covBot, ex - 1.4 * u, yBotT, 'right');

  // ---- azimuth scale (bottom)
  const ay = Y(f, 84.5);
  g.ink(th.sym, 0.6, 0.22);
  const ticks: number[] = [plot.x, ay, plot.x + plot.w, ay];
  for (const d of [-60, -30, 0, 30, 60]) {
    const p = map(d * D2R, 0);
    const tl = d === 0 ? 1.4 : 0.8;
    ticks.push(p.x, ay, p.x, ay + tl * u);
  }
  g.segs(ticks);
  // Scan-limit circles and beam 'V' caret.
  g.ink(th.sym, 0.9, 0.24);
  g.circle(pl.x, ay, 0.7 * u);
  g.circle(pr.x, ay, 0.7 * u);
  g.ink(th.sym, 1.1, 0.34);
  caretDown(g, map(pic.scan.beamAz, 0).x, ay - 0.4 * u, 1.6 * u);

  // ---- contacts
  for (const b of pic.bricks) {
    if (b.range > pic.rangeScale || Math.abs(b.az) > gAz) continue;
    const p = map(b.az, b.range);
    g.ink(th.sym, 0.8, 0.2, brickAlpha(b));
    brick(g, p.x, p.y, 2.8 * u, 1.3 * u, true);
    hit(f, p.x, p.y, b.targetId, 'brick');
  }
  g.reset();

  const prim = primaryTrack(pic);
  const shooting = pic.shootCue;
  const order = [...pic.tracks].sort((a, b) => rankOf(b) - rankOf(a));
  for (const t of order) {
    if (t.range > pic.rangeScale * 1.001 || Math.abs(t.az) > gAz) continue;
    const p = map(t.az, t.range);
    hit(f, p.x, p.y, t.targetId, t.locked ? 'stt' : 'track');
    if (!visibleCoast(f, t)) continue;
    drawTrack(f, t, p.x, p.y, t === prim, shooting);
  }
  // STT target not in the track list (radar builds only the lock).
  if (pic.stt && !pic.tracks.some(t => t.targetId === pic.stt?.targetId) && pic.stt.range <= pic.rangeScale) {
    const p = map(pic.stt.az, pic.stt.range);
    const on = !pic.stt.lost || blinkOn(2, f.now);
    if (on) {
      g.ink(th.symHi, 1.2, 0.34);
      asterisk(g, p.x, p.y, 2.3 * u);
      g.font(2.5);
      g.text(fmtAltK(pic.stt.alt, units), p.x, p.y - 3.4 * u);
    }
    hit(f, p.x, p.y, pic.stt.targetId, 'stt');
  }

  // ---- TDC: two short vertical bars
  const cp = map(pic.cursor.az, Math.min(pic.cursor.range, pic.rangeScale));
  g.ink(th.sym, 1, 0.34);
  g.segs([cp.x - 1 * u, cp.y - 1.6 * u, cp.x - 1 * u, cp.y + 1.6 * u, cp.x + 1 * u, cp.y - 1.6 * u, cp.x + 1 * u, cp.y + 1.6 * u]);

  // ---- ASE circle with steering dot and angle-off bar (dashed in TWS, solid in STT)
  const tgt = prim ?? null;
  if (tgt && pic.dlz) {
    const cx = plot.x + plot.w / 2, cy = plot.y + plot.h / 2, R = 7.5 * u;
    g.ink(th.sym, 0.5, 0.22, 0.7).dash(pic.mode === 'stt' ? null : [1.2, 1]);
    g.circle(cx, cy, R);
    g.dash(null);
    const dx = Math.max(-1, Math.min(1, tgt.az / (25 * D2R))) * R * 0.9;
    g.ink(th.sym, 1, 0.3);
    g.circle(cx + dx, cy, 0.75 * u, true);
    const a = tgt.relHeading; // top = target going away, bottom = hot
    g.line(cx + Math.sin(a) * R, cy - Math.cos(a) * R, cx + Math.sin(a) * (R + 1.6 * u), cy - Math.cos(a) * (R + 1.6 * u));
  }

  // ---- DLZ (right edge, on the display range scale)
  const dm: DlzMarks = { x: X(f, 90.5), side: -1, yBottom: plot.y + plot.h, yTop: plot.y, rangeScale: pic.rangeScale };
  if (pic.dlz) drawF15Dlz(f, dm, pic.dlz, tgt?.closure ?? pic.stt?.closure ?? null);

  // ---- text: top row
  g.ink(th.sym, 0.7, 0.3);
  g.font(3);
  g.text(fmtScale(pic.rangeScale, units), X(f, 96), Y(f, 5.5), 'right');
  const pd = tgt ?? null;
  if (pd) {
    const tas = Math.round(speedVal(pd.speed, units));
    const asp = aspectTens(pd.aspectDeg, aspectSide(pd.az, pd.relHeading));
    const hdg = f.ownHeading != null ? String(Math.round(wrap2Pi(f.ownHeading + pd.relHeading) * R2D) % 360).padStart(3, '0') : '';
    g.font(2.8);
    g.text(`${tas}  ${asp}${hdg ? '  ' + hdg : ''}`, X(f, 4), Y(f, 5.5), 'left');
    // Target altitude '29-9' beside the elevation scale, at the target's elevation.
    const el = Math.atan2(pd.alt - pic.ownAlt, Math.max(1, pd.range));
    let ty = elY(el);
    if (Math.abs(ty - yTopT) < 2.6 * u || Math.abs(ty - yBotT) < 2.6 * u) ty = Math.max(yBotT, yTopT) + 3 * u;
    g.font(2.4);
    g.text(fmtVsdAlt(pd.alt, units), ex + 1.6 * u, ty, 'left');
  }
  if (pic.shootCue && pic.cueLabel) {
    // The F-15C has no SHOOT text: a flashing star (AIM-120 / AIM-9) or triangle (AIM-7), as under the HUD TD box.
    const cx = plot.x + plot.w / 2, cy = Y(f, 5.5);
    if (blinkOn(2.5, f.now, 0.6)) {
      g.ink(th.symHi, 1.3, 0.34);
      if (pic.cueLabel === '*') star(g, cx, cy, 2 * u, true);
      else if (pic.cueLabel === '▲') triUp(g, cx, cy - 1.6 * u, 3 * u, true);
      else { g.font(3.2, 700); g.text(pic.cueLabel, cx, cy, 'center'); }
    }
  } else if (pic.mode === 'stt' && pic.stt?.lost) {
    g.ink(th.caution, 1, 0.3);
    g.font(2.8);
    g.text('MEM', plot.x + plot.w / 2, Y(f, 5.5), 'center');
  }

  // ---- bottom rows
  g.ink(th.sym, 0.7, 0.3);
  g.font(2.8);
  const yb1 = Y(f, 90), yb2 = Y(f, 95.5);
  g.text(pic.modeLabel || pic.mode.toUpperCase(), X(f, 4), yb1, 'left');
  g.font(2.4);
  g.text(`${pic.scan.bar + 1}`, X(f, 4) + g.measure('MMMM') * 1.02, yb1, 'left');
  g.font(2.8);
  g.text(`G ${Math.round(speedVal(pic.ownSpeed, units))}`, X(f, 4), yb2, 'left');
  if (pic.weapon) g.text(f15StoresCode(pic.weapon.id, pic.weapon.count, pic.weapon.name), X(f, 96), yb1, 'right');
  if (pd) g.text(`${rangeVal(pd.range, units).toFixed(0)}`, X(f, 96), yb2, 'right');

  // Missile counter for the PDT/STT target: 'T tta tti' while on datalink, then 'M tti' (F-15C HUD format).
  const ms = missilesAt(pic, pd?.targetId ?? pic.stt?.targetId ?? null);
  if (ms.length) {
    const m = ms[0];
    const ph = missilePhase(m);
    // AMRAAM: 'T tta tti' on datalink, 'M tti' once active. SARH / IR: seconds to impact.
    const txt = ph === 'toActive' ? `T ${secs(m.timeToActive)} ${secs(m.timeToImpact)}` : ph === 'active' ? `M ${secs(m.timeToImpact)}` : `${secs(m.timeToImpact)} SEC`;
    const on = blinkOn(1.5, f.now, 0.7);
    g.ink(th.sym, on ? 1.1 : 0.4, 0.3, on ? 1 : 0.55);
    g.font(3, 700);
    g.text(txt, plot.x + plot.w / 2, yb1, 'center');
    if (ms.length > 1 || pic.missilesInFlight.length > 1) {
      g.font(2.3);
      g.ink(th.symDim, 0.3, 0.3);
      g.text(`${pic.missilesInFlight.length} AWAY`, plot.x + plot.w / 2, yb2, 'center');
    }
  } else if (pic.missilesInFlight.length) {
    g.font(2.3);
    g.ink(th.symDim, 0.3, 0.3);
    g.text(`${pic.missilesInFlight.length} AWAY`, plot.x + plot.w / 2, yb2, 'center');
  }
  g.reset();

  return {
    toScreen: map,
    toRadar: (x, y) => screenToBscope(plot, gAz, pic.rangeScale, x, y),
  };
}

function rankOf(t: PicTrack): number {
  return t.locked ? 3 : t.designation === 'primary' ? 2 : t.designation === 'secondary' ? 1 : 0;
}

function drawTrack(f: FrameCtx, t: PicTrack, x: number, y: number, isPrim: boolean, shooting: boolean): void {
  const { g, th, u, units } = f;
  const alt = fmtAltK(t.alt, units);
  if (t.friendly) {
    g.ink(th.sym, 0.9, 0.26);
    g.circle(x, y, 1.1 * u, true);
    stick(g, x, y, t.relHeading, stickLen(f, t.speed), 1.1 * u);
    g.font(2.4);
    g.text(alt, x, y - 3 * u);
    return;
  }
  if (isPrim || t.locked) {
    // PDT / STT target: asterisk with a longer velocity vector. Flashes when the shot is valid.
    const on = !shooting || blinkOn(2.5, f.now, 0.6);
    g.ink(th.symHi, on ? 1.3 : 0.4, 0.36, on ? 1 : 0.35);
    asterisk(g, x, y, 2.2 * u);
    if (t.firm) stick(g, x, y, t.relHeading, stickLen(f, t.speed, 1.6), 2.2 * u);
    g.font(2.5);
    g.ink(th.symHi, 0.9, 0.3);
    g.text(alt, x, y - 3.6 * u);
    if (t.locked && f.pic.mode === 'stt') {
      g.ink(th.symHi, 0.9, 0.26);
      g.circle(x, y, 3.2 * u);
    }
    return;
  }
  if (t.designation === 'secondary') {
    g.ink(th.sym, 1, 0.34);
    brick(g, x, y, 3 * u, 1.5 * u, false);
    if (t.firm) stick(g, x, y, t.relHeading, stickLen(f, t.speed), 0.9 * u);
    g.font(2.4);
    g.text(alt, x, y - 2.9 * u);
    g.font(2.1, 700);
    g.text(String(t.designationIndex + 1), x + 2.6 * u, y + 1.7 * u, 'left');
  } else if (t.firm) {
    g.ink(th.sym, 0.9, 0.26);
    brick(g, x, y, 2.8 * u, 1.3 * u, true);
    stick(g, x, y, t.relHeading, stickLen(f, t.speed), 0.8 * u);
    g.font(2.4);
    g.text(alt, x, y - 2.7 * u);
  } else {
    // Tentative track (one hit, no velocity yet): thin hollow brick.
    g.ink(th.sym, 0.5, 0.18, 0.75);
    brick(g, x, y, 2.6 * u, 1.2 * u, false);
  }
  const ms = t.missiles;
  if (ms.length) {
    g.font(2.1);
    g.ink(th.sym, 0.6, 0.26, 0.9);
    g.text(secs(ms[0].timeToImpact), x - 2 * u, y + 2.4 * u, 'right');
  }
}

/** F-15C DLZ: Raero triangle at the top (we use Rmax), bars for Rpi, Rtr (else Rne) and Rmin, caret '>' with closure. */
function drawF15Dlz(f: FrameCtx, m: DlzMarks, d: NonNullable<FrameCtx['pic']['dlz']>, closure: number | null): void {
  const { g, th, u, units } = f;
  const yMax = rangeY(m, d.rmax), yMin = rangeY(m, d.rmin);
  g.ink(th.sym, 0.8, 0.26);
  g.line(m.x, yMax, m.x, yMin);
  const bar = (r: number, w: number) => { const y = rangeY(m, r); g.line(m.x - w * u, y, m.x + 0.6 * u, y); };
  g.ink(th.sym, 1, 0.42);
  triUp(g, m.x, yMax - 0.2 * u, 1.8 * u, true);
  if (d.rmax > m.rangeScale) triUp(g, m.x, m.yTop - 3.4 * u, 1.4 * u, false);
  if (d.rpi != null) bar(d.rpi, 1.6);
  bar(d.rtr ?? d.rne, 2.2);
  bar(d.rmin, 1.6);
  // Range caret with closure.
  const yr = rangeY(m, d.targetRange);
  const inZone = d.targetRange <= d.rmax && d.targetRange >= d.rmin;
  g.ink(inZone ? th.symHi : th.sym, 1.1, 0.34);
  caretRight(g, m.x - 0.8 * u, yr, 1.4 * u);
  if (closure != null) {
    g.font(2.2);
    g.text(String(Math.round(speedVal(closure, units))), m.x - 2.6 * u, yr, 'right');
  }
}
