/**
 * [OWNER: page-reference] Cockpit reference (#/reference): the kneeboard for the selected jet
 * (bindings, procedures, radar numbers, display legend) and lookup tables for every missile, jet,
 * RWR symbol and BVR term, with one quick filter over the tables and the glossary.
 *
 * URL params: ?ac=<id> selects a jet once (for screenshots), ?shot=<section> or ?go=<section>
 * scrolls to a section (binds procs radar missiles jets rwr glossary sources), ?q= prefills the
 * filter, ?open=<missileId> expands a missile row, ?proc=<procedureId> opens a procedure tab.
 */
import './style.css';
import type { Page, PageContext, PageFactory } from '../../app/page';
import { h, cleanup, setText, type Child } from '../../ui/dom';
import { docLayout, type DocLayoutHandle } from '../../ui/layout';
import { bindKeys, kbd } from '../../ui/keys';
import { AIRCRAFT, RWRS } from '../../data';
import type { AircraftId, MissileId } from '../../data/types';
import { queryTokens } from './model';
import type { Filterable, RefCtx } from './common';
import { bindingsSection, proceduresSection } from './kneeboard';
import { radarSection } from './radarSection';
import { missilesSection } from './missilesSection';
import { fleetSection } from './fleetSection';
import { rwrSection } from './rwrSection';
import { glossarySection, sourcesSection } from './glossarySection';

const SECTION_IDS = ['binds', 'procs', 'radar', 'missiles', 'jets', 'rwr', 'glossary', 'sources'] as const;
const sid = (s: string) => (s.startsWith('ref-') ? s : 'ref-' + s);

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

/** Drop one-shot params so a later remount (units or jet change) does not repeat them. */
function cleanHash(drop: string[]): void {
  const p = hashParams();
  for (const k of drop) p.delete(k);
  writeHash(p);
}

function setHashParam(name: string, value: string | null): void {
  const p = hashParams();
  if (value) p.set(name, value); else p.delete(name);
  writeHash(p);
}

const ONE_SHOT = ['ac', 'go', 'shot', 'open', 'proc'];

const factory: PageFactory = (): Page => {
  const bag = cleanup();
  let doc: DocLayoutHandle | null = null;
  let alive = true;
  /** True once the page has rendered; an early return (?ac= switch) has no scroll of its own to keep. */
  let rendered = false;

  function mount(ctx: PageContext) {
    const params = ctx.params;

    // ?ac=<id>: select that jet once. The router remounts us synchronously, so stop here.
    const want = params.get('ac') as AircraftId | null;
    if (want) {
      cleanHash(['ac']);
      if (AIRCRAFT[want] && want !== ctx.app.aircraft) { ctx.app.setAircraft(want); return; }
    }

    rendered = true;
    const ac = ctx.app.aircraft;
    const spec = ctx.app.spec;
    const units = ctx.app.units;
    const key = `reference:${ac}:done`;
    if (!ctx.app.getProgress(key)) ctx.app.setProgress(key, true);

    const filterables: Filterable[] = [];
    const rc: RefCtx = {
      ac, spec, units,
      switchJet(id, returnTo) {
        // Remember where the reader was; the remount scrolls back there.
        setHashParam('go', returnTo.replace(/^ref-/, ''));
        ctx.app.setAircraft(id);
      },
      filterable(f) { filterables.push(f); },
    };

    // ---- sections
    const binds = bindingsSection(rc);
    const procs = proceduresSection(rc);
    const radar = radarSection(rc);
    bag.add(() => radar.figure.dispose());
    const missiles = missilesSection(rc);
    const rwrName = RWRS[spec.rwr].name.replace(/\s*".*"/, '').replace(/\s*\(.*\)/, '');

    const sections: { id: string; title: string; content: Child }[] = [
      { id: 'ref-binds', title: `${spec.short} kneeboard`, content: binds },
      { id: 'ref-procs', title: 'Procedures', content: procs.el },
      { id: 'ref-radar', title: `Radar: ${spec.radar.name}`, content: radar.el },
      { id: 'ref-missiles', title: 'Missiles', content: missiles.el },
      { id: 'ref-jets', title: 'All ten jets', content: fleetSection(rc) },
      { id: 'ref-rwr', title: `RWR: ${rwrName}`, content: rwrSection(rc) },
      { id: 'ref-glossary', title: 'Glossary', content: glossarySection(rc) },
      { id: 'ref-sources', title: 'Sources', content: sourcesSection(rc) },
    ];

    // ---- quick filter (lives at the top of the sticky contents panel)
    const input = h('input', {
      type: 'search', id: 'ref-filter', class: 'ref-filter__input', autocomplete: 'off', spellcheck: 'false',
      placeholder: 'notch, R-77, TWS…', 'aria-describedby': 'ref-filter-status', 'aria-keyshortcuts': '/',
    });
    const status = h('p', { class: 'ref-filter__status', id: 'ref-filter-status', 'aria-live': 'polite' });
    const clearBtn = h('button', { type: 'button', class: 'ref-filter__clear', 'aria-label': 'Clear the filter', hidden: true, onclick: () => { input.value = ''; run(); input.focus(); } }, '×');
    const filterBox = h('div', { class: 'ref-filter', role: 'search' },
      h('label', { class: 'ui-placard ref-filter__label', for: 'ref-filter' }, 'Quick filter', kbd('/')),
      h('div', { class: 'ref-filter__box' }, input, clearBtn),
      status);

    const mode = spec.module === 'fc3' ? 'FC3 keyboard' : 'Full fidelity · HOTAS';
    doc = docLayout({
      id: 'ref-doc', class: 'ref-doc',
      title: 'Cockpit reference',
      meta: `${spec.short} · ${spec.radar.name} · ${mode} · ${units === 'metric' ? 'km' : 'nm'}`,
      lede: `The kneeboard for your ${spec.short}: keys, procedures and radar numbers, plus lookup tables for every missile, jet, RWR symbol and BVR term in this trainer.`,
      sections,
    });
    const tocLinks = doc.toc ? [...doc.toc.querySelectorAll<HTMLButtonElement>('.ui-doc__toc-link')] : [];
    const badges = tocLinks.map(b => { const s = h('span', { class: 'ref-toc-count', hidden: true }); b.append(s); return s; });
    doc.toc?.prepend(filterBox);
    ctx.root.append(doc.el);

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
      sections.forEach((s, i) => {
        const n = per.get(s.id);
        const badge = badges[i];
        if (!badge) return;
        if (!tokens.length || n === undefined) { badge.hidden = true; return; }
        badge.hidden = false;
        setText(badge, String(n));
        badge.dataset.zero = n === 0 ? '1' : '';
        if (n > 0 && !firstHit) firstHit = s.id;
      });
      const total = [...per.values()].reduce((a, b) => a + b, 0);
      setText(status, tokens.length
        ? (total ? `${total} matching rows and terms. Enter jumps to the first.` : `Nothing matches “${q}”.`)
        : 'Filters the keys, procedures, tables, glossary and sources.');
      // Keep the query in the URL so a units or jet change (which remounts the page) keeps it.
      if (synced) setHashParam('q', q || null);
    }
    let synced = false;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    bag.on(input, 'input', () => { if (debounce) clearTimeout(debounce); debounce = setTimeout(() => { debounce = null; run(); }, 110); });
    bag.add(() => { if (debounce) clearTimeout(debounce); });
    bag.on<KeyboardEvent>(input, 'keydown', e => {
      if (e.key === 'Escape' && input.value) { e.preventDefault(); input.value = ''; run(); }
      else if (e.key === 'Enter') { e.preventDefault(); run(); if (firstHit && doc) doc.go(firstHit); }
    });
    bag.add(bindKeys({ '/': () => { input.focus(); input.select(); } }));

    const q = params.get('q');
    if (q) input.value = q;
    run();
    synced = true;

    // ---- one-shot params: expand a missile, open a procedure, scroll to a section
    const open = params.get('open') as MissileId | null;
    if (open) missiles.expand(open);
    const proc = params.get('proc');
    if (proc && procs.tabs.panels[proc]) procs.tabs.set(proc);
    const shot = params.get('shot');
    const target = params.get('go') ?? shot;
    cleanHash(ONE_SHOT);
    const targetEl = target && (SECTION_IDS as readonly string[]).includes(target.replace(/^ref-/, ''))
      ? doc.main.querySelector<HTMLElement>('#' + sid(target)) : null;
    // Screenshot mode: headless captures ignore the scroll offset, so hide what comes before the section.
    if (shot && targetEl) {
      const head = doc.el.querySelector<HTMLElement>('.ui-doc__head');
      if (head) head.style.display = 'none';
      for (const sec of doc.main.querySelectorAll<HTMLElement>('.ui-doc__section')) {
        if (sec === targetEl) break;
        sec.hidden = true;
      }
    }
    // A remount in place (units or jet from the top bar) keeps the reader's scroll position.
    const saved = (history.state as { refScroll?: unknown } | null)?.refScroll;
    if (!targetEl && typeof saved !== 'number') window.scrollTo(0, 0);
    requestAnimationFrame(() => {
      if (!alive) return;
      if (targetEl && !shot) targetEl.scrollIntoView({ block: 'start' });
      else if (typeof saved === 'number') window.scrollTo(0, saved);
    });
  }

  return {
    mount,
    unmount() {
      // Still on this route: the router is remounting us (units or jet changed). Remember the scroll.
      if (alive && rendered && location.hash.startsWith('#/reference')) {
        const st = (history.state && typeof history.state === 'object' ? history.state : {}) as Record<string, unknown>;
        writeHash(hashParams(), { ...st, refScroll: window.scrollY });
      }
      alive = false;
      bag.dispose();
      doc?.destroy();
      doc = null;
    },
  };
};
export default factory;
