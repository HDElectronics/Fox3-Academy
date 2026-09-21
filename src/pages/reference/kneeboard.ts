/**
 * [OWNER: page-reference] "Your jet": the kneeboard card of bindings (grouped radar / weapons /
 * countermeasures) and the step-by-step procedures, for the selected jet only.
 */
import { h, cx, type Child } from '../../ui/dom';
import { kbd, parseKeyList, parseChord } from '../../ui/keys';
import { consolePanel, callout } from '../../ui/panels';
import { tabs, type TabsHandle } from '../../ui/controls';
import { PROCEDURES, procedureFor, MISSILES, RWRS } from '../../data';
import type { AircraftSpec, KeyBind, Procedure, ProcedureStep } from '../../data/types';
import {
  BIND_GROUP_TITLE, capUnpublished, groupBinds, splitControlsName, matches, fox3Of,
  type BindGroup,
} from './model';
import { hl, tag, type RefCtx } from './common';

/** Keys as <kbd> when any part is a real key, otherwise the words muted (e.g. "No default key"). */
function keysEl(keys: string): HTMLElement {
  const anyKey = parseKeyList(keys).length > 0
    || keys.replace(/\s*\+\s*/g, '+').split(/\s+/).some(tok => parseChord(tok.replace(/,$/, '')) !== null);
  return anyKey ? kbd(keys) : h('span', { class: 'ref-nokey' }, keys);
}

interface BindRow { el: HTMLElement; action: HTMLElement; bind: KeyBind; hay: string; group: BindGroup }

function bindRow(b: KeyBind, full: boolean, group: BindGroup): BindRow {
  const action = h('span', { class: 'ref-bind__action' }, b.action);
  let keysCell: Child;
  const sub: Child[] = [];
  if (full) {
    keysCell = b.keyboard ? keysEl(b.keyboard) : h('span', { class: 'ref-nokey' }, 'no key');
    sub.push(h('span', { class: 'ref-bind__hotas' }, b.keys));
    let rest = b.note ?? '';
    if (!b.keyboard && /^No default key\.?$/i.test(rest.trim())) rest = '';
    if (rest) sub.push(h('span', { class: 'ref-bind__note' }, rest));
  } else {
    keysCell = keysEl(b.keys);
    const { menu, rest } = splitControlsName(b.note);
    if (menu) sub.push(h('span', { class: 'ref-bind__menu' }, menu));
    if (rest) sub.push(h('span', { class: 'ref-bind__note' }, rest));
  }
  const el = h('li', { class: 'ref-bind' },
    h('div', { class: 'ref-bind__line' }, action, h('span', { class: 'ref-bind__keys' }, keysCell)),
    sub.length ? h('div', { class: 'ref-bind__sub' }, sub) : null);
  return { el, action, bind: b, hay: [b.action, b.keys, b.keyboard ?? '', b.note ?? ''].join(' • '), group };
}

export function bindingsSection(rc: RefCtx): HTMLElement {
  const { spec } = rc;
  const full = spec.module === 'full';
  const binds = PROCEDURES[rc.ac].binds;
  const groups = groupBinds(binds);
  const rows: BindRow[] = [];

  const groupEls = (Object.keys(groups) as BindGroup[]).filter(g => groups[g].length).map(g => {
    const list = h('ul', { class: 'ref-binds', role: 'list' });
    for (const b of groups[g]) { const r = bindRow(b, full, g); rows.push(r); list.append(r.el); }
    const head = h('h4', { class: 'ref-kb__group' }, BIND_GROUP_TITLE[g]);
    return { g, el: h('div', { class: cx('ref-kb__col', 'ref-kb__col--' + g) }, head, list), list };
  });
  const empty = h('p', { class: 'ref-empty', hidden: true }, 'No bindings match the filter.');

  const fox3 = fox3Of(spec).map(id => MISSILES[id].name);
  const facts = h('dl', { class: 'ref-kb__facts' },
    fact('Radar', spec.radar.name),
    fact('TWS', twsFact(spec)),
    fact('Fox 3', fox3.length ? fox3.join(', ') : 'None'),
    fact('RWR', RWRS[spec.rwr].name.replace(/\s*".*"/, '')),
    fact('Chaff / flares', `${spec.cms.chaff} / ${spec.cms.flares}`));

  const card = consolePanel({
    title: `${spec.short} kneeboard`,
    class: 'ref-kb',
    actions: tag(full ? 'HOTAS · keyboard' : 'FC3 keyboard', 'dim'),
    children: [facts, h('div', { class: 'ref-kb__grid' },
      groupEls.filter(x => x.g === 'radar').map(x => x.el),
      h('div', { class: 'ref-kb__stack' }, groupEls.filter(x => x.g !== 'radar').map(x => x.el))), empty],
  });

  rc.filterable({
    section: 'ref-binds',
    apply(tokens) {
      let n = 0;
      for (const r of rows) {
        const ok = matches(r.hay, tokens);
        r.el.hidden = !ok;
        r.action.replaceChildren(...hl(r.bind.action, tokens));
        if (ok) n++;
      }
      for (const x of groupEls) x.el.hidden = !rows.some(r => r.group === x.g && !r.el.hidden);
      empty.hidden = n > 0;
      return n;
    },
  });

  const intro = full
    ? `HOTAS and cockpit functions as the ${spec.short} controls menu names them, with the keyboard default beside each where DCS has one. Bind the HOTAS ones to your stick and throttle.`
    : `FC3 keyboard defaults for the ${spec.short}. The name in quotes is the controls-menu entry, so you can find it and rebind it to your HOTAS.`;
  return h('div', { class: 'ref-kneeboard' }, h('p', null, intro), card.el);
}

function twsFact(spec: AircraftSpec): string {
  const tws = spec.radar.tws;
  if (!tws) return 'None: PSIC only';
  const n = tws.maxSimultaneousTargets;
  if (tws.autoSttAtRmaxFraction != null) return `${tws.maxTracks} tracks · ${n > 1 ? `${n} targets (СНП2)` : '1 target, from STT'}`;
  if (capUnpublished(spec)) return `${tws.maxTracks} tracks · no published target cap`;
  return `${tws.maxTracks} tracks · ${n} targets`;
}

function fact(label: string, value: string): HTMLElement {
  return h('div', { class: 'ref-kb__fact' }, h('dt', null, label), h('dd', null, value));
}

// ---- procedures --------------------------------------------------------------------------------

const TAB_LABEL: Record<string, string> = { support: 'Support', 'dt-sam': 'DT SAM', defend: 'Defend' };
const tabLabel = (p: Procedure) => TAB_LABEL[p.id] ?? p.title.split(/[:(]/)[0].trim();

interface StepRow { li: HTMLElement; text: HTMLElement; step: ProcedureStep; hay: string }

function stepEl(s: ProcedureStep, i: number): StepRow {
  const keys: Child[] = [];
  if (s.keys) keys.push(h('div', { class: 'ref-step__key' }, h('span', { class: 'ref-step__kind' }, 'Key'), keysEl(s.keys)));
  if (s.hotas) keys.push(h('div', { class: 'ref-step__key' }, h('span', { class: 'ref-step__kind' }, 'HOTAS'), h('span', { class: 'ref-step__hotas' }, s.hotas)));
  const text = h('p', { class: 'ref-step__text' }, s.text);
  const li = h('li', { class: 'ref-step' },
    h('span', { class: 'ref-step__n', 'aria-hidden': 'true' }, String(i + 1)),
    h('div', { class: 'ref-step__body' },
      text,
      s.note ? h('p', { class: 'ref-step__note' }, s.note) : null),
    keys.length ? h('div', { class: 'ref-step__keys' }, keys) : null);
  return { li, text, step: s, hay: [s.text, s.keys ?? '', s.hotas ?? '', s.note ?? ''].join(' • ') };
}

export function proceduresSection(rc: RefCtx): { el: HTMLElement; tabs: TabsHandle } {
  const { spec } = rc;
  const procs = PROCEDURES[rc.ac].procedures;
  const perProc = procs.map(p => ({
    p,
    rows: p.steps.map(stepEl),
    empty: h('p', { class: 'ref-empty', hidden: true }, 'No steps in this procedure match the filter.'),
  }));
  const t = tabs({
    id: 'ref-proc', ariaLabel: `${spec.short} procedures`,
    tabs: perProc.map(x => ({
      id: x.p.id, label: tabLabel(x.p),
      content: [
        h('h3', { class: 'ref-proc__title' }, x.p.title),
        h('ol', { class: 'ref-steps', role: 'list' }, x.rows.map(r => r.li)),
        x.empty,
      ],
    })),
  });
  // Match counts on the tab legends while the filter is on.
  const tabBtns = [...t.list.querySelectorAll<HTMLElement>('[role="tab"]')];
  const tabCounts = perProc.map((_, i) => {
    const c = h('span', { class: 'ref-tab-count', hidden: true });
    tabBtns[i]?.append(c);
    return c;
  });

  rc.filterable({
    section: 'ref-procs',
    apply(tokens) {
      let total = 0;
      const counts = perProc.map((x, i) => {
        let n = 0;
        for (const r of x.rows) {
          // The title counts too, so "defend" or "chaff" finds the whole Defend: notch and chaff procedure.
          const ok = matches(x.p.title + ' • ' + r.hay, tokens);
          r.li.hidden = !ok;
          r.text.replaceChildren(...hl(r.step.text, tokens));
          if (ok) n++;
        }
        x.empty.hidden = n > 0;
        const c = tabCounts[i];
        if (c) { c.hidden = !tokens.length; c.textContent = String(n); c.dataset.zero = n ? '' : '1'; }
        total += n;
        return n;
      });
      // Show a procedure that has matches when the open one has none.
      if (tokens.length && total) {
        const cur = perProc.findIndex(x => x.p.id === t.value);
        if (cur < 0 || counts[cur] === 0) {
          const next = counts.findIndex(n => n > 0);
          if (next >= 0) t.set(perProc[next].p.id);
        }
      }
      return total;
    },
  });

  const blocks: Child[] = [
    h('p', null, `The BVR flow in the ${spec.short}, one step per action, with the key and the HOTAS function for each. Search, shoot, support, defend.`),
  ];
  if (!procedureFor(rc.ac, 'tws-multi')) {
    const tws = spec.radar.tws;
    const why = !tws
      ? `The ${spec.short} has no multi-target TWS: its PSID tracks one target and cannot guide the Super 530D, so every shot leaves from PSIC (STT), one target at a time, and he gets a lock warning each time.`
      : tws.autoSttAtRmaxFraction != null
        ? `The ${spec.short} has no multi-target shot. СНП designates one track and locks it by itself at ${Math.round(tws.autoSttAtRmaxFraction * 100)} % of Rmax, so every radar missile leaves from STT, one target after another.`
        : `The ${spec.short} fires at one target at a time.`;
    blocks.push(callout({ kind: 'dcs', title: 'No multi-target procedure', body: why }));
  }
  blocks.push(t.el);
  return { el: h('div', { class: 'ref-procs' }, blocks), tabs: t };
}
