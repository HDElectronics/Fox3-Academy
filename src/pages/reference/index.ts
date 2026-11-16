/**
 * [OWNER: page-reference] Cockpit reference (#/reference): the kneeboard for the selected jet
 * (bindings, procedures, radar numbers, display legend) and lookup tables for every missile, jet,
 * RWR symbol and BVR term, with one quick filter over the tables and the glossary.
 *
 * Sections: a sticky list of the sections this jet's reference renders (a side column under the filter on wide
 * windows, one row under the top bar on narrow ones) marks the section in view and jumps on click or Enter.
 *
 * URL params: ?go=<section> is the section in view (binds procs radar missiles jets rwr glossary sources). The page
 * keeps it current while you read, so a reload, Back or a copied link opens there; absent means the top of the page.
 * ?q= is the filter. Both apply in place (update). One-shot params, dropped after use: ?shot=<section> opens a section
 * for a headless screenshot (what comes before it is hidden), ?ac=<id> selects a jet, ?open=<missileId> expands a
 * missile row, ?proc=<procedureId> opens a procedure tab.
 */
import './style.css';
import type { Page, PageContext, PageFactory } from '../../app/page';
import { h, cleanup, setText, srOnly, type Child } from '../../ui/dom';
import { docLayout, type DocLayoutHandle } from '../../ui/layout';
import { bindKeys, kbd } from '../../ui/keys';
import { AIRCRAFT, RWRS } from '../../data';
import type { AircraftId, MissileId } from '../../data/types';
import { queryTokens } from './model';
import { ONE_SHOT_PARAMS, appliesInPlace, referenceQuery, sectionFromParam, sectionParam } from './sections';
import { fighterCtx, type Filterable, type RefCtx } from './common';
import { bindingsSection, proceduresSection } from './kneeboard';
import { radarSection } from './radarSection';
import { missilesSection } from './missilesSection';
import { fleetSection } from './fleetSection';
import { rwrSection } from './rwrSection';
import { glossarySection, sourcesSection } from './glossarySection';

/** The route's own query params (after '#/reference?'). */
function hashParams(): URLSearchParams {
  const i = location.hash.indexOf('?');
  return new URLSearchParams(i >= 0 ? location.hash.slice(i + 1) : '');
}

/** Rewrite the route hash without firing a navigation (the router only listens to hashchange). */
function writeHash(p: URLSearchParams, state: unknown = history.state): void {
  if (!location.hash.startsWith('#/reference')) return;
  const qs = p.toString();
  try { history.replaceState(state, '', '#/reference' + (qs ? '?' + qs : '')); } catch { /* sandboxed: fine */ }
}

const onReference = () => location.hash.startsWith('#/reference');

const factory: PageFactory = (): Page => {
  const bag = cleanup();
  let doc: DocLayoutHandle | null = null;
  let alive = true;
  /** True once the page has rendered; an early return (?ac= switch) has no scroll of its own to keep. */
  let rendered = false;
  /** Applies ?go= and ?q= in place; set once the page has rendered. */
  let apply: ((params: URLSearchParams) => boolean) | null = null;

  function mount(ctx: PageContext) {
    const params = ctx.params;

    // ?ac=<id>: select that jet once. The router remounts us synchronously, so stop here.
    const want = params.get('ac') as AircraftId | null;
    if (want) {
      const p = hashParams(); p.delete('ac'); writeHash(p);
      if (AIRCRAFT[want] && want !== ctx.app.jet) { ctx.app.setAircraft(want); return; }
    }

    rendered = true;
    const ac = ctx.app.jet;
    const spec = ctx.app.jetSpec;
    const units = ctx.app.units;
    const key = `reference:${ac}:done`;
    if (!ctx.app.getProgress(key)) ctx.app.setProgress(key, true);

    const filterables: Filterable[] = [];
    const rc: RefCtx = {
      ac, spec, units,
      switchJet(id, returnTo) {
        // Open the reader's section again after the remount.
        const p = hashParams(); p.set('go', sectionParam(returnTo)); writeHash(p);
        ctx.app.setAircraft(id);
      },
      filterable(f) { filterables.push(f); },
    };

    // ---- sections
    const binds = bindingsSection(rc);
    const procs = proceduresSection(rc);
    // Radar, missiles and the fleet table are fighter BVR kit; an attack jet's reference skips them.
    const fighter = fighterCtx(rc);
    const radar = fighter ? radarSection(fighter) : null;
    if (radar) bag.add(() => radar.figure.dispose());
    const missiles = fighter ? missilesSection(fighter) : null;
    const rwrName = RWRS[spec.rwr].name.replace(/\s*".*"/, '').replace(/\s*\(.*\)/, '');

    const sections: { id: string; title: string; content: Child }[] = [
      { id: 'ref-binds', title: `${spec.short} kneeboard`, content: binds },
      { id: 'ref-procs', title: 'Procedures', content: procs.el },
      ...(fighter && radar && missiles ? [
        { id: 'ref-radar', title: `Radar: ${fighter.spec.radar.name}`, content: radar.el },
        { id: 'ref-missiles', title: 'Missiles', content: missiles.el },
        { id: 'ref-jets', title: 'All ten jets', content: fleetSection(fighter) },
      ] : []),
      { id: 'ref-rwr', title: `RWR: ${rwrName}`, content: rwrSection(rc) },
      { id: 'ref-glossary', title: 'Glossary', content: glossarySection(rc) },
      { id: 'ref-sources', title: 'Sources', content: sourcesSection(rc) },
    ];
    // The list is built from what this jet's reference renders, never a fixed table.
    const ids = sections.map(s => s.id);
    const first = ids[0] ?? null;

    // ---- quick filter (top of the sticky side column)
    const input = h('input', {
      type: 'search', id: 'ref-filter', class: 'ref-filter__input', autocomplete: 'off', spellcheck: 'false',
      placeholder: fighter ? 'notch, R-77, TWS…' : 'laser, release, chaff…', 'aria-describedby': 'ref-filter-status', 'aria-keyshortcuts': '/',
    });
    const status = h('p', { class: 'ref-filter__status', id: 'ref-filter-status', 'aria-live': 'polite' });
    const clearBtn = h('button', { type: 'button', class: 'ref-filter__clear', 'aria-label': 'Clear the filter', hidden: true, onclick: () => { input.value = ''; run(); input.focus(); } }, '×');
    const filterBox = h('div', { class: 'ref-filter ui-surface', role: 'search' },
      h('label', { class: 'ui-placard ref-filter__label', for: 'ref-filter' }, 'Quick filter', kbd('/')),
      h('div', { class: 'ref-filter__box' }, input, clearBtn),
      status);

    // ---- the URL follows the reading position and the filter (replace: Back leaves the page, not the section)
    let urlReady = false;
    let applying = false;
    let urlTimer: ReturnType<typeof setTimeout> | null = null;
    const syncUrl = () => {
      if (urlTimer) { clearTimeout(urlTimer); urlTimer = null; }
      if (!alive || !doc || !urlReady || applying || !onReference()) return;
      const qs = referenceQuery(hashParams(), { q: input.value, section: doc.current(), first });
      ctx.navigate('reference' + (qs ? '?' + qs : ''), { replace: true });
    };
    const queueUrl = () => {
      if (!urlReady || applying) return;
      if (urlTimer) clearTimeout(urlTimer);
      urlTimer = setTimeout(syncUrl, 150);
    };
    bag.add(() => { if (urlTimer) clearTimeout(urlTimer); urlTimer = null; });

    const mode = spec.module === 'fc3' ? 'FC3 keyboard' : 'Full fidelity · HOTAS';
    const layout = docLayout({
      id: 'ref-doc', class: 'ref-doc',
      title: 'Cockpit reference',
      meta: `${spec.short} · ${fighter ? fighter.spec.radar.name : 'No air-to-air radar'} · ${mode} · ${units === 'metric' ? 'km' : 'nm'}`,
      lede: fighter
        ? `The kneeboard for your ${spec.short}: keys, procedures and radar numbers, plus lookup tables for every missile, jet, RWR symbol and BVR term in this trainer.`
        : `The kneeboard for your ${spec.short}: keys and procedures, plus its RWR symbols, the glossary and the sources.`,
      sections,
      side: filterBox,
      tocTitle: 'Sections',
      tocLabel: 'Reference sections',
      onCurrent: queueUrl,
    });
    doc = layout;
    // Match counts per section while a filter is on: the number, and for screen readers "3 matches".
    const badges = new Map<string, HTMLElement>();
    for (const [id, b] of layout.links) { const s = h('span', { class: 'ref-toc-count', hidden: true }); b.append(s); badges.set(id, s); }
    ctx.root.append(layout.el);

    // ---- filter logic
    let lastQ = '\u0000';
    let firstHit: string | null = null;
    function run() {
      const q = input.value.trim();
      clearBtn.hidden = !q;
      if (q === lastQ) return;
      lastQ = q;
      const tokens = queryTokens(q);
      const per = new Map<string, number>();
      for (const f of filterables) per.set(f.section, (per.get(f.section) ?? 0) + f.apply(tokens));
      firstHit = null;
      for (const s of sections) {
        const n = per.get(s.id);
        const badge = badges.get(s.id);
        const link = layout.links.get(s.id);
        if (!badge || !link) continue;
        const counted = tokens.length > 0 && n !== undefined;
        badge.hidden = !counted;
        link.dataset.empty = counted && n === 0 ? '1' : '';
        if (!counted) continue;
        badge.replaceChildren(h('span', { 'aria-hidden': 'true' }, String(n)), srOnly(`, ${n} ${n === 1 ? 'match' : 'matches'}`));
        badge.dataset.zero = n === 0 ? '1' : '';
        if (n > 0 && !firstHit) firstHit = s.id;
      }
      const total = [...per.values()].reduce((a, b) => a + b, 0);
      setText(status, tokens.length
        ? (total ? `${total} matching rows and terms. Enter jumps to the first.` : `Nothing matches “${q}”.`)
        : 'Filters the keys, procedures, tables, glossary and sources.');
      // Rows came and went: the sections moved. Keep the list and the URL (a remount keeps the filter) in step.
      layout.refresh();
      syncUrl();
    }
    let debounce: ReturnType<typeof setTimeout> | null = null;
    bag.on(input, 'input', () => { if (debounce) clearTimeout(debounce); debounce = setTimeout(() => { debounce = null; run(); }, 110); });
    bag.add(() => { if (debounce) clearTimeout(debounce); });
    bag.on<KeyboardEvent>(input, 'keydown', e => {
      if (e.key === 'Escape' && input.value) { e.preventDefault(); input.value = ''; run(); }
      else if (e.key === 'Enter') { e.preventDefault(); run(); if (firstHit) layout.go(firstHit); }
    });
    bag.add(bindKeys({ '/': () => { input.focus(); input.select(); } }));

    const q = params.get('q');
    if (q) input.value = q;
    run();

    // ---- one-shot params: expand a missile, open a procedure; then the section to open
    const open = params.get('open') as MissileId | null;
    if (open) missiles?.expand(open);
    const proc = params.get('proc');
    if (proc && procs.tabs.panels[proc]) procs.tabs.set(proc);
    const shot = params.get('shot');
    const target = sectionFromParam(params.get('go') ?? shot, ids);
    // Drop one-shot params so a later remount (units or jet change) does not repeat them.
    { const p = hashParams(); for (const k of ONE_SHOT_PARAMS) p.delete(k); writeHash(p); }
    // Screenshot mode: headless captures ignore the scroll offset, so collapse what comes before the section. The
    // list keeps those sections (they are only out of the shot, not filtered away).
    const shotMode = !!shot && !!target;
    if (shotMode) {
      const head = layout.el.querySelector<HTMLElement>('.ui-doc__head');
      if (head) head.style.display = 'none';
      for (const s of ids) {
        if (s === target) break;
        const sec = layout.main.querySelector<HTMLElement>('#' + s);
        if (sec) sec.style.display = 'none';
      }
    }
    // A remount in place (units or jet from the top bar) left the reading position in the history entry.
    const st = history.state && typeof history.state === 'object' ? { ...(history.state as Record<string, unknown>) } : null;
    const saved = st?.refScroll;
    if (st && 'refScroll' in st) { delete st.refScroll; writeHash(hashParams(), st); }
    if (!target && typeof saved !== 'number') window.scrollTo(0, 0);
    requestAnimationFrame(() => {
      if (!alive || doc !== layout) return;
      const jump = (id: string) => layout.go(id, { smooth: false, focus: false });
      // The section is already at the top of the page; a scrolled window would capture blank.
      if (shotMode && target) layout.go(target, { scroll: false, focus: false });
      else if (typeof saved === 'number') {
        // Keep the exact position when it is still in the section the URL names (a units switch); else open it.
        window.scrollTo(0, saved);
        layout.refresh();
        if (target && layout.current() !== target) jump(target);
      } else if (target) jump(target);
      else layout.refresh();
      urlReady = true;
      // Also brings the router's record of the query in step with the cleaned URL.
      syncUrl();
    });

    apply = next => {
      if (!appliesInPlace(next)) return false;
      applying = true;
      try {
        const nq = (next.get('q') ?? '').trim();
        if (nq !== input.value.trim()) { input.value = nq; run(); }
        const go = sectionFromParam(next.get('go'), ids);
        if (go) { if (go !== layout.current()) layout.go(go, { smooth: false, focus: false }); }
        else if (layout.current() !== first) { window.scrollTo(0, 0); layout.refresh(); }
      } finally {
        applying = false;
      }
      return true;
    };
  }

  return {
    mount,
    update(params) { return apply?.(params) ?? false; },
    unmount() {
      // Still on this route: the router is remounting us (units or jet changed). Remember the scroll.
      if (alive && rendered && onReference()) {
        const st = (history.state && typeof history.state === 'object' ? history.state : {}) as Record<string, unknown>;
        writeHash(hashParams(), { ...st, refScroll: window.scrollY });
      }
      alive = false;
      apply = null;
      bag.dispose();
      doc?.destroy();
      doc = null;
    },
  };
};
export default factory;
