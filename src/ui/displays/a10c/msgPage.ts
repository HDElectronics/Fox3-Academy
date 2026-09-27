/**
 * [OWNER: displays] A10cMsgPage: the MSG page on an A-10C II MFCD with the digital 9-line as received over SADL
 * (docs/research/cas-jets.md §2, a10c.md §4). Draws the title and the 9-line fields, WILCO at OSB 19 and CNTCO at
 * OSB 7 (verified). The answer given shows as a filled legend (the other dims). The line layout is the trainer's;
 * the exact page art was not verified.
 */
import type { Theme } from '../../theme';
import type { MsgPageView } from './types';
import { MfcdPage, drawOsb, drawOsbTicks, type OsbLabel } from './mfcd';

export const MSG_WILCO_OSB = 19;
export const MSG_CNTCO_OSB = 7;

/** OSB legends for the MSG page state. */
export function msgOsbLabels(state: MsgPageView['state']): OsbLabel[] {
  return [
    { osb: MSG_WILCO_OSB, text: 'WILCO', style: state === 'wilco' ? 'inverse' : 'plain', dim: state === 'cntco' },
    { osb: MSG_CNTCO_OSB, text: 'CNTCO', style: state === 'cntco' ? 'inverse' : 'plain', dim: state === 'wilco' },
  ];
}

export class A10cMsgPage extends MfcdPage<MsgPageView> {
  protected paint(s: number, th: Theme): void {
    const v = this.view;
    const g = this.g, u = g.u;
    drawOsbTicks(g, th, s);
    if (!v) return;
    for (const l of msgOsbLabels(v.state)) drawOsb(g, th, s, l);

    g.ink(th.sym, 0, 0.3, 1);
    g.font(3.8, 700, 9);
    g.text(v.title, s / 2, s * 0.15);
    g.ink(th.symDim, 0, 0.3, 1);
    g.line(s * 0.2, s * 0.19, s * 0.8, s * 0.19);

    const x0 = s * 0.2, xv = s * 0.34, xr = s * 0.8;
    const n = Math.max(1, v.lines.length);
    const step = Math.min(6.2 * u, (s * 0.62) / n);
    let y = s * 0.24 + step / 2;
    for (const l of v.lines) {
      g.ink(th.symDim, 0, 0.3, 1);
      g.font(3, 700, 8);
      g.text(l.label, x0, y, 'left');
      g.ink(th.sym, 0, 0.3, 1);
      let size = 3.2;
      g.font(size, 400, 8);
      while (size > 2 && g.measure(l.value) > xr - xv) { size -= 0.2; g.font(size, 400, 7); }
      g.text(l.value, xv, y, 'left');
      y += step;
    }
  }
}
