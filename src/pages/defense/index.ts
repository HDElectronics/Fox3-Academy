/**
 * [OWNER: page-defense] Missile defense drills (#/defense). You are the target: a scripted shooter fires an
 * R-27ER, AIM-7M, R-77, AIM-120C, SD-10 or AIM-54C at you and supports it the way its jet does in DCS.
 * You fly through ac.cmd with maneuver buttons (notch, drag, crank, hot), fine steering and chaff, while
 * the RWR and a Doppler gate gauge show why the notch works or not. Debrief with the sim's miss reason,
 * a score and coaching; progress saved per jet. Explainer below the lab.
 *
 * URL params: ?ac=<id> (select a jet once), ?drill=lock|pitbull|drag|late|free, ?threat=<missile>,
 * ?method=auto|tws|stt, ?shot=launch|notch|active|result|live (pre-roll to a state for screenshots), ?cam=tactical,
 * ?scroll=explainer (open at the explainer), ?only=explainer (explainer alone, for screenshots).
 * ?drill=sa10|sa11|sa15 opens the SAM drill lab instead (samLab.ts, its own params).
 */
import './style.css';
import { Vector3 } from 'three';
import { mobileAction } from '../../ui/mobileAction';
import type { Page, PageFactory, PageContext } from '../../app/page';
import type { AircraftId, MissileId } from '../../data/types';
import { AIRCRAFT } from '../../data/aircraft';
import { MISSILES, MISSILE_REF_NOTE } from '../../data/missiles';
import { RWRS } from '../../data/rwr';
import type { AiSkill, Missile } from '../../sim/types';
import { mach } from '../../sim/atmosphere';
import { D2R, R2D, M_PER_FT, M_PER_NM, bearingTo, elevationTo, relBearing } from '../../sim/math';
import { clockCode, fmtAlt, fmtAltShort, fmtRange, fmtSpeed, type Units } from '../../app/format';
import { notchState } from '../../sim/missile';
import { Stage, WorldView, CameraRig, isWebGLAvailable } from '../../render';
import {
  h, setText, setAttr, cleanup, labLayout, disclosure, consolePanel, screenBezel, segmented, slider, select, button, toggle,
  coachBox, eventLog, readouts, callout, placard, lamp, modal, bindKeys, kbd, keyHint, type Tone, type ModalHandle,
} from '../../ui';
import { RwrDisplay, RwrAudio } from '../../ui/displays';
import {
  ALTS, ASPECTS, DRILLS, DRILL_ORDER, SCORED_DRILLS, SKILLS, canTwsShot, cueText, defaultRange, defaultSetup,
  drillGoal, launchMethod, missileLabel, nextDrill, normalizeSetup, rangeBounds, setupFor, shootersFor, sttLaunchWarns, threatsFor, zoneFor,
  type AltSetup, type AspectSetup, type DrillId, type MethodSetup, type Setup,
} from './drills';
import { MANEUVER_LABEL, THROTTLES, type Maneuver, type Throttle } from './pilot';
import { aspectDeg, chaffOdds, chaffRange, radarGate, seekerGate, sttMemory, threatRef, type GateRead, type RefMode } from './gates';
import { DopplerGauge, type GaugeRow } from './gauge';
import type { Debrief } from './debrief';
import { DrillRunner } from './runner';
import { cmKeys } from './cmkeys';
import { buildExplainer } from './explainer';
import { SAM_DRILLS, isSamDrill, samShort } from './samRun';
import { mountSamLab } from './samLab';

const RWR_LABEL: Record<string, string> = {
  spo15: 'СПО-15', alr56c: 'TEWS', alr67: 'ALR-67', alr56m: 'ALR-56M', jf17rwr: 'RWR', serval: 'SERVAL',
};
const SHOT_STATES = ['launch', 'notch', 'active', 'result', 'live'] as const;
type ShotState = typeof SHOT_STATES[number];

/** Chase camera distance behind your jet (m). */
const CHASE_M = 130;

const factory: PageFactory = (): Page => {
  const bag = cleanup();
  let dead = false;

  function mount(ctx: PageContext): void {
    // ?ac=<id>: select that jet once, then drop the param so a later jet change in the top bar sticks.
    const acParam = ctx.params.get('ac') as AircraftId | null;
    if (acParam && AIRCRAFT[acParam]) {
      const rest = new URLSearchParams(ctx.params);
      rest.delete('ac');
      const qs = rest.toString();
      try { history.replaceState(history.state, '', `#/defense${qs ? '?' + qs : ''}`); } catch { /* sandboxed: fine */ }
      if (acParam !== ctx.app.aircraft) { ctx.app.setAircraft(acParam); return; }
    }

    const samParam = ctx.params.get('drill');
    if (isSamDrill(samParam)) { mountSamLab(ctx, bag, samParam, () => dead); return; }

    const ac = ctx.app.aircraft;
    const spec = ctx.app.spec;
    const units: Units = ctx.app.units;
    const rwrSpec = RWRS[spec.rwr];
    const cm = cmKeys(ac);
    const reduced = Stage.prefersReducedMotion();

    // ------------------------------------------------------------------ state
    const drillParam = ctx.params.get('drill') as DrillId | null;
    let setup: Setup = defaultSetup(drillParam && DRILLS[drillParam] ? drillParam : 'lock', ac);
    const threatParam = ctx.params.get('threat') as MissileId | null;
    if (threatParam && threatsFor(setup.drill).includes(threatParam)) setup = setupFor(setup.drill, ac, threatParam);

    const methodParam = ctx.params.get('method');
    if (methodParam === 'auto' || methodParam === 'tws' || methodParam === 'stt') setup = normalizeSetup({ ...setup, method: methodParam });

    let run!: DrillRunner;
    let paused = false;
    let timeScale = 1;
    let fastForward = true;
    let attempt = 0;
    let refMode: RefMode = 'auto';
    let camMode: 'chase' | 'tactical' = ctx.params.get('cam') === 'tactical' ? 'tactical' : 'chase';
    let camAim: { h: number; e: number } | null = null;
    let userCamUntil = 0;
    const camJet = new Vector3(), camThreat = new Vector3();
    let uiClock = 0;
    let result: ModalHandle | null = null;

    // ------------------------------------------------------------------ DOM: displays in the strip
    const viewport = h('div', { class: 'dfn-viewport' });
    const rwrCanvas = h('canvas', { class: 'dfn-canvas' });
    const gaugeCanvas = h('canvas', { class: 'dfn-canvas' });

    const audio = new RwrAudio({ rwr: spec.rwr, volume: 0.2 });
    bag.add(() => audio.dispose());
    const audioSw = toggle({
      id: 'dfn-audio', label: 'Audio', style: 'switch', value: false, title: 'RWR tones (off by default)',
      onChange: on => { if (on) void audio.start(); else audio.stop(); },
    });
    if (!RwrAudio.supported) audioSw.setDisabled(true);
    const rwrBezel = screenBezel({ id: 'dfn-rwr', label: RWR_LABEL[spec.rwr] ?? 'RWR', aspect: '1', content: rwrCanvas, status: audioSw.el, class: 'dfn-rwr' });
    const gaugeBezel = screenBezel({ id: 'dfn-gauge', label: 'Doppler gate', content: gaugeCanvas, status: 'keep the needle in the gate', class: 'dfn-gauge' });

    const threatRO = readouts({
      id: 'dfn-threat', variant: 'glass',
      rows: [
        { id: 'mrng', label: 'Missile range' }, { id: 'tti', label: 'Time to impact' },
        { id: 'asp', label: 'Aspect', title: 'Your aspect as the threat sees you (0° hot, 90° beam, 180° cold) and where it sits on your clock' },
      ],
    });
    const ownRO = readouts({
      id: 'dfn-own', variant: 'glass',
      rows: [{ id: 'alt', label: 'Altitude' }, { id: 'spd', label: 'Speed' }, { id: 'gate', label: 'In the notch', title: 'Total time with your radial speed inside the gate' }],
    });
    const stripBlock = h('div', { class: 'ui-strip-block dfn-readouts' },
      h('div', null, placard('Threat'), threatRO.el), h('div', null, placard('Own ship'), ownRO.el));

    // ------------------------------------------------------------------ DOM: drill panel
    const drillButtons = new Map<DrillId, { el: HTMLButtonElement; best: HTMLElement }>();
    const drillList = h('div', { class: 'dfn-drills', role: 'group', 'aria-label': 'Drill' },
      DRILL_ORDER.map(id => {
        const d = DRILLS[id];
        const best = h('span', { class: 'dfn-drill__best' });
        const el = h('button', {
          type: 'button', class: 'dfn-drill', 'aria-pressed': 'false', id: `dfn-drill-${id}`,
          onclick: () => chooseDrill(id),
        },
        h('span', { class: 'dfn-drill__n' }, d.n === null ? '·' : String(d.n)),
        h('span', { class: 'dfn-drill__title' }, d.title),
        best);
        drillButtons.set(id, { el, best });
        return el;
      }),
      // SAM sites open their own lab (samLab.ts).
      SAM_DRILLS.map(id => h('button', {
        type: 'button', class: 'dfn-drill dfn-drill--sam', 'aria-pressed': 'false', id: `dfn-drill-${id}`,
        onclick: () => ctx.navigate(`defense?drill=${id}`),
      }, h('span', { class: 'dfn-drill__n' }, '▲'), h('span', { class: 'dfn-drill__title' }, `${samShort(id)} site`))));
    const goalEl = h('p', { class: 'dfn-goal' });
    const cueEl = h('p', { class: 'dfn-cue' });
    const threatSel = select<MissileId>({
      id: 'dfn-threat-sel', label: 'Threat', value: setup.threat, options: [],
      onChange: v => applySetup(setupFor(setup.drill, ac, v, { aspect: setup.aspect, skill: setup.skill, method: setup.method, alt: setup.alt })),
    });
    const shooterSel = select<AircraftId>({
      id: 'dfn-shooter-sel', label: 'Shooter', value: setup.shooter, options: [],
      onChange: v => applySetup(setupFor(setup.drill, ac, setup.threat, { ...setup, shooter: v, range: undefined })),
    });
    const rangeUnit = units === 'metric' ? 'km' : 'nm';
    const toUnit = (m: number) => (units === 'metric' ? m / 1000 : m / M_PER_NM);
    const fromUnit = (v: number) => (units === 'metric' ? v * 1000 : v * M_PER_NM);
    const rangeSl = slider({
      id: 'dfn-range', label: 'Launch range', min: 5, max: 100, step: 1, value: 20, unit: rangeUnit, readoutCh: 5,
      onChange: v => applySetup({ ...setup, range: fromUnit(v) }),
    });
    const zoneEl = h('p', { class: 'dfn-zone', title: MISSILE_REF_NOTE });
    const aspectSel = select<AspectSetup>({
      id: 'dfn-aspect', label: 'He starts', value: setup.aspect, options: ASPECTS.map(a => ({ value: a.value, label: a.label })),
      onChange: v => applySetup({ ...setup, aspect: v }),
    });
    const altSel = select<AltSetup>({
      id: 'dfn-alt', label: 'Altitudes', value: setup.alt, options: ALTS.map(a => ({ value: a.value, label: a.label })),
      onChange: v => applySetup(setupFor(setup.drill, ac, setup.threat, { ...setup, alt: v, range: undefined })),
    });
    const altNote = h('p', { class: 'dfn-note' });
    const skillSeg = segmented<AiSkill>({
      id: 'dfn-skill', label: 'Shooter skill', value: setup.skill, fill: true, size: 's',
      options: SKILLS.map(s => ({ value: s, label: s })),
      onChange: v => applySetup({ ...setup, skill: v }),
    });
    const methodSeg = segmented<MethodSetup>({
      id: 'dfn-method', label: 'How he shoots', value: setup.method, fill: true, size: 's',
      options: [{ value: 'auto', label: 'His way' }, { value: 'stt', label: 'STT' }, { value: 'tws', label: 'TWS' }],
      onChange: v => applySetup({ ...setup, method: v }),
    });
    const methodNote = h('p', { class: 'dfn-note' });
    const setupForm = h('div', { class: 'dfn-setup' },
      h('div', { class: 'dfn-row2' }, threatSel.el, shooterSel.el),
      rangeSl.el, zoneEl,
      h('div', { class: 'dfn-row2' }, aspectSel.el, altSel.el), altNote,
      skillSeg.el, h('div', { class: 'dfn-method' }, methodSeg.el, methodNote));
    const summaryText = h('span', { class: 'dfn-summary__text' });
    const summary = h('div', { class: 'dfn-summary', hidden: true },
      summaryText,
      button({ label: 'Change setup', variant: 'ghost', size: 's', onClick: () => resetToSetup() }).el);
    const startBtn = button({ id: 'dfn-start', label: 'Start', variant: 'primary', keys: 'Space', block: true, onClick: () => start() });
    const drillPanel = consolePanel({
      id: 'dfn-drill-panel', title: 'Drill',
      children: [drillList, goalEl, cueEl, setupForm, summary, startBtn.el],
    });

    // ------------------------------------------------------------------ DOM: defend panel
    const coach = coachBox({ id: 'dfn-coach' });
    const lampLock = lamp({ label: 'LOCK', tone: 'caution', title: 'Your RWR shows his lock' });
    const lampLaunch = lamp({ label: 'LAUNCH', tone: 'warning', title: 'Your RWR shows a launch (SARH, or an STT Fox 3 on jets that warn)' });
    const lampMsl = lamp({ label: 'MISSILE', tone: 'warning', title: 'An active seeker is on you' });
    const lampNotch = lamp({ label: 'IN GATE', tone: 'ok', title: 'Your radial speed is inside the gate that matters now' });
    const lamps = h('div', { class: 'dfn-lamps' }, lampLock.el, lampLaunch.el, lampMsl.el, lampNotch.el);

    const manBtn = (man: Maneuver, sub: string, keys: string) => button({
      label: h('span', { class: 'dfn-man' }, h('span', null, MANEUVER_LABEL[man]), h('small', null, sub)),
      keys, lamp: true, block: true, class: 'dfn-man-btn', onClick: () => doManeuver(man),
    });
    const manButtons: [Maneuver, ReturnType<typeof button>][] = [
      ['notch-l', manBtn('notch-l', 'threat at 3, low', '1')],
      ['notch-r', manBtn('notch-r', 'threat at 9, low', '2')],
      ['drag', manBtn('drag', 'threat at 6, AB', '3')],
      ['crank', manBtn('crank', 'threat 50° off', '4')],
      ['hot', manBtn('hot', 'nose on him', '5')],
    ];
    // The cap shows the main key only (the count must stay readable); the letter backup is in the note below.
    const firstKey = (bind: string) => bind.split(' / ')[0];
    const chaffBtn = button({ id: 'dfn-chaff', label: 'Chaff', keys: firstKey(cm.chaff.bind), block: true, class: 'dfn-cm', onClick: () => dropChaff() });
    const flareBtn = button({ id: 'dfn-flare', label: 'Flare', keys: firstKey(cm.flare.bind), block: true, class: 'dfn-cm', onClick: () => dropFlare() });
    const cmPart = (what: string, k: typeof cm.chaff) => [
      `${what} `, k.dcsName ? `${k.dcsName}${k.dcsKey ? ' ' : ''}` : '', k.dcsKey ? kbd(k.dcsKey) : k.dcsName ? '' : 'has no default key',
    ];
    const cmNotes = [cm.chaff.note, cm.flare.note].filter((n, i, a) => n && a.indexOf(n) === i);
    const sharedCm = cm.chaff.dcsName === cm.flare.dcsName && cm.chaff.dcsKey === cm.flare.dcsKey && !cm.chaff.exact;
    const backups = [cm.chaff.bind, cm.flare.bind].map(b => b.split(' / ').slice(1).join(' / ')).filter(Boolean);
    const cmNote = h('p', { class: 'dfn-note dfn-cmnote' },
      sharedCm
        ? [`In the ${spec.short}: `, cm.chaff.dcsName || 'no default key', cm.chaff.dcsKey ? [' ', kbd(cm.chaff.dcsKey)] : null, `. ${cmNotes.join(' ')}`]
        : [`In the ${spec.short}: `, cmPart('chaff', cm.chaff), ', ', cmPart('flares', cm.flare), '.', cmNotes.length ? ` ${cmNotes.join(' ')}` : ''],
      backups.length === 2 ? [' Here ', kbd(backups[0]), ' and ', kbd(backups[1]), ' also work.'] : null);
    const thrSeg = segmented<Throttle>({
      id: 'dfn-thr', label: 'Throttle', value: 'cruise', fill: true, size: 's',
      options: THROTTLES.map(t => ({ value: t, label: t === 'ab' ? 'AB' : t })),
      onChange: v => { if (flying()) run.setThrottle(v); else thrSeg.set(run.pilot.thr); },
    });
    const altStep = units === 'metric' ? 500 : 1000 * M_PER_FT;
    const altStepTxt = units === 'metric' ? '500 m' : '1000 ft';
    const trimBtns = [
      button({ label: 'Left 5°', size: 's', keys: 'A', onClick: () => { if (flying()) run.nudgeHeading(-5); } }),
      button({ label: 'Right 5°', size: 's', keys: 'D', onClick: () => { if (flying()) run.nudgeHeading(5); } }),
      button({ label: `Up ${altStepTxt}`, size: 's', keys: 'W', onClick: () => { if (flying()) run.nudgeAlt(altStep); } }),
      button({ label: `Down ${altStepTxt}`, size: 's', keys: 'S', onClick: () => { if (flying()) run.nudgeAlt(-altStep); } }),
    ];
    const refSeg = segmented<RefMode>({
      id: 'dfn-ref', label: 'Maneuver against', value: 'auto', fill: true, size: 's',
      options: [
        { value: 'auto', label: 'Auto', title: 'The shooter until the seeker goes active, then the missile' },
        { value: 'shooter', label: 'Shooter' }, { value: 'missile', label: 'Missile' },
      ],
      onChange: v => { refMode = v; run.refMode = v; },
    });
    const lockedNote = h('p', { class: 'dfn-locked', hidden: true });
    const flyPanel = consolePanel({
      id: 'dfn-fly-panel', title: 'Defend',
      children: [
        coach.el, lamps, lockedNote,
        h('div', { class: 'dfn-mans' }, manButtons.map(([, b]) => b.el)),
        h('div', { class: 'dfn-cms' }, chaffBtn.el, flareBtn.el), cmNote,
        thrSeg.el,
        h('div', { class: 'dfn-trim-wrap' }, placard('Fine steering'), h('div', { class: 'dfn-trim' }, trimBtns.map(b => b.el)),
          h('div', { class: 'dfn-hints' },
            keyHint({ label: 'Hold to trim the heading', keys: 'A / D' }),
            keyHint({ label: 'Hold to climb or descend', keys: 'W / S' }),
            keyHint({ label: 'Throttle up or down a detent', keys: 'Shift / Ctrl' }))),
        refSeg.el,
      ],
    });

    const log = eventLog({ id: 'dfn-log', max: 40, empty: 'Press Start. Events show here.' });
    const logPanel = consolePanel({ id: 'dfn-log-panel', title: 'Events', children: [log.el] });
    const simplified = callout({
      kind: 'simplified',
      body: 'The shooter is scripted: it fires one missile at your chosen range and supports it the way its jet does in DCS. You fly an autopilot that holds each maneuver against the threat, not a stick. Gates and chaff odds are gameplay values; see the notes under the lab.',
    });

    // ------------------------------------------------------------------ DOM: viewport overlays
    const phasePill = h('div', { class: 'dfn-pill', role: 'status' });
    const camSeg = segmented<'chase' | 'tactical'>({
      id: 'dfn-cam', ariaLabel: 'Camera', value: camMode, size: 's',
      options: [{ value: 'chase', label: 'Chase', keys: 'F2' }, { value: 'tactical', label: 'Tactical', keys: 'F10' }],
      onChange: v => setCam(v),
    });
    const timeSeg = segmented<number>({
      id: 'dfn-time', ariaLabel: 'Time scale', value: 1, size: 's',
      options: [{ value: 0.5, label: '½×' }, { value: 1, label: '1×' }, { value: 2, label: '2×' }, { value: 4, label: '4×' }],
      onChange: v => { timeScale = v; },
    });
    const ffToggle = toggle({ id: 'dfn-ff', label: 'Skip the wait', size: 's', value: true, title: 'Run at 3× until your controls unlock', onChange: v => { fastForward = v; } });
    const pauseBtn = button({ id: 'dfn-pause', label: 'Pause', size: 's', keys: 'P', onClick: () => togglePause() });
    const retryBtn = button({ id: 'dfn-retry', label: 'Retry', size: 's', keys: 'R', onClick: () => retry() });
    const debriefBtn = button({ id: 'dfn-debrief', label: 'Debrief', size: 's', onClick: () => { if (run.result) showResult(run.result); } });
    const startOverlay = button({ id: 'dfn-start-ov', label: 'Start', variant: 'primary', keys: 'Space', onClick: () => start() });

    const mobileButtons = [
      mobileAction(startOverlay.el), mobileAction(pauseBtn.el),
      mobileAction(manButtons[0]![1].el, 'Notch left'), mobileAction(manButtons[1]![1].el, 'Notch right'),
      mobileAction(chaffBtn.el), mobileAction(retryBtn.el),
    ];
    for (const action of mobileButtons) bag.add(() => action.destroy());
    const lab = labLayout({
      id: 'dfn-lab', mobileTabs: true,
      mobileActions: mobileButtons.map(action => action.el),
      class: 'dfn-lab',
      header: {
        title: ctx.params.get('lab') === 'free' ? 'Defense practice' : 'Missile defense',
        meta: `${spec.short} · ${rwrSpec.name} · ${spec.cms.chaff} chaff`,
        lede: 'Read the warning. Defend. Review what worked.',
      },
      viewport,
      strip: [rwrBezel.el, gaugeBezel.el, stripBlock],
      console: [drillPanel.el, flyPanel.el, disclosure({ title: 'Events', content: logPanel.el }), disclosure({ title: 'Accuracy notes', content: simplified })],
    });
    bag.add(() => lab.destroy());
    lab.overlay('tl', phasePill);
    lab.overlay('tr', camSeg.el, timeSeg.el);
    lab.overlay('bl', startOverlay.el, pauseBtn.el, retryBtn.el, debriefBtn.el, ffToggle.el);

    const explainer = buildExplainer({ ac, units });
    const page = h('div', { class: 'dfn-page' }, lab.el, explainer);
    ctx.root.append(page);

    const rwrDisplay = new RwrDisplay(rwrCanvas, { rwr: spec.rwr });
    bag.add(() => rwrDisplay.dispose());
    const gauge = new DopplerGauge(gaugeCanvas, units);
    bag.add(() => gauge.dispose());

    // ------------------------------------------------------------------ 3D
    let stage: Stage | null = null;
    let view: WorldView | null = null;
    let rig: CameraRig | null = null;
    if (isWebGLAvailable()) {
      try {
        // 'render': when the view scrolls away (phones: reaching for the buttons), skip drawing only; the
        // missile keeps flying and the RWR and gauge keep updating.
        stage = new Stage(viewport, { autoStart: !reduced, autoPause: 'render', ariaLabel: '3D view of the engagement' });
      } catch (e) {
        console.warn('Defense: 3D view unavailable', e);
        stage = null;
      }
    }
    if (!stage) viewport.append(h('p', { class: 'dfn-no3d' }, 'The 3D view needs WebGL. The drill still runs: fly it on the RWR and the gauge.'));
    const st = stage;
    if (st) {
      bag.add(() => st.dispose());
      // Dragging the chase view hands it to you until a few seconds after you let go.
      bag.on(st.canvas, 'pointerdown', () => { userCamUntil = performance.now() + 60_000; });
      bag.on(window, 'pointerup', () => { if (userCamUntil > performance.now()) userCamUntil = performance.now() + 4000; });
    }

    // ------------------------------------------------------------------ build a run
    function build(): void {
      run = new DrillRunner(ac, setup, units, 1000 + attempt * 7919, {
        log: (text, t, tone) => { if (!dead) log.push(text, { t, tone }); },
        finished: d => { if (!dead) finished(d); },
      });
      run.refMode = refMode;
      paused = false;
      camAim = null;
      thrSeg.set(run.pilot.thr);
      if (st) {
        if (!view) {
          view = new WorldView(st, run.world, {
            units, observer: run.me.id, layers: { rwrLines: true },
            label: (x, u) => ({
              title: x.callsign, type: AIRCRAFT[x.type].short,
              sub: fmtAltShort(x.pos.y, u) + ' · ' + fmtSpeed(Math.hypot(x.vel.x, x.vel.y, x.vel.z), u),
              flag: x.id === run.me.id && run.notchFlag ? 'NOTCH' : undefined,
            }),
          });
          rig = new CameraRig(st, { source: view });
          st.onFrame(frame);
        } else {
          view.setWorld(run.world);
        }
        view.syncNow();
        setCam(camMode, true);
        st.requestRender();
      }
      log.clear();
      refreshStatic();
      refreshLive();
    }

    // ------------------------------------------------------------------ setup changes
    function applySetup(nextIn: Setup): void {
      const next = normalizeSetup(nextIn);
      const b = rangeBounds(next, ac);
      next.range = Math.min(b.max, Math.max(b.min, next.range));
      setup = next;
      closeResult();
      build();
    }

    function chooseDrill(id: DrillId): void {
      const keep = id !== setup.drill && threatsFor(id).includes(setup.threat) ? setup.threat : null;
      applySetup(keep ? setupFor(id, ac, keep, { skill: setup.skill }) : defaultSetup(id, ac));
    }

    function resetToSetup(): void {
      closeResult();
      build();
    }

    // ------------------------------------------------------------------ run control
    function start(): void {
      if (run.phase !== 'setup') return;
      run.start();
      paused = false;
      if (st && !st.running) st.resume();
      refreshStatic();
      refreshLive();
    }

    function togglePause(): void {
      if (run.phase !== 'run') return;
      paused = !paused;
      if (st && !paused && !st.running) st.resume();
      refreshLive();
    }

    function retry(): void {
      attempt++;
      closeResult();
      build();
      start();
    }

    function nextDrillGo(): void {
      closeResult();
      chooseDrill(nextDrill(setup.drill));
    }

    function closeResult(): void {
      if (result) { result.destroy(); result = null; }
    }
    bag.add(() => closeResult());

    function flying(): boolean { return run.canFly() && !paused; }

    function doManeuver(man: Maneuver): void {
      if (!flying()) return;
      run.maneuver(man);
      thrSeg.set(run.pilot.thr);
      refreshLive();
    }

    function dropChaff(): void {
      if (!flying()) return;
      run.chaff();
      refreshLive();
    }

    function dropFlare(): void {
      if (!flying()) return;
      run.flare();
      refreshLive();
    }

    // ------------------------------------------------------------------ camera
    function setCam(mode: 'chase' | 'tactical', instant = false): void {
      camMode = mode;
      camSeg.set(mode);
      userCamUntil = 0;
      if (!rig) return;
      if (mode === 'chase') {
        rig.setMode('orbit', { focus: run.me.id, distance: CHASE_M, instant });
        camAim = null;
      } else {
        const m = run.missile();
        const ids = [run.me.id, run.shooter.id];
        if (m) ids.push(m.id);
        rig.frame(ids, { follow: true, padding: 1.35, elevationDeg: 32, instant });
      }
    }

    /**
     * Padlock chase: the camera sits behind you on the threat's line of sight, raised or lowered with the
     * threat's elevation, looking at your jet, so your jet and the missile (or the shooter) stay on screen.
     * (The render kit's chase mode aims past the jet, which drops it out of frame when the threat is high.)
     */
    function padlock(dt: number): void {
      if (!rig || !view || camMode !== 'chase' || performance.now() < userCamUntil) return;
      const m = run.missile();
      const id = m && m.alive ? m.id : run.shooter.alive ? run.shooter.id : null;
      if (!id || !view.positionOf(run.me.id, camJet) || !view.positionOf(id, camThreat)) return;
      const want = { h: bearingTo(camJet, camThreat) * R2D, e: Math.max(-35, Math.min(60, 17 - elevationTo(camJet, camThreat) * R2D)) };
      let dist = CHASE_M;
      if (!camAim) camAim = { ...want };
      else {
        const k = dt > 0 ? 1 - Math.exp(-dt * 2.5) : 1;
        camAim.h += (((want.h - camAim.h + 540) % 360) - 180) * k;
        camAim.e += (want.e - camAim.e) * k;
        dist = Math.max(40, Math.min(20_000, rig.distanceTo(camJet)));   // keep the pilot's wheel zoom
      }
      rig.setView({ headingDeg: camAim.h, elevationDeg: camAim.e, distance: dist }, true);
    }

    // ------------------------------------------------------------------ end of a run
    function finished(d: Debrief): void {
      if (d.passed && setup.drill !== 'free') {
        const key = `defense:${ac}:${setup.drill}`;
        const prev = Number(ctx.app.getProgress(key) ?? 0) || 0;
        ctx.app.setProgress(key, Math.max(prev, d.score, 1));
        if (SCORED_DRILLS.every(id => !!ctx.app.getProgress(`defense:${ac}:${id}`)) && !ctx.app.getProgress(`defense:${ac}:done`)) {
          ctx.app.setProgress(`defense:${ac}:done`, true);
        }
      }
      refreshStatic();
      refreshLive();
      showResult(d);
    }

    function showResult(d: Debrief): void {
      closeResult();
      const mm = run.metrics;
      const react = mm.reactT === null ? 'never'
        : mm.launchT !== null
          ? `${(mm.reactT - mm.launchT).toFixed(1)} s after launch${mm.pitbullT !== null ? `, ${Math.abs(mm.reactT - mm.pitbullT).toFixed(1)} s ${mm.reactT >= mm.pitbullT ? 'after' : 'before'} pitbull` : ''}`
          : 'before the launch';
      const closest = mm.closest === null ? '—'
        : mm.closest < 1000 ? `${Math.round(units === 'metric' ? mm.closest : mm.closest / M_PER_FT)} ${units === 'metric' ? 'm' : 'ft'}`
          : fmtRange(mm.closest, units, 1);
      const fired = mm.launchT !== null;
      const stats: [string, string][] = !fired ? [
        ['Missile', `${MISSILES[mm.missile].name} · never fired`],
        ['Shooter', `${AIRCRAFT[setup.shooter].short} · ${AIRCRAFT[setup.shooter].radar.name}`],
        ['You notched', mm.notchT !== null ? `${mm.notchT.toFixed(1)} s into the run` : 'no'],
      ] : [
        ['Missile', `${MISSILES[mm.missile].name} · ${mm.method.toUpperCase()} shot`],
        ['Launched at', mm.launchRange !== null ? fmtRange(mm.launchRange, units, 1) : '—'],
        ['Time of flight', mm.launchT !== null && mm.endT !== null ? `${(mm.endT - mm.launchT).toFixed(1)} s` : '—'],
        ['You reacted', react],
        ['In his radar gate', `${mm.radarGateS.toFixed(1)} s`],
        ['In the seeker gate', `${mm.seekerGateS.toFixed(1)} s`],
        ['Chaff', mm.chaffUsed ? `${mm.chaffUsed} used, ${mm.chaffGood} in the notch` : 'none'],
        ['Closest pass', closest],
        ['Score', `${d.score} / 100`],
      ];
      const body = h('div', { class: 'dfn-result' },
        setup.drill !== 'free' ? h('p', { class: 'ui-placard dfn-result__drill' }, `Drill ${DRILLS[setup.drill].n} · ${DRILLS[setup.drill].title}`) : null,
        h('p', { class: 'dfn-result__why' }, d.why),
        h('dl', { class: 'dfn-stats' }, stats.map(([k, v]) => h('div', { class: 'dfn-stat' }, h('dt', null, k), h('dd', null, v)))),
        !fired ? null : h('ul', { class: 'dfn-parts' }, d.parts.map(p => h('li', null,
          h('span', { class: 'dfn-parts__label' }, p.label), h('span', { class: 'dfn-parts__pts' }, `${p.pts}/${p.max}`), h('span', { class: 'dfn-parts__note' }, p.note)))),
        h('div', { class: 'dfn-result__coach' }, h('span', { class: 'ui-placard' }, 'Debrief'), ...d.coaching.map(c => h('p', null, c))),
        DRILLS[setup.drill].pass === 'fly' && mm.result !== null ? h('p', { class: 'dfn-note' }, 'Drill 4 counts as done once flown: its point is to feel how little time is left.') : null);
      const nextId = nextDrill(setup.drill);
      result = modal({
        id: 'dfn-result', title: d.headline, body,
        tone: d.survived ? 'ok' : mm.result === 'hit' ? 'warning' : 'caution',
        actions: [
          { label: 'Review', id: 'dfn-res-close' },
          { label: 'Retry', id: 'dfn-res-retry', keys: 'R', primary: !d.passed, onClick: () => retry() },
          { label: `Next: ${DRILLS[nextId].cap}`, id: 'dfn-res-next', keys: 'N', primary: d.passed, onClick: () => nextDrillGo() },
        ],
        open: true,
      });
    }

    // ------------------------------------------------------------------ UI refresh
    /** Things that change with the setup or phase (not per frame). */
    function refreshStatic(): void {
      for (const [id, b] of drillButtons) {
        setAttr(b.el, 'aria-pressed', String(id === setup.drill));
        const best = ctx.app.getProgress(`defense:${ac}:${id}`);
        setText(b.best, id === 'free' || !best ? '' : typeof best === 'number' ? `best ${best}` : 'done');
        b.el.classList.toggle('is-done', !!best && id !== 'free');
      }
      setText(goalEl, drillGoal(setup));
      setText(cueEl, cueText(setup.drill));
      threatSel.setOptions(threatsFor(setup.drill).map(m => ({ value: m, label: missileLabel(m), group: MISSILES[m].seeker === 'sarh' ? 'Semi-active (SARH)' : 'Active (ARH)' })), setup.threat);
      shooterSel.setOptions(shootersFor(setup.threat, ac).map(s => ({ value: s, label: AIRCRAFT[s].short })), setup.shooter);
      const b = rangeBounds(setup, ac);
      rangeSl.setRange(Math.ceil(toUnit(b.min)), Math.floor(toUnit(b.max)), 1);
      rangeSl.set(Math.round(toUnit(setup.range)));
      const z = zoneFor(setup, ac);
      setText(zoneEl, `His launch zone against you hot: Rmax ${fmtRange(z.rmax, units)}, Rne ${fmtRange(z.rne, units)} (the game's launch table, simplified). Drill default ${fmtRange(defaultRange(setup.drill, setup, ac), units)}.`);
      aspectSel.set(setup.aspect);
      altSel.set(setup.alt);
      setText(altNote, ALTS.find(a => a.value === setup.alt)?.title ?? '');
      skillSeg.set(setup.skill);
      methodSeg.set(setup.method);
      const arh = MISSILES[setup.threat].seeker === 'arh';
      const tws = canTwsShot(setup.shooter);
      methodSeg.setDisabled('tws', !arh || !tws);
      const phoenixPitbull = setup.threat.startsWith('aim54') && (setup.drill === 'pitbull' || setup.drill === 'late');
      methodSeg.setDisabled('stt', !arh || phoenixPitbull);
      const lm = launchMethod(setup.threat, setup.shooter, setup.method);
      const sh = AIRCRAFT[setup.shooter];
      const phoenixStt = setup.threat.startsWith('aim54') && lm === 'stt';
      setText(methodNote, !arh
        ? 'SARH: always from STT. You get his lock, then a launch warning for the whole flight.'
        : lm === 'tws'
          ? 'TWS shot: no lock, no launch warning. Your first cue is the missile going active.' + (phoenixPitbull ? ' Phoenix pitbull drills use TWS; practice PD-STT in Free practice.' : '')
          : `STT shot: you get his lock${sttLaunchWarns(setup.threat, setup.shooter) ? ' and a launch warning' : ', and here no launch warning until the spike (simplified: DCS behaviour not verified)'}.${!tws ? ` The ${sh.short} cannot fire it from TWS.` : ''}${phoenixStt ? ' A Phoenix from PD-STT stays SARH to impact: beam his radar. Inside 10 nm it launches active. Pitbull and Late drills use TWS.' : ''}`);
      const running = run.phase !== 'setup';
      lab.el.classList.toggle('is-running', running);
      setupForm.hidden = running;
      cueEl.hidden = running;
      summary.hidden = !running;
      startBtn.el.hidden = running;
      startOverlay.el.hidden = running;
      setText(summaryText, `${MISSILES[setup.threat].name} from the ${sh.short} · ${fmtRange(setup.range, units)} · ${ASPECTS.find(a => a.value === setup.aspect)?.label ?? ''} · ${setup.skill}`);
    }

    /** Throttled UI: readouts, lamps, coach, buttons, pill. */
    function refreshLive(): void {
      const me = run.me, m = run.missile();
      const live = m && m.alive ? m : null;
      const ref = threatRef(refMode, run.shooter, m);
      const rg = radarGate(run.world, run.shooter, me);
      const sg = seekerGate(run.world, m, me);
      const mt = run.metrics;

      threatRO.set('mrng', live ? fmtRange(live.pos.distanceTo(me.pos), units, 1) : m ? 'gone' : 'not fired');
      threatRO.set('tti', live && live.timeToImpact !== null ? `${Math.round(live.timeToImpact)} s` : '—');
      if (ref && me.alive) {
        const asp = aspectDeg(me, ref.pos);
        threatRO.set('asp', `${Math.round(asp)}° · ${clockCode(relBearing(me.pos, me.heading, ref.pos))}`);
        threatRO.setTone('asp', asp > 75 && asp < 105 ? 'ok' : null);
      } else {
        threatRO.set('asp', '—');
        threatRO.setTone('asp', null);
      }
      ownRO.set('alt', fmtAlt(me.pos.y, units));
      ownRO.set('spd', `${fmtSpeed(me.vel.length(), units)} M${mach(me.vel.length(), me.pos.y).toFixed(2)}`);
      ownRO.set('gate', `${Math.max(mt.radarGateS, mt.seekerGateS).toFixed(1)} s`);
      ownRO.setTone('gate', run.notchFlag ? 'ok' : null);

      // Lamps: what your RWR shows.
      const rwr = me.alive ? me.rwr : [];
      lampLock.set(rwr.some(c => c.state === 'lock' || c.state === 'launch') ? 'on' : 'off');
      lampLaunch.set(rwr.some(c => c.state === 'launch') ? 'flash' : 'off');
      lampMsl.set(rwr.some(c => c.state === 'missile') ? 'flash' : 'off');
      lampNotch.set(run.notchFlag ? 'on' : 'off');

      // Controls.
      const canFly = flying();
      for (const [man, b] of manButtons) { b.setDisabled(!canFly); b.setLit(run.pilot.man === man); }
      for (const b of trimBtns) b.setDisabled(!canFly);
      chaffBtn.setDisabled(!canFly || me.chaff <= 0);
      flareBtn.setDisabled(!canFly || me.flares <= 0);
      chaffBtn.setLabel(`Chaff ${me.chaff}`);
      flareBtn.setLabel(`Flare ${me.flares}`);
      thrSeg.set(run.pilot.thr);
      const waiting = run.phase === 'run' && !run.unlocked;
      lockedNote.hidden = !waiting;
      if (waiting) setText(lockedNote, `Controls locked: ${cueText(setup.drill).replace('Controls unlock', 'they unlock')}`);
      pauseBtn.setLabel(paused ? 'Resume' : 'Pause');
      pauseBtn.el.hidden = run.phase !== 'run';
      retryBtn.el.hidden = run.phase === 'setup';
      debriefBtn.el.hidden = run.phase !== 'end' || !run.result;
      ffToggle.el.hidden = DRILLS[setup.drill].cue === 'start' || run.phase === 'end' || (run.phase === 'run' && run.unlocked);

      // Status pill over the view.
      const tLaunch = mt.launchT !== null ? `T+${(run.world.t - mt.launchT).toFixed(1)} s` : `${run.world.t.toFixed(0)} s`;
      const pill = run.phase === 'setup' ? 'Ready: press Start'
        : run.phase === 'end' ? (mt.result === 'miss' ? 'Survived' : mt.result === 'hit' ? 'Hit' : mt.noShot ? 'No shot' : 'Over')
          : paused ? 'Paused'
            : waiting ? `${mt.launchT === null ? 'Closing' : 'Missile in the air'} · ${fastForward ? `skipping ×${Math.max(3, timeScale)}` : tLaunch}`
              : `${tLaunch} · ${MANEUVER_LABEL[run.pilot.man]}`;
      setText(phasePill, pill);
      setAttr(phasePill, 'data-tone', run.phase === 'end' ? (mt.result === 'miss' ? 'ok' : mt.result === 'hit' ? 'warning' : null) : run.unlocked && live ? 'hi' : null);

      const [text, why, tone] = coachNow(m, rg, sg);
      coach.set(text, why, tone);
      gaugeBezel.setStatus(run.notchFlag ? 'in the gate' : 'keep the needle in the gate');
    }

    /** Still turning toward the maneuver heading (more than 12° to go)? */
    function turning(): boolean {
      const me = run.me;
      const d = Math.abs(((me.cmd.heading - me.heading + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
      return d > 12 * D2R;
    }

    function coachNow(m: Missile | null, rg: GateRead, sg: GateRead): [string, string, Tone | null] {
      const name = MISSILES[setup.threat].name;
      const sh = AIRCRAFT[setup.shooter].short;
      const sarh = m ? m.guidance === 'sarh' || (m.phoenixLaunchMode === 'pd-stt' && m.guidance === 'ballistic') : MISSILES[setup.threat].seeker === 'sarh';
      const spd = (mps: number) => fmtSpeed(mps, units);
      const man = run.pilot.man;
      const notching = man === 'notch-l' || man === 'notch-r';
      const mt = run.metrics;
      const me = run.me, shooter = run.shooter, world = run.world;
      if (run.phase === 'setup') return [`Press Start. ${cueText(setup.drill)}`, drillGoal(setup), null];
      if (run.phase === 'end') {
        const why = run.result?.why ?? '';
        return mt.result === 'miss' ? ['Defeated. Read the debrief, then retry or take the next drill.', why, 'ok']
          : mt.result === 'hit' ? ['Hit. Read the debrief and try again.', why, 'warning']
            : ['No shot this time.', mt.noShot ?? '', 'caution'];
      }
      if (!me.alive) return ['Hit.', '', 'warning'];
      if (paused) return ['Paused. Press P to continue.', '', 'dim'];
      const locked = shooter.alive && shooter.radar.mode === 'stt' && shooter.radar.stt.targetId === me.id;
      if (!m) {
        if (!run.unlocked) return [locked ? 'He has you locked. Hold hot: the drill starts at the launch.' : `Hold hot. The ${sh} is closing to ${fmtRange(setup.range, units)} to shoot.`, 'Watch your RWR: search first, then lock. A lock means a shot may be coming.', null];
        return [locked ? 'He has you locked: a shot may be coming. You may beam him now.' : 'He is searching. Defend when you judge it right.', 'In the free drill your controls are live from the start.', null];
      }
      if (!run.unlocked) {
        const d = DRILLS[setup.drill];
        if (d.cue === 'pitbull') {
          return [run.unlockAt !== null ? `Heads-down: ${Math.max(0, run.unlockAt - world.t).toFixed(1)} s until you look up.`
            : run.drill.method === 'tws' ? 'Silence: a TWS shot gives no warning. Hold hot and watch the RWR.'
              : sttLaunchWarns(setup.threat, setup.shooter) ? 'Lock and launch warning: the missile is coming. This drill starts at the spike: hold hot.'
                : 'He holds a lock, and here no launch warning. Hold hot until the spike.',
            d.delayS > 0 ? 'This drill makes you react late on purpose.' : 'The drill starts when its seeker goes active: pitbull.', null];
        }
        return ['Stand by.', '', null];
      }
      if (!m.alive) return ['Stand by for the debrief.', '', mt.result === 'miss' ? 'ok' : 'warning'];
      if (m.guidance === 'ballistic') return ['The missile is dumb. Stay low; you can turn back hot (5).', sarh ? 'Without his illumination a SARH missile flies ballistic and ignores chaff.' : 'It has lost guidance and flies ballistic.', 'ok'];
      if (setup.drill === 'drag' || man === 'drag') {
        const ref = threatRef('auto', shooter, m);
        const asp = ref ? aspectDeg(me, ref.pos) : 0;
        if (man !== 'drag') return ['Turn cold now: press 3. Full burner, descend.', `A long ${name} shot runs out of energy chasing you. Every second hot gives it range back.`, 'warning'];
        if (asp < 150) return ['Keep turning: put him at your 6 o\'clock.', 'Any angle off your tail lets it cut the corner.', 'caution'];
        return ['Hold it cold: full burner, keep descending.', `It has to cover your run as well as the gap.${m.timeToImpact !== null ? ` Time to impact ${Math.round(m.timeToImpact)} s: growing is good.` : ''}`, 'hi'];
      }
      if (sarh) {
        if (!notching) return ['Beam his radar now: press 1 or 2, then descend.', `The ${name} rides his lock. Put the ${sh} at 3 or 9 o'clock so your radial speed drops inside his ${spd(rg.gate)} gate.`, 'warning'];
        if (!rg.applies) return ['Get below him: his radar needs ground behind you to lose you.', `The ${AIRCRAFT[setup.shooter].radar.name} only loses you in look-down.`, 'caution'];
        if (!rg.inGate && turning()) return ['Keep the turn going: the beam is still ahead of you.', `You show him ${spd(Math.abs(rg.radial))}; his gate is ±${spd(rg.gate)}. Turns are slow up high.`, 'caution'];
        if (!rg.inGate) return ['Trim with A / D: the needle is outside his gate.', `You show him ${spd(Math.abs(rg.radial))}; his gate is ±${spd(rg.gate)}.`, 'caution'];
        const lost = shooter.radar.mode === 'stt' ? shooter.radar.stt.lostFor : 0;
        return ['Hold the needle in the gate. Chaff now.', `His radar is in memory (${lost.toFixed(1)} of ${sttMemory(shooter)} s). When the lock breaks the missile briefly flies on memory, then goes dumb.`, 'hi'];
      }
      if (m.guidance !== 'active') {
        return notching
          ? ['Holding his radar in the notch: his track coasts and the missile flies on a stale point.', 'When it goes active, beam the missile itself.', 'hi']
          : ['Missile on datalink. Notch his radar, or drag if you have the range.', `It goes active about ${fmtRange((MISSILES[setup.threat].pitbullKm ?? 15) * 1000, units)} from you.`, 'caution'];
      }
      if (!notching) return ['Spike. Beam the missile: press 1 or 2, get low, chaff.', `The ${name} seeker is on you. Put it at 3 or 9 o'clock and drop chaff in the notch.`, 'warning'];
      if (!sg.inGate && turning()) return ['Keep the turn going: the beam is still ahead of you.', `You show it ${spd(Math.abs(sg.radial))}; its gate is ±${spd(sg.gate)} now.`, 'caution'];
      if (!sg.lookDown) return ['You are above the missile: descend below it.', 'Looking up, its notch is less than half as wide. You need ground behind you.', 'caution'];
      if (!sg.inGate) return ['Trim with A / D: the needle is outside its gate.', `You show it ${spd(Math.abs(sg.radial))}; its gate is ±${spd(sg.gate)} now.`, 'caution'];
      if (m.seekerOn === null) return ['It lost you. Stay in the beam and keep dropping chaff.', 'Leave the gate while it can still see you and it finds you again.', 'ok'];
      if (m.seekerOn !== me.id) return ['It took your chaff. Hold the beam.', 'The seeker is on a chaff cloud and flies on to it.', 'ok'];
      if (chaffOdds(world, m, me) > 0) return ['In the gate. Chaff now, about one a second.', `Each bundle is a roll against its chaff factor (${MISSILES[setup.threat].chaffSusceptibility}).`, 'hi'];
      return ['Hold the beam.', `Chaff counts once the missile is inside ${fmtRange(chaffRange(m), units)}; it is ${fmtRange(sg.range, units, 1)} out.`, 'hi'];
    }

    function gaugeRows(): GaugeRow[] {
      const me = run.me, shooter = run.shooter, world = run.world;
      const m = run.missile();
      const rg = radarGate(world, shooter, me);
      const sg = seekerGate(world, m, me);
      const notch = m ? notchState(world, m) : null;
      const sr = AIRCRAFT[setup.shooter].radar;
      const sttOn = shooter.alive && shooter.radar.mode === 'stt' && shooter.radar.stt.targetId === me.id;
      const trk = shooter.alive ? shooter.radar.tracks.find(t => t.targetId === me.id) : undefined;
      const mem = shooter.alive ? sttMemory(shooter) : 3;
      const radarStatus = !shooter.alive ? 'GONE'
        : sttOn ? (shooter.radar.stt.lostFor > 0 ? 'LOCK · MEMORY' : 'LOCK')
          : trk ? (trk.coasting ? 'TRACK · COASTING' : 'TWS TRACK')
            : shooter.radar.mode === 'off' ? 'OFF' : 'SEARCH';
      const radarNote = !rg.applies ? 'Look-up: this radar cannot lose you here. Get below him.'
        : rg.needsLookDown ? 'Look-down: the notch works.' : 'Flat gate: altitude does not matter here.';
      const rows: GaugeRow[] = [{
        title: `HIS RADAR  ${sr.name}`, status: radarStatus, read: rg, dim: !rg.on,
        hold: sttOn ? { t: shooter.radar.stt.lostFor, need: mem, label: `LOCK BREAKS ${shooter.radar.stt.lostFor.toFixed(1)}/${mem} s` } : null,
        note: radarNote,
      }];
      const spec = MISSILES[setup.threat];
      let status: string;
      let note = '';
      let noteLit = false;
      if (!m) { status = 'NOT FIRED'; note = spec.seeker === 'sarh' ? 'SARH: homes on his radar from launch.' : `Seeker comes on about ${fmtRange((spec.pitbullKm ?? 15) * 1000, units)} from you.`; }
      else if (!m.alive) status = m.result?.kind === 'hit' ? 'HIT' : 'GONE';
      else if (m.guidance === 'ballistic') { status = 'DUMB'; note = 'No guidance: chaff no longer matters.'; }
      else if (!sg.on) { status = m.timeToActive !== null ? `OFF · ACT ${Math.round(m.timeToActive)} s` : 'OFF'; note = 'Seeker off: it flies on his datalink.'; }
      else {
        status = m.seekerOn === me.id ? 'TRACKING YOU' : m.seekerOn ? 'ON CHAFF' : 'LOST YOU';
        const odds = chaffOdds(world, m, me);
        if (m.seekerOn && m.seekerOn !== me.id) { note = 'It took your chaff.'; noteLit = true; }
        else if (odds > 0) { note = `CHAFF WORKS NOW: about ${Math.max(1, Math.round(odds * 100))} % per bundle`; noteLit = true; }
        else if (sg.range > chaffRange(m)) note = `Chaff counts inside ${fmtRange(chaffRange(m), units)}. ${sg.lookDown ? 'Look-down.' : 'Look-up: gate much narrower.'}`;
        else if (m.seekerOn === null) note = 'Out of the gate: it can find you again.';
        else note = `Out of the notch: chaff is wasted. ${sg.lookDown ? 'Look-down.' : 'Look-up: get below it.'}`;
      }
      rows.push({
        title: `SEEKER  ${spec.name}`, status, read: sg, dim: !sg.on,
        hold: sg.on && m?.seekerOn === me.id && notch ? { t: notch.heldS, need: notch.holdS, label: `DROPS YOU ${notch.heldS.toFixed(1)}/${notch.holdS} s` } : null,
        note, noteLit,
      });
      return rows;
    }

    // ------------------------------------------------------------------ frame loop
    function frame(dt: number): void {
      if (dead) return;
      if (run.phase === 'run' && !paused && dt > 0) {
        const skip = !run.unlocked && fastForward && DRILLS[setup.drill].cue !== 'start';
        run.tick(dt, dt * (skip ? Math.max(3, timeScale) : timeScale));
      }
      padlock(dt);
      const contacts = run.me.alive ? run.me.rwr : [];
      rwrDisplay.draw(contacts, run.world.t);
      audio.update(contacts, run.world.t);
      gauge.draw(gaugeRows());
      uiClock += dt;
      if (uiClock >= 0.1 || dt === 0) { uiClock = 0; refreshLive(); }
    }

    // Without WebGL, drive the loop with requestAnimationFrame.
    if (!st) {
      let raf = 0;
      let last = performance.now();
      const loop = (now: number) => {
        frame(Math.min(0.1, (now - last) / 1000));
        last = now;
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      bag.add(() => cancelAnimationFrame(raf));
    }

    // ------------------------------------------------------------------ keys
    const hold = (k: keyof DrillRunner['held'], tap: () => void) => ({
      down: () => { if (flying()) { run.held[k] = true; tap(); } },
      up: () => { run.held[k] = false; },
    });
    bag.add(bindKeys({
      '1': () => doManeuver('notch-l'),
      '2': () => doManeuver('notch-r'),
      '3': () => doManeuver('drag'),
      '4': () => doManeuver('crank'),
      '5': () => doManeuver('hot'),
      [cm.chaff.bind]: () => dropChaff(),
      [cm.flare.bind]: () => dropFlare(),
      'A': hold('left', () => run.nudgeHeading(-1)),
      'D': hold('right', () => run.nudgeHeading(1)),
      'W': hold('up', () => run.nudgeAlt(100)),
      'S': hold('down', () => run.nudgeAlt(-100)),
      'Shift': () => { if (flying()) { run.throttle(1); thrSeg.set(run.pilot.thr); } },
      'Ctrl': () => { if (flying()) { run.throttle(-1); thrSeg.set(run.pilot.thr); } },
      'Space': () => { if (run.phase === 'setup') start(); else togglePause(); },
      'P': () => togglePause(),
      'R': { down: () => { if (run.phase !== 'setup') retry(); }, inModal: true },
      'N': { down: () => { if (run.phase === 'end') nextDrillGo(); }, inModal: true },
      'F2': () => setCam('chase'),
      'F10': () => setCam('tactical'),
    }));
    bag.on(window, 'blur', () => { if (run) run.held.left = run.held.right = run.held.up = run.held.down = false; });

    // ------------------------------------------------------------------ go
    build();
    const shot = ctx.params.get('shot') as ShotState | null;
    if (shot && (SHOT_STATES as readonly string[]).includes(shot)) preroll(shot);
    // ?only=explainer hides the lab (headless screenshots cannot scroll); ?scroll=explainer opens the page there.
    if (ctx.params.get('only') === 'explainer') lab.el.hidden = true;
    if (ctx.params.get('scroll') === 'explainer') {
      const raf = requestAnimationFrame(() => explainer.scrollIntoView({ block: 'start' }));
      bag.add(() => cancelAnimationFrame(raf));
    }

    /** Screenshot helper: jump to a state by running the sim with the scripted defense. */
    function preroll(s: ShotState): void {
      start();
      if (s === 'live') return;
      const dt = 1 / 30;
      const auto = s !== 'launch';
      const chaffState = { lastChaff: -9 };
      let sync = 0;
      const mt = run.metrics;
      const done = (): boolean => {
        if (run.phase !== 'run') return true;
        const t = run.world.t;
        switch (s) {
          case 'launch': return mt.launchT !== null && t > mt.launchT + 3;
          case 'notch': return mt.launchT !== null && t > (MISSILES[setup.threat].seeker === 'sarh' ? mt.launchT + 13 : (mt.unlockT ?? Infinity) + 7);
          case 'active': return mt.pitbullT !== null && t > mt.pitbullT + 4;
          default: return false;   // 'result': run until the runner finishes
        }
      };
      for (let i = 0; i < 30 * 200 && !done(); i++) {
        if (auto) run.autoDefend(chaffState);
        run.tick(dt, dt);
        sync += dt;
        if (sync >= 0.25 && view) { sync = 0; view.syncNow(); }
      }
      view?.syncNow();
      camAim = null;
      refreshLive();
    }
  }

  return {
    mount(ctx) {
      dead = false;
      try { mount(ctx); } catch (e) { console.error(e); ctx.root.append(h('p', { class: 'page-error' }, 'The defense page failed to start: ' + String(e))); }
    },
    unmount() {
      dead = true;
      bag.dispose();
    },
  };
};
export default factory;
