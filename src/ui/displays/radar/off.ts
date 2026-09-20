/**
 * [OWNER: displays] Radar-off / no-picture screen for every format: dark glass with the format's
 * frame hint and a standby legend.
 */
import type { DisplayFormat } from '../../../data/types';
import type { RadarPicture } from '../../../sim/types';
import { X, Y, type FrameCtx } from './common';

export function drawOff(f: Omit<FrameCtx, 'pic'>, format: DisplayFormat, pic: RadarPicture | null): void {
  const { g, th, u } = f;
  const ru = format === 'ru-hud';
  if (format === 'tid') {
    const ctx = g.ctx;
    ctx.fillStyle = th.screen2;
    ctx.fillRect(f.ox, f.oy, f.S, f.S);
    ctx.fillStyle = th.screen;
    ctx.beginPath();
    ctx.arc(X(f, 50), Y(f, 50), 46 * u, 0, Math.PI * 2);
    ctx.fill();
    g.ink(th.screenLine, 0, 0.5);
    g.circle(X(f, 50), Y(f, 50), 46 * u);
  }
  g.ink(th.symDim, 0.3, 0.3, 0.9);
  g.font(3.2);
  // Radar off: standby legend. No picture at all (not drawn yet, own jet dead): empty glass.
  const label = pic ? (ru ? 'ИЗЛ ОТКЛ' : 'STBY') : '';
  if (label) g.text(label, X(f, 50), Y(f, 50));
  g.reset();
}
