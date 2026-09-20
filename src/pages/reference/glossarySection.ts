/**
 * [OWNER: page-reference] Glossary (BVR terms, one line each, grouped) and the numbered source list.
 * Both are reached by the quick filter.
 */
import { h } from '../../ui/dom';
import { SOURCES, sourcesFor } from '../../data';
import { GLOSSARY, GLOSSARY_CATS, glossaryHaystack } from './glossary';
import { matches } from './model';
import { hl, tag, type RefCtx } from './common';

export function glossarySection(rc: RefCtx): HTMLElement {
  const entries = GLOSSARY.map(g => {
    const term = h('span', { class: 'ref-term' }, g.term);
    const def = h('dd', null, g.def);
    const mine = g.jets?.includes(rc.ac) ?? false;
    const dt = h('dt', null, term, g.aka ? h('span', { class: 'ref-aka' }, g.aka) : null, mine ? tag(`${rc.spec.short}`, 'jet') : null);
    return { g, dt, dd: def, term, hay: glossaryHaystack(g) };
  });
  const cats = GLOSSARY_CATS.map(c => {
    const mine = entries.filter(e => e.g.cat === c.id);
    const block = h('div', { class: 'ref-gloss__cat' },
      h('h3', null, c.title),
      h('dl', { class: 'ref-gloss' }, mine.map(e => h('div', { class: 'ref-gloss__item' }, e.dt, e.dd))));
    return { block, mine };
  });
  const empty = h('p', { class: 'ref-empty', hidden: true }, 'No terms match the filter.');

  rc.filterable({
    section: 'ref-glossary',
    apply(tokens) {
      let n = 0;
      for (const e of entries) {
        const ok = matches(e.hay, tokens);
        (e.dt.parentElement as HTMLElement).hidden = !ok;
        if (ok) n++;
        e.term.replaceChildren(...hl(e.g.term, tokens));
        e.dd.replaceChildren(...hl(e.g.def, tokens));
      }
      for (const c of cats) c.block.hidden = !c.mine.some(e => !(e.dt.parentElement as HTMLElement).hidden);
      empty.hidden = n > 0;
      return n;
    },
  });

  return h('div', { class: 'ref-glossary' },
    h('p', null, `Words you will hear on comms and read in manuals, as DCS uses them. Terms your ${rc.spec.short} cockpit uses are tagged.`),
    cats.map(c => c.block), empty);
}

export function sourcesSection(rc: RefCtx): HTMLElement {
  const mine = new Set([...sourcesFor(rc.ac), ...sourcesFor(rc.spec.rwr)].map(s => s.id));
  const items = SOURCES.map(s => {
    let host = '';
    try { host = new URL(s.url).hostname.replace(/^www\./, ''); } catch { /* keep empty */ }
    const title = h('span', { class: 'ref-src__title' }, s.title);
    const li = h('li', { class: 'ref-src', value: String(s.id) },
      h('a', { href: s.url, target: '_blank', rel: 'noopener' }, title),
      h('span', { class: 'ref-src__host' }, host),
      mine.has(s.id) ? tag(rc.spec.short, 'jet') : null);
    return { li, title, s, hay: `${s.id} ${s.title} ${host}` };
  });
  const empty = h('p', { class: 'ref-empty', hidden: true }, 'No sources match the filter.');
  rc.filterable({
    section: 'ref-sources',
    apply(tokens) {
      let n = 0;
      for (const it of items) {
        const ok = matches(it.hay, tokens);
        it.li.hidden = !ok; if (ok) n++;
        it.title.replaceChildren(...hl(it.s.title, tokens));
      }
      empty.hidden = n > 0;
      return n;
    },
  });
  return h('div', { class: 'ref-sources' },
    h('p', null, `Everything on this page comes from these ${SOURCES.length} documents: ED manuals and changelogs, the DCS Lua datamine, module manuals and community tests. Those tagged ${rc.spec.short} (${mine.size}) back your jet and its RWR. Links open in a new tab.`),
    h('ol', { class: 'ref-srclist' }, items.map(i => i.li)),
    empty);
}
