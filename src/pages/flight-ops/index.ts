/**
 * [OWNER: page-flight-ops] Pattern and landing (#/flight-ops, issue #19). The overhead break, downwind,
 * final turn and groove for the F/A-18C, F-16C and F-15C: Watch the demo pilot fly it, or Fly it with the
 * keyboard, then read the graded debrief. Arcade model and grading live in src/sim/flightOps; the 3D scene in
 * src/render/flightOps; facts in src/data/flightOps.ts. Other jets get a panel to switch jet.
 *
 * URL params: ?ac=<id> (select a jet once), ?mode=watch|fly, ?start=initial|downwind|final,
 * ?shot=final|downwind|debrief (pre-roll the demo for screenshots), ?cam=chase|side|tower|cockpit.
 */
import './style.css';
import type { Page, PageFactory, PageContext } from '../../app/page';
import type { AircraftId } from '../../data/types';
import { AIRCRAFT } from '../../data/aircraft';
import { FLIGHT_OPS, FLIGHT_OPS_CAVEATS } from '../../data/flightOps';
import {
  ApproachEvaluator, FLIGHT_OPS_DT, aimPointM, aoaCue, applyAction, approachGeometry, configWarnings, createFlightOpsState,
  demoLeg, demoPilot, stepFlightOps, type ApproachScore, type FlightOpsInput, type FlightOpsJetId, type FlightOpsState,
  type Sourced,
} from '../../sim/flightOps';
import { FlightOpsScene, Stage, isWebGLAvailable, type FlightOpsCamera } from '../../render';
import {
  h, cleanup, labLayout, consolePanel, screenBezel, segmented, button, coachBox, checklist, readouts, callout, placard, lamp,
  bindKeys, keyHint, disclosure, setText,
} from '../../ui';
import { HudDisplay, IndexerDisplay, TraceDisplay, type TracePoint } from './displays';
import { lessonSteps, legCaption } from './lesson';
import {
  FLIGHT_OPS_JETS, GLIDE_TOL_DEG, LINEUP_TOL_DEG, PASS_SCORE, STEP_ORDER, aoaText, currentStep, errLevel, ftOf, gateState,
  isFlightOpsJet, kt, lessonPassed, plannedGates, stepsDone,
} from './logic';

type Mode = 'watch' | 'fly';
type Start = 'initial' | 'downwind' | 'final';
const CAMS: readonly FlightOpsCamera[] = ['chase', 'side', 'tower', 'cockpit'];
const SHOTS = ['final', 'downwind', 'debrief'] as const;
type Shot = typeof SHOTS[number];
const TRAIL_EVERY = 6;          // steps between trail points (0.1 s)
const TRACK_MAX = 6000;

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

  // ------------------------------------------------------------------ other jets
  function unsupported(ctx: PageContext, ac: AircraftId): void {
    ctx.root.append(h('div', { class: 'fo-unsupported' },
      consolePanel({
        id: 'fo-unsupported', title: 'Pattern & landing',
        children: [
          h('p', { class: 'fo-unsupported__lead' }, 'Pattern & landing covers the F/A-18C, F-16C and F-15C first.'),
          h('p', null, `The ${AIRCRAFT[ac].short} pattern numbers are not in the trainer yet. Pick one of these jets to fly the overhead break and the approach.`),
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
    const gatesPlan = plannedGates(d);
    const reduced = Stage.prefersReducedMotion();

    let mode: Mode = ctx.params.get('mode') === 'fly' ? 'fly' : 'watch';
    const startParam = ctx.params.get('start');
    let start: Start = startParam === 'downwind' || startParam === 'final' ? startParam : 'initial';
    const camParam = ctx.params.get('cam') as FlightOpsCamera | null;
    let cam: FlightOpsCamera = camParam && CAMS.includes(camParam) ? camParam : 'chase';

    let s!: FlightOpsState;
    let ev!: ApproachEvaluator;
    let started = false, paused = false, finished = false, configured = false;
    let acc = 0, steps = 0, onSpeedRun = 0, uiClock = 0, gatesSeen = -1;
    let track: TracePoint[] = [];
    let score: ApproachScore | null = null;
    const input: FlightOpsInput = { pitch: 0, roll: 0, throttle: 0.6 };
    const held = { up: false, down: false, left: false, right: false, thrUp: false, thrDn: false };

    // ---------------------------------------------------------------- displays (strip)
    const viewport = h('div', { class: 'fo-viewport' });
    const hudCanvas = h('canvas', { class: 'fo-canvas' });
    const idxCanvas = h('canvas', { class: 'fo-canvas' });
    const traceCanvas = h('canvas', { class: 'fo-canvas' });
    const hudBezel = screenBezel({ id: 'fo-hud', label: 'HUD', aspect: '4 / 3', content: hudCanvas, status: d.id === 'f15c' ? 'ILSN' : 'simplified', class: 'fo-hud' });
    const idxBezel = screenBezel({ id: 'fo-idx', label: 'AoA indexer', aspect: '1 / 2', content: idxCanvas, status: 'gear dn', class: 'fo-idx' });
    const traceBezel = screenBezel({ id: 'fo-trace', label: 'Pattern', aspect: '1', content: traceCanvas, class: 'fo-trace' });

    const lampGear = lamp({ label: 'GEAR', tone: 'ok', title: 'Gear down and locked (flashes in transit)' });
    const lampFlaps = lamp({ label: d.flapsWithGear ? 'FLAPS (GEAR)' : 'FLAPS', tone: 'ok', title: 'Landing flaps set' });
    const lampBrake = lamp({ label: 'SPD BRK', tone: 'caution', title: 'Speed brake out' });
    const lampOver = lamp({ label: 'OVERSPEED', tone: 'warning', title: `Gear or landing flaps above ${d.pattern.gearMaxKt.value} kt` });
    const cfgRO = readouts({ id: 'fo-cfg', rows: [{ id: 'flap', label: 'Flaps' }, { id: 'thr', label: 'Throttle' }, { id: 'aoa', label: 'AoA' }] });
    const cfgBlock = h('div', { class: 'ui-strip-block fo-cfg' },
      placard('Configuration'),
      h('div', { class: 'fo-lamps' }, lampGear.el, lampFlaps.el, lampBrake.el, lampOver.el),
      cfgRO.el);

    // ---------------------------------------------------------------- console: lesson
    const coach = coachBox({ id: 'fo-coach' });
    const stepsDef = lessonSteps(d);
    const steps_ = checklist({ id: 'fo-steps', steps: stepsDef.map(st => ({ id: st.id, text: st.text, keys: st.keys, note: st.note })) });
    const modeSeg = segmented<Mode>({
      id: 'fo-mode', label: 'Mode', value: mode, fill: true,
      options: [{ value: 'watch', label: 'Watch', title: 'The demo pilot flies the pattern' }, { value: 'fly', label: 'Fly', title: 'You fly it with the keyboard' }],
      onChange: v => { mode = v; reset(false); },
    });
    const startSeg = segmented<Start>({
      id: 'fo-start', label: 'Start', value: start, fill: true,
      options: [{ value: 'initial', label: 'Initial' }, { value: 'downwind', label: 'Downwind' }, { value: 'final', label: 'Final' }],
      onChange: v => { start = v; reset(false); },
    });
    const startBtn = button({ id: 'fo-go', label: 'Start', variant: 'primary', keys: 'Space', block: true, onClick: () => go() });
    const lessonPanel = consolePanel({
      id: 'fo-lesson', title: `Pattern & landing · ${spec.short}`,
      children: [coach.el, modeSeg.el, startSeg.el, startBtn.el, steps_.el],
    });

    // ---------------------------------------------------------------- console: debrief
    const debriefBody = h('div', { class: 'fo-debrief' });
    const debriefPanel = consolePanel({ id: 'fo-debrief-panel', title: 'Debrief', children: [debriefBody] });
    debriefPanel.el.hidden = true;

    // ---------------------------------------------------------------- console: numbers, keys, notes
    const p = d.pattern;
    const unitA = d.aoa.unit === 'deg' ? '°' : ' units';
    const numRows: [string, string, Sourced<unknown>][] = [
      ['Initial', `${p.initialAltFt.value} ft, ${p.initialKt.value} kt`, p.initialKt.verified ? p.initialAltFt : p.initialKt],
      ['Break', `${p.breakG.value} g`, p.breakG],
      ['Downwind', `${p.downwindAltFt.value} ft`, p.downwindAltFt],
      ['Abeam', `${p.abeamNm.value} nm`, p.abeamNm],
      ['Gear limit', `${p.gearMaxKt.value} kt`, p.gearMaxKt],
      ['On-speed AoA', `${d.aoa.onSpeed.value}${unitA} (${d.aoa.band.value[0]}–${d.aoa.band.value[1]})`, d.aoa.band],
      ['Approach speed', `${d.approachKt.value} kt`, d.approachKt],
      ['Glide path', `${d.glideDeg.value}°`, d.glideDeg],
      ['Aim point', `${d.aimPointFt.value} ft past the threshold`, d.aimPointFt],
    ];
    const numbers = h('dl', { class: 'fo-numbers' }, numRows.flatMap(([k, v, src]) => [
      h('dt', null, k), h('dd', { title: src.note ?? src.source }, v, nvTag(src)),
    ]));
    const keyList = h('div', { class: 'fo-keys' },
      keyHint({ label: 'Pitch (stick)', keys: 'Up / Down' }),
      keyHint({ label: 'Roll (stick)', keys: 'Left / Right' }),
      keyHint({ label: 'Throttle up / down', keys: 'Num+ / = , Num- / -' }),
      keyHint({ label: 'Gear', keys: d.keys.gear, note: 'not verified' }),
      d.flapsWithGear ? keyHint({ label: 'Flaps', keys: 'follow the gear' }) : keyHint({ label: 'Flaps (cycle)', keys: d.keys.flaps, note: 'not verified' }),
      keyHint({ label: 'Speed brake', keys: d.keys.speedbrake, note: 'not verified' }),
      keyHint({ label: 'Pause / restart / camera', keys: 'P / R / C' }));
    const notes = h('div', { class: 'fo-notes' },
      callout({ kind: 'simplified', body: 'Arcade flight model tuned to the manual numbers. The HUD is simplified: no wind, no sideslip, one AoA cue per jet. Stick and throttle keys are trainer keys, not DCS defaults.' }),
      h('ul', null, FLIGHT_OPS_CAVEATS.map(c => h('li', null, c))));

    // ---------------------------------------------------------------- viewport overlays
    const pill = h('div', { class: 'fo-pill', role: 'status' });
    const camSeg = segmented<FlightOpsCamera>({
      id: 'fo-cam', ariaLabel: 'Camera', value: cam, size: 's',
      options: [{ value: 'chase', label: 'Chase' }, { value: 'side', label: 'Side' }, { value: 'tower', label: 'Tower' }, { value: 'cockpit', label: 'Cockpit' }],
      onChange: v => setCam(v),
    });
    const pauseBtn = button({ id: 'fo-pause', label: 'Pause', size: 's', keys: 'P', onClick: () => togglePause() });
    const restartBtn = button({ id: 'fo-restart', label: 'Restart', size: 's', keys: 'R', onClick: () => reset(true) });

    const layout = labLayout({
      id: 'fo-lab', class: 'fo-lab',
      header: { title: 'Pattern & landing', meta: `${spec.short} · ${d.glideDeg.value}° glide path · ${d.hudCue}`, lede: 'Break, configure, fly the AoA, land in the zone.' },
      viewport,
      strip: [hudBezel.el, idxBezel.el, traceBezel.el, cfgBlock],
      console: [debriefPanel.el, lessonPanel.el,
        consolePanel({ id: 'fo-numbers-panel', title: `${spec.short} numbers`, children: [numbers] }).el,
        disclosure({ title: 'Keys', content: keyList, open: mode === 'fly' }),
        disclosure({ title: 'Accuracy notes', content: notes })],
    });
    layout.overlay('tl', pill);
    layout.overlay('tr', camSeg.el);
    layout.overlay('bl', pauseBtn.el, restartBtn.el);
    ctx.root.append(h('div', { class: 'fo-page' }, layout.el));

    const hud = new HudDisplay(hudCanvas, d);
    const indexer = new IndexerDisplay(idxCanvas, d);
    const trace = new TraceDisplay(traceCanvas, gatesPlan);
    bag.add(() => { hud.dispose(); indexer.dispose(); trace.dispose(); });

    // ---------------------------------------------------------------- 3D
    let stage: Stage | null = null;
    let scene: FlightOpsScene | null = null;
    if (isWebGLAvailable()) {
      try {
        stage = new Stage(viewport, { autoStart: !reduced, autoPause: 'render', environment: { surface: 'land', grid: false }, ariaLabel: '3D view of the airfield pattern' });
        scene = new FlightOpsScene(stage, ac, {
          camera: cam, glideDeg: d.glideDeg.value, aimPointM: aimPointM(d), vTolDeg: GLIDE_TOL_DEG, hTolDeg: LINEUP_TOL_DEG,
        });
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
      ev = new ApproachEvaluator(d);
      track = []; score = null; finished = false; configured = false; onSpeedRun = 0; acc = 0; steps = 0; gatesSeen = -1;
      input.pitch = 0; input.roll = 0; input.throttle = s.throttle;
      paused = false; started = autostart;
      sc?.overlay.clearTrail();
      steps_.reset();
      debriefPanel.el.hidden = true;
      pauseBtn.setLabel('Pause');
      startBtn.setLabel(mode === 'watch' ? 'Watch the demo' : 'Fly');
      startBtn.setDisabled(autostart);
      syncGates();
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
      const tp = (held.down ? 1 : 0) - (held.up ? 1 : 0);
      const tr = (held.right ? 1 : 0) - (held.left ? 1 : 0);
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
      if (steps % TRAIL_EVERY === 0 && (s.phase === 'air' || s.phase === 'rollout')) {
        const lvl = errLevel(approachGeometry(s, d), s, cue);
        sc?.overlay.pushTrail(s.pos, lvl);
        if (track.length < TRACK_MAX) track.push({ x: s.pos.x, z: s.pos.z, level: lvl });
      }
      if (!finished && s.phase !== 'air') {
        const sco = ev.score();
        if (sco.total !== null) finish(sco);
      }
    }

    function syncGates(): void {
      const results = ev.score().gates;
      if (results.length === gatesSeen) return;
      gatesSeen = results.length;
      sc?.overlay.setGates(gatesPlan.map(g => ({ id: g.id, pos: g.pos, radiusM: g.radiusM, headingRad: g.headingRad, state: gateState(g.id, results) })));
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
      const results = score?.gates ?? ev.score().gates;
      trace.draw(s, track, results);

      const warn = configWarnings(s, d);
      lampGear.set(s.gearDown ? (s.gearPos > 0.99 ? 'on' : 'flash') : s.gearPos > 0.01 ? 'flash' : 'off');
      const flapsSet = s.flapIndex >= d.landingFlap;
      lampFlaps.set(flapsSet ? (s.flapPos > 0.97 || d.flapsWithGear ? 'on' : 'flash') : 'off');
      lampBrake.set(s.speedbrakeOut);
      lampOver.set(warn.overspeed ? 'flash' : 'off');
      cfgRO.set('flap', d.flapsWithGear ? (s.flapPos > 0.5 ? 'DOWN (gear)' : 'UP') : (d.flapLabels[s.flapIndex] ?? ''));
      cfgRO.set('thr', `${Math.round(s.throttle * 100)} %`);
      cfgRO.set('aoa', aoaText(d, s.aoa));

      const done = stepsDone({ gates: results, configured, onSpeedRunS: onSpeedRun });
      for (const id of STEP_ORDER) if (done.has(id) && !steps_.isDone(id)) steps_.setDone(id, true);
      steps_.setCurrent(currentStep(new Set(STEP_ORDER.filter(id => steps_.isDone(id)))));

      setText(pill, !started ? (mode === 'watch' ? 'Demo ready' : 'Ready') : paused ? 'Paused'
        : s.phase === 'crashed' ? 'Crashed' : s.phase === 'stopped' ? 'Stopped' : `${kt(s.speed)} kt · ${Math.max(0, ftOf(s.pos.y))} ft`);
      coachLine(warn.overspeed);
    }

    function coachLine(over: 'gear' | 'flaps' | null): void {
      if (finished && score) { coach.set(`${score.total} / 100. ${score.verdict ?? ''}`, 'Read the gates below, then fly it again.', lessonPassed(score.total) ? 'ok' : 'caution'); return; }
      if (!started) {
        coach.set(mode === 'watch' ? 'Watch the demo fly the overhead pattern.' : `Fly it: start from the ${start}.`,
          mode === 'watch' ? 'Captions follow each leg. Change the camera at the top right.' : `Stick on the arrows, throttle on Num+ and Num-. ${d.keys.gear} gear.`);
        return;
      }
      if (over) { coach.set(`Overspeed: ${over} out above ${d.pattern.gearMaxKt.value} kt.`, 'Slow down first, then configure.', 'warning'); return; }
      if (mode === 'watch') { const c = legCaption(demoLeg(s), d); coach.set(c.text, c.why); return; }
      const g = approachGeometry(s, d);
      if (g.onFinal) {
        const cue = aoaCue(s, d);
        const glide = g.glideErrDeg > GLIDE_TOL_DEG ? 'High: push the marker below the line.' : g.glideErrDeg < -GLIDE_TOL_DEG ? 'Low: raise the marker above the line.' : 'On glide path: marker on the line.';
        const spd = cue === 'on' ? 'On speed.' : cue === 'slow' ? 'Slow: add power.' : 'Fast: reduce power.';
        coach.set(`${glide} ${spd}`, `Lineup ${g.lineupErrDeg > 0 ? 'right' : 'left'} ${Math.abs(g.lineupErrDeg).toFixed(1)}°.`, Math.abs(g.glideErrDeg) > GLIDE_TOL_DEG || cue !== 'on' ? 'caution' : 'ok');
        return;
      }
      const cur = currentStep(new Set(STEP_ORDER.filter(id => steps_.isDone(id))));
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
      refresh(true);
    }

    // ---------------------------------------------------------------- keys
    const flying = () => started && !paused && !finished && mode === 'fly';
    const hold = (k: keyof typeof held) => ({ down: () => { held[k] = true; }, up: () => { held[k] = false; } });
    const act = (fn: () => void) => () => { if (flying()) { fn(); refresh(true); } };
    const cycleFlaps = () => {
      if (s.flapIndex < d.flapLabels.length - 1) applyAction(s, 'flapsDown', d);
      else while (s.flapIndex > 0) { const before = s.flapIndex; applyAction(s, 'flapsUp', d); if (s.flapIndex === before) break; }
    };
    const keymap: Parameters<typeof bindKeys>[0] = {
      'Up / W': hold('up'), 'Down / S': hold('down'), 'Left / A': hold('left'), 'Right / D': hold('right'),
      'Num+ / =': hold('thrUp'), 'Num- / -': hold('thrDn'),
      [d.keys.gear]: act(() => applyAction(s, 'gearToggle', d)),
      [d.keys.speedbrake]: act(() => applyAction(s, 'speedbrakeToggle', d)),
      'Space': () => { if (!started || finished) go(); else togglePause(); },
      'P': () => togglePause(),
      'R': () => reset(true),
      'C': () => setCam(CAMS[(CAMS.indexOf(cam) + 1) % CAMS.length]!),
    };
    if (!d.flapsWithGear && /^[A-Z]$/.test(d.keys.flaps)) keymap[d.keys.flaps] = act(cycleFlaps);
    bag.add(bindKeys(keymap));
    bag.on(window, 'blur', () => { for (const k of Object.keys(held) as (keyof typeof held)[]) held[k] = false; });

    // ---------------------------------------------------------------- go
    reset(false);
    setCam(cam);
    const shot = ctx.params.get('shot') as Shot | null;
    if (shot && (SHOTS as readonly string[]).includes(shot)) preroll(shot);

    /** Screenshot helper: run the demo to a state. */
    function preroll(which: Shot): void {
      mode = 'watch'; modeSeg.set('watch');
      start = 'initial'; startSeg.set('initial');
      reset(true);
      const doneAt = (): boolean => {
        if (which === 'final') { const g = approachGeometry(s, d); return demoLeg(s) === 'final' && g.rangeM < 1852; }
        if (which === 'downwind') return ev.score().gates.some(g => g.id === 'abeam') || (demoLeg(s) === 'downwind' && s.pos.z > -aimPointM(d) - 400 && s.gearDown);
        return finished && s.phase === 'stopped';
      };
      for (let i = 0; i < 60 * 400 && !doneAt(); i++) tick();
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
