/**
 * [OWNER: page-reference] All ten jets side by side. The selected jet is highlighted; clicking
 * another one switches the whole app to it (the page remounts and comes back to this table).
 */
import { h } from '../../ui/dom';
import { callout } from '../../ui/panels';
import { AIRCRAFT, AIRCRAFT_ORDER, MISSILES, RWRS } from '../../data';
import type { AircraftId } from '../../data/types';
import { aircraftHaystack, fox3Of, matches, rangeNum, rangeUnit, simultaneousText } from './model';
import { hl, tag, type RefCtx } from './common';

const rwrShort = (name: string) => name.replace(/\s*".*"/, '').replace(/\s*\(.*\)/, '');

export function fleetSection(rc: RefCtx): HTMLElement {
  const u = rangeUnit(rc.units);
  const rows = AIRCRAFT_ORDER.map(id => {
    const s = AIRCRAFT[id];
    const rwr = RWRS[s.rwr].name;
    const selected = id === rc.ac;
    const fox3 = fox3Of(s).map(m => MISSILES[m].name);
    const nameEl = h('span', { class: 'ref-jet__short' }, s.short);
    const btn = h('button', {
      type: 'button', class: 'ref-jet', 'aria-current': selected ? 'true' : undefined,
      title: selected ? `${s.name}: your selected jet` : `Switch to the ${s.name}`,
      onclick: () => { if (!selected) rc.switchJet(id as AircraftId, 'ref-jets'); },
    }, nameEl, h('span', { class: 'ref-jet__name' }, s.name));
    const tws = s.radar.tws;
    const tr = h('tr', { class: selected ? 'is-hl' : undefined },
      h('td', { class: 'ref-sticky' }, btn, selected ? tag('Flying', 'jet') : null),
      h('td', null, s.module === 'fc3' ? 'FC3' : 'Full', h('span', { class: 'ref-sub' }, s.developer)),
      h('td', { class: 'is-mono' }, s.radar.name),
      h('td', { class: 'is-num' }, rangeNum(s.radar.detectKm.headOn, rc.units)),
      h('td', { class: 'is-num' }, tws ? String(tws.maxTracks) : h('span', { class: 'ref-none' }, 'No TWS')),
      h('td', { class: 'is-num ref-wrap' }, simultaneousText(s)),
      h('td', { class: 'ref-list-cell' }, fox3.length ? fox3.map(n => h('span', null, n)) : h('span', { class: 'ref-none' }, 'None')),
      h('td', null, rwrShort(rwr).split(' ').flatMap((w, i) => [i ? ' ' : '', h('span', { class: 'ref-nowrap' }, w)])),
      h('td', { class: 'is-num' }, `${s.cms.chaff} / ${s.cms.flares}`));
    // Whole row is clickable with the mouse; the button carries keyboard and screen-reader use.
    if (!selected) tr.addEventListener('click', e => { if (!(e.target as HTMLElement).closest('button')) rc.switchJet(id, 'ref-jets'); });
    return { tr, nameEl, s, hay: aircraftHaystack(s, rwr) };
  });
  const empty = h('tr', { class: 'ref-empty-row', hidden: true }, h('td', { colspan: '9' }, 'No jets match the filter.'));

  const head = ['Jet', 'Module', 'Radar', `Detects (${u})`, 'TWS tracks', 'Targets at once', 'Fox 3', 'RWR', 'Chaff / flares'];
  const table = h('div', { class: 'ui-table-wrap ref-ftable', role: 'region', 'aria-label': 'All ten jets compared', tabindex: '0' },
    h('table', { class: 'ui-table ref-table' },
      h('thead', null, h('tr', null, head.map((c, i) => h('th', { scope: 'col', class: [i === 0 ? 'ref-sticky' : '', i === 3 || i === 4 || i === 5 || i === 8 ? 'is-num' : ''].filter(Boolean).join(' ') || undefined }, c)))),
      h('tbody', null, rows.map(r => r.tr), empty)));

  rc.filterable({
    section: 'ref-jets',
    apply(tokens) {
      let n = 0;
      for (const r of rows) {
        const ok = matches(r.hay, tokens);
        r.tr.hidden = !ok; if (ok) n++;
        r.nameEl.replaceChildren(...hl(r.s.short, tokens));
      }
      empty.hidden = n > 0;
      return n;
    },
  });

  return h('div', { class: 'ref-fleet' },
    h('p', null, `The ten jets this trainer flies, as DCS models their BVR kit. Your ${rc.spec.short} is highlighted; pick another row to switch the whole app to it.`),
    table,
    callout({
      kind: 'simplified',
      body: 'Detection is head-on against a fighter-size target (3 to 5 m²): the DCS AI sensor table for most radars, the Heatblur and Chuck\'s guide figures for the F-14 and M-2000C. '
        + 'ED publishes no cap on the Hornet\'s AIM-120s in flight; the trainer lets you support one per trackfile. '
        + 'Chaff and flare loads of the full-fidelity jets are not confirmed by research.',
    }));
}
