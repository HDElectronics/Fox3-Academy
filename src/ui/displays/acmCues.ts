/**
 * [OWNER: displays] Close-combat HUD cues over the gun sight: the ACM mode area and the jet's own cue (FC3 / F-15C
 * VS lines, BORE circle, HELMET ring flashing at 2 Hz for ПР with an X when outside the gimbal, Fi0 cross, Hornet
 * dashed BST / GACQ circles and VACQ lines, F-16 10×60 reference line and BORE cross, F-14 PLM / VSL, JF-17 VT / BS,
 * M-2000C boresight / vertical), the IR missile seeker circle, the lock box and a text cue for the tone. The scan
 * area itself is drawn dim as a trainer aid (DCS does not draw every area). Pure model + a draw function that
 * GunSightDisplay calls; angles in degrees in the HUD frame of sim/acm.ts.
 */
import type { World } from '../../sim/world';
import type { Aircraft } from '../../sim/types';
import type { AcmArea, AcmCue } from '../../data/acm';
import { MISSILES } from '../../data/missiles';
import { acmAngles, irShotCheck, modeSpec, offBoresightDeg, seekerAim, type AcmState, type IrTone, type SeekerMode } from '../../sim/acm';
import type { Gfx } from './surface';
import { blinkOn } from './surface';
import type { Theme } from '../theme';

export interface AcmPicture {
  modeName: string | null;
  cue: AcmCue;
  area: AcmArea | null;
  /** Dashed cue (Hornet BST / GACQ / VACQ). */
  dashed: boolean;
  sensor: 'RDR' | 'IRST' | 'SEEKER' | null;
  locked: { az: number; el: number } | null;
  seeker: { az: number; el: number; mode: SeekerMode; tone: IrTone };
  /** FC3: the seeker shows as the fixed Fi0 cross, not a circle. */
  fc3: boolean;
  /** HELMET ring on the target direction (padlock view): flashes for ПР, X outside the seeker gimbal. */
  helmet: { az: number; el: number; outside: boolean } | null;
  /** Launch authorised in the zone (FC3 ПР, others the high tone with the shot in the zone). */
  ready: boolean;
  missile: string;
}

export function buildAcmPicture(world: World, me: Aircraft, st: AcmState): AcmPicture {
  const spec = modeSpec(st);
  const fc3 = st.jet.ir.readyCue.value === 'ПР';
  const t = world.get(st.lockedId);
  const la = t && t.alive ? acmAngles(me, t.pos) : null;
  const aim = seekerAim(world, me, st);
  const shot = irShotCheck(world, me, st);
  let helmet: AcmPicture['helmet'] = null;
  if (spec?.cue === 'helmet') {
    const tgt = world.get(st.helmetLookId);
    if (tgt && tgt.alive) {
      const a = acmAngles(me, tgt.pos);
      const gimbal = MISSILES[st.jet.ir.missile].seekerGimbalDeg ?? 45;
      if (a.ahead) helmet = { az: a.az, el: a.el, outside: offBoresightDeg(me, tgt.pos) > gimbal };
    } else helmet = { az: 0, el: 0, outside: false };
  }
  return {
    modeName: spec?.name ?? null,
    cue: spec?.cue ?? 'none',
    area: spec?.area.value ?? null,
    dashed: spec ? ['bst', 'gacq', 'vacq'].includes(spec.id) : false,
    sensor: spec ? (spec.sensor === 'radar' ? 'RDR' : spec.sensor === 'irst' ? 'IRST' : 'SEEKER') : null,
    locked: la && la.ahead ? { az: la.az, el: la.el } : null,
    seeker: { az: aim.az, el: aim.el, mode: st.seeker.mode, tone: st.seeker.tone },
    fc3, helmet,
    ready: shot.ok && shot.inZone,
    missile: MISSILES[st.jet.ir.missile].name,
  };
}

export interface HudProj {
  /** Pixel x / y of an angle (deg) off the gun line. */
  X(azDeg: number): number;
  Y(elDeg: number): number;
  cx: number;
  cy: number;
  /** Symbol unit (px). */
  u: number;
  /** Text box corners. */
  box: { l: number; r: number; t: number; b: number };
  fs: number;
  /** Text line height (px). */
  lineH: number;
}

/** Draw the ACM and seeker cues. Call inside GunSightDisplay's render, after the gun sight. */
export function drawAcm(g: Gfx, th: Theme, p: HudProj, pic: AcmPicture): void {
  const { X, Y, u } = p;
  const ink = th.sym, dim = th.symDim, hi = th.symHi;
  const a = pic.area;
  // Scan area: trainer aid, dim.
  if (a && pic.cue !== 'helmet') {
    g.ink(dim, 0, 0.22, 0.55).dash([1.2, 1.2]);
    if (a.kind === 'box') g.rect(X(a.az[0]), Y(a.el[1]), X(a.az[1]) - X(a.az[0]), Y(a.el[0]) - Y(a.el[1]));
    else if (pic.cue !== 'circle' && pic.cue !== 'dashed-circle') g.circle(X(a.az), Y(a.el), Math.abs(X(a.az + a.radiusDeg) - X(a.az)));
    g.dash(null);
  }
  // The jet's own cue, bright.
  g.ink(ink, 1, 0.3).dash(pic.dashed ? [2, 1.4] : null);
  if (a) {
    switch (pic.cue) {
      case 'lines':
        if (a.kind === 'box') g.segs([X(a.az[0]), Y(a.el[0]), X(a.az[0]), Y(a.el[1]), X(a.az[1]), Y(a.el[0]), X(a.az[1]), Y(a.el[1])]);
        break;
      case 'circle':
      case 'dashed-circle':
        if (a.kind === 'cone') g.circle(X(a.az), Y(a.el), Math.max(1.2 * u, Math.abs(X(a.az + a.radiusDeg) - X(a.az))));
        break;
      case 'line':
        if (a.kind === 'box') g.line(X(0), Y(a.el[0]), X(0), Y(a.el[1]));
        break;
      case 'cross': {
        const cx = a.kind === 'cone' ? X(a.az) : X(0), cy = a.kind === 'cone' ? Y(a.el) : Y(0);
        if (pic.sensor !== 'SEEKER') g.segs([cx - 1.6 * u, cy, cx + 1.6 * u, cy, cx, cy - 1.6 * u, cx, cy + 1.6 * u]);
        break;
      }
      default: break;
    }
  }
  g.dash(null);
  // HELMET ring: on the target direction (padlock), flashing at 2 Hz for ПР; X above it outside the gimbal.
  if (pic.helmet) {
    // Trainer aid: keep the ring and its X visible when the look direction is outside the HUD.
    const r = 3.2 * u;
    const hx = Math.max(p.box.l + r, Math.min(p.box.r - r, X(pic.helmet.az)));
    const hy = Math.max(p.box.t + r + 2.6 * u, Math.min(p.box.b - r, Y(pic.helmet.el)));
    if (!pic.ready || blinkOn(2)) { g.ink(ink, 1, 0.35); g.circle(hx, hy, r); }
    if (pic.helmet.outside) { g.ink(hi, 1, 0.35); const y = hy - r - 1.6 * u; g.segs([hx - u, y - u, hx + u, y + u, hx - u, y + u, hx + u, y - u]); }
  }
  // Lock box.
  if (pic.locked) {
    const lx = X(pic.locked.az), ly = Y(pic.locked.el), b = 2.8 * u;
    g.ink(hi, 1, 0.35); g.rect(lx - b, ly - b, 2 * b, 2 * b);
  }
  // IR seeker: FC3 Fi0 is a fixed cross on the boresight; Western jets a circle, on the target once slaved or tracking.
  const s = pic.seeker;
  const col = s.tone === 'lock' ? hi : ink;
  if (pic.fc3) {
    const sx = X(0), sy = Y(0);
    if (pic.sensor === 'SEEKER') { g.ink(col, 1, 0.3); g.segs([sx - 2.2 * u, sy, sx - 0.6 * u, sy, sx + 0.6 * u, sy, sx + 2.2 * u, sy, sx, sy - 2.2 * u, sx, sy - 0.6 * u, sx, sy + 0.6 * u, sx, sy + 2.2 * u]); }
  } else {
    const sx = X(s.az), sy = Y(s.el);
    g.ink(col, 1, s.tone === 'lock' ? 0.4 : 0.3); g.circle(sx, sy, 1.9 * u);
  }
  // Text: mode and sensor top right; a caption for the audio tone (trainer text, the tone itself is audio).
  g.font(p.fs);
  if (pic.modeName) { g.ink(ink, 0.8, 0.3); g.text(`${pic.modeName.toUpperCase()} ${pic.sensor ?? ''}`.trim(), p.box.r, p.box.t, 'right', 'top'); }
  const toneTxt = s.tone === 'lock' ? 'TONE' : s.tone === 'growl' ? 'GROWL' : '';
  if (toneTxt) { g.ink(s.tone === 'lock' ? hi : dim, 0.8, 0.3); g.text(toneTxt, p.box.r, p.box.t + p.lineH, 'right', 'top'); }
  // ПР is the FC3 HUD cue; Western jets have only the high tone (captioned above), so nothing is invented here.
  if (pic.ready && pic.fc3) {
    g.ink(hi, 1.2, 0.3); g.font(p.fs * 1.3, 700);
    g.text('ПР', p.box.r, p.cy, 'right', 'middle');
  }
  g.reset();
}
