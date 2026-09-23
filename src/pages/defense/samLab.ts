/**
 * [OWNER: page-defense] The SAM drill lab (#/defense?drill=sa10|sa11|sa15): one SAM site ahead of you, its
 * threat ring and altitude band in 3D, your RWR going search, lock, launch, and the defences that work in DCS
 * (beam the site with chaff, get under the ridge, leave the ring). Pure logic lives in samRun.ts.
 * URL params: ?drill=<sam>, ?alt=high|mid|low, ?ridge=0|1, ?shot=lock|launch|notch|result|live, ?cam=tactical.
 */
import { Vector3 } from 'three';
import type { PageContext } from '../../app/page';
import type { SamId } from '../../data/types';
import { SAMS, SAM_CAVEATS } from '../../data/sams';
import { RWRS } from '../../data/rwr';
import { M_PER_FT, M_PER_NM, R2D, bearingTo, elevationTo } from '../../sim/math';
import { fmtAlt, fmtRange, fmtSpeed, type Units } from '../../app/format';
import { Stage, WorldView, CameraRig, isWebGLAvailable } from '../../render';
import {
  h, setText, labLayout, disclosure, consolePanel, screenBezel, segmented, button, toggle, coachBox, eventLog, readouts,
  callout, placard, lamp, modal, bindKeys, keyHint, type Cleanup, type ModalHandle,
} from '../../ui';
import { RwrDisplay } from '../../ui/displays';
import { mobileAction } from '../../ui/mobileAction';
import { MANEUVER_LABEL, THROTTLES, type Maneuver, type Throttle } from './pilot';
import { cmKeys } from './cmkeys';
import {
  RIDGE_M, SAM_ALTS, SAM_DRILLS, SamRunner, samBrief, samCoach, samDebrief, samSetupFor, samShort,
  type SamAlt, type SamMetrics, type SamSetup,
} from './samRun';

const SHOTS = ['lock', 'launch', 'notch', 'result', 'live'] as const;
type Shot = typeof SHOTS[number];
const CHASE_M = 130;

export function mountSamLab(ctx: PageContext, bag: Cleanup, sam: SamId, isDead: () => boolean): void {
  const ac = ctx.app.aircraft;
  const spec = ctx.app.spec;
  const units: Units = ctx.app.units;
  const cm = cmKeys(ac);
  const reduced = Stage.prefersReducedMotion();

  let setup: SamSetup = samSetupFor(sam);
  const altP = ctx.params.get('alt');
  if (altP === 'high' || altP === 'mid' || altP === 'low') setup = { ...setup, alt: altP };
  const ridgeP = ctx.params.get('ridge');
  if (ridgeP === '0' || ridgeP === '1') setup = { ...setup, terrain: ridgeP === '1' };

  let run!: SamRunner;
  let attempt = 0;
  let paused = false;
  let timeScale = 1;
  let fastForward = true;
  let camMode: 'chase' | 'tactical' = ctx.params.get('cam') === 'tactical' ? 'tactical' : 'chase';
  let camAim: { h: number; e: number } | null = null;
  let userCamUntil = 0;
  let uiClock = 0;
  let result: ModalHandle | null = null;
  const camJet = new Vector3(), camSite = new Vector3();

  // ------------------------------------------------------------------ brief panel
  const brief = samBrief(sam, ac, units);
  const siteButtons = SAM_DRILLS.map(id => {
    const b = h('button', {
      type: 'button', class: 'dfn-drill', 'aria-pressed': String(id === sam), id: `dfn-drill-${id}`,
      onclick: () => { if (id !== sam) ctx.navigate(`defense?drill=${id}`); },
    }, h('span', { class: 'dfn-drill__n' }, '▲'), h('span', { class: 'dfn-drill__title' }, samShort(id)),
    h('span', { class: 'dfn-drill__best' }, bestText(id)));
    return b;
  });
  const missileBtn = button({ label: 'Missile drills', size: 's', variant: 'ghost', onClick: () => ctx.navigate('defense') });
  const altSeg = segmented<SamAlt>({
    id: 'dfn-sam-alt', label: 'Your altitude', value: setup.alt, fill: true, size: 's',
    options: SAM_ALTS.map(a => ({ value: a.value, label: a.label, title: a.title })),
    onChange: v => { setup = { ...setup, alt: v }; closeResult(); build(); },
  });
  const ridgeSw = toggle({
    id: 'dfn-sam-ridge', label: `Ridge ${fmtAlt(RIDGE_M, units)} around the site`, style: 'switch', value: setup.terrain,
    title: 'Terrain mask: below the ridge top the site cannot see you (simplified terrain)',
    onChange: v => { setup = { ...setup, terrain: v }; closeResult(); build(); },
  });
  const facts = h('dl', { class: 'dfn-stats sam-facts' },
    fact('Threat ring', brief.ring), fact('Altitude band', brief.band), fact('Minimum range', brief.minRange));
  const briefEl = h('div', { class: 'sam-brief' },
    h('p', { class: 'dfn-goal' }, brief.title),
    facts,
    h('p', { class: 'dfn-note' }, brief.rwr),
    h('p', { class: 'dfn-note' }, h('strong', null, 'Guidance. '), brief.rule),
    placard('What defeats it in the game'),
    h('ul', { class: 'sam-defeat' }, brief.defeat.map(d => h('li', null, d))),
    h('p', { class: 'dfn-note sam-nv' }, h('span', { class: 'ui-tag sam-tag' }, 'not verified'), ' ', brief.notVerified.join(' ')));
  const startBtn = button({ id: 'dfn-start', label: 'Start', variant: 'primary', keys: 'Space', block: true, onClick: () => start() });
  const briefPanel = consolePanel({
    id: 'dfn-drill-panel', title: 'SAM drill',
    children: [h('div', { class: 'dfn-drills sam-sites', role: 'group', 'aria-label': 'SAM site' }, siteButtons, missileBtn.el),
      briefEl, altSeg.el, ridgeSw.el, startBtn.el],
  });

  // ------------------------------------------------------------------ defend panel
  const coach = coachBox({ id: 'dfn-coach' });
  const lampSearch = lamp({ label: 'SEARCH', tone: 'ok', title: 'The site\'s search radar paints you' });
  const lampLock = lamp({ label: 'LOCK', tone: 'caution', title: 'The site\'s track radar holds you' });
  const lampLaunch = lamp({ label: 'LAUNCH', tone: 'warning', title: 'A SAM is guided on you' });
  const lampNotch = lamp({ label: 'IN NOTCH', tone: 'ok', title: 'Your speed toward the site is inside its gate' });
  const manBtn = (man: Maneuver, sub: string, keys: string) => button({
    label: h('span', { class: 'dfn-man' }, h('span', null, MANEUVER_LABEL[man]), h('small', null, sub)),
    keys, lamp: true, block: true, class: 'dfn-man-btn', onClick: () => doManeuver(man),
  });
  const manButtons: [Maneuver, ReturnType<typeof button>][] = [
    ['notch-l', manBtn('notch-l', 'site at 3, low', '1')],
    ['notch-r', manBtn('notch-r', 'site at 9, low', '2')],
    ['drag', manBtn('drag', 'site at 6, AB', '3')],
    ['hot', manBtn('hot', 'nose on the site', '5')],
  ];
  const firstKey = (b: string) => b.split(' / ')[0];
  const chaffBtn = button({ id: 'dfn-chaff', label: 'Chaff', keys: firstKey(cm.chaff.bind), block: true, class: 'dfn-cm', onClick: () => dropChaff() });
  const thrSeg = segmented<Throttle>({
    id: 'dfn-thr', label: 'Throttle', value: 'cruise', fill: true, size: 's',
    options: THROTTLES.map(t => ({ value: t, label: t === 'ab' ? 'AB' : t })),
    onChange: v => { if (run.canFly()) run.setThrottle(v); else thrSeg.set(run.pilot.thr); },
  });
  const altStep = units === 'metric' ? 500 : 1000 * M_PER_FT;
  const altStepTxt = units === 'metric' ? '500 m' : '1000 ft';
  const trimBtns = [
    button({ label: 'Left 5°', size: 's', keys: 'A', onClick: () => run.nudgeHeading(-5) }),
    button({ label: 'Right 5°', size: 's', keys: 'D', onClick: () => run.nudgeHeading(5) }),
    button({ label: `Up ${altStepTxt}`, size: 's', keys: 'W', onClick: () => run.nudgeAlt(altStep) }),
    button({ label: `Down ${altStepTxt}`, size: 's', keys: 'S', onClick: () => run.nudgeAlt(-altStep) }),
  ];
  const flyPanel = consolePanel({
    id: 'dfn-fly-panel', title: 'Defend',
    children: [
      coach.el, h('div', { class: 'dfn-lamps' }, lampSearch.el, lampLock.el, lampLaunch.el, lampNotch.el),
      h('div', { class: 'dfn-mans' }, manButtons.map(([, b]) => b.el)),
      h('div', { class: 'dfn-cms' }, chaffBtn.el),
      thrSeg.el,
      h('div', { class: 'dfn-trim-wrap' }, placard('Fine steering'), h('div', { class: 'dfn-trim' }, trimBtns.map(b => b.el)),
        h('div', { class: 'dfn-hints' },
          keyHint({ label: 'Hold to trim the heading', keys: 'A / D' }),
          keyHint({ label: 'Hold to climb or descend', keys: 'W / S' }))),
    ],
  });
  const log = eventLog({ id: 'dfn-log', max: 40, empty: 'Press Start. Events show here.' });
  const notes = callout({
    kind: 'simplified',
    body: h('div', null,
      h('p', null, 'One site, radars and launchers at one point. The maneuvers fly against the site, not the missile: a SAM rides the site\'s track, so the site is what you beam.'),
      h('ul', null, SAM_CAVEATS.map(c => h('li', null, c)))),
  });

  // ------------------------------------------------------------------ strip
  const viewport = h('div', { class: 'dfn-viewport' });
  const rwrCanvas = h('canvas', { class: 'dfn-canvas' });
  const rwrBezel = screenBezel({ id: 'dfn-rwr', label: RWRS[spec.rwr].name, aspect: '1', content: rwrCanvas, class: 'dfn-rwr' });
  const ro = readouts({
    id: 'dfn-sam-ro', variant: 'glass',
    rows: [
      { id: 'site', label: 'Site' }, { id: 'rng', label: 'Range to site' },
      { id: 'rad', label: 'Closure to site', title: 'Your speed toward the site. Near zero is the notch.' },
      { id: 'gate', label: 'Site gate', title: 'The site\'s notch gate in this trainer (gameplay value, not verified)' },
    ],
  });
  const own = readouts({ id: 'dfn-own', variant: 'glass', rows: [{ id: 'alt', label: 'Altitude' }, { id: 'spd', label: 'Speed' }, { id: 'tti', label: 'SAMs in flight' }] });
  const strip = h('div', { class: 'ui-strip-block dfn-readouts' }, h('div', null, placard('SAM site'), ro.el), h('div', null, placard('Own ship'), own.el));

  // ------------------------------------------------------------------ overlays
  const pill = h('div', { class: 'dfn-pill', role: 'status' });
  const camSeg = segmented<'chase' | 'tactical'>({
    id: 'dfn-cam', ariaLabel: 'Camera', value: camMode, size: 's',
    options: [{ value: 'chase', label: 'Chase', keys: 'F2' }, { value: 'tactical', label: 'Tactical', keys: 'F10' }],
    onChange: v => setCam(v),
  });
  const timeSeg = segmented<number>({
    id: 'dfn-time', ariaLabel: 'Time scale', value: 1, size: 's',
    options: [{ value: 1, label: '1×' }, { value: 2, label: '2×' }, { value: 4, label: '4×' }],
    onChange: v => { timeScale = v; },
  });
  const ffToggle = toggle({ id: 'dfn-ff', label: 'Skip the wait', size: 's', value: true, title: 'Run at 4× until the site locks you', onChange: v => { fastForward = v; } });
  const startOv = button({ id: 'dfn-start-ov', label: 'Start', variant: 'primary', keys: 'Space', onClick: () => start() });
  const pauseBtn = button({ id: 'dfn-pause', label: 'Pause', size: 's', keys: 'P', onClick: () => togglePause() });
  const retryBtn = button({ id: 'dfn-retry', label: 'Retry', size: 's', keys: 'R', onClick: () => retry() });
  const debriefBtn = button({ id: 'dfn-debrief', label: 'Debrief', size: 's', onClick: () => { if (run.phase === 'end') showResult(run.metrics); } });

  const mobile = [mobileAction(startOv.el), mobileAction(pauseBtn.el), mobileAction(manButtons[0]![1].el, 'Notch left'),
    mobileAction(manButtons[1]![1].el, 'Notch right'), mobileAction(chaffBtn.el), mobileAction(retryBtn.el)];
  for (const a of mobile) bag.add(() => a.destroy());
  const lab = labLayout({
    id: 'dfn-lab', mobileTabs: true, mobileActions: mobile.map(a => a.el), class: 'dfn-lab',
    header: {
      title: 'SAM defense',
      meta: `${spec.short} · ${RWRS[spec.rwr].name} · ${spec.cms.chaff} chaff`,
      lede: 'Know the ring. Read the lock. Beam, chaff, get low.',
    },
    viewport,
    strip: [rwrBezel.el, strip],
    console: [briefPanel.el, flyPanel.el, disclosure({ title: 'Events', content: consolePanel({ id: 'dfn-log-panel', title: 'Events', children: [log.el] }).el }),
      disclosure({ title: 'Accuracy notes', content: notes })],
  });
  bag.add(() => lab.destroy());
  lab.overlay('tl', pill);
  lab.overlay('tr', camSeg.el, timeSeg.el);
  lab.overlay('bl', startOv.el, pauseBtn.el, retryBtn.el, debriefBtn.el, ffToggle.el);
  ctx.root.append(h('div', { class: 'dfn-page' }, lab.el));

  const rwrDisplay = new RwrDisplay(rwrCanvas, { rwr: spec.rwr });
  bag.add(() => rwrDisplay.dispose());

  // ------------------------------------------------------------------ 3D
  let stage: Stage | null = null;
  let view: WorldView | null = null;
  let rig: CameraRig | null = null;
  if (isWebGLAvailable()) {
    try { stage = new Stage(viewport, { autoStart: !reduced, autoPause: 'render', ariaLabel: '3D view of the SAM drill' }); }
    catch (e) { console.warn('SAM drill: 3D view unavailable', e); stage = null; }
  }
  if (!stage) viewport.append(h('p', { class: 'dfn-no3d' }, 'The 3D view needs WebGL. The drill still runs: fly it on the RWR.'));
  const st = stage;
  if (st) {
    bag.add(() => st.dispose());
    bag.on(st.canvas, 'pointerdown', () => { userCamUntil = performance.now() + 60_000; });
    bag.on(window, 'pointerup', () => { if (userCamUntil > performance.now()) userCamUntil = performance.now() + 4000; });
  }

  function build(): void {
    run = new SamRunner(ac, setup, units, 2000 + attempt * 7919, {
      log: (text, t, tone) => { if (!isDead()) log.push(text, { t, tone }); },
      finished: m => { if (!isDead()) finished(m); },
    });
    paused = false;
    camAim = null;
    thrSeg.set(run.pilot.thr);
    if (st) {
      if (!view) {
        view = new WorldView(st, run.world, { units, observer: run.me.id, layers: { rwrLines: true } });
        rig = new CameraRig(st, { source: view });
        st.onFrame(frame);
      } else view.setWorld(run.world);
      view.syncNow();
      setCam(camMode, true);
      st.requestRender();
    }
    log.clear();
    refresh();
  }

  function start(): void {
    if (run.phase !== 'setup') return;
    run.start();
    if (st && !st.running) st.resume();
    refresh();
  }
  function togglePause(): void { if (run.phase === 'run') { paused = !paused; if (st && !paused && !st.running) st.resume(); refresh(); } }
  function retry(): void { attempt++; closeResult(); build(); start(); }
  function doManeuver(m: Maneuver): void { if (run.maneuver(m)) refresh(); }
  function dropChaff(): void { if (run.chaff()) refresh(); }
  function closeResult(): void { result?.close(); result = null; }

  function finished(m: SamMetrics): void {
    const d = samDebrief(m);
    const key = `defense:${sam}:${ac}`;
    const prev = Number(ctx.app.getProgress(key) ?? 0);
    if (d.passed) ctx.app.setProgress(key, Math.max(prev, d.score, 1));
    refresh();
    showResult(m);
  }

  function showResult(m: SamMetrics): void {
    closeResult();
    const d = samDebrief(m);
    const react = m.reactT !== null && m.launchT !== null ? `${(m.reactT - m.launchT).toFixed(1)} s after the launch` : m.launchT !== null ? 'never' : '—';
    const stats: [string, string][] = [
      ['Site', `${SAMS[sam].nato} · ring ${brief.ring}`],
      ['First lock', m.trackT !== null ? `${m.trackT.toFixed(0)} s into the run` : 'never'],
      ['Launches', String(m.launches)],
      ['You defended', react],
      ['In its notch', `${m.notchS.toFixed(1)} s`],
      ['Chaff', m.chaffUsed ? `${m.chaffUsed} used, ${m.chaffInNotch} while beaming` : 'none'],
      ['Lowest', fmtAlt(m.minAltM, units)],
      ['Score', `${d.score} / 100`],
    ];
    result = modal({
      id: 'dfn-result', title: d.headline, tone: d.survived ? 'ok' : 'warning', within: viewport,
      body: h('div', { class: 'dfn-result' },
        h('p', { class: 'ui-placard dfn-result__drill' }, `SAM drill · ${samShort(sam)}`),
        h('p', { class: 'dfn-result__why' }, d.why),
        h('dl', { class: 'dfn-stats' }, stats.map(([k, v]) => fact(k, v))),
        h('div', { class: 'dfn-result__coach' }, h('span', { class: 'ui-placard' }, 'Debrief'), ...d.coaching.map(c => h('p', null, c)))),
      actions: [
        { label: 'Review', id: 'dfn-res-close' },
        { label: 'Retry', id: 'dfn-res-retry', keys: 'R', primary: !d.passed, onClick: () => retry() },
        { label: 'Next site', id: 'dfn-res-next', primary: d.passed, onClick: () => ctx.navigate(`defense?drill=${SAM_DRILLS[(SAM_DRILLS.indexOf(sam) + 1) % SAM_DRILLS.length]}`) },
      ],
      open: true,
    });
    bag.add(() => result?.close());
  }

  function bestText(id: SamId): string {
    const v = Number(ctx.app.getProgress(`defense:${id}:${ac}`) ?? 0);
    return v > 0 ? `best ${v}` : '';
  }

  // ------------------------------------------------------------------ camera
  function setCam(mode: 'chase' | 'tactical', instant = false): void {
    camMode = mode; camSeg.set(mode); userCamUntil = 0;
    if (!rig) return;
    if (mode === 'chase') { rig.setMode('orbit', { focus: run.me.id, distance: CHASE_M, instant }); camAim = null; }
    else rig.frame([run.me.id, ...run.inFlight().map(m => m.id)], { follow: true, padding: 1.6, elevationDeg: 38, instant });
  }
  function padlock(dt: number): void {
    if (!rig || !view || camMode !== 'chase' || performance.now() < userCamUntil) return;
    const m = run.inFlight()[0];
    if (!view.positionOf(run.me.id, camJet)) return;
    if (m) { if (!view.positionOf(m.id, camSite)) return; } else camSite.copy(run.site.pos);
    const want = { h: bearingTo(camJet, camSite) * R2D, e: Math.max(-35, Math.min(60, 14 - elevationTo(camJet, camSite) * R2D)) };
    let dist = CHASE_M;
    if (!camAim) camAim = { ...want };
    else {
      const k = dt > 0 ? 1 - Math.exp(-dt * 2.5) : 1;
      camAim.h += (((want.h - camAim.h + 540) % 360) - 180) * k;
      camAim.e += (want.e - camAim.e) * k;
      dist = Math.max(40, Math.min(20_000, rig.distanceTo(camJet)));
    }
    rig.setView({ headingDeg: camAim.h, elevationDeg: camAim.e, distance: dist }, true);
  }

  // ------------------------------------------------------------------ loop and UI
  function frame(dt: number): void {
    if (isDead()) return;
    if (run.phase === 'run' && !paused && dt > 0) {
      const skip = fastForward && run.metrics.trackT === null;
      run.tick(dt, dt * (skip ? Math.max(4, timeScale) : timeScale));
    }
    padlock(dt);
    rwrDisplay.draw(run.me.alive ? run.me.rwr : [], run.world.t);
    uiClock += dt;
    if (uiClock >= 0.1 || dt === 0) { uiClock = 0; refresh(); }
  }

  function rwrState(): 'none' | 'search' | 'lock' | 'launch' {
    const c = run.me.rwr.find(x => x.emitterId === run.site.id);
    return !c || !run.me.alive ? 'none' : c.state === 'launch' || c.state === 'missile' ? 'launch' : c.state;
  }

  function refresh(): void {
    const s = rwrState(), n = run.notch(), rng = run.range(), me = run.me;
    const ring = run.drill.ringM;
    lampSearch.set(s !== 'none');
    lampLock.set(s === 'lock' || s === 'launch');
    lampLaunch.set(s === 'launch' ? 'flash' : false);
    lampNotch.set(run.site.targetId === me.id && n.inNotch);
    const state = !run.site.active ? 'SILENT' : run.site.state === 'engage' ? 'LAUNCH' : run.site.state === 'track' ? 'TRACK' : 'SEARCH';
    ro.set('site', `${samShort(sam)} ${state}`);
    ro.setTone('site', run.site.state === 'engage' ? 'warning' : run.site.state === 'track' ? 'caution' : null);
    ro.set('rng', fmtRange(rng, units, 1), rng < ring ? 'in ring' : 'outside');
    ro.setTone('rng', rng < ring ? 'caution' : null);
    const kt = (v: number) => units === 'metric' ? `${Math.round(v * 3.6)} km/h` : `${Math.round(v / (M_PER_NM / 3600))} kt`;
    ro.set('rad', kt(Math.abs(n.radialMps)));
    ro.setTone('rad', n.inNotch ? 'ok' : null);
    ro.set('gate', kt(n.gateMps), 'simplified');
    own.set('alt', fmtAlt(me.pos.y, units));
    own.set('spd', fmtSpeed(me.vel.length(), units));
    own.set('tti', String(run.inFlight().length));
    own.setTone('tti', run.inFlight().length ? 'warning' : null);
    const [t, why, tone] = samCoach({
      sam, phase: run.phase, rwr: s, inNotch: n.inNotch, man: run.pilot.man, inRing: rng < ring,
      masked: setup.terrain && me.pos.y - run.site.pos.y < RIDGE_M,
      terrain: setup.terrain, lastLost: run.site.lastLost && run.world.t - run.site.lastLost.t < 5 ? run.site.lastLost.why : null,
    });
    coach.set(t, why, tone);
    setText(pill, run.phase === 'setup' ? 'Ready' : run.phase === 'end' ? samDebrief(run.metrics).headline : paused ? 'Paused' : s === 'none' ? 'Clear' : s.toUpperCase());
    startBtn.el.hidden = run.phase !== 'setup';
    startOv.el.hidden = run.phase !== 'setup';
    pauseBtn.el.hidden = run.phase !== 'run';
    debriefBtn.el.hidden = run.phase !== 'end';
    for (const [m, b] of manButtons) { b.setDisabled(!run.canFly()); b.setLit(run.pilot.man === m); }
    chaffBtn.setDisabled(!run.canFly());
    thrSeg.set(run.pilot.thr);
  }

  bag.add(bindKeys({
    '1': () => doManeuver('notch-l'),
    '2': () => doManeuver('notch-r'),
    '3': () => doManeuver('drag'),
    '5': () => doManeuver('hot'),
    [cm.chaff.bind]: () => dropChaff(),
    'A': hold('left', () => run.nudgeHeading(-1)),
    'D': hold('right', () => run.nudgeHeading(1)),
    'W': hold('up', () => run.nudgeAlt(100)),
    'S': hold('down', () => run.nudgeAlt(-100)),
    'Shift': () => { run.throttle(1); thrSeg.set(run.pilot.thr); },
    'Ctrl': () => { run.throttle(-1); thrSeg.set(run.pilot.thr); },
    'Space': () => { if (run.phase === 'setup') start(); else togglePause(); },
    'P': () => togglePause(),
    'R': { down: () => { if (run.phase !== 'setup') retry(); }, inModal: true },
    'F2': () => setCam('chase'),
    'F10': () => setCam('tactical'),
  }));
  bag.on(window, 'blur', () => { run.held.left = run.held.right = run.held.up = run.held.down = false; });
  function hold(k: keyof SamRunner['held'], tap: () => void) {
    return { down: () => { run.held[k] = true; tap(); }, up: () => { run.held[k] = false; } };
  }

  // ------------------------------------------------------------------ go
  build();
  const shot = ctx.params.get('shot') as Shot | null;
  if (shot && (SHOTS as readonly string[]).includes(shot)) preroll(shot);

  /** Screenshot helper: run the sim to a state with the scripted defence. */
  function preroll(s: Shot): void {
    start();
    if (s === 'live') return;
    const dt = 1 / 30, mt = run.metrics, cmState = { lastChaff: -9 };
    const done = (): boolean => {
      if (run.phase !== 'run') return true;
      const t = run.world.t;
      switch (s) {
        case 'lock': return mt.trackT !== null && t > mt.trackT + 1;
        case 'launch': return mt.launchT !== null && t > mt.launchT + 3;
        case 'notch': return mt.launchT !== null && t > mt.launchT + 9;
        default: return false;
      }
    };
    let sync = 0;
    for (let i = 0; i < 30 * 320 && !done(); i++) {
      if (s !== 'lock' && s !== 'launch') run.autoDefend(cmState);
      run.tick(dt, dt);
      sync += dt;
      if (sync >= 0.25 && view) { sync = 0; view.syncNow(); }
    }
    view?.syncNow();
    camAim = null;
    if (camMode === 'tactical') setCam('tactical', true);
    refresh();
  }
}

function fact(k: string, v: string): HTMLElement {
  return h('div', { class: 'dfn-stat' }, h('dt', null, k), h('dd', null, v));
}
