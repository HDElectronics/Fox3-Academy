/**
 * [OWNER: page-tws] Track while scan, in 3D, for every jet: RWS vs TWS vs STT, track files, designation and
 * multi-target shots where the jet allows them, and above all what each bandit's RWR hears.
 * Route #/tws teaches the lesson; #/tws?lab=free opens Practice. ?ac=<id> selects the jet once on mount.
 * ?shot=tracks|mid|active|stt|end|demo pre-rolls the
 * drill with the demo pilot (screenshots); &pause=1 starts paused; &cam=top|chase picks the camera.
 */
import './style.css';
import type { Page, PageContext, PageFactory } from '../../app/page';
import type { AircraftId, FighterId, MissileId } from '../../data/types';
import { AIRCRAFT, FIGHTER_ORDER } from '../../data/aircraft';
import { MISSILES } from '../../data/missiles';
import { RWRS } from '../../data/rwr';
import { CameraRig, FramePriority, Stage, WorldView, isWebGLAvailable } from '../../render';
import type { AircraftLike } from '../../render';
import {
  bindKeys, button, callout, chips, cleanup, coachBox, checklist, consolePanel, disclosure, eventLog, h, keyHint, labLayout,
  lamp, modal, placard, readouts, screenBezel, segmented, setAttr, setText, slider, toggle,
  type KeyBinding, type KeyMap, type ModalHandle, type SegOption,
} from '../../ui';
import { RadarDisplay, RwrDisplay } from '../../ui/displays';
import { fmtAltShort, fmtRange, fmtSpeed, fmtTime, type Units } from '../../app/format';
import { M_PER_FT, R2D } from '../../sim/math';
import type { EntityId, RadarPicture } from '../../sim/types';
import { radarRules, setCursor } from '../../sim/radar';
import { FreeLabInput, LabTimers } from './input';
import { TwsLesson, type PageMode, type Steer } from './drill';
import { resolveBinds, type PageAct } from './binds';
import {
  STATE_TEXT, banditWhy, coachFor, endSummary, introFor, pageKeyTag, rwrCue, rwrLine, stepsFor, suggestion,
} from './lesson';
import { autopilotTick, newAutopilot } from './autopilot';

const UI_MS = 120;
const FLASH_MS = 4000;

const short = (label: string | undefined) => (label ?? '').replace(/\s*ДВБ$/, '');

/** Altitude for coverage readouts: '7.1 km' / '23k ft'. */
const altK = (m: number, u: Units) => (u === 'metric' ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / M_PER_FT / 1000)}k ft`);

/** Set a button legend only when it changed (the kit rebuilds the node on every call). */
const legends = new WeakMap<object, string>();
function setLegend(b: { el: HTMLElement; setLabel(l: string): void }, text: string): void {
  if (legends.get(b) === text) return;
  legends.set(b, text);
  b.setLabel(text);
}

/** A disabled button says why in its tooltip; enabled, it gets its own title back. */
const baseTitles = new WeakMap<object, string>();
function setWhy(b: { el: HTMLElement }, why: string | null): void {
  if (!baseTitles.has(b)) baseTitles.set(b, b.el.title);
  const t = why ?? baseTitles.get(b) ?? '';
  if (b.el.title !== t) b.el.title = t;
}

function displayName(ac: FighterId): string {
  switch (AIRCRAFT[ac].display) {
    case 'ru-hud': return 'ИЛС (HUD)';
    case 'f15-vsd': return 'VSD';
    case 'tid': return 'TID';
    case 'vtb': return 'VTB';
    default: return ac === 'f16c' ? 'FCR' : ac === 'jf17' ? 'MFCD' : 'DDI';
  }
}

const factory: PageFactory = (): Page => {
  const bag = cleanup();
  return {
    mount(ctx) { mountTws(ctx, bag); },
    unmount() { bag.dispose(); },
  };
};
export default factory;

function mountTws(ctx: PageContext, bag: ReturnType<typeof cleanup>): void {
  // ?ac=<id>: select the jet once. Drop it from the URL first, or every later remount (the jet picker, units,
  // "Fly it in the …") would switch straight back to it.
  const want = ctx.params.get('ac');
  if (want !== null) {
    const rest = new URLSearchParams(ctx.params);
    rest.delete('ac');
    const qs = rest.toString();
    try { history.replaceState(history.state, '', `#/tws${qs ? '?' + qs : ''}`); } catch { /* sandboxed frame: fine */ }
    if (want !== ctx.app.aircraft && (FIGHTER_ORDER as string[]).includes(want)) {
      ctx.app.setAircraft(want as FighterId);   // the router remounts this page with the new jet
      return;
    }
  }
  const ac = ctx.app.aircraft, spec = AIRCRAFT[ac], units: Units = ctx.app.units;
  const L = new TwsLesson(ac, { units, freeLab: ctx.params.get('lab') === 'free' });
  const binds = resolveBinds(ac);
  const steps = stepsFor(ac, binds);
  const intro = introFor(ac);
  const reduced = Stage.prefersReducedMotion();
  const shot = ctx.params.get('shot');
  let paused = reduced || ctx.params.get('pause') === '1';
  let speed = 1;
  let flashText = '', flashAt = -1e9;
  let selected: EntityId | null = null;
  let saved = !!ctx.app.getProgress(`tws:${ac}:done`);
  const autoplay = !L.freeLab && shot === 'demo';
  const labInput = new FreeLabInput();
  const holds = new LabTimers();
  bag.add(() => labInput.clear());
  bag.on(window, 'blur', () => { labInput.clear(); holds.clear(); });
  const ap = newAutopilot();

  const k = (a: PageAct) => binds.acts[a]?.keys ?? undefined;
  const rangeSpan = (a: number, b: number) => `${fmtRange(a, units).replace(/\s*[^\d.]+$/, '')}–${fmtRange(b, units)}`;
  const startLine = () => `Four bandits at ${rangeSpan(70000, 100000)}, hot. Your radar is in ${short(spec.radar.modeLabels[L.me.radar.mode]) || L.me.radar.mode.toUpperCase()}.`;
  /** The contact Designate / Enter acts on: the one under the cursor, else the nearest. */
  const actTarget = () => L.freeLab ? L.contactAtCursor() : (L.hooked && L.hasContact(L.hooked) ? L.hooked : L.nearestContact());
  const flash = (msg: string | null) => { if (msg) { flashText = msg; flashAt = performance.now(); } };

  // ------------------------------------------------------------------ viewport and overlays
  const viewEl = h('div', { class: 'tws-view', tabindex: '0' });

  const camSeg = segmented<'tactical' | 'top' | 'chase'>({
    id: 'tws-cam', ariaLabel: 'Camera', size: 's', value: 'tactical',
    options: [{ value: 'tactical', label: 'Tactical' }, { value: 'top', label: 'Top' }, { value: 'chase', label: 'Chase' }],
    onChange: v => setCamera(v),
  });
  const layerChips = chips<'truth' | 'tracks' | 'bricks' | 'radarVolume' | 'labels'>({
    id: 'tws-layers', ariaLabel: '3D layers',
    options: [
      { value: 'truth', label: 'Truth', title: 'The bandits as they really are' },
      { value: 'tracks', label: 'Tracks', title: 'Where your radar believes they are (track files), with the error to the truth' },
      { value: 'bricks', label: 'Bricks', title: 'RWS returns' },
      { value: 'radarVolume', label: 'Scan', title: 'Your radar scan volume and beam' },
      { value: 'labels', label: 'Labels' },
    ],
    value: ['truth', 'tracks', 'bricks', 'radarVolume', 'labels'],
    onChange: (_v, changed, on) => view?.setLayer(changed, on),
  });

  const clockEl = h('span', { class: 'tws-clock__t', 'aria-label': 'Drill clock' }, '00:00');
  const speedSeg = segmented<'0' | '1' | '2' | '4'>({
    id: 'tws-speed', ariaLabel: 'Time', size: 's', value: paused ? '0' : '1',
    options: [{ value: '0', label: 'Pause' }, { value: '1', label: '1×' }, { value: '2', label: '2×' }, { value: '4', label: '4×' }],
    onChange: v => { labInput.clear(); holds.clear(); if (v === '0') paused = true; else { paused = false; speed = Number(v); } },
  });
  const resetBtn = button({ label: 'Reset', size: 's', onClick: () => reset(), title: 'Put the four bandits back at 70–100 km' });
  const clock = h('div', { class: 'tws-clock tws-plate' }, clockEl, speedSeg.el, resetBtn.el);

  const legend = h('div', { class: 'tws-legend tws-plate', 'aria-label': 'Legend' },
    h('span', null, h('i', { class: 'lg lg-truth' }), 'Bandit, true position'),
    h('span', null, h('i', { class: 'lg lg-track' }), 'Where your radar believes he is'),
    h('span', null, h('i', { class: 'lg lg-err' }), 'Track error'),
    h('span', null, h('i', { class: 'lg lg-link' }), 'Datalink to missile'),
    h('span', null, h('i', { class: 'lg lg-seeker' }), 'Seeker active'),
  );

  // ------------------------------------------------------------------ radar display + bandits + his RWR (strip)
  const radarCv = h('canvas', { class: 'tws-radar-cv', 'aria-label': 'Your radar display. Click a contact to designate or lock it.' });
  const radarBezel = screenBezel({ id: 'tws-radar', label: `Your radar · ${displayName(ac)}`, aspect: '1', content: radarCv, status: '' });

  const cards = new Map<EntityId, CardUi>();
  const cardGrid = h('div', { class: 'tws-cards' });
  const banditsBlock = h('section', { class: 'tws-bandits', 'aria-labelledby': 'tws-bandits-h' },
    h('header', { class: 'tws-bandits__head' },
      h('h2', { id: 'tws-bandits-h', class: 'tws-bandits__title' }, 'What each bandit\'s RWR says'),
      h('span', { class: 'tws-bandits__note' }, 'the point of TWS')),
    cardGrid);

  const rwrCv = h('canvas', { class: 'tws-rwr-cv', 'aria-label': 'The selected bandit\'s RWR, showing only your radar and missiles' });
  const rwrBezel = screenBezel({ id: 'tws-hisrwr', label: 'His RWR', aspect: '1', content: rwrCv, status: '' });

  // ------------------------------------------------------------------ console
  const coach = coachBox({ id: 'tws-coach' });
  const sessionNote = h('p', { class: 'tws-hint' });
  const snapToggle = toggle({ id: 'tws-cursor-snap', label: 'DCS СНП cursor snap', value: false,
    onChange: value => { L.dcsCursorSnap = value; radar.setOptions({ manualCursor: L.freeLab && !value }); updateSession(); } });
  const sessionMode = segmented<'guided' | 'free'>({ id: 'tws-session', ariaLabel: 'Learning or practice', value: L.freeLab ? 'free' : 'guided', fill: true,
    options: [{ value: 'guided', label: 'Learn' }, { value: 'free', label: 'Practice' }],
    onChange: value => ctx.navigate(value === 'free' ? 'tws?lab=free' : 'tws') });
  const sessionPanel = consolePanel({ id: 'tws-practice', title: 'Practice mode', dense: true,
    children: [sessionNote, snapToggle.el] });
  function updateSession(): void {
    radarCv.setAttribute('aria-label', L.freeLab ? 'Your radar display. Click to position the cursor; use Designate or Lock to acquire a contact.' : 'Your radar display. Click a contact to designate or lock it.');
    lessonPanel.el.hidden = L.freeLab;
    lab.el.dataset.session = L.freeLab ? 'practice' : 'learn';
    snapToggle.el.hidden = !L.freeLab || !L.cursorSnaps;
    sessionNote.textContent = L.freeLab
      ? 'Hold cursor keys to slew; Designate / Lock acts only under the cursor. Click the radar to position the cursor. Arrow keys command heading and altitude (trainer controls). No merge or time limit.' + (L.cursorSnaps ? L.dcsCursorSnap ? ' DCS СНП: moving onto a firm track snaps and designates; 85% Rmax auto-lock still applies.' : ' Manual designation is a trainer aid: DCS СНП normally snaps when slewed onto a track. After designation, 85% Rmax auto-lock still applies.' : '')
      : 'Guided course: cursor keys step between detected contacts as a teaching shortcut. Use Free lab for continuous cursor control.';
  }

  const modeSeg = segmented<PageMode>({
    id: 'tws-mode', label: 'Radar mode', value: L.mode, fill: true, options: modeOptions(),
    onChange: v => { flash(L.setMode(v)); syncControls(true); },
  });
  const scanRow = h('div', { class: 'tws-scanrow' });
  let azSeg: ReturnType<typeof segmented<number>> | null = null;
  let barSeg: ReturnType<typeof segmented<number>> | null = null;
  let posSeg: ReturnType<typeof segmented<number>> | null = null;
  const ruScan = spec.radar.azHalfWidthOptionsDeg.length === 1 && !!spec.radar.tws?.autoSttAtRmaxFraction;
  if (ruScan) {
    const lr = k('scanLR');
    const alts = lr ? lr.split(' / ') : [];
    posSeg = segmented<number>({
      id: 'tws-pos', label: `Scan zone (60° wide)`, value: 0, size: 's',
      options: [
        { value: -30, label: 'Left', keys: alts[0] }, { value: 0, label: 'Centre' }, { value: 30, label: 'Right', keys: alts[1] },
      ],
      onChange: v => { L.setCenter(v); syncControls(true); },
    });
    scanRow.append(posSeg.el);
  } else {
    azSeg = segmented<number>({
      id: 'tws-az', label: 'Scan width', value: Math.round(L.me.radar.azHalf * R2D), size: 's', options: [],
      onChange: v => { flash(L.setAz(v)); syncControls(true); },
    });
    scanRow.append(azSeg.el);
  }
  if (spec.radar.barOptions.length > 1) {
    barSeg = segmented<number>({
      id: 'tws-bars', label: 'Bars', value: L.me.radar.bars, size: 's', options: [],
      onChange: v => { flash(L.setBars(v)); syncControls(true); },
    });
    scanRow.append(barSeg.el);
  } else {
    scanRow.append(h('div', { class: 'ui-field tws-fixed' }, placard('Bars'), h('span', { class: 'tws-fixed__v', title: 'Not selectable in FC3; 4 bars assumed' }, `${spec.radar.barOptions[0]} · fixed`)));
  }
  const centreSlider = ruScan ? null : slider({
    id: 'tws-centre', label: 'Scan centre', min: -spec.radar.gimbalAzDeg, max: spec.radar.gimbalAzDeg, step: 1, value: 0, unit: '°',
    onInput: v => { L.setCenter(v); autoTog?.set(false); },
  });
  const autoTog = ruScan ? null : toggle({
    id: 'tws-auto', label: 'Auto', size: 's', value: true, title: 'TWS: keep the scan centred on the primary target',
    onChange: v => { L.setCenter(v ? 'auto' : Math.round(L.me.radar.azCenter * R2D)); },
  });
  const elSlider = slider({
    id: 'tws-el', label: 'Antenna elevation', min: -10, max: 10, step: 0.5, value: 0, unit: '°', readoutCh: 6,
    onInput: v => { L.setElevation(v); },
  });
  const coverEl = h('p', { class: 'tws-hint', id: 'tws-cover' }, '');
  const radarRead = readouts({
    id: 'tws-radar-read', columns: 2, rows: [
      { id: 'frame', label: 'Revisit', title: 'Time for the beam to come back to the same spot: a track needs two hits' },
      { id: 'tracks', label: 'Track files' },
    ],
  });

  const desBtn = button({ label: ac === 'm2000c' ? 'Lock' : 'Designate', keys: k('designate'), onClick: () => { const id = actTarget(); if (id) { select(id); flash(L.act(id)); } else flash('No contact to designate yet.'); syncControls(true); } });
  const dropBtn = button({ label: 'Drop one', keys: k('undesignate'), title: spec.id === 'f15c' ? '"Unlock TWS Target": no default key in DCS' : 'Remove the designation under the cursor', onClick: () => { const id = pickDesignated(); if (id) L.undesignate(id); } });
  const cycleName = binds.acts.cycle?.name ?? (ac === 'f14b' ? 'NEXT LAUNCH' : 'Next target');
  const cycleBtn = button({ label: ac === 'fa18c' ? 'Swap L&S' : ac === 'f16c' ? 'Step bug' : ac === 'jf17' ? 'Swap HPT' : 'Next launch', keys: binds.acts.cycle?.keys ?? undefined, title: `${cycleName}: step the primary to the next track`, onClick: () => flash(L.cycle()) });
  const sttBtn = button({ label: short(spec.radar.modeLabels.stt) || 'STT', keys: k('stt'), title: binds.acts.stt?.name ?? 'STT on the primary (or the contact under the cursor)', onClick: () => { flash(L.lockPrimary()); syncControls(true); } });
  const unlockBtn = button({ label: 'Unlock', keys: k('unlock'), title: binds.acts.unlock?.name ?? 'Back to search', onClick: () => { L.unlock(); syncControls(true); } });
  const actRow = h('div', { class: 'tws-actions' }, desBtn.el, ac === 'f15c' ? dropBtn.el : null, cycleAllowed() ? cycleBtn.el : null, spec.radar.tws ? sttBtn.el : null, unlockBtn.el);

  const scanPanel = consolePanel({
    id: 'tws-scan-panel', title: `Scan · ${spec.radar.name}`, dense: true,
    children: [scanRow, centreSlider ? h('div', { class: 'tws-centre' }, centreSlider.el, autoTog?.el ?? null) : null, elSlider.el, coverEl, radarRead.el],
  });

  const weaponSeg = segmented<MissileId>({
    id: 'tws-weapon', label: 'Weapon', value: L.me.selectedWeapon ?? spec.loadout[0].missile, size: 's', options: weaponOptions(),
    onChange: v => { L.selectWeapon(v); syncControls(true); },
  });
  const weaponInfo = h('p', { class: 'tws-hint' }, '');
  const fireHold = binds.acts.fire?.holdS;
  const fireBtn = button({
    label: 'Fire', variant: 'primary', size: 'l', block: true, keys: k('fire'),
    title: `${binds.acts.fire?.name ?? 'Launch'}${fireHold ? ` (hold ${fireHold} s on the keyboard)` : ''}`,
    onClick: () => { flash(L.fire()); syncControls(true); },
  });
  const fireWhy = h('p', { class: 'tws-firewhy', role: 'status' }, '');
  const cueLamp = lamp({ id: 'tws-cue', label: 'CUE', tone: 'ok', title: 'Cockpit cue where verified; otherwise a trainer launch-availability indicator' });
  const cd = L.crankDeg;
  const steerSeg = segmented<Steer>({
    id: 'tws-steer', label: `Your jet (crank ${cd}°)`, value: 'straight', size: 's', fill: true,
    options: [
      { value: 'straight', label: 'Straight', title: 'Hold the heading you started on' },
      { value: 'hot', label: 'Hot', title: 'Point at the group: fastest closure, earliest merge' },
      { value: 'left', label: 'Crank L', title: `Turn left until the group sits ${cd}° right of the nose: slower closure, still inside your ±${spec.radar.gimbalAzDeg}° gimbal` },
      { value: 'right', label: 'Crank R', title: `Turn right until the group sits ${cd}° left of the nose: slower closure, still inside your ±${spec.radar.gimbalAzDeg}° gimbal` },
    ],
    onChange: v => L.setSteer(v),
  });
  const cockpitPanel = consolePanel({
    id: 'tws-cockpit', title: `Radar and weapons · ${spec.short}`, dense: true,
    children: [modeSeg.el, actRow, weaponSeg.el, h('div', { class: 'tws-firerow' }, fireBtn.el, cueLamp.el), fireWhy, steerSeg.el],
  });

  const progressEl = h('span', { class: 'tws-progress' }, '');
  const list = checklist({ id: 'tws-steps', steps: steps.map(s => ({ id: s.id, text: s.text, keys: s.keys, note: s.note })) });
  const lessonPanel = consolePanel({ id: 'tws-lesson', title: `Lesson · ${spec.short}`, actions: progressEl, dense: true, children: [list.el] });

  const log = eventLog({ id: 'tws-log', max: 40, empty: 'Nothing yet. Switch modes, designate, shoot.' });
  const logPanel = consolePanel({ id: 'tws-log-panel', title: 'Event log', dense: true, children: [log.el] });

  const keyRows: HTMLElement[] = [];
  const keyLabel: Partial<Record<PageAct, string>> = {
    mode: spec.radar.tws ? 'RWS / TWS' : 'Radar mode', designate: ac === 'm2000c' ? 'Lock' : 'Designate / lock', stt: 'Lock the primary',
    unlock: 'Unlock / back to search', undesignate: 'Drop one designation', cycle: 'Next primary', fire: 'Launch', weapon: 'Weapon',
    range: 'Display range', scanLR: 'Scan zone left / right', scanWidth: 'Scan width',
  };
  for (const act of Object.keys(keyLabel) as PageAct[]) {
    const b = binds.acts[act];
    if (!b) continue;
    const name = spec.module === 'full' ? `${keyLabel[act]} · ${b.name}` : keyLabel[act] ?? act;
    const note = b.source === 'page' ? pageKeyTag(b) : b.holdS ? `hold ${b.holdS} s` : undefined;
    keyRows.push(b.keys ? keyHint({ label: name, keys: b.keys, note }) : h('div', { class: 'ui-keyhint' }, h('span', { class: 'ui-keyhint__label' }, name), h('span', { class: 'ui-keyhint__note' }, 'click')));
  }
  if (binds.cursor) keyRows.push(keyHint({ label: 'Cursor (guided: step; free: slew)', keys: `${binds.cursor.up} ${binds.cursor.left} ${binds.cursor.down} ${binds.cursor.right}`, note: binds.cursor.source === 'page' ? 'page keys' : undefined }));
  keyRows.push(keyHint({ label: 'Free lab: heading / altitude', keys: 'Left Right Up Down', note: 'trainer commands, not DCS stick inputs' }));
  for (const [id, key] of Object.entries(binds.weaponKeys)) if (key) keyRows.push(keyHint({ label: `Select ${MISSILES[id as MissileId].name}`, keys: key }));
  const keysPanel = consolePanel({
    id: 'tws-keys', title: spec.module === 'fc3' ? 'Keys (FC3 defaults)' : 'Keys (HOTAS · keyboard)', dense: true,
    children: [h('div', { class: 'tws-keys' }, keyRows), h('p', { class: 'tws-hint' }, 'From your jet\'s DCS bindings. Check your own controls page.')],
  });
  const simple = callout({ kind: 'simplified', body: h('ul', { class: 'tws-simple' }, intro.simplified.map(s => h('li', null, s))) });

  // The mobile controls invoke the same buttons as the console. A single sync path keeps
  // availability, explanations and aircraft-specific designation legends identical.
  const mobileDes = button({ id: 'tws-mobile-designate', label: 'Designate', onClick: () => desBtn.el.click() });
  const mobileLock = button({ id: 'tws-mobile-lock', label: 'Lock primary', title: sttBtn.el.title, onClick: () => sttBtn.el.click() });
  const mobileUnlock = button({ id: 'tws-mobile-unlock', label: 'Unlock', onClick: () => unlockBtn.el.click() });
  const mobileFire = button({ id: 'tws-mobile-fire', label: 'Fire', variant: 'primary', onClick: () => { fireBtn.el.click(); updateUi(); } });
  const mobileNow = h('p', { class: 'tws-mobile-now' });
  const mobileStatus = h('p', { class: 'tws-mobile-status', role: 'status' });
  const mobileActions = h('div', { class: 'tws-mobile-actions' }, mobileNow,
    h('div', { class: 'tws-mobile-buttons' }, mobileDes.el, mobileLock.el, mobileUnlock.el, mobileFire.el), mobileStatus);
  const brief = h('div', { class: 'tws-brief' }, coach.el, lessonPanel.el);
  const banditExtras = disclosure({ id: 'tws-bandit-details', title: 'Bandit warnings · observer view',
    content: [banditsBlock, rwrBezel.el] });

  // ------------------------------------------------------------------ layout
  const lab = labLayout({
    id: 'tws-lab', class: 'tws', mobileTabs: true, mobileActions,
    header: { title: 'Track while scan', actions: sessionMode.el, meta: `${spec.short} · ${spec.radar.name}` },
    viewport: viewEl,
    strip: [radarBezel.el, brief],
    console: [cockpitPanel.el,
      disclosure({ title: 'Scan settings', content: scanPanel.el }),
      disclosure({ title: 'Cursor and trainer controls', content: sessionPanel.el }),
      disclosure({ title: 'World layers and legend', content: [layerChips.el, legend] }),
      banditExtras,
      disclosure({ title: 'Event log', content: logPanel.el }),
      disclosure({ title: 'Keyboard controls', content: keysPanel.el }),
      disclosure({ title: 'Lesson notes and accuracy', content: [h('p', { class: 'tws-hint' }, intro.lede), weaponInfo, simple] }),
    ],
  });
  bag.add(() => lab.destroy());
  lab.overlay('tr', camSeg.el);
  lab.overlay('bl', clock);
  ctx.root.append(lab.el);
  updateSession();

  for (const b of L.bandits) {
    const c = makeCard(b.id);
    cards.set(b.id, c);
    cardGrid.append(c.el);
  }

  // ------------------------------------------------------------------ 3D
  let stage: Stage | null = null;
  let view: WorldView | null = null;
  let rig: CameraRig | null = null;
  if (isWebGLAvailable()) {
    try {
      stage = new Stage(viewEl, { autoPause: 'render', ariaLabel: '3D view: the four bandits as they really are, and what your radar believes' });
      view = new WorldView(stage, L.world, {
        units, observer: L.me.id, radarVolumeOf: L.me.id,
        layers: { tracks: true, bricks: true, truth: true, radarVolume: true, velocity: false },
        radarVolume: { coverageAt: [] },
        label: (a, u) => tagFor(a, u),
      });
      rig = new CameraRig(stage, { source: view, view: { headingDeg: 12, elevationDeg: 26, distance: 90000 } });
      setCamera('tactical', true);
      stage.onTap((x, y) => {
        const id = view?.pickEntity(x, y, { kinds: ['aircraft'] }) ?? null;
        if (id && L.bandit(id)) { select(id); if (!L.freeLab) flash(L.act(id)); else positionCursor(id); syncControls(true); }
      });
    } catch (e) {
      console.warn('tws: 3D view unavailable', e);
      stage = null; view = null; rig = null;
    }
  } else {
    viewEl.append(h('p', { class: 'tws-nogl' }, 'WebGL is not available, so the 3D view is off. The radar display and the bandit cards still work.'));
  }

  // ------------------------------------------------------------------ displays
  const radar = new RadarDisplay(radarCv, { format: spec.display, units, aircraft: ac, manualCursor: L.freeLab && !L.dcsCursorSnap });
  let rwrFor: AircraftId | null = null;
  const rwr = new RwrDisplay(rwrCv, { rwr: spec.rwr });
  bag.add(() => radar.dispose());
  bag.add(() => rwr.dispose());
  bag.on(radarCv, 'click', (e: MouseEvent) => {
    const pe = e as PointerEvent;
    if (L.freeLab) {
      const at = radar.toRadar(e.clientX, e.clientY);
      if (at) { setCursor(L.world, L.me, at); L.hooked = L.contactAtCursor(); select(L.hooked); syncControls(true); }
      return;
    }
    const id = radar.pick(e.clientX, e.clientY, pe.pointerType === 'touch' ? 12 : 4);
    if (id) { select(id); if (L.freeLab) positionCursor(id); else flash(L.act(id)); syncControls(true); }
    else if (L.me.radar.mode !== 'stt') flash('Nothing there that your radar knows about: you can only designate what it has detected.');
  });

  // ------------------------------------------------------------------ end modal
  let endModal: ModalHandle | null = null;
  const sug = suggestion(ac);
  L.onEnd = () => { paused = true; speedSeg.set('0'); showEnd(); };
  L.onLog = l => log.push(l.text, { t: l.t, tone: l.tone });
  bag.add(() => endModal?.destroy());

  function showEnd(): void {
    const s = endSummary(L);
    const body = h('div', { class: 'tws-end' },
      h('p', null, s.lead),
      h('table', { class: 'tws-end__table' },
        h('thead', null, h('tr', null, h('th', null, 'Bandit'), h('th', null, 'Result'), h('th', null, 'His first warning'))),
        h('tbody', null, s.rows.map(r => h('tr', null, h('td', null, r.callsign), h('td', null, r.result), h('td', null, r.warning))))),
      h('p', { class: 'tws-end__insight' }, s.insight),
      h('p', { class: 'tws-end__try' }, `Same picture in the ${AIRCRAFT[sug.ac].short}: ${sug.why}.`));
    endModal?.destroy();
    endModal = modal({
      id: 'tws-end', class: 'tws-endmodal', title: s.title, body, tone: s.tone, open: true,
      actions: [
        { label: 'Run it again', primary: true, onClick: () => reset() },
        { label: `Fly it in the ${AIRCRAFT[sug.ac].short}`, onClick: () => ctx.app.setAircraft(sug.ac) },
      ],
    });
  }

  // ------------------------------------------------------------------ keys (from the jet's PROCEDURES binds)
  const hold = (id: string, s: number, fn: () => void): KeyBinding => ({
    down: () => holds.start(id, s, fn),
    up: () => { if (holds.cancel(id) && id === 'fire') flash(`Hold ${binds.acts.fire?.keys ?? 'the key'} for ${s} s to launch.`); },
  });
  bag.add(() => { holds.clear(); });
  const km: KeyMap = {};
  const put = (keys: string | null | undefined, b: KeyMap[string]) => { if (keys && !(keys in km)) km[keys] = b; };
  const A = binds.acts;
  if (A.mode?.keys && A.mode.holdS && A.cycle?.keys === A.mode.keys) {
    // F-16 TMS Right: held 1 s toggles TWS, a short press steps the bug.
    put(A.mode.keys, {
      down: () => holds.start('mode', A.mode?.holdS ?? 1, () => { flash(L.toggleMode()); syncControls(true); }),
      up: () => { if (holds.cancel('mode')) flash(L.cycle()); },
    });
  } else {
    put(A.mode?.keys, () => { flash(L.toggleMode()); syncControls(true); });
  }
  put(A.designate?.keys, () => { const id = actTarget(); if (id) { select(id); flash(L.act(id)); } else flash('No contact under the cursor.'); syncControls(true); });
  put(A.stt?.keys, () => { flash(L.lockPrimary()); syncControls(true); });
  if (A.unlock?.keys && A.unlock.keys === A.cycle?.keys) {
    // Hornet Undesignate: leaves STT, else swaps L&S and DT2 / steps the L&S.
    put(A.unlock.keys, () => { if (L.me.radar.mode === 'stt') L.unlock(); else flash(L.cycle()); syncControls(true); });
  } else {
    put(A.unlock?.keys, () => { L.unlock(); syncControls(true); });
    put(A.cycle?.keys, () => flash(L.cycle()));
  }
  put(A.fire?.keys, A.fire?.holdS ? hold('fire', A.fire.holdS, () => { flash(L.fire()); syncControls(true); }) : () => { flash(L.fire()); syncControls(true); });
  put(A.weapon?.keys, () => { L.cycleWeapon(); syncControls(true); });
  for (const [id, key] of Object.entries(binds.weaponKeys)) put(key, () => { L.selectWeapon(id as MissileId); syncControls(true); });
  put(A.range?.keys, (e: KeyboardEvent) => L.zoom(e.code === 'Equal' ? -1 : 1));
  put(A.scanWidth?.keys, (e: KeyboardEvent) => {
    const opts = L.azOptions().filter(o => o.ok).map(o => o.deg).sort((a, b) => a - b);
    const cur = Math.round(L.me.radar.azHalf * R2D), i = opts.indexOf(cur);
    const next = opts[Math.max(0, Math.min(opts.length - 1, (i < 0 ? 0 : i) + (e.code === 'Equal' ? 1 : -1)))];
    if (next !== undefined) flash(L.setAz(next));
    syncControls(true);
  });
  put(A.scanLR?.keys, (e: KeyboardEvent) => {
    const dir = e.code === 'Comma' ? -1 : 1;
    if (ruScan) {
      if (L.autoCentred) { flash(`${short(spec.radar.modeLabels.tws)} centres the scan on the target by itself.`); return; }
      const cur = Math.round(L.me.radar.azCenter * R2D); L.setCenter(Math.max(-30, Math.min(30, cur + dir * 30)));
    }
    else { L.setCenter(Math.round(L.me.radar.azCenter * R2D) + dir * 10); autoTog?.set(false); }
    syncControls(true);
  });
  if (binds.cursor) {
    const c = binds.cursor;
    const cursorTo = (dx: number, dy: number) => { L.hookStep(dx, dy); select(L.hooked); flash(L.cursorSnap(L.hooked)); syncControls(true); };
    const direction = (action: 'left' | 'right' | 'up' | 'down', dx: number, dy: number): KeyBinding => {
      const held = labInput.binding(action);
      return { down: e => { if (L.freeLab) held.down?.(e!); else cursorTo(dx, dy); }, up: e => held.up?.(e) };
    };
    put(c.left, direction('left', -1, 0));
    put(c.right, direction('right', 1, 0));
    put(c.up, direction('up', 0, 1));
    put(c.down, direction('down', 0, -1));
  }
  put('Left', labInput.binding('turnLeft'));
  put('Right', labInput.binding('turnRight'));
  put('Up', labInput.binding('climb'));
  put('Down', labInput.binding('descend'));
  bag.add(bindKeys(km, window, { enabled: () => !endModal?.isOpen }));

  // ------------------------------------------------------------------ helpers

  function cycleAllowed(): boolean {
    return ['fa18c', 'f16c', 'jf17', 'f14b'].includes(ac);
  }

  function modeOptions(): SegOption<PageMode>[] {
    const r = spec.radar, lbl = r.modeLabels, o: SegOption<PageMode>[] = [];
    const sub = (m: 'rws' | 'tws' | 'stt', label: string | undefined) => {
      const generic = m.toUpperCase();
      return label && short(label) !== generic ? generic : m === 'rws' ? 'search' : m === 'tws' ? 'track+scan' : 'lock';
    };
    o.push({ value: 'rws', label: short(lbl.rws) || 'RWS', sub: sub('rws', lbl.rws) });
    const mb = binds.acts.mode;
    if (r.tws) o.push({ value: 'tws', label: short(lbl.tws) || 'TWS', sub: sub('tws', lbl.tws), keys: mb?.keys ?? undefined, title: mb ? `${mb.name}${mb.holdS && !/hold/i.test(mb.name) ? ` (hold ${mb.holdS} s)` : ''}` : undefined });
    else o.push({ value: 'tws', label: 'TWS', sub: 'none', disabled: true, title: `No TWS in the ${spec.short}: PSID tracks one target for awareness and cannot guide the Super 530D` });
    const mk = binds.acts.mode?.keys;
    if (ac === 'mig29s') o.push({ value: 'snp2', label: 'СНП2', sub: 'TWS ×2', title: `Two R-77s at two targets within 8°${mk ? ` (${mk} twice from ОБЗ)` : ''}` });
    o.push({ value: 'stt', label: short(lbl.stt) || 'STT', sub: sub('stt', lbl.stt), keys: binds.acts.stt?.keys ?? undefined });
    return o;
  }

  function weaponOptions(): SegOption<MissileId>[] {
    return (Object.keys(L.me.stores) as MissileId[]).map(id => ({
      value: id, label: `${MISSILES[id].name} ×${L.me.stores[id] ?? 0}`, disabled: (L.me.stores[id] ?? 0) <= 0,
      keys: binds.weaponKeys[id], title: MISSILES[id].guidanceRule,
    }));
  }

  function pickDesignated(): EntityId | null {
    const d = L.me.radar.designated;
    if (L.hooked && d.includes(L.hooked)) return L.hooked;
    return d[d.length - 1] ?? null;
  }

  function positionCursor(id: EntityId): void {
    const contact = L.contacts().find(c => c.id === id);
    if (contact) setCursor(L.world, L.me, { az: contact.az, range: contact.range });
  }

  function select(id: EntityId | null): void {
    selected = id;
    if (id) L.hooked = id;
    view?.select(id);
    for (const [cid, c] of cards) setAttr(c.el, 'data-selected', cid === id ? 'true' : null);
  }

  function tagFor(a: AircraftLike, u: Units): { title: string; type?: string; sub: string; flag?: string } {
    const sub = fmtAltShort(a.pos.y, u) + ' · ' + fmtSpeed(a.vel.length(), u);
    if (!L.bandit(a.id)) return { title: a.callsign, type: AIRCRAFT[a.type].short, sub };
    const s = L.banditState(a.id);
    const flag = s === 'quiet' || s === 'dead' ? '' : `RWR ${STATE_TEXT[s].toUpperCase()}`;
    return { title: a.callsign, type: AIRCRAFT[a.type].short, sub, flag };
  }

  function setCamera(v: 'tactical' | 'top' | 'chase', instant = false): void {
    if (!rig) return;
    const ids = [L.me.id, ...L.bandits.filter(b => b.alive).map(b => b.id)];
    if (v === 'tactical') rig.frame(ids, { headingDeg: 8, elevationDeg: 38, padding: 1.05, instant });
    else if (v === 'top') {
      const alive = L.bandits.filter(b => b.alive);
      const cx = (L.me.pos.x + alive.reduce((s, b) => s + b.pos.x, 0)) / (alive.length + 1);
      const cz = (L.me.pos.z + alive.reduce((s, b) => s + b.pos.z, 0)) / (alive.length + 1);
      const far = Math.max(20000, ...alive.map(b => b.pos.distanceTo(L.me.pos)));
      rig.setMode('top', { focus: { x: cx, y: L.me.pos.y, z: cz }, distance: far * 1.35, instant });
    } else rig.setMode('chase', { focus: L.me.id, lookAt: selected ?? L.me.radar.designated[0] ?? L.bandits.find(b => b.alive)?.id ?? null, distance: 260, instant });
  }

  // ------------------------------------------------------------------ bandit cards
  interface CardUi {
    el: HTMLElement; state: HTMLElement; rng: HTMLElement; why: HTMLElement; sym: HTMLElement; lampEl: HTMLElement;
    act: ReturnType<typeof button>; notch: ReturnType<typeof toggle>;
  }
  function makeCard(id: EntityId): CardUi {
    const b = L.bandit(id);
    const name = b?.callsign ?? id, type = b ? AIRCRAFT[b.type].short : '';
    const lampEl = h('span', { class: 'tws-card__lamp', 'aria-hidden': 'true' });
    const state = h('span', { class: 'tws-card__state' }, 'Quiet');
    const rng = h('span', { class: 'tws-card__rng' }, '');
    const why = h('p', { class: 'tws-card__why' }, '');
    const line = rwrLine(L, id);
    const sym = h('span', { class: 'tws-card__sym', title: `How his RWR shows your ${spec.short}: ${line}` }, line);
    const act = button({ label: 'Designate', size: 's', onClick: () => cardAct(id) });
    const notch = toggle({ id: `tws-notch-${id}`, label: 'Notch', size: 's', title: 'Make him turn to beam you: zero closure, into your Doppler notch', onChange: () => { L.toggleNotch(id); } });
    const el = h('article', { class: 'tws-card', dataset: { state: 'quiet' }, 'aria-label': `${name}, what his RWR shows` },
      h('header', { class: 'tws-card__head' }, h('b', null, name), h('span', { class: 'tws-card__type' }, type), rng),
      h('div', { class: 'tws-card__glass' },
        h('div', { class: 'tws-card__rwr' }, lampEl, state, sym),
        why),
      h('div', { class: 'tws-card__btns' }, act.el, notch.el));
    el.addEventListener('click', e => { if (!(e.target as HTMLElement).closest('button')) select(id); });
    return { el, state, rng, why, sym, lampEl, act, notch };
  }

  function cardAct(id: EntityId): void {
    select(id);
    const st = L.me.radar;
    if (st.mode === 'tws' && st.designated.includes(id)) L.undesignate(id);
    else if (st.mode === 'stt' && st.stt.targetId === id) L.unlock();
    else flash(L.act(id));
    syncControls(true);
  }

  // ------------------------------------------------------------------ per-frame + throttled UI
  let lastUi = -1e9;
  let lastKey = '';
  let pic: RadarPicture | null = null;

  function syncControls(force = false): void {
    const st = L.me.radar, mode = L.mode, tws = st.mode === 'tws';
    modeSeg.set(mode === 'off' || mode === 'vs' || mode === 'acm' ? 'rws' : mode);
    const hasContact = L.freeLab ? !!L.contactAtCursor() : L.contacts().length > 0;
    const hasLockTarget = hasContact || st.designated.length > 0;
    modeSeg.setDisabled('stt', mode !== 'stt' && !hasLockTarget);
    // Scan options only change with the mode, the bars/az and (F-16) the bug.
    const key = `${mode}|${st.bars}|${Math.round(st.azHalf * R2D)}|${st.designated.length > 0}|${Object.values(L.me.stores).join(',')}`;
    if (force || key !== lastKey) {
      lastKey = key;
      if (azSeg) {
        azSeg.setOptions(L.azOptions().map(o => ({ value: o.deg, label: `±${o.deg}°`, sub: `${o.frameS.toFixed(1)} s`, disabled: !o.ok, title: o.why || `Frame ${o.frameS.toFixed(1)} s with ${st.bars} bars` })), Math.round(st.azHalf * R2D));
      }
      if (barSeg) barSeg.setOptions(L.barOptions().map(o => ({ value: o.n, label: `${o.n}B`, disabled: !o.ok, title: o.why || `${o.n} bars` })), st.bars);
      weaponSeg.setOptions(weaponOptions(), L.me.selectedWeapon ?? undefined);
    }
    if (posSeg) {
      posSeg.set(Math.round(st.azCenter * R2D / 30) * 30);
      const auto = st.mode === 'tws' && st.designated.length > 0;
      for (const v of [-30, 0, 30]) posSeg.setDisabled(v, st.mode === 'stt' || auto);
    }
    if (centreSlider) {
      const lim = Math.max(0, spec.radar.gimbalAzDeg - st.azHalf * R2D);
      centreSlider.setRange(-Math.max(1, Math.round(lim)), Math.max(1, Math.round(lim)), 1);
      centreSlider.set(Math.round(st.azCenter * R2D));
      centreSlider.setDisabled(st.mode === 'stt' || lim < 1);
    }
    if (autoTog) { autoTog.setDisabled(st.mode !== 'tws'); }
    const elLim = L.elevationLimitDeg();
    elSlider.setRange(-Math.min(10, elLim), Math.min(10, elLim), 0.5);
    elSlider.set(Math.round(st.elCenter * R2D * 2) / 2);
    elSlider.setDisabled(st.mode === 'stt' || L.autoCentred);
    if (L.me.selectedWeapon) weaponSeg.set(L.me.selectedWeapon);
    desBtn.setDisabled(st.mode === 'stt' || !hasContact);
    // Designate on a track that is already the primary (or, on "Enter twice" jets, any designated one) locks it.
    const tgt = actTarget();
    const relock = tws && !L.snp2 && !!tgt && st.designated.includes(tgt) && (radarRules(ac).redesignate === 'lock' || st.designated[0] === tgt);
    setLegend(desBtn, st.mode === 'rws' || !spec.radar.tws || relock ? 'Lock' : L.snp2 && !st.designated.length ? 'Lead (Ц1)' : ac === 'f16c' ? 'Bug' : ac === 'jf17' && !st.designated.length ? 'HPT' : 'Designate');
    dropBtn.setDisabled(!tws || !st.designated.length);
    cycleBtn.setDisabled(!tws || (ac === 'jf17' && st.designated.length < 2));
    sttBtn.setDisabled(st.mode === 'stt' || !hasLockTarget);
    unlockBtn.setDisabled(!(st.mode === 'stt' || (tws && st.designated.length > 0)));
    const noContact = L.freeLab ? 'No contact under the cursor' : 'Your radar has no contact yet';
    setWhy(desBtn, st.mode === 'stt' ? 'STT: only the locked target exists. Unlock first.' : !hasContact ? noContact : null);
    setWhy(dropBtn, !tws ? 'Works in TWS' : !st.designated.length ? 'No designation to drop' : null);
    setWhy(cycleBtn, !tws ? 'Works in TWS' : ac === 'jf17' && st.designated.length < 2 ? 'Bug a second track first (SPT)' : null);
    setWhy(sttBtn, st.mode === 'stt' ? 'Already locked' : !hasLockTarget ? noContact : null);
    setWhy(unlockBtn, st.mode === 'stt' || (tws && st.designated.length > 0) ? null : 'Nothing locked or designated');
    for (const [source, mobile] of [[desBtn, mobileDes], [sttBtn, mobileLock], [unlockBtn, mobileUnlock]] as const) {
      mobile.setDisabled(source.el.disabled);
      mobile.el.title = source.el.title;
    }
    setLegend(mobileDes, relock ? 'Lock cursor' : legends.get(desBtn) ?? 'Designate');
    // RWS Designate already locks: avoid two identical actions on a small screen.
    mobileLock.el.hidden = !spec.radar.tws || st.mode === 'rws';
  }

  function updateUi(): void {
    const st = L.me.radar, w = L.world, mode = L.mode;
    setText(clockEl, fmtTime(w.t));
    syncControls();
    // Radar panel readouts.
    radarRead.set('frame', st.mode === 'stt' ? 'continuous' : `${L.revisit().toFixed(1)} s`);
    const maxT = spec.radar.tws?.maxTracks;
    radarRead.set('tracks', st.mode === 'rws' ? 'none' : `${st.tracks.length}${maxT && st.mode === 'tws' ? ` / ${maxT}` : ''}`);
    if (pic) {
      const c = pic.altCoverage;
      setText(coverEl, st.mode === 'stt' ? 'STT: the beam stares at one target.' : `Scan covers ${altK(Math.max(0, c.bottom), units)} to ${altK(c.top, units)} at ${fmtRange(c.atRange, units)}${L.autoCentred ? ' · centred on the primary' : ''}`);
    }
    radarBezel.setStatus(pic ? `${pic.modeLabel}${mode === 'snp2' ? ' · СНП2' : ''}` : '');
    // Weapons.
    const wid = L.me.selectedWeapon;
    setText(weaponInfo, L.snp2 && wid === 'r77'
      ? 'R-77 in СНП2: stay in СНП2 until each seeker goes active, about 15 km from its target. A lock (АТК) drops Ц2 and its missile.'
      : wid ? `${MISSILES[wid].name}: ${MISSILES[wid].guidanceRule}` : 'No missile selected.');
    const ck = L.snp2 ? L.snp2Status() : L.canLaunch();
    const ok = !!ck?.ok && !L.ended;
    fireBtn.setDisabled(!ok);
    setLegend(fireBtn, wid ? (L.snp2 && (L.me.stores.r77 ?? 0) >= 2 ? 'Fire 2 × R-77' : `Fire ${MISSILES[wid].name}`) : 'Fire');
    const cue = pic?.cueLabel ?? '';
    const cueText = cue === '*' ? 'Star' : cue === '▲' ? 'Triangle' : cue || 'Launch available';
    const cueLeg = cueLamp.el.querySelector('.ui-lamp__legend');
    if (cueLeg) setText(cueLeg, cueText);
    cueLamp.set(pic?.shootCue && ok ? 'on' : 'off');
    setText(fireWhy, L.ended ? '' : ok ? (pic?.shootCue ? `${cueText} lit: in the zone.` : `Launch allowed. ${pic?.launchBlockedReason ?? ''}`.trim()) : (ck?.reason ?? ''));
    setAttr(fireWhy, 'data-ok', ok ? 'true' : null);
    mobileFire.setDisabled(!ok);
    setLegend(mobileFire, L.snp2 && (L.me.stores.r77 ?? 0) >= 2 ? 'Fire ×2' : 'Fire');
    mobileFire.el.title = `${legends.get(fireBtn) ?? 'Fire'}. ${fireWhy.textContent ?? ''}`;
    setText(mobileStatus, `${short(spec.radar.modeLabels[st.mode]) || st.mode.toUpperCase()} · ${wid ? MISSILES[wid].name + ': ' : ''}${fireWhy.textContent || (paused ? 'Paused' : 'Training in progress')}`);
    setAttr(mobileStatus, 'data-ok', ok ? 'true' : null);
    // Coach.
    const now = performance.now();
    if (now - flashAt < FLASH_MS) coach.set(flashText, '', 'caution');
    else if (paused && !L.ended && w.t === 0 && reduced) coach.set('Paused: reduced motion is on. Press 1× to start the drill.', '', 'dim');
    else if (L.freeLab) coach.set('Free lab: fly, scan, designate, lock and unlock.', `Commanded heading ${Math.round(L.me.cmd.heading * R2D + 360) % 360}° · altitude ${fmtAltShort(L.me.cmd.altitude, units)}. Radar cursor range ${fmtRange(L.me.radar.cursor.range, units)}.`, 'hi');
    else { const c = coachFor(L, binds); coach.set(c.text, c.why, c.tone); }
    // Checklist and progress.
    let done = 0, current: string | null = null;
    for (const s of steps) {
      const d = s.done(L);
      if (d) done++;
      else if (!current) current = s.id;
      if (d !== list.isDone(s.id)) list.setDone(s.id, d);
    }
    list.setCurrent(current);
    setText(progressEl, `${done} / ${steps.length}`);
    const currentStep = steps.find(s => s.id === current);
    setText(mobileNow, now - flashAt < FLASH_MS ? flashText : L.freeLab
      ? 'Practice · Select a contact in World or position the cursor in Displays.'
      : `Now · ${currentStep?.text ?? 'Checklist complete'} (${done}/${steps.length})`);
    if (done === steps.length && !saved) {
      saved = true;
      if (!L.freeLab) ctx.app.setProgress(`tws:${ac}:done`, true);
      log.push(`Checklist complete for the ${spec.short}. Saved.`, { t: w.t, tone: 'ok' });
    }
    // Bandit cards.
    for (const b of L.bandits) {
      const c = cards.get(b.id);
      if (!c) continue;
      const s = L.banditState(b.id);
      if (c.el.dataset.state !== s) c.el.dataset.state = s;
      setText(c.state, STATE_TEXT[s]);
      setAttr(c.lampEl, 'title', rwrCue(L, b.id, s) || null);
      setText(c.rng, b.alive ? fmtRange(L.rangeTo(b.id), units) : '');
      setText(c.why, banditWhy(L, b.id));
      const trk = st.tracks.find(t => t.targetId === b.id);
      const designated = st.designated.includes(b.id);
      let label = 'Designate', dis = !b.alive || !!L.ended;
      if (st.mode === 'rws' || !spec.radar.tws) { label = st.mode === 'stt' && st.stt.targetId === b.id ? 'Unlock' : 'Lock'; dis ||= st.mode === 'stt' ? st.stt.targetId !== b.id : !L.hasContact(b.id); }
      else if (st.mode === 'stt') { label = st.stt.targetId === b.id ? 'Unlock' : 'Designate'; dis ||= st.stt.targetId !== b.id; }
      else { label = designated ? 'Drop' : 'Designate'; dis ||= !designated && !trk?.firm; }
      setLegend(c.act, label);
      c.act.setDisabled(dis);
      c.act.el.title = dis && b.alive && !L.ended ? (st.mode === 'stt' ? 'STT: unlock first' : 'No firm track on him yet') : '';
      c.notch.set(L.notching.has(b.id));
      c.notch.setDisabled(!b.alive || !!L.ended);
      const nl = c.notch.el.querySelector('.ui-btn__legend');
      if (nl) setText(nl, L.notching.has(b.id) ? 'Turn hot' : 'Notch');
    }
    // His RWR display follows the selected bandit (else the one hearing the most).
    const target = (selected && L.bandit(selected)?.alive ? selected : null)
      ?? [...L.bandits].filter(b => b.alive).sort((a, b) => rank(L.banditState(b.id)) - rank(L.banditState(a.id)))[0]?.id ?? null;
    const tb = L.bandit(target);
    if (tb) {
      const bt = AIRCRAFT[tb.type];
      if (rwrFor !== tb.type) { rwrFor = tb.type; rwr.setOptions({ rwr: bt.rwr }); }
      rwrBezel.setLabel(`${tb.callsign}'s RWR`);
      rwrBezel.setStatus(RWRS[bt.rwr].name.split(' "')[0]);
    }
    hisRwrId = target;
    // Radar cursor on the hooked contact.
    if (!L.freeLab && L.hooked) {
      const c = L.contacts().find(x => x.id === L.hooked), cur = L.me.radar.cursor;
      if (c && (Math.abs(c.az - cur.az) > 0.01 || Math.abs(c.range - cur.range) > 300)) L.world.setScan(L.me.id, { cursor: { az: c.az, range: c.range } });
    }
  }
  let hisRwrId: EntityId | null = null;
  const rank = (s: string) => ['dead', 'quiet', 'search', 'lock', 'launch', 'missile'].indexOf(s);

  // ------------------------------------------------------------------ loop
  const frame = (dt: number) => {
    labInput.step(L, Math.min(dt, 0.1), paused || !!L.ended);
    if (dt > 0 && !paused && !L.ended) {
      const d = Math.min(dt, 0.1) * speed;
      if (autoplay && !L.freeLab) autopilotTick(L, ap);
      L.step(d);
    }
    pic = L.picture();
    radar.draw(pic, { ownHeading: L.me.heading });
    rwr.draw(hisRwrId ? L.banditContacts(hisRwrId) : [], L.world.t);
    const now = performance.now();
    if (now - lastUi > UI_MS) { lastUi = now; updateUi(); }
  };
  let raf = 0;
  if (stage) {
    stage.onFrame(dt => frame(dt), FramePriority.sim);
    bag.add(() => { stage?.dispose(); stage = null; view = null; rig = null; });
  } else {
    // No WebGL: keep the lesson running on requestAnimationFrame.
    let last = performance.now();
    const tick = (now: number) => { const dt = Math.min(0.1, (now - last) / 1000); last = now; frame(dt); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    bag.add(() => cancelAnimationFrame(raf));
  }
  bag.add(() => { L.onLog = () => {}; L.onEnd = () => {}; });

  function reset(): void {
    endModal?.close();
    labInput.clear();
    holds.clear();
    L.reset();
    log.clear();
    view?.setWorld(L.world);
    view?.setObserver(L.me.id);
    view?.setRadarVolume(L.me.id);
    list.reset();
    select(null);
    autoTog?.set(true);
    steerSeg.set('straight');
    paused = false; speed = Number(speedSeg.value === '0' ? '1' : speedSeg.value) || 1;
    speedSeg.set(String(speed) as '1' | '2' | '4');
    camSeg.set('tactical');
    setCamera('tactical', true);
    lastKey = '';
    syncControls(true);
    log.push(startLine(), { t: 0 });
  }

  // ------------------------------------------------------------------ start
  log.push(startLine(), { t: 0 });
  if (shot && shot !== 'demo' && !L.freeLab) preroll(shot);
  const cam = ctx.params.get('cam');
  if (cam === 'top' || cam === 'chase') { camSeg.set(cam); setCamera(cam, true); }
  syncControls(true);
  updateUi();

  function preroll(kind: string): void {
    const until: Record<string, () => boolean> = {
      tracks: () => L.flags.des1 || L.world.t > 60,
      mid: () => L.playerMissiles().some(m => m.guidance === 'datalink' && (m.timeToActive ?? 99) < 14) || L.world.t > 110,
      active: () => L.flags.active.size > 0 || L.world.t > 140,
      stt: () => L.me.radar.mode === 'stt' || L.world.t > 120,
      end: () => !!L.ended,
    };
    const stop = until[kind] ?? until.mid;
    for (let i = 0; i < 4000 && !stop() && !L.ended; i++) {
      autopilotTick(L, ap);
      L.step(0.1);
      if (i % 3 === 0) view?.syncNow();
    }
    view?.syncNow();
    const d = L.me.radar.designated[0] ?? L.me.radar.stt.targetId;
    if (d) select(d);
    if (rig) setCamera('tactical', true);
  }

}
