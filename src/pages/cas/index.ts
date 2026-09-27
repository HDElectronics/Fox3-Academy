/**
 * [OWNER: page-cas] CAS & JTAC (#/cas, attack jets only: the Su-25T). The pilot works the built-in DCS JTAC through
 * the radio menu (\ → F4 JTACs → the JTAC): check-in, the 9-line on the kneeboard card, remarks, readback, IP
 * inbound, white smoke inside 10 nm, contact the mark, talk-on, In, cleared hot or abort, Off, BDA. The Su-25T cockpit
 * (Shkval, laser, Vikhr, rockets) is the Strike page's (strike/cockpit.ts). Flow from the ED A-10C II manual
 * (docs/research/cas-jtac.md); clearance and friendly-safety rules are trainer rules.
 * Lessons: nine-line (scored card), talk-on, geometry (scored), danger-close (scored), sortie (scored).
 * Progress: cas:<lesson>:su25t.
 *
 * URL params: ?lesson=<id>, ?shot=radio|card|smoke|smoke-tv|cleared|debrief (scripted pre-rolls for screenshots,
 * never saved as progress), ?cam=chase|target|tv, ?touch=1.
 */
import '../strike/style.css';
import './style.css';
import type { Page, PageContext, PageFactory } from '../../app/page';
import type { Aircraft, EntityId } from '../../sim/types';
import { D2R, R2D } from '../../sim/math';
import { shkvalAimPoint } from '../../sim/shkval';
import { CAS_CAVEATS } from '../../data/cas';
import { Stage, WorldView, CameraRig, isWebGLAvailable, FramePriority } from '../../render';
import { AttackScene, ShkvalTv } from '../../render/attack';
import {
  h, cleanup, labLayout, consolePanel, segmented, button, coachBox, checklist, eventLog, readouts, callout, placard,
  bindKeys, disclosure, modal, radioMenu, radioMenuKeys, radioLog, toggle, type ModalHandle, type Tone,
} from '../../ui';
import { createSu25tCockpit } from '../strike/cockpit';
import { buildCasScenario, bearingDeg, distM, type CasLessonId, type CasScenario } from './scenario';
import { makeNineLine, NINE_LINE_ORDER, type NineLine } from './nineLine';
import { JtacController, type AimState, type JtacAction } from './jtac';
import { classifyImpact, headingErrorDeg, type ImpactClass } from './safety';
import { CAS_LESSON_ORDER, CAS_PAGE_CAVEATS, LESSONS, progressKey, scoreCas, type CasSnap, type Debrief } from './lessons';
import { kneeboard } from './kneeboard';

const SHOTS = ['radio', 'card', 'smoke', 'smoke-tv', 'cleared', 'debrief'] as const;
type Shot = typeof SHOTS[number];
type Cam = 'chase' | 'target' | 'tv';
const SHOT_LESSON: Record<Shot, CasLessonId> = { radio: 'nine-line', card: 'nine-line', smoke: 'talk-on', 'smoke-tv': 'talk-on', cleared: 'geometry', debrief: 'geometry' };
/** Aim point within this distance (m) of a briefed target counts as "on the target" without a lock (trainer). */
const AIM_ON_TARGET_M = 60;
/** Scored attack lessons end this long after the last weapon resolves (s), or at the time limit. */
const END_DELAY_S = 3;
const TIME_LIMIT_S: Record<CasLessonId, number> = { 'nine-line': 400, 'talk-on': 600, geometry: 420, 'danger-close': 420, sortie: 900 };

const factory: PageFactory = (): Page => {
  const bag = cleanup();

  function mount(ctx: PageContext): void {
    const params = ctx.params;
    const shotParam = SHOTS.find(s => s === params.get('shot')) ?? null;
    const lessonParam = params.get('lesson') as CasLessonId | null;
    let lesson: CasLessonId = shotParam ? SHOT_LESSON[shotParam] : lessonParam && LESSONS[lessonParam] ? lessonParam : 'nine-line';
    let cam: Cam = (['chase', 'target', 'tv'] as const).find(c => c === params.get('cam')) ?? 'chase';

    // ------------------------------------------------------------------ state
    let sc!: CasScenario;
    let me!: Aircraft;
    let nl!: NineLine;
    let jtac!: JtacController;
    let evCursor = 0;
    let done = new Set<string>();
    let ended = false, endAt: number | null = null, scripted = false;
    let result: ModalHandle | null = null;
    let impacts: Partial<Record<ImpactClass, number>> = {};
    let cardPassed = false, cardCorrect = 0;
    let uiClock = 0;
    let showMarkers = false;

    // ------------------------------------------------------------------ DOM
    const viewport = h('div', { class: 'strk-viewport' });
    const log = eventLog({ id: 'cas-log', max: 30, title: 'Events' });
    const ck = createSu25tCockpit({
      bag, world: () => sc.world, me: () => me,
      log: (text, opts) => log.push(text, opts),
      canFire: () => !ended,
      climb: m => { me.cmd.altitude = Math.max(sc.groundM + 300, me.cmd.altitude + m); },
    });
    const { tvBezel, hudBezel, rwrBezel, touchPad, keyList } = ck;

    const subs = radioLog({ id: 'cas-subs', max: 3, ttlS: 9 });
    const menu = radioMenu({
      id: 'cas-radio',
      root: () => jtac.menu(),
      onSelect: action => { if (!jtac.act(action as JtacAction)) log.push('Not available now', { t: sc.world.t, tone: 'caution' }); menu.refresh(); updateUi(true); },
      onClose: () => updateUi(false),
    });
    bag.add(() => { menu.destroy(); subs.destroy(); });

    const ro = readouts({
      id: 'cas-ro', variant: 'glass',
      rows: [{ id: 'jtac', label: 'JTAC' }, { id: 'rng', label: 'To target' }, { id: 'hdg', label: 'Attack hdg' }, { id: 'store', label: 'Store' }, { id: 'tgt', label: 'Targets' }],
    });
    const card = kneeboard(bag, { onInput: () => checkSteps() });
    const gradeBtn = button({ label: 'Check the card', size: 's', id: 'cas-grade', onClick: () => gradeCard() });
    const cardHost = h('div', { class: 'cas-card' }, card.el, h('div', { class: 'strk-row' }, gradeBtn.el));

    const lessonSeg = segmented<CasLessonId>({
      id: 'cas-lesson', label: 'Lesson', fill: true, value: lesson,
      options: CAS_LESSON_ORDER.map(id => ({ value: id, label: LESSONS[id].short, title: LESSONS[id].title })),
      onChange: id => { lesson = id; restart(); },
    });
    const coach = coachBox({ id: 'cas-coach' });
    let steps = checklist({ steps: LESSONS[lesson].steps.map(s => ({ id: s.id, text: s.text, keys: s.keys })) });
    const stepsHost = h('div', null, steps.el);
    const restartBtn = button({ label: 'Restart', size: 's', onClick: () => restart() });
    const endBtn = button({ label: 'End and debrief', size: 's', onClick: () => finish() });
    const markerTog = toggle({ id: 'cas-markers', label: 'Unit markers (trainer aid)', style: 'switch', value: showMarkers, onChange: v => { showMarkers = v; scene?.setLayer('markers', v); } });
    const caveats = disclosure({
      title: 'Simplified and not verified', id: 'cas-caveats',
      content: h('div', null,
        callout({ kind: 'simplified', body: 'The JTAC follows the ED manual flow. Its exact wording, when it clears or aborts, and the talk-on are trainer versions.' }),
        h('ul', { class: 'strk-caveats' }, [...CAS_PAGE_CAVEATS, ...CAS_CAVEATS].map(c => h('li', null, c)))),
    });
    const camSeg = segmented<Cam>({
      id: 'cas-cam', ariaLabel: 'Camera', size: 's', value: cam,
      options: [{ value: 'chase', label: 'Chase' }, { value: 'target', label: 'Target' }, { value: 'tv', label: 'TV' }],
      onChange: c => setCam(c),
    });
    const navBox = h('div', { class: 'strk-nav cas-nav', role: 'status', 'aria-label': 'Steering cue (trainer)' });

    const lab = labLayout({
      id: 'cas-lab', class: 'strk-lab cas-lab',
      header: { title: 'CAS & JTAC', lede: 'Work the JTAC on the radio, copy the 9-line, find the mark and attack only when cleared hot.', meta: 'Su-25T · built-in JTAC · 9-line' },
      viewport,
      strip: [tvBezel.el, hudBezel.el, rwrBezel.el, touchPad, h('div', { class: 'ui-strip-block strk-ro' }, placard('CAS'), ro.el)],
      console: [
        consolePanel({ title: 'Lesson', id: 'cas-lesson-panel', children: [lessonSeg.el, coach.el, stepsHost, h('div', { class: 'strk-row' }, menu.toggleEl), h('div', { class: 'strk-row' }, restartBtn.el, endBtn.el)] }).el,
        consolePanel({ title: 'Kneeboard', id: 'cas-kneeboard', children: [cardHost] }).el,
        consolePanel({ title: 'Radio', id: 'cas-radio-log', children: [subs.historyEl, log.el] }).el,
        consolePanel({ title: 'Controls', id: 'cas-controls', children: [...ck.controlRows, markerTog.el] }).el,
        keyList, caveats,
      ],
      mobileActions: ck.mobileActions,
    });
    if (params.get('touch') === '1') lab.el.classList.add('strk--touch');
    lab.overlay('tl', h('div', { class: 'cas-tl' }, camSeg.el, menu.el));
    lab.overlay('tr', navBox);
    lab.view.append(h('div', { class: 'cas-subs' }, subs.el));
    ctx.root.append(lab.el);

    // ------------------------------------------------------------------ 3D
    if (!isWebGLAvailable()) viewport.append(h('p', { class: 'strk-no3d' }, 'WebGL is not available: the 3D view and the Shkval TV picture are off. The lesson still runs.'));
    const stage = isWebGLAvailable() ? new Stage(viewport, { autoPause: 'render', maxDpr: 1.5, environment: { surface: 'land', grid: false, hazeKm: 60 }, ariaLabel: 'CAS attack in 3D' }) : null;
    bag.add(() => stage?.dispose());
    let view: WorldView | null = null, scene: AttackScene | null = null, rig: CameraRig | null = null, tvCam: ShkvalTv | null = null;

    sc = buildCasScenario(lesson);
    me = sc.me;
    if (stage) {
      view = new WorldView(stage, sc.world, { units: 'metric', layers: { dropLines: false, shadows: false } });
      scene = new AttackScene(stage, sc.world, view, { field: sc.field, shooterId: me.id, layers: { markers: showMarkers } });
      tvCam = new ShkvalTv(stage, { hidden: () => scene!.tvHidden() });
      bag.add(() => tvCam?.dispose());
      rig = new CameraRig(stage, { source: view, mode: 'chase' });
      stage.onFrame(dt => { if (dt > 0) tick(Math.min(dt, 0.1)); });
      stage.onFrame(() => ck.draw(tvCam, sc.sams.length > 0), { priority: FramePriority.env + 50 });
    } else {
      let last = performance.now(), raf = 0;
      const loop = (now: number) => { tick(Math.min(0.1, (now - last) / 1000)); last = now; ck.draw(null, sc.sams.length > 0); raf = requestAnimationFrame(loop); };
      raf = requestAnimationFrame(loop);
      bag.add(() => cancelAnimationFrame(raf));
    }

    // One key map: the cockpit keys, the radio menu (\, F-keys and digits; digits fall back to nothing).
    bag.add(bindKeys({ ...radioMenuKeys(menu), ...withoutRadioChords(ck.keys) }));

    // ------------------------------------------------------------------ helpers
    function aim(): AimState {
      const w = sc.world, sh = me.ag!.shkval;
      if (sh.lockedUnitId) return sc.targets.includes(sh.lockedUnitId) ? { kind: 'target', unitId: sh.lockedUnitId } : { kind: 'other', unitId: sh.lockedUnitId };
      const p = sh.on ? shkvalAimPoint(w, me) : null;
      if (!p) return { kind: 'none' };
      for (const id of sc.targets) { const u = w.groundUnits.get(id); if (u?.alive && distM(u.pos, p) <= AIM_ON_TARGET_M) return { kind: 'target', unitId: id }; }
      return { kind: 'none' };
    }
    const hdgDeg = () => ((me.heading * R2D) % 360 + 360) % 360;
    const alive = (ids: readonly EntityId[]) => ids.filter(id => sc.world.groundUnits.get(id)?.alive).length;

    function setCam(c: Cam): void {
      cam = c;
      lab.el.classList.toggle('strk--tvbig', c === 'tv');
      if (c === 'tv') lab.view.append(tvBezel.el);
      else if (tvBezel.el.parentElement !== lab.strip) lab.strip.prepend(tvBezel.el);
      if (!rig) return;
      if (c === 'target') {
        rig.setMode('orbit', { focus: { x: sc.target.x, y: sc.groundM, z: sc.target.z }, distance: 1400, instant: true });
        rig.setView({ headingDeg: 200, elevationDeg: 26 }, true);
      } else {
        rig.setMode('orbit', { focus: me.id, distance: 420, instant: true });
        rig.setView({ headingDeg: me.heading * R2D + 24, elevationDeg: 8 }, true);
      }
    }

    // ------------------------------------------------------------------ lesson lifecycle
    function restart(): void {
      result?.destroy(); result = null;
      sc = buildCasScenario(lesson);
      me = sc.me;
      nl = makeNineLine(sc);
      jtac = new JtacController(sc.world, sc, nl, { aim });
      jtac.onCall(c => {
        subs.push({ from: c.from === 'jtac' ? jtac.callsign : 'You', text: c.text, t: c.t, tone: c.tone, unverified: !c.verified });
        menu.refresh();
      });
      // Later lessons start past the brief: the JTAC has already been worked up to IP inbound.
      if (lesson !== 'nine-line' && lesson !== 'sortie') { jtac.state = 'await-ip'; card.fill(nl); card.setRemarks(nl.remarks); }
      else card.reset();
      cardHost.hidden = false;
      gradeBtn.el.hidden = lesson !== 'nine-line';
      view?.setWorld(sc.world);
      scene?.setWorld(sc.world);
      scene?.setShooter(me.id);
      scene?.setGeometry({ ip: sc.ip, target: sc.target, attackHeadingDeg: [sc.attackHdgDeg[0], sc.attackHdgDeg[1]] });
      scene?.setLayer('markers', showMarkers);
      evCursor = 0; done = new Set(); ended = false; endAt = null; scripted = false; impacts = {};
      cardPassed = false; cardCorrect = 0;
      ck.resetInputs();
      rwrBezel.el.hidden = !sc.sams.length;
      subs.clear();
      menu.close();
      const def = LESSONS[lesson];
      const fresh = checklist({ steps: def.steps.map(s => ({ id: s.id, text: s.text, keys: s.keys })) });
      stepsHost.replaceChildren(fresh.el);
      steps = fresh;
      lessonSeg.set(lesson, false);
      endBtn.el.hidden = !def.scored;
      log.clear();
      log.push(def.goal, { t: 0 });
      // Attack lessons start in air-to-ground mode with the Vikhr selected; the Shkval stays off until the pilot needs it.
      if (lesson !== 'nine-line') { sc.world.setAgMaster(me.id, 'ag'); sc.world.selectAgWeapon(me.id, 'vikhr'); }
      setCam(cam);
      updateUi(true);
    }

    function gradeCard(): void {
      const g = card.grade(nl);
      cardPassed = g.passed; cardCorrect = g.correct.length;
      log.push(`Card: ${g.correct.length} of 9 lines right${g.passed ? '' : '; a key line is wrong'}`, { t: sc.world.t, tone: g.passed ? 'ok' : 'caution' });
      checkSteps();
    }

    function snap(): CasSnap {
      const a = aim(), sh = me.ag!.shkval;
      const rel = [...jtac.releases.values()];
      return {
        jtac: jtac.state, menuOpen: menu.isOpen(), cardPassed, shkvalOn: sh.on,
        lockedTarget: !!sh.lockedUnitId && a.kind === 'target', lockedOther: !!sh.lockedUnitId && a.kind === 'other',
        onAttackHeading: headingErrorDeg(hdgDeg(), sc.attackHdgDeg) === 0,
        releases: rel.length, clearedReleases: rel.filter(r => r.cleared).length, violations: jtac.violations.length,
        targetsKilled: sc.targets.length - alive(sc.targets), targets: sc.targets.length,
        fratricide: (impacts.fratricide ?? 0) > 0, attacks: jtac.attacks,
      };
    }

    function tick(dt: number): void {
      const w = sc.world;
      if (ended && endAt == null) return;
      w.step(dt);
      jtac.step();
      ck.step(dt);
      subs.tick(w.t);
      readEvents();
      checkSteps();
      checkEnd();
      uiClock += dt;
      if (uiClock > 0.1) { uiClock = 0; updateUi(false); }
    }

    function readEvents(): void {
      const w = sc.world, ev = w.events;
      if (evCursor > ev.length) evCursor = 0;
      for (; evCursor < ev.length; evCursor++) {
        const e = ev[evCursor]!;
        switch (e.type) {
          case 'ag-launch': if (e.shooterId === me.id) log.push(`${e.weapon === 'vikhr' ? 'Vikhr' : 'Weapon'} away`, { t: e.t }); break;
          case 'ag-impact': {
            if (e.weapon === 'gun25t' && !e.killed.length) break;
            const r = classifyImpact(w, e, { targets: sc.targets, friendlies: [...sc.friendlies, sc.jtac] });
            impacts[r.cls] = (impacts[r.cls] ?? 0) + 1;
            const tone: Tone = r.cls === 'on-target' ? 'ok' : r.cls === 'miss' ? 'caution' : 'warning';
            const text = { 'on-target': 'Impact on the target', 'wrong-target': 'Impact on a vehicle that is not the target', fratricide: 'Friendly hit', 'danger-close': `Impact ${Math.round(r.nearestFriendlyM ?? 0)} m from friendlies`, miss: 'Miss' }[r.cls];
            log.push(text, { t: e.t, tone });
            break;
          }
          case 'ground-kill': { const u = w.groundUnits.get(e.targetId); log.push(`${u?.name ?? 'Target'} destroyed`, { t: e.t, tone: u?.side === 'blue' ? 'warning' : 'ok' }); break; }
          case 'mark': if (e.what === 'on') log.push('White smoke on the ground', { t: e.t }); break;
          case 'sam': if (e.targetId === me.id && e.what === 'launch') log.push('SPO-15: launch. Notch or leave the ring', { t: e.t, tone: 'warning' }); break;
          default: break;
        }
      }
    }

    function checkSteps(): void {
      const def = LESSONS[lesson];
      const s = snap();
      for (const st of def.steps) {
        if (done.has(st.id)) continue;
        if (st.check(s)) { done.add(st.id); steps.setDone(st.id); continue; }
        break;
      }
      if (!def.scored && done.size === def.steps.length && !ended) {
        ended = true;
        if (!scripted) ctx.app.setProgress(progressKey(lesson), true);
        showDebrief({ stars: 3, title: `${def.title}: complete`, lines: def.steps.map(x => x.text.split(':')[0]!), coaching: [], passed: true });
      }
    }

    function checkEnd(): void {
      const w = sc.world;
      if (ended && endAt != null && w.t >= endAt) { endAt = null; finish(); return; }
      if (ended || !LESSONS[lesson].scored) return;
      const flying = [...w.agWeapons.values()].some(x => x.alive);
      const timeUp = w.t > TIME_LIMIT_S[lesson];
      const attackDone = lesson !== 'nine-line' && jtac.attacks > 0 && !flying && (alive(sc.targets) === 0 || lesson !== 'sortie');
      const cardDone = lesson === 'nine-line' && cardPassed && done.has('readback');
      if (!me.alive || timeUp || attackDone || cardDone || (impacts.fratricide ?? 0) > 0) { ended = true; endAt = w.t + END_DELAY_S; }
    }

    function finish(): void {
      if (result) return;
      ended = true;
      if (lesson === 'nine-line' && !cardCorrect) { const g = card.grade(nl); cardCorrect = g.correct.length; cardPassed = g.passed; }
      const d = scoreCas({
        lesson, targets: sc.targets.length, targetsKilled: sc.targets.length - alive(sc.targets), impacts,
        releases: jtac.releases.size, violations: jtac.violations.map(v => v.why), aborts: jtac.calls.filter(c => c.tone === 'warning').length,
        shotDown: !me.alive, ...(lesson === 'nine-line' ? { card: { correct: cardCorrect, passed: cardPassed } } : {}),
      });
      if (d.passed && !scripted) ctx.app.setProgress(progressKey(lesson), true);
      showDebrief(d, scripted);
    }

    function showDebrief(d: Debrief, demo = false): void {
      result?.destroy();
      const stars = '★'.repeat(d.stars) + '☆'.repeat(3 - d.stars);
      const next = CAS_LESSON_ORDER[CAS_LESSON_ORDER.indexOf(lesson) + 1];
      result = modal({
        id: 'cas-debrief', title: `${d.title}${demo ? ' (scripted demo, not saved)' : ''}`, within: lab.view, tone: d.passed ? 'ok' : 'caution', open: true,
        body: h('div', { class: 'strk-debrief' },
          h('p', { class: 'strk-debrief__stars', 'aria-label': `${d.stars} of 3` }, stars),
          h('ul', null, d.lines.map(l => h('li', null, l))),
          d.coaching.length ? h('div', null, placard('Coaching'), h('ul', null, d.coaching.map(l => h('li', null, l)))) : null),
        actions: [
          { label: 'Fly again', onClick: () => restart(), id: 'cas-again' },
          ...(next ? [{ label: `Next: ${LESSONS[next].short}`, primary: true, id: 'cas-next', onClick: () => { lesson = next; restart(); } }] : []),
        ],
      });
      bag.add(() => result?.destroy());
    }

    // ------------------------------------------------------------------ UI
    function updateNav(): void {
      const s = jtac.state;
      const before = s === 'idle' || s === 'checked-in' || s === 'nine-line' || s === 'remarks-ready' || s === 'remarks' || s === 'readback' || s === 'await-ip';
      // Lessons that start inside the IP (talk-on, danger close) steer to the target, never back to the IP.
      const pastIp = distM(me.pos, sc.target) < distM(sc.ip, sc.target);
      const sp = s === 'complete' || s === 'checked-out' ? sc.egress : before && !pastIp ? sc.ip : { name: 'TGT', ...sc.target };
      const brg = bearingDeg(me.pos, sp), turn = ((brg - hdgDeg() + 540) % 360) - 180;
      const agl = me.pos.y - sc.world.groundHeight(me.pos.x, me.pos.z);
      const row = (k: string, v: string, cls?: string) => h('div', { class: 'strk-nav__row' }, h('span', { class: 'strk-nav__k' }, k), h('span', { class: cls }, v));
      navBox.replaceChildren(
        row('Steer', `${sp.name} ${String(Math.round(brg) % 360).padStart(3, '0')}° ${(distM(me.pos, sp) / 1000).toFixed(1)} km`),
        row('Turn', Math.abs(turn) < 2 ? 'on course' : `${turn > 0 ? 'right' : 'left'} ${Math.abs(turn).toFixed(0)}°`, Math.abs(turn) < 2 ? 'is-ok' : undefined),
        row('РВ', `${Math.round(agl)} m`),
      );
    }

    function updateUi(force: boolean): void {
      const w = sc.world, ag = me.ag!;
      const def = LESSONS[lesson];
      const err = headingErrorDeg(hdgDeg(), sc.attackHdgDeg);
      ro.set('jtac', jtac.state.replace('-', ' '));
      ro.set('rng', `${(distM(me.pos, sc.target) / 1000).toFixed(1)} km`);
      ro.set('hdg', `${String(Math.round(hdgDeg()) % 360).padStart(3, '0')} (${String(sc.attackHdgDeg[0]).padStart(3, '0')}–${String(sc.attackHdgDeg[1]).padStart(3, '0')})`);
      ro.setTone('hdg', err === 0 ? 'ok' : null);
      ro.set('store', ag.selected ? `${ag.selected === 'vikhr' ? 'Vikhr' : ag.selected} ×${ag.stores[ag.selected] ?? 0}` : 'none');
      ro.set('tgt', `${alive(sc.targets)} of ${sc.targets.length} up`);
      ck.updateLamps();
      updateNav();
      const cur = def.steps.find(s => !done.has(s.id));
      steps.setCurrent(cur?.id ?? null);
      let text = cur ? cur.text : def.scored ? 'Finish the attack; the debrief follows.' : 'Lesson complete.';
      let why = def.goal, tone: Tone | undefined;
      if (jtac.state === 'cleared') { why = 'Cleared hot: release on the target, then call Off.'; tone = 'ok'; }
      else if (jtac.state === 'aborted') { why = 'Aborted: no release. Fix the heading or the target, then call In again.'; tone = 'warning'; }
      else if (jtac.busy) { why = 'The JTAC is talking: listen, then answer from the radio menu.'; }
      if (lesson === 'nine-line' && !done.has('card') && after9()) { text = 'Type each line on the kneeboard card, then Check the card.'; }
      if (force || text) coach.set(text, why, tone);
    }
    const after9 = () => !['idle', 'checked-in'].includes(jtac.state);

    // ------------------------------------------------------------------ start, pre-rolls
    restart();
    if (shotParam) preroll(shotParam);
    if (params.get('cam') === 'target' || params.get('cam') === 'tv') setCam(cam);

    function run(sec: number, stop: () => boolean = () => false): void { for (let i = 0; i < sec * 30 && !stop(); i++) tick(1 / 30); }
    function say(a: JtacAction): void { jtac.act(a); run(30, () => !jtac.busy); }
    function steerAtTarget(): void { me.heading = me.cmd.heading = bearingDeg(me.pos, sc.target) * D2R; }

    /** Scripted pilot for screenshots (never saved as progress). */
    function preroll(s: Shot): void {
      scripted = true;
      const w = sc.world, id = me.id;
      if (s === 'radio') {
        menu.open(); menu.select(4); menu.select(1);
      } else if (s === 'card') {
        say('check-in'); jtac.act('ready-to-copy'); run(12);
        card.fill(nl, NINE_LINE_ORDER.slice(0, 5));
      } else if (s === 'smoke' || s === 'smoke-tv') {
        say('ip-inbound'); run(10, () => jtac.state === 'mark-down'); say('contact-mark');
        if (s === 'smoke-tv') {
          const m = w.marks.get(jtac.markId!)!;
          w.shkvalPower(id, true); w.shkvalPointAt(id, m.pos); w.shkvalStabilise(id, true); w.shkvalZoom(id, 1);
          run(1.5); setCam('tv');
        } else { cam = 'target'; setCam('target'); }
      } else {
        say('ip-inbound'); run(10, () => jtac.state === 'mark-down'); say('contact-mark');
        steerAtTarget();
        const t = w.groundUnits.get(sc.targets[1]!)!;
        w.shkvalPower(id, true); w.shkvalZoom(id, 1); w.shkvalZoom(id, 1);
        w.shkvalPointAt(id, t.pos); w.shkvalStabilise(id, true); w.shkvalLock(id);
        say('in');
        if (s === 'debrief') {
          for (const tid of sc.targets) {
            const u = w.groundUnits.get(tid)!;
            if (!u.alive || !me.alive) continue;
            if (me.ag!.shkval.lockedUnitId) w.shkvalUnlock(id);
            w.shkvalPointAt(id, u.pos); w.shkvalStabilise(id, true); w.shkvalLock(id); w.laser(id, true);
            run(40, () => w.canAgLaunch(id).pr);
            ck.fire();
            run(40, () => ![...w.agWeapons.values()].some(x => x.alive));
          }
          say('off'); run(6);
          finish();
        }
      }
      if (cam !== 'tv') setCam(cam);
      view?.syncNow();
      menu.refresh();
      updateUi(true);
    }
  }

  return { mount, unmount() { bag.dispose(); } };
};

/** Drop cockpit chords the radio menu owns (digits are Su-25T master modes but also the menu's F-key aliases). */
function withoutRadioChords<T extends Record<string, unknown>>(keys: T): T {
  const out = { ...keys };
  for (const k of ['1', '7', '8']) delete out[k];
  return out;
}

export default factory;
