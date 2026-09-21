/**
 * [OWNER: page-radar-lab] Radar Lab (#/radar): the scan volume made physical. Own jet with its live
 * RadarVolume, scripted bandits at chosen ranges / altitudes / aspects, the jet's radar display showing
 * only what was painted, a 2D side view of the bars, a "Why" panel for any clicked jet, the scan console
 * and five guided exercises. Query params: ?ac=<id> ?units=metric|imperial ?ex=<id> ?t=<preroll s>
 * ?sel=<n> ?cam=34|side|top|behind ?el=<deg> ?azc=<deg> ?w=<±deg> ?bars=<n> ?mode=rws|tws ?cursor=<units> ?pause=1
 * ?shot=<exercise|1> (jump to an interesting moment) ?view=explain (reading section only).
 */
import './style.css';
import { mobileAction } from '../../ui/mobileAction';
import type { Page, PageContext, PageFactory } from '../../app/page';
import { AIRCRAFT } from '../../data/aircraft';
import type { AircraftId, AircraftSpec, RadarModeId } from '../../data/types';
import { World } from '../../sim/world';
import type { Aircraft, EntityId } from '../../sim/types';
import { setManeuver as scriptManeuver } from '../../sim/scenarios';
import { barBand, explainDetection, scanElevationLimits } from '../../sim/radar';
import { buildRadarPicture } from '../../sim/picture';
import { D2R, MPS_PER_KT, R2D, aspectAngle, groundRange, headingOf } from '../../sim/math';
import { fmtAltShort, fmtSpeed, type Units } from '../../app/format';
import { CameraRig, FramePriority, LineBatch, Note, Stage, WorldView, UNIT_PER_M } from '../../render';
import { RadarDisplay } from '../../ui/displays';
import {
  button, callout, cleanup, coachBox, consolePanel, eventLog, h, kbd, labLayout, disclosure, placard, readouts, screenBezel,
  segmented, setText, slider, toast, bindKeys, checklist,
  type ChecklistHandle, type SegmentedHandle, type SliderHandle, type KeyMap,
} from '../../ui';
import {
  alt, azCenterLimitDeg, bugOnlyOptions, elCenterLimitDeg, elevationFor, frameTime, gateText, metresPerDegree,
  patternHalfDeg, revisitTime, rng, rngToM, rngUnit, rngValue, scanFreedom, sdeg, seconds, twsPatterns,
} from './geometry';
import {
  EXERCISES, EXERCISE_DEFS, availableExercises, notchButtons, notchPress, type ExerciseId, type Mem, type ScanPreset, type Scene, type Snap,
} from './exercises';
import { labKeys, type LabKeys } from './labKeys';
import { SideView, type SideTarget } from './sideView';
import { WhyPanel, type WhyData } from './whyPanel';
import { buildExplainer, simplifiedLines } from './explainer';
import {
  PLAYER, buildLabWorld, buildSnap, coverageNow, needsRestart, readScan as readLabScan, updatePaints, type PaintRec,
} from './labSim';

type CamPreset = '34' | 'side' | 'top' | 'behind';
const CAM_VIEWS: Record<CamPreset, { headingDeg: number; elevationDeg: number }> = {
  '34': { headingDeg: 300, elevationDeg: 9 },
  side: { headingDeg: 270, elevationDeg: 2 },
  top: { headingDeg: 0, elevationDeg: 89 },
  behind: { headingDeg: 0, elevationDeg: 6 },
};
const CAM_PAD: Record<CamPreset, number> = { '34': 0.95, side: 0.95, top: 1.05, behind: 1 };
const MODE_SUB: Partial<Record<RadarModeId, string>> = { rws: 'search', tws: 'tracks', vs: 'closure' };
const BEZEL_LABEL = (spec: AircraftSpec): string => {
  switch (spec.display) {
    case 'ru-hud': return 'ИЛС · РЛС';
    case 'f15-vsd': return 'VSD';
    case 'tid': return 'TID';
    case 'vtb': return 'VTB';
    default: return spec.id === 'fa18c' ? 'DDI · RDR ATTK' : spec.id === 'f16c' ? 'MFD · FCR' : 'MFCD · RDR';
  }
};

const factory: PageFactory = (): Page => {
  const bag = cleanup();
  let alive = true;

  const mount = (ctx: PageContext): void => {
    // ---- query overrides (screenshots, deep links) -----------------------------------------------------
    const q = new URLSearchParams(ctx.params);
    // ?shot=<exercise> jumps to an interesting moment of that exercise (screenshots); ?shot=1 is the free scan.
    const shot = q.get('shot');
    if (shot) {
      const SHOT: Record<string, [string, number]> = { '1': ['free', 12], free: ['free', 12], low: ['low', 5], revisit: ['revisit', 5], notch: ['notch', 20], aspect: ['aspect', 25], centre: ['centre', 5] };
      const [ex, t] = SHOT[shot] ?? SHOT.free;
      if (!q.has('ex')) q.set('ex', ex);
      if (!q.has('t')) q.set('t', String(t));
      if (!q.has('sel')) q.set('sel', ex === 'free' ? '3' : '1');
    }
    // ?ac= and ?units= apply once. Drop them from the URL first, or every later remount (the jet picker, the
    // units switch) would switch straight back to them.
    const wantAc = q.get('ac');
    const wantUnits = q.get('units');
    if (wantAc !== null || wantUnits !== null) {
      const rest = new URLSearchParams(ctx.params);
      rest.delete('ac');
      rest.delete('units');
      const qs = rest.toString();
      try { history.replaceState(history.state, '', `#/radar${qs ? '?' + qs : ''}`); } catch { /* sandboxed frame: fine */ }
    }
    if (wantAc && wantAc in AIRCRAFT && wantAc !== ctx.app.aircraft) {
      if (wantUnits === 'metric' || wantUnits === 'imperial') ctx.app.setUnits(wantUnits);
      ctx.app.setAircraft(wantAc as AircraftId);
      return;
    }
    if ((wantUnits === 'metric' || wantUnits === 'imperial') && wantUnits !== ctx.app.units) { ctx.app.setUnits(wantUnits); return; }

    const ac = ctx.app.aircraft;
    const spec = ctx.app.spec;
    const r = spec.radar;
    const units: Units = ctx.app.units;
    const keys: LabKeys = labKeys(ac);
    const freedom = scanFreedom(spec);
    const ru = !!freedom.positions;
    const bug = bugOnlyOptions(ac);
    const pats = twsPatterns(ac);
    const reduced = Stage.prefersReducedMotion();

    // ---- state -----------------------------------------------------------------------------------------
    let world = new World(7);
    let me: Aircraft | undefined;
    let targetIds: EntityId[] = [];
    let exId: ExerciseId = 'free';
    let scene: Scene = EXERCISE_DEFS.free.scene(ac, units);
    let mem: Mem = { latched: [] };
    let doneSaved = false;
    let timeScale = reduced || q.get('pause') === '1' ? 0 : 1;
    let lastScale = 1;
    let selected: EntityId | null = null;
    let camPreset: CamPreset = (['34', 'side', 'top', 'behind'].includes(q.get('cam') ?? '') ? q.get('cam') : '34') as CamPreset;
    const inspected = new Set<EntityId>();
    const paint = new Map<EntityId, PaintRec>();
    let uiClock = 0, sideClock = 0;
    let coachKey = '', coachAt = 0;
    let offWorld: (() => void) | null = null;

    // ---- DOM: console ----------------------------------------------------------------------------------
    const exTitle = h('div', { class: 'rl-extitle' });
    const exShort = h('p', { class: 'rl-exshort' });
    const exSeg = segmented<ExerciseId>({
      id: 'rl-ex', ariaLabel: 'Exercise', value: 'free', fill: true, size: 's',
      options: exOptions(),
      onChange: id => setExercise(id, true),
    });
    const coach = coachBox({ id: 'rl-coach', title: 'Now' });
    const stepsHost = h('div', { class: 'rl-steps' });
    let steps: ChecklistHandle | null = null;
    const resetBtn = button({ label: 'Reset exercise', size: 's', id: 'rl-reset', onClick: () => setExercise(exId, true) });
    const beamBtn = button({ label: 'Bandit: beam', size: 's', id: 'rl-beam', onClick: () => notchCommand('beam') });
    const hotBtn = button({ label: 'Bandit: turn hot', size: 's', id: 'rl-hot', lamp: true, onClick: () => notchCommand('hot') });
    const notchRow = h('div', { class: 'ui-row rl-notchrow' }, beamBtn.el, hotBtn.el);
    const progressEl = h('span', { class: 'rl-progress' });
    const log = eventLog({ id: 'rl-log', max: 30, empty: 'Paints and losses show here.' });
    log.el.style.setProperty('--log-h', '6.5em');

    const exPanel = consolePanel({
      title: 'Exercises', id: 'rl-expanel', actions: progressEl,
      children: [exSeg.el, exTitle, exShort, coach.el, stepsHost, notchRow, h('div', { class: 'ui-row' }, resetBtn.el), disclosure({ title: 'Events', content: log.el })],
    });

    // Radar controls.
    const modeOpts = (['rws', 'tws', 'vs'] as const).filter(m => r.modes.includes(m));
    const modeSeg = segmented<RadarModeId>({
      id: 'rl-mode', label: 'Radar mode', value: 'rws', fill: true,
      options: modeOpts.map(m => ({
        value: m, label: r.modeLabels[m] ?? m.toUpperCase(), sub: MODE_SUB[m], keys: m === 'tws' && keys.mode ? keys.mode.text : undefined,
        title: m === 'tws' && keys.mode
          ? keys.mode.hold ? `Hold ${keys.mode.text} for 1 s to toggle, as in DCS`
            : keys.mode.fallback ? `${keys.mode.text} is the FC3 default, offered as a lab shortcut: the ${spec.short} has no keyboard default for this` : `${keys.mode.text} toggles, as in DCS`
          : undefined,
      })),
      onChange: m => setMode(m),
    });
    const modeNote = !r.tws ? h('p', { class: 'rl-note' }, `No TWS on the ${spec.short}: ${r.modeLabels.rws ?? 'RWS'} search only (PSID is not modelled).`) : null;

    const fieldLabel = (text: string, k?: { text: string; fallback: boolean } | null) =>
      h('span', { class: 'rl-flabel' }, text, k ? h('span', { class: 'rl-fkeys', title: k.fallback ? `FC3 default key: the ${spec.short} has no keyboard default for this` : 'DCS default key' }, kbd(k.text)) : null);

    const twsName = r.modeLabels.tws ?? 'TWS';
    // In TWS, a width or bar count DCS never offers there is disabled, with the reason as the tooltip.
    const twsNoAz = (a: number) => curMode() === 'tws' && (
      (!!r.tws && r.tws.maxAzHalfWidthDeg !== undefined && a > r.tws.maxAzHalfWidthDeg) || (!!pats && !pats.some(([pa]) => pa === a)));
    const twsNoBars = (b: number) => curMode() === 'tws' && (
      (!!r.tws && r.tws.maxBars !== undefined && b > r.tws.maxBars) || (!!pats && !pats.some(([, pb]) => pb === b)));
    const widthOpts = () => r.azHalfWidthOptionsDeg.filter(a => a <= r.gimbalAzDeg).map(a => ({
      value: a, label: `±${a}°`, sub: seconds(frameTime(r, a, curBars())),
      disabled: bug.az.includes(a) || twsNoAz(a),
      title: bug.az.includes(a) ? 'Only in TWS with a bugged target' : twsNoAz(a) ? `Not offered in ${twsName}` : undefined,
    }));
    const barOpts = () => r.barOptions.map(b => ({
      value: b, label: ru ? String(b) : `${b}B`, sub: seconds(frameTime(r, curAz(), b)),
      disabled: bug.bars.includes(b) || twsNoBars(b),
      title: bug.bars.includes(b) ? 'Only in TWS with a bugged target' : twsNoBars(b) ? `Not offered in ${twsName}` : undefined,
    }));
    let widthSeg: SegmentedHandle<number> | null = null;
    let widthSig = '', barsSig = '';
    let barsSeg: SegmentedHandle<number> | null = null;
    const widthEl = freedom.width
      ? (widthSeg = segmented<number>({ id: 'rl-width', label: fieldLabel('Scan width', keys.width), value: r.azHalfWidthOptionsDeg[0], options: widthOpts(), onChange: a => applyScan({ azHalf: a * D2R }) })).el
      : fixedField('Scan width', `${2 * r.azHalfWidthOptionsDeg[0]}°`, 'fixed in DCS');
    const barsEl = freedom.bars
      ? (barsSeg = segmented<number>({ id: 'rl-bars', label: 'Bars', value: r.barOptions[0], options: barOpts(), onChange: b => applyScan({ bars: b }) })).el
      : fixedField('Bars', `${r.barOptions[0]} × ${r.barSpacingDeg}°`, ac === 'f15c' ? 'not selectable in FC3; count assumed' : 'not selectable in FC3; assumed');

    let zoneSeg: SegmentedHandle<number> | null = null;
    let azcSlider: SliderHandle | null = null;
    const zoneEl = ru
      ? (zoneSeg = segmented<number>({
        id: 'rl-zone', label: fieldLabel('Scan zone', keys.zone), value: 0, fill: true,
        options: [
          { value: -30, label: 'Left', sub: '−60…0°' },
          { value: 0, label: 'Centre', sub: '±30°' },
          { value: 30, label: 'Right', sub: '0…+60°' },
        ],
        onChange: v => applyScan({ azCenter: v * D2R }),
      })).el
      : (azcSlider = slider({
        id: 'rl-azc', label: 'Scan centre', min: -30, max: 30, step: 1, value: 0, unit: '°', format: v => sdeg(v, 0), readoutCh: 5,
        hint: keys.zone ? h('span', { class: 'rl-hintkeys' }, kbd(keys.zone.text), keys.zone.fallback ? ' FC3 key' : '') : undefined,
        onInput: v => applyScan({ azCenter: v * D2R }),
      })).el;

    const azcNote = h('p', { class: 'rl-note' });
    if (azcSlider) zoneEl.append(azcNote);
    const elSlider = slider({
      id: 'rl-el', label: 'Antenna elevation', min: -20, max: 20, step: 0.5, value: 0, unit: '°', format: v => sdeg(v), readoutCh: 6,
      onInput: v => { setElevation(v); },
    });
    const elKeyNote = keys.elev?.fallback ? ` (${keys.elev.text} is the FC3 default, offered as a lab shortcut: the ${spec.short} has no keyboard default)` : '';
    const elUp = button({ label: ru ? 'ΔH +' : 'Up', size: 's', id: 'rl-el-up', keys: keys.elev?.a, title: (ru ? 'Height difference +500 m at the expected range' : 'Antenna up 0.5°') + elKeyNote, onClick: () => stepElevation(1) });
    const elDown = button({ label: ru ? 'ΔH −' : 'Down', size: 's', id: 'rl-el-down', keys: keys.elev?.b, title: (ru ? 'Height difference −500 m at the expected range' : 'Antenna down 0.5°') + elKeyNote, onClick: () => stepElevation(-1) });
    const raLine = h('p', { class: 'rl-note rl-ra' });
    const elBlock = h('div', { class: 'rl-elblock' }, elSlider.el, h('div', { class: 'ui-row' }, elUp.el, elDown.el), ru ? raLine : null);

    const rangeSeg = segmented<number>({
      id: 'rl-range', label: fieldLabel(`Display range (${rngUnit(units)})`, keys.range), value: r.rangeScalesKm[0] * 1000, fill: true, size: 's',
      options: r.rangeScalesKm.map(k => ({ value: k * 1000, label: String(Math.round(rngValue(k * 1000, units))) })),
      onChange: m => applyScan({ rangeScale: m }),
    });
    const cursorSlider = slider({
      id: 'rl-cursor', label: ru ? 'Expected range (cursor)' : 'Cursor range', min: 1, max: 100, step: 1, value: 40, unit: rngUnit(units),
      hint: h('span', { class: 'rl-hintkeys' }, ru && keys.expRange ? kbd(keys.expRange.text) : kbd('; / .'), !ru && keys.cursor.fallback ? ' FC3 keys,' : '', ' coverage is read here'),
      onInput: v => (ru ? setExpectedRange(rngToM(v, units)) : applyScan({ cursor: { az: me?.radar.cursor.az ?? 0, range: rngToM(v, units) } })),
    });

    const radarPanel = consolePanel({
      title: `Radar · ${r.name}`, id: 'rl-radar',
      children: [modeSeg.el, modeNote, widthEl, barsEl, zoneEl, elBlock, rangeSeg.el, cursorSlider.el],
    });

    const scanRo = readouts({
      id: 'rl-scan', variant: 'glass',
      rows: [
        { id: 'frame', label: 'Frame time' },
        { id: 'revisit', label: 'Worst revisit' },
        { id: 'top', label: 'Coverage top', title: 'Top of the scan at the cursor range' },
        { id: 'bot', label: 'Coverage bottom', title: 'Bottom of the scan at the cursor range' },
        { id: 'deg', label: '1° at cursor' },
        { id: 'beam', label: 'Beam / bar step' },
        { id: 'height', label: 'Pattern height' },
        { id: 'det', label: 'Sees a fighter', title: `Head-on / tail-on detection range against the radar table's ${r.detectKm.referenceRcsM2 ?? 5} m² reference target (sources under Simplified here)` },
        { id: 'ld', label: 'Look-down' },
        { id: 'gate', label: 'Notch gate' },
      ],
    });
    scanRo.setTone('top', 'hi');
    scanRo.setTone('bot', 'hi');
    const covWhy = h('p', { class: 'rl-note' });
    const numbersPanel = consolePanel({ title: 'Scan numbers', id: 'rl-numbers', children: [scanRo.el, covWhy] });
    const explainer = buildExplainer(ac, units);
    const toExplainer = button({ label: 'How the scan works', variant: 'ghost', size: 's', id: 'rl-howto', onClick: () => explainer.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }) });
    numbersPanel.body.append(h('div', { class: 'ui-row' }, toExplainer.el));
    const simple = callout({ kind: 'simplified', body: h('ul', { class: 'rl-simple' }, simplifiedLines(ac).slice(0, 4).map(l => h('li', null, l))) });

    // ---- DOM: strip ------------------------------------------------------------------------------------
    const radarCv = h('canvas', { 'aria-label': `${spec.short} radar display: only what the radar has painted`, role: 'img' });
    const radarBezel = screenBezel({ label: BEZEL_LABEL(spec), aspect: '1', content: radarCv, id: 'rl-radar-bezel' });
    const sideCv = h('canvas', { 'aria-label': 'Side view of the scan: bars against altitude and range', role: 'img' });
    const sideBezel = screenBezel({ label: 'Side view', aspect: '16 / 9', content: sideCv, id: 'rl-side-bezel', status: 'TRUTH' });
    const why = new WhyPanel(() => cycleSelection());

    // ---- DOM: viewport + layout ------------------------------------------------------------------------
    const viewport = h('div', { class: 'rl-viewport' });
    const mobileButtons = [mobileAction(elDown.el, 'Antenna down'), mobileAction(elUp.el, 'Antenna up'), mobileAction(resetBtn.el, 'Reset')];
    for (const action of mobileButtons) bag.add(() => action.destroy());
    const lab = labLayout({
      id: 'rl-lab', mobileTabs: true,
      mobileActions: mobileButtons.map(action => action.el), class: 'rl-lab',
      header: {
        title: ctx.params.get('lab') === 'free' ? 'Radar practice' : 'Radar lab',
        meta: `${spec.short} · ${r.name} · ${spec.module === 'fc3' ? 'FC3' : spec.developer}`,
        lede: 'Move the scan. Find the contact. See why it disappears.',
      },
      viewport,
      strip: [radarBezel.el, sideBezel.el, why.el],
      console: [exPanel.el, radarPanel.el, disclosure({ title: 'Scan numbers', content: numbersPanel.el }), disclosure({ title: 'Accuracy notes', content: simple })],
    });
    bag.add(() => lab.destroy());
    const camSeg = segmented<CamPreset>({
      id: 'rl-cam', ariaLabel: 'Camera', value: camPreset, size: 's',
      options: [{ value: '34', label: '3/4' }, { value: 'side', label: 'Side' }, { value: 'top', label: 'Top' }, { value: 'behind', label: 'Behind' }],
      onChange: v => { camPreset = v; frameCamera(false); },
    });
    const timeSeg = segmented<number>({
      id: 'rl-time', ariaLabel: 'Time', value: timeScale, size: 's',
      options: [{ value: 0, label: 'Pause', title: 'Pause key' }, { value: 1, label: '1×', title: 'LShift + Z' }, { value: 2, label: '2×', title: 'LCtrl + Z: faster' }, { value: 4, label: '4×', title: 'LCtrl + Z: faster, LAlt + Z: slower' }],
      onChange: v => setTimeScale(v),
    });
    const resetCap = button({ label: 'Reset', size: 's', id: 'rl-reset2', onClick: () => setExercise(exId, true), title: 'Reset the exercise' });
    lab.overlay('tr', timeSeg.el, resetCap.el);
    lab.overlay('bl', camSeg.el);
    lab.overlay('tl', h('p', { class: 'rl-hint' }, 'Click a jet: is it on your scope, and why not?'));
    const explainWrap = h('div', { class: 'rl-exwrap' }, explainer);
    ctx.root.append(lab.el, explainWrap);
    bag.add(() => { lab.el.remove(); explainWrap.remove(); });

    // ---- displays --------------------------------------------------------------------------------------
    const radarDisp = new RadarDisplay(radarCv, { format: spec.display, units, aircraft: ac });
    bag.add(() => radarDisp.dispose());
    const side = new SideView(sideCv);
    bag.add(() => side.dispose());

    // ---- 3D ----------------------------------------------------------------------------------------------
    let stage: Stage | null = null;
    let view: WorldView | null = null;
    let rig: CameraRig | null = null;
    let overlay: LineBatch | null = null;
    let note: Note | null = null;
    try {
      stage = new Stage(viewport, { autoPause: 'render', ariaLabel: `3D view: ${spec.short} radar scan volume and the bandits` });
    } catch (e) {
      console.warn('Radar lab: 3D view unavailable', e);
      stage = null;
    }
    if (stage) {
      const st = stage;
      const narrow = viewport.clientWidth > 0 && viewport.clientWidth < 600;
      bag.add(() => st.dispose());
      view = new WorldView(st, world, {
        units, observer: PLAYER, radarVolumeOf: PLAYER,
        // Phones: no coverage label in 3D (the side view and the readouts carry it), fewer tags to crowd.
        radarVolume: { coverageAt: narrow ? [] : ['cursor'], units },
        layers: { bricks: true, tracks: true, notch: true, aircraftTrails: true },
        aircraftTrailSeconds: 25,
        minJetPx: narrow ? 26 : 40,
        label: (a, u) => a.id === PLAYER
          ? { title: 'You', type: narrow ? '' : spec.short, sub: narrow ? fmtAltShort(a.pos.y, u) : `${fmtAltShort(a.pos.y, u)} · ${fmtSpeed(a.vel.length(), u)}` }
          : narrow
            ? { title: a.callsign, type: '', sub: paint.get(a.id)?.seen ? 'ON SCOPE' : 'OFF SCOPE' }
            : { title: a.callsign, type: AIRCRAFT[a.type].short, sub: `${fmtAltShort(a.pos.y, u)} · ${paint.get(a.id)?.seen ? 'ON SCOPE' : 'OFF SCOPE'}` },
      });
      rig = new CameraRig(st, { source: view });
      overlay = new LineBatch(st.shared, { capacity: 48 });
      st.scene.add(overlay);
      const ov = overlay;
      bag.add(() => { ov.removeFromParent(); ov.dispose(); });
      note = new Note(st.labels, 'r3-left', st.theme.caution);
      const nt = note;
      bag.add(() => nt.dispose());
      bag.add(view.registerLabel(nt, { priority: 1 }));
      bag.add(st.onTap((x, y) => {
        const id = view?.pickEntity(x, y, { kinds: ['aircraft'] }) ?? null;
        select(id && id !== PLAYER ? id : null);
      }));
    }

    // ---- scene -----------------------------------------------------------------------------------------
    function startScene(preset: ScanPreset | null): void {
      offWorld?.();
      const lw = buildLabWorld(ac, units, scene, preset ?? scene.scan);
      world = lw.world;
      me = lw.me;
      targetIds = lw.targetIds;
      paint.clear();
      offWorld = world.on(e => {
        if (e.type === 'ai' && targetIds.includes(e.ownerId)) log.push(e.text, { t: e.t, tone: 'caution' });
      });
      if (view) { view.setWorld(world); view.syncNow(); }
      if (selected && !targetIds.includes(selected)) selected = null;
      view?.select(selected);
      frameCamera(true);
      syncControls();
      uiClock = 1;
    }

    function readScan(): ScanPreset { return me ? readLabScan(me) : scene.scan; }

    function setExercise(id: ExerciseId, reset: boolean): void {
      exId = id;
      const def = EXERCISE_DEFS[id];
      scene = def.scene(ac, units);
      mem = { latched: [] };
      doneSaved = id !== 'free' && ctx.app.getProgress(`radar:${ac}:${id}`) === true;
      inspected.clear();
      selected = null;
      exSeg.set(id);
      setText(exTitle, id === 'free' ? def.title : `${def.num} · ${def.title}`);
      setText(exShort, def.short);
      const na = def.unavailable(ac);
      // An exercise the jet cannot do: the coach says why, no steps to tick.
      stepsHost.hidden = !!na;
      notchRow.hidden = id !== 'notch';
      const st = def.steps(ac, units, {
        elev: keys.elev?.text ?? null, zone: keys.zone?.text ?? null, width: keys.width?.text ?? null,
        cursor: keys.cursor.text, expRange: keys.expRange?.text ?? null,
      });
      steps = checklist({ id: 'rl-steps-' + id, steps: st.map(s => ({ id: s.id, text: s.text, keys: s.keys })) });
      stepsHost.replaceChildren(steps.el);
      log.clear();
      coachKey = '';
      if (na) coach.set(na, 'This jet cannot run this exercise. Pick another one.', 'dim');
      startScene(reset ? null : readScan());
      updateUi(true);
    }

    function notchCommand(m: 'beam' | 'hot'): void {
      const id = targetIds[0];
      if (!id || exId !== 'notch') return;
      if (notchPress(mem, m, world.t)) scriptManeuver(world, id, m, { refId: PLAYER });
      updateUi(true);
    }

    function syncNotchButtons(): void {
      const b = notchButtons(mem);
      beamBtn.setDisabled(b.beam !== null);
      beamBtn.el.title = b.beam ?? 'He turns to put you on his beam';
      hotBtn.setDisabled(b.hot !== null);
      hotBtn.el.title = b.hot ?? 'He turns back toward you';
      hotBtn.setLit(b.hotLit);
    }

    // ---- radar controls --------------------------------------------------------------------------------
    function curMode(): RadarModeId { return me?.radar.mode ?? 'rws'; }
    function curBars(): number { return me?.radar.bars ?? r.barOptions[0]; }
    function curAz(): number { return Math.round((me?.radar.azHalf ?? r.azHalfWidthOptionsDeg[0] * D2R) * R2D); }

    function applyScan(change: Parameters<World['setScan']>[1]): void {
      if (!me) return;
      const before = readScan();
      world.setScan(PLAYER, { ...change, autoCenter: false });
      const after = readScan();
      if (curMode() === 'tws' && change.azHalf !== undefined && after.bars !== before.bars && change.bars === undefined) {
        toast(`${twsName}: ±${after.azHalfDeg}° allows ${after.bars} bar${after.bars > 1 ? 's' : ''} at most`, { within: lab.view, tone: 'caution' });
      } else if (curMode() === 'tws' && change.bars !== undefined && after.azHalfDeg !== before.azHalfDeg && change.azHalf === undefined) {
        toast(`${twsName}: ${after.bars} bars allow ±${after.azHalfDeg}° at most (${seconds(me.radar.frameTime)} per frame)`, { within: lab.view, tone: 'caution' });
      }
      syncControls();
    }

    function setMode(m: RadarModeId): void {
      if (!me) return;
      const before = readScan();
      world.setRadarMode(PLAYER, m);
      world.setScan(PLAYER, { autoCenter: false });
      const after = readScan();
      if (m === 'tws' && (after.azHalfDeg !== before.azHalfDeg || after.bars !== before.bars)) {
        toast(`${r.modeLabels.tws ?? 'TWS'} limits the scan: now ±${after.azHalfDeg}° × ${after.bars} bar${after.bars > 1 ? 's' : ''}, ${seconds(me.radar.frameTime)} per frame`, { within: lab.view, tone: 'caution' });
      }
      syncControls();
      stage?.requestRender();
    }

    function setElevation(deg: number): void { applyScan({ elCenter: deg * D2R }); }

    /** Russian jets step the height difference at the expected range (range-angle aiming); others step 0.5°. */
    function stepElevation(dir: 1 | -1): void {
      if (!me) return;
      const st = me.radar;
      if (ru) {
        const R = Math.max(1000, st.cursor.range);
        const dh = R * Math.tan(st.elCenter) + dir * 500;
        applyScan({ elCenter: elevationFor(dh, R) * D2R });
      } else {
        applyScan({ elCenter: st.elCenter + dir * 0.5 * D2R });
      }
    }

    /** FC3 Russian range-angle aiming: a new expected range keeps the entered height difference, so the tilt changes. */
    function setExpectedRange(rangeM: number): void {
      if (!me) return;
      const st = me.radar;
      const R0 = Math.max(1000, st.cursor.range);
      const dh = R0 * Math.tan(st.elCenter);
      const R1 = Math.max(1000, Math.min(st.rangeScale, rangeM));
      applyScan({ cursor: { az: st.cursor.az, range: R1 }, elCenter: elevationFor(dh, R1) * D2R });
    }

    function stepZone(dir: 1 | -1): void {
      if (!me) return;
      const st = me.radar;
      if (ru) applyScan({ azCenter: Math.max(-30, Math.min(30, Math.round(st.azCenter * R2D / 30) * 30 + dir * 30)) * D2R });
      else applyScan({ azCenter: st.azCenter + dir * 5 * D2R });
    }

    function stepWidth(dir: 1 | -1): void {
      if (!widthSeg) return;
      const opts = widthOpts().filter(o => !o.disabled).map(o => o.value).sort((a, b) => a - b);
      const i = opts.indexOf(curAz());
      const j = Math.max(0, Math.min(opts.length - 1, (i < 0 ? 0 : i) + dir));
      if (opts[j] !== undefined) applyScan({ azHalf: opts[j] * D2R });
    }

    function stepRange(dir: 1 | -1): void {
      if (!me) return;
      const scales = r.rangeScalesKm.map(k => k * 1000);
      const i = scales.indexOf(me.radar.rangeScale);
      const j = Math.max(0, Math.min(scales.length - 1, (i < 0 ? 0 : i) + dir));
      applyScan({ rangeScale: scales[j] });
    }

    function stepCursor(dRange: number, dAz: number): void {
      if (!me) return;
      const c = me.radar.cursor;
      applyScan({ cursor: { az: c.az + dAz, range: Math.max(500, Math.min(me.radar.rangeScale, c.range + dRange)) } });
    }

    function setMode2(): void {
      if (!r.tws || !r.modes.includes('tws')) return;
      const next = curMode() === 'tws' ? 'rws' : 'tws';
      modeSeg.set(next);
      setMode(next);
    }

    function syncControls(): void {
      const st = me?.radar;
      if (!st) return;
      if (modeOpts.includes(st.mode as typeof modeOpts[number])) modeSeg.set(st.mode);
      // Rebuild a selector only when its options changed (a rebuild would steal keyboard focus from the group).
      if (widthSeg) {
        const o = widthOpts(), sig = JSON.stringify(o);
        if (sig !== widthSig) { widthSig = sig; widthSeg.setOptions(o, curAz()); } else widthSeg.set(curAz());
      }
      if (barsSeg) {
        const o = barOpts(), sig = JSON.stringify(o);
        if (sig !== barsSig) { barsSig = sig; barsSeg.setOptions(o, st.bars); } else barsSeg.set(st.bars);
      }
      if (zoneSeg) zoneSeg.set(Math.round(st.azCenter * R2D / 30) * 30);
      if (azcSlider) {
        const lim = azCenterLimitDeg(r, curAz());
        azcSlider.setRange(-lim, lim, 1);
        azcSlider.setDisabled(lim <= 0);
        azcSlider.set(Math.round(st.azCenter * R2D));
        setText(azcNote, lim <= 0 ? `±${curAz()}° already fills the ±${r.gimbalAzDeg}° gimbal: narrow the scan to slew it.` : `Slews ±${lim}° with ±${curAz()}° width.`);
      }
      const elLim = Math.min(30, Math.floor(elCenterLimitDeg(r, st.bars) * 2) / 2);
      elSlider.setRange(-elLim, elLim, 0.5);
      elSlider.set(Math.round(st.elCenter * R2D * 2) / 2);
      rangeSeg.set(st.rangeScale);
      const maxU = Math.round(rngValue(st.rangeScale, units));
      cursorSlider.setRange(1, maxU, 1);
      cursorSlider.set(Math.round(rngValue(st.cursor.range, units)));
      radarBezel.setStatus(r.modeLabels[st.mode] ?? st.mode.toUpperCase());
      uiClock = 1;
    }

    // ---- selection -------------------------------------------------------------------------------------
    function select(id: EntityId | null): void {
      selected = id;
      if (id) inspected.add(id);
      view?.select(id);
      why.show(id ? whyData(id) : null);
      uiClock = 1;
    }
    function cycleSelection(): void {
      const live = targetIds.filter(id => world.get(id)?.alive);
      if (!live.length) return;
      const i = selected ? live.indexOf(selected) : -1;
      select(live[(i + 1) % live.length]);
    }

    radarCv.addEventListener('click', e => {
      const id = radarDisp.pick(e.clientX, e.clientY, 10);
      if (id) { select(id); return; }
      const p = radarDisp.toRadar(e.clientX, e.clientY);
      if (p && me) applyScan({ cursor: { az: p.az, range: Math.max(500, p.range) } });
    });
    sideCv.addEventListener('click', e => {
      const id = side.pick(e.clientX, e.clientY);
      if (id) select(id);
    });

    // ---- camera ----------------------------------------------------------------------------------------
    function frameCamera(instant: boolean): void {
      if (!rig) return;
      const v = CAM_VIEWS[camPreset];
      rig.frame([PLAYER, ...targetIds], { headingDeg: v.headingDeg, elevationDeg: v.elevationDeg, padding: CAM_PAD[camPreset] * (lab.view.clientWidth > 0 && lab.view.clientWidth < 600 ? 1.3 : 1), instant });
    }

    // ---- time ------------------------------------------------------------------------------------------
    function setTimeScale(v: number): void {
      if (v > 0) lastScale = v;
      timeScale = v;
      timeSeg.set(v);
    }

    // ---- keys --------------------------------------------------------------------------------------------
    const keyMap: KeyMap = {};
    const pair = (p: { a: string; b: string } | null, fa: () => void, fb: () => void) => {
      if (!p) return;
      keyMap[p.a] = { down: fa, repeat: true };
      keyMap[p.b] = { down: fb, repeat: true };
    };
    pair(keys.elev, () => stepElevation(1), () => stepElevation(-1));
    pair(keys.zone, () => stepZone(-1), () => stepZone(1));
    pair(keys.width, () => stepWidth(1), () => stepWidth(-1));
    pair(keys.range, () => stepRange(-1), () => stepRange(1));
    pair(keys.expRange, () => me && setExpectedRange(me.radar.cursor.range + 5000), () => me && setExpectedRange(me.radar.cursor.range - 5000));
    const cursorStep = units === 'metric' ? 1000 : 1852;
    keyMap[';'] = { down: () => stepCursor(cursorStep, 0), repeat: true };
    keyMap['.'] = { down: () => stepCursor(-cursorStep, 0), repeat: true };
    keyMap[','] = { down: () => stepCursor(0, -1 * D2R), repeat: true };
    keyMap['/'] = { down: () => stepCursor(0, 1 * D2R), repeat: true };
    if (keys.mode) {
      if (keys.mode.hold) {
        let tm: ReturnType<typeof setTimeout> | null = null;
        keyMap[keys.mode.key] = {
          down: () => { if (tm) clearTimeout(tm); tm = setTimeout(() => { tm = null; setMode2(); }, 1000); },
          up: () => { if (tm) { clearTimeout(tm); tm = null; } },
        };
        bag.add(() => { if (tm) clearTimeout(tm); });
      } else keyMap[keys.mode.key] = () => setMode2();
    }
    keyMap['Pause'] = () => setTimeScale(timeScale > 0 ? 0 : lastScale);
    keyMap['LShift+Z'] = () => setTimeScale(1);
    keyMap['LCtrl+Z'] = () => setTimeScale(timeScale >= 4 ? 4 : timeScale >= 2 ? 4 : timeScale >= 1 ? 2 : 1);
    keyMap['LAlt+Z'] = () => setTimeScale(timeScale <= 1 ? 0 : timeScale / 2);
    bag.add(bindKeys(keyMap));

    // ---- per-frame and 10 Hz work ------------------------------------------------------------------------
    function updatePaintsNow(): void {
      if (!me) return;
      updatePaints(world, me, targetIds, paint, e => {
        const t = world.t;
        if (e.kind === 'first') log.push(`${e.target.callsign} painted at ${rng(e.range, units)}`, { t, tone: 'ok' });
        else if (e.kind === 'lost') log.push(`${e.target.callsign} off the scope: ${e.reason}`, { t, tone: 'caution' });
        else log.push(`${e.target.callsign} back on the scope`, { t, tone: 'ok' });
      });
    }

    function whyData(id: EntityId): WhyData | null {
      const tg = world.get(id);
      if (!me || !tg || !tg.alive) return null;
      const st = me.radar;
      const ex = explainDetection(world, me, tg);
      const lim = scanElevationLimits(spec, st);
      const rec = paint.get(id);
      return {
        callsign: tg.callsign, type: AIRCRAFT[tg.type].short, units,
        range: ex.range, groundRange: groundRange(me.pos, tg.pos), alt: tg.pos.y, ownAlt: me.pos.y,
        aspectDeg: aspectAngle(tg.pos, tg.vel, me.pos) * R2D,
        az: ex.az * R2D, el: ex.el * R2D, azLo: (st.azCenter - st.azHalf) * R2D, azHi: (st.azCenter + st.azHalf) * R2D,
        gimbalAz: r.gimbalAzDeg, top: lim.top * R2D, bottom: lim.bottom * R2D,
        inGimbal: ex.inGimbal, inAz: ex.inAzimuth, inBars: ex.inBars, detectRange: ex.detectRange, beyond: ex.range > ex.detectRange,
        lookDown: ex.lookDown, radial: ex.radialSpeed, gate: ex.notchGate, notched: ex.notched, notchNeedsLookDown: r.notchNeedsLookDown,
        seenNow: !!rec?.seen, lastPaintAgo: rec?.last != null ? world.t - rec.last : null, frame: st.frameTime, radarOff: st.mode === 'off',
        rcs: AIRCRAFT[tg.type].rcsM2,
        vsOpening: st.mode === 'vs' && ex.reasons.some(x => /^VS only/.test(x)),
      };
    }

    function updateReadouts(): void {
      const st = me?.radar;
      if (!me || !st) return;
      const cov = coverageNow(me);
      const at = rng(cov.range, units);
      scanRo.set('frame', seconds(st.frameTime), `±${Math.round(st.azHalf * R2D)}° × ${st.bars}`);
      const rv = revisitTime(st.frameTime, st.bars);
      scanRo.set('revisit', seconds(rv), st.bars % 2 ? 'odd bars' : '');
      const [tv, tu] = splitUnit(alt(cov.top, units));
      const [bv, bu] = splitUnit(alt(Math.max(0, cov.bottom), units));
      scanRo.set('top', tv, `${tu} @ ${at}`);
      scanRo.set('bot', bv, `${bu} @ ${at}`);
      const [dv, du] = splitUnit(alt(metresPerDegree(cov.range), units));
      scanRo.set('deg', dv, du);
      scanRo.set('beam', `${r.beamWidthDeg}° / ${r.barSpacingDeg}°`);
      scanRo.set('height', `${(2 * patternHalfDeg(r, st.bars)).toFixed(1)}°`, `${sdeg(st.elCenter * R2D)} centre`);
      scanRo.set('det', `${rng(r.detectKm.headOn * 1000, units)} / ${rng(r.detectKm.tail * 1000, units)}`, 'hot/cold');
      scanRo.set('ld', r.detectKm.lookDownFactor < 1 ? `hot ×${r.detectKm.lookDownHeadOnFactor ?? r.detectKm.lookDownFactor} / cold ×${r.detectKm.lookDownFactor}` : 'no penalty');
      scanRo.set('gate', gateText(r.notchKts * MPS_PER_KT, units));
      setText(covWhy, `Coverage ≈ range × tan(angle): at ${at} your ${(2 * patternHalfDeg(r, st.bars)).toFixed(1)}° pattern spans ${alt(cov.top - cov.bottom, units)} of altitude, and 1° of tilt moves it ${alt(metresPerDegree(cov.range), units)}.`);
      if (ru) {
        const R = Math.max(1000, st.cursor.range);
        setText(raLine, `Range-angle: height difference ${dAltText(R * Math.tan(st.elCenter))} at ${rng(R, units)}. In the jet you enter these two numbers, not degrees; change the range and the tilt follows.`);
      }
    }

    function dAltText(m: number): string {
      const s = m > 0 ? '+' : m < 0 ? '−' : '';
      return units === 'metric' ? `${s}${(Math.abs(m) / 1000).toFixed(1)} km` : `${s}${(Math.round(Math.abs(m) / 0.3048 / 100) * 100).toFixed(0)} ft`;
    }

    function updateExercise(snap: Snap): void {
      const def = EXERCISE_DEFS[exId];
      const unavailable = def.unavailable(ac);
      if (unavailable) {
        coach.set(unavailable, 'Pick another exercise: this one needs a scan the jet does not have.', 'dim');
        steps?.reset();
        return;
      }
      const ev = def.evaluate(snap, mem);
      if (ev.command) {
        const id = targetIds[ev.command.index];
        if (id) scriptManeuver(world, id, ev.command.maneuver, { refId: PLAYER });
      }
      // Live numbers change every tick: refresh the text on a phase change, else every 1.5 s (no flicker, calm live region).
      const key = `${exId}|${ev.current}|${ev.done}|${ev.tone ?? ''}|${mem.phase ?? ''}`;
      if (key !== coachKey || world.t - coachAt > 1.5 || world.t < coachAt) {
        coachKey = key; coachAt = world.t;
        coach.set(ev.text, ev.why || null, ev.tone ?? null);
      }
      if (steps) {
        ev.steps.forEach((d, i) => steps?.setDone(i, d));
        steps.setCurrent(ev.current);
      }
      if (exId === 'notch') syncNotchButtons();
      if (ev.done && exId !== 'free' && !doneSaved) {
        doneSaved = true;
        ctx.app.setProgress(`radar:${ac}:${exId}`, true);
        toast(`Exercise ${def.num} done: ${def.title}`, { within: lab.view, tone: 'ok' });
        const all = availableExercises(ac).every(id => ctx.app.getProgress(`radar:${ac}:${id}`) === true);
        if (all) ctx.app.setProgress(`radar:${ac}:done`, true);
        exSeg.setOptions(exOptions(), exId);
        updateProgress();
      }
    }

    function exOptions() {
      return [
        { value: 'free' as ExerciseId, label: 'Free', sub: 'play', title: EXERCISE_DEFS.free.short },
        ...EXERCISES.map(id => {
          const d = EXERCISE_DEFS[id];
          const done = ctx.app.getProgress(`radar:${ac}:${id}`) === true;
          const na = d.unavailable(ac) !== null;
          return { value: id as ExerciseId, label: String(d.num), sub: na ? 'n/a' : done ? 'done' : '\u00a0', title: `${d.num}. ${d.title}${na ? ' (not on this jet)' : done ? ' (done)' : ''}` };
        }),
      ];
    }

    function updateProgress(): void {
      const av = availableExercises(ac);
      const n = av.filter(id => ctx.app.getProgress(`radar:${ac}:${id}`) === true).length;
      setText(progressEl, `${n} / ${av.length} done`);
    }

    function updateUi(force = false): void {
      if (!me) return;
      updatePaintsNow();
      updateExercise(buildSnap(world, me, units, scene, targetIds, paint, inspected, selected));
      updateReadouts();
      why.show(selected ? whyData(selected) : null);
      if (force) stage?.requestRender();
    }

    function checkRestart(): void {
      if (!me || !needsRestart(world, me, targetIds, scene)) return;
      const keep = readScan();
      if (exId === 'notch' && mem.phase !== 'done') { mem.phase = 'hot'; mem.since = undefined; }
      mem.okSince = null;
      startScene(keep);
      toast('Scene restarted: the bandits are back at their start points', { within: lab.view, tone: 'dim', ms: 2400 });
    }

    function drawSide(): void {
      const st = me?.radar;
      if (!me || !st) return;
      const lim = scanElevationLimits(spec, st);
      const bands: [number, number][] = [];
      for (let b = 0; b < st.bars; b++) bands.push(barBand(spec, st, b));
      const opp = world.get(targetIds[0]);
      const oppType = opp?.type ?? ac;
      const rcs = Math.pow(Math.max(AIRCRAFT[oppType].rcsM2, 0.01) / (r.detectKm.referenceRcsM2 ?? 5), 0.25);
      const targets: SideTarget[] = [];
      for (const id of targetIds) {
        const tg = world.get(id);
        if (!tg || !tg.alive) continue;
        const ex = explainDetection(world, me, tg);
        const rec = paint.get(id);
        targets.push({
          id, label: tg.callsign, groundRange: groundRange(me.pos, tg.pos), alt: tg.pos.y, selected: id === selected,
          state: rec?.seen ? 'seen' : ex.inGimbal && ex.inAzimuth ? 'scan' : 'out',
        });
      }
      side.draw({
        units, ownAlt: me.pos.y, rangeMax: st.rangeScale, bands, currentBar: st.bar, beamEl: st.beamEl, top: lim.top, bottom: lim.bottom,
        cursorRange: st.cursor.range, detectUp: r.detectKm.headOn * 1000 * rcs, detectDown: r.detectKm.headOn * (r.detectKm.lookDownHeadOnFactor ?? r.detectKm.lookDownFactor) * 1000 * rcs,
        targets, radarOn: st.mode !== 'off',
      });
    }

    function drawSelection(): void {
      if (!overlay || !stage) return;
      const L = overlay;
      L.reset();
      const tg = selected ? world.get(selected) : undefined;
      let noteText = '';
      if (me && tg && tg.alive) {
        const P = stage.palette;
        const ex = explainDetection(world, me, tg);
        const seen = !!paint.get(tg.id)?.seen;
        const c = seen ? P.sym : P.caution;
        const k = UNIT_PER_M;
        const a = me.pos, b = tg.pos;
        L.seg(a.x * k, a.y * k, a.z * k, b.x * k, b.y * k, b.z * k, c.r, c.g, c.b, 0.85, c.r, c.g, c.b, 0.85, 1.4, seen ? 0 : 10, seen ? 0 : 30, 0.55);
        const gr = groundRange(a, b);
        const lim = scanElevationLimits(spec, me.radar);
        const w = P.warning;
        if (!ex.inBars) {
          const edge = ex.el > lim.top ? lim.top : lim.bottom;
          const ey = a.y + gr * Math.tan(edge);
          L.seg(b.x * k, b.y * k, b.z * k, b.x * k, ey * k, b.z * k, w.r, w.g, w.b, 0.9, w.r, w.g, w.b, 0.9, 1.6, 6, 0, 0.55);
          L.seg(b.x * k - 0.6, ey * k, b.z * k, b.x * k + 0.6, ey * k, b.z * k, w.r, w.g, w.b, 0.9, w.r, w.g, w.b, 0.9, 2);
          noteText = `${Math.abs((ex.el - edge) * R2D).toFixed(1)}° ${ex.el > lim.top ? 'above' : 'below'} the bars`;
          note?.obj.position.set(b.x * k, ((b.y + ey) / 2) * k, b.z * k);
        } else if (ex.range > ex.detectRange) {
          const brg = headingOf({ x: b.x - a.x, z: b.z - a.z });
          const R = Math.sqrt(Math.max(0, ex.detectRange * ex.detectRange - (b.y - a.y) ** 2));
          let px = 0, pz = 0;
          for (let i = 0; i <= 12; i++) {
            const h0 = brg + ((i - 6) / 6) * 6 * D2R;
            const x = (a.x + Math.sin(h0) * R) * k, z = (a.z - Math.cos(h0) * R) * k;
            if (i > 0) L.seg(px, b.y * k, pz, x, b.y * k, z, w.r, w.g, w.b, 0.9, w.r, w.g, w.b, 0.9, 1.8);
            px = x; pz = z;
          }
          noteText = `radar sees him from ${rng(ex.detectRange, units)}`;
          note?.obj.position.set((a.x + Math.sin(brg) * R) * k, b.y * k, (a.z - Math.cos(brg) * R) * k);
        } else if (ex.notched) {
          noteText = `notch: ${Math.round(ex.radialSpeed / MPS_PER_KT)} kt radial`;
          note?.obj.position.set(b.x * k, b.y * k, b.z * k);
        }
      }
      L.commit();
      if (note) { note.set(noteText); note.visible = !!noteText; }
    }

    // ---- loop ----------------------------------------------------------------------------------------------
    const frame = (dt: number): void => {
      if (!alive || !me) return;
      if (dt > 0 && timeScale > 0) world.step(Math.min(dt, 0.1) * timeScale);
      radarDisp.draw(buildRadarPicture(world, PLAYER, { units }), { ownHeading: me.heading });
      sideClock += dt;
      if (sideClock >= 1 / 30) { sideClock = 0; drawSide(); }
      drawSelection();
      uiClock += dt;
      if (uiClock >= 0.1) {
        uiClock = 0;
        updateUi();
        checkRestart();
      }
    };
    if (stage) {
      bag.add(stage.onFrame(dt => frame(dt), { priority: FramePriority.sim }));
    } else {
      let raf = 0, last = performance.now();
      const loop = (now: number) => { const dt = Math.min(0.1, (now - last) / 1000); last = now; frame(dt); raf = requestAnimationFrame(loop); };
      raf = requestAnimationFrame(loop);
      bag.add(() => cancelAnimationFrame(raf));
      viewport.append(h('p', { class: 'rl-nogl' }, 'The 3D view needs WebGL. The radar display, side view and exercises still work.'));
    }
    bag.add(() => { offWorld?.(); offWorld = null; });

    // ---- start -------------------------------------------------------------------------------------------
    updateProgress();
    const wantEx = q.get('ex') as ExerciseId | null;
    setExercise(wantEx && wantEx in EXERCISE_DEFS ? wantEx : 'free', true);
    // Deep-link scan overrides (screenshots): ?mode= ?w= ?bars= ?azc= ?el= ?cursor=
    const num = (k: string) => { const v = q.get(k); return v !== null && v !== '' && isFinite(Number(v)) ? Number(v) : null; };
    const qm = q.get('mode');
    if (qm === 'tws' || qm === 'rws' || qm === 'vs') setMode(qm);
    const ch: Parameters<World['setScan']>[1] = {};
    if (num('w') !== null) ch.azHalf = (num('w') ?? 0) * D2R;
    if (num('bars') !== null) ch.bars = num('bars') ?? undefined;
    if (num('azc') !== null) ch.azCenter = (num('azc') ?? 0) * D2R;
    if (num('el') !== null) ch.elCenter = (num('el') ?? 0) * D2R;
    if (num('cursor') !== null && me) ch.cursor = { az: 0, range: rngToM(num('cursor') ?? 0, units) };
    if (Object.keys(ch).length) applyScan(ch);
    const pre = Math.min(240, num('t') ?? 0);
    for (let s = 0; s < pre; s += 1 / 30) {
      world.step(1 / 30);
      view?.syncNow();
      uiClock += 1 / 30;
      if (uiClock >= 0.1) { uiClock = 0; updateUi(); }
    }
    const sel = num('sel');
    if (sel !== null && targetIds[sel - 1]) select(targetIds[sel - 1]);
    if (q.get('view') === 'explain') lab.el.style.display = 'none'; // screenshot aid: the reading section alone
    if (reduced && timeScale === 0) toast('Paused for reduced motion: press 1× to run the scene', { within: lab.view, tone: 'dim', ms: 4000 });
    updateUi(true);
    frameCamera(true);
  };

  return {
    mount(ctx) { mount(ctx); },
    unmount() {
      alive = false;
      bag.dispose();
    },
  };
};

/** A read-only field for scan settings the jet cannot change. */
function fixedField(label: string, value: string, note: string): HTMLElement {
  return h('div', { class: 'ui-field rl-fixed' }, placard(label, { tag: 'div' }), h('div', { class: 'rl-fixed__val' }, h('b', null, value), h('span', null, note)));
}

/** '41,200 ft' → ['41,200', 'ft']. */
function splitUnit(s: string): [string, string] {
  const i = s.lastIndexOf(' ');
  return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)];
}

export default factory;
