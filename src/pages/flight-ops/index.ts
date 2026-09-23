/**
 * [OWNER: page-flight-ops] Pattern and landing (#/flight-ops, issues #19, #22 and #24). The runway
 * takeoff, the overhead break, downwind, final turn and groove for all ten jets, and the return to base with the FC3 nav modes (МРШ / ВЗВ / ПОС,
 * NAV / ILSN) for the jets with nav data: Watch the demo pilot fly it, or Fly it with the keyboard or the
 * on-screen controls, then read the graded debrief. Arcade model, nav and grading live in src/sim/flightOps;
 * the 3D scene in src/render/flightOps; facts in src/data/flightOps.ts.
 *
 * Carrier Case I (#26) for the jets that go to the boat (F/A-18C, F-14B on the CVN, Su-33 on the Kuznetsov):
 * starts Case I and In the groove, hook and ball-call keys, the landing aid close-up, the LSO call log and the
 * graded pass (grade, comments, wire).
 *
 * Deck launch (#27): Catapult (F/A-18C, F-14B, CVN cat 1 or 2) and Ski-jump (Su-33, Kuznetsov position 1 or 3) with a
 * station picker and a Heavy toggle, the launch sequence strip (keys, not-verified tags, the step to do now), the
 * Hornet trim-by-weight readout, the power the launch needs, the deck warnings and the graded launch debrief.
 *
 * URL params: ?ac=<id> (select a jet once), ?mode=watch|fly,
 * ?start=initial|downwind|final|rtb|takeoff|caseI|carrierGroove|catapult|skiJump, ?station=<n>, ?heavy=1,
 * ?shot=final|downwind|debrief|rtb|ils|takeoff-ready|takeoff-rotate|takeoff-climb|takeoff-debrief|case1-break|groove|trap
 * |launch-hold|launch-stroke|launch-climb|launch-debrief (pre-roll the demo for screenshots; mode=fly hands over after
 * the pre-roll; debrief with start=caseI is the carrier debrief), ?cam=chase|side|tower|lso|cockpit|deck,
 * ?touch=1 (show the on-screen controls on a fine pointer).
 */
import './style.css';
import type { Page, PageFactory, PageContext } from '../../app/page';
import type { AircraftId } from '../../data/types';
import { AIRCRAFT } from '../../data/aircraft';
import { FLIGHT_OPS, FLIGHT_OPS_CAVEATS } from '../../data/flightOps';
import {
  ApproachEvaluator, FLIGHT_OPS_DT, aimPointM, aoaCue, applyAction, approachGeometry, configWarnings, createFlightOpsState,
  TakeoffEvaluator, demoLeg, demoPilot, hasNavStart, initNav, rotateAtKt, stepFlightOps, takeoffFlapIndex, type ApproachScore, type TakeoffScore, type FlightOpsInput, type FlightOpsJetId,
  type FlightOpsState, type GateResult, type Sourced,
  CarrierEvaluator, carrierGeometry, landingToWorld, type CarrierScore,
  LaunchEvaluator, launchPowerNeed, launchStrip, type FlightOpsAction, type LaunchScore,
} from '../../sim/flightOps';
import { SHIPS } from '../../data/ships';
import { FlightOpsScene, Stage, isWebGLAvailable, type FlightOpsCamera } from '../../render';
import {
  h, cleanup, labLayout, consolePanel, screenBezel, segmented, button, coachBox, checklist, readouts, callout, placard, lamp,
  bindKeys, keyHint, disclosure, setText, toggle, parseChord, type ChecklistHandle,
} from '../../ui';
import { BallDisplay, HudDisplay, IndexerDisplay, NavDisplay, TraceDisplay, type TracePoint } from './displays';
import { carrierCaption, lessonSteps, legCaption } from './lesson';
import {
  FLIGHT_OPS_JETS, GLIDE_TOL_DEG, LINEUP_TOL_DEG, PASS_SCORE, altFtText, altVal, aoaText, currentStep, errLevel, flapControl,
  gatesForStart, isFlightOpsJet, kt, ktText, lessonPassed, navMilestones, navPicture, placeGates, plannedGates, spdUnit, spdVal,
  stepOrder, stepsDone, altUnit, landingConfigured, overspeedTitle, progressKey, takeoffChecklist, takeoffItems, takeoffItemsNow,
  type FlownPoint, type LessonKind, type NavMilestones, type TakeoffItem,
  ballPicture, ballPrompt, carrierPlannedGates, pointAt, carrierStarts, gradeCard, toLandingOverlay, type CarrierStart,
} from './logic';
import { touchControls, type TouchAction } from './touch';
import {
  avoidKey, keyTag, launchCaption, launchCard, launchCurrent, launchKeys, launchLessonSteps, launchStarts, launchStepsDone, launchWarnings,
  powerText, stationLabel, touchLabel, trimReadout, type LaunchStart,
} from './launchLesson';

type Mode = 'watch' | 'fly';
type Start = 'initial' | 'downwind' | 'final' | 'rtb' | 'takeoff' | CarrierStart | LaunchStart;
const CAMS: readonly FlightOpsCamera[] = ['chase', 'side', 'tower', 'lso', 'cockpit', 'deck'];
const SHOTS = ['final', 'downwind', 'debrief', 'rtb', 'ils', 'takeoff-ready', 'takeoff-rotate', 'takeoff-climb', 'takeoff-debrief',
  'case1-break', 'groove', 'trap', 'launch-hold', 'launch-stroke', 'launch-climb', 'launch-debrief'] as const;
const LSO_LOG_MAX = 40;
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
    const cStarts = carrierStarts(d);
    const cd = d.carrier;
    const shipLights = cd ? SHIPS[cd.ship].lights : 'iflols';
    const lStarts = launchStarts(d);
    const ld = d.launch;
    let start: Start = startParam === 'downwind' || startParam === 'final' || startParam === 'takeoff' || (startParam === 'rtb' && navOk)
      || (cStarts as string[]).includes(startParam ?? '') || (lStarts as string[]).includes(startParam ?? '') ? startParam as Start : 'initial';
    const stParam = Number(ctx.params.get('station'));
    let station = ld && ld.stations.includes(stParam) ? stParam : ld?.stations[0] ?? 1;
    let heavy = ctx.params.get('heavy') === '1';
    const camParam = ctx.params.get('cam') as FlightOpsCamera | null;
    let cam: FlightOpsCamera = camParam && CAMS.includes(camParam) ? camParam : 'chase';
    let showTouch = ctx.params.get('touch') === '1';

    let s!: FlightOpsState;
    let ev!: ApproachEvaluator;
    let tev: TakeoffEvaluator | null = null;
    let toDone = new Set<TakeoffItem>();
    let started = false, paused = false, finished = false, configured = false;
    let acc = 0, steps = 0, onSpeedRun = 0, uiClock = 0, gatesSeen = -1;
    let track: TracePoint[] = [];
    let flown: FlownPoint[] = [];
    let navMs: NavMilestones = { steering: false, intercept: false, onGlideRunS: 0 };
    let hudStatus = '';
    let guidesOn = true;
    let navKey = '', lastCall: string | null = null, callAt = -1e9;
    let score: ApproachScore | null = null;
    let toScore: TakeoffScore | null = null;
    let cev: CarrierEvaluator | null = null;
    let cScore: CarrierScore | null = null;
    let flownL: FlownPoint[] = [];
    let lsoSeen = 0;
    let lev: LaunchEvaluator | null = null;
    let lScore: LaunchScore | null = null;
    let lStripKey = '';
    const input: FlightOpsInput = { pitch: 0, roll: 0, throttle: 0.6 };
    const held = { up: false, down: false, left: false, right: false, thrUp: false, thrDn: false, brakes: false };
    const rtb = () => start === 'rtb';
    const atSea = () => start === 'caseI' || start === 'carrierGroove';
    const atLaunch = () => start === 'catapult' || start === 'skiJump';
    const kind = (): LessonKind => (start === 'takeoff' ? 'takeoff' : start === 'caseI' ? 'carrier' : start === 'carrierGroove' ? 'groove'
      : atLaunch() ? 'launch'
      : rtb() && navOk ? 'rtb' : 'pattern');
    const toAb = d.takeoff.afterburner.value;
    const brakesKey = d.takeoff.keys.brakes.value;
    const thrMaxKey = d.takeoff.keys.throttleMax?.value ?? 'PgUp';

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
    const lampOver = lamp({ label: 'OVERSPEED', tone: 'warning', title: overspeedTitle(d, ktText(d.pattern.gearMaxKt.value, units())) });
    const cfgRO = readouts({ id: 'fo-cfg', rows: [{ id: 'flap', label: 'Flaps' }, { id: 'thr', label: 'Throttle' }, { id: 'aoa', label: 'AoA' }] });
    const flapRow = cfgRO.row('flap');
    if (flapRow) flapRow.hidden = fc === 'none';
    const cfgBlock = h('div', { class: 'ui-strip-block fo-cfg' },
      placard('Configuration'),
      h('div', { class: 'fo-lamps' }, lampGear.el, lampFlaps.el, lampBrake.el, lampOver.el),
      cfgRO.el);

    // Takeoff checklist strip: each item lights as the sim records it.
    const toLamps = new Map(takeoffItems(d).map(i => [i.id, lamp({ label: i.label, tone: 'ok' })] as const));
    const toBlock = h('div', { class: 'ui-strip-block fo-to', id: 'fo-to' },
      placard('Takeoff'), h('div', { class: 'fo-to__row' }, [...toLamps.values()].map(l => l.el)));

    // Deck launch strip (#27): the sequence with keys and tags, trim by weight, power, warnings.
    const lSeq = h('ol', { class: 'fo-launch__seq', 'aria-label': 'Launch sequence' });
    const lMeta = h('span', { class: 'fo-launch__meta' });
    const lRows = h('dl', { class: 'fo-launch__rows' });
    const lWarn = h('ul', { class: 'fo-launch__warn', 'aria-live': 'polite' });
    const launchBlock = h('div', { class: 'ui-strip-block fo-launch', id: 'fo-launch' },
      h('div', null, placard('Launch sequence'), ' ', lMeta), lSeq, lRows, lWarn);
    launchBlock.hidden = true;
    const keyOfStep = new Map(ld?.steps.map(x => [x.id, x.key] as const) ?? []);
    /** Strip redraw: only when a step, the trim, the power or a warning changed. */
    function syncLaunchStrip(force = false): void {
      if (!ld || !s.launch) return;
      const L = s.launch;
      const strip = launchStrip(s, d);
      const tr = trimReadout(ld, L.weight, L.trimDeg);
      const warns = launchWarnings(d, s);
      const key = [strip.map(x => x.state[0]).join(''), L.trimDeg, s.afterburner, s.throttle >= 0.95, L.specialAB, warns.join('|'), L.stage].join(';');
      if (!force && key === lStripKey) return;
      lStripKey = key;
      setText(lMeta, `${stationLabel(ld, L.station)} · ${L.weight} ${ld.weights.unit}${L.heavy ? ' (heavy)' : ''}`);
      lSeq.replaceChildren(...strip.map(x => {
        const k = keyOfStep.get(x.id);
        const stepNote = ld.steps.find(z => z.id === x.id)?.note ?? '';
        const tag = keyTag(k) ?? (/not verified/i.test(stepNote) ? 'not verified' : null);
        const kbdText = x.id === 'trim' ? 'T / LShift+T' : x.id === 'power' ? thrMaxKey : k?.value;
        return h('li', { class: `fo-lstep is-${x.state}`, 'aria-current': x.state === 'next' ? 'step' : undefined, title: k?.note ?? (stepNote || undefined) },
          x.label, kbdText ? h('kbd', null, kbdText) : null, tag ? h('span', { class: 'fo-nv', title: k?.note ?? stepNote }, tag) : null);
      }));
      const rows: HTMLElement[] = [];
      if (tr) {
        rows.push(h('dt', null, 'T/O trim'), h('dd', { class: tr.ok ? undefined : 'is-bad', title: tr.table },
          `${tr.nowDeg}° set, want ${tr.wantDeg}° for ${tr.weightText}`));
      }
      const powerNow = s.afterburner ? (L.specialAB ? 'special AB' : 'afterburner') : s.throttle >= 0.95 ? 'MIL' : `${Math.round(s.throttle * 100)} %`;
      rows.push(h('dt', null, 'Power'), h('dd', null, `${powerText(d, L.weight)}. Now ${powerNow}`, ld.power.verified ? null : h('span', { class: 'fo-nv', title: ld.power.note }, 'not verified')));
      if (ld.avoid) rows.push(h('dt', null, 'Avoid'), h('dd', { title: ld.avoid.fodScreens.note }, `FOD screens ${ld.avoid.fodScreens.value}: 12 % less thrust`));
      lRows.replaceChildren(...rows);
      lWarn.replaceChildren(...warns.map(w => h('li', null, w)));
    }

    // Header meta: the airfield glide path, or the ship's glide slope on the carrier starts.
    const headMetaText = h('span', null);
    const headNv = h('span', { class: 'fo-nv' }, 'not verified');
    const headMeta = h('span', null, headMetaText, headNv);
    function syncHead(): void {
      if (atLaunch() && ld) {
        setText(headMetaText, `${spec.short} · ${stationLabel(ld, station)} · ${SHIPS[ld.ship].name}`);
        headNv.hidden = true;
        return;
      }
      const g = atSea() && cd ? SHIPS[cd.ship].glideDeg : d.glideDeg;
      setText(headMetaText, atSea() && cd
        ? `${spec.short} · ${g.value}° glide slope · ${SHIPS[cd.ship].name}`
        : `${spec.short} · ${g.value}° glide path · ${d.hudCue}`);
      headNv.hidden = g.verified;
      headNv.title = g.note ?? g.source;
    }

    // Carrier: the landing aid close-up and the LSO call log (latest call large, the pass below it).
    const ballCanvas = h('canvas', { class: 'fo-canvas' });
    const ballBezel = screenBezel({
      id: 'fo-ball', label: shipLights === 'iflols' ? 'IFLOLS' : 'Luna-3', aspect: '1 / 2', content: ballCanvas, class: 'fo-ball',
    });
    const lsoLatest = h('p', { class: 'fo-lso__latest', 'aria-live': 'polite' }, '—');
    const lsoList = h('ol', { class: 'fo-lso__list' });
    const lsoBlock = consolePanel({
      id: 'fo-lso', title: cd && SHIPS[cd.ship].lso.value ? 'LSO calls' : 'LSO calls (not verified)',
      children: [h('div', { class: 'fo-lso' }, lsoLatest, lsoList)],
    }).el;

    // ---------------------------------------------------------------- console: lesson
    const coach = coachBox({ id: 'fo-coach' });
    const stepDefs = (): { id: string; text: string; keys?: string; note?: string }[] =>
      (atLaunch() ? launchLessonSteps(d, units(), station, heavy) : lessonSteps(d, units(), kind()));
    let stepsDef = stepDefs();
    let steps_: ChecklistHandle = checklist({ id: 'fo-steps', steps: stepsDef });
    const stepsBox = h('div', { class: 'fo-steps' }, steps_.el);
    function rebuildSteps(): void {
      stepsDef = stepDefs();
      steps_ = checklist({ id: 'fo-steps', steps: stepsDef });
      stepsBox.replaceChildren(steps_.el);
    }
    const modeSeg = segmented<Mode>({
      id: 'fo-mode', label: 'Mode', value: mode, fill: true,
      options: [{ value: 'watch', label: 'Watch', title: 'The demo pilot flies it' }, { value: 'fly', label: 'Fly', title: 'You fly it with the keyboard or the on-screen controls' }],
      onChange: v => { mode = v; reset(false); },
    });
    const startOpts: { value: Start; label: string; title?: string }[] = [
      { value: 'takeoff', label: 'Takeoff', title: 'Runway takeoff: brakes, power, rotate, gear and flaps up' },
      { value: 'initial', label: 'Initial' }, { value: 'downwind', label: 'Downwind' }, { value: 'final', label: 'Final' }];
    if (navOk) startOpts.push({ value: 'rtb', label: 'Return to base', title: `Nav home from 40 km out: ${navLabels.join(' → ')}` });
    if (cd) {
      const shipName = SHIPS[cd.ship].name;
      startOpts.push({ value: 'caseI', label: 'Case I', title: `Carrier Case I to the ${shipName}: initial, break, downwind, the 180, the ball, the trap` },
        { value: 'carrierGroove', label: 'In the groove', title: `¾ nm astern of the ${shipName}, configured, on the glide path` });
    }
    if (ld) {
      startOpts.push(ld.kind === 'catapult'
        ? { value: 'catapult', label: 'Catapult', title: `Catapult launch from the ${SHIPS[ld.ship].name}: ${ld.cue}` }
        : { value: 'skiJump', label: 'Ski-jump', title: `Ski-jump launch from the ${SHIPS[ld.ship].name}: ${ld.cue}` });
    }
    const startSeg = segmented<Start>({
      id: 'fo-start', label: 'Start', value: start, fill: true, options: startOpts,
      onChange: v => { start = v; rebuildSteps(); reset(false); },
    });
    // Launch options: the catapult or position, and the Heavy toggle (trainer weights).
    const stationSeg = segmented<string>({
      id: 'fo-station', label: ld?.kind === 'skiJump' ? 'Position' : 'Catapult', value: String(station), size: 's',
      options: (ld?.stations ?? []).map(n => ({ value: String(n), label: ld ? stationLabel(ld, n) : String(n) })),
      onChange: v => { station = Number(v); rebuildSteps(); reset(false); },
    });
    const heavyToggle = toggle({
      id: 'fo-heavy', label: ld ? `Heavy (${ld.weights.heavy} ${ld.weights.unit})` : 'Heavy', style: 'switch', size: 's', value: heavy,
      onChange: v => { heavy = v; rebuildSteps(); reset(false); },
    });
    const launchOpts = h('div', { class: 'fo-launch-opts' }, stationSeg.el, heavyToggle.el);
    launchOpts.hidden = true;
    const startBtn = button({ id: 'fo-go', label: 'Start', variant: 'primary', keys: 'Space', block: true, onClick: () => go() });
    const touchToggle = toggle({
      id: 'fo-touch-toggle', label: 'Show on-screen controls', style: 'switch', size: 's', value: showTouch,
      onChange: v => { showTouch = v; syncTouch(); },
    });
    const lessonPanel = consolePanel({
      id: 'fo-lesson', title: `Pattern & landing · ${spec.short}`,
      children: [coach.el, modeSeg.el, startSeg.el, launchOpts, startBtn.el, touchToggle.el, stepsBox],
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
      const to = d.takeoff;
      const at = rotateAtKt(d);
      rows.push(['Vr', at !== to.vrKt.value ? `${ktText(to.vrKt.value, u)}, pull at ${ktText(at, u)}` : ktText(to.vrKt.value, u), to.vrKt]);
      rows.push(['Takeoff pitch', `${to.pitchDeg.value[0]}–${to.pitchDeg.value[1]}°, tail strike ${to.tailStrikeDeg.value}°`, to.pitchDeg.verified ? to.tailStrikeDeg : to.pitchDeg]);
      rows.push(['Gear up before', ktText(to.gearUpMaxKt.value, u), to.gearUpMaxKt]);
      rows.push(['Takeoff power', to.afterburner.value ? 'Full afterburner' : 'MIL', to.afterburner]);
      if (fc === 'selector') rows.push(['Takeoff flaps', d.flapLabels[takeoffFlapIndex(d)] ?? '', { value: 0, source: to.pitchDeg.source, verified: true }]);
      if (d.nav) {
        const n = d.nav;
        rows.push(['Nav modes', `${navLabels.join(' → ')} on ${n.keys.modeCycle.value}`, n.keys.modeCycle]);
        rows.push(['Intercept', `${u === 'metric' ? `${n.interceptPointM.value / 1000} km` : `${(n.interceptPointM.value / 1852).toFixed(1)} nm`} out, ${u === 'metric' ? `${n.interceptAltM.value} m` : `${Math.round(n.interceptAltM.value / 0.3048 / 10) * 10} ft`}`, n.interceptPointM]);
        rows.push(['Landing mode', n.autoLandingSwitch.value ? 'Automatic at the intercept point' : `Pilot selects ${navLabels[navLabels.length - 1]}`, n.autoLandingSwitch]);
      }
      if (cd) {
        const cp = cd.pattern, ship = SHIPS[cd.ship];
        rows.push(['Ship', `${ship.name}, ${ship.speedKt.value} kt on the BRC`, ship.speedKt]);
        rows.push(['Case I initial', `${altFtText(cp.initialAltFt.value, u)}, ${ktText(cp.initialKt.value, u)}`, cp.initialKt.verified ? cp.initialAltFt : cp.initialKt]);
        rows.push(['Break interval', `${cp.breakIntervalS.value[0]}–${cp.breakIntervalS.value[1]} s, before 4 nm`, cp.breakIntervalS]);
        rows.push(['Carrier downwind', `${altFtText(cp.downwindAltFt.value, u)}, ${cp.abeamNm.value[0]}–${cp.abeamNm.value[1]} nm abeam`, cp.abeamNm.verified ? cp.downwindAltFt : cp.abeamNm]);
        rows.push(['The 90', `${altFtText(cp.ninetyAltFt.value[0], u)}–${altFtText(cp.ninetyAltFt.value[1], u)}`, cp.ninetyAltFt]);
        rows.push(['Ball call', `${cp.ballNm.value} nm, ${cp.grooveS.value[0]}–${cp.grooveS.value[1]} s groove`, cp.ballNm.verified ? cp.grooveS : cp.ballNm]);
        rows.push(['Gear, flaps, hook', `below ${ktText(cp.gearFlapsMaxKt.value, u)}`, cp.gearFlapsMaxKt]);
        rows.push(['Carrier glide slope', `${ship.glideDeg.value}°, ${ship.wires.value} wires, target ${Math.min(3, ship.wires.value)}`, ship.glideDeg]);
        rows.push(['Touchdown power', cd.touchdownPower.value === 'MIL' ? 'MIL, no afterburner' : 'Max power', cd.touchdownPower]);
      }
      if (ld) {
        rows.push(['Launch power', powerText(d, ld.weights.normal), ld.power]);
        if (ld.trimByWeightLb) rows.push(['T/O trim', trimReadout(ld, ld.weights.normal, undefined)?.table ?? '', ld.trimByWeightLb]);
        if (ld.runM) rows.push(['Ski-jump runs', Object.entries(ld.runM.value).map(([k, v]) => `pos ${k} ${v} m`).join(', '), ld.runM]);
        if (ld.shortRunMaxWeight) rows.push(['Short run limit', `${ld.shortRunMaxWeight.value} ${ld.weights.unit}`, ld.shortRunMaxWeight]);
        if (ld.clearingTurn) rows.push(['Clearing turn', Object.entries(ld.clearingTurn.value).map(([k, v]) => `cat ${k} ${v}`).join(', '), ld.clearingTurn]);
      }
      numbersBox.replaceChildren(...rows.flatMap(([k, v, src]) => [h('dt', null, k), h('dd', { title: src.note ?? src.source }, v, nvTag(src))]));
    }
    renderNumbers();
    const keyList = h('div', { class: 'fo-keys' },
      keyHint({ label: 'Pitch (stick)', keys: 'Up / Down' }),
      keyHint({ label: 'Roll (stick)', keys: 'Left / Right' }),
      keyHint({ label: 'Throttle up / down', keys: 'Num+ / = , Num- / -' }),
      keyHint({ label: toAb ? 'Throttle full afterburner' : 'Throttle MIL', keys: thrMaxKey,
        note: !d.takeoff.keys.throttleMax ? 'trainer key' : d.takeoff.keys.throttleMax.verified ? undefined : 'not verified' }),
      keyHint({ label: 'Wheel brakes (hold)', keys: brakesKey, note: d.takeoff.keys.brakes.verified ? undefined : 'not verified' }),
      keyHint({ label: 'Gear', keys: d.keys.gear, note: 'not verified' }),
      fc === 'with-gear' ? keyHint({ label: 'Flaps', keys: 'follow the gear' })
        : fc === 'none' ? null
          : keyHint({ label: 'Flaps (cycle)', keys: d.keys.flaps, note: 'not verified' }),
      keyHint({ label: 'Speed brake', keys: d.keys.speedbrake, note: 'not verified' }),
      d.nav ? keyHint({ label: `Nav mode (${navLabels.join(' / ')})`, keys: d.nav.keys.modeCycle.value, note: d.nav.keys.modeCycle.verified ? undefined : 'not verified' }) : null,
      d.nav?.keys.pointCycle ? keyHint({ label: 'Next waypoint (МРШ / NAV)', keys: d.nav.keys.pointCycle.value, note: d.nav.keys.pointCycle.verified ? undefined : 'not verified' }) : null,
      cd ? keyHint({ label: 'Tail hook', keys: cd.hookKey.value, note: cd.hookKey.verified ? undefined : 'not verified' }) : null,
      cd ? keyHint({ label: 'Call the ball', keys: cd.ballCallKey.value, note: 'trainer key: DCS uses the radio menu' }) : null,
      ...launchKeys(d).map(k => keyHint({ label: `Launch: ${k.label}`, keys: k.key, note: k.tag ?? undefined })),
      ...(avoidKey(d) ? [keyHint({ label: avoidKey(d)!.label, keys: avoidKey(d)!.key })] : []),
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
      options: camOptions(),
      onChange: v => setCam(v),
    });
    /** Camera choices: the tower on the airfield, the LSO platform at sea. */
    function camOptions(): { value: FlightOpsCamera; label: string; title?: string }[] {
      return [{ value: 'chase', label: 'Chase' }, { value: 'side', label: 'Side' },
        atLaunch() ? { value: 'deck', label: 'Deck', title: 'Shooter\'s view from the deck beside the jet' }
          : atSea() ? { value: 'lso', label: 'LSO', title: 'LSO platform, port side aft' } : { value: 'tower', label: 'Tower' },
        { value: 'cockpit', label: 'Cockpit' }];
    }
    const seaCam = (c: FlightOpsCamera): FlightOpsCamera => (atLaunch() ? (c === 'tower' || c === 'lso' ? 'deck' : c)
      : c === 'deck' ? (atSea() ? 'lso' : 'tower') : atSea() && c === 'tower' ? 'lso' : !atSea() && c === 'lso' ? 'tower' : c);
    const pauseBtn = button({ id: 'fo-pause', label: 'Pause', size: 's', keys: 'P', onClick: () => togglePause() });
    const restartBtn = button({ id: 'fo-restart', label: 'Restart', size: 's', keys: 'R', onClick: () => reset(true) });

    const layout = labLayout({
      id: 'fo-lab', class: 'fo-lab',
      header: {
        title: 'Pattern & landing', meta: headMeta,
        lede: `Take off, ${navOk ? 'nav home, ' : ''}break, configure, fly the AoA, land in the zone.${cd ? ` Or fly Case I to the ${SHIPS[cd.ship].name} and catch a wire.` : ''}${ld ? ` Or launch off the ${ld.kind === 'catapult' ? 'catapult' : 'ski-jump'}.` : ''}`,
      },
      viewport,
      strip: [hudBezel.el, toBlock, launchBlock, navBezel.el, ballBezel.el, idxBezel.el, traceBezel.el, cfgBlock],
      console: [debriefPanel.el, lsoBlock, lessonPanel.el,
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
    const ballDisp = new BallDisplay(ballCanvas);
    bag.add(() => { hud.dispose(); indexer.dispose(); trace.dispose(); navDisp.dispose(); ballDisp.dispose(); });

    // ---------------------------------------------------------------- touch controls (Fly mode)
    const touch = touchControls({
      flaps: fc === 'selector',
      afterburner: toAb,
      brakesKey,
      nav: d.nav ? { title: `Nav mode: ${navLabels.join(' → ')}`, key: d.nav.keys.modeCycle.value } : undefined,
      carrier: cd ? { hookKey: cd.hookKey.value, ballKey: cd.ballCallKey.value } : undefined,
      launch: ld ? [
        ...launchKeys(d).map(k => ({ id: k.action, label: touchLabel(k.action), title: `${k.label} (${k.key})` })),
        { id: 'ab', label: 'AB', title: 'Afterburner on or off' },
      ] : undefined,
      onLaunch: id => act(() => launchAct(id as FlightOpsAction | 'ab'))(),
      onAction: (a: TouchAction) => act(() => {
        if (a === 'hook' || a === 'ball') carrierAct(a);
        else if (a === 'gear') gearAct();
        else if (a === 'flaps') cycleFlaps();
        else if (a === 'brake') applyAction(s, 'speedbrakeToggle', d);
        else if (a === 'ab') { input.afterburner = !input.afterburner; if (input.afterburner) input.throttle = 1; }
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
      s = createFlightOpsState(ac, start, d, atLaunch() ? { station, heavy } : undefined);
      // Fly the return from МРШ so the lesson starts with selecting ВЗВ (jets with a return mode).
      if (rtb() && mode === 'fly' && d.nav?.modes.some(m => m.id === 'return')) initNav(s, d, 'route');
      ev = new ApproachEvaluator(d);
      tev = start === 'takeoff' ? new TakeoffEvaluator(d) : null;
      cev = atSea() ? new CarrierEvaluator(d) : null;
      cScore = null; flownL = []; lsoSeen = -1;
      lev = atLaunch() ? new LaunchEvaluator(d) : null; lScore = null; lStripKey = '';
      sc?.setCarrier(atSea() && cd ? cd.ship : atLaunch() && ld ? ld.ship : null);
      launchBlock.hidden = launchOpts.hidden = !atLaunch();
      touch.setLaunch(atLaunch());
      ballBezel.el.hidden = lsoBlock.hidden = !atSea();
      syncHead();
      layout.el.classList.toggle('fo-lab--sea', atSea());
      touch.setCarrier(atSea());
      camSeg.setOptions(camOptions(), seaCam(cam));
      if (seaCam(cam) !== cam) setCam(seaCam(cam));
      toScore = null; toDone = new Set();
      input.afterburner = false; input.brakes = false;
      toBlock.hidden = start !== 'takeoff';
      idxBezel.el.hidden = start === 'takeoff' || atLaunch();   // the checklist strip takes the indexer's place on the runway
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
      traceBezel.el.hidden = !!s.nav || atLaunch();
      syncLaunchStrip(true);
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
      if (held.thrDn) input.afterburner = false;
      input.brakes = held.brakes || touch.wheelBrakes;
      return input;
    }

    function tick(): void {
      let brakesNow: boolean;
      if (mode === 'watch') {
        const cmd = demoPilot(s, d);
        for (const a of cmd.actions) applyAction(s, a, d);
        brakesNow = !!cmd.brakes;
        stepFlightOps(s, cmd, FLIGHT_OPS_DT, d);
      } else {
        const inp = playerInput(FLIGHT_OPS_DT);
        brakesNow = !!inp.brakes;
        stepFlightOps(s, inp, FLIGHT_OPS_DT, d);
      }
      if (lev) lev.update(s); else if (cev) cev.update(s); else ev.update(s);
      if (tev) { tev.update(s); for (const i of takeoffItemsNow(d, s, brakesNow)) toDone.add(i); }
      steps++;
      const cue = aoaCue(s, d);
      if (s.phase === 'air') onSpeedRun = s.gearDown && cue === 'on' ? onSpeedRun + FLIGHT_OPS_DT : 0;
      const gearLimit = cev && cd ? cd.pattern.gearFlapsMaxKt.value : d.pattern.gearMaxKt.value;
      if (!configured && landingConfigured(d, s) && (!cev || s.hookDown) && kt(s.speed) <= gearLimit) configured = true;
      if (s.nav) {
        const m = navMilestones(s.nav, d, navMs.onGlideRunS, FLIGHT_OPS_DT);
        navMs = { steering: navMs.steering || m.steering, intercept: navMs.intercept || m.intercept, onGlideRunS: navMs.onGlideRunS >= 3 ? navMs.onGlideRunS : m.onGlideRunS };
        if (s.nav.call && s.nav.call !== lastCall) { lastCall = s.nav.call; callAt = s.t; }
        else if (!s.nav.call) lastCall = null;
      }
      if (steps % TRAIL_EVERY === 0 && (s.phase === 'air' || s.phase === 'rollout' || s.phase === 'roll')) {
        let lvl: 0 | 1 | 2;
        if (cev || lev) {
          // At sea the 3D trail and gates ride with the ship (landing frame); the trace stays in the world frame.
          const g = carrierGeometry(s);
          const k = g.inGroove ? Math.max(Math.abs(g.glideErrDeg) / 1.5, Math.abs(g.lineupErrDeg) / 1.7) : 0;
          lvl = lev ? 0 : k < 1 ? (s.gearDown && s.phase === 'air' && cue !== 'on' ? 1 : 0) : k < 1.8 ? 1 : 2;
          const l = toLandingOverlay(s);
          sc?.overlay.pushTrail(l, lvl);
          if (flownL.length < TRACK_MAX) flownL.push({ t: s.t, ...l, heading: s.heading - (s.ship!.heading - SHIPS[s.ship!.id].angledDeckDeg.value * Math.PI / 180) });
        } else {
          lvl = errLevel(approachGeometry(s, d), s, cue);
          sc?.overlay.pushTrail(s.pos, lvl);
        }
        if (track.length < TRACK_MAX) {
          track.push({ x: s.pos.x, z: s.pos.z, level: lvl });
          flown.push({ t: s.t, x: s.pos.x, y: s.pos.y, z: s.pos.z, heading: s.heading });
        }
      }
      if (!finished && lev) {
        const sco = lev.score(s);
        if (sco.total !== null) finishLaunch(sco);
      } else if (!finished && cev) {
        const sco = cev.score();
        if (sco.total !== null) finishCarrier(sco);
      } else if (!finished && tev) {
        const sco = tev.score();
        if (sco.total !== null) finishTakeoff(sco);
      } else if (!finished && s.phase !== 'air') {
        const sco = ev.score();
        if (sco.total !== null) finish(sco);
      }
    }

    const planCarrier = carrierPlannedGates(d);
    const planGroove = carrierPlannedGates(d, true);
    function liveGates(): readonly GateResult[] {
      return lev ? (lScore?.gates ?? lev.score(s).gates) : cev ? (cScore?.gates ?? cev.score().gates) : tev ? (toScore?.gates ?? tev.score().gates) : (score?.gates ?? ev.score().gates);
    }
    /** Gates for the 3D overlay (at sea: the landing frame, moving with the ship). */
    function placed() {
      if (lev) return [];
      if (cev) return placeGates(start === 'carrierGroove' ? planGroove : planCarrier, liveGates(), flownL);
      return placeGates(gatesForStart(planAll, kind()), score?.gates ?? ev.score().gates, flown);
    }
    /** Gates for the top-down trace: world frame. At sea: reached gates where flown, pending ones off the ship now. */
    function placedTrace() {
      if (!cev || !s.ship) return placed();
      return placed().flatMap(g => {
        if (g.flown) { const p = pointAt(flown, flownL.find(f => f.x === g.pos.x && f.z === g.pos.z)?.t ?? -1); return p ? [{ ...g, pos: { x: p.x, y: p.y, z: p.z } }] : []; }
        const w = landingToWorld(s, -g.pos.z, g.pos.x);
        return [{ ...g, pos: { x: w.x, y: g.pos.y, z: w.z } }];
      });
    }

    function syncGates(): void {
      const results = liveGates();
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
      // Takeoff: no glide corridor, approach guides or aim ring until the takeoff is graded.
      const guides = !(tev && !finished) && !lev;
      if (guides !== guidesOn) { guidesOn = guides; sc?.overlay.setGuidesVisible(guides); st?.requestRender(); }
      if (force) { hud.draw(s); indexer.draw(s); }
      syncGates();
      syncNavTarget();
      navDisp.draw(s);
      const status = s.nav ? s.nav.label : d.id === 'f15c' ? 'ILSN' : 'simplified';
      if (status !== hudStatus) { hudStatus = status; hudBezel.setStatus(status); }
      trace.draw(s, track, placedTrace());
      if (s.ship) syncLso();
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

      const order = stepOrder(kind(), d);
      const gates = liveGates();
      const done = stepsDone({ gates, configured, onSpeedRunS: onSpeedRun, nav: s.nav ? navMs : undefined, takeoff: tev ? toDone : undefined, ballCalled: cev ? !!s.lso?.ballCalled : undefined });
      if (tev) {
        for (const c of takeoffChecklist(d, toDone)) {
          const l = toLamps.get(c.id)!;
          l.set(c.state === 'done' ? 'on' : 'off');
          l.el.classList.toggle('is-current', c.state === 'current');
        }
      }
      if (lev) {
        const ids = stepsDef.map(x => x.id), dn = launchStepsDone(s, gates);
        for (const id of ids) if (dn.has(id) && !steps_.isDone(id)) steps_.setDone(id, true);
        steps_.setCurrent(launchCurrent(ids, dn));
        syncLaunchStrip(force);
      } else {
        for (const id of order) if (done.has(id) && !steps_.isDone(id)) steps_.setDone(id, true);
        steps_.setCurrent(currentStep(new Set(order.filter(id => steps_.isDone(id))), order));
      }

      const lsoLast = s.lso?.calls[s.lso.calls.length - 1];
      const showLso = !!lsoLast && s.t - lsoLast.t < CALL_SHOW_S;
      const showCall = !showLso && !!s.nav && lastCall !== null && s.t - callAt < CALL_SHOW_S;
      callLine.hidden = !showCall && !showLso;
      if (showLso) setText(callLine, `LSO: ${lsoLast!.text}`);
      else if (showCall) setText(callLine, `Tower: ${lastCall}`);
      callLine.classList.toggle('is-waveoff', showLso && (lsoLast!.kind === 'waveoff' || lsoLast!.kind === 'bolter'));

      setText(pill, !started ? (mode === 'watch' ? 'Demo ready' : 'Ready') : paused ? 'Paused'
        : s.phase === 'crashed' ? 'Crashed' : s.phase === 'stopped' ? 'Stopped'
          : s.launch && ld && s.launch.stage === 'hold' ? `Held · ${stationLabel(ld, s.launch.station)}` : s.launch?.stage === 'shot' ? 'Shot: stand by'
          : `${spdVal(s.speed, u)} ${spdUnit(u).toLowerCase()} · ${Math.max(0, altVal(s.pos.y, u))} ${altUnit(u).toLowerCase()}`);
      coachLine(warn.overspeed);
    }

    /** Landing aid close-up and the LSO call log (at sea). */
    function syncLso(): void {
      ballDisp.draw(ballPicture(s.lso?.ball ?? null, shipLights), ballPrompt(s, d));
      const calls = s.lso?.calls ?? [];
      if (calls.length === lsoSeen) return;
      lsoSeen = calls.length;
      const last = calls[calls.length - 1];
      setText(lsoLatest, last ? last.text : cd && SHIPS[cd.ship].lso.value ? 'Waiting for the ball call' : 'No LSO calls on this ship');
      lsoLatest.className = `fo-lso__latest${last && (last.kind === 'waveoff' || last.kind === 'bolter') ? ' is-waveoff' : ''}`;
      lsoList.replaceChildren(...calls.slice(-LSO_LOG_MAX).reverse().map(c =>
        h('li', { class: `fo-lso__item is-${c.kind}` }, h('span', { class: 'fo-lso__t' }, `${c.t.toFixed(0)} s`), c.text)));
    }

    function coachLine(over: 'gear' | 'flaps' | null): void {
      const u = units();
      if (lev) { launchCoach(); return; }
      if (cev) { carrierCoach(over); return; }
      const fin = toScore ?? score;
      if (finished && fin) { coach.set(`${fin.total} / 100. ${fin.verdict ?? ''}`, 'Read the gates below, then fly it again.', lessonPassed(fin.total) ? 'ok' : 'caution'); return; }
      if (!started && tev) {
        coach.set(mode === 'watch' ? 'Watch the demo take off.' : 'Fly it: runway takeoff.',
          mode === 'watch' ? 'Captions follow each step. The strip under the view lights each item.'
            : `Hold ${brakesKey} for the wheel brakes, ${thrMaxKey} or Num+ for power, then release. Down arrow to rotate, ${d.keys.gear} gear.`);
        return;
      }
      if (!started) {
        const what = rtb() ? 'the return to base' : 'the overhead pattern';
        coach.set(mode === 'watch' ? `Watch the demo fly ${what}.` : rtb() ? 'Fly it: return to base.' : `Fly it: start from the ${start}.`,
          mode === 'watch' ? 'Captions follow each leg. Change the camera at the top right.'
            : `Stick on the arrows, throttle on Num+ and Num-. ${d.keys.gear} gear${d.nav && rtb() ? `, ${d.nav.keys.modeCycle.value} nav mode` : ''}.`);
        return;
      }
      if (over) { coach.set(`Overspeed: ${over} out above ${ktText(d.pattern.gearMaxKt.value, u)}.`, 'Slow down first, then configure.', 'warning'); return; }
      if (mode === 'watch') { const c = legCaption(demoLeg(s), d, u, s.nav, s.heading, s.phase, kt(s.speed)); coach.set(c.text, c.why); return; }
      if (tev && s.takeoff && (s.phase === 'roll' || s.phase === 'ready')) {
        const r = s.takeoff, pd = s.pitch * 180 / Math.PI, [lo, hi] = d.takeoff.pitchDeg.value;
        if (pd >= d.takeoff.tailStrikeDeg.value - 1) { coach.set(`Nose high: ${pd.toFixed(1)}°.`, `Ease the pull. Tail strike at ${d.takeoff.tailStrikeDeg.value}°.`, 'warning'); return; }
        if (r.rotateT !== undefined) { coach.set(`Rotate: nose to ${lo}–${hi}°, now ${pd.toFixed(1)}°.`, 'Hold the attitude; the jet flies off.', pd >= lo && pd <= hi ? 'ok' : 'caution'); return; }
        if (s.phase === 'roll' && kt(s.speed) >= rotateAtKt(d) - 3) { coach.set(`Pull: rotate at ${ktText(rotateAtKt(d), u)}.`, `Down arrow; nose to ${lo}–${hi}°.`, 'ok'); return; }
      }
      const g = approachGeometry(s, d);
      if (!tev && g.onFinal && s.gearDown) {
        const cue = aoaCue(s, d);
        const glide = g.glideErrDeg > GLIDE_TOL_DEG ? 'High: push the marker below the line.' : g.glideErrDeg < -GLIDE_TOL_DEG ? 'Low: raise the marker above the line.' : 'On glide path: marker on the line.';
        const spd = cue === 'on' ? 'On speed.' : cue === 'slow' ? 'Slow: add power.' : 'Fast: reduce power.';
        coach.set(`${glide} ${spd}`, `Lineup ${g.lineupErrDeg > 0 ? 'right' : 'left'} ${Math.abs(g.lineupErrDeg).toFixed(1)}°.`, Math.abs(g.glideErrDeg) > GLIDE_TOL_DEG || cue !== 'on' ? 'caution' : 'ok');
        return;
      }
      const order = stepOrder(kind(), d);
      const cur = currentStep(new Set(order.filter(id => steps_.isDone(id))), order);
      if (s.nav && s.phase === 'air' && (cur === 'navmode' || cur === 'steer' || cur === 'glidepath')) {
        const pic = navPicture(s.nav, s.heading, u);
        const turn = Math.abs(pic.steerErrDeg) < 3 ? 'On the steering' : `Turn ${pic.steerErrDeg > 0 ? 'right' : 'left'} ${Math.round(Math.abs(pic.steerErrDeg))}°`;
        const stp = stepsDef.find(x => x.id === cur);
        coach.set(`${pic.mode} to ${pic.point}, ${pic.dist}. ${turn}${pic.cmdAlt ? `, ${pic.cmdAlt}` : ''}.`, stp ? stp.text + '.' : '');
        return;
      }
      const stp = stepsDef.find(x => x.id === cur);
      coach.set(stp ? stp.text + '.' : tev ? `Climb out, level at ${altFtText(1500, u)}.` : 'Stop on the runway.', 'The checklist ticks as you pass each gate.');
    }

    /** Coach line at sea: the pass result, the ball-call prompt, the ball and lineup in the groove, the next step. */
    function carrierCoach(over: 'gear' | 'flaps' | null): void {
      const u = units();
      if (!cd) return;
      if (finished && cScore) {
        const card = gradeCard(cScore);
        coach.set(`${card.mark}, ${card.result}. ${cScore.total} / 100.`, cScore.verdict ?? '', lessonPassed(cScore.total) ? 'ok' : 'caution');
        return;
      }
      if (!started) {
        const c = carrierCaption(null, d, u);
        coach.set(mode === 'watch' ? `Watch the demo fly ${start === 'caseI' ? 'Case I' : 'the groove'}.` : start === 'caseI' ? 'Fly it: Case I.' : 'Fly it: in the groove.',
          mode === 'watch' ? c.why : `Stick on the arrows, throttle on Num+ and Num-. ${d.keys.gear} gear, ${cd.hookKey.value} hook, ${cd.ballCallKey.value} to call the ball.`);
        return;
      }
      if (over) { coach.set(`Overspeed: ${over} out above ${ktText(d.pattern.gearMaxKt.value, u)}.`, 'Slow down first, then configure.', 'warning'); return; }
      if (ballPrompt(s, d)) { coach.set(`Call the ball: ${cd.ballCallKey.value}.`, `Wings level at ${cd.pattern.ballNm.value} nm. Without the ball, call Clara.`, 'caution'); return; }
      if (mode === 'watch') { const c = carrierCaption(demoLeg(s), d, u); coach.set(c.text, c.why); return; }
      const g = carrierGeometry(s);
      if (g.inGroove && s.phase === 'air') {
        const pic = ballPicture(s.lso?.ball ?? null, shipLights);
        const cue = aoaCue(s, d);
        const lu = Math.abs(g.lineupErrDeg) < 0.6 ? 'Lined up.' : g.lineupErrDeg > 0 ? 'Right of centreline: come left.' : 'Left of centreline: come right.';
        const spd = cue === 'on' ? 'On speed.' : cue === 'slow' ? 'Slow: add power.' : 'Fast: reduce power.';
        coach.set(`${pic.words}. ${spd}`, `${lu} Meatball, lineup, angle of attack.`, pic.tone === 'warning' || Math.abs(g.lineupErrDeg) > 1.7 ? 'warning' : cue === 'on' ? 'ok' : 'caution');
        return;
      }
      const order = stepOrder(kind(), d);
      const cur = currentStep(new Set(order.filter(id => steps_.isDone(id))), order);
      const stp = stepsDef.find(x => x.id === cur);
      coach.set(stp ? stp.text + '.' : 'Stop on the deck.', 'The checklist ticks as you pass each gate.');
    }

    /** Coach line on a launch start: the result, the next step on the deck, the stroke, the climb. */
    function launchCoach(): void {
      if (!ld || !s.launch) return;
      const L = s.launch;
      const name = ld.kind === 'catapult' ? 'catapult launch' : 'ski-jump launch';
      if (finished && lScore) {
        const c = launchCard(lScore);
        coach.set(`${c.title}. ${lScore.total} / 100.`, lScore.verdict ?? '', lessonPassed(lScore.total) ? 'ok' : 'caution');
        return;
      }
      if (!started) {
        coach.set(mode === 'watch' ? `Watch the demo ${name}.` : `Fly it: ${name} from ${stationLabel(ld, station).toLowerCase()}.`,
          mode === 'watch' ? 'The strip under the view lights each step in order.' : `${ld.cue}. Each step shows its key.`);
        return;
      }
      const c = launchCaption(s, d, units());
      const warns = launchWarnings(d, s);
      const warn = L.stage === 'hold' || L.stage === 'shot' ? warns[warns.length - 1] : undefined;
      coach.set(c.text, warn ?? c.why, warn ? 'caution' : undefined);
    }

    /** Launch debrief (#27): outcome, gates, faults, the numbers off the deck, total and verdict. */
    function finishLaunch(sco: LaunchScore): void {
      finished = true; lScore = sco;
      startBtn.setLabel(mode === 'watch' ? 'Watch again' : 'Fly again');
      startBtn.setDisabled(false);
      const card = launchCard(sco), L = s.launch, u = units();
      const rows: HTMLElement[] = [];
      if (L && ld) {
        rows.push(h('dt', null, ld.kind === 'catapult' ? 'Catapult' : 'Position'), h('dd', null, stationLabel(ld, L.station)));
        rows.push(h('dt', null, 'Weight'), h('dd', null, `${L.weight} ${ld.weights.unit}${L.heavy ? ' (heavy)' : ''}`));
        if (L.trimWantDeg !== undefined) rows.push(h('dt', null, 'T/O trim'), h('dd', { class: L.trimDeg !== L.trimWantDeg ? 'fo-bad' : undefined }, `${L.trimDeg}°, want ${L.trimWantDeg}°`));
        if (L.endKt !== undefined) {
          rows.push(h('dt', null, ld.kind === 'catapult' ? 'End of stroke' : 'At the ramp'),
            h('dd', null, `${ktText(Math.round(L.endKt), u)}${L.minKt !== undefined ? `, want ${ktText(Math.round(L.minKt), u)} or more` : ''}`));
        }
      }
      debriefBody.replaceChildren(
        h('div', { class: `fo-outcome is-${card.tone}` },
          h('span', { class: 'fo-outcome__title' }, card.title), h('p', { class: 'fo-outcome__meaning' }, card.meaning)),
        h('div', { class: 'fo-score' },
          h('span', { class: 'fo-score__n' }, String(sco.total ?? 0)), h('span', { class: 'fo-score__of' }, '/ 100'),
          h('p', { class: 'fo-score__verdict' }, sco.verdict ?? '')),
        gateList(sco.gates),
        ...(sco.errors.length ? [h('ul', { class: 'fo-faults', 'aria-label': 'Sequence faults' }, sco.errors.map(e => h('li', null, e)))] : []),
        h('dl', { class: 'fo-numbers' }, rows),
        h('p', { class: 'fo-debrief__foot' }, mode === 'fly'
          ? (lessonPassed(sco.total) ? `Launch lesson complete for the ${spec.short}.` : `Score ${PASS_SCORE} or more in Fly mode to complete the launch lesson.`)
          : 'Demo launch. Switch to Fly to be graded.'),
      );
      debriefPanel.el.hidden = false;
      if (mode === 'fly' && lessonPassed(sco.total)) ctx.app.setProgress(progressKey(ac, 'launch'), true);
      refresh(true);
    }

    // ---------------------------------------------------------------- debrief
    /** Carrier debrief (#26): the LSO grade, comments in plain words, the wire, the gates, total and verdict. */
    function finishCarrier(sco: CarrierScore): void {
      finished = true; cScore = sco;
      startBtn.setLabel(mode === 'watch' ? 'Watch again' : 'Fly again');
      startBtn.setDisabled(false);
      const card = gradeCard(sco);
      const lsoNv = cd && !SHIPS[cd.ship].lso.value;
      debriefBody.replaceChildren(
        h('div', { class: `fo-grade is-${card.tone}` },
          h('span', { class: 'fo-grade__mark', 'aria-label': `LSO grade ${card.mark}` }, card.mark),
          h('div', { class: 'fo-grade__body' },
            h('p', { class: 'fo-grade__meaning' }, card.meaning, lsoNv ? h('span', { class: 'fo-nv', title: SHIPS[cd.ship].lso.note }, 'not verified') : null),
            h('p', { class: 'fo-grade__result' }, card.result))),
        card.comments.length
          ? h('dl', { class: 'fo-comments' }, card.comments.flatMap(c => [h('dt', null, c.code), h('dd', null, c.text)]))
          : h('p', { class: 'fo-comments__none' }, 'No LSO comments.'),
        h('div', { class: 'fo-score' },
          h('span', { class: 'fo-score__n' }, String(sco.total ?? 0)), h('span', { class: 'fo-score__of' }, '/ 100'),
          h('p', { class: 'fo-score__verdict' }, sco.verdict ?? '')),
        gateList(sco.gates),
        h('p', { class: 'fo-debrief__foot' }, mode === 'fly'
          ? (lessonPassed(sco.total) ? `Carrier lesson complete for the ${spec.short}.` : `Score ${PASS_SCORE} or more in Fly mode to complete the carrier lesson.`)
          : 'Demo pass. Switch to Fly to be graded.'),
      );
      debriefPanel.el.hidden = false;
      if (mode === 'fly' && lessonPassed(sco.total)) ctx.app.setProgress(progressKey(ac, kind()), true);
      gatesSeen = -1;
      refresh(true);
    }

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
        gateList(sco.gates),
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
      if (mode === 'fly' && lessonPassed(sco.total)) ctx.app.setProgress(progressKey(ac, kind()), true);
      gatesSeen = -1;
      refresh(true);
    }

    function gateList(gates: readonly GateResult[]): HTMLElement {
      return h('ol', { class: 'fo-gates' }, gates.map(g => h('li', { class: g.ok ? 'is-ok' : 'is-miss' },
        h('span', { class: 'fo-gates__mark', 'aria-label': g.ok ? 'passed' : 'missed' }, g.ok ? 'OK' : 'MISS'),
        h('span', { class: 'fo-gates__label' }, g.label),
        h('span', { class: 'fo-gates__notes' }, g.notes.join(' · ')))));
    }

    /** Takeoff debrief (#24): gates with notes, tail strike, total and verdict. */
    function finishTakeoff(sco: TakeoffScore): void {
      finished = true; toScore = sco;
      startBtn.setLabel(mode === 'watch' ? 'Watch again' : 'Fly again');
      startBtn.setDisabled(false);
      const u = units(), r = s.takeoff, t = d.takeoff;
      const spd = (k: number | undefined) => (k === undefined ? 'n/a' : ktText(Math.round(k), u));
      debriefBody.replaceChildren(
        h('div', { class: 'fo-score' },
          h('span', { class: 'fo-score__n' }, String(sco.total ?? 0)), h('span', { class: 'fo-score__of' }, '/ 100'),
          h('p', { class: 'fo-score__verdict' }, sco.verdict ?? '')),
        gateList(sco.gates),
        h('dl', { class: 'fo-numbers' },
          h('dt', null, 'Tail strike'), h('dd', { class: sco.tailStrike ? 'fo-bad' : undefined }, sco.tailStrike ? `Yes, ${(r?.maxPitchOnGroundDeg ?? 0).toFixed(1)}° on the runway` : `No, peak ${(r?.maxPitchOnGroundDeg ?? 0).toFixed(1)}°`),
          h('dt', null, 'Rotate'), h('dd', null, `${spd(r?.rotateKt)}, want ${ktText(rotateAtKt(d), u)}`),
          h('dt', null, 'Liftoff'), h('dd', null, r?.liftoffKt === undefined ? 'n/a' : `${spd(r.liftoffKt)}, ${(r.liftoffPitchDeg ?? 0).toFixed(1)}°`),
          h('dt', null, 'Gear up'), h('dd', null, `${spd(r?.gearUpKt)}, limit ${ktText(t.gearUpMaxKt.value, u)}`)),
        h('p', { class: 'fo-debrief__foot' }, mode === 'fly'
          ? (lessonPassed(sco.total) ? `Takeoff lesson complete for the ${spec.short}.` : `Score ${PASS_SCORE} or more in Fly mode to complete the takeoff lesson.`)
          : 'Demo flight. Switch to Fly to be graded.'),
      );
      debriefPanel.el.hidden = false;
      if (mode === 'fly' && lessonPassed(sco.total)) ctx.app.setProgress(progressKey(ac, 'takeoff'), true);
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
    /** Gear handle. Jets without flap control need nothing else (the sim ignores flaps for them). */
    function gearAct(): void { applyAction(s, 'gearToggle', d); }
    /** Launch sequence actions (launch starts only); 'ab' toggles the afterburner. */
    function launchAct(a: FlightOpsAction | 'ab'): void {
      if (!s.launch) return;
      if (a === 'ab') { input.afterburner = !input.afterburner; if (input.afterburner) input.throttle = 1; return; }
      applyAction(s, a, d);
    }
    /** Hook and ball call: carrier starts only. */
    function carrierAct(a: 'hook' | 'ball'): void {
      if (!s.ship) return;
      applyAction(s, a === 'hook' ? 'hookToggle' : 'callBall', d);
    }
    const keymap: Parameters<typeof bindKeys>[0] = {
      'Up': hold('up'), 'Down': hold('down'), 'Left': hold('left'), 'Right': hold('right'),
      'Num+ / =': hold('thrUp'), 'Num- / -': hold('thrDn'),
      [d.keys.gear]: act(gearAct),
      [d.keys.speedbrake]: act(() => applyAction(s, 'speedbrakeToggle', d)),
      'Space': () => { if (!started || finished) go(); else togglePause(); },
      'P': () => togglePause(),
      'R': () => reset(true),
      'C': () => { const opts = camOptions().map(o => o.value); setCam(opts[(opts.indexOf(cam) + 1) % opts.length]!); },
    };
    if (fc === 'selector' && /^[A-Z]$/.test(d.keys.flaps)) keymap[d.keys.flaps] = act(cycleFlaps);
    // Wheel brakes (held): takeoff and landing rollout. Throttle max: MIL, or full afterburner where the takeoff uses it.
    if (parseChord(brakesKey) && !(brakesKey in keymap)) keymap[brakesKey] = hold('brakes');
    // On a launch start: MIL, or the afterburner when the launch needs it; pressed again at MIL, afterburner.
    if (parseChord(thrMaxKey) && !(thrMaxKey in keymap)) {
      keymap[thrMaxKey] = act(() => {
        if (s.launch && ld) {
          input.afterburner = input.throttle >= 1 || launchPowerNeed(ld, s.launch.weight) === 'AB' || input.afterburner;
          input.throttle = 1;
        } else { input.throttle = 1; input.afterburner = toAb; }
      });
    }
    if (ld) {
      for (const k of [...launchKeys(d), ...(avoidKey(d) ? [avoidKey(d)!] : [])]) {
        if (parseChord(k.key) && !(k.key in keymap)) keymap[k.key] = act(() => launchAct(k.action));
      }
    }
    if (d.nav) {
      const mk = d.nav.keys.modeCycle.value, pk = d.nav.keys.pointCycle?.value;
      if (parseChord(mk)) keymap[mk] = act(() => applyAction(s, 'navModeCycle', d));
      if (pk && parseChord(pk)) keymap[pk] = act(() => applyAction(s, 'navPointCycle', d));
    }
    if (cd) {
      const hk = cd.hookKey.value, bk = cd.ballCallKey.value;
      if (parseChord(hk) && !(hk in keymap)) keymap[hk] = act(() => carrierAct('hook'));
      if (parseChord(bk) && !(bk in keymap)) keymap[bk] = act(() => carrierAct('ball'));
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
      const toShot = which.startsWith('takeoff-');
      const launchShot = which.startsWith('launch-') && lStarts.length > 0;
      const seaShot = !launchShot && !!cd && (which === 'case1-break' || which === 'groove' || which === 'trap' || (which === 'debrief' && atSea()));
      mode = 'watch'; modeSeg.set('watch');
      start = toShot ? 'takeoff' : launchShot ? lStarts[0]! : navShot ? 'rtb' : seaShot ? 'caseI' : 'initial'; startSeg.set(start);
      rebuildSteps();
      reset(true);
      const t0 = s.t;
      let trapT: number | null = null;
      const doneAt = (): boolean => {
        if (launchShot) {
          const L = s.launch;
          if (!L || !ld) return true;
          if (which === 'launch-hold') return ld.kind === 'catapult' ? L.stage === 'shot' : L.stepsDone.some(x => x.id === 'specialAB');
          if (which === 'launch-stroke') return L.stage === 'stroke' && s.t - (L.strokeT ?? s.t) >= (ld.kind === 'catapult' ? 1.5 : 3.2);
          if (which === 'launch-climb') return L.stage === 'free' && s.pos.y > SHIPS[ld.ship].deckHeightM + 60;
          return finished;
        }
        if (seaShot) {
          if (which === 'case1-break') return demoLeg(s) === 'break' && Math.abs(s.bank) > 0.9;
          if (which === 'groove') return !!s.lso?.ballCalled && carrierGeometry(s).rangeM < 0.45 * 1852;
          if (which === 'trap') { if (s.trap && trapT === null) trapT = s.t; return trapT !== null && s.t - trapT > 0.6; }
          return finished && s.phase === 'stopped';
        }
        if (which === 'takeoff-ready') return wantFly || s.phase !== 'ready' || s.throttle >= 0.9;
        if (which === 'takeoff-rotate') return s.takeoff?.rotateT !== undefined && s.pitch * 180 / Math.PI >= d.takeoff.pitchDeg.value[0] * 0.7;
        if (which === 'takeoff-climb') return s.takeoff?.gearUpT !== undefined && s.pos.y > 150;
        if (which === 'takeoff-debrief') return finished;
        if (which === 'rtb') return s.t - t0 > 4 || !navShot;
        if (which === 'ils') return !navShot || (s.nav?.mode === 'landing' && approachGeometry(s, d).rangeM < 6000);
        if (which === 'final') { const g = approachGeometry(s, d); return demoLeg(s) === 'final' && g.rangeM < 1852; }
        if (which === 'downwind') return ev.score().gates.some(g => g.id === 'abeam') || (demoLeg(s) === 'downwind' && s.pos.z > -aimPointM(d) - 400 && s.gearDown);
        return finished && s.phase === 'stopped';
      };
      for (let i = 0; i < 60 * 600 && !doneAt(); i++) tick();
      if (wantFly && !finished) {
        mode = 'fly'; modeSeg.set('fly');
        input.throttle = s.throttle; input.pitch = 0; input.roll = 0; input.afterburner = s.afterburner;
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
