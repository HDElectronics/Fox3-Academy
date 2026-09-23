/**
 * [OWNER: page-flight-ops] Pattern and landing (#/flight-ops, issues #19 and #22). The overhead break, downwind,
 * final turn and groove for all ten jets, and the return to base with the FC3 nav modes (МРШ / ВЗВ / ПОС,
 * NAV / ILSN) for the jets with nav data: Watch the demo pilot fly it, or Fly it with the keyboard or the
 * on-screen controls, then read the graded debrief. Arcade model, nav and grading live in src/sim/flightOps;
 * the 3D scene in src/render/flightOps; facts in src/data/flightOps.ts.
 *
 * URL params: ?ac=<id> (select a jet once), ?mode=watch|fly, ?start=initial|downwind|final|rtb,
 * ?shot=final|downwind|debrief|rtb|ils (pre-roll the demo for screenshots; mode=fly hands over after the
 * pre-roll), ?cam=chase|side|tower|cockpit, ?touch=1 (show the on-screen controls on a fine pointer).
 */
import './style.css';
import type { Page, PageFactory, PageContext } from '../../app/page';
import type { AircraftId } from '../../data/types';
import { AIRCRAFT } from '../../data/aircraft';
import { FLIGHT_OPS, FLIGHT_OPS_CAVEATS } from '../../data/flightOps';
import {
  ApproachEvaluator, FLIGHT_OPS_DT, aimPointM, aoaCue, applyAction, approachGeometry, configWarnings, createFlightOpsState,
  demoLeg, demoPilot, hasNavStart, initNav, stepFlightOps, type ApproachScore, type FlightOpsInput, type FlightOpsJetId,
  type FlightOpsState, type Sourced,
} from '../../sim/flightOps';
import { FlightOpsScene, Stage, isWebGLAvailable, type FlightOpsCamera } from '../../render';
import {
  h, cleanup, labLayout, consolePanel, screenBezel, segmented, button, coachBox, checklist, readouts, callout, placard, lamp,
  bindKeys, keyHint, disclosure, setText, toggle, parseChord, type ChecklistHandle,
} from '../../ui';
import { HudDisplay, IndexerDisplay, NavDisplay, TraceDisplay, type TracePoint } from './displays';
import { lessonSteps, legCaption } from './lesson';
import {
  FLIGHT_OPS_JETS, GLIDE_TOL_DEG, LINEUP_TOL_DEG, PASS_SCORE, altFtText, altVal, aoaText, currentStep, errLevel, flapControl,
  gatesForStart, isFlightOpsJet, kt, ktText, lessonPassed, navMilestones, navPicture, placeGates, plannedGates, spdUnit, spdVal,
  stepOrder, stepsDone, altUnit, type FlownPoint, type NavMilestones,
} from './logic';
import { touchControls, type TouchAction } from './touch';

type Mode = 'watch' | 'fly';
type Start = 'initial' | 'downwind' | 'final' | 'rtb';
const CAMS: readonly FlightOpsCamera[] = ['chase', 'side', 'tower', 'cockpit'];
const SHOTS = ['final', 'downwind', 'debrief', 'rtb', 'ils'] as const;
type Shot = typeof SHOTS[number];
const TRAIL_EVERY = 6;          // steps between trail points (0.1 s)
const TRACK_MAX = 20000;
const CALL_SHOW_S = 5;

const nvTag = (s: Sourced<unknown>) => (s.verified ? null : h('span', { class: 'fo-nv', title: s.note ?? s.source }, 'not verified'));

const factory: PageFactory = (): Page => {
  const bag = cleanup();

  function mount(ctx: PageContext): void {
    const acParam = ctx.params.get('ac') as AircraftId | null;
    if (acParam && AIRCRAFT[acParam]) {
      const rest = new URLSearchParams(ctx.params);
      rest.delete('ac');
      const qs = rest.toString();
      try { history.replaceState(history.state, '', `#/flight-ops${qs ? '?' + qs : ''}`); } catch { /* sandboxed */ }
      if (acParam !== ctx.app.aircraft) { ctx.app.setAircraft(acParam); return; }
    }
    const ac = ctx.app.aircraft;
    if (!isFlightOpsJet(ac)) { unsupported(ctx, ac); return; }
    lab(ctx, ac);
  }

  // ------------------------------------------------------------------ fallback (a jet without data)
  function unsupported(ctx: PageContext, ac: AircraftId): void {
    ctx.root.append(h('div', { class: 'fo-unsupported' },
      consolePanel({
        id: 'fo-unsupported', title: 'Pattern & landing',
        children: [
          h('p', { class: 'fo-unsupported__lead' }, 'No pattern data for this jet.'),
          h('p', null, `The ${AIRCRAFT[ac]?.short ?? ac} pattern numbers are not in the trainer. Pick another jet.`),
          h('div', { class: 'fo-unsupported__jets' }, FLIGHT_OPS_JETS.map(id => button({
            id: `fo-pick-${id}`, label: AIRCRAFT[id].short, variant: 'primary', onClick: () => ctx.app.setAircraft(id),
          }).el)),
        ],
      }).el));
  }

  // ------------------------------------------------------------------ the lab
  function lab(ctx: PageContext, ac: FlightOpsJetId): void {
    const d = FLIGHT_OPS[ac];
    const spec = AIRCRAFT[ac];
    const units = () => ctx.app.units;
    const navOk = hasNavStart(d);
    const fc = flapControl(d);
    const planAll = plannedGates(d);
    const reduced = Stage.prefersReducedMotion();
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    const navLabels = d.nav?.modes.map(m => m.label) ?? [];

    let mode: Mode = ctx.params.get('mode') === 'fly' ? 'fly' : 'watch';
    const startParam = ctx.params.get('start');
    let start: Start = startParam === 'downwind' || startParam === 'final' || (startParam === 'rtb' && navOk) ? startParam : 'initial';
    const camParam = ctx.params.get('cam') as FlightOpsCamera | null;
    let cam: FlightOpsCamera = camParam && CAMS.includes(camParam) ? camParam : 'chase';
    let showTouch = ctx.params.get('touch') === '1';

    let s!: FlightOpsState;
    let ev!: ApproachEvaluator;
    let started = false, paused = false, finished = false, configured = false;
    let acc = 0, steps = 0, onSpeedRun = 0, uiClock = 0, gatesSeen = -1;
    let track: TracePoint[] = [];
    let flown: FlownPoint[] = [];
    let navMs: NavMilestones = { steering: false, intercept: false, onGlideRunS: 0 };
    let hudStatus = '';
    let navKey = '', lastCall: string | null = null, callAt = -1e9;
    let score: ApproachScore | null = null;
    const input: FlightOpsInput = { pitch: 0, roll: 0, throttle: 0.6 };
    const held = { up: false, down: false, left: false, right: false, thrUp: false, thrDn: false };
    const rtb = () => start === 'rtb';

    // ---------------------------------------------------------------- displays (strip)
    const viewport = h('div', { class: 'fo-viewport' });
    const hudCanvas = h('canvas', { class: 'fo-canvas' });
    const idxCanvas = h('canvas', { class: 'fo-canvas' });
    const traceCanvas = h('canvas', { class: 'fo-canvas' });
    const navCanvas = h('canvas', { class: 'fo-canvas' });
    const hudBezel = screenBezel({ id: 'fo-hud', label: 'HUD', aspect: '4 / 3', content: hudCanvas, status: 'simplified', class: 'fo-hud' });
    const idxBezel = screenBezel({ id: 'fo-idx', label: 'AoA indexer', aspect: '1 / 2', content: idxCanvas, status: 'gear dn', class: 'fo-idx' });
    const traceBezel = screenBezel({ id: 'fo-trace', label: 'Pattern', aspect: '1', content: traceCanvas, class: 'fo-trace' });
    const navBezel = screenBezel({ id: 'fo-nav', label: 'Nav (HSI)', aspect: '1', content: navCanvas, status: 'simplified', class: 'fo-navd' });

    const lampGear = lamp({ label: 'GEAR', tone: 'ok', title: 'Gear down and locked (flashes in transit)' });
    const lampFlaps = lamp({ label: fc === 'with-gear' ? 'FLAPS (GEAR)' : 'FLAPS', tone: 'ok', title: 'Landing flaps set' });
    lampFlaps.el.hidden = fc === 'none';
    const lampBrake = lamp({ label: 'SPD BRK', tone: 'caution', title: 'Speed brake out' });
    const lampOver = lamp({ label: 'OVERSPEED', tone: 'warning', title: `Gear or landing flaps above ${ktText(d.pattern.gearMaxKt.value, units())}` });
    const cfgRO = readouts({ id: 'fo-cfg', rows: [{ id: 'flap', label: 'Flaps' }, { id: 'thr', label: 'Throttle' }, { id: 'aoa', label: 'AoA' }] });
    const cfgBlock = h('div', { class: 'ui-strip-block fo-cfg' },
      placard('Configuration'),
      h('div', { class: 'fo-lamps' }, lampGear.el, lampFlaps.el, lampBrake.el, lampOver.el),
      cfgRO.el);

    // ---------------------------------------------------------------- console: lesson
    const coach = coachBox({ id: 'fo-coach' });
    let stepsDef = lessonSteps(d, units(), rtb());
    let steps_: ChecklistHandle = checklist({ id: 'fo-steps', steps: stepsDef });
    const stepsBox = h('div', { class: 'fo-steps' }, steps_.el);
    function rebuildSteps(): void {
      stepsDef = lessonSteps(d, units(), rtb());
      steps_ = checklist({ id: 'fo-steps', steps: stepsDef });
      stepsBox.replaceChildren(steps_.el);
    }
    const modeSeg = segmented<Mode>({
      id: 'fo-mode', label: 'Mode', value: mode, fill: true,
      options: [{ value: 'watch', label: 'Watch', title: 'The demo pilot flies it' }, { value: 'fly', label: 'Fly', title: 'You fly it with the keyboard or the on-screen controls' }],
      onChange: v => { mode = v; reset(false); },
    });
    const startOpts: { value: Start; label: string; title?: string }[] = [{ value: 'initial', label: 'Initial' }, { value: 'downwind', label: 'Downwind' }, { value: 'final', label: 'Final' }];
    if (navOk) startOpts.push({ value: 'rtb', label: 'Return to base', title: `Nav home from 40 km out: ${navLabels.join(' → ')}` });
    const startSeg = segmented<Start>({
      id: 'fo-start', label: 'Start', value: start, fill: true, options: startOpts,
      onChange: v => { start = v; rebuildSteps(); reset(false); },
    });
    const startBtn = button({ id: 'fo-go', label: 'Start', variant: 'primary', keys: 'Space', block: true, onClick: () => go() });
    const touchToggle = toggle({
      id: 'fo-touch-toggle', label: 'Show on-screen controls', style: 'switch', size: 's', value: showTouch,
      onChange: v => { showTouch = v; syncTouch(); },
    });
    const lessonPanel = consolePanel({
      id: 'fo-lesson', title: `Pattern & landing · ${spec.short}`,
      children: [coach.el, modeSeg.el, startSeg.el, startBtn.el, touchToggle.el, stepsBox],
    });

    // ---------------------------------------------------------------- console: debrief
    const debriefBody = h('div', { class: 'fo-debrief' });
    const debriefPanel = consolePanel({ id: 'fo-debrief-panel', title: 'Debrief', children: [debriefBody] });
    debriefPanel.el.hidden = true;

    // ---------------------------------------------------------------- console: numbers, keys, notes
    const numbersBox = h('dl', { class: 'fo-numbers' });
    function renderNumbers(): void {
      const p = d.pattern, u = units();
      const unitA = d.aoa.unit === 'deg' ? '°' : ' units';
      const rows: [string, string, Sourced<unknown>][] = [
        ['Initial', `${altFtText(p.initialAltFt.value, u)}, ${ktText(p.initialKt.value, u)}`, p.initialKt.verified ? p.initialAltFt : p.initialKt],
        ['Break', `${p.breakG.value} g`, p.breakG],
        ['Downwind', altFtText(p.downwindAltFt.value, u), p.downwindAltFt],
        ['Abeam', `${p.abeamNm.value} nm`, p.abeamNm],
        ['Gear limit', ktText(p.gearMaxKt.value, u), p.gearMaxKt],
        ['On-speed AoA', `${d.aoa.onSpeed.value}${unitA} (${d.aoa.band.value[0]}–${d.aoa.band.value[1]})`, d.aoa.band],
        ['Approach speed', ktText(d.approachKt.value, u), d.approachKt],
        ['Glide path', `${d.glideDeg.value}°`, d.glideDeg],
        ['Aim point', `${altFtText(d.aimPointFt.value, u)} past the threshold`, d.aimPointFt],
      ];
      if (d.nav) {
        const n = d.nav;
        rows.push(['Nav modes', `${navLabels.join(' → ')} on ${n.keys.modeCycle.value}`, n.keys.modeCycle]);
        rows.push(['Intercept', `${u === 'metric' ? `${n.interceptPointM.value / 1000} km` : `${(n.interceptPointM.value / 1852).toFixed(1)} nm`} out, ${u === 'metric' ? `${n.interceptAltM.value} m` : `${Math.round(n.interceptAltM.value / 0.3048 / 10) * 10} ft`}`, n.interceptPointM]);
        rows.push(['Landing mode', n.autoLandingSwitch.value ? 'Automatic at the intercept point' : `Pilot selects ${navLabels[navLabels.length - 1]}`, n.autoLandingSwitch]);
      }
      numbersBox.replaceChildren(...rows.flatMap(([k, v, src]) => [h('dt', null, k), h('dd', { title: src.note ?? src.source }, v, nvTag(src))]));
    }
    renderNumbers();
    const keyList = h('div', { class: 'fo-keys' },
      keyHint({ label: 'Pitch (stick)', keys: 'Up / Down' }),
      keyHint({ label: 'Roll (stick)', keys: 'Left / Right' }),
      keyHint({ label: 'Throttle up / down', keys: 'Num+ / = , Num- / -' }),
      keyHint({ label: 'Gear', keys: d.keys.gear, note: 'not verified' }),
      fc === 'with-gear' ? keyHint({ label: 'Flaps', keys: 'follow the gear' })
        : fc === 'none' ? keyHint({ label: 'Flaps', keys: 'n/a', note: 'no flap selector' })
          : keyHint({ label: 'Flaps (cycle)', keys: d.keys.flaps, note: 'not verified' }),
      keyHint({ label: 'Speed brake', keys: d.keys.speedbrake, note: 'not verified' }),
      d.nav ? keyHint({ label: `Nav mode (${navLabels.join(' / ')})`, keys: d.nav.keys.modeCycle.value, note: d.nav.keys.modeCycle.verified ? undefined : 'not verified' }) : null,
      d.nav?.keys.pointCycle ? keyHint({ label: 'Next waypoint (МРШ / NAV)', keys: d.nav.keys.pointCycle.value, note: d.nav.keys.pointCycle.verified ? undefined : 'not verified' }) : null,
      keyHint({ label: 'Pause / restart / camera', keys: 'P / R / C' }));
    const notes = h('div', { class: 'fo-notes' },
      callout({ kind: 'simplified', body: 'Arcade flight model tuned to the manual numbers. The HUD and the nav display are simplified: no wind, no sideslip, one AoA cue per jet. Stick and throttle keys and the on-screen controls are trainer controls, not DCS defaults.' }),
      h('ul', null, FLIGHT_OPS_CAVEATS.map(c => h('li', null, c))));

    // ---------------------------------------------------------------- viewport overlays
    const pill = h('div', { class: 'fo-pill', role: 'status' });
    const callLine = h('div', { class: 'fo-call', role: 'status', 'aria-live': 'polite' });
    callLine.hidden = true;
    const camSeg = segmented<FlightOpsCamera>({
      id: 'fo-cam', ariaLabel: 'Camera', value: cam, size: 's',
      options: [{ value: 'chase', label: 'Chase' }, { value: 'side', label: 'Side' }, { value: 'tower', label: 'Tower' }, { value: 'cockpit', label: 'Cockpit' }],
      onChange: v => setCam(v),
    });
    const pauseBtn = button({ id: 'fo-pause', label: 'Pause', size: 's', keys: 'P', onClick: () => togglePause() });
    const restartBtn = button({ id: 'fo-restart', label: 'Restart', size: 's', keys: 'R', onClick: () => reset(true) });

    const layout = labLayout({
      id: 'fo-lab', class: 'fo-lab',
      header: { title: 'Pattern & landing', meta: `${spec.short} · ${d.glideDeg.value}° glide path · ${d.hudCue}`, lede: navOk ? 'Nav home, break, configure, fly the AoA, land in the zone.' : 'Break, configure, fly the AoA, land in the zone.' },
      viewport,
      strip: [hudBezel.el, navBezel.el, idxBezel.el, traceBezel.el, cfgBlock],
      console: [debriefPanel.el, lessonPanel.el,
        consolePanel({ id: 'fo-numbers-panel', title: `${spec.short} numbers`, children: [numbersBox] }).el,
        disclosure({ title: 'Keys', content: keyList, open: mode === 'fly' }),
        disclosure({ title: 'Accuracy notes', content: notes })],
    });
    layout.overlay('tl', pill);
    layout.overlay('tr', camSeg.el);
    layout.overlay('bl', pauseBtn.el, restartBtn.el);
    layout.overlay('br', callLine);
    ctx.root.append(h('div', { class: 'fo-page' }, layout.el));
    bag.add(() => layout.destroy());

    const hud = new HudDisplay(hudCanvas, d, units);
    const indexer = new IndexerDisplay(idxCanvas, d);
    const trace = new TraceDisplay(traceCanvas);
    const navDisp = new NavDisplay(navCanvas, units);
    bag.add(() => { hud.dispose(); indexer.dispose(); trace.dispose(); navDisp.dispose(); });

    // ---------------------------------------------------------------- touch controls (Fly mode)
    const touch = touchControls({
      flaps: fc === 'selector',
      nav: d.nav ? { title: `Nav mode: ${navLabels.join(' → ')}`, key: d.nav.keys.modeCycle.value } : undefined,
      onAction: (a: TouchAction) => act(() => {
        if (a === 'gear') gearAct();
        else if (a === 'flaps') cycleFlaps();
        else if (a === 'brake') applyAction(s, 'speedbrakeToggle', d);
        else applyAction(s, 'navModeCycle', d);
      })(),
      onThrottle: v => { if (mode === 'fly') input.throttle = v; },
    });
    layout.strip.prepend(touch.el);
    bag.add(() => touch.dispose());
    function syncTouch(): void {
      touch.el.hidden = !(mode === 'fly' && (coarse || showTouch));
      touchToggle.el.hidden = mode !== 'fly' || coarse;
    }

    // ---------------------------------------------------------------- 3D
    let stage: Stage | null = null;
    let scene: FlightOpsScene | null = null;
    if (isWebGLAvailable()) {
      try {
        stage = new Stage(viewport, { autoStart: !reduced, autoPause: 'render', environment: { surface: 'land', grid: false }, ariaLabel: '3D view of the airfield pattern' });
        scene = new FlightOpsScene(stage, ac, {
          camera: cam, glideDeg: d.glideDeg.value, aimPointM: aimPointM(d), vTolDeg: GLIDE_TOL_DEG, hTolDeg: LINEUP_TOL_DEG,
        });
        scene.jet.setSweep(20);   // F-14: wings spread in the pattern (no-op for fixed wings)
      } catch (e) {
        console.warn('Flight ops: 3D view unavailable', e);
        scene?.dispose(); stage?.dispose(); stage = null; scene = null;
      }
    }
    if (!stage) viewport.append(h('p', { class: 'fo-no3d' }, 'The 3D view needs WebGL. The HUD, indexer and pattern trace still run.'));
    const st = stage, sc = scene;
    if (st && sc) {
      bag.add(() => { sc.dispose(); st.dispose(); });
      st.onFrame(frame);
    } else {
      let raf = 0, last = performance.now();
      const loop = (now: number) => { frame(Math.min(0.1, (now - last) / 1000)); last = now; raf = requestAnimationFrame(loop); };
      raf = requestAnimationFrame(loop);
      bag.add(() => cancelAnimationFrame(raf));
    }

    // ---------------------------------------------------------------- sim
    function reset(autostart: boolean): void {
      s = createFlightOpsState(ac, start, d);
      // Fly the return from МРШ so the lesson starts with selecting ВЗВ (jets with a return mode).
      if (rtb() && mode === 'fly' && d.nav?.modes.some(m => m.id === 'return')) initNav(s, d, 'route');
      ev = new ApproachEvaluator(d);
      track = []; flown = []; score = null; finished = false; configured = false; onSpeedRun = 0; acc = 0; steps = 0; gatesSeen = -1;
      navMs = { steering: false, intercept: false, onGlideRunS: 0 };
      lastCall = s.nav?.call ?? null; callAt = -1e9; navKey = '';
      input.pitch = 0; input.roll = 0; input.throttle = s.throttle;
      paused = false; started = autostart;
      sc?.overlay.clearTrail();
      steps_.reset();
      debriefPanel.el.hidden = true;
      // Return to base: the nav display replaces the pattern trace (the rings stay in the 3D view).
      navBezel.el.hidden = !s.nav;
      traceBezel.el.hidden = !!s.nav;
      hudStatus = '';
      pauseBtn.setLabel('Pause');
      startBtn.setLabel(mode === 'watch' ? 'Watch the demo' : 'Fly');
      startBtn.setDisabled(autostart);
      syncTouch();
      syncGates();
      syncNavTarget();
      sc?.update(s);
      refresh(true);
    }

    function go(): void {
      if (finished) { reset(true); return; }
      started = true; paused = false;
      startBtn.setDisabled(true);
      refresh(true);
    }

    function togglePause(): void {
      if (!started || finished) return;
      paused = !paused;
      pauseBtn.setLabel(paused ? 'Resume' : 'Pause');
      refresh(true);
    }

    function setCam(c: FlightOpsCamera): void {
      cam = c;
      camSeg.set(c);
      sc?.setCamera(c);
      st?.requestRender();
    }

    function playerInput(dt: number): FlightOpsInput {
      const rate = 3.5 * dt;
      const tp = touch.active ? touch.stick.y : (held.down ? 1 : 0) - (held.up ? 1 : 0);
      const tr = touch.active ? touch.stick.x : (held.right ? 1 : 0) - (held.left ? 1 : 0);
      input.pitch += Math.max(-rate, Math.min(rate, tp * 0.7 - input.pitch));
      input.roll += Math.max(-rate, Math.min(rate, tr - input.roll));
      input.throttle = Math.max(0, Math.min(1, input.throttle + ((held.thrUp ? 1 : 0) - (held.thrDn ? 1 : 0)) * 0.45 * dt));
      return input;
    }

    function tick(): void {
      if (mode === 'watch') {
        const cmd = demoPilot(s, d);
        for (const a of cmd.actions) applyAction(s, a, d);
        stepFlightOps(s, cmd, FLIGHT_OPS_DT, d);
      } else {
        stepFlightOps(s, playerInput(FLIGHT_OPS_DT), FLIGHT_OPS_DT, d);
      }
      ev.update(s);
      steps++;
      const cue = aoaCue(s, d);
      if (s.phase === 'air') onSpeedRun = s.gearDown && cue === 'on' ? onSpeedRun + FLIGHT_OPS_DT : 0;
      if (!configured && s.gearDown && s.gearPos > 0.99 && s.flapIndex >= d.landingFlap && kt(s.speed) <= d.pattern.gearMaxKt.value) configured = true;
      if (s.nav) {
        const m = navMilestones(s.nav, d, navMs.onGlideRunS, FLIGHT_OPS_DT);
        navMs = { steering: navMs.steering || m.steering, intercept: navMs.intercept || m.intercept, onGlideRunS: navMs.onGlideRunS >= 3 ? navMs.onGlideRunS : m.onGlideRunS };
        if (s.nav.call && s.nav.call !== lastCall) { lastCall = s.nav.call; callAt = s.t; }
        else if (!s.nav.call) lastCall = null;
      }
      if (steps % TRAIL_EVERY === 0 && (s.phase === 'air' || s.phase === 'rollout')) {
        const lvl = errLevel(approachGeometry(s, d), s, cue);
        sc?.overlay.pushTrail(s.pos, lvl);
        if (track.length < TRACK_MAX) {
          track.push({ x: s.pos.x, z: s.pos.z, level: lvl });
          flown.push({ t: s.t, x: s.pos.x, y: s.pos.y, z: s.pos.z, heading: s.heading });
        }
      }
      if (!finished && s.phase !== 'air') {
        const sco = ev.score();
        if (sco.total !== null) finish(sco);
      }
    }

    function placed() {
      return placeGates(gatesForStart(planAll, rtb()), score?.gates ?? ev.score().gates, flown);
    }

    function syncGates(): void {
      const results = ev.score().gates;
      if (results.length === gatesSeen) return;
      gatesSeen = results.length;
      sc?.overlay.setGates(placed().map(g => ({ id: g.id, pos: g.pos, radiusM: g.radiusM, headingRad: g.headingRad, state: g.state })));
    }

    function syncNavTarget(): void {
      const t = s.nav?.target;
      const key = t ? `${t.name}|${Math.round(t.x)}|${Math.round(t.z)}` : '';
      if (key === navKey) return;
      navKey = key;
      sc?.setNavTarget(t ? { x: t.x, z: t.z } : null, t ? (t.name.startsWith('Glide') ? 'G/S ICPT' : t.name) : undefined);
    }

    function frame(dt: number): void {
      if (dt > 0 && started && !paused) {
        acc = Math.min(acc + dt, 0.25);
        while (acc >= FLIGHT_OPS_DT) { acc -= FLIGHT_OPS_DT; tick(); }
      }
      sc?.update(s);
      hud.draw(s);
      indexer.draw(s);
      uiClock += dt;
      if (uiClock >= 0.1 || dt === 0) { uiClock = 0; refresh(false); }
    }

    // ---------------------------------------------------------------- UI refresh (10 Hz)
    function refresh(force: boolean): void {
      if (force) { hud.draw(s); indexer.draw(s); }
      syncGates();
      syncNavTarget();
      navDisp.draw(s);
      const status = s.nav ? s.nav.label : d.id === 'f15c' ? 'ILSN' : 'simplified';
      if (status !== hudStatus) { hudStatus = status; hudBezel.setStatus(status); }
      trace.draw(s, track, placed());
      const u = units();

      const warn = configWarnings(s, d);
      lampGear.set(s.gearDown ? (s.gearPos > 0.99 ? 'on' : 'flash') : s.gearPos > 0.01 ? 'flash' : 'off');
      const flapsSet = s.flapIndex >= d.landingFlap;
      lampFlaps.set(flapsSet ? (s.flapPos > 0.97 || fc === 'with-gear' ? 'on' : 'flash') : 'off');
      lampBrake.set(s.speedbrakeOut);
      lampOver.set(warn.overspeed ? 'flash' : 'off');
      cfgRO.set('flap', fc === 'none' ? 'n/a' : fc === 'with-gear' ? (s.flapPos > 0.5 ? 'DOWN (gear)' : 'UP') : (d.flapLabels[s.flapIndex] ?? ''));
      cfgRO.set('thr', `${Math.round(s.throttle * 100)} %`);
      cfgRO.set('aoa', aoaText(d, s.aoa));
      touch.setThrottle(input.throttle);

      const order = stepOrder(rtb() && navOk);
      const done = stepsDone({ gates: score?.gates ?? ev.score().gates, configured, onSpeedRunS: onSpeedRun, nav: s.nav ? navMs : undefined });
      for (const id of order) if (done.has(id) && !steps_.isDone(id)) steps_.setDone(id, true);
      steps_.setCurrent(currentStep(new Set(order.filter(id => steps_.isDone(id))), order));

      const showCall = !!s.nav && lastCall !== null && s.t - callAt < CALL_SHOW_S;
      callLine.hidden = !showCall;
      if (showCall) setText(callLine, `Tower: ${lastCall}`);

      setText(pill, !started ? (mode === 'watch' ? 'Demo ready' : 'Ready') : paused ? 'Paused'
        : s.phase === 'crashed' ? 'Crashed' : s.phase === 'stopped' ? 'Stopped'
          : `${spdVal(s.speed, u)} ${spdUnit(u).toLowerCase()} · ${Math.max(0, altVal(s.pos.y, u))} ${altUnit(u).toLowerCase()}`);
      coachLine(warn.overspeed);
    }

    function coachLine(over: 'gear' | 'flaps' | null): void {
      const u = units();
      if (finished && score) { coach.set(`${score.total} / 100. ${score.verdict ?? ''}`, 'Read the gates below, then fly it again.', lessonPassed(score.total) ? 'ok' : 'caution'); return; }
      if (!started) {
        const what = rtb() ? 'the return to base' : 'the overhead pattern';
        coach.set(mode === 'watch' ? `Watch the demo fly ${what}.` : rtb() ? 'Fly it: return to base.' : `Fly it: start from the ${start}.`,
          mode === 'watch' ? 'Captions follow each leg. Change the camera at the top right.'
            : `Stick on the arrows, throttle on Num+ and Num-. ${d.keys.gear} gear${d.nav && rtb() ? `, ${d.nav.keys.modeCycle.value} nav mode` : ''}.`);
        return;
      }
      if (over) { coach.set(`Overspeed: ${over} out above ${ktText(d.pattern.gearMaxKt.value, u)}.`, 'Slow down first, then configure.', 'warning'); return; }
      if (mode === 'watch') { const c = legCaption(demoLeg(s), d, u, s.nav, s.heading); coach.set(c.text, c.why); return; }
      const g = approachGeometry(s, d);
      if (g.onFinal && s.gearDown) {
        const cue = aoaCue(s, d);
        const glide = g.glideErrDeg > GLIDE_TOL_DEG ? 'High: push the marker below the line.' : g.glideErrDeg < -GLIDE_TOL_DEG ? 'Low: raise the marker above the line.' : 'On glide path: marker on the line.';
        const spd = cue === 'on' ? 'On speed.' : cue === 'slow' ? 'Slow: add power.' : 'Fast: reduce power.';
        coach.set(`${glide} ${spd}`, `Lineup ${g.lineupErrDeg > 0 ? 'right' : 'left'} ${Math.abs(g.lineupErrDeg).toFixed(1)}°.`, Math.abs(g.glideErrDeg) > GLIDE_TOL_DEG || cue !== 'on' ? 'caution' : 'ok');
        return;
      }
      const order = stepOrder(rtb() && navOk);
      const cur = currentStep(new Set(order.filter(id => steps_.isDone(id))), order);
      if (s.nav && s.phase === 'air' && (cur === 'navmode' || cur === 'steer' || cur === 'glidepath')) {
        const pic = navPicture(s.nav, s.heading, u);
        const turn = Math.abs(pic.steerErrDeg) < 3 ? 'On the steering' : `Turn ${pic.steerErrDeg > 0 ? 'right' : 'left'} ${Math.round(Math.abs(pic.steerErrDeg))}°`;
        const stp = stepsDef.find(x => x.id === cur);
        coach.set(`${pic.mode} to ${pic.point}, ${pic.dist}. ${turn}${pic.cmdAlt ? `, ${pic.cmdAlt}` : ''}.`, stp ? stp.text + '.' : '');
        return;
      }
      const stp = stepsDef.find(x => x.id === cur);
      coach.set(stp ? stp.text + '.' : 'Stop on the runway.', 'The checklist ticks as you pass each gate.');
    }

    // ---------------------------------------------------------------- debrief
    function finish(sco: ApproachScore): void {
      finished = true; score = sco;
      startBtn.setLabel(mode === 'watch' ? 'Watch again' : 'Fly again');
      startBtn.setDisabled(false);
      const pct = (v: number | null) => (v === null ? 'n/a' : `${Math.round(v * 100)} %`);
      const deg = (v: number | null) => (v === null ? 'n/a' : `${v.toFixed(2)}°`);
      const zone = sco.touchdownInZone === null ? 'n/a' : sco.touchdownInZone ? 'In the zone' : 'Outside the zone';
      debriefBody.replaceChildren(
        h('div', { class: 'fo-score' },
          h('span', { class: 'fo-score__n' }, String(sco.total ?? 0)), h('span', { class: 'fo-score__of' }, '/ 100'),
          h('p', { class: 'fo-score__verdict' }, sco.verdict ?? '')),
        h('ol', { class: 'fo-gates' }, sco.gates.map(g => h('li', { class: g.ok ? 'is-ok' : 'is-miss' },
          h('span', { class: 'fo-gates__mark', 'aria-label': g.ok ? 'passed' : 'missed' }, g.ok ? 'OK' : 'MISS'),
          h('span', { class: 'fo-gates__label' }, g.label),
          h('span', { class: 'fo-gates__notes' }, g.notes.join(' · '))))),
        h('dl', { class: 'fo-numbers' },
          h('dt', null, 'Glide path RMS'), h('dd', null, deg(sco.glideRmsDeg)),
          h('dt', null, 'Lineup RMS'), h('dd', null, deg(sco.lineupRmsDeg)),
          h('dt', null, 'On speed'), h('dd', null, pct(sco.onSpeedFraction)),
          h('dt', null, 'Touchdown'), h('dd', null, zone)),
        h('p', { class: 'fo-debrief__foot' }, mode === 'fly'
          ? (lessonPassed(sco.total) ? `Lesson complete for the ${spec.short}.` : `Score ${PASS_SCORE} or more in Fly mode to complete the lesson.`)
          : 'Demo flight. Switch to Fly to be graded.'),
      );
      debriefPanel.el.hidden = false;
      if (mode === 'fly' && lessonPassed(sco.total)) ctx.app.setProgress(`flight-ops:${ac}:done`, true);
      gatesSeen = -1;
      refresh(true);
    }

    // ---------------------------------------------------------------- keys and actions
    const flying = () => started && !paused && !finished && mode === 'fly';
    const hold = (k: keyof typeof held) => ({ down: () => { held[k] = true; }, up: () => { held[k] = false; } });
    function act(fn: () => void): () => void { return () => { if (flying()) { fn(); refresh(true); } }; }
    function cycleFlaps(): void {
      if (s.flapIndex < d.flapLabels.length - 1) applyAction(s, 'flapsDown', d);
      else while (s.flapIndex > 0) { const before = s.flapIndex; applyAction(s, 'flapsUp', d); if (s.flapIndex === before) break; }
    }
    /** Gear; on a jet without a flap selector the data's landing flap follows the gear (grading stand-in). */
    function gearAct(): void {
      applyAction(s, 'gearToggle', d);
      if (fc !== 'none') return;
      for (let i = 0; i < d.flapLabels.length; i++) applyAction(s, s.gearDown ? 'flapsDown' : 'flapsUp', d);
    }
    const keymap: Parameters<typeof bindKeys>[0] = {
      'Up / W': hold('up'), 'Down / S': hold('down'), 'Left / A': hold('left'), 'Right / D': hold('right'),
      'Num+ / =': hold('thrUp'), 'Num- / -': hold('thrDn'),
      [d.keys.gear]: act(gearAct),
      [d.keys.speedbrake]: act(() => applyAction(s, 'speedbrakeToggle', d)),
      'Space': () => { if (!started || finished) go(); else togglePause(); },
      'P': () => togglePause(),
      'R': () => reset(true),
      'C': () => setCam(CAMS[(CAMS.indexOf(cam) + 1) % CAMS.length]!),
    };
    if (fc === 'selector' && /^[A-Z]$/.test(d.keys.flaps)) keymap[d.keys.flaps] = act(cycleFlaps);
    if (d.nav) {
      const mk = d.nav.keys.modeCycle.value, pk = d.nav.keys.pointCycle?.value;
      if (parseChord(mk)) keymap[mk] = act(() => applyAction(s, 'navModeCycle', d));
      if (pk && parseChord(pk)) keymap[pk] = act(() => applyAction(s, 'navPointCycle', d));
    }
    bag.add(bindKeys(keymap));
    bag.on(window, 'blur', () => { for (const k of Object.keys(held) as (keyof typeof held)[]) held[k] = false; });
    bag.add(ctx.app.subscribe((_, what) => {
      if (what !== 'units') return;
      renderNumbers(); rebuildSteps(); refresh(true);
    }));

    // ---------------------------------------------------------------- go
    reset(false);
    setCam(cam);
    const shot = ctx.params.get('shot') as Shot | null;
    if (shot && (SHOTS as readonly string[]).includes(shot)) preroll(shot);

    /** Screenshot helper: run the demo to a state; with ?mode=fly, hand over to the player afterwards. */
    function preroll(which: Shot): void {
      const wantFly = ctx.params.get('mode') === 'fly';
      const navShot = (which === 'rtb' || which === 'ils') && navOk;
      mode = 'watch'; modeSeg.set('watch');
      start = navShot ? 'rtb' : 'initial'; startSeg.set(start);
      rebuildSteps();
      reset(true);
      const t0 = s.t;
      const doneAt = (): boolean => {
        if (which === 'rtb') return s.t - t0 > 4 || !navShot;
        if (which === 'ils') return !navShot || (s.nav?.mode === 'landing' && approachGeometry(s, d).rangeM < 6000);
        if (which === 'final') { const g = approachGeometry(s, d); return demoLeg(s) === 'final' && g.rangeM < 1852; }
        if (which === 'downwind') return ev.score().gates.some(g => g.id === 'abeam') || (demoLeg(s) === 'downwind' && s.pos.z > -aimPointM(d) - 400 && s.gearDown);
        return finished && s.phase === 'stopped';
      };
      for (let i = 0; i < 60 * 600 && !doneAt(); i++) tick();
      if (wantFly && !finished) {
        mode = 'fly'; modeSeg.set('fly');
        input.throttle = s.throttle; input.pitch = 0; input.roll = 0;
        startBtn.setLabel('Fly');
        syncTouch();
      }
      sc?.update(s);
      refresh(true);
    }
  }

  return {
    mount(ctx) {
      try { mount(ctx); } catch (e) { console.error(e); ctx.root.append(h('p', { class: 'page-error' }, 'The pattern page failed to start: ' + String(e))); }
    },
    unmount() {
      bag.dispose();
    },
  };
};
export default factory;
