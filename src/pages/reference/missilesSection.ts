/**
 * [OWNER: page-reference] Missile table: all seventeen missiles, filter by this jet / all and by
 * Fox number, sortable columns, expandable rows with the DCS behaviour notes.
 */
import { h, setAttr, type Child } from '../../ui/dom';
import { segmented, button } from '../../ui/controls';
import { callout } from '../../ui/panels';
import { MISSILES, MISSILE_REF_NOTE, AIRCRAFT, sourcesFor } from '../../data';
import type { MissileId, MissileSpec } from '../../data/types';
import {
  ALL_MISSILES, MIDCOURSE_LABEL, SEEKER_LABEL, carriersOfMissile, filterMissiles, rangeNum, rangeUnit, sortMissiles,
  type MissileFilter, type MissileSort, type MissileSortKey,
} from './model';
import { hl, tag, type RefCtx } from './common';

interface Col { key: MissileSortKey | 'rule'; label: string; sub?: string; num?: boolean; title?: string }

/** Default direction when a column is first sorted: longest / newest first for numbers. */
const NUMERIC: MissileSortKey[] = ['fox', 'loft', 'pitbull', 'hi', 'cold', 'lo'];

export interface MissilesSection { el: HTMLElement; expand(id: MissileId): void }

export function missilesSection(rc: RefCtx): MissilesSection {
  const { ac, spec, units } = rc;
  const u = rangeUnit(units);
  const own = new Set(spec.missiles);
  const state: MissileFilter & { sort: MissileSort; open: Set<MissileId> } = {
    scope: 'jet', fox: 0, tokens: [], sort: { key: 'fox', dir: 1 }, open: new Set(),
  };

  const cols: Col[] = [
    { key: 'name', label: 'Missile' },
    { key: 'nato', label: 'NATO' },
    { key: 'fox', label: 'Fox', num: true },
    { key: 'seeker', label: 'Seeker' },
    { key: 'midcourse', label: 'Midcourse' },
    { key: 'loft', label: 'Loft' },
    { key: 'pitbull', label: 'Pitbull', sub: u, num: true, title: 'Seeker goes active about this far from the target (ARH only; ED does not publish it)' },
    { key: 'hi', label: 'High hot', sub: u, num: true, title: 'ED launch table: 10 km (33,000 ft), head-on' },
    { key: 'cold', label: 'High cold', sub: u, num: true, title: 'ED launch table: 10 km, target running away' },
    { key: 'lo', label: 'Low hot', sub: u, num: true, title: 'ED launch table: 1 km (3,300 ft), head-on' },
    { key: 'rule', label: 'Guidance rule' },
  ];

  // ---- header with sort buttons
  const sortBtns = new Map<MissileSortKey, { th: HTMLElement; btn: HTMLButtonElement }>();
  const headRow = h('tr', null, cols.map(c => {
    const th = h('th', { scope: 'col', class: [c.num ? 'is-num' : '', c.key === 'name' ? 'ref-sticky' : '', c.key === 'rule' ? 'ref-col-rule' : ''].filter(Boolean).join(' '), title: c.title });
    if (c.key === 'rule') { th.append(c.label); return th; }
    const key = c.key;
    const btn = h('button', { type: 'button', class: 'ref-sort', onclick: () => sortBy(key) },
      h('span', null, c.label), c.sub ? h('span', { class: 'ref-sort__unit' }, c.sub) : null,
      h('span', { class: 'ref-sort__ind', 'aria-hidden': 'true' }));
    th.append(btn);
    sortBtns.set(key, { th, btn });
    return th;
  }));

  const tbody = h('tbody');
  const table = h('div', { class: 'ui-table-wrap ref-mtable', role: 'region', 'aria-label': 'Missiles', tabindex: '0' },
    h('table', { class: 'ui-table ref-table' }, h('thead', null, headRow), tbody));

  function sortBy(key: MissileSortKey) {
    if (state.sort.key === key) state.sort = { key, dir: state.sort.dir === 1 ? -1 : 1 };
    else state.sort = { key, dir: NUMERIC.includes(key) && key !== 'fox' ? -1 : 1 };
    render();
  }

  const count = h('span', { class: 'ref-count-line', 'aria-live': 'polite' });
  const scope = segmented<'jet' | 'all'>({
    id: 'ref-msl-scope', ariaLabel: 'Which missiles', size: 's', value: 'jet',
    options: [
      { value: 'jet', label: `${spec.short} (${spec.missiles.length})` },
      { value: 'all', label: `All ${ALL_MISSILES.length}` },
    ],
    onChange: v => { state.scope = v; render(); },
  });
  const fox = segmented<'0' | '1' | '2' | '3'>({
    id: 'ref-msl-fox', ariaLabel: 'Fox number', size: 's', value: '0',
    options: [{ value: '0', label: 'Any Fox' }, { value: '1', label: 'Fox 1' }, { value: '2', label: 'Fox 2' }, { value: '3', label: 'Fox 3' }],
    onChange: v => { state.fox = Number(v) as MissileFilter['fox']; render(); },
  });

  function cell(text: string, cls?: string): HTMLElement {
    return h('td', cls ? { class: cls } : null, hl(text, state.tokens));
  }

  function rowFor(m: MissileSpec, cols: number): HTMLElement[] {
    const open = state.open.has(m.id);
    const detailId = `ref-msl-${m.id}-notes`;
    const toggle = h('button', {
      type: 'button', class: 'ref-disclose', 'aria-expanded': String(open), 'aria-controls': detailId,
      title: open ? 'Hide DCS notes' : 'Show DCS notes',
      onclick: () => { if (state.open.has(m.id)) state.open.delete(m.id); else state.open.add(m.id); render(); },
    }, h('span', { class: 'ref-disclose__tri', 'aria-hidden': 'true' }), h('span', { class: 'ref-disclose__name' }, hl(m.name, state.tokens)));
    const mine = own.has(m.id);
    const tr = h('tr', { class: [mine && state.scope === 'all' ? 'is-hl' : '', open ? 'is-open' : ''].filter(Boolean).join(' ') || undefined },
      h('td', { class: 'ref-sticky ref-mname' }, toggle, mine && state.scope === 'all' ? tag('Yours', 'jet') : null),
      cell(m.nato ?? '—', 'ref-nato'),
      h('td', { class: 'is-num' }, String(m.fox)),
      h('td', { class: 'is-mono' }, SEEKER_LABEL[m.seeker]),
      h('td', null, MIDCOURSE_LABEL[m.midcourse]),
      h('td', null, m.lofts ? 'Yes' : '—'),
      h('td', { class: 'is-num' }, m.pitbullKm != null ? '~' + rangeNum(m.pitbullKm, units) : '—'),
      h('td', { class: 'is-num' }, rangeNum(m.ref.highHeadOnKm, units)),
      h('td', { class: 'is-num' }, rangeNum(m.ref.highColdKm, units)),
      h('td', { class: 'is-num' }, rangeNum(m.ref.lowHeadOnKm, units)),
      cell(m.guidanceRule, 'ref-col-rule'));
    if (!open) return [tr];
    const carriers = carriersOfMissile(m.id).map(a => AIRCRAFT[a].short);
    const src = sourcesFor(m.id).map(s => s.id).sort((a, b) => a - b);
    const detail = h('tr', { class: 'ref-detail', id: detailId },
      h('td', { colspan: String(cols) },
        h('div', { class: 'ref-detail__inner' },
          h('h4', { class: 'ref-detail__title' }, `${m.name} in DCS`),
          h('ul', { class: 'ref-detail__notes' }, m.notes.map(n => h('li', null, hl(n, state.tokens)))),
          h('p', { class: 'ref-detail__meta' },
            h('span', null, 'Carried by ', h('strong', null, carriers.join(', ') || 'none of the ten jets')),
            src.length ? h('span', null, ` · Sources ${src.join(', ')} (numbered in Sources below)`) : null))));
    return [tr, detail];
  }

  function render(): number {
    const list = sortMissiles(filterMissiles(ac, state), state.sort);
    const rows: Child[] = list.flatMap(m => rowFor(m, cols.length));
    if (!list.length) {
      const others = state.scope === 'jet' ? filterMissiles(ac, { ...state, scope: 'all' }).length : 0;
      rows.push(h('tr', { class: 'ref-empty-row' }, h('td', { colspan: String(cols.length) },
        h('span', null, state.fox && state.scope === 'jet' && !state.tokens.length
          ? `The ${spec.short} carries no Fox ${state.fox}. `
          : 'No missiles match. '),
        others ? button({ label: `Show all ${others} that match`, variant: 'ghost', size: 's', onClick: () => scope.set('all', true) }).el : null)));
    }
    tbody.replaceChildren(...(rows as Node[]));
    for (const [key, { th, btn }] of sortBtns) {
      const on = state.sort.key === key;
      setAttr(th, 'aria-sort', on ? (state.sort.dir === 1 ? 'ascending' : 'descending') : 'none');
      btn.dataset.sort = on ? (state.sort.dir === 1 ? 'asc' : 'desc') : '';
    }
    count.textContent = `${list.length} of ${ALL_MISSILES.length} missiles`;
    return list.length;
  }

  rc.filterable({ section: 'ref-missiles', apply(tokens) { state.tokens = tokens; return render(); } });
  render();

  const fox3 = spec.missiles.filter(id => MISSILES[id].fox === 3);
  const el = h('div', { class: 'ref-missiles' },
    h('p', null,
      `Every air-to-air missile in this trainer, as DCS plays it. Ranges are in ${u}. `
      + (fox3.length ? '' : `The ${spec.short} carries no Fox 3: every radar shot is semi-active, so you hold the lock to impact. `)
      + 'Click a missile for its DCS notes; click a column head to sort.'),
    h('div', { class: 'ref-toolbar' }, scope.el, fox.el, count),
    table,
    callout({ kind: 'simplified', body: [MISSILE_REF_NOTE, ' Every pitbull distance is approximate (~): ED publishes none, so each is the best reading of a manual, the Lua files or community tests. Open a missile for its source.'] }));

  return {
    el,
    expand(id) { if (MISSILES[id]) { state.open.add(id); if (!own.has(id)) scope.set('all', true); render(); } },
  };
}
