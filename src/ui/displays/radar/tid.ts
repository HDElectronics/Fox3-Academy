/**
 * [OWNER: displays] F-14 TID (tactical information display), per docs/research/tomcat-thunder-mirage.md:
 * round green CRT, plan view. A/C STAB (heading up, own aircraft low on the screen) or GND STAB
 * (north up; needs own heading). Own aircraft = circle with a cross and heading line. Track symbol =
 * centre dot with a half-shape above it (unknown ⊓, hostile ∧, friendly ∩), velocity vector from
 * the dot (1,800 kt ≈ 0.36 R), altitude digit on the left (tens of thousands of feet), Phoenix
 * firing-order digit 1-6 on the right, replaced by TTI after launch, which blinks once the active
 * command has gone. Extrapolated track = small X over the dot. Scan limits = two dashed lines from
 * own aircraft (dash + gap = 20 nm), one strobe in STT. Jam strobe = line to the rim with '<' at 50 nm; JAT lock
 * = bright jam strobe + 'JAT', no range. Datalink (Link 4): the datalink half-shape below the dot (unknown ⊔,
 * hostile ∨, friendly ∪); a track own radar does not hold is a dot with only that lower half, never pickable.
 */
import { M_PER_NM } from '../../../sim/math';
import { blinkOn } from '../surface';
import { cross, xMark } from '../glyphs';
import {
  fmtAltK, fmtClosure, fmtRangeShort, fmtScale, planToScreen, screenToPlan, secs, tidAltDigit, tomcatWeapon, type Pt,
} from '../geometry';
import {
  X, Y, brickAlpha, dlAlpha, dlOnly, hit, jamLock, missilePhase, primaryTrack, rangedStt, strobeAlpha, type FrameCtx, type Mapping, type PicTrack,
} from './common';

export function drawTid(f: FrameCtx): Mapping {
  const { g, th, pic, u, units } = f;
  const cx = X(f, 50), cy = Y(f, 50), R = 46 * u;
  const ground = f.opts.tidStab === 'ground';
  const rot = ground && f.ownHeading != null ? f.ownHeading : 0;
  const origin: Pt = ground ? { x: cx, y: cy } : { x: cx, y: cy + R * 0.55 };
  const pxPerM = (1.55 * R) / Math.max(1, pic.rangeScale);
  const map = (az: number, r: number) => planToScreen(origin, pxPerM, rot, az, r);
  const ctx = g.ctx;

  // ---- CRT face and bezel corners
  ctx.fillStyle = th.screen2;
  ctx.fillRect(f.ox, f.oy, f.S, f.S);
  ctx.fillStyle = th.screen;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();
  g.ink(th.screenLine, 0, 0.5);
  g.circle(cx, cy, R);

  // Corner legends (knob / mode state, weapon).
  g.ink(th.sym, 0.5, 0.3, 0.9);
  g.font(2.6);
  g.text(ground ? 'GND STAB' : 'A/C STAB', X(f, 2.5), Y(f, 3.5), 'left', 'middle');
  g.text(fmtScale(pic.rangeScale, units), X(f, 97.5), Y(f, 3.5), 'right', 'middle');
  g.text(pic.modeLabel || pic.mode.toUpperCase(), X(f, 2.5), Y(f, 96.5), 'left', 'middle');
  if (pic.weapon) g.text(tomcatWeapon(pic.weapon.id, pic.weapon.count, pic.weapon.name), X(f, 97.5), Y(f, 96.5), 'right', 'middle');

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R - 0.3 * u, 0, Math.PI * 2);
  ctx.clip();

  // ---- scan limits: dashed lines, dash + gap = 20 nm; one strobe in STT
  const dashPx = 10 * M_PER_NM * pxPerM;
  const rayEnd = (az: number) => map(az, pic.rangeScale * 2);
  if (pic.mode === 'stt' && pic.stt?.hoj) {
    // JAT: drawn below with the jam strobes.
  } else if (pic.mode === 'stt' && pic.stt) {
    const e = rayEnd(pic.stt.az);
    g.ink(th.sym, 0.6, 0.24, 0.8);
    g.line(origin.x, origin.y, e.x, e.y);
  } else {
    g.ink(th.sym, 0.5, 0.22, 0.75);
    ctx.setLineDash([dashPx, dashPx]);
    const a = rayEnd(pic.scan.azCenter - pic.scan.azHalf), b = rayEnd(pic.scan.azCenter + pic.scan.azHalf);
    g.segs([origin.x, origin.y, a.x, a.y, origin.x, origin.y, b.x, b.y]);
    ctx.setLineDash([]);
  }
  // Beam caret on the rim.
  const beamPt = rimPoint(origin, cx, cy, R, pic.scan.beamAz + rot);
  if (beamPt) {
    const ang = pic.scan.beamAz + rot;
    const sx = Math.sin(ang), sy = -Math.cos(ang);
    g.ink(th.sym, 1, 0.3);
    g.poly([beamPt.x, beamPt.y, beamPt.x - sx * 2 * u - sy * 0.9 * u, beamPt.y - sy * 2 * u + sx * 0.9 * u,
      beamPt.x - sx * 2 * u + sy * 0.9 * u, beamPt.y - sy * 2 * u - sx * 0.9 * u], true, true);
  }

  // ---- own aircraft
  g.ink(th.sym, 0.9, 0.3);
  g.circle(origin.x, origin.y, 1.4 * u);
  cross(g, origin.x, origin.y, 1.4 * u);
  const hx = Math.sin(rot) * 4 * u, hy = -Math.cos(rot) * 4 * u;
  g.line(origin.x + hx * 0.35, origin.y + hy * 0.35, origin.x + hx, origin.y + hy);

  // ---- jam strobes: a line from own aircraft toward the jammer with '<' at 50 nm (Heatblur F-14 manual, ECM)
  const jl = jamLock(pic);
  for (const s of pic.strobes) {
    if (jl && jl.targetId === s.targetId) continue;
    g.ink(th.sym, 0.7, 0.24, strobeAlpha(s));
    const p = jamStrobe(f, origin, cx, cy, R, map, s.az, rot);
    if (p) hit(f, p.x, p.y, s.targetId, 'strobe', 2.4);
    const mid = map(s.az, Math.min(pic.rangeScale, 50 * M_PER_NM) * 0.5);
    hit(f, mid.x, mid.y, s.targetId, 'strobe', 2.4);
  }
  g.reset();
  // JAT: the jam lock, a bright strobe with JAT beside the '<'; angle only (no range, altitude or aspect).
  if (jl && (!jl.lost || blinkOn(2, f.now))) {
    g.ink(th.symHi, 1.2, 0.32);
    const p = jamStrobe(f, origin, cx, cy, R, map, jl.az, rot);
    if (p) {
      g.font(2.6, 700);
      // Label on the side facing the centre of the scope, so it is not clipped by the rim.
      const left = p.x > cx;
      g.text('JAT', p.x + (left ? -2.4 : 2.4) * u, p.y + 1.6 * u, left ? 'right' : 'left');
      hit(f, p.x, p.y, jl.targetId, 'stt');
    }
  }
  g.reset();

  // ---- RWS momentary tracks (bricks)
  for (const b of pic.bricks) {
    if (b.range > pic.rangeScale * 1.6) continue;
    const p = map(b.az, b.range);
    g.ink(th.sym, 0.7, 0.24, brickAlpha(b));
    symbol(f, p.x, p.y, b.friendly ? 'friendly' : 'unknown', 1.3 * u);
    hit(f, p.x, p.y, b.targetId, 'brick');
  }
  g.reset();

  // ---- datalink tracks own radar does not hold: dot with the datalink half-shape below (Heatblur F-14 manual,
  // Link 4). Never pickable: a Phoenix needs own radar.
  for (const d of dlOnly(pic)) {
    const p = map(d.az, d.range);
    if (Math.hypot(p.x - cx, p.y - cy) > R + 2 * u) continue;
    g.ink(th.sym, 0.8, 0.26, dlAlpha(d.age));
    g.circle(p.x, p.y, 0.45 * u, true);
    dlSymbol(f, p.x, p.y, d.sovereignty, 1.5 * u);
    if (d.speed > 1) {
      const len = (d.speed / 926) * 0.36 * 46 * u;
      const a = d.relHeading + rot;
      g.line(p.x, p.y, p.x + Math.sin(a) * len, p.y - Math.cos(a) * len);
    }
    g.font(2.6);
    g.text(tidAltDigit(d.alt), p.x - 2.2 * u, p.y - 0.6 * u, 'right');
  }
  g.reset();

  // ---- track files
  const prim = primaryTrack(pic);
  for (const t of pic.tracks) {
    const p = map(t.az, t.range);
    if (Math.hypot(p.x - cx, p.y - cy) > R + 2 * u) continue;
    hit(f, p.x, p.y, t.targetId, t.locked ? 'stt' : 'track');
    drawTidTrack(f, t, p.x, p.y, rot, t === prim);
  }
  const stt = rangedStt(pic);
  if (stt && !pic.tracks.some(t => t.targetId === stt.targetId)) {
    const p = map(stt.az, stt.range);
    if (!stt.lost || blinkOn(2, f.now)) {
      g.ink(th.symHi, 1.2, 0.3);
      symbol(f, p.x, p.y, f.opts.nonFriendly, 1.5 * u);
      g.circle(p.x, p.y, 2.6 * u);
    }
    hit(f, p.x, p.y, stt.targetId, 'stt');
  }

  // Classic TID has no textual IN RNG / SHOOT cue. Geometric launch-zone detail is simplified.
  ctx.restore();

  // ---- readouts on the lower face: hooked track data, missiles
  const hook = prim ?? null;
  g.ink(th.sym, 0.6, 0.3);
  g.font(2.5);
  const yr1 = Y(f, ground ? 85 : 84.5), yr2 = Y(f, ground ? 89.5 : 89);
  if (hook) {
    const al = fmtAltK(hook.alt, units);
    g.text(`RA ${fmtRangeShort(hook.range, units)}  AL ${al}  Vc ${fmtClosure(hook.closure, units)}`, cx, yr1);
  }
  const ms = pic.missilesInFlight.slice().sort((a, b) => (a.timeToImpact ?? 1e9) - (b.timeToImpact ?? 1e9)).slice(0, 3);
  if (ms.length) {
    const parts = ms.map(m => {
      const ph = missilePhase(m);
      const mid = ph === 'toActive' ? ` A${secs(m.timeToActive)}` : ph === 'active' ? ' ACT' : '';
      return `${m.targetLabel || m.label}${mid} ${secs(m.timeToImpact)}`;
    });
    g.ink(th.sym, 0.8, 0.3);
    g.text(parts.join('   '), cx, yr2);
  }
  g.reset();
  return {
    toScreen: map,
    toRadar: (x, y) => (Math.hypot(x - cx, y - cy) > R ? null : screenToPlan(origin, pxPerM, rot, x, y)),
  };
}

/**
 * A TID jam strobe along bearing `az`: a line from own aircraft to the rim and the angle symbol '<' at 50 nm
 * (or just inside the rim when the scale is smaller). Returns the '<' position.
 */
function jamStrobe(f: FrameCtx, o: Pt, cx: number, cy: number, R: number, map: (az: number, r: number) => Pt, az: number, rot: number): Pt | null {
  const { g, u } = f;
  const ang = az + rot;
  const dx = Math.sin(ang), dy = -Math.cos(ang);
  const rim = rimPoint(o, cx, cy, R, ang);
  if (!rim) return null;
  g.line(o.x, o.y, rim.x, rim.y);
  let p = map(az, 50 * M_PER_NM);
  const maxD = Math.hypot(rim.x - o.x, rim.y - o.y) - 3.5 * u;
  if (Math.hypot(p.x - o.x, p.y - o.y) > maxD) p = { x: o.x + dx * maxD, y: o.y + dy * maxD };
  // The angle symbol '<', upright on the screen, centred on the strobe.
  g.poly([p.x + 0.9 * u, p.y - 1.2 * u, p.x - 0.9 * u, p.y, p.x + 0.9 * u, p.y + 1.2 * u], false);
  return p;
}

/** Intersection of a ray from `o` (screen angle `ang`, clockwise from up) with the CRT circle. */
function rimPoint(o: Pt, cx: number, cy: number, R: number, ang: number): Pt | null {
  const dx = Math.sin(ang), dy = -Math.cos(ang);
  const fx = o.x - cx, fy = o.y - cy;
  const b = fx * dx + fy * dy, c = fx * fx + fy * fy - R * R;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b + Math.sqrt(disc);
  return t > 0 ? { x: o.x + dx * t, y: o.y + dy * t } : null;
}

/** Dot plus the own-radar half-shape above it. */
function symbol(f: FrameCtx, x: number, y: number, kind: 'unknown' | 'hostile' | 'friendly', s: number): void {
  const { g, u } = f;
  g.circle(x, y, 0.45 * u, true);
  const top = y - 0.9 * u;
  if (kind === 'friendly') g.arc(x, top, s, Math.PI, Math.PI * 2);
  else if (kind === 'hostile') g.poly([x - s, top, x, top - s * 1.15, x + s, top], false);
  else g.poly([x - s, top, x - s, top - s, x + s, top - s, x + s, top], false);
}

/** Datalink half-shape below the dot (Heatblur): unknown ⊔, hostile ∨, friendly ∪. */
function dlSymbol(f: FrameCtx, x: number, y: number, kind: 'unknown' | 'hostile' | 'friendly', s: number): void {
  const { g, u } = f;
  const top = y + 0.9 * u;
  if (kind === 'friendly') g.arc(x, top, s, 0, Math.PI);
  else if (kind === 'hostile') g.poly([x - s, top, x, top + s * 1.15, x + s, top], false);
  else g.poly([x - s, top, x - s, top + s, x + s, top + s, x + s, top], false);
}

/**
 * IFF on the TID: a friendly reply (RIO interrogation, I key in the trainer) turns the track into the TID friendly
 * symbol ∩. The Heatblur manual's two bars above and below the return belong to the DDD, which is not drawn; tried on
 * the TID, the lower bar crossed the velocity vector and read as a cross, so the TID keeps ∩ only.
 */
function drawTidTrack(f: FrameCtx, t: PicTrack, x: number, y: number, rot: number, isPrim: boolean): void {
  const { g, th, u, pic } = f;
  const kind = t.friendly ? 'friendly' : f.opts.nonFriendly;
  const engaged = t.missiles.length > 0;
  const bright = t.locked || isPrim || engaged || t.designation != null;
  const col = bright ? th.symHi : th.sym;
  const on = !t.coasting || blinkOn(1.6, f.now, 0.7);
  g.ink(col, bright ? 1.2 : 0.85, bright ? 0.32 : 0.26, on ? (t.firm ? 1 : 0.75) : 0.35);
  symbol(f, x, y, kind, 1.5 * u);
  if (t.dl) dlSymbol(f, x, y, t.dl, 1.5 * u);
  // Velocity vector from the dot: 1,800 kt ~ 0.36 R.
  if (t.firm && t.speed > 1) {
    const len = (t.speed / 926) * 0.36 * 46 * u;
    const a = t.relHeading + rot;
    g.line(x, y, x + Math.sin(a) * len, y - Math.cos(a) * len);
  }
  if (t.coasting) xMark(g, x, y, 0.9 * u);
  // Altitude digit left, firing-order digit (or TTI) right.
  g.font(2.6);
  g.text(tidAltDigit(t.alt), x - 2.2 * u, y - 0.6 * u, 'right');
  if (engaged) {
    const m = [...t.missiles].sort((a, b) => (a.timeToImpact ?? 1e9) - (b.timeToImpact ?? 1e9))[0];
    const act = missilePhase(m) === 'active';
    if (!act || blinkOn(2, f.now)) {
      g.font(2.6, 700);
      g.text(secs(m.timeToImpact), x + 2.2 * u, y - 0.6 * u, 'left');
    }
  } else if (t.designationIndex >= 0 && t.designationIndex < 6 && pic.mode === 'tws') {
    g.font(2.6, 700);
    g.text(String(t.designationIndex + 1), x + 2.2 * u, y - 0.6 * u, 'left');
  }
  // Track number, small, below right.
  g.ink(th.symDim, 0.3, 0.26, on ? 1 : 0.4);
  g.font(2);
  g.text(t.label, x + 1.6 * u, y + 2.2 * u, 'left');
  if (t.locked) {
    g.ink(th.symHi, 1.2, 0.3);
    g.circle(x, y - 0.4 * u, 2.9 * u);
  }
}
