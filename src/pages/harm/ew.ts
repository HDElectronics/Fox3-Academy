/**
 * [OWNER: page-harm displays] EwPage: the Hornet EW page (ALR-67 azimuth display, S1 fig. 231, p409-410) drawn from an
 * EwView, and the three RWR lamps (AI, CW, SAM). Simplified, as the view says: two rings (outer = searching, inner =
 * lethal / locked), each symbol at its bearing, nose up, clockwise.
 *
 * Trainer layout, not verified: which top-row buttons carry ASPJ, ALR-67, ALE-47 and ARM (drawn at 6, 7, 8, 9, each
 * as a name over its state), STEP and MODE at 18 and 17 on the bottom row, the ring radii, and the lamp colours.
 * HUD at 14 (fourth from the top on the right column) is from fig. 231.
 */
import { MfcdPage } from '../../ui/displays/a10c/mfcd';
import { lamp } from '../../ui/panels';
import { h } from '../../ui/dom';
import type { Theme } from '../../ui/theme';
import { decorate, drawHornetLegend, drawHornetOsbTicks, drawOsbHint, hornetOsbAnchor, lineText, pickOsb } from './ddi';
import type { EwView, Osb } from './types';

/** Ring radii in % of the page side (trainer layout). */
export const EW_RING_R: Readonly<[number, number]> = [34, 18];

/** Page position (in % of the side) of an emitter at bearing `azDeg` on ring `ring`: 0° at the top, clockwise. */
export function ewPoint(azDeg: number, ring: 0 | 1): { x: number; y: number } {
  const a = (azDeg * Math.PI) / 180, r = EW_RING_R[ring];
  return { x: 50 + Math.sin(a) * r, y: 52 - Math.cos(a) * r };
}

/** Top-row legends: name over state (trainer layout). */
const TOP: { osb: Osb; name: string; state: string }[] = [
  { osb: 6, name: 'ASPJ', state: 'OFF' },
  { osb: 7, name: 'ALR-67', state: 'RCV' },
  { osb: 8, name: 'ALE-47', state: 'MAN 1' },
  { osb: 9, name: 'ARM', state: '' },
];

export class EwPage extends MfcdPage<EwView> {
  private onOsb: ((n: Osb) => void) | null;
  private onClick = (e: Event): void => {
    if (!this.onOsb) return;
    const me = e as MouseEvent;
    const { x, y, s } = this.toPage(me.clientX, me.clientY);
    const n = pickOsb(x, y, s);
    if (n != null) this.onOsb(n);
  };

  constructor(canvas: HTMLCanvasElement, onOsb?: (n: Osb) => void) {
    super(canvas);
    this.onOsb = onOsb ?? null;
    if (onOsb) canvas.addEventListener('click', this.onClick);
  }

  override dispose(): void {
    if (this.onOsb) this.canvas.removeEventListener('click', this.onClick);
    this.onOsb = null;
    super.dispose();
  }

  protected paint(s: number, th: Theme): void {
    const g = this.g, u = g.u, v = this.view;
    drawHornetOsbTicks(g, th, s);

    // Top row: name over state.
    for (const t of TOP) {
      const a = hornetOsbAnchor(t.osb, s);
      g.font(2.6, 700, 7);
      g.ink(th.sym, 1, 0.3, 1);
      g.text(t.name, a.x, a.y, 'center', 'middle');
      if (t.state) g.text(t.state, a.x, a.y + 3.4 * u, 'center', 'middle');
    }
    drawHornetLegend(g, th, s, 18, 'STEP', { size: 3 });
    drawHornetLegend(g, th, s, 17, 'MODE', { size: 3 });
    drawHornetLegend(g, th, s, 14, 'HUD', { boxed: !!v?.hudOn });

    // Azimuth display: two rings, cardinal ticks, own-ship cross at the centre.
    const cx = 50 * u, cy = 52 * u, R0 = EW_RING_R[0] * u, R1 = EW_RING_R[1] * u;
    g.ink(th.symDim, 0, 0.3, 1);
    g.circle(cx, cy, R0 + 4 * u);
    g.dash([1, 1.2]);
    g.circle(cx, cy, (R0 + R1) / 2);
    g.dash(null);
    const tk: number[] = [];
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6, r0 = R0 + 4 * u, r1 = r0 - (i % 3 === 0 ? 2.4 : 1.2) * u;
      tk.push(cx + Math.sin(a) * r0, cy - Math.cos(a) * r0, cx + Math.sin(a) * r1, cy - Math.cos(a) * r1);
    }
    g.segs(tk);
    g.ink(th.sym, 1, 0.3, 1);
    g.segs([cx - 1.5 * u, cy, cx + 1.5 * u, cy, cx, cy - 2 * u, cx, cy + 1.2 * u]);

    if (!v) return;
    for (const e of v.emitters) {
      const p = ewPoint(e.azDeg, e.ring);
      g.font(3.4, 700, 8);
      g.ink(th.sym, 1, 0.3, 1);
      const b = lineText(g, e.label, p.x * u, p.y * u, 'center');
      if (e.lockedYou) {
        const ly = b.y0 - 0.6 * u;
        g.line(b.x0, ly, b.x1, ly);
        b.y0 = ly;
      }
      if (e.boxed) decorate(g, b, true, false);
    }
    if (v.hintOsb != null) drawOsbHint(g, th, s, v.hintOsb);
  }
}

/**
 * The ALR-67 threat lamps AI, CW and SAM as DOM annunciators (ui lamp). Lamp colours are the trainer's choice
 * (not verified).
 */
export function createRwrLamps(): { el: HTMLElement; set(l: EwView['lamps']): void } {
  const ai = lamp({ label: 'AI', tone: 'warning', title: 'AI: a radar has locked you' });
  const cw = lamp({ label: 'CW', tone: 'warning', title: 'CW: a missile is being guided at you' });
  const sam = lamp({ label: 'SAM', tone: 'caution', title: 'SAM threat lamp' });
  const el = h('div', { class: 'harm-lamps', role: 'group', 'aria-label': 'RWR lamps' }, ai.el, cw.el, sam.el);
  return {
    el,
    set(l) { ai.set(l.ai); cw.set(l.cw); sam.set(l.sam); },
  };
}
