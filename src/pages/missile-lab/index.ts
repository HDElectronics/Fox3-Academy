/**
 * [OWNER: page-missile-lab] Missile Lab (#/missiles): launch zones as DCS plays them.
 * Set up a shot (missile, shooter and target altitude/speed, aspect, target manoeuvre, reaction delay,
 * launch range against the live Rmin / Rne / Rmax marks), fly it with the game missile model
 * (sim/dlz simulateShot), play it back in 3D, plot speed / altitude / range against time, compare up to
 * three shots, and see how Rmax and Rne move with altitude and speed.
 *
 * URL params: ?ac=<aircraft> (select the jet once), ?m=<missile>, ?shot=<preset id | fire>,
 * &t=<seconds> (pause the playback there), &cam=side|orbit|missile|top, &man=<manoeuvre>, &aspect=hot|flank|beam|cold.
 */
import './style.css';
import { mobileAction } from '../../ui/mobileAction';
import type { Page, PageContext, PageFactory } from '../../app/page';
import type { AircraftId, MissileId } from '../../data/types';
import { AIRCRAFT, AIRCRAFT_CAVEATS, MISSILES, MISSILE_REF_NOTE } from '../../data';
import type { Dlz } from '../../sim/types';
import type { ShotResult } from '../../sim/dlz';
import { readTheme } from '../../ui/theme';
import {
  append, bindKeys, button, callout, checklist, cleanup, coachBox, consolePanel, group, h, kbd, labLayout, disclosure, placard,
  readouts, screenBezel, segmented, select, setText, slider, toast, toggle, clearToasts,
  type ButtonHandle, type SegmentedHandle, type SliderHandle, type SliderOptions,
} from '../../ui';
import type { Units } from '../../app/format';
import {
  ASPECTS, ASPECT_DEG, LIMITS, MANEUVERS, PRESET_IDS, presetTitle, altFromUser, altToUser, buildPreset, cueNames,
  defaultMissile, defaultSetup, dlzAt, flyShot, guidanceRuleFor, fmtAltU, fmtDist, fmtR, launchKey, missileChoices, rangeFromUser,
  rangeSliderMax, rangeToUser, rangeUnit, seekerWord, shooterTypeFor, targetTypeFor, weaponStepKey, zonePlace,
  type Aspect, type CueNames, type LabSetup, type PresetId,
} from './model';
import { presetTakeaway, reasonHeadline, summarize, type ShotSummary } from './lessons';
import { shotRecording, type ShotRecording } from './frames';
import { rangeSearch, runChunked, type ChunkRun } from './exact';
import { DlzChart, EnergyChart, TimePlot, type PlotLine, type PlotMark, type TimePlotData } from './plots';
import { ShotScene, type CamMode, type SceneShot } from './scene';
import { M_PER_FT } from '../../sim/math';
import type { TargetManeuver } from '../../sim/dlz';
import type { PhoenixLaunchMode } from '../../sim/types';
import { irAcquisitionRange } from '../../sim/launch';

const LETTERS = ['A', 'B', 'C'];
const DASHES: number[][] = [[], [7, 4], [2, 3]];
const MAX_KEPT = 3;

interface Kept {
  id: number;
  slot: number;
  setup: LabSetup;
  result: ShotResult;
  dlz: Dlz;
  sum: ShotSummary;
  rec: ShotRecording;
  name: string | null;
  preset: PresetId | null;
  /** Counted toward the drill (user-fired, not the opening demo shot). */
  counted: boolean;
}

const MAN_LABEL: Record<TargetManeuver, string> = {
  none: 'None', 'turn-cold': 'Turn cold', beam: 'Beam', crank: 'Crank', 'notch-chaff': 'Notch + chaff',
};
const MAN_SUB: Record<TargetManeuver, string> = {
  none: 'flies on', 'turn-cold': 'runs, AB', beam: 'missile 3/9', crank: 'you 55° off', 'notch-chaff': 'beam, dive',
};
/** Few-word miss reason for tight spots (energy chart). */
function shortReason(reason: string): string {
  return ({ kinematic: 'no energy', timeout: 'battery', notched: 'notched', chaff: 'chaff', flare: 'flare', overshoot: 'out-turned',
    'no-acquisition': 'no lock', ground: 'ground', 'lost-guidance': 'no guidance' } as Record<string, string>)[reason] ?? reason;
}
const ASPECT_LABEL: Record<Aspect, string> = { hot: 'Hot', flank: 'Flank', beam: 'Beam', cold: 'Cold' };

const factory: PageFactory = (): Page => {
  const bag = cleanup();
  let raf = 0;
  let scene: ShotScene | null = null;
  let exactRun: ChunkRun | null = null;
  const plots: { dispose(): void }[] = [];

  return {
    mount(ctx: PageContext) {
      // ?ac=<id>: select the jet once. Drop it from the URL first, or every later remount (the top-bar jet
      // picker, units) would switch straight back to it. The router remounts the page for the new jet.
      const acParam = ctx.params.get('ac') as AircraftId | null;
      if (acParam !== null) {
        const rest = new URLSearchParams(ctx.params);
        rest.delete('ac');
        const qs = rest.toString();
        try { history.replaceState(history.state, '', `#/missiles${qs ? '?' + qs : ''}`); } catch { /* sandboxed frame: fine */ }
        if (AIRCRAFT[acParam] && acParam !== ctx.app.aircraft) { ctx.app.setAircraft(acParam); return; }
      }

      const ac = ctx.app.aircraft;
      const spec = ctx.app.spec;
      const u: Units = ctx.app.units;
      const theme = readTheme();
      const SLOT_COLORS = [theme.symHi, theme.datalink, theme.missile];
      const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      const mParam = ctx.params.get('m') as MissileId | null;
      const startMissile = mParam && MISSILES[mParam] ? mParam : defaultMissile(ac);

      // ------------------------------------------------------------------ state
      let setup: LabSetup = defaultSetup(ac, u, startMissile);
      let cues: CueNames = cueNames(ac, setup.missile);
      let dlz: Dlz = dlzAt(setup);
      let exact: { key: string; rmax: number; rne: number } | null = null;
      let exactKey = '';
      const kept: Kept[] = [];
      let nextId = 1;
      let selected: number | null = null;
      let playing = false;
      let speed = 4;
      let t = 0;
      let cam: CamMode = 'side';
      let takeaway: { ids: number[]; text: string } | null = null;
      let fired = 0;
      let rneDone = false;
      const doneKey = `missiles:${ac}:done`;
      let complete = ctx.app.getProgress(doneKey) === true;

      const realFireKey = launchKey(ac);
      const fireKey = realFireKey ?? 'Space';
      const stepKey = weaponStepKey(ac);
      const UNIT = rangeUnit(u);

      // ------------------------------------------------------------------ 3D viewport
      const view3d = h('div', { class: 'ml-view' });

      // ------------------------------------------------------------------ result card
      const coach = coachBox({ id: 'ml-result', title: 'NO SHOT YET', text: 'Set up a shot and press FIRE, or try a preset.', tone: 'dim' });
      const coachTitle = coach.el.querySelector('.ui-coach__title');
      const res = readouts({ id: 'ml-res', variant: 'glass', columns: 2, rows: [
        { id: 'tof', label: 'Flight', title: 'Time of flight' },
        { id: 'end', label: 'Impact', title: 'Mach at impact (or at the end of a miss)' },
        { id: 'miss', label: 'Miss by', title: 'Closest approach to the target' },
        { id: 'g', label: 'g left', title: 'How hard the missile could still turn at the end' },
        { id: 'pit', label: 'Pitbull', title: 'Seeker active (ARH), seconds after launch' },
        { id: 'zone', label: 'Launch', title: 'Launch range and where it sat in the zone' },
      ] });
      const cueNoteEl = h('p', { class: 'ml-note-line', hidden: true });
      const takeawayEl = h('p', { class: 'ml-takeaway', hidden: true });
      const resultPanel = consolePanel({ id: 'ml-result-panel', title: 'Result', children: [coach.el, res.el, cueNoteEl, takeawayEl] });

      // ------------------------------------------------------------------ presets + drill
      const jetCues = cueNames(ac, startMissile);   // Rmax / Rne words depend only on the jet
      const presetBtns = PRESET_IDS.map(id => button({
        id: 'ml-preset-' + id, label: presetTitle(id, jetCues), size: 's', block: true, keepCase: true, class: 'ml-preset',
        onClick: () => { runPreset(id); showView(); },
      }));
      const drill = checklist({ id: 'ml-drill', steps: [
        { id: 'three', text: 'Fire three shots', note: 'Any setup or preset.' },
        { id: 'rne', text: `Fly the ${jetCues.rne} shot preset`, note: 'See a target that runs and still dies.' },
      ] });
      const drillNote = h('p', { class: 'ml-small' });
      const presetPanel = consolePanel({ id: 'ml-presets', title: 'Presets', children: [
        h('p', { class: 'ml-small' }, 'One click sets up and fires. Two-shot presets replace the comparison.'),
        h('div', { class: 'ml-presets' }, presetBtns.map(b => b.el)),
        placard('Drill', { tag: 'div' }),
        drill.el, drillNote,
      ] });

      // ------------------------------------------------------------------ setup console
      const { own, other } = missileChoices(ac);
      const optLabel = (m: MissileId) => `${MISSILES[m].name} · Fox ${MISSILES[m].fox}`;
      const missileSel = select<MissileId>({
        id: 'ml-missile', label: 'Missile', value: setup.missile,
        options: [
          ...own.map(m => ({ value: m, label: optLabel(m), group: `${spec.short} missiles` })),
          ...other.map(m => ({ value: m, label: optLabel(m), group: 'Other jets (comparison)' })),
        ],
        onChange: m => { setup = { ...setup, missile: m, loftOff: false }; onMissileChanged(); },
      });
      const missileInfo = h('p', { class: 'ml-small ml-minfo' });

      const altUnit = u === 'metric' ? 'km' : 'ft';
      const altOpts = (id: string, label: string, v: number): SliderOptions => ({
        id, label,
        min: u === 'metric' ? LIMITS.altMin / 1000 : 2, max: u === 'metric' ? LIMITS.altMax / 1000 : 49, step: u === 'metric' ? 0.5 : 1,
        value: round(altToUser(v, u), u === 'metric' ? 0.5 : 1), unit: altUnit, readoutCh: 6,
        format: x => (u === 'metric' ? x.toFixed(1) : (x * 1000).toFixed(0)),
      });
      const sAlt = slider({ ...altOpts('ml-salt', 'Altitude', setup.shooterAlt), onInput: v => { setup.shooterAlt = altFromUser(v, u); onSetup(); } });
      const sMach = slider({ id: 'ml-smach', label: 'Mach', min: LIMITS.machMin, max: LIMITS.machMax, step: 0.05, value: setup.shooterMach, readoutCh: 4,
        format: x => x.toFixed(2), onInput: v => { setup.shooterMach = v; onSetup(); } });
      const tAlt = slider({ ...altOpts('ml-talt', 'Altitude', setup.targetAlt), onInput: v => { setup.targetAlt = altFromUser(v, u); onSetup(); } });
      const tMach = slider({ id: 'ml-tmach', label: 'Mach', min: LIMITS.tMachMin, max: LIMITS.tMachMax, step: 0.05, value: setup.targetMach, readoutCh: 4,
        format: x => x.toFixed(2), onInput: v => { setup.targetMach = v; onSetup(); } });
      const aspectSeg = segmented<Aspect>({
        id: 'ml-aspect', label: 'Target aspect', value: setup.aspect, fill: true, size: 's',
        options: ASPECTS.map(a => ({ value: a, label: ASPECT_LABEL[a], sub: ASPECT_DEG[a] + '°' })),
        onChange: a => { setup.aspect = a; onSetup(); },
      });
      const manSeg = segmented<TargetManeuver>({
        id: 'ml-man', label: 'After launch he…', value: setup.maneuver, fill: true, size: 's',
        options: MANEUVERS.map(m => ({ value: m, label: MAN_LABEL[m], sub: MAN_SUB[m] })),
        onChange: m => { setup.maneuver = m; syncReact(); onSetup(); },
      });
      const react = slider({ id: 'ml-react', label: 'Reaction delay', min: 0, max: LIMITS.reactMax, step: 1, value: setup.reactAfter, unit: 's', readoutCh: 2,
        onInput: v => { setup.reactAfter = v; onSetup(); } });
      const loftSw = toggle({ id: 'ml-loft', label: 'Loft', style: 'switch', value: true, states: ['Off · what-if', 'Auto · DCS'],
        onChange: v => { setup.loftOff = !v; onSetup(); } });
      const loftHint = h('p', { class: 'ml-small' });
      const supportSeg = segmented<'perfect' | 'radar'>({
        id: 'ml-support', label: 'Shooter radar support', value: setup.support ?? 'perfect', fill: true, size: 's',
        options: [{ value: 'perfect', label: 'Perfect', sub: 'Range comparison' }, { value: 'radar', label: 'Radar model', sub: 'Lock can break' }],
        onChange: v => { setup.support = v; onSetup(); syncManLabels(); },
      });
      const phoenixSeg = segmented<PhoenixLaunchMode>({
        id: 'ml-phoenix', label: 'Phoenix launch mode', value: setup.phoenixLaunchMode ?? 'tws', fill: true, size: 's',
        options: [{ value: 'tws', label: 'TWS' }, { value: 'pd-stt', label: 'PD-STT' }, { value: 'p-stt', label: 'P-STT' }, { value: 'ph-act', label: 'PH ACT' }],
        onChange: v => { setup.phoenixLaunchMode = v; onSetup(); },
      });
      const supportHint = h('p', { class: 'ml-small' }, 'Radar model uses a pre-acquired track. Against semi-active shots, Beam and Notch put the shooter on the target’s beam. Range marks and Compute exactly assume perfect support.');
      const phoenixHint = h('p', { class: 'ml-small' }, 'TWS: support to active. PD-STT: support to impact. P-STT, PH ACT or under 10 nm: active at launch, no loft. Pulse radar detection is simplified; TGTS uses NORM.');


      // launch range slider with the zone band
      const rOpts: SliderOptions = {
        id: 'ml-range', label: 'Launch range', min: 0.5, max: rangeSliderMax(dlz, u), step: 0.5,
        value: round(rangeToUser(setup.range, u), 0.5), unit: UNIT, readoutCh: 5, format: x => x.toFixed(1),
        onInput: v => { setup.range = rangeFromUser(v, u); onRange(); },
      };
      const rangeSl = slider(rOpts);
      const zoneText = h('p', { class: 'ml-zone-text', 'aria-live': 'polite' });
      const exactBtn = button({ id: 'ml-exact', label: 'Compute exactly', size: 's', onClick: () => computeExact(),
        title: 'Fly the missile many times at these exact conditions and bisect for Rmax and Rne' });
      const exactOut = h('p', { class: 'ml-small ml-exact-out' });
      const fireBtn = button({ id: 'ml-fire', label: 'Fire', variant: 'primary', size: 'l', block: true, keys: fireKey, onClick: () => fireCurrent() });

      const setupPanel = consolePanel({
        id: 'ml-setup', title: 'Shot setup',
        actions: button({ label: 'Reset', variant: 'ghost', size: 's', onClick: () => resetSetup() }).el,
        children: [
          h('div', { class: 'ml-mrow' }, missileSel.el, stepKey ? h('span', { class: 'ml-step' }, kbd(stepKey), h('span', null, 'next missile')) : null),
          missileInfo,
          disclosure({ title: 'Flight conditions and support', content: [h('div', { class: 'ml-pair' },
            group({ label: 'Shooter (you)', children: [sAlt.el, sMach.el] }),
            group({ label: 'Target', children: [tAlt.el, tMach.el] })),
          aspectSeg.el,
          supportSeg.el, supportHint, phoenixSeg.el, phoenixHint,
          manSeg.el,
          react.el,
          h('div', { class: 'ml-loft' }, loftSw.el, loftHint)] }),
          h('div', { class: 'ml-range' }, rangeSl.el, zoneText, h('div', { class: 'ml-exact' }, exactBtn.el, exactOut)),
          fireBtn.el,
          realFireKey ? null : h('p', { class: 'ml-small' }, `Space fires here. The ${spec.short}'s trigger has no verified keyboard default in DCS: bind it yourself.`),
        ],
      });

      // ------------------------------------------------------------------ compare list
      const compareList = h('ol', { class: 'ml-compare', 'aria-label': 'Kept shots' });
      const comparePanel = consolePanel({
        id: 'ml-compare-panel', title: 'Compare (up to 3)',
        actions: button({ label: 'Clear', variant: 'ghost', size: 's', onClick: () => clearShots() }).el,
        children: [compareList],
      });

      // ------------------------------------------------------------------ DLZ chart
      const dlzCanvas = h('canvas', { class: 'ml-dlz-canvas' });
      let dlzAxis: 'alt' | 'mach' = 'alt';
      const dlzSeg = segmented<'alt' | 'mach'>({ id: 'ml-dlzx', ariaLabel: 'Chart axis', value: 'alt', size: 's', fill: true,
        options: [{ value: 'alt', label: 'vs your altitude' }, { value: 'mach', label: 'vs your Mach' }],
        onChange: v => { dlzAxis = v; drawDlz(); } });
      const dlzBezel = screenBezel({ id: 'ml-dlz', label: 'Launch zone', aspect: '4 / 3', content: dlzCanvas });
      const dlzCaption = h('p', { class: 'ml-small' });
      const dlzPanel = consolePanel({ id: 'ml-dlz-panel', title: `${jetCues.rmax} and ${jetCues.rne}`, children: [dlzSeg.el, dlzBezel.el, dlzCaption] });

      // ------------------------------------------------------------------ cue explainer + simplified
      const cueBody = h('div', { class: 'ml-cues' });
      const cuePanel = consolePanel({ id: 'ml-cues-panel', title: `${spec.short} launch cues`, children: [cueBody] });
      const simplifiedBody = h('div');
      const simplified = callout({ kind: 'simplified', body: simplifiedBody });

      // ------------------------------------------------------------------ strip: plots
      const mkPlot = (id: string, label: string) => {
        const cv = h('canvas', { class: 'ml-plot-canvas' });
        const bz = screenBezel({ id, label, content: cv, class: 'ml-plot' });
        return { cv, bz };
      };
      const pMach = mkPlot('ml-p-mach', 'Missile Mach');
      const pAlt = mkPlot('ml-p-alt', 'Altitude');
      const pRange = mkPlot('ml-p-range', 'Range to target');
      const pEnergy = mkPlot('ml-p-energy', 'Energy at the end');
      const scrub = (x: number) => { setTime(x); setPlaying(false); };
      const machPlot = new TimePlot(pMach.cv, { yTitle: 'MACH', yFmt: v => v.toFixed(v % 1 === 0 ? 0 : 1), valueFmt: v => v.toFixed(2), empty: 'Fire a shot to plot it', onScrub: scrub, ariaLabel: 'Missile Mach against time' });
      const altScale = u === 'metric' ? 1000 : 1000 * M_PER_FT;
      const altPlot = new TimePlot(pAlt.cv, { yTitle: u === 'metric' ? 'ALT km' : 'ALT kft', yUnit: altScale, yFmt: v => (v / altScale).toFixed(0), valueFmt: v => (v / altScale).toFixed(1),
        empty: 'Solid missile, dotted target', onScrub: scrub, ariaLabel: 'Missile and target altitude against time' });
      const rangePlot = new TimePlot(pRange.cv, { yTitle: 'RANGE ' + UNIT, yUnit: rangeFromUser(1, u), yFmt: v => rangeToUser(v, u).toFixed(0), valueFmt: v => rangeToUser(v, u).toFixed(1),
        empty: 'Missile to target distance', onScrub: scrub, ariaLabel: 'Range from missile to target against time' });
      const energy = new EnergyChart(pEnergy.cv, 'Impact speed and g left');
      plots.push(machPlot, altPlot, rangePlot, energy);

      // ------------------------------------------------------------------ playbar + camera
      const playBtn: ButtonHandle = button({ id: 'ml-play', label: 'Play', size: 's', keys: 'P', onClick: () => setPlaying(!playing) });
      const timeSl: SliderHandle = slider({ id: 'ml-time', label: 'Time', min: 0, max: 60, step: 0.25, value: 0, unit: 's', readoutCh: 5,
        format: x => x.toFixed(0), onInput: v => { setTime(v); setPlaying(false); } });
      const speedSeg: SegmentedHandle<number> = segmented<number>({ id: 'ml-speed', ariaLabel: 'Playback speed', value: speed, size: 's',
        options: [1, 2, 4, 8].map(x => ({ value: x, label: x + '×', title: 'LCtrl+Z faster, LAlt+Z slower, LShift+Z normal' })),
        onChange: v => { speed = v; } });
      const timeOut = h('output', { class: 'ml-playbar__clock', for: 'ml-time' }, '0 s');
      const playbar = h('div', { class: 'ml-playbar ui-surface', role: 'group', 'aria-label': 'Playback' },
        playBtn.el, timeOut, h('div', { class: 'ml-playbar__time' }, timeSl.el), speedSeg.el,
        h('span', { class: 'ml-playbar__keys' }, kbd('LCtrl+Z / LAlt+Z')));
      const camSeg = segmented<CamMode>({ id: 'ml-cam', ariaLabel: 'Camera', value: cam, size: 's',
        options: [{ value: 'side', label: 'Side' }, { value: 'orbit', label: 'Orbit' }, { value: 'missile', label: 'Missile' }, { value: 'top', label: 'Top' }],
        onChange: m => { cam = m; scene?.setCamera(m); } });
      const legend = h('div', { class: 'ml-legend', 'aria-hidden': 'true' });

      // ------------------------------------------------------------------ layout
      const mobileButtons = [mobileAction(fireBtn.el), mobileAction(playBtn.el)];
      for (const action of mobileButtons) bag.add(() => action.destroy());
      const lab = labLayout({
        id: 'ml-lab', class: 'ml', mobileTabs: true,
        mobileActions: mobileButtons.map(action => action.el),
        header: {
          title: ctx.params.get('lab') === 'free' ? 'Missile practice' : 'Missile lab',
          meta: `${spec.short} · launch zones`,
          lede: 'Set up a shot. Fly it in 3D. Compare the outcome.',
        },
        viewport: view3d,
        strip: [pMach.bz.el, pAlt.bz.el, pRange.bz.el, pEnergy.bz.el],
        console: [resultPanel.el, setupPanel.el, disclosure({ title: 'Guided comparisons', content: presetPanel.el }),
          disclosure({ title: 'Compare shots', content: comparePanel.el }),
          disclosure({ title: 'Launch-zone chart', content: dlzPanel.el }),
          disclosure({ title: 'Cockpit cues', content: cuePanel.el }),
          disclosure({ title: 'Accuracy notes', content: simplified })],
      });
      bag.add(() => lab.destroy());
      lab.overlay('tr', camSeg.el);
      lab.overlay('tl', legend);
      lab.view.append(playbar);
      ctx.root.append(lab.el);

      scene = new ShotScene(view3d, u);

      // ------------------------------------------------------------------ keys
      const keyMap: Parameters<typeof bindKeys>[0] = {
        [fireKey]: () => fireCurrent(),
        'P': () => setPlaying(!playing),
        'LCtrl+Z': () => stepSpeed(1),
        'LAlt+Z': () => stepSpeed(-1),
        'LShift+Z': () => { speed = 1; speedSeg.set(1); },
      };
      if (stepKey) keyMap[stepKey] = () => cycleMissile();
      bag.add(bindKeys(keyMap));

      // ------------------------------------------------------------------ helpers
      function round(v: number, step: number): number { return Math.round(v / step) * step; }

      function swatch(color: string, letter: string): HTMLElement {
        const el = h('span', { class: 'ml-swatch' }, letter);
        el.style.setProperty('--c', color);
        return el;
      }

      function stepSpeed(dir: 1 | -1) {
        const opts = [1, 2, 4, 8];
        const i = Math.max(0, Math.min(3, opts.indexOf(speed) + dir));
        speed = opts[i]; speedSeg.set(speed);
      }

      function cycleMissile() {
        const i = own.indexOf(setup.missile);
        const next = own[(i + 1) % own.length] ?? own[0];
        if (!next) return;
        missileSel.set(next);
        setup = { ...setup, missile: next, loftOff: false };
        onMissileChanged();
      }

      function syncReact() {
        const off = setup.maneuver === 'none';
        react.setDisabled(off);
        react.el.title = off ? 'Pick what he does after launch first: with None he never reacts.' : 'Seconds after launch before he starts his move';
      }

      function zoneMarks(): { rmin: number; rne: number; rmax: number; exact: boolean } {
        if (exact && exact.key === setupKey(setup)) return { rmin: dlz.rmin, rne: exact.rne, rmax: exact.rmax, exact: true };
        return { rmin: dlz.rmin, rne: dlz.rne, rmax: dlz.rmax, exact: false };
      }

      function drawZone() {
        const z = zoneMarks();
        const user = (m: number) => rangeToUser(m, u);
        rangeSl.setZones({
          exact: z.exact,
          bands: [
            { from: Number(rangeSl.input.min), to: user(z.rmin), tone: 'hatched' },
            { from: user(z.rmin), to: user(z.rne), tone: 'solid' },
            { from: user(z.rne), to: user(z.rmax), tone: 'outline' },
          ],
          marks: [
            { value: user(z.rmin), label: cues.rmin },
            { value: user(z.rne), label: cues.rne, priority: 2 },
            { value: user(z.rmax), label: cues.rmax, priority: 3 },
            ...(cues.prFraction === null ? [] : [{ value: user(cues.prFraction * z.rmax), label: cues.cue, cue: true, priority: 1 }]),
          ],
        });
        const p = zonePlace(setup.range, { ...dlz, rne: z.rne, rmax: z.rmax });
        const where = {
          'inside-rmin': `inside ${cues.rmin}: too close`,
          nez: `inside ${cues.rne}: no escape by running`,
          'rne-rmax': `between ${cues.rne} and ${cues.rmax}: hits only if he does not run`,
          'beyond-rmax': `beyond ${cues.rmax}: it will not get there`,
        }[p];
        let txt = `${fmtR(setup.range, u)} is ${where}. ${cues.rmax} ${fmtR(z.rmax, u)} · ${cues.rne} ${fmtR(z.rne, u)} · ${cues.rmin} ${fmtR(z.rmin, u)}`;
        if (cues.prFraction !== null) txt += ` · ${cues.cue} ${fmtR(cues.prFraction * z.rmax, u)}`;
        if (MISSILES[setup.missile].seeker === 'ir') txt += ` · IR lock inside ~${fmtR(irAcquisitionRange(setup.missile, ASPECT_DEG[setup.aspect] * Math.PI / 180), u)}`;
        setText(zoneText, txt + (z.exact ? ' (exact)' : ''));
        zoneText.dataset.place = p;
      }

      function setupKey(s: LabSetup): string {
        return [s.missile, s.shooterAlt.toFixed(0), s.shooterMach.toFixed(2), s.targetAlt.toFixed(0), s.targetMach.toFixed(2), s.aspect].join('|');
      }

      function syncSliders() {
        missileSel.set(setup.missile);
        sAlt.set(round(altToUser(setup.shooterAlt, u), u === 'metric' ? 0.5 : 1));
        sMach.set(setup.shooterMach);
        tAlt.set(round(altToUser(setup.targetAlt, u), u === 'metric' ? 0.5 : 1));
        tMach.set(setup.targetMach);
        aspectSeg.set(setup.aspect);
        manSeg.set(setup.maneuver);
        react.set(setup.reactAfter);
        loftSw.set(!setup.loftOff);
        supportSeg.set(setup.support ?? 'perfect');
        phoenixSeg.set(setup.phoenixLaunchMode ?? 'tws');
        syncReact();
      }

      function updateRangeMax(force: boolean) {
        const want = rangeSliderMax(dlz, u);
        const cur = Number(rangeSl.input.max);
        if (force || want > cur || want < cur * 0.55) {
          rangeSl.setRange(0.5, want, 0.5);
        }
        rangeSl.set(round(rangeToUser(setup.range, u), 0.5));
      }

      function onSetup() {
        dlz = dlzAt(setup);
        const key = setupKey(setup);
        if (exact && exact.key !== key) { exact = null; setText(exactOut, ''); }
        // the manoeuvre and reaction delay do not change Rmax / Rne: let a running search finish
        if (exactRun && exactKey !== key) { cancelExact(); setText(exactOut, ''); }
        updateRangeMax(false);
        drawZone();
        drawDlz();
        updateLoftUi();
      }

      function onRange() {
        dlz = dlzAt(setup);
        drawZone();
        drawDlz();
      }

      function onMissileChanged() {
        setup.shooterType = shooterTypeFor(ac, setup.missile);
        cues = cueNames(ac, setup.missile);
        exact = null; setText(exactOut, ''); cancelExact();
        dlz = dlzAt(setup);
        // keep the same place in the zone: start new missiles at 80 % of their Rmax
        setup.range = rangeFromUser(round(rangeToUser(0.8 * dlz.rmax, u), 0.5), u);
        dlz = dlzAt(setup);
        updateRangeMax(true);
        drawZone(); drawDlz(); updateMissileInfo(); updateLoftUi(); buildCues(); buildSimplified(); syncManLabels();
      }

      /** An IR missile gets flares, not chaff, from the notch-and-dispense target. */
      function syncManLabels() {
        const ir = MISSILES[setup.missile].seeker === 'ir';
        manSeg.setOptions(MANEUVERS.map(m => ({ value: m, label: m === 'notch-chaff' && ir ? 'Notch + flares' : MAN_LABEL[m], sub: m === 'beam' && setup.support === 'radar' ? 'threat 3/9' : MAN_SUB[m] })), setup.maneuver);
      }

      function updateMissileInfo() {
        const m = MISSILES[setup.missile];
        const mine = spec.missiles.includes(setup.missile);
        const bits = [`Fox ${m.fox}`, seekerWord(setup.missile), m.lofts ? 'lofts' : 'no loft'];
        if (m.pitbullKm) bits.push(`pitbull ${m.pitbullApprox ? '~' : ''}${fmtR(m.pitbullKm * 1000, u)}`);
        const who = mine ? '' : ` Not on the ${spec.short}: carried by the ${AIRCRAFT[shooterTypeFor(ac, setup.missile)].short}.`;
        setText(missileInfo, bits.join(' · ') + '.' + who);
      }

      function updateLoftUi() {
        const m = MISSILES[setup.missile];
        const phoenix = setup.missile === 'aim54a' || setup.missile === 'aim54c';
        phoenixSeg.el.hidden = phoenixHint.hidden = !phoenix;
        supportSeg.el.hidden = supportHint.hidden = m.seeker === 'ir';
        loftSw.setDisabled(!m.lofts);
        loftSw.el.hidden = !m.lofts;
        if (!m.lofts) { loftSw.set(false); setup.loftOff = false; } else loftSw.set(!setup.loftOff);
        setText(loftHint, !m.lofts
          ? `${m.name} does not loft in DCS: it flies a flat path to the target.`
          : setup.missile === 'sd10'
            ? 'The Lua has loft data, but whether a player\'s SD-10 lofts is unverified; it lofts here. Switch it off to compare.'
            : 'DCS lofts it by itself on long shots. Switch the loft off to see what the climb buys.');
      }

      function resetSetup() {
        setup = defaultSetup(ac, u, setup.missile);
        syncSliders();
        onSetup();
        updateRangeMax(true);
        drawZone();
      }

      // ------------------------------------------------------------------ compute exactly
      function cancelExact() {
        if (exactRun) { exactRun.cancel(); exactRun = null; }
        exactBtn.setDisabled(false);
        exactBtn.setLabel('Compute exactly');
        setupPanel.el.removeAttribute('aria-busy');
      }

      function computeExact() {
        cancelExact();
        const key = setupKey(setup);
        exactKey = key;
        const s = setup;
        const base = {
          missile: s.missile, shooterAlt: s.shooterAlt, shooterMach: s.shooterMach, targetAlt: s.targetAlt,
          targetMach: s.targetMach, aspectDeg: ASPECT_DEG[s.aspect], reactAfter: 0, seed: 1, targetType: targetTypeFor(s.missile),
        };
        const guessMax = dlz.rmax, guessNe = dlz.rne;
        let flights = 0;
        let rmax = 0;
        exactBtn.setDisabled(true);
        setupPanel.el.setAttribute('aria-busy', 'true');
        const label = () => exactBtn.setLabel(`Flying… ${flights}`);
        label();
        setText(exactOut, `Bisecting ${cues.rmax}: each step is one full flight.`);
        const gen = (function* () {
          const a = yield* rangeSearch(base, 'rmax', guessMax);
          rmax = a.range;
          const b = yield* rangeSearch(base, 'rne', guessNe);
          return { rmax: a.range, rne: Math.min(b.range, a.range || b.range) };
        })();
        let phase: 'rmax' | 'rne' = 'rmax';
        exactRun = runChunked(gen, () => {
          flights++;
          if (phase === 'rmax' && rmax > 0) { phase = 'rne'; setText(exactOut, `${cues.rmax} ${fmtR(rmax, u, 1)}. Now ${cues.rne}…`); }
          label();
        }, r => {
          exactRun = null;
          exactBtn.setDisabled(false);
          exactBtn.setLabel('Compute exactly');
          setupPanel.el.removeAttribute('aria-busy');
          if (setupKey(setup) !== key) return;
          exact = { key, rmax: r.rmax, rne: r.rne };
          setText(exactOut, r.rmax > 0
            ? `Exact after ${flights} flights: ${cues.rmax} ${fmtR(r.rmax, u, 1)}, ${cues.rne} ${fmtR(r.rne, u, 1)}. The table said ${fmtR(dlz.rmax, u, 1)} and ${fmtR(dlz.rne, u, 1)}.`
            : `No hit at any range for these conditions (${flights} flights).`);
          drawZone();
        });
      }

      // ------------------------------------------------------------------ firing
      function fireCurrent() {
        fire([{ setup: { ...setup }, name: null }], null, true);
        showView();
      }

      /** After a user's shot, bring the replay into sight when the stacked (phone) layout has scrolled it away. */
      function showView() {
        lab.focus('world');
        const r = lab.view.getBoundingClientRect();
        if (r.bottom < 40 || r.top > window.innerHeight - 40) lab.view.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
      }

      function fire(shots: { setup: LabSetup; name: string | null }[], preset: PresetId | null, counted: boolean, replace = false) {
        fireBtn.setDisabled(true);
        if (replace) kept.length = 0;
        const made: Kept[] = [];
        const rejected: string[] = [];
        for (const sh of shots) {
          const result = flyShot(sh.setup, 1);
          if (!result.trace.length) {
            rejected.push(result.reason === 'no-ir-lock'
              ? `No IR lock: move inside about ${fmtR(irAcquisitionRange(sh.setup.missile, ASPECT_DEG[sh.setup.aspect] * Math.PI / 180), u)} for this aspect.`
              : 'No radar lock at this geometry. Move closer or change the target aspect.');
            continue;
          }
          const d = dlzAt(sh.setup);
          const c = cueNames(ac, sh.setup.missile);
          const sum = summarize(sh.setup, result, d, c, u);
          const rec = shotRecording(result, sh.setup.missile, shooterTypeFor(ac, sh.setup.missile), targetTypeFor(sh.setup.missile));
          if (kept.length >= MAX_KEPT) {
            // drop the oldest shot that is not part of this volley
            const idx = kept.findIndex(k => !made.includes(k));
            kept.splice(idx >= 0 ? idx : 0, 1);
          }
          const used = new Set(kept.map(k => k.slot));
          const slot = [0, 1, 2].find(s => !used.has(s)) ?? 0;
          const k: Kept = { id: nextId++, slot, setup: sh.setup, result, dlz: d, sum, rec, name: sh.name, preset, counted };
          kept.push(k);
          made.push(k);
          if (counted) fired++;
        }
        if (preset) {
          const tk = presetTakeaway(preset, made.map(k => ({ setup: k.setup, result: k.result, sum: k.sum })), u, jetCues);
          takeaway = tk ? { ids: made.map(k => k.id), text: tk } : null;
          if (preset === 'rne' && counted && made.length) rneDone = true;
        } else takeaway = null;
        selected = made[0]?.id ?? selected;
        fireBtn.setDisabled(false);
        refreshShots(true);
        setTime(0);
        setPlaying(!reduced);
        updateDrill();
        if (rejected.length) {
          if (coachTitle) setText(coachTitle, 'NO LAUNCH');
          coach.set(rejected.join(' '), 'No missile left the rail.', 'warning');
          toast(rejected.join(' '), { within: lab.view, ms: 5000 });
        }
      }

      function runPreset(id: PresetId) {
        const p = buildPreset(id, setup, ac, u);
        setup = { ...p.shots[0].setup };
        syncSliders();
        cues = cueNames(ac, setup.missile);
        onSetup();
        updateRangeMax(true);
        drawZone(); updateMissileInfo(); buildCues(); buildSimplified(); syncManLabels();
        fire(p.shots.map(s => ({ setup: { ...s.setup }, name: s.name })), id, true, true);
        if (p.note) toast(p.note, { within: lab.view, ms: 5000 });
      }

      function clearShots() {
        kept.length = 0;
        selected = null;
        takeaway = null;
        setPlaying(false);
        refreshShots(true);
      }

      function selectShot(id: number) {
        selected = id;
        refreshShots(false);
        setTime(0);
        setPlaying(!reduced);
      }

      function loadShot(k: Kept) {
        setup = { ...k.setup };
        syncSliders();
        onMissileChangedKeepRange();
      }

      function onMissileChangedKeepRange() {
        cues = cueNames(ac, setup.missile);
        exact = null; setText(exactOut, ''); cancelExact();
        dlz = dlzAt(setup);
        updateRangeMax(true);
        drawZone(); drawDlz(); updateMissileInfo(); updateLoftUi(); buildCues(); buildSimplified(); syncManLabels();
      }

      function removeShot(id: number) {
        const i = kept.findIndex(k => k.id === id);
        if (i < 0) return;
        kept.splice(i, 1);
        if (selected === id) selected = kept[kept.length - 1]?.id ?? null;
        refreshShots(true);
        setTime(0);
      }

      // ------------------------------------------------------------------ views of the kept shots
      function current(): Kept | null { return kept.find(k => k.id === selected) ?? null; }

      function describe(k: Kept): string {
        const s = k.setup;
        const m = MISSILES[s.missile].name;
        const man = s.maneuver === 'none' ? '' : ` · ${MAN_LABEL[s.maneuver].toLowerCase()} ${Math.round(s.reactAfter)} s`;
        return `${m} · ${fmtAltU(s.shooterAlt, u)} M${s.shooterMach.toFixed(2)} → ${ASPECT_LABEL[s.aspect].toLowerCase()} ${fmtAltU(s.targetAlt, u)}${man} · ${fmtR(s.range, u)}${s.loftOff ? ' · no loft' : ''}`;
      }

      function refreshShots(reframe: boolean) {
        // compare list
        compareList.replaceChildren(...(kept.length ? kept.map(k => {
          const isSel = k.id === selected;
          const verdict = k.sum.hit ? `HIT ${Math.round(k.result.timeOfFlight)} s` : k.sum.headline.replace('MISS · ', 'MISS ');
          const viewBtn = h('button', { type: 'button', class: 'ml-compare__main', 'aria-pressed': String(isSel), onclick: () => selectShot(k.id) },
            swatch(SLOT_COLORS[k.slot], LETTERS[k.slot]),
            h('span', { class: 'ml-compare__text' },
              h('span', { class: 'ml-compare__name' }, k.name ?? describe(k)),
              k.name ? h('span', { class: 'ml-compare__sub' }, describe(k)) : null,
              h('span', { class: 'ml-compare__verdict', dataset: { hit: String(k.sum.hit) } }, verdict)));
          return h('li', { class: 'ml-compare__row' + (isSel ? ' is-sel' : '') }, viewBtn,
            h('div', { class: 'ml-compare__acts' },
              button({ label: 'Load', variant: 'ghost', size: 's', title: 'Copy this setup into the console', onClick: () => loadShot(k) }).el,
              button({ label: '×', variant: 'ghost', size: 's', ariaLabel: `Remove shot ${LETTERS[k.slot]}`, onClick: () => removeShot(k.id) }).el));
        }) : [h('li', { class: 'ml-empty' }, 'No shots yet. Each FIRE keeps a shot here; the fourth replaces the oldest.')]));

        // legend over the 3D view
        legend.replaceChildren(...kept.map(k => h('span', { class: 'ml-legend__item' + (k.id === selected ? ' is-sel' : '') },
          swatch(SLOT_COLORS[k.slot], LETTERS[k.slot]),
          h('span', null, k.sum.hit ? 'HIT' : 'MISS'))));
        legend.hidden = !kept.length;

        // 3D
        const cur = current();
        const sceneShots: SceneShot[] = kept.map(k => ({
          id: k.id, key: LETTERS[k.slot], color: SLOT_COLORS[k.slot], result: k.result, rec: k.rec,
          pitbullText: k.result.pitbull ? `PITBULL ${Math.round(k.result.pitbull.t)} s` : null,
          endText: k.sum.hit ? `HIT ${Math.round(k.result.timeOfFlight)} s · M${k.sum.endMach.toFixed(2)}` : reasonHeadline(k.result.reason, MISSILES[k.setup.missile].seeker === 'ir'),
          endShort: k.sum.hit ? 'HIT' : 'MISS ' + shortReason(k.result.reason),
        }));
        scene?.setShots(sceneShots, cur?.id ?? null, reframe);

        // time slider range
        const end = cur ? cur.rec.last : 60;
        timeSl.setRange(0, Math.max(1, Math.ceil(end)), 0.25);
        playBtn.setDisabled(!cur);
        timeSl.setDisabled(!cur);

        drawPlots();
        showResult();
      }

      function showResult() {
        const k = current();
        if (!k) {
          if (coachTitle) setText(coachTitle, 'NO SHOT YET');
          coach.set('Set up a shot and press FIRE, or try a preset.', `${cues.rmax}, ${cues.rne} and ${cues.rmin} marks move with every setting.`, 'dim');
          for (const id of ['tof', 'end', 'miss', 'g', 'pit', 'zone']) res.set(id, '—', '');
          cueNoteEl.hidden = true; takeawayEl.hidden = true;
          return;
        }
        const r = k.result, s = k.sum;
        if (coachTitle) setText(coachTitle, `${LETTERS[k.slot]} · ${s.headline}`);
        coach.set(s.lesson, s.what, s.hit ? 'ok' : 'hi');
        res.set('tof', r.timeOfFlight.toFixed(0), 's');
        res.set('end', 'M' + s.endMach.toFixed(2), '');
        const endLabel = res.row('end')?.querySelector('.ui-readout__label');
        if (endLabel) setText(endLabel, r.hit ? 'Impact' : 'At end');
        res.set('miss', fmtDist(r.missDistance, u), '');
        res.set('g', String(Math.round(s.endG)), 'g');
        const sk = r.trace[0]?.guidance === 'sarh' ? 'sarh' : MISSILES[k.setup.missile].seeker;
        const offRail = sk === 'arh' && r.trace[0]?.guidance === 'active';
        res.set('pit', r.pitbull ? `${Math.round(r.pitbull.t)}` : offRail ? '0' : sk === 'arh' ? 'never' : '—', r.pitbull || offRail ? 's' : sk === 'sarh' ? 'SARH' : sk === 'ir' ? 'IR' : '');
        const c = cueNames(ac, k.setup.missile);
        const p = zonePlace(k.setup.range, k.dlz);
        res.set('zone', fmtR(k.setup.range, u), '');
        res.row('zone')?.setAttribute('title', `Launch range: ${p === 'nez' ? `inside ${c.rne}` : p === 'rne-rmax' ? `between ${c.rne} and ${c.rmax}` : p === 'beyond-rmax' ? `beyond ${c.rmax}` : `inside ${c.rmin}`}`);
        cueNoteEl.hidden = !s.cueNote;
        setText(cueNoteEl, s.cueNote ?? '');
        const showTk = !!takeaway && takeaway.ids.includes(k.id);
        takeawayEl.hidden = !showTk;
        setText(takeawayEl, showTk && takeaway ? takeaway.text : '');
      }

      function drawPlots() {
        if (!kept.length) {
          machPlot.setData(null); altPlot.setData(null); rangePlot.setData(null); energy.setRows([]);
          return;
        }
        const cur = current();
        const xMax = Math.max(...kept.map(k => k.result.timeOfFlight)) * 1.03 + 1;
        const lines = (f: (k: Kept) => PlotLine[]) => kept.flatMap(f);
        const w = (k: Kept) => (k.id === selected ? 2.4 : 1.6);
        const mk = (k: Kept, v: (i: number) => number): PlotLine => ({
          key: LETTERS[k.slot], color: SLOT_COLORS[k.slot], dash: DASHES[k.slot], width: w(k), alpha: k.id === selected ? 1 : 0.75,
          t: k.result.trace.map(s => s.t), v: k.result.trace.map((_, i) => v(i)),
        });
        const endMarks = (val: (k: Kept, i: number) => number, pitLabel = true): PlotMark[] => kept.flatMap(k => {
          const tr = k.result.trace;
          const out: PlotMark[] = [];
          const last = tr.length - 1;
          const isSel = k.id === selected;
          out.push({ t: tr[last].t, v: val(k, last), color: SLOT_COLORS[k.slot], shape: k.result.hit ? 'dot' : 'cross', label: isSel ? (k.result.hit ? 'HIT' : 'MISS') : undefined });
          if (k.result.pitbull) {
            const i = Math.min(last, Math.round(k.result.pitbull.t / 0.25));
            out.push({ t: k.result.pitbull.t, v: val(k, i), color: SLOT_COLORS[k.slot], shape: 'diamond', label: isSel && pitLabel ? 'PITBULL' : undefined });
          }
          return out;
        });
        const burn = cur ? MISSILES[cur.setup.missile].burnS : 0;
        const machMax = Math.max(2, Math.ceil(Math.max(...kept.flatMap(k => k.result.trace.map(s => s.missileMach))) * 2 + 0.4) / 2);
        const machData: TimePlotData = {
          lines: lines(k => [mk(k, i => k.result.trace[i].missileMach)]),
          marks: endMarks((k, i) => k.result.trace[i].missileMach),
          bands: burn > 0 ? [{ t0: 0, t1: burn, label: 'MOTOR' }] : [],
          hlines: [{ v: 1, label: 'M1' }],
          xMax, yMax: machMax,
        };
        const altMax = Math.max(...kept.flatMap(k => k.result.trace.map(s => Math.max(s.missileAlt, s.targetAlt)))) * 1.12 + 300;
        const altData: TimePlotData = {
          lines: lines(k => [
            mk(k, i => k.result.trace[i].missileAlt),
            { ...mk(k, i => k.result.trace[i].targetAlt), dash: [2, 4], width: 1.2, alpha: 0.55, readout: false },
          ]),
          marks: endMarks((k, i) => k.result.trace[i].missileAlt),
          bands: [], hlines: [], xMax, yMax: altMax,
        };
        const rMax = Math.max(...kept.map(k => k.result.trace[0]?.range ?? k.setup.range)) * 1.05;
        const pit = cur && MISSILES[cur.setup.missile].pitbullKm ? MISSILES[cur.setup.missile].pitbullKm ?? 0 : 0;
        const rangeData: TimePlotData = {
          lines: lines(k => [mk(k, i => k.result.trace[i].range)]),
          // the labelled pitbull line names the diamond where the curve crosses it
          marks: endMarks((k, i) => k.result.trace[i].range, !pit),
          bands: [],
          hlines: pit ? [{ v: pit * 1000, label: `PITBULL ${fmtR(pit * 1000, u)}` }] : [],
          xMax, yMax: rMax,
        };
        machPlot.setData(machData);
        altPlot.setData(altData);
        rangePlot.setData(rangeData);
        energy.setRows(kept.map(k => ({
          key: LETTERS[k.slot], color: SLOT_COLORS[k.slot], peakMach: k.sum.peakMach, endMach: k.sum.endMach, endG: k.sum.endG,
          hit: k.result.hit, verdict: k.result.hit ? 'HIT' : 'MISS ' + shortReason(k.result.reason),
          selected: k.id === selected,
        })));
        pMach.bz.setStatus(kept.map(k => LETTERS[k.slot]).join(' '));
      }

      function drawDlz() {
        const off = setup.targetAlt - setup.shooterAlt;
        const xs: number[] = [], rmax: number[] = [], rne: number[] = [], rmin: number[] = [];
        let data;
        if (dlzAxis === 'alt') {
          const lo = u === 'metric' ? 0.5 : 2, hi = u === 'metric' ? 15 : 49, step = u === 'metric' ? 0.25 : 1;
          for (let x = lo; x <= hi + 1e-9; x += step) {
            const a = altFromUser(x, u);
            const d = dlzAt({ ...setup, shooterAlt: a, targetAlt: Math.max(300, Math.min(20000, a + off)) });
            xs.push(x); rmax.push(rangeToUser(d.rmax, u)); rne.push(rangeToUser(d.rne, u)); rmin.push(rangeToUser(d.rmin, u));
          }
          data = { xMin: lo, xMax: hi, xFmt: (x: number) => (u === 'metric' ? x.toFixed(0) : x.toFixed(0)), xTitle: u === 'metric' ? 'YOUR ALT km' : 'YOUR ALT kft', you: { x: altToUser(setup.shooterAlt, u), range: rangeToUser(setup.range, u) } };
        } else {
          for (let x = LIMITS.machMin; x <= LIMITS.machMax + 1e-9; x += 0.025) {
            const d = dlzAt({ ...setup, shooterMach: x });
            xs.push(x); rmax.push(rangeToUser(d.rmax, u)); rne.push(rangeToUser(d.rne, u)); rmin.push(rangeToUser(d.rmin, u));
          }
          data = { xMin: LIMITS.machMin, xMax: LIMITS.machMax, xFmt: (x: number) => x.toFixed(1), xTitle: 'YOUR MACH', you: { x: setup.shooterMach, range: rangeToUser(setup.range, u) } };
        }
        dlzChart.setData({
          curve: { x: xs, rmax, rne, rmin }, ...data, yTitle: UNIT, yFmt: v => v.toFixed(0),
          names: { rmax: cues.rmax, rne: cues.rne, rmin: cues.rmin },
        });
        const offTxt = Math.abs(off) < 150 ? 'at your altitude' : `${fmtAltU(Math.abs(off), u)} ${off > 0 ? 'above' : 'below'} you`;
        const other = dlzAxis === 'alt' ? `you at M${setup.shooterMach.toFixed(2)}` : `you at ${fmtAltU(setup.shooterAlt, u)}`;
        setText(dlzCaption, `${MISSILES[setup.missile].name}, ${other}, target ${ASPECT_LABEL[setup.aspect].toLowerCase()} ${offTxt} at M${setup.targetMach.toFixed(2)}. The shaded band is the no-escape zone. From the game's launch-zone table.`);
      }
      const dlzChart = new DlzChart(dlzCanvas);
      plots.push(dlzChart);

      function buildCues() {
        const c = cues;
        const m = MISSILES[setup.missile];
        const def = (name: string, text: string) => h('div', { class: 'ml-def' }, h('dt', null, name), h('dd', null, text));
        const hasFox3 = spec.missiles.some(x => MISSILES[x].fox === 3);
        const loftList: [MissileId[], string][] = [
          [['aim120b', 'aim120c'], 'AIM-120B/C: loft about 30° beyond ~25 km, flat inside 15 km.'],
          [['aim54a', 'aim54c'], 'AIM-54: lofts on long TWS or PD-STT shots; no loft when it comes off the rail active (inside ~10 nm, PH ACT, P-STT).'],
          [['s530d'], 'Super 530D: lofts beyond 10 nm (18.5 km).'],
          [['sd10'], 'SD-10: the Lua has loft data but AI shots fly flat; player loft is unverified (it lofts here).'],
          [['aim7m'], 'AIM-7M: no loft by default in DCS (the 7MH lofts).'],
          [['r27r', 'r27er', 'r27t', 'r27et', 'r77'], 'R-27 family and R-77: never loft. Since 2.9.20 pitching up to loft an R-27 gains nothing.'],
        ];
        cueBody.replaceChildren();
        append(cueBody, [
          h('dl', { class: 'ml-defs' },
            def(c.rmax, 'Longest shot if he keeps flying as he is. A shot here makes him defend; a turn away beats it.'),
            def(c.rne, 'He cannot escape even if he turns cold at launch and runs in afterburner. Shoot here to kill.'),
            def(c.rmin, 'Closer than this the missile cannot arm and turn in time.'),
            def(c.cue, c.prFraction !== null ? `Shoot cue, only inside ${Math.round(c.prFraction * 100)} % of Rmax.`
              : c.cueInsideRne ? `Shoot cue, only inside ${c.rne}.`
              : c.cueSimplified ? `This trainer's shoot cue (simplified): in the ${spec.short} judge the range caret against ${c.rmax} and ${c.rne}.`
              : 'The shoot cue in your cockpit.')),
          ...c.lines.map(l => h('p', { class: 'ml-small' }, l)),
          !hasFox3 ? h('p', { class: 'ml-small ml-strong' }, `The ${spec.short} has no Fox 3: every radar shot is semi-active, so you hold the lock to impact. The AIM-120, R-77 and friends are in the list to compare.`) : null,
          placard('Which missiles loft in DCS', { tag: 'div' }),
          h('ul', { class: 'ml-loftlist' }, loftList.map(([ids, text]) => h('li', {
            class: ids.includes(setup.missile) ? 'is-cur' : ids.some(x => spec.missiles.includes(x)) ? 'is-own' : '',
          }, text))),
          h('p', { class: 'ml-small' }, `High and fast: climbing about 20,000 ft roughly doubles max range (ED FC3 manual). From behind a target, range drops to a third or a half of head-on. ${m.name}: ${guidanceRuleFor(setup.missile, ac)}`),
        ]);
      }

      function buildSimplified() {
        const m = MISSILES[setup.missile];
        const unsure = m.notes.filter(n => /approx|unverified|not verified|not published/i.test(n));
        const tgt = targetTypeFor(setup.missile);
        const perf = AIRCRAFT_CAVEATS[tgt].find(n => /^Performance/.test(n));
        if (perf) unsure.push(`The target is a ${AIRCRAFT[tgt].short} (it sets how fast he runs cold). ${perf}`);
        simplifiedBody.replaceChildren(
          h('p', null, 'Shots fly this trainer\'s game model: a speed curve fitted to ED\'s launch table, a turn cap and steer-to-intercept. It is not DCS\'s own missile, and ranges between and beyond ED\'s reference points are the model\'s extrapolation.'),
          h('p', null, 'The shooter points at the target at launch and flies straight. Perfect support isolates missile reach; Radar model lets the shooter lose the track to a notch or gimbal limit. The range marks and Compute exactly keep perfect support and measure reach, not IR acquisition or every Phoenix launch mode.'),
          h('p', null, 'Loft off is a what-if: in DCS a lofting missile decides by itself. ' + MISSILE_REF_NOTE),
          ...(m.seeker === 'ir' ? [h('p', null, 'IR shots require a seeker lock before launch. The acquisition range uses the same simplified aspect rule as the free-flight sim; range marks still show kinematic reach.')] : []),
          h('p', null, 'FIRE launches at once. In DCS you hold the launch button (1 s on FC3 jets, 2 s on the M-2000C), and the F-14 takes about 3 s from trigger to missile away.'),
          ...unsure.map(n => h('p', null, n)),
        );
      }

      function updateDrill() {
        drill.setDone('three', complete || fired >= 3);
        drill.setDone('rne', complete || rneDone);
        drill.setCurrent(complete ? null : fired < 3 ? 'three' : !rneDone ? 'rne' : null);
        if (!complete && fired >= 3 && rneDone) {
          complete = true;
          ctx.app.setProgress(doneKey, true);
          toast(`Missile lab done for the ${spec.short}. Progress saved.`, { tone: 'ok', within: lab.view });
        }
        setText(drillNote, complete ? `Done for the ${spec.short}. Keep experimenting.` : `${Math.min(3, fired)} of 3 shots fired.`);
      }

      // ------------------------------------------------------------------ playback
      function setPlaying(p: boolean) {
        const cur = current();
        if (p && cur && t >= cur.rec.last - 0.05) t = 0;
        playing = p && !!cur;
        playBtn.setLabel(playing ? 'Pause' : 'Play');
        playBtn.setLit(playing);
      }

      function setTime(x: number) {
        const cur = current();
        t = Math.max(0, Math.min(cur ? cur.rec.last : 0, x));
        scene?.setTime(t);
        uiTick(true);
      }

      let uiClock = 0;
      function uiTick(force = false) {
        const now = performance.now();
        if (!force && now - uiClock < 100) return;
        uiClock = now;
        timeSl.set(Math.round(t * 4) / 4);
        const cur = current();
        setText(timeOut, cur ? `${Math.floor(t)} / ${Math.round(cur.rec.end)} s` : '—');
        const ph = t > 0 ? t : null;
        machPlot.setPlayhead(ph); altPlot.setPlayhead(ph); rangePlot.setPlayhead(ph);
      }

      let last = performance.now();
      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
        last = now;
        if (!playing) return;
        const cur = current();
        if (!cur) { setPlaying(false); return; }
        t += dt * speed;
        if (t >= cur.rec.last) { t = cur.rec.last; setPlaying(false); }
        scene?.setTime(t);
        uiTick(!playing);
      };
      raf = requestAnimationFrame(loop);

      // ------------------------------------------------------------------ first paint
      syncSliders();
      updateMissileInfo(); updateLoftUi(); buildCues(); buildSimplified();
      updateRangeMax(true);
      drawZone(); drawDlz(); updateDrill(); syncManLabels();

      const manParam = ctx.params.get('man') as TargetManeuver | null;
      if (manParam && MANEUVERS.includes(manParam)) { setup.maneuver = manParam; syncSliders(); }
      const aspParam = ctx.params.get('aspect') as Aspect | null;
      if (aspParam && ASPECTS.includes(aspParam)) { setup.aspect = aspParam; syncSliders(); onSetup(); }
      const shotParam = ctx.params.get('shot');
      const camParam = ctx.params.get('cam') as CamMode | null;
      if (camParam && ['side', 'orbit', 'missile', 'top'].includes(camParam)) { cam = camParam; camSeg.set(cam); }
      if (shotParam && (PRESET_IDS as string[]).includes(shotParam)) runPreset(shotParam as PresetId);
      else fire([{ setup: { ...setup }, name: 'Opening shot' }], null, shotParam === 'fire');
      if (cam !== 'side') scene?.setCamera(cam, true);
      const tParam = Number(ctx.params.get('t'));
      if (ctx.params.has('t') && Number.isFinite(tParam)) { setPlaying(false); setTime(tParam); }

      bag.add(() => { cancelAnimationFrame(raf); raf = 0; });
      bag.add(() => cancelExact());
      bag.add(() => clearToasts(lab.view));
      bag.add(() => lab.el.remove());
    },

    unmount() {
      if (exactRun) { exactRun.cancel(); exactRun = null; }
      bag.dispose();
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      for (const p of plots) p.dispose();
      plots.length = 0;
      scene?.dispose();
      scene = null;
    },
  };
};
export default factory;
