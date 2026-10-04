/**
 * [OWNER: page-harm] The full "ALIC Codes & RWR Symbols Appendix" of the ED F/A-18C guide (pp420-422) as a searchable
 * document: what each column is for, the radar type abbreviations, air defence and naval radars, airborne RWR symbols
 * and the other threat symbol. Data in appendix.ts.
 */
import { h, button } from '../../ui';
import { AIRBORNE, AIR_DEFENCE, APPENDIX_USE, NAVAL, OTHER_SYMBOLS, RADAR_TYPES } from './appendix';

export function buildAppendix(o: { onClose: () => void }): { el: HTMLElement; focusSearch(): void } {
  const input = h('input', {
    class: 'harm-apx__search', type: 'search', id: 'harm-apx-search', placeholder: 'Filter: code, symbol or name (e.g. 107, SD, Hawk)',
    'aria-label': 'Filter the appendix',
  }) as HTMLInputElement;
  const cell = (v: string | number | null) => h('td', null, v === null || v === '' ? '—' : String(v));
  const adRows = AIR_DEFENCE.map(r => ({ text: `${r.id ?? ''} ${r.cls ?? ''} ${r.rwr} ${r.nato} ${r.system} ${r.radar} ${r.type}`.toLowerCase(),
    el: h('tr', { class: r.id === null ? 'is-noid' : '' }, cell(r.id), cell(r.cls), h('td', { class: 'harm-mono' }, r.rwr || '—'), cell(r.nato), cell(r.system), cell(r.radar), cell(r.type)) }));
  const navRows = NAVAL.map(r => ({ text: `${r.id ?? ''} ${r.cls ?? ''} ${r.rwr} ${r.ship} ${r.type} ${r.designation}`.toLowerCase(),
    el: h('tr', { class: r.id === null ? 'is-noid' : '' }, cell(r.id), cell(r.cls), h('td', { class: 'harm-mono' }, r.rwr), cell(r.ship), cell(r.type), cell(r.designation)) }));
  const airRows = AIRBORNE.map(([s, a]) => ({ text: `${s} ${a}`.toLowerCase(), el: h('tr', null, h('td', { class: 'harm-mono' }, s), h('td', null, a)) }));
  const all = [...adRows, ...navRows, ...airRows];
  const table = (head: string[], rows: { el: HTMLElement }[]) => h('div', { class: 'harm-brief__table' },
    h('table', { class: 'harm-table harm-apx__table' }, h('thead', null, h('tr', null, head.map(x => h('th', null, x)))), h('tbody', null, rows.map(r => r.el))));
  const filter = () => {
    const q = input.value.trim().toLowerCase();
    for (const r of all) r.el.hidden = !!q && !q.split(/\s+/).every(w => r.text.includes(w));
  };
  input.addEventListener('input', filter);

  const el = h('article', { class: 'harm-brief harm-apx', 'aria-label': 'ALIC codes and RWR symbols appendix' },
    h('header', { class: 'harm-brief__head' },
      h('p', { class: 'harm-brief__eyebrow' }, 'ED F/A-18C guide · pp420-422'),
      h('h2', null, 'ALIC codes and RWR symbols'),
      h('ul', { class: 'harm-brief__list' }, Object.values(APPENDIX_USE).map(t => h('li', null, t))),
      h('p', { class: 'harm-small' }, 'A dash means the guide leaves the cell blank. A radar with no ID cannot be programmed for PB; it can still show on the RWR and in TOO.'),
      h('div', { class: 'harm-row' }, input, button({ label: 'Close', size: 's', onClick: o.onClose }).el)),
    h('section', null, h('h3', null, 'Air defence radars'), table(['ID (PB)', 'Class (TOO)', 'RWR', 'NATO', 'System', 'Radar', 'Type'], adRows)),
    h('section', null, h('h3', null, 'Naval radars'), table(['ID (PB)', 'Class (TOO)', 'RWR', 'Ship class', 'Type', 'Designation'], navRows)),
    h('section', null, h('h3', null, 'Airborne radars (RWR only)'), table(['RWR', 'Aircraft'], airRows)),
    h('section', null, h('h3', null, 'Other threat symbol'),
      h('p', null, OTHER_SYMBOLS.map(([s, t, w]) => `${s}: ${t} (${w}).`).join(' '))),
    h('section', null, h('h3', null, 'Radar types'),
      h('p', { class: 'harm-small' }, Object.entries(RADAR_TYPES).map(([k, v]) => `${k} ${v}`).join(' · '))),
  );
  return { el, focusSearch: () => input.focus() };
}
