/**
 * [OWNER: displays] FC3 Su-27 / Su-33 / J-11A / MiG-29 ИЛС BVR radar picture (stylised on black glass),
 * per docs/research/ru-fc3.md:
 *  - left: vertical range scale with the scale value on top; in the zone, three thick inward ticks
 *    Rmax / Rtr (our Rne) / Rmin and an arrow at the current range (closure beside it);
 *  - centre: azimuth x range picture, contacts as rows of dots (IFF friendly = second row), radar
 *    cursor = two short vertical bars (MiG-29 strobe 8° wide) that snaps onto the designated track;
 *    STT target = circle (Su) or diamond (MiG), aspect line, flashing at 2 Hz after launch;
 *    MiG-29S СНП2: primary diamond, secondary cross, Ц1 / Ц2 at the bottom;
 *  - right: fixed ±60° elevation scale with the scan's elevation-coverage bar;
 *  - bottom: azimuth-coverage bar with the beam caret, mode label 'СНП ДВБ' lower left, weapon
 *    '27ЭР' lower right, ПР when launch is authorised.
 * The missile counter at the bottom is a trainer addition (ED documents no TTI on the ИЛС).
 */
import { D2R, R2D } from '../../../sim/math';
import { AIRCRAFT } from '../../../data/aircraft';
import { blinkOn } from '../surface';
import { caretDown, caretLeft, cross, diamond, missileIcon, stick } from '../glyphs';
import { bscopeToScreen, fmtScale, ruWeaponLabel, screenToBscope, secs, speedVal, type Rect } from '../geometry';
import {
  X, Y, brickAlpha, hit, missilePhase, missilesAt, primaryTrack, rangeY, stickLen, visibleCoast, type DlzMarks, type FrameCtx, type Mapping,
  type PicTrack,
} from './common';

export function drawRuHud(f: FrameCtx): Mapping {
  const { g, th, pic, u, units } = f;
  const mig = f.aircraft === 'mig29s';
  const plot: Rect = { x: X(f, 21), y: Y(f, 15), w: 60 * u, h: 64 * u };
  const gAz = pic.gimbalAz > 0 ? pic.gimbalAz : 60 * D2R;
  const map = (az: number, r: number) => bscopeToScreen(plot, gAz, pic.rangeScale, az, r);
  const y0 = plot.y, y1 = plot.y + plot.h;

  // ---- range scale (left)
  const rx = X(f, 13);
  g.ink(th.sym, 0.9, 0.3);
  const rs: number[] = [rx, y0, rx, y1];
  for (let k = 0; k <= 4; k++) { const y = y1 - (plot.h * k) / 4; rs.push(rx - (k % 2 ? 0.8 : 1.4) * u, y, rx, y); }
  g.segs(rs);
  g.font(3.1);
  g.text(fmtScale(pic.rangeScale, units), rx, Y(f, 9.8), 'center');

  const dm: DlzMarks = { x: rx, side: 1, yBottom: y1, yTop: y0, rangeScale: pic.rangeScale };
  const prim = primaryTrack(pic);
  if (pic.dlz) {
    const d = pic.dlz;
    g.ink(th.sym, 1.1, 0.8);
    for (const r of [d.rmax, d.rne, d.rmin]) { const y = rangeY(dm, r); g.line(rx, y, rx + 2.4 * u, y); }
    const yr = rangeY(dm, d.targetRange);
    g.ink(th.symHi, 1.2, 0.34);
    caretLeft(g, rx + 3.4 * u, yr, 1.6 * u);
    g.line(rx + 3.4 * u, yr, rx + 5.4 * u, yr);
    const clo = prim?.closure ?? pic.stt?.closure ?? null;
    if (clo != null) {
      g.font(2.3);
      g.text(String(Math.round(speedVal(clo, units))), rx + 6 * u, yr, 'left');
    }
  }

  // ---- scan-zone limits: brackets on the picture edges
  const azL = pic.scan.azCenter - pic.scan.azHalf, azR = pic.scan.azCenter + pic.scan.azHalf;
  const pl = map(azL, 0).x, pr = map(azR, 0).x;
  g.ink(th.sym, 0.6, 0.26, 0.85);
  const bk = 1.8 * u;
  g.segs([pl, y0, pl + bk, y0, pl, y0, pl, y0 + bk, pr, y0, pr - bk, y0, pr, y0, pr, y0 + bk,
    pl, y1, pl + bk, y1, pl, y1, pl, y1 - bk, pr, y1, pr - bk, y1, pr, y1, pr, y1 - bk]);

  // ---- contacts: rows of dots
  for (const b of pic.bricks) {
    if (b.range > pic.rangeScale || Math.abs(b.az) > gAz) continue;
    const p = map(b.az, b.range);
    g.ink(th.sym, 0.9, 0.2, brickAlpha(b));
    dots(f, p.x, p.y, false);
    hit(f, p.x, p.y, b.targetId, 'brick');
  }
  g.reset();
  const ordered = [...pic.tracks].sort((a, b) => w(a) - w(b));
  for (const t of ordered) {
    if (t.range > pic.rangeScale * 1.001 || Math.abs(t.az) > gAz) continue;
    const p = map(t.az, t.range);
    hit(f, p.x, p.y, t.targetId, t.locked ? 'stt' : 'track');
    if (!visibleCoast(f, t)) continue;
    drawRuTrack(f, t, p.x, p.y, mig);
  }
  if (pic.stt && !pic.tracks.some(t => t.targetId === pic.stt?.targetId) && pic.stt.range <= pic.rangeScale) {
    const p = map(pic.stt.az, pic.stt.range);
    const fired = missilesAt(pic, pic.stt.targetId).length > 0;
    if ((!pic.stt.lost && !fired) || blinkOn(2, f.now)) {
      g.ink(th.symHi, 1.2, 0.34);
      if (mig) diamond(g, p.x, p.y, 2.6 * u); else g.circle(p.x, p.y, 2.4 * u);
      dots(f, p.x, p.y, false);
    }
    hit(f, p.x, p.y, pic.stt.targetId, 'stt');
  }

  // ---- radar cursor: two short vertical bars (snaps onto the designated track)
  if (pic.mode !== 'stt') {
    const snap = f.opts.manualCursor ? undefined : pic.tracks.find(t => t.designation === 'primary');
    const cp = snap ? map(snap.az, snap.range) : map(pic.cursor.az, Math.min(pic.cursor.range, pic.rangeScale));
    const half = mig ? Math.max(1.2 * u, (plot.w * (4 * D2R)) / (2 * gAz)) : 1.8 * u;
    g.ink(snap ? th.symHi : th.sym, 1.1, 0.36);
    g.segs([cp.x - half, cp.y - 2 * u, cp.x - half, cp.y + 2 * u, cp.x + half, cp.y - 2 * u, cp.x + half, cp.y + 2 * u]);
  }

  // ---- elevation scale (right), ±60° fixed, with the scan elevation-coverage bar
  const ex = X(f, 88);
  const elY = (el: number) => y1 - plot.h * (0.5 + Math.max(-60, Math.min(60, el * R2D)) / 120);
  g.ink(th.sym, 0.8, 0.28);
  g.segs([ex, y0, ex, y1,
    ex, y0, ex - 1.6 * u, y0, ex, y1, ex - 1.6 * u, y1, ex, elY(0), ex - 2 * u, elY(0),
    ex, elY(12 * D2R), ex + 1.2 * u, elY(12 * D2R), ex, elY(-12 * D2R), ex + 1.2 * u, elY(-12 * D2R)]);
  const spec = AIRCRAFT[pic.aircraftType];
  const halfCov = ((Math.max(1, pic.scan.bars) * (spec?.radar.barSpacingDeg ?? 2.5)) / 2) * D2R;
  g.ink(th.sym, 1.1, 0.9);
  g.line(ex + 1.9 * u, elY(pic.scan.elCenter + halfCov), ex + 1.9 * u, elY(pic.scan.elCenter - halfCov));
  // Target altitude (km) beside the scale, at the target's elevation.
  const tgt = prim ?? null;
  const tAlt = tgt?.alt ?? pic.stt?.alt ?? null;
  const tRange = tgt?.range ?? pic.stt?.range ?? null;
  if (tAlt != null && tRange != null) {
    const el = Math.atan2(tAlt - pic.ownAlt, Math.max(1, tRange));
    g.ink(th.symHi, 0.9, 0.3);
    g.font(2.6);
    g.text(units === 'metric' ? (tAlt / 1000).toFixed(1) : String(Math.round(tAlt / 0.3048 / 1000)), ex + 3.4 * u, elY(el), 'left');
  }

  // ---- azimuth-coverage bar (bottom) with the beam caret, expected range under it
  const ay = Y(f, 84.5);
  const axL = map(-gAz, 0).x, axR = map(gAz, 0).x;
  g.ink(th.sym, 0.8, 0.26);
  g.segs([axL, ay, axR, ay, axL, ay - 1.2 * u, axL, ay + 1.2 * u, axR, ay - 1.2 * u, axR, ay + 1.2 * u,
    map(0, 0).x, ay + 0.6 * u, map(0, 0).x, ay + 1.6 * u]);
  g.ink(th.sym, 1.1, 0.9);
  g.line(pl, ay, pr, ay);
  g.ink(th.sym, 1.1, 0.34);
  caretDown(g, map(pic.scan.beamAz, 0).x, ay - 1 * u, 1.5 * u);
  g.font(2.5);
  g.ink(th.sym, 0.7, 0.3);
  g.text(fmtScale(pic.cursor.range, units), axR, ay + 3.4 * u, 'right');

  // ---- labels
  // MiG-29S with two designated tracks is in СНП2 (TWS2).
  const snp2 = mig && pic.mode === 'tws' && pic.tracks.filter(t => t.designation).length >= 2;
  const modeTxt = snp2 ? 'СНП2' : ruModeLabel(pic.modeLabel, pic.mode);
  g.font(3.1);
  g.text(modeTxt, X(f, 4), Y(f, 92), 'left');
  g.font(2.7);
  g.text('ИЗЛ', X(f, 4), Y(f, 86.5), 'left');
  if (pic.weapon) {
    g.font(3.1);
    g.text(ruWeaponLabel(pic.weapon.id, pic.weapon.name), X(f, 97), Y(f, 92), 'right');
    g.font(2.5);
    g.text(String(pic.weapon.count), X(f, 97), Y(f, 86.5), 'right');
  }

  // ПР (launch authorised); Ц1 / Ц2 in СНП2.
  const twoTgt = mig && pic.tracks.filter(t => t.designation).length >= 2;
  if (pic.shootCue) {
    g.ink(th.symHi, 1.4, 0.34);
    g.font(4.4, 700);
    g.text(pic.cueLabel || 'ПР', X(f, 51), Y(f, 90.4));
    if (twoTgt) {
      g.font(3);
      g.text('Ц1  Ц2', X(f, 51), Y(f, 95.8));
    }
  }
  // Missiles in flight (trainer addition): icon, 'А' seconds to active for ARH, seconds to impact.
  if (pic.missilesInFlight.length && !(pic.shootCue && twoTgt)) {
    const m = [...pic.missilesInFlight].sort((a, b) => (a.timeToImpact ?? 1e9) - (b.timeToImpact ?? 1e9))[0];
    const s = missilePhase(m) === 'toActive' ? `А${secs(m.timeToActive)}  ${secs(m.timeToImpact)}` : secs(m.timeToImpact);
    g.ink(th.sym, 0.9, 0.28);
    g.font(2.7);
    const tx = X(f, 53);
    missileIcon(g, tx - 5 * u, Y(f, 95.8), 3.2 * u);
    g.text(s + (pic.missilesInFlight.length > 1 ? `  ×${pic.missilesInFlight.length}` : ''), tx - 3 * u, Y(f, 95.8), 'left');
  }
  g.reset();
  return { toScreen: map, toRadar: (x, y) => screenToBscope(plot, gAz, pic.rangeScale, x, y) };
}

function w(t: PicTrack): number {
  return t.locked ? 3 : t.designation === 'primary' ? 2 : t.designation ? 1 : 0;
}

/** 'СНП' -> 'СНП ДВБ' (BVR suffix for the search/track modes, as the FC3 HUD prints it). */
export function ruModeLabel(label: string, mode: string): string {
  const l = label || mode.toUpperCase();
  if ((mode === 'rws' || mode === 'tws' || mode === 'stt') && !/ДВБ/.test(l)) return `${l} ДВБ`;
  return l;
}

/** A contact as a row of two dots (fighter-size RCS); `friendly` adds the IFF row above. */
function dots(f: FrameCtx, x: number, y: number, friendly: boolean): void {
  const { g, u } = f;
  // Small bezels need more than a ~2.5 CSS-pixel dot diameter. Enlarge the entire
  // mark toward its 320px-display size so the dots and IFF rows stay separated.
  // Cap the boost for tiny displays; larger displays keep their proportional size.
  // These are CSS pixels: Surface already handles the device-pixel ratio.
  const markU = Math.max(u, Math.min(3.2, u * 1.5));
  const r = 0.55 * markU, d = 0.85 * markU;
  g.circle(x - d, y, r, true);
  g.circle(x + d, y, r, true);
  if (friendly) { g.circle(x - d, y - 1.5 * markU, r, true); g.circle(x + d, y - 1.5 * markU, r, true); }
}

function drawRuTrack(f: FrameCtx, t: PicTrack, x: number, y: number, mig: boolean): void {
  const { g, th, u, pic } = f;
  const fired = t.missiles.length > 0;
  if (t.locked) {
    // STT: circle (Su-27) / diamond (MiG-29) with the aspect line; flashes at 2 Hz after launch.
    const lost = pic.stt?.targetId === t.targetId && pic.stt.lost;
    const on = !(fired || lost) || blinkOn(2, f.now);
    g.ink(th.symHi, on ? 1.3 : 0.3, 0.36, on ? 1 : 0.25);
    if (mig) diamond(g, x, y, 2.6 * u); else g.circle(x, y, 2.4 * u);
    if (t.firm) stick(g, x, y, t.relHeading, stickLen(f, t.speed, 1.3), mig ? 2.6 * u : 2.4 * u);
    dots(f, x, y, t.friendly);
    return;
  }
  const des = t.designation;
  g.ink(des ? th.symHi : th.sym, des ? 1.2 : 0.9, 0.28, t.firm ? 1 : 0.7);
  dots(f, x, y, t.friendly);
  if (t.firm) stick(g, x, y, t.relHeading, stickLen(f, t.speed, 0.8), 1.4 * u);
  if (mig && des === 'primary' && pic.tracks.filter(tr => tr.designation).length >= 2) diamond(g, x, y, 2.4 * u);
  else if (mig && des === 'secondary') cross(g, x, y, 2.4 * u);
}
