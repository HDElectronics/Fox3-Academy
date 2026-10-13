/** Hornet STORES format. ED guide pp. 331–334; spacing is the trainer's simplified layout. */
import { MfcdPage } from '../../ui/displays/a10c/mfcd';
import type { Theme } from '../../ui/theme';
import { drawHornetLegend, drawHornetOsbTicks } from '../harm/ddi';
import type { JdamSession } from './model';

export interface JdamStoresView { session: JdamSession; fuzeMenu: boolean }

export class JdamStoresDdi extends MfcdPage<JdamStoresView> {
  protected paint(s: number, th: Theme): void {
    const g = this.g, u = g.u, v = this.view;
    drawHornetOsbTicks(g, th, s);
    if (!v) return;
    const j = v.session, spent = ['flight', 'hit', 'miss'].includes(j.phase);
    drawHornetLegend(g, th, s, 6, 'J-82', { boxed: j.selected });
    if (v.fuzeMenu) {
      drawHornetLegend(g, th, s, 5, 'OFF', { boxed: j.efuz === 'OFF' });
      drawHornetLegend(g, th, s, 3, 'INST', { boxed: j.efuz === 'INST' });
    } else if (j.selected) {
      drawHornetLegend(g, th, s, 5, 'MODE');
      drawHornetLegend(g, th, s, 3, 'EFUZ');
    }
    g.ink(th.symDim, .5, .4, 1);
    // Same stylised Hornet wingform and station spacing as the HARM STORES page.
    g.segs([50*u,30*u,50*u,70*u,47*u,46*u,12*u,52*u,53*u,46*u,88*u,52*u,
      47*u,52*u,14*u,54*u,53*u,52*u,86*u,54*u,43*u,66*u,57*u,66*u]);
    const text = (label: string, x: number, y: number, size = 3.2) => {
      g.ink(th.sym, 1, .3, 1); g.font(size, 700, 8); g.text(label,x*u,y*u,'center','middle');
    };
    text(j.masterArm ? 'ARM' : 'SAFE', 50, 24, 5);
    if (j.selected && !v.fuzeMenu) { text(j.mode, 13, 20); text(j.efuz, 14, 50); }
    text('3',36,60);
    if (!spent) {
      text('J-82',36,65);
      if (j.selected) { g.rect(30*u,62.5*u,12*u,5*u); text(j.status,36,72); }
    }
    if (j.selected && !spent) {
      text(j.status,20,11,3);
      if (j.timing) {
        const clock = j.alignmentClock;
        text(`TIMING ${Math.floor(clock/60)}:${String(Math.floor(clock%60)).padStart(2,'0')}`,50,35,3);
      }
      if (j.inRange) text('IN RNG',77,16,3);
      else if (j.phase === 'approach') text(`${Math.ceil(j.timer)} TMR`,77,16,3);
    }
    text(`EFUZ ${j.efuz}`,25,82,3);
    text('MAN',75,82,3);
    text('STORES',50,95,3);
  }
}
