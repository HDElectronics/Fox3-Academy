/**
 * Fly screen: the engagement in 3D (tactical / chase / top), the jet's own radar display and RWR,
 * readouts, coach hints, event log, and every control as a button plus the jet's DCS keys.
 * The World steps inside the frame loop in chunks of at most 0.25 s of sim time; the recorder samples
 * after each chunk. UI text updates at ~8 Hz, coach hints at 2 Hz.
 */
import type { AircraftId, MissileId, RadarModeId, RwrId } from '../../data/types';
import { AIRCRAFT } from '../../data/aircraft';
import { MISSILES } from '../../data/missiles';
import { mobileAction } from '../../ui/mobileAction';
import type { PageContext } from '../../app/page';
import { fmtAlt, fmtMach, fmtRange, fmtSpeed, fmtTime, clockCode } from '../../app/format';
import { World } from '../../sim/world';
import type { Aircraft, EntityId, Missile, RadarPicture, SimEvent } from '../../sim/types';
import type { Engagement } from '../../sim/scenarios';
import { buildRadarPicture } from '../../sim/picture';
import { dlzFor } from '../../sim/dlz';
import { D2R, R2D, bearingTo, clamp, relBearing, wrap2Pi, M_PER_FT, MPS_PER_KT } from '../../sim/math';
import { speedFromMach } from '../../sim/atmosphere';
import { Stage, WorldView, CameraRig } from '../../render';
import { RadarDisplay, RwrDisplay, RwrAudio, MissileTimeline } from '../../ui/displays';
import {
  h, setText, setAttr, cleanup, labLayout, disclosure, consolePanel, screenBezel, segmented, button, toggle, chips, coachBox,
  eventLog, readouts, callout, placard, bindKeys, kbd, keyHint, splitAlternatives, type KeyMap, type ButtonHandle, type Tone,
} from '../../ui';
import { buildSortie, sortieEnd, sortieWorld, SORTIE_LIMIT_S, enemyCount, type SortieSetup, type TimeScale, TIME_SCALES } from './setup';
import { SortieRecorder, missilesLeft } from './recorder';
import type { SortieResult } from './coach';
import { reasonText } from './coach';
import { flightHint, type HintState } from './hints';
import { trainerKeys, type ActionId, type JetKey, type JetKeyMap } from './keys';
import { ScriptedPilot } from './autopilot';
import { HoldAction } from './input';

export interface FlyOutcome {
  world: World;
  eng: Engagement;
  recorder: SortieRecorder;
  result: SortieResult;
  setup: SortieSetup;
  /** The scripted pilot flew some or all of it (screenshot states): the debrief does not save a best or a win. */
  scripted: boolean;
}

export interface FlyOptions {
  ctx: PageContext;
  setup: SortieSetup;
  keymap: JetKeyMap;
  onEnd(o: FlyOutcome): void;
  onBrief(): void;
  /** Screenshot pre-roll: fly this many sim seconds with the scripted pilot before handing over. */
  prerollS?: number;
}

type Aid = 'hot' | 'crank' | 'notch' | 'cold' | null;

const RADAR_LABEL: Record<string, string> = { 'ru-hud': 'ИЛС', 'f15-vsd': 'VSD', tid: 'TID', vtb: 'VTB' };
const MFD_LABEL: Partial<Record<AircraftId, string>> = { fa18c: 'DDI · RDR', f16c: 'MFD · FCR', jf17: 'MFCD · RDR' };
const RWR_LABEL: Record<RwrId, string> = { spo15: 'СПО-15', alr56c: 'TEWS', alr67: 'ALR-67', alr56m: 'ALR-56M', jf17rwr: 'RWR', serval: 'SERVAL' };
const SEARCH_MODES: RadarModeId[] = ['rws', 'tws', 'vs'];
/** LShift / LCtrl throttle starts after this hold, so a quick chord (LShift + D) does not move it. */
const THROTTLE_DELAY_MS = 250;
/**
 * Jets whose DCS radar can step the TWS target, and the function that does it. The F-15C cannot reorder
 * its designations and the FC3 Russians track one target: they re-designate by clicking another contact.
 */
const STEP_FN: Partial<Record<AircraftId, string>> = {
  fa18c: 'Undesignate: step the L&S down the tracks, or swap L&S and DT2',
  f16c: 'TMS Right, short press: step the bug to the next track',
  jf17: 'S2 Left: swap HPT and SPT',
  f14b: 'NEXT LAUNCH (RIO): the next target in the firing order becomes priority 1',
};

export function radarLabel(ac: AircraftId): string {
  const spec = AIRCRAFT[ac];
  return spec.display === 'mfd' ? MFD_LABEL[ac] ?? 'MFD' : RADAR_LABEL[spec.display] ?? 'RADAR';
}
export const rwrLabel = (id: RwrId) => RWR_LABEL[id];

export function mountFly(host: HTMLElement, o: FlyOptions): { dispose(): void } {
  const bag = cleanup();
  const { ctx, setup, keymap } = o;
  const ac = ctx.app.aircraft, spec = ctx.app.spec, units = ctx.app.units;
  const K = keymap.keys;
  const TK = trainerKeys(keymap);

  // ───────────────────────────────────────── sim
  const world = sortieWorld(ac, setup);
  const eng = buildSortie(world, ac, setup, units);
  const meMaybe = world.get(eng.playerId);
  if (!meMaybe) throw new Error('Sortie: player did not spawn');
  const me: Aircraft = meMaybe;
  const rec = new SortieRecorder(world, eng, ac, units);
  const names = (id: EntityId | null | undefined) => (id ? world.get(id)?.callsign ?? world.samSites.get(id)?.callsign ?? id : '--');
  const allIds = () => [eng.playerId, ...eng.friendIds, ...eng.enemyIds];
  const aliveIds = () => allIds().filter(id => world.get(id)?.alive);

  let timeScale: TimeScale = setup.timeScale;
  let paused = Stage.prefersReducedMotion();
  let ending: { at: number; result: SortieResult } | null = null;
  let finished = false;
  let hintsOn = true;
  let aid: Aid = null;
  let aidSide = 1;
  const stick = { turn: 0, climb: 0, speed: 0, speedAt: 0 };
  const cursorHeld = { az: 0, range: 0 };
  const elevHeld = { dir: 0, acc: 0 };
  const launchHold = new HoldAction(K.launch?.holdS ?? 0, fire, undefined, () => !paused && canAct());
  const modeHold = new HoldAction(K.modeToggle?.holdS ?? 1, toggleMode,
    K.modeToggle?.tap === 'step' ? step : undefined, () => !paused && canAct());
  function clearHeldInputs(): void {
    launchHold.cancel(); modeHold.cancel();
    if (stick.turn) me.cmd.heading = me.heading;
    if (stick.climb) me.cmd.altitude = me.pos.y;
    stick.turn = 0; stick.climb = 0; stick.speed = 0;
    cursorHeld.az = 0; cursorHeld.range = 0; elevHeld.dir = 0; elevHeld.acc = 0;
  }
  bag.on(window, 'blur', clearHeldInputs);
  bag.add(clearHeldInputs);
  let pic: RadarPicture | null = null;
  /** Launch allowed although the cue is not lit (see updateUi). */
  let inRange = false;

  // ───────────────────────────────────────── DOM
  const viewEl = h('div', { class: 'sortie-view' });
  const radarCv = h('canvas', { class: 'sortie-radar', 'aria-label': `${spec.short} radar display: click a contact to designate it` });
  const rwrCv = h('canvas', { class: 'sortie-rwr' });
  const tlCv = h('canvas', { class: 'sortie-timeline-cv', 'aria-hidden': 'true' });
  const radarBezel = screenBezel({ label: radarLabel(ac), aspect: '1', content: radarCv, status: '' });
  const rwrBezel = screenBezel({ label: rwrLabel(spec.rwr), aspect: '1', content: rwrCv });

  const own = readouts({
    id: 'sortie-own', columns: 1,
    rows: [
      { id: 'hdg', label: 'Heading' }, { id: 'alt', label: 'Altitude' }, { id: 'spd', label: 'Speed' },
      { id: 'g', label: 'G' }, { id: 'wpn', label: 'Weapon' }, { id: 'cm', label: 'Chaff / flares' },
    ],
  });
  const mslText = h('p', { class: 'sortie-msl-text' }, 'No missiles in flight.');
  const stripOwn = h('div', { class: 'ui-strip-block sortie-strip-own' }, placard('Own ship'), own.el);
  const stripMsl = h('div', { class: 'ui-strip-block sortie-strip-msl' }, placard('Your missiles'), h('div', { class: 'sortie-tl-glass' }, tlCv), mslText);

  // Header actions: time scale, pause, end.
  const timeSeg = segmented<TimeScale>({
    id: 'sortie-time', ariaLabel: 'Time acceleration', size: 's', value: timeScale,
    options: TIME_SCALES.map(v => ({ value: v, label: `${v}×` })),
    onChange: v => { timeScale = v; },
  });
  const pauseT = toggle({ id: 'sortie-pause', label: 'Pause', value: paused, size: 's', keys: TK.pause, onChange: v => { paused = v; clearHeldInputs(); } });
  const endBtn = button({ label: 'End sortie', size: 's', onClick: () => endNow(sortieEnd(world, eng) ?? { outcome: 'draw', reason: 'ended', t: world.t }) });
  const briefBtn = button({ label: 'Brief', size: 's', variant: 'ghost', title: 'Abandon this sortie and go back to the brief', onClick: () => o.onBrief() });

  // Coach.
  const coach = coachBox({ id: 'sortie-coach', text: 'Stand by.', why: '' });
  const hintsT = toggle({ id: 'sortie-hints', label: 'Hints', style: 'switch', value: true, onChange: v => { hintsOn = v; coach.el.hidden = !v; } });
  const log = eventLog({ id: 'sortie-log', max: 60, empty: 'Fight on. Events show here.' });

  // Weapons.
  const fireBtn = button({
    id: 'sortie-fire', label: 'Fire', variant: 'cap', lamp: true, block: true, size: 'l', keys: K.launch?.keys ?? undefined,
    title: K.launch?.keys ? `${K.launch.dcsName}${K.launch.holdS ? `: hold ${K.launch.holdS} s` : ''}` : `${K.launch?.dcsName ?? 'Launch'}: no default key in DCS`,
    onClick: () => fire(),
  });
  const fireWhy = h('p', { class: 'sortie-why', 'aria-live': 'polite' }, '');
  const wpnBtn = button({ label: 'Weapon', keys: K.weaponCycle?.keys ?? undefined, title: K.weaponCycle?.dcsName, onClick: () => cycleWeapon() });
  const noKey = (k?: JetKey) => (k ? `${k.dcsName}: no default key in DCS` : 'No default key in DCS');
  const chaffBtn = button({ label: 'Chaff', keys: K.chaff?.keys ?? undefined, title: K.chaff?.keys ? K.chaff.dcsName : noKey(K.chaff ?? K.decoys), onClick: () => dispense('chaff') });
  const flareBtn = button({ label: 'Flare', keys: K.flare?.keys ?? undefined, title: K.flare?.keys ? K.flare.dcsName : noKey(K.flare ?? K.decoys), onClick: () => dispense('flare') });
  // Jets whose only countermeasure key is a program (M-2000C decoy program: chaff and flare together).
  const decoyBtn = !K.chaff && K.decoys?.keys ? button({ label: 'Program', keys: K.decoys.keys, title: `${K.decoys.dcsName}: chaff and flare together`, onClick: () => dispense('both') }) : null;
  const carried = (ids: MissileId[]) => ids.some(m => (me.stores[m] ?? 0) > 0);
  const selectBtns = keymap.selects.filter(s => carried(s.missiles)).map(s => button({ label: s.family, size: 's', keys: s.keys, title: s.dcsName, onClick: () => selectFamily(s.missiles) }));

  // Radar.
  const modes = spec.radar.modes.filter(m => SEARCH_MODES.includes(m));
  const modeSeg = segmented<RadarModeId>({
    id: 'sortie-mode', label: 'Radar mode', size: 's', value: 'rws', fill: true,
    options: modes.map(m => ({ value: m, label: spec.radar.modeLabels[m] ?? m.toUpperCase(), sub: m === 'rws' ? 'search' : m === 'tws' ? 'track' : 'closure', keys: m === 'tws' ? K.modeToggle?.keys ?? undefined : undefined })),
    onChange: m => setMode(m),
  });
  const desBtn = button({ label: 'Designate / lock', keys: K.designate?.keys ?? undefined, title: K.designate?.dcsName, onClick: () => designateAtCursor() });
  const stepBtn = button({ label: 'Step', title: STEP_FN[ac] ?? 'Next track becomes the primary', keys: K.modeToggle?.tap === 'step' ? `${K.modeToggle.keys ?? ''}` : K.unlock?.stepsInTws ? K.unlock.keys ?? undefined : undefined, onClick: () => step() });
  const unlockBtn = button({ label: K.unlock?.stepsInTws ? 'Undesignate' : 'Unlock', keys: K.unlock?.keys ?? undefined, title: K.unlock?.dcsName, onClick: () => (K.unlock?.stepsInTws ? hornetUndesignate() : unlock()) });
  const lockPriBtn = K.lockPrimary ? button({ label: 'STT on L&S', size: 's', keys: K.lockPrimary.keys ?? undefined, title: K.lockPrimary.dcsName, onClick: () => lockPrimary() }) : null;
  const rngDown = button({ label: '−', size: 's', ariaLabel: 'Shorter range scale', title: K.rangeIn?.keys ?? K.rangeIn?.dcsName, onClick: () => rangeStep(-1) });
  const rngUp = button({ label: '+', size: 's', ariaLabel: 'Longer range scale', title: K.rangeOut?.keys ?? K.rangeOut?.dcsName, onClick: () => rangeStep(1) });
  const rngOut = h('output', { class: 'sortie-out' }, '--');
  const elUp = button({ label: '▲', size: 's', ariaLabel: 'Antenna up', title: K.elevUp?.keys ?? K.elevUp?.dcsName, onClick: () => elevStep(1) });
  const elDown = button({ label: '▼', size: 's', ariaLabel: 'Antenna down', title: K.elevDown?.keys ?? K.elevDown?.dcsName, onClick: () => elevStep(-1) });
  const elOut = h('output', { class: 'sortie-out' }, '0°');
  const pairKeys = (a?: JetKey, b?: JetKey) => (a?.keys && b?.keys
    ? h('span', { class: 'sortie-adj__keys' }, kbd(a.keys), ' ', kbd(b.keys))
    : h('span', { class: 'sortie-adj__keys sortie-note' }, 'click'));
  const powerT = toggle({ id: 'sortie-radar-on', label: 'Radar', style: 'switch', value: true, keys: K.radarPower?.keys ?? undefined, onChange: v => radarPower(v) });
  const audio = RwrAudio.supported ? new RwrAudio({ rwr: spec.rwr, volume: 0.2 }) : null;
  bag.add(() => audio?.dispose());
  const audioT = toggle({
    id: 'sortie-audio', label: 'RWR audio', style: 'switch', value: false, disabled: !audio,
    onChange: v => { if (!audio) return; if (v) audio.start(); else audio.stop(); },
  });

  // Flight.
  const cmdOut = h('p', { class: 'sortie-cmd' }, '');
  const first = (k: string) => splitAlternatives(k)[0] ?? k;
  const turnL = button({ label: '◄ Left', size: 's', keys: first(TK.left), title: `Turn left 30° (hold ${TK.left} to keep turning)`, onClick: () => nudgeHeading(-30) });
  const turnR = button({ label: 'Right ►', size: 's', keys: first(TK.right), title: `Turn right 30° (hold ${TK.right})`, onClick: () => nudgeHeading(30) });
  const climbB = button({ label: 'Climb', size: 's', keys: first(TK.climb), title: `Climb ${units === 'metric' ? '1500 m' : '5000 ft'} (hold ${TK.climb})`, onClick: () => nudgeAlt(1) });
  const diveB = button({ label: 'Descend', size: 's', keys: first(TK.descend), title: `Descend ${units === 'metric' ? '1500 m' : '5000 ft'} (hold ${TK.descend})`, onClick: () => nudgeAlt(-1) });
  const slowB = button({ label: 'Slower', size: 's', keys: TK.slower, title: `Slower (hold ${TK.slower})`, onClick: () => nudgeSpeed(-1) });
  const fastB = button({ label: 'Faster', size: 's', keys: TK.faster, title: `Faster (hold ${TK.faster})`, onClick: () => nudgeSpeed(1) });
  const abT = toggle({ id: 'sortie-ab', label: 'Burner', size: 's', keys: TK.afterburner ?? undefined, onChange: v => { me.cmd.afterburner = v; } });
  const aidDefs: { id: Exclude<Aid, null>; label: string; title: string }[] = [
    { id: 'hot', label: 'Hot', title: 'Point at your primary target (or the nearest bandit)' },
    { id: 'crank', label: 'Crank', title: `Hold the target ${crankDeg()}° off the nose, inside the ±${spec.radar.gimbalAzDeg}° gimbal` },
    { id: 'notch', label: 'Notch', title: 'Put the top RWR threat on the beam (3 or 9 o\'clock) and descend' },
    { id: 'cold', label: 'Cold', title: 'Turn away from the top threat in burner and descend (drag)' },
  ];
  const aidBtns = aidDefs.map(a => toggle({ id: `sortie-aid-${a.id}`, label: a.label, size: 's', title: a.title, onChange: v => setAid(v ? a.id : null) }));

  // 3D overlays.
  type Cam = 'tactical' | 'chase' | 'top';
  let cam: Cam = 'tactical';
  let camFocus: EntityId | null = null;
  const camSeg = segmented<Cam>({
    id: 'sortie-cam', ariaLabel: 'Camera', size: 's', value: 'tactical',
    options: [
      { value: 'tactical', label: 'Tactical' },
      { value: 'chase', label: 'Chase', keys: TK.chase ?? undefined },
      { value: 'top', label: 'Top', keys: TK.map ?? undefined },
    ],
    onChange: v => setCam(v),
  });
  const nextBtn = button({ label: 'Next contact', size: 's', onClick: () => nextContact() });
  let showHiddenShots = false;
  const layerChips = chips<'truth' | 'tracks' | 'radarVolume' | 'rwrLines' | 'hiddenShots'>({
    id: 'sortie-layers', ariaLabel: '3D layers', value: ['truth', 'tracks'],
    options: [
      { value: 'truth', label: 'All jets', title: 'Off: only what your radar tracks' },
      { value: 'tracks', label: 'Tracks', title: 'Your radar track files' },
      { value: 'radarVolume', label: 'Scan', title: 'Your radar scan volume' },
      { value: 'rwrLines', label: 'RWR', title: 'Who is painting you' },
      { value: 'hiddenShots', label: 'Hidden shots', title: 'Show enemy missiles your RWR cannot see yet (spoils the surprise of a silent TWS shot)' },
    ],
    onChange: (vals) => {
      showHiddenShots = vals.includes('hiddenShots');
      view?.setLayers({ truth: vals.includes('truth'), tracks: vals.includes('tracks'), rwrLines: vals.includes('rwrLines') });
      view?.setRadarVolume(vals.includes('radarVolume') ? me.id : null, { coverageAt: ['cursor'] });
    },
  });
  const clockEl = h('div', { class: 'sortie-clock', role: 'status' }, '00:00');

  // Key map help.
  const keysPanel = buildKeyHelp(ac, keymap);

  const n = enemyCount(setup.scenario);
  const mobileButtons = [
    mobileAction(turnL.el, 'Left'), mobileAction(turnR.el, 'Right'), mobileAction(chaffBtn.el),
    mobileAction(desBtn.el, 'Designate'), mobileAction(fireBtn.el),
  ];
  for (const action of mobileButtons) bag.add(() => action.destroy());
  const lab = labLayout({
    id: 'sortie-fly', class: 'sortie-lab', mobileTabs: true,
    mobileActions: mobileButtons.map(action => action.el),
    header: {
      title: 'Sortie',
      meta: `${spec.short} vs ${n > 1 ? `2× ` : ''}${AIRCRAFT[setup.enemy].short} · ${setup.skill} · ${setup.scenario === '2v2' ? '2v2 with an AI wingman' : setup.scenario}`,
      actions: h('div', { class: 'sortie-head-actions' }, timeSeg.el, pauseT.el, endBtn.el, briefBtn.el),
    },
    viewport: viewEl,
    strip: [radarBezel.el, rwrBezel.el, stripOwn, stripMsl],
    console: [
      consolePanel({ title: 'Coach', actions: hintsT.el, children: [coach.el, disclosure({ title: 'Events', content: log.el })] }).el,
      consolePanel({
        title: 'Weapons', children: [
          fireBtn.el, fireWhy,
          h('div', { class: 'sortie-row' }, wpnBtn.el, ...selectBtns.map(b => b.el)),
          h('div', { class: 'sortie-row' }, chaffBtn.el, flareBtn.el, decoyBtn?.el ?? null),
        ],
      }).el,
      consolePanel({
        title: `Radar · ${spec.radar.name}`, actions: powerT.el, children: [
          modes.length > 1 ? modeSeg.el : callout({ kind: 'dcs', body: `The ${spec.short} has no TWS: you search in ${spec.radar.modeLabels.rws ?? 'RWS'} and lock (${spec.radar.modeLabels.stt ?? 'STT'}) to shoot.` }),
          h('div', { class: 'sortie-row' }, desBtn.el, unlockBtn.el, spec.radar.tws && STEP_FN[ac] ? stepBtn.el : null, lockPriBtn?.el ?? null),
          h('div', { class: 'sortie-adj' }, placard('Range'), rngDown.el, rngOut, rngUp.el, pairKeys(K.rangeIn, K.rangeOut)),
          h('div', { class: 'sortie-adj' }, placard('Antenna'), elDown.el, elOut, elUp.el, pairKeys(K.elevDown, K.elevUp)),
          h('p', { class: 'sortie-note' }, 'Click a contact on the radar to designate it; click empty space to move the cursor.'),
          audioT.el,
        ],
      }).el,
      consolePanel({
        title: 'Flight', children: [
          cmdOut,
          h('div', { class: 'sortie-stick' }, turnL.el, climbB.el, turnR.el, slowB.el, diveB.el, fastB.el),
          h('div', { class: 'sortie-row' }, abT.el),
          placard('Autopilot aids'),
          h('div', { class: 'sortie-row sortie-aids' }, ...aidBtns.map(b => b.el)),
        ],
      }).el,
      keysPanel,
      disclosure({ title: 'Accuracy notes', content: callout({
        kind: 'simplified',
        body: 'You fly a tactical autopilot: heading, altitude, speed. AI launch range, reactions and notch accuracy scale with skill (this trainer\'s choices; DCS sets launch range in the mission editor). The AI steers on a GCI picture. Missiles follow the game\'s launch tables, simplified.',
      }) }),
    ],
  });
  lab.overlay('tl', h('div', { class: 'sortie-hud-row' }, camSeg.el, nextBtn.el));
  lab.overlay('tr', layerChips.el);
  lab.overlay('bl', clockEl);
  host.append(lab.el);
  bag.add(() => lab.el.remove());
  bag.add(() => lab.destroy());

  // ───────────────────────────────────────── 3D
  let stage: Stage | null = null;
  let view: WorldView | null = null;
  let rig: CameraRig | null = null;
  try {
    // The sim steps in this loop: keep it running when the 3D view scrolls away (phones: the controls are below it).
    stage = new Stage(viewEl, { ariaLabel: 'Engagement in 3D', autoPause: 'render' });
    view = new WorldView(stage, world, { units, observer: me.id, layers: { tracks: true } });
    rig = new CameraRig(stage, { source: view, view: { headingDeg: 20, elevationDeg: 26, distance: setup.range * 1.1 } });
    rig.frame(allIds(), { headingDeg: 15, elevationDeg: 24, instant: true, padding: framePad() });
    stage.onTap((x, y) => {
      const id = view?.pickEntity(x, y) ?? null;
      view?.select(id);
      if (id && cam === 'tactical') rig?.focusOn(id, { distance: 25000 });
    });
  } catch (e) {
    console.warn('Sortie: 3D view unavailable', e);
  }
  bag.add(() => stage?.dispose());

  // ───────────────────────────────────────── displays
  const radar = new RadarDisplay(radarCv, { format: spec.display, units, aircraft: ac });
  const rwr = new RwrDisplay(rwrCv, { rwr: spec.rwr });
  const timeline = new MissileTimeline(tlCv, { minHorizonS: 30, maxRows: 4, emptyText: 'No missiles in flight' });
  bag.add(() => { radar.dispose(); rwr.dispose(); timeline.dispose(); });
  bag.on(radarCv, 'click', (e: MouseEvent) => {
    if (!me.alive) return;
    const id = radar.pick(e.clientX, e.clientY, 12);
    if (id) doDesignate(id);
    else {
      const p = radar.toRadar(e.clientX, e.clientY);
      if (p) world.setScan(me.id, { cursor: p });
    }
  });

  // ───────────────────────────────────────── events → log
  const say = (text: string, tone?: Tone) => log.push(text, { t: world.t, tone });
  const mLabel = (id: EntityId) => rec.shot(id)?.label ?? 'M';
  bag.add(world.on(e => onEvent(e)));
  function onEvent(e: SimEvent): void {
    const mine = (id: EntityId) => world.missiles.get(id)?.shooterId === me.id;
    switch (e.type) {
      case 'launch':
        if (e.shooterId === me.id) {
          const m = MISSILES[e.missile];
          say(`Fox ${m.fox}: ${mLabel(e.missileId)} ${m.name} at ${names(e.targetId)}, ${e.range ? rng(e.range) : '--'} (${modeName(e.radarMode)})`, 'hi');
        }
        break;
      case 'pitbull': if (mine(e.missileId)) say(`${mLabel(e.missileId)} pitbull: its own seeker is on`, 'ok'); break;
      case 'datalink-lost': if (mine(e.missileId)) say(`${mLabel(e.missileId)} lost datalink: ${e.why}`, 'caution'); break;
      case 'seeker-lost': if (mine(e.missileId) && e.why === 'lost-guidance') say(`${mLabel(e.missileId)} lost guidance: no lock to ride`, 'caution'); break;
      case 'hit': {
        const sm = world.samMissiles.get(e.missileId);
        if (sm) { say(`Hit by the ${names(sm.siteId)} site.`, e.targetId === me.id ? 'warning' : 'caution'); break; }
        const m = world.missiles.get(e.missileId);
        if (!m) break;
        if (m.shooterId === me.id) say(`${mLabel(m.id)} hit ${names(e.targetId)}. Splash.`, 'ok');
        else if (e.targetId === me.id) say(`Hit by ${names(m.shooterId)}'s ${MISSILES[m.type].name}.`, 'warning');
        else say(`${names(m.shooterId)}'s ${MISSILES[m.type].name} hit ${names(e.targetId)}.`, eng.enemyIds.includes(e.targetId) ? 'ok' : 'warning');
        break;
      }
      case 'miss': if (mine(e.missileId)) say(`${mLabel(e.missileId)} missed: it ${reasonText(e.reason)}`); break;
      case 'lock':
        if (e.ownerId === me.id) {
          if (e.what === 'locked') say(`Locked ${names(e.targetId)} (STT): he has a lock warning now`, 'hi');
          else if (e.what === 'broken') say(`Lock on ${names(e.targetId)} broken: ${e.why ?? 'lost'}`, 'caution');
        }
        break;
      case 'sam':
        if (e.targetId === me.id && e.what === 'lost' && e.why && e.why !== 'target-dead') say(`${names(e.siteId)} lost its track on you (${e.why}): its missiles go ballistic`, 'ok');
        break;
      case 'rwr':
        if (e.ownerId !== me.id || e.state === 'search') break;
        {
          const c = me.rwr.find(x => x.emitterId === e.emitterId);
          const where = c ? ` at ${clockCode(c.bearing)}` : '';
          if (e.state === 'lock') say(`Spike: ${names(e.emitterId)} locks you${where}`, 'caution');
          else if (e.state === 'launch') say(`Launch warning: ${names(e.emitterId)}${c?.missileType ? ` (${MISSILES[c.missileType].name})` : ''}${where}`, 'warning');
          else if (e.state === 'missile') say(`Missile active on you${where}`, 'warning');
          if ((e.state === 'launch' || e.state === 'missile') && timeScale > 1) { timeScale = 1; timeSeg.set(1); say('Time back to 1×: missile warning'); }
        }
        break;
      case 'ai':
        // Shots at you that your RWR cannot see stay silent here too (they show in the debrief):
        // a TWS Fox 3 until pitbull, and any IR missile.
        if (silentShotAtMe(e)) break;
        say(e.text, 'dim');
        break;
      default: break;
    }
  }

  function silentShotAtMe(e: Extract<SimEvent, { type: 'ai' }>): boolean {
    const atMe = e.targetId !== undefined ? e.targetId === me.id : / at you\b/.test(e.text);
    if (!atMe) return false;
    if (e.missile && MISSILES[e.missile].seeker === 'ir') return true;
    return /\bTWS\b/.test(e.text);
  }

  // ───────────────────────────────────────── actions
  function rng(m: number): string { return fmtRange(m, units, m < (units === 'metric' ? 10000 : 18520) ? 1 : 0); }
  function modeName(m: RadarModeId): string { return spec.radar.modeLabels[m] ?? m.toUpperCase(); }
  function canAct(): boolean { return me.alive && !ending && !finished; }
  function crankDeg(): number { return Math.min(50, spec.radar.gimbalAzDeg - 10); }
  /** Tags hang to the right of the jets: leave more margin on narrow views. */
  function framePad(): number { return viewEl.clientWidth && viewEl.clientWidth < 600 ? 1.6 : 1.2; }

  function setMode(m: RadarModeId): void {
    if (!canAct()) return;
    if (!world.setRadarMode(me.id, m)) { say(`The ${spec.short} has no ${m.toUpperCase()}`, 'caution'); return; }
    rec.action('mode', modeName(m));
  }
  function toggleMode(): void {
    if (!spec.radar.tws) { say(`The ${spec.short} has no TWS: lock (${modeName('stt')}) to shoot`, 'caution'); return; }
    const next = me.radar.mode === 'tws' ? 'rws' : 'tws';
    setMode(next);
  }
  function doDesignate(id: EntityId): void {
    if (!canAct()) return;
    const st = me.radar;
    const before = `${st.mode}|${st.designated.join(',')}`;
    if (st.mode === 'stt' || st.mode === 'off') { say(st.mode === 'off' ? 'Radar is off' : 'Already locked: unlock first to change target', 'dim'); return; }
    world.designate(me.id, id);
    rec.action('designate', undefined, id);
    const modeNow = me.radar.mode as RadarModeId;
    const after = `${modeNow}|${st.designated.join(',')}`;
    const tr = st.tracks.find(t => t.targetId === id);
    if (tr) world.setScan(me.id, { cursor: { az: relBearing(me.pos, me.heading, tr.pos), range: me.pos.distanceTo(tr.pos) } });
    if (before === after && modeNow !== 'stt') {
      const why = world.canLock(me.id, id);
      say(modeNow === 'tws' && !tr ? 'Not a track yet: wait for a second hit' : why.ok ? 'No change' : why.reason, 'caution');
    } else if (modeNow === 'tws') {
      const i = st.designated.indexOf(id);
      say(`${names(id)} designated${i === 0 ? ' (primary)' : i > 0 ? ` (#${i + 1})` : ''}`, 'hi');
    }
  }
  function designateAtCursor(): void {
    if (!canAct()) return;
    const picks = radar.pickables();
    if (!picks.length) { say('Nothing on the scope to designate', 'dim'); return; }
    const c = radar.toScreen(me.radar.cursor.az, me.radar.cursor.range);
    let best = picks[0];
    if (c) {
      let bd = Infinity;
      for (const p of picks) { const d = Math.hypot(p.x - c.x, p.y - c.y); if (d < bd) { bd = d; best = p; } }
    }
    doDesignate(best.targetId);
  }
  function unlock(): void {
    if (!canAct()) return;
    world.unlock(me.id);
    rec.action('unlock');
  }
  function step(): void {
    if (!canAct() || me.radar.mode !== 'tws' || !STEP_FN[ac]) return;
    world.cycleDesignation(me.id);
    rec.action('step', undefined, me.radar.designated[0] ?? null);
  }
  function hornetUndesignate(): void {
    if (me.radar.mode === 'tws') step(); else unlock();
  }
  function lockPrimary(): void {
    const id = me.radar.designated[0];
    if (!canAct() || me.radar.mode !== 'tws' || !id) return;
    if (!world.lock(me.id, id)) say(world.canLock(me.id, id).reason, 'caution');
  }
  function radarPower(on: boolean): void {
    if (!canAct()) return;
    if (!on) { world.setRadarMode(me.id, 'off'); rec.action('radar', 'off'); say('Radar off: silent, and blind', 'dim'); }
    else { world.setRadarMode(me.id, 'rws'); rec.action('mode', modeName('rws')); }
  }
  function rangeStep(dir: number): void {
    const scales = spec.radar.rangeScalesKm.map(k => k * 1000);
    let i = 0, bd = Infinity;
    scales.forEach((s, k) => { const d = Math.abs(s - me.radar.rangeScale); if (d < bd) { bd = d; i = k; } });
    world.setScan(me.id, { rangeScale: scales[clamp(i + dir, 0, scales.length - 1)] });
  }
  function elevStep(dir: number): void {
    const lim = spec.radar.gimbalElDeg * D2R;
    world.setScan(me.id, { elCenter: clamp(me.radar.elCenter + dir * D2R, -lim, lim), autoCenter: true });
  }
  function fire(): void {
    if (!canAct()) return;
    const r = world.launch(me.id);
    if ('kind' in r) rec.action('launch', r.type, r.targetId);
    else say(r.reason || 'No shot', 'caution');
  }
  function cycleWeapon(): void {
    if (!canAct()) return;
    const w = world.cycleWeapon(me.id);
    rec.action('weapon', w ?? 'none');
    say(w ? `${MISSILES[w].name} selected (${me.stores[w] ?? 0})` : 'No missiles left', 'dim');
  }
  function selectFamily(ids: MissileId[]): void {
    if (!canAct()) return;
    const id = ids.find(m => (me.stores[m] ?? 0) > 0);
    if (!id) { say('None of those left', 'dim'); return; }
    me.selectedWeapon = id;
    rec.action('weapon', id);
    say(`${MISSILES[id].name} selected (${me.stores[id] ?? 0})`, 'dim');
  }
  function dispense(what: 'chaff' | 'flare' | 'both'): void {
    if (!canAct()) return;
    if (what !== 'flare' && !world.chaff(me.id) && me.chaff <= 0) say('Chaff: none left', 'caution');
    if (what !== 'chaff' && !world.flare(me.id) && me.flares <= 0) say('Flares: none left', 'caution');
  }

  // Flight.
  function nudgeHeading(deg: number): void {
    if (!canAct()) return;
    setAid(null);
    me.cmd.heading = wrap2Pi(me.cmd.heading + deg * D2R);
  }
  const altStep = units === 'metric' ? 1500 : 5000 * M_PER_FT;
  const spdStep = units === 'metric' ? 100 / 3.6 : 50 * MPS_PER_KT;
  const ceiling = spec.perf.ceilingFt * M_PER_FT;
  const vmax = speedFromMach(spec.perf.maxMach, 11000);
  function nudgeAlt(dir: number): void {
    if (!canAct()) return;
    me.cmd.altitude = clamp(me.cmd.altitude + dir * altStep, 600, ceiling);
  }
  function nudgeSpeed(dir: number): void {
    if (!canAct()) return;
    me.cmd.speed = clamp(me.cmd.speed + dir * spdStep, 120, vmax);
  }
  function aidTarget(): Aircraft | null {
    const id = me.radar.stt.targetId ?? me.radar.designated[0];
    const t = id ? world.get(id) : undefined;
    if (t?.alive) return t;
    return nearestBandit();
  }
  function nearestBandit(): Aircraft | null {
    let best: Aircraft | null = null, bd = Infinity;
    for (const id of eng.enemyIds) { const b = world.get(id); if (b?.alive) { const d = b.pos.distanceTo(me.pos); if (d < bd) { bd = d; best = b; } } }
    return best;
  }
  /** True bearing to the top threat: the RWR's priority contact, else the nearest bandit. */
  function threatBearing(): number | null {
    const c = me.rwr[0];
    if (c) return wrap2Pi(me.heading + c.bearing);
    const b = nearestBandit();
    return b ? bearingTo(me.pos, b.pos) : null;
  }
  function setAid(a: Aid): void {
    aid = a;
    aidBtns.forEach((b, i) => b.set(aidDefs[i].id === a));
    if (!a || !me.alive) return;
    if (a === 'crank') { const t = aidTarget(); aidSide = t && relBearing(me.pos, me.heading, t.pos) > 0 ? -1 : 1; }
    if (a === 'notch') {
      const b = threatBearing();
      if (b !== null) aidSide = Math.sin(me.heading - b) >= 0 ? 1 : -1;
      me.cmd.altitude = Math.max(1500, Math.min(me.cmd.altitude, me.pos.y - 3000));
      me.cmd.afterburner = false; abT.set(false);
    }
    if (a === 'cold') { me.cmd.afterburner = true; abT.set(true); me.cmd.altitude = Math.max(1500, me.pos.y - 1500); }
    if (a === 'hot') me.cmd.altitude = Math.max(me.cmd.altitude, me.pos.y);
  }
  function flyAid(): void {
    if (!aid) return;
    if (aid === 'hot' || aid === 'crank') {
      const t = aidTarget();
      if (!t) return;
      const b = bearingTo(me.pos, t.pos);
      me.cmd.heading = aid === 'hot' ? b : wrap2Pi(b + aidSide * crankDeg() * D2R);
    } else {
      const b = threatBearing();
      if (b === null) return;
      me.cmd.heading = aid === 'cold' ? wrap2Pi(b + Math.PI) : wrap2Pi(b + aidSide * Math.PI / 2);
    }
  }
  function applyStick(): void {
    if (!me.alive) return;
    if (stick.turn) me.cmd.heading = wrap2Pi(me.heading + stick.turn * 1.2);
    if (stick.climb) me.cmd.altitude = clamp(me.pos.y + stick.climb * 2500, 600, ceiling);
    flyAid();
  }

  // ───────────────────────────────────────── camera
  function setCam(v: Cam): void {
    cam = v;
    camSeg.set(v);
    if (!rig) return;
    if (v === 'tactical') { rig.setMode('orbit'); rig.frame(aliveIds(), { padding: framePad() }); camFocus = null; }
    else if (v === 'chase') rig.setMode('chase', { focus: me.alive ? me.id : aliveIds()[0], lookAt: camFocus && world.get(camFocus)?.alive ? camFocus : nearestBandit()?.id ?? null });
    else rig.setMode('top', { focus: camFocus ?? me.id, distance: Math.max(60000, setup.range * 1.3) });
  }
  function nextContact(): void {
    const list = aliveIds().filter(id => id !== me.id);
    if (!list.length || !rig) return;
    const i = camFocus ? list.indexOf(camFocus) : -1;
    camFocus = list[(i + 1) % list.length];
    view?.select(camFocus);
    if (cam === 'chase') rig.setMode('chase', { focus: me.alive ? me.id : camFocus, lookAt: camFocus });
    else if (cam === 'top') rig.setMode('top', { focus: camFocus });
    else rig.focusOn(camFocus, { distance: 25000 });
  }
  function weaponView(): void {
    const m = [...world.missiles.values()].filter(x => x.alive && x.shooterId === me.id).pop();
    if (!m || !rig) { say('No missile of yours in the air', 'dim'); return; }
    if (cam !== 'tactical') { cam = 'tactical'; camSeg.set('tactical'); rig.setMode('orbit'); }
    rig.focusOn(m.id, { distance: 4000 });
  }

  // ───────────────────────────────────────── keys
  const keyMap: KeyMap = {};
  const bindJet = (a: ActionId, fn: () => void, opts: { repeat?: boolean } = {}) => {
    const k = K[a];
    if (k?.keys) keyMap[k.keys] = { down: fn, repeat: opts.repeat };
  };
  // Launch: DCS FC3 Russian jets need Space held 1 s, the M-2000C 2 s for the 530.
  if (K.launch?.keys) {
    const hold = K.launch.holdS ?? 0;
    keyMap[K.launch.keys] = hold > 0
      ? launchHold.binding
      : { down: () => fire() };
  }
  // RWS/TWS: F-16 TMS Right held 1 s toggles TWS, a tap steps the bug.
  if (K.modeToggle?.keys) {
    const mk = K.modeToggle;
    keyMap[mk.keys as string] = mk.holdS
      ? modeHold.binding
      : { down: () => toggleMode() };
  }
  bindJet('designate', designateAtCursor);
  if (K.unlock?.keys) keyMap[K.unlock.keys] = { down: () => (K.unlock?.stepsInTws ? hornetUndesignate() : unlock()) };
  bindJet('lockPrimary', lockPrimary);
  bindJet('radarPower', () => powerT.toggle(true));
  bindJet('bvrMode', () => setMode('rws'));
  bindJet('rangeIn', () => rangeStep(-1));
  bindJet('rangeOut', () => rangeStep(1));
  bindJet('weaponCycle', cycleWeapon);
  bindJet('chaff', () => dispense('chaff'));
  bindJet('flare', () => dispense('flare'));
  if (!K.chaff && K.decoys?.keys) keyMap[K.decoys.keys] = { down: () => dispense('both') };
  for (const s of keymap.selects) keyMap[s.keys] = { down: () => selectFamily(s.missiles) };
  const hold = (set: () => void, clear: () => void) => ({ down: set, up: clear });
  if (K.cursorUp?.keys) keyMap[K.cursorUp.keys] = hold(() => { cursorHeld.range = 1; }, () => { cursorHeld.range = 0; });
  if (K.cursorDown?.keys) keyMap[K.cursorDown.keys] = hold(() => { cursorHeld.range = -1; }, () => { cursorHeld.range = 0; });
  if (K.cursorLeft?.keys) keyMap[K.cursorLeft.keys] = hold(() => { cursorHeld.az = -1; }, () => { cursorHeld.az = 0; });
  if (K.cursorRight?.keys) keyMap[K.cursorRight.keys] = hold(() => { cursorHeld.az = 1; }, () => { cursorHeld.az = 0; });
  bindJet('cursorCenter', () => world.setScan(me.id, { cursor: { az: 0, range: me.radar.rangeScale / 2 } }));
  if (K.elevUp?.keys) keyMap[K.elevUp.keys] = hold(() => { elevHeld.dir = 1; elevStep(1); }, () => { elevHeld.dir = 0; });
  if (K.elevDown?.keys) keyMap[K.elevDown.keys] = hold(() => { elevHeld.dir = -1; elevStep(-1); }, () => { elevHeld.dir = 0; });
  // Trainer keys.
  keyMap[TK.left] = hold(() => { setAid(null); stick.turn = -1; }, () => { stick.turn = 0; me.cmd.heading = me.heading; });
  keyMap[TK.right] = hold(() => { setAid(null); stick.turn = 1; }, () => { stick.turn = 0; me.cmd.heading = me.heading; });
  keyMap[TK.climb] = hold(() => { stick.climb = 1; }, () => { stick.climb = 0; me.cmd.altitude = me.pos.y; });
  keyMap[TK.descend] = hold(() => { stick.climb = -1; }, () => { stick.climb = 0; me.cmd.altitude = me.pos.y; });
  // LShift / LCtrl alone are the throttle; as the modifier of a chord (LShift + D, LCtrl + Z) they are not.
  keyMap[TK.faster] = hold(() => { stick.speed = 1; stick.speedAt = performance.now(); }, () => { stick.speed = 0; });
  keyMap[TK.slower] = hold(() => { stick.speed = -1; stick.speedAt = performance.now(); }, () => { stick.speed = 0; });
  bag.on(window, 'keydown', (e: KeyboardEvent) => { if (stick.speed && !/^(Shift|Control|Alt|Meta)/.test(e.code)) stick.speed = 0; }, { capture: true });
  if (TK.afterburner) keyMap[TK.afterburner] = () => abT.toggle(true);
  keyMap[TK.timeFaster] = () => { const i = TIME_SCALES.indexOf(timeScale); timeScale = TIME_SCALES[Math.min(TIME_SCALES.length - 1, i + 1)]; timeSeg.set(timeScale); };
  keyMap[TK.timeSlower] = () => { const i = TIME_SCALES.indexOf(timeScale); timeScale = TIME_SCALES[Math.max(0, i - 1)]; timeSeg.set(timeScale); };
  keyMap[TK.timeNormal] = () => { timeScale = 1; timeSeg.set(1); };
  keyMap[TK.pause] = () => pauseT.toggle(true);
  if (TK.chase) keyMap[TK.chase] = () => setCam('chase');
  if (TK.map) keyMap[TK.map] = () => setCam('top');
  if (TK.weaponView) keyMap[TK.weaponView] = () => weaponView();
  bag.add(bindKeys(keyMap));

  // ───────────────────────────────────────── end of the sortie
  function endNow(result: SortieResult): void {
    if (finished) return;
    finished = true;
    rec.tick();
    rec.dispose();
    o.onEnd({ world, eng, recorder: rec, result, setup, scripted: !!o.prerollS && o.prerollS > 0 });
  }
  function checkEnd(): void {
    if (ending) { if (world.t >= ending.at) endNow(ending.result); return; }
    const r = sortieEnd(world, eng);
    if (!r) return;
    if (r.reason === 'time') { endNow(r); return; }
    // Let the explosion play before the debrief.
    ending = { at: world.t + (r.reason === 'bingo' ? 2 : 4), result: r };
    say(r.reason === 'shot-down' ? 'You are down.' : r.reason === 'bandits-dead' ? 'All bandits down. Splash.' : 'Everyone is out of missiles.', r.outcome === 'win' ? 'ok' : r.outcome === 'loss' ? 'warning' : 'caution');
  }

  // ───────────────────────────────────────── loop
  function stepSim(simDt: number): void {
    while (simDt > 1e-6 && !finished) {
      const hh = Math.min(0.25, simDt);
      applyStick();
      world.step(hh);
      rec.tick();
      simDt -= hh;
      checkEnd();
    }
  }
  let uiAcc = 1, hintAcc = 1;
  /**
   * An enemy missile appears in 3D only once the pilot could know about it: its seeker shows on your RWR,
   * it is semi-active on you (launch warning), or it is inside visual range. A silent TWS Fox 3 stays hidden,
   * as it is in DCS, unless the 'Hidden shots' layer is on.
   */
  const VISUAL_RANGE_M = 10000;
  function syncHiddenShots(): void {
    if (!view) return;
    for (const m of world.missiles.values()) {
      if (m.side === me.side) continue;
      let known = showHiddenShots || !m.alive || !me.alive || m.pos.distanceTo(me.pos) < VISUAL_RANGE_M;
      if (!known) known = me.rwr.some(c => c.emitterId === m.id || (c.emitterId === m.shooterId && c.state === 'launch' && m.targetId === me.id));
      view.setHidden(m.id, !known);
    }
  }

  function frame(dt: number): void {
    if (finished) return;
    if (paused) clearHeldInputs();
    if (dt > 0 && !paused) {
      // Held keys (real time).
      if (stick.speed && me.alive && performance.now() - stick.speedAt > THROTTLE_DELAY_MS) me.cmd.speed = clamp(me.cmd.speed + stick.speed * 40 * dt, 120, vmax);
      if ((cursorHeld.az || cursorHeld.range) && me.alive) {
        const c = me.radar.cursor;
        world.setScan(me.id, { cursor: { az: c.az + cursorHeld.az * 30 * D2R * dt, range: Math.max(1000, c.range + cursorHeld.range * 0.45 * me.radar.rangeScale * dt) } });
      }
      if (elevHeld.dir) { elevHeld.acc += dt; if (elevHeld.acc > 0.25) { elevHeld.acc = 0; elevStep(elevHeld.dir); } }
      launchHold.tick(); modeHold.tick();
      if (!paused) stepSim(Math.min(dt, 0.1) * timeScale);
    }
    if (finished) return;
    syncHiddenShots();
    pic = buildRadarPicture(world, me.id, { units });
    radar.draw(pic, { ownHeading: me.heading });
    rwr.draw(me.rwr, world.t);
    timeline.draw(pic?.missilesInFlight ?? [], world.t);
    audio?.update(me.rwr, world.t);
    uiAcc += dt; hintAcc += dt;
    if (uiAcc >= 0.12 || dt === 0) { uiAcc = 0; updateUi(); }
    if (hintAcc >= 0.5) { hintAcc = 0; if (hintsOn) updateHint(); }
  }

  function updateUi(): void {
    // The M-2000C TIR and the JF-17 SHOOT cue light only inside Rne, but the launch is allowed from Rmax.
    inRange = !!pic && !pic.shootCue && !!pic.dlz && me.alive && world.canLaunch(me.id).ok;
    const hdg = Math.round(((me.heading * R2D) % 360 + 360) % 360);
    own.set('hdg', String(hdg).padStart(3, '0') + '°');
    own.set('alt', fmtAlt(me.pos.y, units));
    own.set('spd', `${fmtSpeed(me.vel.length(), units)} · ${fmtMach(me.vel.length(), me.pos.y)}`);
    own.set('g', me.g.toFixed(1));
    const w = me.selectedWeapon;
    own.set('wpn', w ? `${MISSILES[w].name} × ${me.stores[w] ?? 0}` : 'none');
    own.set('cm', `${me.chaff} / ${me.flares}`);
    own.setTone('cm', me.chaff < 10 ? 'caution' : null);
    const inAir = pic?.missilesInFlight ?? [];
    setText(mslText, inAir.length ? inAir.map(m => `${m.label} → ${m.targetLabel}: ${m.guidance === 'datalink' ? `active in ${m.timeToActive !== null ? Math.round(m.timeToActive) : '--'} s` : m.guidance === 'sarh' ? `hold the lock, ${m.timeToImpact !== null ? Math.round(m.timeToImpact) : '--'} s` : m.guidance === 'active' ? `pitbull, ${m.timeToImpact !== null ? Math.round(m.timeToImpact) : '--'} s` : m.guidance}`).join(' · ') : 'No missiles in flight.');
    const clock = `${fmtTime(world.t)} / ${fmtTime(SORTIE_LIMIT_S)}${paused ? ' · PAUSED' : timeScale > 1 ? ` · ${timeScale}×` : ''}`;
    setText(clockEl, clock);
    fireBtn.setLit(!!pic?.shootCue);
    const cue = pic?.cueLabel === '*' ? '★' : pic?.cueLabel ?? '';
    fireBtn.setLabel(pic?.shootCue ? `Fire · ${cue}` : inRange ? 'Fire · in range' : 'Fire');
    setText(fireWhy, !me.alive ? '' : pic?.shootCue ? (cue ? `${cue} ${pic.cueLabel === '*' || pic.cueLabel === '▲' ? 'flashing' : 'lit'}: the shot is valid.` : 'Launch available: the shot is valid in this trainer.')
      : inRange && pic?.dlz ? `In range: you can fire now. ${cue} lights inside Rne (${rng(pic.dlz.rne)}), where he cannot escape.`
        : pic?.launchBlockedReason ?? '');
    radarBezel.setStatus(me.alive ? `${pic?.modeLabel ?? ''}` : '');
    if (SEARCH_MODES.includes(me.radar.mode)) modeSeg.set(me.radar.mode);
    setAttr(modeSeg.el, 'data-stt', me.radar.mode === 'stt' ? '' : null);
    setText(rngOut, fmtRange(me.radar.rangeScale, units, 0));
    setText(elOut, `${(me.radar.elCenter * R2D).toFixed(0)}°`);
    powerT.set(me.radar.mode !== 'off');
    setText(cmdOut, `CMD ${String(Math.round(((me.cmd.heading * R2D) % 360 + 360) % 360)).padStart(3, '0')}° · ${fmtAlt(me.cmd.altitude, units)} · ${fmtSpeed(me.cmd.speed, units)}${me.cmd.afterburner ? ' · AB' : ''}${aid ? ` · ${aid.toUpperCase()}` : ''}`);
    abT.set(me.cmd.afterburner);
    const dead = !me.alive || !!ending;
    for (const b of [fireBtn, wpnBtn, chaffBtn, flareBtn, desBtn, unlockBtn, stepBtn, decoyBtn].filter((x): x is ButtonHandle => !!x)) b.setDisabled(dead);
  }

  /** Launch zone against a track: the picture's when it has one, else from the radar's own estimate (FC3 СНП before the lock). */
  function zoneOf(targetId: EntityId, pm: RadarPicture): { rmax: number | null; rne: number | null } {
    if (pm.dlz) return { rmax: pm.dlz.rmax, rne: pm.dlz.rne };
    const tr = me.radar.tracks.find(t => t.targetId === targetId);
    const w = me.selectedWeapon;
    if (!tr || !tr.firm || !w) return { rmax: null, rne: null };
    const d = dlzFor(me.pos, me.vel, tr.pos, tr.vel, w);
    return { rmax: d.rmax, rne: d.rne };
  }

  function updateHint(): void {
    const r = me.rwr[0];
    const pm = pic;
    const prim = pm?.stt ?? pm?.tracks.find(t => t.designation === 'primary') ?? null;
    const state: HintState = {
      units, alive: me.alive,
      jet: { short: spec.short, hasTws: !!spec.radar.tws, twsLaunch: !!spec.radar.tws?.launchFromTws, autoStt: spec.radar.tws?.autoSttAtRmaxFraction ?? 0, gimbalDeg: spec.radar.gimbalAzDeg },
      keys: { designate: K.designate?.keys ?? null, launch: K.launch?.keys ?? null, mode: K.modeToggle?.keys ?? null, chaff: (K.chaff ?? K.decoys)?.keys ?? null, launchHoldS: K.launch?.holdS },
      radarMode: me.radar.mode,
      weapon: me.selectedWeapon ? { name: MISSILES[me.selectedWeapon].name, seeker: MISSILES[me.selectedWeapon].seeker, count: me.stores[me.selectedWeapon] ?? 0 } : null,
      missilesLeft: missilesLeft(me),
      shootCue: !!pm?.shootCue, inRange, cueLabel: pm?.cueLabel ?? '', blocked: pm?.launchBlockedReason ?? '',
      contacts: (pm?.tracks.length ?? 0) + (pm?.bricks.length ?? 0),
      primary: prim && pm ? { label: names(prim.targetId), range: prim.range, ...zoneOf(prim.targetId, pm) } : null,
      rwr: r ? {
        state: r.state, bearing: r.bearing, elevation: r.elevation,
        emitter: r.emitterType === 'missile' ? 'Missile' : names(r.emitterId),
        sam: world.samSites.get(r.emitterId)?.type ?? null,
        missile: r.missileType ? MISSILES[r.missileType].name : null, seeker: r.missileType ? (r.state === 'launch' && (r.missileType === 'aim54a' || r.missileType === 'aim54c') ? 'sarh' : MISSILES[r.missileType].seeker) : null,
      } : null,
      own: [...world.missiles.values()].filter((m: Missile) => m.alive && m.shooterId === me.id).map(m => {
        const t = world.get(m.targetId);
        return { label: mLabel(m.id), guidance: m.guidance, tta: m.timeToActive, tti: m.timeToImpact, target: names(m.targetId), targetOffDeg: t ? Math.abs(relBearing(me.pos, me.heading, t.pos)) * R2D : null };
      }),
      bandits: eng.enemyIds.map(id => world.get(id)).filter((b): b is Aircraft => !!b && b.alive).map(b => {
        const s = rec.samples[rec.samples.length - 1]?.bandits.find(x => x.id === b.id);
        const range = me.pos.distanceTo(b.pos);
        return { name: b.callsign, range, bearing: relBearing(me.pos, me.heading, b.pos), alt: b.pos.y, rne: s?.rne ?? null, inRne: !!s?.rne && range < s.rne, hot: Math.abs(relBearing(me.pos, me.heading, b.pos)) < 35 * D2R };
      }),
      ownAlt: me.pos.y,
    };
    const hint = flightHint(state);
    coach.set(hint.text, hint.why, hint.tone);
  }

  if (paused) say('Paused (reduced motion). Press Pause to start.', 'dim');
  else say(`Fight's on: ${n > 1 ? `${n} ` : ''}${AIRCRAFT[setup.enemy].short}${n > 1 ? 's' : ''} ${fmtRange(setup.range, units, 0)} ahead.`, 'hi');

  // Screenshot pre-roll: the scripted pilot flies the first part of the fight.
  if (o.prerollS && o.prerollS > 0) {
    const pilot = new ScriptedPilot(world, me.id, eng.enemyIds);
    while (world.t < o.prerollS && !finished) {
      pilot.step();
      world.step(0.25);
      rec.tick();
      view?.syncNow();
      checkEnd();
    }
    me.cmd.heading = me.heading;
    if (rig) rig.frame(aliveIds(), { headingDeg: 15, elevationDeg: 24, instant: true, padding: framePad() });
  }

  if (stage) stage.onFrame(frame);
  else {
    let raf = 0, last = performance.now();
    const loop = (now: number) => { const dt = Math.min(0.1, (now - last) / 1000); last = now; frame(dt); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    bag.add(() => cancelAnimationFrame(raf));
  }
  frame(0);
  updateHint();

  return {
    dispose() {
      finished = true;
      rec.dispose();
      bag.dispose();
    },
  };
}

/** Collapsible key map: the jet's DCS keys (from its binds) and the trainer keys. */
function buildKeyHelp(ac: AircraftId, map: JetKeyMap): HTMLElement {
  const spec = AIRCRAFT[ac];
  const tk = trainerKeys(map);
  const K = map.keys;
  const row = (label: string, k: JetKey | undefined, extra?: string) => {
    if (!k) return null;
    const shared = k.sharedKeys;
    const note = k.keys ? (map.module === 'full' ? k.dcsName : undefined)
      : shared ? `${k.dcsName} · in DCS: ${shared}; click it here` : `no default key · ${k.dcsName}`;
    return keyHint({ label: label + (extra ?? ''), keys: k.keys ?? 'click', note });
  };
  const holdTxt = K.launch?.holdS ? ` (hold ${K.launch.holdS} s)` : '';
  const body = h('div', { class: 'sortie-keys__body' },
    placard('Radar'),
    row('RWS / TWS', K.modeToggle, K.modeToggle?.holdS ? ` (hold ${K.modeToggle.holdS} s; tap steps)` : ''),
    row('Designate / lock', K.designate),
    row('STT on the L&S', K.lockPrimary),
    row(K.unlock?.stepsInTws ? 'Undesignate / step' : 'Unlock', K.unlock),
    K.cursorUp?.keys ? keyHint({ label: 'Cursor', keys: [K.cursorUp, K.cursorLeft, K.cursorDown, K.cursorRight].map(x => x?.keys ?? '').join(' ') }) : row('Cursor', K.cursorUp),
    row('Cursor to centre', K.cursorCenter),
    K.rangeIn ? keyHint({ label: 'Range scale', keys: K.rangeIn.keys && K.rangeOut?.keys ? `${K.rangeIn.keys} / ${K.rangeOut.keys}` : 'click', note: K.rangeIn.keys ? undefined : `no default key · ${K.rangeIn.dcsName}` }) : null,
    K.elevUp ? keyHint({ label: 'Antenna up / down', keys: K.elevUp.keys && K.elevDown?.keys ? `${K.elevUp.keys} / ${K.elevDown.keys}` : 'click', note: K.elevUp.keys ? undefined : `no default key · ${K.elevUp.dcsName}` }) : null,
    row('Radar on / off', K.radarPower),
    placard('Weapons'),
    row('Launch', K.launch, holdTxt),
    row('Weapon step', K.weaponCycle),
    ...map.selects.map(s => keyHint({ label: `Select ${s.family}`, keys: s.keys, note: s.dcsName })),
    row('Chaff', K.chaff), row('Flares', K.flare), row('Countermeasures', K.chaff ? undefined : K.decoys),
    placard('Trainer keys'),
    keyHint({ label: 'Turn left / right (hold)', keys: `${tk.left} / ${tk.right}` }),
    keyHint({ label: 'Climb / descend (hold)', keys: `${tk.climb} / ${tk.descend}` }),
    keyHint({ label: 'Faster / slower (hold)', keys: `${tk.faster} / ${tk.slower}` }),
    tk.afterburner ? keyHint({ label: 'Afterburner', keys: tk.afterburner }) : null,
    keyHint({ label: 'Time faster / slower / normal', keys: `${tk.timeFaster} / ${tk.timeSlower} / ${tk.timeNormal}`, note: 'DCS time keys' }),
    keyHint({ label: 'Pause', keys: tk.pause }),
    tk.chase ? keyHint({ label: 'Chase / map / weapon view', keys: [tk.chase, tk.map, tk.weaponView].filter(Boolean).join(' / '), note: 'DCS view keys' }) : null,
    h('p', { class: 'sortie-note' }, spec.module === 'full'
      ? `The ${spec.short} is a full-fidelity module: the names are its HOTAS functions, the keys their keyboard defaults. Functions with no default key are buttons here.`
      : `FC3 keyboard defaults for the ${spec.short}.`),
  );
  const det = h('details', { class: 'sortie-keys' },
    h('summary', { class: 'sortie-keys__sum' }, h('span', null, `Keys · ${spec.short}`), h('span', { class: 'sortie-keys__hint' }, spec.module === 'fc3' ? 'FC3 defaults' : 'HOTAS + keyboard')),
    body);
  return h('section', { class: 'ui-console sortie-keys-panel' }, det);
}
