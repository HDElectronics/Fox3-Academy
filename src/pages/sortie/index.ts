/**
 * Sortie (#/sortie): the capstone. Brief → fly a full BVR engagement against AI that shoots back →
 * Tacview-style debrief with coaching.
 *
 * Query params (for links and screenshots):
 *   ?ac=<AircraftId>      select the jet once on mount
 *   ?shot=fly&t=80        open the fly screen after a scripted pre-roll of t sim seconds
 *   ?shot=debrief&t=120   fly the whole sortie with the scripted pilot, open the debrief at t
 *   ?shot=debrief&view=radar   show the player's recorded radar estimates instead of truth
 *   ?scenario=1v1|1v2|2v2&enemy=<id>&skill=rookie|regular|veteran|ace&range=<km>
 *   ?sams=0|1|2&sam=sa10|sa11|sa15   SAM sites on the bandits' side
 */
import './style.css';
import type { Page, PageContext, PageFactory } from '../../app/page';
import type { AircraftId } from '../../data/types';
import { AIRCRAFT } from '../../data/aircraft';
import type { AiSkill } from '../../sim/types';
import { h } from '../../ui';
import { jetKeyMap } from './keys';
import { parseSetup, SKILLS, RANGE_MAX_M, RANGE_MIN_M, type SortieSetup } from './setup';
import { cruiseFor } from '../../sim/scenarios';
import { mountBrief } from './brief';
import { mountFly, type FlyOutcome } from './fly';
import { mountDebrief } from './debrief';
import { simulateSortie } from './headless';

function applyParams(s: SortieSetup, p: URLSearchParams): SortieSetup {
  const out = { ...s };
  const sc = p.get('scenario');
  if (sc === '1v1' || sc === '1v2' || sc === '2v2') out.scenario = sc;
  const en = p.get('enemy');
  // A different adversary flies at its own cruise altitude, as when you pick it in the brief.
  if (en && Object.hasOwn(AIRCRAFT, en) && en !== out.enemy) { out.enemy = en as AircraftId; out.enemyAlt = cruiseFor(out.enemy).alt; }
  const sk = p.get('skill');
  if (sk && SKILLS.includes(sk as AiSkill)) out.skill = sk as AiSkill;
  const r = Number(p.get('range'));
  if (r > 0 && isFinite(r)) out.range = Math.min(RANGE_MAX_M, Math.max(RANGE_MIN_M, r * 1000));
  const n = p.get('sams');
  if (n === '0' || n === '1' || n === '2') out.sams = Number(n) as 0 | 1 | 2;
  const st = p.get('sam');
  if (st === 'sa10' || st === 'sa11' || st === 'sa15') out.samType = st;
  return out;
}

const factory: PageFactory = (): Page => {
  let screen: { dispose(): void } | null = null;
  let host: HTMLElement | null = null;
  let alive = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();

  return {
    mount(ctx: PageContext) {
      const acParam = ctx.params.get('ac');
      if (acParam && Object.hasOwn(AIRCRAFT, acParam) && acParam !== ctx.app.aircraft) {
        // The router remounts the page for the new jet; build nothing now.
        ctx.app.setAircraft(acParam as AircraftId);
        return;
      }
      alive = true;
      const ac = ctx.app.aircraft;
      const keymap = jetKeyMap(ac);
      const setupKey = `sortie:${ac}:setup`;
      let setup = applyParams(parseSetup(ac, ctx.app.getProgress(setupKey)), ctx.params);
      host = h('div', { class: 'sortie-page' });
      ctx.root.append(host);

      const show = (make: (el: HTMLElement) => { dispose(): void }) => {
        screen?.dispose();
        screen = null;
        if (!alive || !host) return;
        host.replaceChildren();
        window.scrollTo(0, 0);
        screen = make(host);
      };
      /** Screens switch outside the frame loop that asked for it. */
      const later = (fn: () => void) => {
        const id = setTimeout(() => { timers.delete(id); if (alive) fn(); }, 0);
        timers.add(id);
      };
      const brief = () => show(el => mountBrief(el, {
        ctx, setup,
        onFly: s => { setup = s; ctx.app.setProgress(setupKey, JSON.stringify({ ...s, seed: 1 })); later(() => fly()); },
      }));
      const fly = (prerollS?: number) => show(el => mountFly(el, {
        ctx, setup, keymap, prerollS,
        onEnd: o => later(() => debrief(o)),
        onBrief: () => later(brief),
      }));
      const debrief = (o: FlyOutcome, startAt?: number) => show(el => mountDebrief(el, {
        ctx, outcome: o, startAt,
        onAgain: () => later(() => fly()),
        onBrief: () => later(brief),
      }));

      const shot = ctx.params.get('shot');
      const t = ctx.params.get('t');
      if (shot === 'fly') {
        fly(t !== null ? Number(t) : 75);
        if (ctx.params.get('keys') === '1') host.querySelector('details.sortie-keys')?.setAttribute('open', '');
      }
      else if (shot === 'debrief') debrief(simulateSortie(ac, setup, ctx.app.units), t !== null ? Number(t) : undefined);
      else brief();
    },
    unmount() {
      alive = false;
      for (const id of timers) clearTimeout(id);
      timers.clear();
      screen?.dispose();
      screen = null;
      host?.remove();
      host = null;
    },
  };
};

export default factory;
