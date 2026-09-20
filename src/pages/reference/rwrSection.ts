/**
 * [OWNER: page-reference] RWR section for the selected jet: symbol → emitter table, how search /
 * lock / launch / active missile look and sound, and the points pilots get wrong.
 */
import { h, cx } from '../../ui/dom';
import { callout } from '../../ui/panels';
import { RWRS, RWR_CAVEATS } from '../../data';
import { emitterName, matches, rwrRows, type RwrRow } from './model';
import { hl, lessonLink, type RefCtx } from './common';

const CUE_LABEL = { search: 'Search', lock: 'Lock', launch: 'Launch', missile: 'Active missile' } as const;

function kindOf(row: RwrRow): string {
  if (row.airborne) return 'Airborne radar';
  const e = row.emitters;
  if (e.includes('missile') && e.some(x => x !== 'missile')) return 'Airborne radar or missile seeker';
  if (e.includes('missile')) return 'Missile seeker';
  if (e.includes('awacs')) return 'Airborne early warning';
  if (e.includes('unknown')) return 'Unidentified';
  return 'Ground radar';
}

export function rwrSection(rc: RefCtx): HTMLElement {
  const { spec } = rc;
  const rwr = RWRS[spec.rwr];
  const lamps = rwr.kind === 'lamps';
  const hat = rwr.kind === 'scope' && rwr.id !== 'jf17rwr';

  const rows = rwrRows(rwr).map(row => {
    const names = row.emitters.map(emitterName).join(', ');
    const sym = row.symbol
      ? h('span', { class: cx('ref-sym', lamps && 'ref-sym--lamp', hat && row.airborne && 'ref-sym--hat'), 'aria-label': `Symbol ${row.symbol}` }, row.symbol)
      : h('span', { class: 'ref-none' }, 'No lamp');
    const emitters = h('td', null, names);
    const tr = h('tr', null, h('td', { class: 'ref-sym-cell' }, sym), emitters, h('td', null, kindOf(row)));
    return { tr, emitters, names, hay: [row.symbol, names, kindOf(row)].join(' ') };
  });
  const cueRows = (Object.keys(CUE_LABEL) as (keyof typeof CUE_LABEL)[]).map(k => {
    const text = rwr.cues[k];
    const td = h('td', null, text);
    return { tr: h('tr', null, h('th', { scope: 'row', class: 'is-mono' }, CUE_LABEL[k]), td), td, text, hay: CUE_LABEL[k] + ' ' + text };
  });
  const empty = h('tr', { class: 'ref-empty-row', hidden: true }, h('td', { colspan: '3' }, 'No symbols match the filter.'));
  const emptyCue = h('tr', { class: 'ref-empty-row', hidden: true }, h('td', { colspan: '2' }, 'No cues match the filter.'));

  rc.filterable({
    section: 'ref-rwr',
    apply(tokens) {
      let n = 0, c = 0;
      for (const r of rows) { const ok = matches(r.hay, tokens); r.tr.hidden = !ok; if (ok) n++; r.emitters.replaceChildren(...hl(r.names, tokens)); }
      for (const r of cueRows) { const ok = matches(r.hay, tokens); r.tr.hidden = !ok; if (ok) c++; r.td.replaceChildren(...hl(r.text, tokens)); }
      empty.hidden = n > 0; emptyCue.hidden = c > 0;
      return n + c;
    },
  });

  const symTable = h('div', { class: 'ui-table-wrap', role: 'region', 'aria-label': `${rwr.name} symbols`, tabindex: '0' },
    h('table', { class: 'ui-table ref-table ref-rwrtable' },
      h('thead', null, h('tr', null,
        h('th', { scope: 'col' }, lamps ? 'Type lamp' : 'Symbol'), h('th', { scope: 'col' }, 'Emitter'), h('th', { scope: 'col' }, 'Kind'))),
      h('tbody', null, rows.map(r => r.tr), empty)));
  const cueTable = h('div', { class: 'ui-table-wrap', role: 'region', 'aria-label': `${rwr.name} cues`, tabindex: '0' },
    h('table', { class: 'ui-table ref-table ref-cuetable' },
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'State'), h('th', { scope: 'col' }, 'What you see and hear'))),
      h('tbody', null, cueRows.map(r => r.tr), emptyCue)));

  const intro = lamps
    ? `The ${spec.short} has the ${rwr.name}: a lamp panel, not a scope. It shows bearing, a type letter and the lock / launch lamp for the primary threat, and it cannot tell one fighter from another.`
    : `${rwr.name.startsWith(spec.short) ? `The ${spec.short}'s ${rwr.name.slice(spec.short.length).trim()}` : `The ${spec.short} has the ${rwr.name}`}: a round scope with the bearing and type of each emitter. How far a symbol sits from the centre is never his range; what it does mean is under Know this. ${hat ? 'Airborne emitters carry a hat above the code.' : 'Colour carries the threat state.'}`;

  return h('div', { class: 'ref-rwr' },
    h('p', null, intro),
    h('h3', null, lamps ? 'Type lamps' : 'Symbols'),
    symTable,
    h('h3', null, 'Search, lock, launch'),
    cueTable,
    h('h3', null, 'Know this'),
    h('ul', { class: 'ref-notes' }, rwr.teach.map(t => h('li', null, t))),
    callout({ kind: 'simplified', body: h('ul', null, RWR_CAVEATS[rwr.id].map(c => h('li', null, c))) }),
    h('div', { class: 'ref-links' }, lessonLink(`RWR trainer: quiz on the ${rwr.name.replace(/\s*".*"/, '')}`, 'rwr')));
}
