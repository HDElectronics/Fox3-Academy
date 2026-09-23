/**
 * [OWNER: page-merge] Merge & guns (#/merge): close-combat basics against a scripted bandit (issue #11). You fly
 * the sim's BFM mode with the keyboard or touch pad (roll the lift vector, pull, throttle, trigger) while the HUD
 * shows your jet's own gun sight and the 3D view shows the lift vector, turn circles, the bandit's plane of motion,
 * the line of sight coloured by pursuit, and tracers. Lessons: corner speed, pursuit, the merge, one vs two circle,
 * high yo-yo, guns tracking, guns defence, close-range lock and IR shot (sim/acm.ts: each jet's ACM modes, the IR seeker
 * growl and tone with WebAudio after a user gesture, a mute toggle), plus a free fight against the fighting AI (sim/bfmAi.ts) at three trainer
 * skill levels. Debrief per drill; progress `merge:<lesson>:<ac>`, `merge:<ac>:done` once every drill scores 50.
 *
 * URL params: ?ac=<id>, ?lesson=corner|pursuit|merge|circles|yoyo|tracking|defence|ir|fight,
 * ?bandit=straight|turn|reverse|two-circle|one-circle|rookie|regular|veteran,
 * ?shot=corner|pursuit|merge|circles|yoyo|tracking|defence|ir|fight|debrief (pre-roll with a demo autopilot, for screenshots),
 * ?acm=<mode id> (preselect a close-combat mode, e.g. helmet, bst, acm20, m2k-vert), ?wpn=ir (IR missile selected),
 * ?cam=chase|bandit|top|cockpit, ?lock=off (sight without a radar lock), ?touch=1 (show the touch pad on any pointer), ?lab=free (opens the free fight).
 */
import './style.css';
import type { Page, PageFactory, PageContext } from '../../app/page';
import type { AircraftId } from '../../data/types';
import { AIRCRAFT } from '../../data/aircraft';
import { WVR_CAVEATS, gunSpecFor, type GunSightKind } from '../../data/wvr';
import { ACM_CAVEATS, acmFor, type AcmModeId } from '../../data/acm';
import { MISSILES } from '../../data/missiles';
import { acmPressLock, acmUnlock, irShotCheck, modeSpec, setAcmMode, toggleUncage } from '../../sim/acm';
import { fmtAlt, fmtAltShort, fmtSpeed, type Units } from '../../app/format';
import { MPS_PER_KT, M_PER_FT } from '../../sim/math';
import type { BfmThrottle } from '../../sim/types';
import { Stage, WorldView, CameraRig, BfmAids, isWebGLAvailable, type BfmAidLayers } from '../../render';
import {
  h, cleanup, labLayout, disclosure, consolePanel, screenBezel, segmented, select, button, toggle,
  coachBox, eventLog, readouts, callout, modal, bindKeys, keyHint, kbd, type ModalHandle, type Tone,
} from '../../ui';
import { GunSightDisplay, IrToneAudio, buildAcmPicture, buildGunSight, noLockOptions, sightStyleFor, SIGHT_NAME } from '../../ui/displays';
import { BANDIT_LABEL, isAiMode, type BanditMode } from './bandit';
import { autoLock, eas } from './bfm';
import { CIRCLE_EVAL_S, IR_LESSONS, LESSONS, LESSON_ORDER, SCORED_LESSONS, PURSUIT_HOLD_S, debrief, type Debrief, type LessonId } from './lessons';
import { anglesOf } from './runner';
import { chooseCircle } from '../../sim/bfmAi';
import { MergeRun, type Autopilot } from './runner';

type Cam = 'chase' | 'bandit' | 'top' | 'cockpit';
const CAMS: Cam[] = ['chase', 'bandit', 'top', 'cockpit'];
const SHOTS = ['corner', 'pursuit', 'merge', 'circles', 'yoyo', 'tracking', 'defence', 'ir', 'fight', 'debrief'] as const;
type Weapon = 'gun' | 'ir';
type Shot = typeof SHOTS[number];
const THR_LABEL: Record<BfmThrottle, string> = { idle: 'IDLE', mil: 'MIL', ab: 'AB' };
const AID_LABEL: Record<keyof BfmAidLayers, string> = {
  pursuit: 'Pursuit lines', liftVector: 'Lift vector', turnCircles: 'Turn circles', planeOfMotion: 'Plane of motion', tracers: 'Tracers', hits: 'Hit sparks',
};

function goalText(id: LessonId, corner: string): string {
  switch (id) {
    case 'corner': return `Hold ${corner} in a hard turn. Pull to the limit above corner, ease off and add power below it. Only turns of 3 g or more count.`;
    case 'pursuit': return `The bandit holds a turn. Fly lead, then pure, then lag pursuit, ${PURSUIT_HOLD_S} s each. The line of sight changes colour with your pursuit.`;
    case 'merge': return 'Head-on merge. Lead turn toward his side just before he passes your wing line, pass close, then choose nose high or nose low. Scored on angles gained by the second pass.';
    case 'circles': return `After the pass, turn toward him (two-circle, a rate fight) or away (one-circle, a radius fight). Pick the fight your jet wins. Scored on angle off his tail and range ${CIRCLE_EVAL_S} s after the pass.`;
    case 'yoyo': return 'You are fast and inside his hard turn. Before you overshoot, roll your lift vector above his plane and pull up, then come back down behind him. Scored on no overshoot and range held.';
    case 'tracking': return 'Get in his plane of motion, pull the sight onto him, frame his wingspan and fire short bursts.';
    case 'defence': return 'He is behind you with guns. Break, then as his nose comes to lead, unload and roll out of his plane.';
    case 'ir': return 'Pick your close-combat mode for where he is, lock him, get the seeker tone, and fire the IR missile inside range and the off-boresight limit. He flares after the launch.';
    case 'fight': return 'Merge head-on against the fighting AI, then fight: corner speed in the turn, lead to close, guns in his plane. Skill levels are trainer levels, not DCS AI skills.';
  }
}

const factory: PageFactory = (): Page => {
  const bag = cleanup();
  let dead = false;

  function mount(ctx: PageContext): void {
    const acParam = ctx.params.get('ac') as AircraftId | null;
    if (acParam && AIRCRAFT[acParam]) {
      const rest = new URLSearchParams(ctx.params);
      rest.delete('ac');
      const qs = rest.toString();
      try { history.replaceState(history.state, '', `#/merge${qs ? '?' + qs : ''}`); } catch { /* sandboxed */ }
      if (acParam !== ctx.app.aircraft) { ctx.app.setAircraft(acParam); return; }
    }
    const ac = ctx.app.aircraft;
    const spec = ctx.app.spec;
    const units: Units = ctx.app.units;
    const gun = gunSpecFor(ac);
    const cornerMps = spec.perf.cornerKts * MPS_PER_KT;
    const cornerTxt = fmtSpeed(cornerMps, units);
    const dist = (m: number): string => units === 'metric' ? `${Math.round(m / 10) * 10} m` : `${Math.round(m / M_PER_FT / 50) * 50} ft`;
    const free = ctx.params.get('lab') === 'free';

    // ------------------------------------------------------------------ state
    const shot = ctx.params.get('shot') as Shot | null;
    const lp = ctx.params.get('lesson') as LessonId | null;
    let lesson: LessonId = lp && LESSONS[lp] ? lp : shot && shot !== 'debrief' && (LESSONS as Record<string, unknown>)[shot] ? shot as LessonId
      : shot === 'debrief' ? 'tracking' : free ? 'fight' : 'corner';
    const bp = ctx.params.get('bandit') as BanditMode | null;
    let banditMode: BanditMode = bp && LESSONS[lesson].banditModes.includes(bp) ? bp : LESSONS[lesson].bandit;
    let lockMode: 'auto' | 'off' = ctx.params.get('lock') === 'off' ? 'off' : 'auto';
    let pick: GunSightKind | undefined;
    let locked = false, shoot = false;
    let cam: Cam = CAMS.includes(ctx.params.get('cam') as Cam) ? ctx.params.get('cam') as Cam : 'chase';
    let run!: MergeRun;
    let paused = false;
    let attempt = 0;
    let uiClock = 0;
    let result: ModalHandle | null = null;
    let last: Debrief | null = null;
    const acmParam = ctx.params.get('acm') as AcmModeId | null;
    let weapon: Weapon = ctx.params.get('wpn') === 'ir' || lesson === 'ir' ? 'ir' : 'gun';
    let toneOn = true;
    const tone = new IrToneAudio();
    bag.add(() => tone.dispose());
    /** Start the tone audio from a user gesture (key or pointer). */
    const startAudio = (): void => { if (toneOn && !tone.enabled && !dead) void tone.start(); };

    // ------------------------------------------------------------------ DOM: strip
    const viewport = h('div', { class: 'mrg-viewport' });
    const hudCanvas = h('canvas', { class: 'mrg-canvas' });
    const overCanvas = h('canvas', { class: 'mrg-over', 'aria-hidden': 'true' });
    const hudBezel = screenBezel({ id: 'mrg-hud', label: 'HUD', aspect: '1', content: hudCanvas, class: 'mrg-hud' });
    const ro = readouts({
      id: 'mrg-own', variant: 'glass', columns: 2,
      rows: [
        { id: 'ias', label: 'IAS', title: 'Equivalent airspeed, the speed corner speed is quoted in (simplified)' },
        { id: 'corner', label: 'Corner' }, { id: 'g', label: 'G' }, { id: 'thr', label: 'Throttle' },
        { id: 'alt', label: 'Altitude' }, { id: 'rng', label: 'Range' },
        { id: 'pur', label: 'Pursuit', title: 'Your velocity vector against the line of sight: lead ahead of him, lag behind' },
        { id: 'rds', label: 'Rounds' }, { id: 'hits', label: 'Hits', title: 'Your hits / hits taken' },
        { id: 'ir', label: 'IR', title: 'IR missiles left, selected, and the seeker tone' },
      ],
    });
    const stripBlock = h('div', { class: 'ui-strip-block mrg-readouts' }, ro.el);

    // ------------------------------------------------------------------ DOM: lesson panel
    const lessonBtns = new Map<LessonId, { el: HTMLButtonElement; best: HTMLElement }>();
    const lessonList = h('div', { class: 'mrg-lessons', role: 'group', 'aria-label': 'Lesson' },
      LESSON_ORDER.map(id => {
        const d = LESSONS[id];
        const best = h('span', { class: 'mrg-lesson__best' });
        const el = h('button', { type: 'button', class: 'mrg-lesson', id: `mrg-lesson-${id}`, 'aria-pressed': 'false', onclick: () => chooseLesson(id) },
          h('span', { class: 'mrg-lesson__n' }, d.n === null ? '·' : String(d.n)), h('span', { class: 'mrg-lesson__title' }, d.title), best);
        lessonBtns.set(id, { el, best });
        return el;
      }));
    const goalEl = h('p', { class: 'mrg-goal' });
    const banditSel = select<BanditMode>({
      id: 'mrg-bandit', label: 'Bandit', value: banditMode, options: [],
      onChange: v => { banditMode = v; build(); },
    });
    const lockSeg = segmented<'auto' | 'off'>({
      id: 'mrg-lock', label: 'Radar lock', value: lockMode, fill: true, size: 's',
      options: [
        { value: 'auto', label: 'Auto', title: 'Locks inside 5 nm and 20° of the nose (simplified close-combat lock)' },
        { value: 'off', label: 'No lock', title: 'Gun sight without a radar lock' },
      ],
      onChange: v => { lockMode = v; },
    });
    const picks = noLockOptions(ac);
    const pickSeg = picks.length > 1 ? segmented<GunSightKind>({
      id: 'mrg-pick', label: 'Sight without lock', value: picks[0]!, fill: true, size: 's',
      options: picks.map(k => ({ value: k, label: SIGHT_NAME[k] })),
      onChange: v => { pick = v; },
    }) : null;
    const startBtn = button({ id: 'mrg-start', label: 'Start', variant: 'primary', keys: 'Enter', block: true, onClick: () => start() });
    const lessonPanel = consolePanel({
      id: 'mrg-lesson-panel', title: 'Lesson',
      children: [lessonList, goalEl, banditSel.el, lockSeg.el, pickSeg?.el ?? null, startBtn.el],
    });

    // ------------------------------------------------------------------ DOM: fly panel
    const coach = coachBox({ id: 'mrg-coach' });
    const thrSeg = segmented<BfmThrottle>({
      id: 'mrg-thr', label: 'Throttle', value: 'mil', fill: true, size: 's',
      options: [{ value: 'idle', label: 'Idle', keys: '1' }, { value: 'mil', label: 'Mil', keys: '2' }, { value: 'ab', label: 'AB', keys: '3' }],
      onChange: v => { setThrottle(v); },
    });
    const sbToggle = toggle({ id: 'mrg-sb', label: 'Speedbrake', keys: 'B', size: 's', onChange: v => { run.stick.speedbrake = v; takeControl(); } });
    const gunKeys = gun
      ? h('p', { class: 'mrg-note' }, `In the ${spec.short}: select the gun with `, kbd(gun.keys.select.value),
        gun.keys.select.verified ? '' : ' (not verified)', ', fire with ', kbd(gun.keys.fire.value), gun.keys.fire.verified ? '.' : ' (trainer key).',
        ` ${gun.gun}, ${gun.rounds.value} rounds${gun.rounds.verified ? '' : ' (not verified)'}.`)
      : h('p', { class: 'mrg-note' }, 'No gun data for this jet.');
    const hints = h('div', { class: 'mrg-hints' },
      keyHint({ label: 'Roll the lift vector', keys: '← / →' }),
      keyHint({ label: 'Pull / unload', keys: '↓ / ↑' }),
      keyHint({ label: 'Trigger (hold)', keys: 'Space' }),
      keyHint({ label: 'Idle, mil, afterburner', keys: '1 / 2 / 3' }),
      keyHint({ label: 'Speedbrake', keys: 'B' }),
      keyHint({ label: 'Cockpit, chase, bandit, top', keys: 'F1 / F2 / F3 / F10' }));
    const hintNote = h('p', { class: 'mrg-note' },
      'Arrow keys as in DCS (↓ pulls). Hands off the pitch keys, the jet holds a level turn at its bank: a trainer aid. Throttle keys are trainer keys.');
    const aidOn: BfmAidLayers = { pursuit: true, liftVector: true, turnCircles: true, planeOfMotion: true, tracers: true, hits: true };
    const aidToggles = (Object.keys(AID_LABEL) as (keyof BfmAidLayers)[]).map(k => toggle({
      id: `mrg-aid-${k}`, label: AID_LABEL[k], size: 's', value: true, onChange: v => { aidOn[k] = v; applyAids(); },
    }));
    /** The cockpit view hides the aids drawn from your own jet (they would start at your eye). */
    function applyAids(): void {
      const ck = cam === 'cockpit';
      aids?.setLayers({ ...aidOn, pursuit: aidOn.pursuit && !ck, liftVector: aidOn.liftVector && !ck, turnCircles: aidOn.turnCircles && !ck });
    }
    const flyPanel = consolePanel({
      id: 'mrg-fly-panel', title: 'Fly',
      children: [coach.el, thrSeg.el, sbToggle.el, gunKeys, hints, hintNote],
    });
    // ------------------------------------------------------------------ DOM: close-combat panel
    const jetAcm = acmFor(ac);
    const irName = jetAcm ? MISSILES[jetAcm.ir.missile].name : null;
    const fc3 = jetAcm?.ir.readyCue.value === 'ПР';
    const tag = (v: boolean) => v ? '' : ' (not verified)';
    const modeSeg = jetAcm ? segmented<AcmModeId | 'off'>({
      id: 'mrg-acm', label: 'Close-combat mode', value: 'off', fill: true, size: 's',
      options: [{ value: 'off', label: 'Off' }, ...jetAcm.modes.map(m => ({ value: m.id, label: m.name, title: m.note }))],
      onChange: v => { selectMode(v === 'off' ? null : v); },
    }) : null;
    const wpnSeg = segmented<Weapon>({
      id: 'mrg-wpn', label: 'Weapon', value: weapon, fill: true, size: 's',
      options: [{ value: 'gun', label: 'Gun' }, { value: 'ir', label: irName ?? 'IR', keys: 'W' }],
      onChange: v => { setWeapon(v); },
    });
    const lockBtn = button({ id: 'mrg-acm-lock', label: 'Lock', size: 's', keys: 'Enter', onClick: () => { pressLock(); } });
    const unlockBtn = button({ id: 'mrg-acm-unlock', label: 'Unlock', size: 's', keys: 'Backspace', onClick: () => { if (run.acm) acmUnlock(run.world, run.me, run.acm); } });
    const uncageBtn = jetAcm?.ir.uncage.value === 'key'
      ? button({ id: 'mrg-acm-uncage', label: 'Uncage', size: 's', keys: 'C', onClick: () => { if (run.acm) toggleUncage(run.acm); } }) : null;
    const toneToggle = toggle({
      id: 'mrg-tone', label: 'Seeker tone', size: 's', value: true,
      onChange: v => { toneOn = v; if (v) void tone.start(); else tone.stop(); },
    });
    const acmKeys = jetAcm ? h('div', { class: 'mrg-note' },
      h('p', null, jetAcm.entry.value + tag(jetAcm.entry.verified)),
      h('ul', { class: 'mrg-caveats' }, jetAcm.modes.map(m => h('li', null, kbd(m.key.value), ` ${m.name}${tag(m.key.verified)}: ${m.note}`))),
      h('p', null, `${irName}: `, jetAcm.ir.uncageKey ? h('span', null, 'uncage ', kbd(jetAcm.ir.uncageKey.value), tag(jetAcm.ir.uncageKey.verified), ', ') : null,
        'fire ', kbd(jetAcm.ir.fire.value), tag(jetAcm.ir.fire.verified), `. Launch limit ${jetAcm.ir.launchLimitDeg.value}° off the nose${tag(jetAcm.ir.launchLimitDeg.verified)}. Ready cue: ${jetAcm.ir.readyCue.value}${tag(jetAcm.ir.readyCue.verified)}.`),
      fc3 ? callout({ kind: 'dcs', body: 'Fi0 (key 6) uses only the R-73\'s own 2° seeker: no radar, no IRST, nothing on his RWR. VS, BORE and HELMET use the IRST, also silent. Judge the range by eye.' }) : null,
      h('p', null, 'Trainer keys here: M cycles the mode, Enter locks, Backspace unlocks, C uncages, W swaps gun and missile, Space fires.'))
      : h('p', { class: 'mrg-note' }, 'No close-combat data for this jet.');
    const acmPanel = consolePanel({
      id: 'mrg-acm-panel', title: 'Close combat',
      children: [modeSeg?.el ?? null, h('div', { class: 'mrg-acm-btns' }, lockBtn.el, unlockBtn.el, uncageBtn?.el ?? null), wpnSeg.el, toneToggle.el, acmKeys],
    });
    const aidsPanel = consolePanel({ id: 'mrg-aids-panel', title: '3D aids', children: [h('div', { class: 'mrg-aids' }, aidToggles.map(t => t.el))] });
    const log = eventLog({ id: 'mrg-log', max: 30, empty: 'Press Start. Events show here.' });
    const notes = h('div', { class: 'mrg-notes' },
      callout({
        kind: 'simplified',
        body: 'Drill bandits are scripted. The free fight uses a rule-based fighting AI (lead turn, one or two circle, high yo-yo, guns, jinks) at three trainer skill levels, not the DCS AI. You fly an arcade BFM mode: roll the lift vector and pull, no stick-and-rudder flight model. The gun sight symbols follow each jet\'s HUD; their geometry is the trainer\'s lead approximation. Hits are an arcade rule: about 2 s of fire in the solution kills at 600 m, less closer. Circle advice and scores are trainer rules.',
      }),
      h('ul', { class: 'mrg-caveats' }, [...WVR_CAVEATS, ...ACM_CAVEATS].map(c => h('li', null, c))));

    // ------------------------------------------------------------------ DOM: viewport overlays
    const pill = h('div', { class: 'mrg-pill', role: 'status' });
    const camSeg = segmented<Cam>({
      id: 'mrg-cam', ariaLabel: 'Camera', value: cam, size: 's',
      options: [{ value: 'cockpit', label: 'Cockpit', keys: 'F1' }, { value: 'chase', label: 'Chase', keys: 'F2' }, { value: 'bandit', label: 'Bandit', keys: 'F3' }, { value: 'top', label: 'Top', keys: 'F10' }],
      onChange: v => setCam(v),
    });
    const pauseBtn = button({ id: 'mrg-pause', label: 'Pause', size: 's', keys: 'P', onClick: () => togglePause() });
    const retryBtn = button({ id: 'mrg-retry', label: 'Retry', size: 's', keys: 'R', onClick: () => retry() });
    const debriefBtn = button({ id: 'mrg-debrief', label: 'Debrief', size: 's', onClick: () => { if (last) showResult(last); } });
    const startOverlay = button({ id: 'mrg-start-ov', label: 'Start', variant: 'primary', keys: 'Enter', onClick: () => start() });

    // Touch pad: hold buttons for coarse pointers (or ?touch=1).
    const hold = (label: string, cls: string, on: () => void, off: () => void) => {
      const el = h('button', { type: 'button', class: `mrg-pad__btn ${cls}`, 'aria-label': label }, label);
      const up = () => { el.classList.remove('is-held'); off(); };
      el.addEventListener('pointerdown', e => { e.preventDefault(); el.setPointerCapture?.(e.pointerId); el.classList.add('is-held'); takeControl(); on(); });
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('lostpointercapture', up);
      el.addEventListener('contextmenu', e => e.preventDefault());
      return el;
    };
    const pad = h('div', { class: 'mrg-pad', 'aria-label': 'Touch controls' },
      h('div', { class: 'mrg-pad__row' },
        hold('Roll left', 'mrg-pad__roll', () => { run.stick.roll = -1; }, () => { if (run.stick.roll < 0) run.stick.roll = 0; }),
        hold('Pull', 'mrg-pad__pull', () => { run.stick.pitch = 1; }, () => { if (run.stick.pitch > 0) run.stick.pitch = 0; }),
        hold('Roll right', 'mrg-pad__roll', () => { run.stick.roll = 1; }, () => { if (run.stick.roll > 0) run.stick.roll = 0; })),
      h('div', { class: 'mrg-pad__row' },
        hold('Unload', 'mrg-pad__unload', () => { run.stick.pitch = -1; }, () => { if (run.stick.pitch < 0) run.stick.pitch = 0; }),
        hold('Fire', 'mrg-pad__gun', () => { if (weapon === 'ir') fireMissile(); else run.stick.trigger = true; }, () => { run.stick.trigger = false; }),
        h('button', { type: 'button', class: 'mrg-pad__btn mrg-pad__thr', onclick: () => cycleThrottle() }, 'Thr')));
    if (ctx.params.get('touch') === '1') pad.classList.add('is-forced');

    const lab = labLayout({
      id: 'mrg-lab', mobileTabs: true, class: 'mrg-lab',
      header: {
        title: free ? 'Free fight' : 'Merge & guns',
        meta: `${spec.short} · ${gun ? `${gun.gun} · ${gun.rounds.value} rounds` : 'no gun data'}`,
        lede: 'Turn at corner. Choose your pursuit. Win the merge. Track and shoot. Defend.',
      },
      viewport,
      strip: [hudBezel.el, stripBlock],
      console: [lessonPanel.el, flyPanel.el, acmPanel.el, aidsPanel.el, disclosure({ title: 'Events', content: log.el }), disclosure({ title: 'Accuracy notes', content: notes })],
    });
    bag.add(() => lab.destroy());
    viewport.append(overCanvas);
    lab.overlay('tl', pill);
    lab.overlay('tr', camSeg.el);
    lab.overlay('bl', startOverlay.el, pauseBtn.el, retryBtn.el, debriefBtn.el);
    lab.overlay('br', pad);
    ctx.root.append(h('div', { class: 'mrg-page' }, lab.el));

    const hud = new GunSightDisplay(hudCanvas, { fovDeg: 18 });
    bag.add(() => hud.dispose());
    const over = new GunSightDisplay(overCanvas, { overlay: true, fovDeg: 50 });
    bag.add(() => over.dispose());

    // ------------------------------------------------------------------ 3D
    let st: Stage | null = null;
    let view: WorldView | null = null;
    let rig: CameraRig | null = null;
    let aids: BfmAids | null = null;
    if (isWebGLAvailable()) {
      try { st = new Stage(viewport, { autoPause: 'render', ariaLabel: '3D view of the fight' }); } catch (e) { console.warn('Merge: 3D view unavailable', e); st = null; }
    }
    if (!st) viewport.append(h('p', { class: 'mrg-no3d' }, 'The 3D view needs WebGL. Fly on the HUD and the readouts.'));
    const stage = st;
    if (stage) bag.add(() => stage.dispose());

    // ------------------------------------------------------------------ build a run
    function build(): void {
      closeResult();
      run = new MergeRun(ac, lesson, banditMode, 4000 + attempt * 7919, {
        log: (text, t) => { if (!dead) log.push(text, { t }); },
        finished: () => { if (!dead) finished(); },
      });
      paused = false;
      locked = false; shoot = false;
      if (!IR_LESSONS.includes(lesson)) weapon = 'gun';
      else if (lesson === 'ir') weapon = 'ir';
      wpnSeg.set(weapon);
      wpnSeg.setDisabled('ir', !IR_LESSONS.includes(lesson) || !jetAcm);
      if (acmParam && run.acm && modeSpec(run.acm, acmParam)) setAcmMode(run.world, run.me, run.acm, acmParam);
      modeSeg?.set(run.acm?.mode ?? 'off');
      thrSeg.set(run.stick.throttle);
      sbToggle.set(false);
      if (stage) {
        if (!view) {
          view = new WorldView(stage, run.world, {
            units, observer: run.me.id,
            label: (x, u) => ({ title: x.callsign, type: AIRCRAFT[x.type].short, sub: fmtAltShort(x.pos.y, u) + ' · ' + fmtSpeed(x.vel.length(), u) }),
          });
          rig = new CameraRig(stage, { source: view });
          aids = new BfmAids(stage, run.world, { me: run.me.id, bandit: run.bandit.id, pursuit: () => (run.me.alive && run.bandit.alive ? run.pursuit.kind : null) });
          stage.onFrame(frame);
        } else {
          view.setWorld(run.world);
          aids?.setWorld(run.world, { me: run.me.id, bandit: run.bandit.id });
        }
        view.syncNow();
        setCam(cam, true);
        stage.requestRender();
      }
      log.clear();
      refreshStatic();
      refreshLive();
    }

    function chooseLesson(id: LessonId): void {
      lesson = id;
      banditMode = LESSONS[id].bandit;
      build();
    }

    function start(): void {
      if (run.phase !== 'setup') return;
      run.start();
      paused = false;
      if (stage && !stage.running) stage.resume();
      refreshStatic();
    }
    function togglePause(): void { if (run.phase === 'run') { paused = !paused; refreshStatic(); } }
    function retry(): void { attempt++; build(); }
    function takeControl(): void { run.autopilot = null; if (run.phase === 'setup') start(); }
    function setThrottle(t: BfmThrottle): void { run.stick.throttle = t; thrSeg.set(t); takeControl(); }
    function cycleThrottle(): void { setThrottle(run.stick.throttle === 'idle' ? 'mil' : run.stick.throttle === 'mil' ? 'ab' : 'idle'); }
    function closeResult(): void { if (result) { result.destroy(); result = null; } }
    function selectMode(id: AcmModeId | null): void {
      if (!run.acm) return;
      setAcmMode(run.world, run.me, run.acm, id);
      modeSeg?.set(id ?? 'off');
      if (run.phase === 'end') return;
      if (id) log.push(`${modeSpec(run.acm, id)?.name ?? id} selected`, { t: run.world.t });
    }
    function cycleMode(): void {
      if (!run.acm || !jetAcm) return;
      const ids: (AcmModeId | null)[] = [null, ...jetAcm.modes.map(m => m.id)];
      const i = ids.indexOf(run.acm.mode);
      selectMode(ids[(i + 1) % ids.length] ?? null);
    }
    function pressLock(): void {
      if (!run.acm || run.phase === 'end') return;
      if (!acmPressLock(run.world, run.me, run.acm) && run.acm.msg) log.push(run.acm.msg, { t: run.world.t });
    }
    function setWeapon(w: Weapon): void {
      weapon = IR_LESSONS.includes(lesson) && jetAcm ? w : 'gun';
      wpnSeg.set(weapon);
      if (weapon === 'ir') run.stick.trigger = false;
    }
    function fireMissile(): void {
      if (run.phase === 'end' || !run.me.alive) return;
      run.autopilot = null;
      const r = run.fireIr();
      if (r && !r.ok) log.push(r.reason, { t: run.world.t });
      refreshStatic();
    }

    function finished(): void {
      const d = debrief(lesson, run.metrics, {
        corner: cornerTxt, minSpeed: Number.isFinite(run.metrics.minKts) ? fmtSpeed(run.metrics.minKts * MPS_PER_KT, units) : '-',
        dist, me: spec.short, bandit: AIRCRAFT[run.bandit.type].short,
        skill: isAiMode(banditMode) ? BANDIT_LABEL[banditMode].replace('Fighting AI: ', '') : undefined,
        irMissile: irName ?? undefined, uncageKey: jetAcm?.ir.uncageKey?.value ?? null, fc3,
      });
      last = d;
      if (!run.autopilot) {
        const key = `merge:${lesson}:${ac}`;
        const prev = Number(ctx.app.getProgress(key) ?? 0) || 0;
        ctx.app.setProgress(key, Math.max(prev, d.score, 1));
        const all = SCORED_LESSONS.every(id => (Number(ctx.app.getProgress(`merge:${id}:${ac}`) ?? 0) || 0) >= 50);
        if (all) ctx.app.setProgress(`merge:${ac}:done`, true);
      }
      refreshStatic();
      showResult(d);
    }

    function showResult(d: Debrief): void {
      closeResult();
      const idx = LESSON_ORDER.indexOf(lesson);
      const next = LESSON_ORDER[idx + 1];
      result = modal({
        id: 'mrg-result', title: d.title, tone: d.tone as Tone, within: lab.view, open: true,
        body: h('div', { class: 'mrg-result' },
          h('p', { class: 'mrg-score' }, `Score ${d.score} / 100`),
          h('dl', { class: 'mrg-stats' }, d.stats.map(([k, v]) => h('div', { class: 'mrg-stat' }, h('dt', null, k), h('dd', null, v)))),
          h('ul', { class: 'mrg-coaching' }, d.coaching.map(c => h('li', null, c)))),
        actions: [
          { label: 'Retry', keys: 'R', onClick: () => retry() },
          ...(next ? [{ label: `Next: ${LESSONS[next].title}`, keys: 'N', primary: true, onClick: () => chooseLesson(next) }] : []),
        ],
      });
    }

    // ------------------------------------------------------------------ camera
    function setCam(c: Cam, instant = false): void {
      cam = c;
      camSeg.set(c);
      overCanvas.hidden = c !== 'cockpit';
      view?.setLayer('labels', c !== 'cockpit');
      applyAids();
      if (!rig) return;
      if (c === 'chase') rig.setMode('chase', { focus: run.me.id, lookAt: run.bandit.id, distance: 90, instant });
      else if (c === 'bandit') rig.setMode('orbit', { focus: run.bandit.id, distance: 500, instant });
      else if (c === 'top') rig.setMode('top', { focus: run.me.id, distance: 9000, instant });
      else rig.setMode('cockpit', { focus: run.me.id, instant });
      stage?.requestRender();
    }

    // ------------------------------------------------------------------ refresh
    function refreshStatic(): void {
      for (const [id, b] of lessonBtns) {
        b.el.setAttribute('aria-pressed', String(id === lesson));
        const best = Number(ctx.app.getProgress(`merge:${id}:${ac}`) ?? 0) || 0;
        b.best.textContent = best ? `Best ${best}` : '';
        b.el.classList.toggle('is-done', best >= 50 && id !== 'fight');
      }
      goalEl.textContent = goalText(lesson, cornerTxt);
      banditSel.setOptions(LESSONS[lesson].banditModes.map(m => ({ value: m, label: BANDIT_LABEL[m] })));
      banditSel.set(banditMode);
      banditSel.setDisabled(LESSONS[lesson].banditModes.length < 2);
      const setup = run.phase === 'setup';
      startBtn.el.hidden = !setup;
      startOverlay.el.hidden = !setup;
      pauseBtn.el.hidden = run.phase !== 'run';
      pauseBtn.setLabel(paused ? 'Resume' : 'Pause');
      retryBtn.el.hidden = setup;
      debriefBtn.el.hidden = !last || run.phase !== 'end';
      lab.el.classList.toggle('is-running', run.phase === 'run');
    }

    function coachNow(): [string, string, Tone | null] {
      const me = run.me, b = run.bandit, m = run.metrics;
      if (run.phase === 'setup') return ['Press Start, or just fly: any control starts the drill.', goalText(lesson, cornerTxt), null];
      if (!me.alive) return ['You were shot down.', 'Retry and change planes earlier.', 'warning'];
      if (run.phase === 'end') return ['Knock it off.', 'Read the debrief.', null];
      const kts = eas(me) / MPS_PER_KT, dv = kts - spec.perf.cornerKts;
      const sol = b.alive ? run.pursuit : null;
      switch (lesson) {
        case 'corner':
          if (me.g < 3) return ['Pull: roll into a turn and pull (↓).', 'Time at corner counts only at 3 g or more.', 'caution'];
          if (dv > 25) return ['Fast: pull harder, or throttle back.', `Above ${cornerTxt} you are g-limited: speed without extra turn rate.`, 'caution'];
          if (dv < -25) return ['Slow: ease the pull, add power, or drop the nose.', `Below ${cornerTxt} the jet cannot reach its g limit.`, 'caution'];
          return ['At corner: hold it.', 'Best instantaneous turn rate.', 'ok'];
        case 'pursuit': {
          const want = run.requested;
          if (!want || !sol) return ['Pursuit drill done.', '', 'ok'];
          const held = m.held[m.phase] ?? 0;
          const why = `${held.toFixed(0)} of ${PURSUIT_HOLD_S} s held. You are in ${sol.kind} (${Math.round(sol.leadDeg)}°).`;
          if (sol.kind === want) return [`${want[0]!.toUpperCase()}${want.slice(1)} pursuit: hold it.`, why, 'ok'];
          const how = want === 'lead' ? 'Pull your nose ahead of him, into his turn.' : want === 'pure' ? 'Put your velocity vector on him.' : 'Ease the pull, nose behind his tail.';
          return [`Fly ${want} pursuit. ${how}`, why, 'caution'];
        }
        case 'merge':
        case 'circles': {
          if (m.passT === null) {
            const a = anglesOf(me, b);
            if (a.range > 3500) return ['Fly to the merge. Point at him, pass close.', 'Aim to pass 300 to 500 m off his side.', null];
            return ['Lead turn: roll toward his side and pull as he nears your wing line.', 'Too early gives him your nose; too late gives away angles.', 'caution'];
          }
          if (lesson === 'circles') {
            const adv = chooseCircle(ac, run.bandit.type, 'veteran');
            const left = Math.max(0, CIRCLE_EVAL_S - (m.t - m.passT));
            return [`${m.circleFlown === 'one' ? 'One-circle' : m.circleFlown === 'two' ? 'Two-circle' : 'Turn'}: hold corner speed in the turn.`,
              `Trainer advice for ${spec.short} vs ${AIRCRAFT[run.bandit.type].short}: ${adv === 'two' ? 'two-circle (rate)' : 'one-circle (radius)'}. ${Math.ceil(left)} s to the score.`, m.circleFlown && m.circleFlown !== adv ? 'caution' : 'ok'];
          }
          return ['Turn at corner. Nose high or nose low, then meet him again.', `Angles so far: ${Math.round(m.anglesDeg)}°.`, m.anglesDeg >= 0 ? 'ok' : 'caution'];
        }
        case 'yoyo': {
          const a = anglesOf(me, b);
          if (!a.behind) return ['Overshoot. Reverse and get back behind him.', 'Next time go out of plane earlier.', 'warning'];
          if (a.range < 900 && me.vel.length() > b.vel.length() + 40) return ['Closing fast: lift vector above his plane and pull up.', 'Trade closure for height; roll back down when the closure is gone.', 'caution'];
          return ['Behind him in range: hold it.', `${m.heldS.toFixed(0)} s held.`, 'ok'];
        }
        case 'tracking':
        case 'fight': {
          if (!b.alive) return ['Splash.', 'Bandit destroyed.', 'ok'];
          const p = buildGunSight(me, b, { locked });
          if (p?.inSolution) return ['In solution: fire a short burst.', 'The gun line is on his lead point.', 'ok'];
          if (p?.inRange) return ['In range: pull the sight onto him.', 'Get in his plane of motion, then track.', 'caution'];
          return ['Close in: lead pursuit closes range.', `Gun range ${gun ? Math.round(gun.maxRangeM.value / (units === 'metric' ? 1 : M_PER_FT)) + (units === 'metric' ? ' m' : ' ft') : ''}.`, null];
        }
        case 'ir': {
          const acm = run.acm;
          if (!b.alive) return ['Splash.', 'Bandit destroyed.', 'ok'];
          if (!acm || !jetAcm) return ['No close-combat data for this jet.', '', null];
          const md = modeSpec(acm);
          if (m.irShots > 0 && run.phase === 'run') return ['Missile away. Watch for his flares.', m.irFlared ? 'Decoyed: get the tone again and shoot closer to his tail.' : 'A second shot is allowed.', 'ok'];
          if (!md) return ['Pick a close-combat mode (M).', `Boresight for a bandit on the nose, the vertical scan for one above it in a turn.${fc3 ? ' Fi0 needs no lock at all.' : ''}`, 'caution'];
          const sk = acm.seeker;
          if (!acm.lockedId && md.sensor !== 'seeker') return [md.lock.value === 'enter' ? `${md.name}: put him in the area and press Enter.` : `${md.name}: put him in the area and hold him there.`, md.note, 'caution'];
          if (sk.tone === 'none') return ['No heat in the seeker.', `Point the nose closer to him; ${irName} limit ${jetAcm.ir.launchLimitDeg.value}°.`, 'caution'];
          if (sk.tone === 'growl') return [jetAcm.ir.uncage.value === 'key' ? `Growl. Uncage (${jetAcm.ir.uncageKey?.value ?? 'C'}).` : 'Growl. Hold him in the seeker.', 'The seeker sees his heat but does not track yet.', 'caution'];
          const c = irShotCheck(run.world, me, acm);
          if (!c.ok) return ['Tone, but no shot yet.', c.reason, 'caution'];
          return [fc3 ? 'ПР. Fire (Space).' : 'High tone. Fire (Space).', 'The seeker tracks him inside range and the off-boresight limit.', 'ok'];
        }
        case 'defence':
          if (m.hisSolutionS > 0 && b.alive && run.bandit.gun.firing) return ['Guns. Unload and roll out of his plane.', 'Break his tracking: change planes, then pull.', 'warning'];
          return ['Keep sight of him. Break into him.', 'Watch his nose: when it comes to lead, change planes.', 'caution'];
      }
    }

    function refreshLive(): void {
      const me = run.me, b = run.bandit;
      const tl = run.phase === 'run' ? ` · ${Math.ceil(run.timeLeft)} s` : run.phase === 'end' ? ' · Over' : ' · Ready';
      const req = run.requested && run.phase === 'run' ? ` · ${run.requested.toUpperCase()}` : '';
      pill.textContent = `${LESSONS[lesson].title}${req}${tl}${paused ? ' · Paused' : ''}`;
      ro.set('ias', fmtSpeed(eas(me), units));
      ro.set('corner', cornerTxt);
      const dv = eas(me) / MPS_PER_KT - spec.perf.cornerKts;
      ro.setTone('ias', Math.abs(dv) <= 25 ? 'ok' : null);
      ro.set('g', me.g.toFixed(1));
      ro.set('thr', THR_LABEL[run.stick.throttle] + (run.stick.speedbrake ? ' · SB' : ''));
      ro.set('alt', fmtAlt(me.pos.y, units));
      const r = b.alive ? me.pos.distanceTo(b.pos) : null;
      ro.set('rng', r == null ? '-' : units === 'metric' ? `${Math.round(r / 10) * 10} m` : `${Math.round(r / M_PER_FT / 50) * 50} ft`);
      ro.set('pur', b.alive ? `${run.pursuit.kind.toUpperCase()} ${Math.round(run.pursuit.leadDeg)}°` : '-');
      ro.setTone('pur', run.requested && run.pursuit.kind === run.requested ? 'ok' : null);
      ro.set('rds', String(me.gun.rounds));
      ro.set('hits', `${run.metrics.hits} / ${run.metrics.hitsTaken}`);
      if (run.acm && irName) {
        const left = me.stores[run.acm.jet.ir.missile] ?? 0, t = run.acm.seeker.tone;
        ro.set('ir', `${left}${weapon === 'ir' ? ' · SEL' : ''}${t === 'lock' ? ' · TONE' : t === 'growl' ? ' · GROWL' : ''}`);
        ro.setTone('ir', t === 'lock' ? 'ok' : null);
      } else ro.set('ir', '-');
      const [t, why, tone] = coachNow();
      coach.set(t, why, tone);
      coach.setTitle(LESSONS[lesson].title.toUpperCase());
    }

    // ------------------------------------------------------------------ frame
    function drawSight(): void {
      const me = run.me, b = run.bandit.alive ? run.bandit : null;
      const acm = run.acm;
      const acmLocked = !!acm && !!b && acm.lockedId === b.id;
      locked = acmLocked || (lockMode === 'auto' && lesson !== 'ir' && !acm?.mode ? autoLock(me, b, locked) : false);
      const pic = me.alive ? buildGunSight(me, b, { locked, pick, prevShoot: shoot }) : null;
      shoot = pic?.shoot ?? false;
      const acmPic = acm && me.alive && (acm.mode || weapon === 'ir') ? buildAcmPicture(run.world, me, acm) : null;
      tone.setTone(toneOn && weapon === 'ir' && run.phase === 'run' && !paused && acm ? acm.seeker.tone : 'none');
      hud.draw(pic, acmPic);
      if (pic) {
        const st2 = sightStyleFor(ac, locked, pick);
        hudBezel.setStatus(`${pic.style.name}${st2 && !st2.verified ? ' · not verified' : ''}`);
      }
      if (cam === 'cockpit' && stage) { over.setFov(stage.camera.fov); over.draw(pic, acmPic); }
    }

    function frame(dt: number): void {
      if (dead) return;
      if (run.phase !== 'setup' && !paused && dt > 0) run.tick(dt);
      drawSight();
      uiClock += dt;
      if (uiClock >= 0.1 || dt === 0) { uiClock = 0; refreshLive(); if (run.phase === 'end') refreshStatic(); }
    }
    if (!stage) {
      let raf = 0, t0 = performance.now();
      const loop = (now: number) => { frame(Math.min(0.1, (now - t0) / 1000)); t0 = now; raf = requestAnimationFrame(loop); };
      raf = requestAnimationFrame(loop);
      bag.add(() => cancelAnimationFrame(raf));
    }

    // ------------------------------------------------------------------ keys
    const flying = () => run.phase !== 'end' && !paused && run.me.alive;
    const axis = (k: 'roll' | 'pitch', v: -1 | 1) => ({
      down: () => { if (!flying()) return; takeControl(); run.stick[k] = v; },
      up: () => { if (run.stick[k] === v) run.stick[k] = 0; },
    });
    bag.add(bindKeys({
      'ArrowLeft': axis('roll', -1),
      'ArrowRight': axis('roll', 1),
      'ArrowDown': axis('pitch', 1),
      'ArrowUp': axis('pitch', -1),
      'Space': {
        down: () => { if (!flying()) return; startAudio(); if (weapon === 'ir') { fireMissile(); return; } takeControl(); run.stick.trigger = true; },
        up: () => { run.stick.trigger = false; },
      },
      'M': () => { startAudio(); cycleMode(); },
      'Backspace': () => { if (run.acm) acmUnlock(run.world, run.me, run.acm); },
      'C': () => { startAudio(); if (run.acm) toggleUncage(run.acm); },
      'W': () => { startAudio(); setWeapon(weapon === 'ir' ? 'gun' : 'ir'); },
      '1': () => { if (flying()) setThrottle('idle'); },
      '2': () => { if (flying()) setThrottle('mil'); },
      '3': () => { if (flying()) setThrottle('ab'); },
      'B': () => { if (flying()) { run.stick.speedbrake = !run.stick.speedbrake; sbToggle.set(run.stick.speedbrake); takeControl(); } },
      'Enter': () => { startAudio(); if (run.phase === 'setup') start(); else pressLock(); },
      'P': () => togglePause(),
      'R': { down: () => retry(), inModal: true },
      'N': { down: () => { const n = LESSON_ORDER[LESSON_ORDER.indexOf(lesson) + 1]; if (run.phase === 'end' && n) chooseLesson(n); }, inModal: true },
      'F1': () => setCam('cockpit'),
      'F2': () => setCam('chase'),
      'F3': () => setCam('bandit'),
      'F10': () => setCam('top'),
    }));
    bag.on(lab.el, 'pointerdown', () => startAudio());
    bag.on(window, 'blur', () => { if (run) { run.stick.roll = 0; run.stick.pitch = 0; run.stick.trigger = false; } });
    bag.add(() => closeResult());

    // ------------------------------------------------------------------ go
    build();
    if (shot && (SHOTS as readonly string[]).includes(shot)) preroll(shot);

    /** Screenshot helper: fly the lesson with the demo autopilot to an interesting state. */
    function preroll(s: Shot): void {
      const aiLesson = lesson === 'merge' || lesson === 'circles' || lesson === 'yoyo' || lesson === 'fight';
      const ap: Autopilot = lesson === 'ir' && (s === 'ir' || s === 'debrief') ? 'ir' : s === 'corner' ? 'corner' : s === 'pursuit' ? 'lead' : s === 'defence' ? 'defend'
        : s === 'tracking' ? 'track' : aiLesson ? 'ai' : 'track';
      const secs = s === 'corner' ? 10 : s === 'pursuit' ? 8 : s === 'tracking' ? 12 : s === 'defence' ? 5
        : s === 'ir' ? (acmParam ? 3 : 9) : s === 'merge' ? 12 : s === 'circles' ? 34 : s === 'yoyo' ? 3 : s === 'fight' ? 30 : 60;
      start();
      run.autopilot = ap;
      run.apHoldFire = s === 'ir' && !!acmParam;
      if (s === 'defence') run.autopilot = null;           // take the first pass straight, then break (below)
      const dt = 1 / 30;
      let sync = 0;
      for (let i = 0; i < secs * 30 && run.phase === 'run'; i++) {
        if (s === 'defence' && run.world.t > 3) run.autopilot = 'defend';
        if (s === 'tracking' && run.metrics.solutionS > 0.25) break;     // sight on him, before the kill
        run.tick(dt);
        sync += dt;
        if (sync >= 0.25 && view) { sync = 0; view.syncNow(); }
      }
      if (s === 'debrief') { if (run.phase === 'run') run.end(); run.tick(2); }
      view?.syncNow();
      drawSight();
      refreshLive();
      refreshStatic();
    }
  }

  return {
    mount(ctx) {
      dead = false;
      try { mount(ctx); } catch (e) { console.error(e); ctx.root.append(h('p', { class: 'page-error' }, 'The merge page failed to start: ' + String(e))); }
    },
    unmount() { dead = true; bag.dispose(); },
  };
};
export default factory;
