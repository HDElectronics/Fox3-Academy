/**
 * Briefing: scenario, adversary, AI skill, start range and altitudes, time acceleration; the threat
 * and your jet's rules in one paragraph each, and the head-on launch zones of both sides at the
 * chosen altitudes (the in-game DLZ numbers), drawn to one scale.
 */
import type { AircraftId } from '../../data/types';
import { AIRCRAFT, AIRCRAFT_ORDER } from '../../data/aircraft';
import { MISSILE_REF_NOTE } from '../../data/missiles';
import type { AiSkill } from '../../sim/types';
import type { PageContext } from '../../app/page';
import { fmtAlt, fmtRange } from '../../app/format';
import { M_PER_FT, M_PER_NM } from '../../sim/math';
import { cruiseFor, defaultAdversary } from '../../sim/scenarios';
import {
  h, cleanup, consolePanel, segmented, select, slider, button, callout, placard, pageHeader, bindKeys, setText,
} from '../../ui';
import { briefFacts, enemyCount, SKILLS, TIME_SCALES, type SortieSetup, type ScenarioId, type TimeScale } from './setup';

export interface BriefOptions {
  ctx: PageContext;
  setup: SortieSetup;
  onFly(setup: SortieSetup): void;
}

const SVG = 'http://www.w3.org/2000/svg';
function svg(tag: string, attrs: Record<string, string | number>, text?: string): SVGElement {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (text !== undefined) el.textContent = text;
  return el;
}

export function mountBrief(host: HTMLElement, o: BriefOptions): { dispose(): void } {
  const bag = cleanup();
  const { ctx } = o;
  const ac = ctx.app.aircraft, spec = ctx.app.spec, units = ctx.app.units;
  const s: SortieSetup = { ...o.setup };
  const metric = units === 'metric';
  const rngUnit = metric ? 1000 : M_PER_NM;
  const altUnit = metric ? 1 : M_PER_FT;
  // Snap to what the sliders can show, so the brief and the fight use the numbers on screen.
  s.range = Math.round(s.range / rngUnit / 5) * 5 * rngUnit;

  const scen = segmented<ScenarioId>({
    id: 'sortie-scen', label: 'Scenario', value: s.scenario, fill: true,
    options: [
      { value: '1v1', label: '1v1', sub: 'duel' },
      { value: '1v2', label: '1v2', sub: 'vs a pair' },
      { value: '2v2', label: '2v2', sub: 'AI wingman' },
    ],
    onChange: v => { s.scenario = v; refresh(); },
  });
  const byBloc = (id: AircraftId) => (['ru', 'cn'].includes(AIRCRAFT[id].nation) ? 'Eastern' : 'Western');
  const enemySel = select<AircraftId>({
    id: 'sortie-enemy', label: 'Adversary', value: s.enemy,
    options: AIRCRAFT_ORDER.map(id => ({ value: id, label: `${AIRCRAFT[id].short}${id === defaultAdversary(ac) ? ' (default)' : ''}`, group: byBloc(id) })),
    onChange: v => { s.enemy = v; const a = snapAlt(cruiseFor(v).alt); s.enemyAlt = a * altUnit; enemyAlt.set(a); refresh(); },
  });
  const skill = segmented<AiSkill>({
    id: 'sortie-skill', label: 'AI skill', value: s.skill, fill: true,
    options: SKILLS.map(k => ({ value: k, label: k[0].toUpperCase() + k.slice(1) })),
    onChange: v => { s.skill = v; refresh(); },
  });
  const range = slider({
    id: 'sortie-range', label: 'Start range', unit: metric ? 'km' : 'nm',
    min: metric ? 40 : 25, max: metric ? 160 : 90, step: 5, value: Math.round(s.range / rngUnit / 5) * 5,
    onInput: v => { s.range = v * rngUnit; refresh(); },
  });
  const altOpts = metric ? { min: 3000, max: 12000, step: 500, unit: 'm' } : { min: 10000, max: 40000, step: 1000, unit: 'ft' };
  /** Slider value (m or ft) for an altitude in metres: on the slider's step, inside its range. */
  const snapAlt = (m: number) => Math.min(altOpts.max, Math.max(altOpts.min, Math.round(m / altUnit / altOpts.step) * altOpts.step));
  // The brief text, plan view, launch zones and the fight use the altitudes the sliders show.
  s.playerAlt = snapAlt(s.playerAlt) * altUnit;
  s.enemyAlt = snapAlt(s.enemyAlt) * altUnit;
  const fmtA = (v: number) => String(v); // no thousands comma: B612 Mono sets it full-width
  const myAlt = slider({ id: 'sortie-alt', label: 'Your altitude', ...altOpts, value: snapAlt(s.playerAlt), format: fmtA, onInput: v => { s.playerAlt = v * altUnit; refresh(); } });
  const enemyAlt = slider({ id: 'sortie-ealt', label: 'Bandit altitude', ...altOpts, value: snapAlt(s.enemyAlt), format: fmtA, onInput: v => { s.enemyAlt = v * altUnit; refresh(); } });
  const time = segmented<TimeScale>({
    id: 'sortie-tscale', label: 'Time acceleration', value: s.timeScale, fill: true,
    options: TIME_SCALES.map(v => ({ value: v, label: `${v}×`, sub: v === 1 ? 'real time' : undefined })),
    onChange: v => { s.timeScale = v; },
  });
  const fly = button({ id: 'sortie-go', label: 'Fly the sortie', variant: 'primary', size: 'l', block: true, keys: 'Enter', onClick: () => o.onFly({ ...s }) });

  // Brief text (rebuilt on every change: small).
  const title = h('h2', { class: 'sortie-brief__title' });
  const lines = h('div', { class: 'sortie-brief__lines' });
  const zonesEl = h('div', { class: 'sortie-zones' });
  const picture = h('div', { class: 'sortie-pic' });
  const best = ctx.app.getProgress(`sortie:${ac}:best`);
  const done = ctx.app.getProgress(`sortie:${ac}:done`);

  function refresh(): void {
    const f = briefFacts(ac, s, units);
    const n = enemyCount(s.scenario);
    setText(title, `${spec.short} vs ${n > 1 ? '2× ' : ''}${AIRCRAFT[s.enemy].short}${s.scenario === '2v2' ? ', with a wingman' : ''}`);
    lines.replaceChildren(
      h('dl', { class: 'sortie-facts' },
        h('dt', null, 'You'), h('dd', null, f.you),
        h('dt', null, 'Them'), h('dd', null, f.them),
        s.scenario === '2v2' ? [h('dt', null, 'Wingman'), h('dd', null, `Another ${spec.short}, veteran, 3 km off your right wing. He sorts: he takes the bandit you are not targeting.`)] : null,
        h('dt', null, 'AI'), h('dd', null, f.skill),
        h('dt', null, 'Radar'), h('dd', null, f.radar)),
      placard('Their missiles'),
      h('ul', { class: 'sortie-list' }, f.threats.map(t => h('li', null, t))),
      placard('Your jet'),
      h('ul', { class: 'sortie-list' }, f.yourJet.map(t => h('li', null, t))),
    );
    drawZones(f.zones, f.edge);
    drawPicture();
  }

  function drawZones(zones: ReturnType<typeof briefFacts>['zones'], edge: string): void {
    const maxR = Math.max(s.range, ...zones.map(z => z.rmax)) * 1.05;
    const pct = (m: number) => `${Math.min(100, (m / maxR) * 100).toFixed(1)}%`;
    zonesEl.replaceChildren(
      placard(`Head-on launch zones at these altitudes`),
      ...zones.map(z => h('div', { class: `sortie-zone sortie-zone--${z.who}` },
        h('div', { class: 'sortie-zone__label' }, h('b', null, z.who === 'you' ? 'You' : 'Him'), ` ${z.name}`),
        h('div', { class: 'sortie-zone__bar', role: 'img', 'aria-label': `${z.name}: Rne ${fmtRange(z.rne, units, 0)}, Rmax ${fmtRange(z.rmax, units, 0)}` },
          h('span', { class: 'sortie-zone__rmax', style: { width: pct(z.rmax) } }),
          h('span', { class: 'sortie-zone__rne', style: { width: pct(z.rne) } }),
          h('span', { class: 'sortie-zone__start', style: { left: pct(s.range) }, title: 'Start range' })),
        h('div', { class: 'sortie-zone__nums' }, `Rne ${fmtRange(z.rne, units, 0)} · Rmax ${fmtRange(z.rmax, units, 0)}`))),
      h('div', { class: 'sortie-zone__legend' },
        h('span', null, h('i', { class: 'sw sw--rne' }), 'no escape (Rne)'),
        h('span', null, h('i', { class: 'sw sw--rmax' }), 'max range (Rmax)'),
        h('span', null, h('i', { class: 'sw sw--start' }), `start ${fmtRange(s.range, units, 0)}`)),
      ...(edge ? [h('p', { class: 'sortie-edge' }, edge)] : []),
    );
  }

  /** Plan view of the setup: you at the bottom, the bandits ahead, ranges to scale on the centre line. */
  function drawPicture(): void {
    const W = 300, H = 210, y0 = 186, y1 = 30;
    const k = (y0 - y1) / s.range;
    const g = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'sortie-pic__svg', role: 'img', 'aria-label': 'Start picture, plan view' });
    g.append(svg('line', { x1: W / 2, y1: y0, x2: W / 2, y2: y1, class: 'pic-axis' }));
    const f = briefFacts(ac, s, units);
    for (const z of f.zones) {
      const you = z.who === 'you';
      const reach = Math.min(y0 - y1, z.rmax * k);
      const yy = you ? y0 - reach : y1 + reach;
      const x = W / 2 + (you ? -7 : 7);
      g.append(svg('line', { x1: x, y1: you ? y0 - 12 : y1 + 12, x2: x, y2: yy, class: `pic-reach pic-reach--${z.who}` }));
      if (z.rmax * k > y0 - y1) continue;
      g.append(svg('line', { x1: W / 2 - 30, y1: yy, x2: W / 2 + 30, y2: yy, class: `pic-zone pic-zone--${z.who}` }));
      g.append(svg('text', { x: you ? W / 2 + 36 : W / 2 - 36, y: yy + 4, class: `pic-txt pic-txt--${z.who}`, 'text-anchor': you ? 'start' : 'end' }, `${you ? 'your' : 'his'} Rmax`));
    }
    const jet = (x: number, y: number, up: boolean, cls: string) => {
      const d = up ? `M${x} ${y - 9} L${x + 7} ${y + 7} L${x} ${y + 3} L${x - 7} ${y + 7} Z` : `M${x} ${y + 9} L${x + 7} ${y - 7} L${x} ${y - 3} L${x - 7} ${y - 7} Z`;
      g.append(svg('path', { d, class: cls }));
    };
    jet(W / 2, y0, true, 'pic-jet pic-jet--blue');
    if (s.scenario === '2v2') jet(W / 2 + 26, y0 + 4, true, 'pic-jet pic-jet--blue');
    if (enemyCount(s.scenario) > 1) { jet(W / 2 - 14, y1, false, 'pic-jet pic-jet--red'); jet(W / 2 + 14, y1, false, 'pic-jet pic-jet--red'); }
    else jet(W / 2, y1, false, 'pic-jet pic-jet--red');
    g.append(svg('text', { x: 10, y: y0 + 4, class: 'pic-txt' }, fmtAlt(s.playerAlt, units)));
    g.append(svg('text', { x: 10, y: y1 + 4, class: 'pic-txt' }, fmtAlt(s.enemyAlt, units)));
    g.append(svg('text', { x: W - 8, y: y0 + 4, class: 'pic-txt', 'text-anchor': 'end' }, `start ${fmtRange(s.range, units, 0)}`));
    picture.replaceChildren(g);
  }

  refresh();

  const bestLine = typeof best === 'number'
    ? `Best win in the ${spec.short}: ${best} points.`
    : done ? `You have won a sortie in the ${spec.short}.` : `No win yet in the ${spec.short}.`;

  const el = h('div', { class: 'sortie-brief', id: 'sortie-brief' },
    pageHeader({
      title: 'Sortie',
      meta: `${spec.short} · ${spec.radar.name} · ${spec.module === 'fc3' ? 'FC3' : 'full fidelity'}`,
      lede: 'Fly a full BVR fight against AI that shoots back, then debrief it like Tacview: every shot, every warning, what you did about it.',
    }),
    h('div', { class: 'sortie-brief__grid' },
      consolePanel({ title: 'Mission', class: 'sortie-brief__form', children: [scen.el, enemySel.el, skill.el, range.el, myAlt.el, enemyAlt.el, time.el, fly.el, h('p', { class: 'sortie-note' }, bestLine)] }).el,
      consolePanel({ title: 'Brief', class: 'sortie-brief__text', children: [title, h('div', { class: 'sortie-brief__cols' }, h('div', null, lines), h('div', { class: 'sortie-brief__side' }, picture, zonesEl))] }).el,
    ),
    h('div', { class: 'sortie-brief__foot' },
      callout({
        kind: 'note', title: 'Sortie rules',
        body: 'Win by shooting every bandit down. The sortie ends when you are shot down, when nobody has a missile left, or at 8:00. Time drops to 1× when a missile warning comes up.',
      }),
      callout({
        kind: 'simplified',
        body: `${MISSILE_REF_NOTE} The launch zones here come from the trainer's fit of those tables. AI launch range, reaction time and notch accuracy are this trainer's picks per skill; DCS sets AI launch range in the mission editor. The AI steers on a GCI picture but needs its own radar to shoot.`,
      }),
    ),
  );
  host.append(el);
  bag.add(() => el.remove());
  bag.add(bindKeys({ Enter: () => o.onFly({ ...s }) }));
  return { dispose: () => bag.dispose() };
}
