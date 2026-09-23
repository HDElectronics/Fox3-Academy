/**
 * [OWNER: page-strike] Shkval & Vikhr (#/strike, attack jets only: the Su-25T). The pilot works the Shkval TV
 * sight on the IT-23M (slew, ground-stabilise, zoom, target size, lock КС → АС), the laser (ЛД), and fires Vikhrs
 * holding lock and laser to impact, then flies a rocket / gun CCIP pass. Keys from PROCEDURES.su25t (S1).
 * Lessons: shkval, laser, vikhr (scored drill), ccip (scored pass). Progress: strike:<lesson>:su25t.
 *
 * URL params: ?lesson=shkval|laser|vikhr|ccip, ?shot=shkval|locked|vikhr-flight|impact|debrief (pre-roll for
 * screenshots), ?cam=chase|target|tv, ?touch=1 (show the touch pad on a fine pointer).
 */
import './style.css';
import type { Page, PageContext, PageFactory } from '../../app/page';
import { AG_WEAPONS, AG_CAVEATS } from '../../data/agWeapons';
import { PROCEDURES } from '../../data/procedures';
import type { AgWeaponId } from '../../data/types';
import type { Aircraft, AgMissReason, EntityId } from '../../sim/types';
import { D2R, R2D, dirFrom } from '../../sim/math';
import { LASER_LIMIT_S, shkvalAimPoint, shkvalDir, shkvalFovDeg } from '../../sim/shkval';
import { predictImpact } from '../../sim/agWeapons';
import { Stage, WorldView, CameraRig, isWebGLAvailable, FramePriority } from '../../render';
import { AttackScene, ShkvalTv } from '../../render/attack';
import {
  h, cleanup, labLayout, consolePanel, screenBezel, segmented, button, coachBox, checklist, eventLog, readouts,
  callout, placard, bindKeys, keyHint, disclosure, modal, mobileAction, type ModalHandle, type Tone,
} from '../../ui';
import { It23mDisplay, Su25tHud, su25tHudAngles as hudAngles, hudModeLabel, type It23mState, type Su25tHudState } from '../../ui/displays';
import {
  LESSONS, LESSON_ORDER, MISS_TEXT, progressKey, scoreCcip, scoreVikhr,
  type Debrief, type LessonId, type ShotRecord, type StrikeSnap,
} from './lessons';
import { BUNKER_AT, TANKS_AT, TRUCKS_AT, buildScenario, centreOf, type Scenario } from './scenario';

const SHOTS = ['shkval', 'locked', 'vikhr-flight', 'impact', 'debrief'] as const;
type Shot = typeof SHOTS[number];
type Cam = 'chase' | 'target' | 'tv';
const SHOT_LESSON: Record<Shot, LessonId> = { shkval: 'shkval', locked: 'laser', 'vikhr-flight': 'vikhr', impact: 'vikhr', debrief: 'vikhr' };
/** Trainer estimate of the Vikhr's mean speed for the pre-launch time of flight (not DCS data). */
const VIKHR_MEAN_MS = 480;
const STATION_LABEL: Record<string, string> = { r60: '60', r73: '73', l081: 'L-081' };

const factory: PageFactory = (): Page => {
  const bag = cleanup();

  function mount(ctx: PageContext): void {
    const params = ctx.params;
    const shotParam = SHOTS.find(s => s === params.get('shot')) ?? null;
    const lessonParam = params.get('lesson') as LessonId | null;
    let lesson: LessonId = shotParam ? SHOT_LESSON[shotParam] : lessonParam && LESSONS[lessonParam] ? lessonParam : 'shkval';
    let cam: Cam = (['chase', 'target', 'tv'] as const).find(c => c === params.get('cam')) ?? 'chase';
    const binds = PROCEDURES.su25t.binds;

    // ------------------------------------------------------------------ state
    let sc!: Scenario;
    let me!: Aircraft;
    let evCursor = 0;
    const slew = { up: 0, down: 0, left: 0, right: 0 };
    let bunkerSizeFail = false, laserRunS = 0, lasedLongEnough = false, laserS = 0;
    let shots = new Map<EntityId, ShotRecord>();
    let salvos = 0, bestMissM: number | null = null;
    let done = new Set<string>();
    let ended = false, endAt: number | null = null, dived = false, pulled = false;
    let result: ModalHandle | null = null;
    let uiClock = 0;

    // ------------------------------------------------------------------ DOM
    const viewport = h('div', { class: 'strk-viewport' });
    const tvCanvas = h('canvas', { class: 'strk-canvas', 'aria-label': 'Shkval TV picture on the IT-23M. Tap to point the sight.' });
    const hudCanvas = h('canvas', { class: 'strk-canvas', 'aria-label': 'Su-25T HUD' });
    const tvBezel = screenBezel({ id: 'strk-tv', label: 'ИТ-23М', aspect: '4 / 3', content: tvCanvas, class: 'strk-tv' });
    const hudBezel = screenBezel({ id: 'strk-hud', label: 'ИЛС', aspect: '1', content: hudCanvas, class: 'strk-hud' });
    const tv = new It23mDisplay(tvCanvas);
    const hud = new Su25tHud(hudCanvas);
    bag.add(() => { tv.dispose(); hud.dispose(); });

    const ro = readouts({
      id: 'strk-ro', variant: 'glass',
      rows: [
        { id: 'rng', label: 'Slant range' }, { id: 'laser', label: 'Laser used', title: 'Laser heat, s. S1: the laser switches off at its limit and cools about as long as it was on (simplified)' },
        { id: 'store', label: 'Store' }, { id: 'tgt', label: 'Targets' },
      ],
    });

    // Touch pad (coarse pointers, or ?touch=1).
    const hold = (label: string, aria: string, set: (v: number) => void) => {
      const b = h('button', { type: 'button', class: 'ui-btn strk-pad__btn', 'aria-label': aria }, label);
      const on = () => { set(1); applySlew(); }, off = () => { set(0); applySlew(); };
      bag.on(b, 'pointerdown', (e: Event) => { e.preventDefault(); on(); });
      for (const t of ['pointerup', 'pointerleave', 'pointercancel']) bag.on(b, t, off);
      return b;
    };
    const cap = (label: string, aria: string, fn: () => void) => button({ label, size: 's', ariaLabel: aria, onClick: fn, keepCase: true }).el;
    const fireBtn = button({ label: 'Fire', variant: 'primary', lamp: true, keys: 'Space', onClick: () => fire() });
    const lockBtn = button({ label: 'Lock / unlock', keys: 'Enter', onClick: () => enter() });
    const laserBtn = button({ label: 'Laser ЛД', keys: 'RShift+O', lamp: true, onClick: () => toggleLaser(), keepCase: true });
    const touchPad = h('div', { class: 'ui-strip-block strk-touch' }, placard('Shkval'),
      h('div', { class: 'strk-pad' },
        h('span'), hold('▲', 'Slew up', v => { slew.up = v; }), h('span'),
        hold('◀', 'Slew left', v => { slew.left = v; }), cap('⏎', 'Stabilise or lock', () => enter()), hold('▶', 'Slew right', v => { slew.right = v; }),
        h('span'), hold('▼', 'Slew down', v => { slew.down = v; }), h('span')),
      h('div', { class: 'strk-pad__row' }, cap('Zoom −', 'Zoom out', () => world().shkvalZoom(me.id, -1)), cap('Zoom +', 'Zoom in', () => world().shkvalZoom(me.id, 1))),
      h('div', { class: 'strk-pad__row' }, cap('Size −', 'Target size smaller', () => world().shkvalTargetSize(me.id, { step: -1 })), cap('Size +', 'Target size larger', () => world().shkvalTargetSize(me.id, { step: 1 }))),
    );

    const lessonSeg = segmented<LessonId>({
      id: 'strk-lesson', label: 'Lesson', fill: true, value: lesson,
      options: LESSON_ORDER.map(id => ({ value: id, label: LESSONS[id].short, title: LESSONS[id].title })),
      onChange: id => { lesson = id; restart(); },
    });
    const coach = coachBox({ id: 'strk-coach' });
    let steps = checklist({ steps: LESSONS[lesson].steps.map(s => ({ id: s.id, text: s.text, keys: s.keys })) });
    const stepsHost = h('div', null, steps.el);
    const log = eventLog({ id: 'strk-log', max: 30, title: 'Events' });
    const restartBtn = button({ label: 'Restart', size: 's', onClick: () => restart() });
    const endBtn = button({ label: 'End and debrief', size: 's', onClick: () => finish() });

    const ctlRow = (...els: HTMLElement[]) => h('div', { class: 'strk-row' }, ...els);
    const controls = consolePanel({
      title: 'Controls', id: 'strk-controls', children: [
        ctlRow(cap('7 ОПТ-ЗЕМЛЯ', 'Air-to-ground mode', () => setMaster('ag')), cap('O Shkval', 'Shkval on or off', () => toggleShkval())),
        ctlRow(cap('D Weapon', 'Next weapon', () => cycle()), cap('C Cannon', 'Select the cannon', () => selectGun())),
        ctlRow(lockBtn.el, laserBtn.el),
        fireBtn.el,
      ],
    });
    const keyList = disclosure({
      title: 'Su-25T keys', id: 'strk-keys',
      content: h('div', { class: 'strk-keys' },
        binds.filter(b => b.group !== 'defence').map(b => keyHint({ label: b.action, keys: b.keys, note: b.note })),
        keyHint({ label: 'Trainer steering (not a DCS key)', keys: 'Left / Right, Up / Down' })),
    });
    const caveats = disclosure({
      title: 'Simplified and not verified', id: 'strk-caveats',
      content: h('div', null,
        callout({ kind: 'simplified', body: 'The jet flies itself: you steer with trainer keys. Vikhr, rockets and the gun use an arcade model tuned to teach the procedure.' }),
        h('ul', { class: 'strk-caveats' }, AG_CAVEATS.map(c => h('li', null, c)))),
    });

    const camSeg = segmented<Cam>({
      id: 'strk-cam', ariaLabel: 'Camera', size: 's', value: cam,
      options: [{ value: 'chase', label: 'Chase' }, { value: 'target', label: 'Target' }, { value: 'tv', label: 'TV' }],
      onChange: c => setCam(c),
    });

    const mFire = mobileAction(fireBtn.el), mLock = mobileAction(lockBtn.el, 'Lock'), mLaser = mobileAction(laserBtn.el, 'ЛД');
    bag.add(() => { mFire.destroy(); mLock.destroy(); mLaser.destroy(); });

    const lab = labLayout({
      id: 'strk-lab', class: 'strk-lab',
      header: { title: 'Shkval & Vikhr', lede: 'Find, lock and lase with the Shkval. Fire Vikhrs and hold the laser to impact.', meta: 'Su-25T · IT-23M · 9А4172 Vikhr' },
      viewport,
      strip: [tvBezel.el, hudBezel.el, touchPad, h('div', { class: 'ui-strip-block strk-ro' }, placard('Attack'), ro.el)],
      console: [
        consolePanel({ title: 'Lesson', id: 'strk-lesson-panel', children: [lessonSeg.el, coach.el, stepsHost, h('div', { class: 'strk-row' }, restartBtn.el, endBtn.el), log.el] }).el,
        controls.el, keyList, caveats,
      ],
      mobileActions: [mFire.el, mLock.el, mLaser.el],
    });
    if (params.get('touch') === '1') lab.el.classList.add('strk--touch');
    lab.overlay('tl', camSeg.el);
    ctx.root.append(lab.el);

    // ------------------------------------------------------------------ 3D
    if (!isWebGLAvailable()) {
      viewport.append(h('p', { class: 'strk-no3d' }, 'WebGL is not available: the 3D view and the Shkval TV picture are off. The lesson still runs.'));
    }
    const stage = isWebGLAvailable() ? new Stage(viewport, { autoPause: 'render', maxDpr: 1.5, environment: { surface: 'land', grid: false, hazeKm: 60 }, ariaLabel: 'Attack run in 3D' }) : null;
    bag.add(() => stage?.dispose());
    let view: WorldView | null = null, scene: AttackScene | null = null, rig: CameraRig | null = null, tvCam: ShkvalTv | null = null;

    sc = buildScenario(lesson);
    me = sc.me;
    const world = () => sc.world;
    if (stage) {
      view = new WorldView(stage, sc.world, { units: 'metric', layers: { dropLines: false, shadows: false } });
      scene = new AttackScene(stage, sc.world, view, { field: sc.field, shooterId: me.id });
      tvCam = new ShkvalTv(stage, { hidden: () => scene!.tvHidden() });
      bag.add(() => tvCam?.dispose());
      rig = new CameraRig(stage, { source: view, mode: 'chase' });
      stage.onFrame(dt => { if (dt > 0) tick(Math.min(dt, 0.1)); });
      stage.onFrame(() => renderTv(), { priority: FramePriority.env + 50 });
    } else {
      let last = performance.now(), raf = 0;
      const loop = (now: number) => { tick(Math.min(0.1, (now - last) / 1000)); last = now; renderTv(); raf = requestAnimationFrame(loop); };
      raf = requestAnimationFrame(loop);
      bag.add(() => cancelAnimationFrame(raf));
    }
    bag.on(tvCanvas, 'click', (e: Event) => tapTv(e as MouseEvent));

    // ------------------------------------------------------------------ keys
    bag.add(bindKeys({
      '7': () => setMaster('ag'),
      '1': () => setMaster('nav'),
      '8': () => setMaster(me.ag!.master === 'fixed' ? 'ag' : 'fixed'),
      'D': () => cycle(),
      'C': () => selectGun(),
      'O': () => toggleShkval(),
      'RShift+O': () => toggleLaser(),
      ';': { down: () => { slew.up = 1; applySlew(); }, up: () => { slew.up = 0; applySlew(); } },
      '.': { down: () => { slew.down = 1; applySlew(); }, up: () => { slew.down = 0; applySlew(); } },
      ',': { down: () => { slew.left = 1; applySlew(); }, up: () => { slew.left = 0; applySlew(); } },
      '/': { down: () => { slew.right = 1; applySlew(); }, up: () => { slew.right = 0; applySlew(); } },
      'Enter': () => enter(),
      '=': () => world().shkvalZoom(me.id, 1),
      '-': () => world().shkvalZoom(me.id, -1),
      'RCtrl+]': () => world().shkvalTargetSize(me.id, { step: 1 }),
      'RCtrl+[': () => world().shkvalTargetSize(me.id, { step: -1 }),
      'Space': { down: () => fire(), inModal: false },
      'Left': { down: () => steer(-2), repeat: true },
      'Right': { down: () => steer(2), repeat: true },
      'Up': { down: () => climb(60), repeat: true },
      'Down': { down: () => climb(-60), repeat: true },
    }));

    // ------------------------------------------------------------------ actions
    function applySlew(): void { world().shkvalSlew(me.id, slew.right - slew.left, slew.up - slew.down); }
    function setMaster(m: 'nav' | 'ag' | 'fixed'): void {
      world().setAgMaster(me.id, m);
      log.push(m === 'ag' ? 'Air-to-ground mode: ОПТ-ЗЕМЛЯ' : m === 'fixed' ? 'Fixed reticle' : 'Navigation mode', { t: world().t });
    }
    function toggleShkval(): void { world().shkvalPower(me.id, !me.ag!.shkval.on); log.push(me.ag!.shkval.on ? 'Shkval on' : 'Shkval off', { t: world().t }); }
    function toggleLaser(): void {
      const on = !me.ag!.shkval.laserOn;
      const r = world().laser(me.id, on);
      if (!r.ok) log.push(r.reason, { t: world().t, tone: 'caution' });
    }
    function cycle(): void { const w = world().cycleAgWeapon(me.id); log.push(w ? `Store: ${AG_WEAPONS[w].hudLabel}` : 'No store left', { t: world().t }); }
    function selectGun(): void { world().selectAgWeapon(me.id, 'gun25t'); log.push('Cannon: ВПУ', { t: world().t }); }
    function steer(deg: number): void { me.cmd.heading = me.cmd.heading + deg * D2R; }
    function climb(m: number): void { me.cmd.altitude = Math.max(sc.groundM + 150, me.cmd.altitude + m); }
    function enter(): void {
      const w = world(), sh = me.ag!.shkval;
      if (!sh.on) { log.push('Shkval is off [O]', { t: w.t, tone: 'caution' }); return; }
      if (sh.lockedUnitId) { w.shkvalUnlock(me.id); log.push('КС: unlocked', { t: w.t }); return; }
      if (!sh.groundStab) {
        const r = w.shkvalStabilise(me.id, true);
        if (!r.ok) { log.push(r.reason, { t: w.t, tone: 'caution' }); return; }
      }
      const r = w.shkvalLock(me.id);
      if (!r.ok) {
        log.push(r.reason, { t: w.t, tone: 'caution' });
        const aim = shkvalAimPoint(w, me);
        if (/size/i.test(r.reason) && aim && Math.hypot(aim.x - BUNKER_AT.x, aim.z - BUNKER_AT.z) < 90) bunkerSizeFail = true;
      }
    }
    function fire(): void {
      if (ended) return;
      const w = world();
      const out = w.agLaunch(me.id);
      if (!Array.isArray(out)) { log.push(out.reason || 'No release', { t: w.t, tone: 'caution' }); return; }
      salvos++;
    }
    function tapTv(e: MouseEvent): void {
      const sh = me.ag!.shkval;
      if (!sh.on) return;
      if (sh.lockedUnitId) { log.push('Unlock first (Enter)', { t: world().t }); return; }
      const { fx, fy } = tv.pickOffset(e.clientX, e.clientY);
      const fov = shkvalFovDeg(sh.zoom);
      const d = dirFrom(me.heading + sh.az + fx * fov.h * D2R, sh.el - fy * fov.v * D2R);
      world().shkvalPointAt(me.id, { x: me.pos.x + d.x * 10000, y: me.pos.y + d.y * 10000, z: me.pos.z + d.z * 10000 });
    }

    function setCam(c: Cam): void {
      cam = c;
      lab.el.classList.toggle('strk--tvbig', c === 'tv');
      if (c === 'tv') lab.view.append(tvBezel.el);
      else if (tvBezel.el.parentElement !== lab.strip) lab.strip.prepend(tvBezel.el);
      if (!rig) return;
      if (c === 'target') {
        const p = centreOf(world(), sc.tanks) ?? { x: TANKS_AT.x, y: sc.groundM, z: TANKS_AT.z };
        rig.setMode('orbit', { focus: { x: p.x, y: p.y, z: p.z }, distance: 900, instant: true });
        rig.setView({ headingDeg: 340, elevationDeg: 24 }, true);
      } else {
        // Left-rear quarter, looking past the jet toward the target: the laser line and the missile smoke stay in frame.
        rig.setMode('orbit', { focus: me.id, distance: 420, instant: true });
        rig.setView({ headingDeg: me.heading * R2D + 24, elevationDeg: 8 }, true);
      }
    }

    // ------------------------------------------------------------------ lesson lifecycle
    function restart(): void {
      result?.destroy(); result = null;
      sc = buildScenario(lesson);
      me = sc.me;
      view?.setWorld(sc.world);
      scene?.setWorld(sc.world);
      scene?.setShooter(me.id);
      evCursor = 0;
      bunkerSizeFail = false; laserRunS = 0; lasedLongEnough = false; laserS = 0;
      shots = new Map(); salvos = 0; bestMissM = null; done = new Set(); ended = false; endAt = null; dived = false; pulled = false;
      slew.up = slew.down = slew.left = slew.right = 0;
      const def = LESSONS[lesson];
      const fresh = checklist({ steps: def.steps.map(s => ({ id: s.id, text: s.text, keys: s.keys })) });
      stepsHost.replaceChildren(fresh.el);
      steps = fresh;
      lessonSeg.set(lesson, false);
      endBtn.el.hidden = !def.scored;
      log.clear();
      log.push(def.goal, { t: 0 });
      // Lesson setups: the laser lesson starts with the sight on the platoon.
      const w = sc.world;
      if (lesson === 'laser') {
        w.setAgMaster(me.id, 'ag'); w.selectAgWeapon(me.id, 'vikhr'); w.shkvalPower(me.id, true);
        w.shkvalPointAt(me.id, { x: TANKS_AT.x, y: sc.groundM, z: TANKS_AT.z }); w.shkvalStabilise(me.id, true); w.shkvalZoom(me.id, 1);
      }
      if (lesson === 'ccip') {
        const c = centreOf(w, sc.trucks) ?? { x: TRUCKS_AT.x, y: sc.groundM, z: TRUCKS_AT.z };
        me.heading = me.cmd.heading = Math.atan2(c.x - me.pos.x, -(c.z - me.pos.z));
      }
      setCam(cam);
      updateUi(true);
    }

    function snap(): StrikeSnap {
      const w = world(), ag = me.ag!, sh = ag.shkval;
      const aim = shkvalAimPoint(w, me);
      const tc = centreOf(w, sc.tanks) ?? { x: TANKS_AT.x, z: TANKS_AT.z };
      const locked = sh.lockedUnitId ? w.groundUnits.get(sh.lockedUnitId)?.kind ?? null : null;
      let hits = 0;
      for (const s of shots.values()) if (s.result === 'hit') hits++;
      return {
        master: ag.master, selected: ag.selected, shkvalOn: sh.on, groundStab: sh.groundStab, zoom: sh.zoom, targetSizeM: sh.targetSizeM,
        locked, aimToTanksM: aim ? Math.hypot(aim.x - tc.x, aim.z - tc.z) : null,
        aimToBunkerM: aim ? Math.hypot(aim.x - BUNKER_AT.x, aim.z - BUNKER_AT.z) : null,
        bunkerSizeFail, laserOn: sh.laserOn, laserRunS, lasedLongEnough, shots: shots.size + (lesson === 'ccip' ? salvos : 0), hits,
      };
    }

    function tick(dt: number): void {
      const w = world();
      if (!ended || endAt != null) w.step(dt);
      const sh = me.ag!.shkval;
      if (sh.laserOn) { laserRunS += dt; laserS += dt; if (laserRunS >= 5) lasedLongEnough = true; } else laserRunS = 0;
      readEvents();
      flyLesson();
      checkSteps();
      if (endAt != null && w.t >= endAt && ![...w.agWeapons.values()].some(x => x.alive)) { endAt = null; finish(); }
      uiClock += dt;
      if (uiClock > 0.1) { uiClock = 0; updateUi(false); }
    }

    function flyLesson(): void {
      const w = world();
      const tgt = lesson === 'ccip' ? centreOf(w, sc.trucks) ?? { x: TRUCKS_AT.x, y: sc.groundM, z: TRUCKS_AT.z } : { x: TANKS_AT.x, y: sc.groundM, z: TANKS_AT.z };
      const range = Math.hypot(me.pos.x - tgt.x, me.pos.z - tgt.z);
      if (lesson === 'shkval' || lesson === 'laser') {
        // Keep the lesson on a straight leg: back to 12 km once inside 5 km.
        if (range < 5000) { me.pos.z += 7000; log.push('Repositioned to 12 km for another leg', { t: w.t }); }
        return;
      }
      if (ended) return;
      if (lesson === 'vikhr') {
        const tanksLeft = sc.tanks.filter(id => w.groundUnits.get(id)?.alive).length;
        if (endAt == null && (tanksLeft === 0 || range < 1500 || w.t > 160)) {
          endAt = w.t + 1;
          if (range < 1500) { me.cmd.heading = me.heading + 70 * D2R; log.push('Inside 1.5 km: breaking off', { t: w.t }); }
        }
        return;
      }
      // CCIP pass: roll in at 5 km, pull out at 900 m or 300 m above the ground.
      const agl = me.pos.y - w.groundHeight(me.pos.x, me.pos.z);
      if (!dived && range < 5000) { dived = true; me.cmd.altitude = sc.groundM + 150; log.push('Rolling in: pipper to the trucks', { t: w.t }); }
      if (dived && !pulled && (range < 900 || agl < 300)) {
        pulled = true; me.cmd.altitude = sc.groundM + 1000; me.cmd.heading = me.heading + 60 * D2R;
        log.push('Pull out', { t: w.t }); endAt = w.t + 4;
      }
    }

    function readEvents(): void {
      const w = world(), ev = w.events;
      if (evCursor > ev.length) evCursor = 0;
      for (; evCursor < ev.length; evCursor++) {
        const e = ev[evCursor]!;
        switch (e.type) {
          case 'shkval-lock': { const u = w.groundUnits.get(e.unitId); log.push(`АС: ${u?.name ?? 'target'} locked at ${(e.range / 1000).toFixed(1)} km`, { t: e.t, tone: 'ok' }); break; }
          case 'shkval-lost': if (e.ownerId === me.id && e.why !== 'unlocked' && e.why !== 'off') log.push(`Lock lost: ${e.why === 'gimbal' ? 'outside the gimbal' : e.why === 'terrain' ? 'terrain' : 'target destroyed'}`, { t: e.t, tone: e.why === 'target-dead' ? undefined : 'caution' }); break;
          case 'laser': if (e.ownerId === me.id) log.push(e.on ? 'ЛД: laser on' : e.why === 'limit' ? 'Laser at its limit: off, cooling' : 'Laser off', { t: e.t, tone: e.why === 'limit' ? 'warning' : undefined }); break;
          case 'ag-launch':
            if (e.shooterId !== me.id) break;
            shots.set(e.weaponId, { weapon: e.weapon, rangeM: e.range, result: 'flying', killed: false });
            log.push(`${AG_WEAPONS[e.weapon].hudLabel} away${e.range ? ` at ${(e.range / 1000).toFixed(1)} km` : ''}`, { t: e.t });
            break;
          case 'ag-miss': {
            const s = shots.get(e.weaponId);
            // A guided miss also reports its ground impact first: the miss reason wins.
            if (s && (s.result === 'flying' || s.reason === 'ground')) { s.result = 'miss'; s.reason = e.reason; }
            if (s && AG_WEAPONS[e.weapon].guidance !== 'ballistic') log.push(`Miss: ${MISS_TEXT[e.reason as AgMissReason]}`, { t: e.t, tone: 'warning' });
            break;
          }
          case 'ag-impact': {
            const s = shots.get(e.weaponId);
            const hit = e.killed.length > 0 || e.targetId != null;
            if (s && s.result === 'flying') { s.result = hit ? 'hit' : 'miss'; s.reason = hit ? 'hit' : 'ground'; s.killed = e.killed.length > 0; }
            if (lesson === 'ccip') {
              for (const id of sc.trucks) {
                const u = w.groundUnits.get(id); if (!u) continue;
                const d = Math.hypot(u.pos.x - e.pos[0], u.pos.z - e.pos[2]);
                if (bestMissM == null || d < bestMissM) bestMissM = d;
              }
            }
            break;
          }
          case 'ground-kill': { const u = w.groundUnits.get(e.targetId); log.push(`${u?.name ?? 'Target'} destroyed`, { t: e.t, tone: 'ok' }); break; }
          default: break;
        }
      }
    }

    function checkSteps(): void {
      const def = LESSONS[lesson];
      const s = snap();
      let changed = false;
      for (const st of def.steps) {
        if (done.has(st.id)) continue;
        if (st.check(s)) { done.add(st.id); steps.setDone(st.id); changed = true; continue; }
        break;
      }
      if (changed && !def.scored && done.size === def.steps.length && !ended) {
        ended = true;
        ctx.app.setProgress(progressKey(lesson), true);
        showDebrief({ stars: 3, title: `${def.title}: complete`, lines: def.steps.map(x => x.text.split(':')[0]!), coaching: [], passed: true });
      }
    }

    function finish(): void {
      if (result) return;
      ended = true;
      const w = world();
      const def = LESSONS[lesson];
      if (!def.scored) return;
      for (const s of shots.values()) if (s.result === 'flying') { s.result = 'miss'; s.reason = 'timeout'; }
      const d: Debrief = lesson === 'vikhr'
        ? scoreVikhr({ shots: [...shots.values()].filter(s => s.weapon === 'vikhr'), tanks: sc.tanks.length, tanksKilled: sc.tanks.filter(id => !w.groundUnits.get(id)?.alive).length, laserS })
        : scoreCcip({ salvos, kills: sc.trucks.filter(id => !w.groundUnits.get(id)?.alive).length, bestMissM });
      if (d.passed) ctx.app.setProgress(progressKey(lesson), true);
      showDebrief(d);
    }

    function showDebrief(d: Debrief): void {
      result?.destroy();
      const stars = '★'.repeat(d.stars) + '☆'.repeat(3 - d.stars);
      const next = LESSON_ORDER[LESSON_ORDER.indexOf(lesson) + 1];
      result = modal({
        id: 'strk-debrief', title: d.title, within: lab.view, tone: d.passed ? 'ok' : 'caution', open: true,
        body: h('div', { class: 'strk-debrief' },
          h('p', { class: 'strk-debrief__stars', 'aria-label': `${d.stars} of 3` }, stars),
          h('ul', null, d.lines.map(l => h('li', null, l))),
          d.coaching.length ? h('div', null, placard('Coaching'), h('ul', null, d.coaching.map(l => h('li', null, l)))) : null),
        actions: [
          { label: 'Fly again', onClick: () => restart(), id: 'strk-again' },
          ...(next ? [{ label: `Next: ${LESSONS[next].short}`, primary: true, id: 'strk-next', onClick: () => { lesson = next; restart(); } }] : []),
        ],
      });
      bag.add(() => result?.destroy());
    }

    // ------------------------------------------------------------------ displays
    function tvState(): It23mState {
      const w = world(), ag = me.ag!, sh = ag.shkval;
      const aim = shkvalAimPoint(w, me);
      const check = w.canAgLaunch(me.id);
      const guided = ag.selected ? AG_WEAPONS[ag.selected].guidance !== 'ballistic' : false;
      let tof: number | null = null;
      for (const wp of w.agWeapons.values()) if (wp.alive && wp.guided && wp.shooterId === me.id && wp.timeToImpact != null) tof = tof == null ? wp.timeToImpact : Math.min(tof, wp.timeToImpact);
      if (tof == null && guided && sh.lockedUnitId && aim && ag.selected === 'vikhr') tof = me.pos.distanceTo(aim) / VIKHR_MEAN_MS;
      const fov = shkvalFovDeg(sh.zoom);
      return {
        on: sh.on, mode: sh.mode, zoom: sh.zoom, targetSizeM: sh.targetSizeM,
        azDeg: sh.az * R2D, elDeg: sh.el * R2D, pitchDeg: me.pitch * R2D,
        radarAltM: me.pos.y - w.groundHeight(me.pos.x, me.pos.z),
        laserOn: sh.laserOn, laserCooling: sh.laserCoolS > 0,
        rangeM: sh.laserOn && aim ? me.pos.distanceTo(aim) : null,
        tofS: tof, pr: guided && check.pr, fovHDeg: fov.h, groundStab: sh.groundStab,
      };
    }

    function hudState(): Su25tHudState {
      const w = world(), ag = me.ag!, sh = ag.shkval;
      const sel = ag.selected as AgWeaponId | null;
      const spec = sel ? AG_WEAPONS[sel] : null;
      const check = w.canAgLaunch(me.id);
      const aim = shkvalAimPoint(w, me);
      const ballistic = spec?.guidance === 'ballistic';
      const imp = sel && ballistic && ag.master !== 'nav' ? predictImpact(w, me, sel) : null;
      const band = check.band;
      return {
        master: ag.master, modeLabel: hudModeLabel(ag.master, sh.on),
        weaponLabel: ag.master === 'nav' ? null : spec?.hudLabel ?? null, rounds: sel ? ag.stores[sel] ?? 0 : null,
        pitchDeg: me.pitch * R2D, headingDeg: me.heading * R2D, speedKmh: me.vel.length() * 3.6, altM: me.pos.y,
        range: band && ag.master !== 'nav' ? { cur: check.range, min: band.min, max: band.max } : null,
        pr: check.pr && ag.master !== 'nav',
        laserCursor: sh.on && aim ? hudAngles(me.pos, me.heading, me.pitch, aim) : null,
        ccip: imp ? hudAngles(me.pos, me.heading, me.pitch, imp) : null,
        reticle: spec && !ballistic && sh.on && ag.master === 'ag' ? (check.range != null && band && check.range <= band.max && check.range >= band.min ? 'in' : 'out') : null,
        stations: ag.stations.filter(s => s.weapon !== 'l081').map(s => ({
          station: s.station, label: STATION_LABEL[s.weapon] ?? AG_WEAPONS[s.weapon as AgWeaponId]?.hudLabel ?? s.weapon, count: s.count, selected: s.weapon === sel,
        })),
      };
    }

    function renderTv(): void {
      const sh = me.ag!.shkval;
      if (tvCam && sh.on && me.alive) tvCam.render(me.pos, shkvalDir(me), shkvalFovDeg(sh.zoom).v);
      tv.draw(tvState(), tvCam && sh.on ? tvCam.image : null);
      hud.draw(hudState());
    }

    function updateUi(force: boolean): void {
      const w = world(), ag = me.ag!, sh = ag.shkval;
      const def = LESSONS[lesson];
      const check = w.canAgLaunch(me.id);
      const aim = shkvalAimPoint(w, me);
      ro.set('rng', sh.laserOn && aim ? `${(me.pos.distanceTo(aim) / 1000).toFixed(1)} km` : sh.on ? 'laser off' : '—');
      ro.set('laser', `${Math.round(sh.laserUsedS)} s / ${LASER_LIMIT_S / 60} min${sh.laserCoolS > 0 ? ' cooling' : ''}`);
      ro.setTone('laser', sh.laserCoolS > 0 ? 'warning' : sh.laserOn ? 'caution' : null);
      const sel = ag.selected;
      ro.set('store', sel ? `${AG_WEAPONS[sel].hudLabel} ×${ag.stores[sel] ?? 0}` : 'none');
      const list = lesson === 'ccip' ? sc.trucks : sc.tanks;
      ro.set('tgt', `${list.filter(id => w.groundUnits.get(id)?.alive).length} of ${list.length} ${lesson === 'ccip' ? 'trucks' : 'tanks'}`);
      fireBtn.setLit(check.pr);
      laserBtn.setLit(sh.laserOn);
      const cur = def.steps.find(s => !done.has(s.id));
      steps.setCurrent(cur?.id ?? null);
      let tone: Tone | undefined;
      let text = cur ? cur.text : def.scored ? 'Finish the attack; the debrief follows.' : 'Lesson complete.';
      let why = check.reason && ag.master !== 'nav' && sel ? check.reason : def.goal;
      if (check.pr) { tone = 'ok'; why = 'ПР: launch authorised.'; }
      const flying = [...w.agWeapons.values()].some(x => x.alive && x.guided && x.shooterId === me.id && x.type === 'vikhr');
      if (flying) { text = 'Vikhr in flight: hold the lock and the laser until impact.'; tone = 'caution'; why = 'Beam-riding: the missile follows the Shkval line of sight to the end.'; }
      if (force || text) coach.set(text, why, tone);
    }

    // ------------------------------------------------------------------ start, pre-rolls
    restart();
    if (shotParam) preroll(shotParam);
    if (params.get('cam') === 'target' || params.get('cam') === 'tv') setCam(cam);

    function preroll(s: Shot): void {
      const w = world(), id = me.id;
      const tank = w.groundUnits.get(sc.tanks[1]!)!;
      const run = (sec: number) => { for (let t = 0; t < sec; t += 1 / 30) tick(1 / 30); };
      if (s === 'shkval') {
        setMaster('ag'); w.shkvalPower(id, true);
        w.shkvalPointAt(id, tank.pos); w.shkvalStabilise(id, true); w.shkvalZoom(id, 1);
        run(2);
      } else if (s === 'locked') {
        w.shkvalPointAt(id, tank.pos); w.shkvalZoom(id, 1); w.shkvalLock(id); w.laser(id, true);
        run(3);
      } else {
        setMaster('ag'); w.selectAgWeapon(id, 'vikhr'); w.shkvalPower(id, true);
        const shootAt = (u: typeof tank) => {
          w.shkvalPointAt(id, u.pos); w.shkvalStabilise(id, true); w.shkvalLock(id); w.laser(id, true);
          for (let i = 0; i < 1800 && !w.canAgLaunch(id).pr; i++) tick(1 / 30);
          fire();
        };
        w.shkvalZoom(id, 1); w.shkvalZoom(id, 1);
        shootAt(tank);
        const wp = [...w.agWeapons.values()].find(x => x.alive);
        if (s === 'vikhr-flight') { run(6); }
        else if (s === 'impact') { for (let i = 0; i < 1800 && wp?.alive; i++) tick(1 / 30); run(0.4); }
        else {
          for (const tid of sc.tanks) {
            const u = w.groundUnits.get(tid)!;
            if (!u.alive) continue;
            for (let i = 0; i < 1800 && [...w.agWeapons.values()].some(x => x.alive); i++) tick(1 / 30);
            if (me.ag!.shkval.lockedUnitId) w.shkvalUnlock(id);
            shootAt(u);
          }
          for (let i = 0; i < 1800 && [...w.agWeapons.values()].some(x => x.alive); i++) tick(1 / 30);
          finish();
        }
      }
      view?.syncNow();
      updateUi(true);
    }
  }

  return {
    mount,
    unmount() { bag.dispose(); },
  };
};

export default factory;
