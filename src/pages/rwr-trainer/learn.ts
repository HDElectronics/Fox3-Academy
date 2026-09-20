/**
 * [OWNER: page-rwr-trainer] Learn mode: the jet's RWR big in the centre with a numbered anatomy guide,
 * and a sandbox plan where you place threats (type, state, bearing, range, altitude) and watch the
 * RWR react. Coach lines explain what changed and why, including the classic misreads.
 */
import type { AircraftId } from '../../data/types';
import { AIRCRAFT_ORDER } from '../../data/aircraft';
import { MISSILES } from '../../data/missiles';
import { RWRS, RWR_CAVEATS, rwrSymbol } from '../../data/rwr';
import type { RwrContact } from '../../sim/types';
import { M_PER_NM } from '../../sim/math';
import { defaultAdversary } from '../../sim/scenarios';
import {
  h, setText, cleanup, consolePanel, screenBezel, segmented, select, slider, button, coachBox, callout, tabs, toggle,
  placard, keyHint, bindKeys, kbd, cx, type SegmentedHandle,
} from '../../ui';
import { RwrDisplay } from '../../ui/displays';
import { rwrPriority } from '../../ui/displays/geometry';
import { readTheme } from '../../ui/theme';
import {
  type EmitterKind, type Threat, type ThreatState, STATE_ORDER, canBe, clockOf, clockText, emitterKindsFor, emitterLabel,
  emitterShort, isAircraft, isSam, missilesFor, normalizeThreat, rad, deg, RwrFeed, statesFor, threatIdOfContact, wrapPi,
  contactsAt,
} from './threats';
import { lampWords } from './quiz';
import { AnatomyOverlay, anatomyFor, obstaclesFor, type Part } from './anatomy';
import { PlanView } from './plan';
import { type ModeController, type ModeHost, RWR_SHORT, rwrBezel, rwrModeKeys } from './common';

type PresetId = 'demo' | 'lock' | 'sarh' | 'fox3' | 'busy' | 'clear';
const PRESETS: { id: PresetId; label: string }[] = [
  { id: 'demo', label: 'Demo' }, { id: 'lock', label: 'Lock' }, { id: 'sarh', label: 'SARH launch' },
  { id: 'fox3', label: 'Fox 3 active' }, { id: 'busy', label: 'Busy sky' }, { id: 'clear', label: 'Clear' },
];
const STATE_SHORT: Record<ThreatState, string> = { search: 'Search', lock: 'Lock', launch: 'Launch', active: 'Active' };
const ALT_REL = { above: 3000, level: 0, below: -3000 } as const;
type AltBand = keyof typeof ALT_REL;

export function mountLearn(host: ModeHost): ModeController {
  const bag = cleanup();
  const { spec, app } = host;
  const rwrId = spec.rwr;
  const rs = RWRS[rwrId];
  const lamps = rs.kind === 'lamps';
  const units = app.units;
  const theme = readTheme();
  const kinds = emitterKindsFor(rwrId);
  const feed = new RwrFeed();
  const modeKeys = rwrModeKeys(spec.id);

  let ids = 0;
  let threats: Threat[] = [];
  let selected: string | null = null;
  let rwrMode: 'all' | 'lock' = 'all';
  let current: RwrContact[] = [];
  let hoverPart: string | null = null;
  let pinnedPart: string | null = null;
  let lastAnat = -1;
  let partsSig = '';

  // ------------------------------------------------------------------ threat helpers

  const adv: AircraftId = defaultAdversary(spec.id);
  const capable = (state: ThreatState, prefer: EmitterKind[]): EmitterKind =>
    [...prefer, ...AIRCRAFT_ORDER].find(k => canBe(k, state, rwrId)) ?? 'f15c';
  const norm = (t: Threat): Threat => normalizeThreat(t, rwrId);
  const hasSams = kinds.includes('sam-short');
  /** Another fighter, with a different code where the RWR has one (on the SPO every fighter is П). */
  const differentSymbol = (k: EmitterKind): EmitterKind => {
    const pool: EmitterKind[] = ['f16c', 'fa18c', 'f15c', 'mig29s', 'su27'];
    return pool.find(x => x !== k && rwrSymbol(rwrId, x) !== rwrSymbol(rwrId, k)) ?? pool.find(x => x !== k) ?? 'fa18c';
  };
  const mk = (kind: EmitterKind, state: ThreatState, bDeg: number, km: number, altRel: number): Threat =>
    norm({ id: `T${++ids}`, kind, state, bearing: rad(bDeg), range: km * 1000, altRel: isSam(kind) ? -8000 : altRel, missile: null, aspect: 0 });

  function preset(id: PresetId): Threat[] {
    ids = 0;
    const second = differentSymbol(adv);
    switch (id) {
      case 'demo': return [
        mk(adv, 'lock', 30, 40, 1000),
        mk(second, 'search', -60, 85, -500),
        lamps ? mk('sam-long', 'search', -140, 90, 0) : mk('awacs', 'search', -150, 220, -1500),
      ];
      case 'lock': return [mk(adv, 'lock', 40, 35, 0)];
      case 'sarh': return [mk(capable('launch', [adv]), 'launch', -30, 35, 500), mk(second, 'search', 70, 90, 0)];
      case 'fox3': return [mk(capable('active', [adv, 'mig29s', 'f15c']), 'active', 20, 50, 1500), mk(second, 'search', -50, 80, 0)];
      case 'busy': return [
        mk(adv, 'lock', 60, 30, 0),
        mk(second, 'search', -20, 70, 2000),
        mk('awacs', 'search', 175, 240, -1500),
        hasSams ? mk('sam-medium', 'search', -100, 35, 0) : mk(differentSymbol(second), 'search', -100, 60, -2000),
        mk(capable('search', ['jf17']), 'search', 125, 95, 0),
      ];
      case 'clear': return [];
    }
  }

  const find = (id: string | null): Threat | undefined => threats.find(t => t.id === id);
  const fmtRange = (m: number) => (units === 'metric' ? `${Math.round(m / 1000)} km` : `${Math.round(m / M_PER_NM)} nm`);

  // ------------------------------------------------------------------ centre: the RWR

  const rb = rwrBezel(spec, 'rwrt-learn-rwr');
  const overlay = new AnatomyOverlay();
  rb.bezel.glass.append(overlay.el);
  const display = new RwrDisplay(rb.canvas, { rwr: rwrId });
  bag.add(() => display.dispose());
  bag.on(rb.canvas, 'click', (e: MouseEvent) => {
    const pe = e as PointerEvent;
    const id = display.pickContact(e.clientX, e.clientY, pe.pointerType === 'touch' ? 14 : 6);
    if (id) pickThreat(threatIdOfContact(id));
  });

  let modeSeg: SegmentedHandle<'all' | 'lock'> | null = null;
  if (modeKeys) {
    modeSeg = segmented<'all' | 'lock'>({
      id: 'rwrt-rwrmode', ariaLabel: 'RWR mode', size: 's', value: 'all',
      options: [{ value: 'all', label: 'All' }, { value: 'lock', label: 'Lock only' }],
      onChange: v => setMode(v),
    });
  }
  const under = h('div', { class: 'rwrt-under' },
    modeSeg ? h('div', { class: 'rwrt-under__mode' }, placard('RWR mode'), modeSeg.el, modeKeys ? kbd(modeKeys) : null) : null,
    h('p', { class: 'rwrt-under__hint' }, `${lamps ? 'Tap a lit lamp' : 'Tap a symbol'} to pick that threat. The numbers match the Anatomy guide.`));
  host.centre.append(rb.el, under);

  function setMode(v: 'all' | 'lock') {
    rwrMode = v;
    modeSeg?.set(v);
    rb.bezel.setStatus(v === 'lock' ? 'LOCK ONLY' : rs.name);
    coach.set(v === 'lock'
      ? 'Lock-only mode: search radars disappear; only locks, launches and missiles show.'
      : 'All mode: every radar that paints you shows.',
    v === 'lock' ? 'Useful in a busy sky, but you lose the early picture of who is looking at you.' : null);
  }

  // ------------------------------------------------------------------ left: anatomy guide

  const partsList = h('ol', { class: 'rwrt-parts' });
  const labels = toggle({ id: 'rwrt-labels', label: 'Numbers on the display', value: true, style: 'switch', size: 's', onChange: v => overlay.setVisible(v) });
  const cueRows = (['search', 'lock', 'launch', 'missile'] as const).map(s => {
    const target: ThreatState = s === 'missile' ? 'active' : s;
    const b = button({ label: 'Show', size: 's', onClick: () => showState(target), title: `Put the selected threat in ${STATE_SHORT[target]}` });
    return h('div', { class: 'rwrt-cue' },
      h('div', { class: 'rwrt-cue__head' }, h('span', { class: 'rwrt-cue__state', dataset: { state: s } }, s === 'missile' ? 'Active missile' : STATE_SHORT[s]), b.el),
      h('p', { class: 'rwrt-cue__text' }, rs.cues[s]));
  });
  const learnTabs = tabs({
    id: 'rwrt-learn-tabs', fill: true, ariaLabel: 'Guide',
    tabs: [{ id: 'parts', label: 'Parts' }, { id: 'cues', label: 'Cues' }, { id: 'misreads', label: 'Misreads' }],
  });
  learnTabs.panels.parts.append(h('div', { class: 'rwrt-parts__bar' }, labels.el), partsList);
  learnTabs.panels.cues.append(h('p', { class: 'rwrt-note' }, `How ${RWR_SHORT[rwrId]} shows each state. Show puts the selected threat in it.`), ...cueRows);
  learnTabs.panels.misreads.append(
    h('p', { class: 'rwrt-note' }, 'What pilots get wrong on this RWR:'),
    h('ul', { class: 'rwrt-teach' }, rs.teach.map(t => h('li', null, t))),
  );
  const simplified = callout({
    kind: 'simplified',
    body: h('ul', { class: 'rwrt-simple' },
      h('li', null, 'Threats are placed by hand: no scan timing, jamming or emitter power tables. Strength follows the trainer\'s sim: closer and locked read stronger.'),
      h('li', null, rwrId === 'jf17rwr'
        ? 'No ground radars (SAMs) on the JF-17 here: the real HSD draws them as circles, this display would box them like air threats.'
        : rwrId === 'alr67'
          ? 'SAMs only search here: this ALR-67 has no SAM light, and its AI light is for airborne locks.'
          : 'SAM lock and launch are generic: no command-guidance or track-via-missile differences.'),
      ...RWR_CAVEATS[rwrId].map(c => h('li', null, c))),
  });
  host.left.append(consolePanel({ title: `Anatomy · ${RWR_SHORT[rwrId].replace(/^the /, '')}`, id: 'rwrt-anatomy', children: [learnTabs.el] }).el, simplified);

  const partEls = new Map<string, { li: HTMLElement; btn: HTMLButtonElement; missing: HTMLElement }>();
  const setHover = (id: string | null) => { hoverPart = id; lastAnat = -1; };

  /** Build the list once per part set; afterwards only classes and the "missing" notes change. */
  function renderParts(parts: readonly Part[]) {
    const sig = parts.map(p => p.id).join(',');
    if (sig !== partsSig) {
      partsSig = sig;
      partEls.clear();
      partsList.replaceChildren(...parts.map((p, i) => {
        const missing = h('span', { class: 'rwrt-part__missing' }, p.missing ?? '');
        const btn = h('button', {
          type: 'button', class: 'rwrt-part', 'aria-pressed': 'false',
          onclick: () => { pinnedPart = pinnedPart === p.id ? null : p.id; lastAnat = -1; },
          onpointerenter: () => setHover(p.id),
          onpointerleave: () => setHover(null),
          onfocus: () => setHover(p.id),
          onblur: () => setHover(null),
        },
        h('span', { class: 'rwrt-part__num', 'aria-hidden': 'true' }, String(i + 1)),
        h('span', { class: 'rwrt-part__body' },
          h('span', { class: 'rwrt-part__title' }, p.title),
          h('span', { class: 'rwrt-part__text' }, p.text),
          missing));
        const li = h('li', null, btn);
        partEls.set(p.id, { li, btn, missing });
        return li;
      }));
    }
    const on = hoverPart ?? pinnedPart;
    for (const p of parts) {
      const e = partEls.get(p.id);
      if (!e) continue;
      e.btn.classList.toggle('is-on', p.id === on);
      e.btn.classList.toggle('is-missing', !p.shape);
      e.btn.setAttribute('aria-pressed', String(p.id === pinnedPart));
      e.missing.hidden = !!p.shape || !p.missing;
    }
  }

  // ------------------------------------------------------------------ right: sandbox

  const planCanvas = h('canvas', { tabindex: '0', 'aria-label': 'Plan view: your jet in the centre, threats around it. Drag a threat, or use the arrow keys to move the selected one.' });
  const planBezel = screenBezel({ id: 'rwrt-plan', label: 'Plan · truth', aspect: '1', content: planCanvas, status: 'Drag threats' });
  const plan = new PlanView(planCanvas, { theme, units, interactive: true });
  bag.add(() => plan.dispose());
  plan.onSelect = id => { if (id) pickThreat(id); };
  plan.onDrag = (id, b, r) => {
    const t = find(id);
    if (!t) return;
    t.bearing = b; t.range = r;
    changed('geom', t);
  };

  const chipRow = h('div', { class: 'rwrt-chips', role: 'group', 'aria-label': 'Threats' });
  const addBtn = button({ label: 'Add', size: 's', keys: 'N', onClick: () => addThreat() });
  const delBtn = button({ label: 'Remove', size: 's', keys: 'Delete', onClick: () => removeSelected() });

  const typeSel = select<EmitterKind>({
    id: 'rwrt-type', label: 'Emitter', value: 'f15c',
    options: kinds.map(k => ({ value: k, label: `${emitterLabel(k)}  ·  ${rwrSymbol(rwrId, k) || 'no lamp'}`, group: isAircraft(k) ? 'Aircraft' : 'Other emitters' })),
    onChange: k => { const t = find(selected); if (!t) return; Object.assign(t, norm({ ...t, kind: k, altRel: isSam(k) ? -8000 : Math.max(-3000, t.altRel) })); changed('kind', t); },
  });
  const stateSeg = segmented<ThreatState>({
    id: 'rwrt-state', label: 'State', value: 'search', fill: true, size: 's',
    options: STATE_ORDER.map((s, i) => ({ value: s, label: STATE_SHORT[s], keys: String(i + 1) })),
    onChange: s => setState(s),
  });
  const reason = h('p', { class: 'rwrt-reason', 'aria-live': 'polite' });
  const missileSel = select<string>({
    id: 'rwrt-missile', label: 'Missile', value: '', options: [{ value: '', label: '—' }],
    onChange: m => { const t = find(selected); if (!t || !m) return; t.missile = m as Threat['missile']; changed('missile', t); },
  });
  const altSeg = segmented<AltBand>({
    id: 'rwrt-alt', label: 'Altitude', value: 'level', fill: true, size: 's',
    options: [{ value: 'above', label: 'Above' }, { value: 'level', label: 'Level' }, { value: 'below', label: 'Below' }],
    onChange: a => { const t = find(selected); if (!t) return; t.altRel = ALT_REL[a]; changed('alt', t); },
  });
  const brg = slider({
    id: 'rwrt-brg', label: 'Bearing', min: -180, max: 180, step: 5, value: 0, readoutCh: 11,
    format: v => (v === 0 ? '0° nose' : `${Math.abs(v)}° ${v < 0 ? 'L' : 'R'}`),
    marks: [{ value: -90, label: '9' }, { value: 0, label: '12' }, { value: 90, label: '3' }],
    onInput: v => { const t = find(selected); if (!t) return; t.bearing = rad(v); changed('geom', t); },
  });
  const rMin = units === 'metric' ? 3 : 2, rMax = units === 'metric' ? 300 : 160;
  const rng = slider({
    id: 'rwrt-rng', label: 'Range', min: rMin, max: rMax, step: 1, value: 40, unit: units === 'metric' ? 'km' : 'nm', readoutCh: 5,
    onInput: v => { const t = find(selected); if (!t) return; t.range = units === 'metric' ? v * 1000 : v * M_PER_NM; changed('geom', t); },
  });
  const editor = h('div', { class: 'rwrt-editor' }, typeSel.el, stateSeg.el, reason, missileSel.el, altSeg.el, brg.el, rng.el);
  const emptyEd = h('p', { class: 'rwrt-note rwrt-editor__empty' }, 'No threat selected. Add one, or tap one on the plan.');

  const presetRow = h('div', { class: 'rwrt-presets' }, PRESETS.map(p =>
    button({ label: p.label, size: 's', id: `rwrt-preset-${p.id}`, onClick: () => loadPreset(p.id) }).el));

  const coach = coachBox({ id: 'rwrt-learn-coach', title: 'READ IT' });
  const keys = h('div', { class: 'rwrt-keys' },
    keyHint({ label: 'Pick threat', keys: '[ / ]' }),
    keyHint({ label: 'Bearing', keys: 'Left / Right' }),
    keyHint({ label: 'Range', keys: 'Up / Down' }),
    keyHint({ label: 'State', keys: '1 / 2 / 3 / 4' }),
    modeKeys ? keyHint({ label: 'RWR mode', keys: modeKeys }) : null);

  host.right.append(
    consolePanel({
      title: 'Sandbox', id: 'rwrt-sandbox', children: [
        planBezel.el,
        h('div', { class: 'rwrt-chipbar' }, chipRow, h('div', { class: 'rwrt-chipbar__actions' }, addBtn.el, delBtn.el)),
        editor, emptyEd,
      ],
    }).el,
    consolePanel({ title: 'Scenarios', children: [presetRow, coach.el] }).el,
    consolePanel({ title: 'Keys', id: 'rwrt-keys', dense: true, children: [keys] }).el,
  );

  // ------------------------------------------------------------------ actions

  function pickThreat(id: string | null) {
    selected = id && find(id) ? id : null;
    plan.setSelected(selected);
    renderChips();
    syncEditor();
  }

  function addThreat() {
    const taken = threats.map(t => deg(t.bearing));
    const cands = [30, -30, 60, -60, 90, -90, 0, 120, -120, 150, -150, 180];
    const b = cands.find(c => taken.every(x => Math.abs(deg(wrapPi(rad(c - x)))) > 20)) ?? 45;
    const pool: EmitterKind[] = ['f15c', 'su27', 'fa18c', 'mig29s', 'f16c', 'j11a', 'f14b', 'jf17', 'm2000c', 'su33'];
    const kind = pool[threats.length % pool.length];
    const t = mk(kind, 'search', b, 60, 0);
    ids = Math.max(ids, ...threats.map(x => Number(x.id.slice(1)) || 0)) + 1;
    t.id = `T${ids}`;
    threats.push(t);
    selected = t.id;
    changed('list', t);
    coach.set(`${t.id}: a ${emitterLabel(kind)} searching from ${clockText(clockOf(t.bearing))}.`,
      lamps ? 'A new search lights a direction lamp and П. It is yellow only if it is the primary threat.' : 'Search: he sees you, nothing more. Set it to Lock and watch where the symbol goes.');
  }

  function removeSelected() {
    if (!selected) return;
    const i = threats.findIndex(t => t.id === selected);
    if (i < 0) return;
    threats.splice(i, 1);
    selected = threats[Math.min(i, threats.length - 1)]?.id ?? null;
    changed('list');
  }

  function cycle(dir: 1 | -1) {
    if (!threats.length) return;
    const i = threats.findIndex(t => t.id === selected);
    pickThreat(threats[(i + dir + threats.length) % threats.length].id);
  }

  function setState(s: ThreatState) {
    const t = find(selected);
    if (!t) return;
    const avail = statesFor(t.kind, rwrId).find(x => x.state === s);
    if (!avail?.ok) { stateSeg.set(t.state); coach.set(avail?.reason ?? 'Not possible for this emitter.', null, 'caution'); return; }
    Object.assign(t, norm({ ...t, state: s }));
    changed('state', t);
  }

  function showState(s: ThreatState) {
    let t = find(selected);
    if (!t) { addThreat(); t = find(selected); }
    if (!t) return;
    if (!canBe(t.kind, s, rwrId)) {
      const k = capable(s, [adv, 'mig29s', 'f15c', 'su27']);
      Object.assign(t, norm({ ...t, kind: k, altRel: isSam(t.kind) ? 0 : t.altRel }));
    }
    Object.assign(t, norm({ ...t, state: s }));
    changed('state', t);
  }

  function loadPreset(id: PresetId) {
    threats = preset(id);
    feed.reset();
    selected = threats[0]?.id ?? null;
    changed('list');
    const msg: Record<PresetId, [string, string | null]> = {
      demo: [lamps ? 'The yellow lamp and the red lamp belong to the lock at 1 o\'clock. The green lamps are the others.'
        : rwrId === 'alr56c' ? 'The lock jumps to the inner ring and takes the diamond. Searches sit by signal strength: stronger nearer the centre, not closer.'
          : rwrId === 'jf17rwr' ? 'The lock turns red and drops into the inner ring; the main threat gets a line through its box. Searches stay yellow in the outer ring, whatever their range.'
            : 'The lock sits where this RWR puts locks, with the diamond. The searches sit where searches go, whatever their range.',
        'Hover or tap a part in the Anatomy guide to find it on the display.'],
      lock: [rs.cues.lock, 'A lock means he is ready to shoot.'],
      sarh: [rs.cues.launch, 'His radar guides the missile: beam him and chaff, and it goes dumb when the lock breaks.'],
      fox3: [rs.cues.missile, 'A TWS shot gave no lock and no launch warning. This is your first cue.'],
      busy: [lamps ? 'Five emitters, one yellow lamp. Only the primary threat gets elevation, power and the red lamp; the other types light green.' : `Five emitters. ${rwrId === 'jf17rwr' ? 'The line through the red box' : 'The diamond'} marks the priority threat: lock before search.`,
        'Find the one that can hurt you first.'],
      clear: ['Nothing on the RWR. Add a threat, or load a scenario.', null],
    };
    coach.set(msg[id][0], msg[id][1], id === 'sarh' || id === 'fox3' ? 'warning' : null);
  }

  function changed(what: 'geom' | 'state' | 'kind' | 'list' | 'alt' | 'missile', t?: Threat) {
    plan.setThreats(threats);
    plan.setSelected(selected);
    if (what === 'geom') syncSliders(); else { renderChips(); syncEditor(); }
    lastAnat = -1;
    if (!t) return;
    if (what === 'geom') coachGeom(t);
    else if (what === 'state') coachState(t);
    else if (what === 'kind') coachKind(t);
    else if (what === 'alt' && lamps) {
      coach.set(`${t.id} is ${t.altRel > 0 ? 'above' : t.altRel < 0 ? 'below' : 'level with'} you.`,
        'В and Н describe the primary threat only. Make this one primary (lock it) to see its elevation.');
    } else if (what === 'missile' && t.missile) {
      const m = MISSILES[t.missile];
      coach.set(`${m.name}: ${m.guidanceRule}`, null);
    }
  }

  function coachGeom(t: Threat) {
    const where = `${t.id} at ${clockText(clockOf(t.bearing))}, ${fmtRange(t.range)}.`;
    if (rwrMode === 'lock' && t.state === 'search') {
      coach.set(`${where} Lock-only mode: his search shows nothing.`, 'Switch back to All to see who is looking at you.');
      return;
    }
    // Rank the picture as it is now (the display's last frame is one step behind this change).
    const now = contactsAt(threats, 1e6);
    const ranked = rwrPriority(rwrMode === 'lock' ? now.filter(c => c.state !== 'search') : now);
    const primary = ranked[0] ? threatIdOfContact(ranked[0].emitterId) === t.id : false;
    if (lamps) {
      const words = lampWords(t.bearing);
      const lampPhrase = words.startsWith('both') ? 'both 10 lamps (dead ahead)' : `the ${words} lamp${words.includes(' and ') ? 's' : ''}`;
      coach.set(`${where} It lights ${lampPhrase}, ${primary ? 'big and yellow: the primary threat' : 'small and green: not the primary threat'}.`,
        primary ? 'The power column is his signal strength: a hint of range, not a readout.' : 'A green lamp is a bearing only. The power column and the red lamp ignore him.');
      return;
    }
    if (t.state !== 'search') { coach.set(where, 'Locks and launches sit in their own ring at any range.'); return; }
    const ringMsg: Record<string, string> = {
      alr56c: 'On the TEWS nearer the centre means a stronger signal. It usually drifts inward as he closes, but a lock jumps inward at any range.',
      alr67: 'It stays in the lethal band however close it gets: on the ALR-67 the band is lethality, not range.',
      alr56m: 'It stays on the outer ring: on the Viper the ring is lethality. Only a track or a missile moves inward.',
      jf17rwr: 'It stays in the outer ring. Only a lock moves it to the inner ring.',
      serval: 'It stays in the low-threat zone. Nearer the centre means more dangerous, not closer.',
    };
    coach.set(where, ringMsg[rwrId] ?? null);
  }

  function coachState(t: Threat) {
    const cue = rs.cues[t.state === 'active' ? 'missile' : t.state];
    const why: Record<ThreatState, string> = {
      search: 'Search: he sees you, nothing more.',
      lock: 'Lock: he is ready to shoot. A Fox 3 from STT may show nothing more until it goes active.',
      launch: `Launch${t.missile ? ` (${MISSILES[t.missile].name})` : ''}: his radar guides it. Beam him and chaff: when his lock breaks, it goes dumb.`,
      active: `${t.missile ? MISSILES[t.missile].name : 'The missile'} is active: it guides itself. Beam the missile, not the shooter; he still shows as a search.`,
    };
    coach.set(cue, why[t.state], t.state === 'launch' || t.state === 'active' ? 'warning' : t.state === 'lock' ? 'caution' : null);
  }

  function coachKind(t: Threat) {
    const sym = rwrSymbol(rwrId, t.kind);
    const blocked = statesFor(t.kind, rwrId).filter(s => !s.ok).map(s => s.reason);
    const twin = kinds.find(k => k !== t.kind && isSam(k) !== isSam(t.kind) && rwrSymbol(rwrId, k) === sym);
    const text = lamps
      ? (isAircraft(t.kind) ? `${emitterLabel(t.kind)}: П, like every fighter. The SPO cannot tell them apart.` : `${emitterLabel(t.kind)}: type lamp ${sym}.`)
      : rwrId === 'jf17rwr'
        ? `${emitterLabel(t.kind)} shows as "${sym}" in an air-threat rectangle.`
        : isSam(t.kind)
          ? `${emitterLabel(t.kind)} shows as "${sym}" with no hat: a ground radar.${twin ? ` "${sym}" with a hat would be the ${emitterShort(twin)}.` : ''}`
          : `${emitterLabel(t.kind)} shows as "${sym}" with the airborne hat.${twin ? ` Without the hat, "${sym}" is an ${emitterShort(twin)}.` : ''}`;
    coach.set(text, blocked[0] ?? null);
  }

  function renderChips() {
    chipRow.replaceChildren(...threats.map(t => h('button', {
      type: 'button', class: cx('rwrt-chip', t.id === selected && 'is-on'), 'aria-pressed': String(t.id === selected),
      dataset: { state: t.state }, onclick: () => pickThreat(t.id),
    }, h('span', { class: 'rwrt-chip__lamp', 'aria-hidden': 'true' }), `${t.id} ${emitterShort(t.kind)}`)));
    delBtn.setDisabled(!selected);
    if (!threats.length) chipRow.append(h('span', { class: 'rwrt-note' }, 'No threats.'));
  }

  function syncSliders() {
    const t = find(selected);
    if (!t) return;
    brg.set(Math.round(deg(wrapPi(t.bearing)) / 5) * 5);
    rng.set(Math.round(units === 'metric' ? t.range / 1000 : t.range / M_PER_NM));
  }

  function syncEditor() {
    const t = find(selected);
    editor.hidden = !t;
    emptyEd.hidden = !!t;
    if (!t) return;
    typeSel.set(t.kind);
    const avail = statesFor(t.kind, rwrId);
    for (const a of avail) stateSeg.setDisabled(a.state, !a.ok);
    stateSeg.set(t.state);
    const blocked = avail.filter(a => !a.ok).map(a => a.reason);
    setText(reason, [...new Set(blocked)].join(' '));
    reason.hidden = !blocked.length;
    const ms = missilesFor(t.kind, t.state);
    missileSel.el.hidden = !ms.length;
    if (ms.length) missileSel.setOptions(ms.map(m => ({ value: m, label: `${MISSILES[m].name} (${MISSILES[m].seeker === 'sarh' ? 'SARH' : 'active radar'})` })), t.missile ?? ms[0]);
    altSeg.el.hidden = isSam(t.kind);
    altSeg.set(t.altRel > 500 ? 'above' : t.altRel < -500 ? 'below' : 'level');
    syncSliders();
  }

  // ------------------------------------------------------------------ keys

  bag.add(bindKeys({
    'N': () => addThreat(),
    'Delete': () => removeSelected(),
    '[': () => cycle(-1),
    ']': () => cycle(1),
    'Left': { down: () => nudge(-5, 1), repeat: true },
    'Right': { down: () => nudge(5, 1), repeat: true },
    'Up': { down: () => nudge(0, 1.08), repeat: true },
    'Down': { down: () => nudge(0, 1 / 1.08), repeat: true },
    '1': () => setState('search'),
    '2': () => setState('lock'),
    '3': () => setState('launch'),
    '4': () => setState('active'),
    ...(modeKeys ? { [modeKeys]: () => setMode(rwrMode === 'all' ? 'lock' : 'all') } : {}),
  }));

  function nudge(dDeg: number, k: number) {
    const t = find(selected);
    if (!t) return;
    t.bearing = wrapPi(t.bearing + rad(dDeg));
    t.range = Math.max(3000, Math.min(300_000, t.range * k));
    changed('geom', t);
  }

  // ------------------------------------------------------------------ start

  const shot = host.params.get('shot');
  const startPreset = (PRESETS.find(p => p.id === shot)?.id ?? 'demo') as PresetId;
  loadPreset(startPreset);
  if (shot?.startsWith('part-')) pinnedPart = shot.slice(5);
  if (host.params.get('tab')) learnTabs.set(host.params.get('tab') ?? 'parts');
  if (!modeKeys) rb.bezel.setStatus(rs.name);

  return {
    frame(t) {
      const list = feed.update(threats, 1e6, t);
      current = rwrMode === 'lock' ? list.filter(c => c.state !== 'search') : list;
      display.draw(current, t);
      if (t - lastAnat > 0.25 || lastAnat < 0) {
        lastAnat = t;
        const ranked = rwrPriority(current);
        const parts = anatomyFor(rwrId, ranked, t);
        overlay.update(parts, hoverPart ?? pinnedPart, obstaclesFor(rwrId, ranked));
        renderParts(parts);
      }
    },
    contacts: () => current,
    unmount() { bag.dispose(); },
  };
}
