/**
 * [OWNER: page-tgp] Targeting pod & Mavericks (#/tgp, the A-10C II only). The pilot works the A-10C II sensors the
 * way DCS presents them: the sensor of interest with the Coolie, the SPI with TMS Forward Long, slave all with China
 * Hat Forward Long, the Litening pod (slew, WIDE / NARO, AREA / POINT / INR), the laser on its code, the laser spot
 * search on the LSS code, the AGM-65D / H from the MAV page (lock with TMS Forward Short, recage with China Hat Aft
 * Short), the GBU-12, APKWS and AGM-65L on the own laser, and a gun strafe. Cockpit and HOTAS from the CAS page
 * (cas/a10cCockpit.ts, cas/a10cHotas.ts); lessons in lessons.ts, the lesson run in session.ts, the scripted pilot in
 * script.ts. Facts from docs/research/a10c.md; trainer rules listed in TGP_CAVEATS. Progress: tgp:<lesson>:a10c.
 *
 * URL params: ?lesson=soi|pod|laser|mav|lgb|gun, ?shot=soi|pod|lss|mav-page|mav-lock|gbu|gun|debrief (scripted
 * pre-rolls for screenshots, never saved as progress), ?cam=chase|target|tv, ?touch=1.
 */
import '../strike/style.css';
import '../cas/style.css';
import './style.css';
import type { Page, PageContext, PageFactory } from '../../app/page';
import type { Aircraft } from '../../sim/types';
import { R2D } from '../../sim/math';
import { AG_WEAPONS } from '../../data/agWeapons';
import { predictImpact } from '../../sim/agWeapons';
import { validLaserCode } from '../../sim/tgp';
import { Stage, WorldView, CameraRig, ForwardView, isWebGLAvailable, FramePriority } from '../../render';
import { AttackScene, ImpactTrail, ShkvalTv } from '../../render/attack';
import {
  h, cleanup, labLayout, consolePanel, segmented, button, coachBox, checklist, eventLog, readouts, callout, placard,
  bindKeys, disclosure, modal, type ModalHandle, type Tone,
} from '../../ui';
import { createA10cCockpit } from '../cas/a10cCockpit';
import { LESSONS, TGP_CAVEATS, TGP_LESSON_ORDER, debriefLines, progressKey, type TgpLessonId } from './lessons';
import { BUDDY_CODE, buildTgpScenario, centreOf, type TgpScenario } from './scenario';
import { TgpSession } from './session';
import { flyScript, type Pilot } from './script';

const SHOTS = ['soi', 'pod', 'lss', 'mav-page', 'mav-lock', 'gbu', 'gun', 'debrief'] as const;
type Shot = typeof SHOTS[number];
type Cam = 'chase' | 'target' | 'tv';
/** Pre-roll per shot: the lesson, the last script stage to fly, extra seconds, and the camera. */
const SHOT_PLAN: Record<Shot, { lesson: TgpLessonId; until?: string; extraS: number; cam: Cam }> = {
  soi: { lesson: 'soi', until: 'spi', extraS: 0.5, cam: 'chase' },
  pod: { lesson: 'pod', until: 'point', extraS: 1, cam: 'tv' },
  lss: { lesson: 'laser', until: 'ltrack', extraS: 1, cam: 'tv' },
  'mav-page': { lesson: 'mav', until: 'mavsoi', extraS: 1, cam: 'tv' },
  'mav-lock': { lesson: 'mav', until: 'lock', extraS: 1, cam: 'tv' },
  gbu: { lesson: 'lgb', until: 'lase', extraS: 3, cam: 'chase' },
  gun: { lesson: 'gun', until: 'fire', extraS: 0.3, cam: 'chase' },
  debrief: { lesson: 'mav', extraS: 1, cam: 'target' },
};
const NM = 1852;

const factory: PageFactory = (): Page => {
  const bag = cleanup();

  function mount(ctx: PageContext): void {
    const params = ctx.params;
    const shotParam = SHOTS.find(s => s === params.get('shot')) ?? null;
    const lessonParam = params.get('lesson') as TgpLessonId | null;
    let lesson: TgpLessonId = shotParam ? SHOT_PLAN[shotParam].lesson : lessonParam && TGP_LESSON_ORDER.includes(lessonParam) ? lessonParam : 'soi';
    let cam: Cam = (['chase', 'target', 'tv'] as const).find(c => c === params.get('cam')) ?? 'chase';

    // ------------------------------------------------------------------ state
    let sc!: TgpScenario;
    let me!: Aircraft;
    let session: TgpSession | null = null;
    let evCursor = 0, uiClock = 0;
    let ended = false, scripted = false;
    let result: ModalHandle | null = null;
    bag.add(() => session?.dispose());

    // ------------------------------------------------------------------ DOM
    const viewport = h('div', { class: 'strk-viewport' });
    const log = eventLog({ id: 'tgp-log', max: 30, title: 'Events' });
    const ck = createA10cCockpit({
      bag, world: () => sc.world, me: () => me, jtac: () => null, steerpoint: () => sc.steerpoint,
      targets: () => sc.targets, friendlies: () => (sc.buddy ? [{ id: sc.buddy, label: 'Ranger 2' }] : []),
      log: (text, opts) => log.push(text, opts), canFire: () => !ended, noMsg: true,
    });
    const ho = ck.hotas;

    const ro = readouts({
      id: 'tgp-ro', variant: 'glass',
      rows: [{ id: 'soi', label: 'SOI' }, { id: 'spi', label: 'SPI' }, { id: 'rng', label: 'To column' }, { id: 'store', label: 'Store' }, { id: 'codes', label: 'Codes L / LSS' }],
    });
    const lessonSeg = segmented<TgpLessonId>({
      id: 'tgp-lesson', label: 'Lesson', fill: true, value: lesson,
      options: TGP_LESSON_ORDER.map(id => ({ value: id, label: LESSONS[id].short, title: LESSONS[id].title })),
      onChange: id => { lesson = id; restart(); },
    });
    const coach = coachBox({ id: 'tgp-coach' });
    let steps = checklist({ steps: LESSONS[lesson].steps.map(s => ({ id: s.id, text: s.text, keys: s.keys })) });
    const stepsHost = h('div', null, steps.el);
    const restartBtn = button({ label: 'Restart', size: 's', onClick: () => restart() });

    // CNTL page (simplified): the own laser code (OSB 18) and the LSS code (OSB 17).
    const codeRow = (which: 'laser' | 'lss', label: string) => {
      const input = h('input', {
        class: 'cas-kb__input tgp-code__input', type: 'text', inputmode: 'numeric', maxlength: '4', id: `tgp-code-${which}`,
        'aria-label': `${label}: four digits 1111 to 1788`, placeholder: '1688',
      }) as HTMLInputElement;
      const status = h('span', { class: 'tgp-code__status', 'aria-live': 'polite' });
      const enter = () => {
        const code = Number(input.value.trim());
        const ok = validLaserCode(code) && sc.world.tgpCode(me.id, which, code).ok;
        status.textContent = ok ? '' : 'INPUT ERROR';
        if (ok) { log.push(`${which === 'laser' ? 'L' : 'LSS'} code ${code}`, { t: sc.world.t }); input.value = ''; }
        updateUi(true);
      };
      bag.on(input, 'keydown', (e: Event) => { if ((e as KeyboardEvent).key === 'Enter') enter(); });
      const btn = button({ label: 'Enter', size: 's', onClick: enter });
      return { el: h('div', { class: 'tgp-code' }, h('label', { class: 'tgp-code__label', for: input.id }, label), input, btn.el, status), input, status };
    };
    const lCode = codeRow('laser', 'L code · OSB 18'), lssCode = codeRow('lss', 'LSS code · OSB 17');
    const cntl = consolePanel({
      title: 'TGP CNTL page', id: 'tgp-cntl',
      children: [
        lCode.el, lssCode.el,
        callout({ kind: 'simplified', body: 'Type the code and press Enter. In DCS you enter it on the CNTL page with the UFC.' }),
      ],
    });
    const caveats = disclosure({
      title: 'Simplified and not verified', id: 'tgp-caveats',
      content: h('div', null, h('ul', { class: 'strk-caveats' }, TGP_CAVEATS.map(c => h('li', null, c)))),
    });
    const camSeg = segmented<Cam>({
      id: 'tgp-cam', ariaLabel: 'Camera', size: 's', value: cam,
      options: [{ value: 'chase', label: 'Chase' }, { value: 'target', label: 'Target' }, { value: 'tv', label: 'MFCD' }],
      onChange: c => setCam(c),
    });

    const lab = labLayout({
      id: 'tgp-lab', class: 'strk-lab cas-lab cas-lab--a10c tgp-lab',
      header: {
        title: 'Targeting pod & Mavericks',
        lede: 'Move the SOI, set the SPI, track and lase with the pod, find a laser spot, then fire Mavericks and laser weapons.',
        meta: 'A-10C II · Litening pod · AGM-65D / H / L · GBU-12 · APKWS',
      },
      viewport,
      strip: [ck.hudBezel.el, ck.leftBezel.el, ck.tgpBezel.el, ck.touchPad, h('div', { class: 'ui-strip-block strk-ro' }, placard('Sensors'), ro.el)],
      console: [
        consolePanel({ title: 'Lesson', id: 'tgp-lesson-panel', children: [lessonSeg.el, coach.el, stepsHost, h('div', { class: 'strk-row' }, restartBtn.el), log.el] }).el,
        consolePanel({ title: 'Controls', id: 'tgp-controls', children: ck.controlRows }).el,
        cntl.el, ck.keyList, caveats,
      ],
      mobileActions: ck.mobileActions,
    });
    if (params.get('touch') === '1') lab.el.classList.add('strk--touch');
    lab.overlay('tl', camSeg.el);
    ctx.root.append(lab.el);

    // ------------------------------------------------------------------ 3D
    if (!isWebGLAvailable()) viewport.append(h('p', { class: 'strk-no3d' }, 'WebGL is not available: the 3D view and the pod picture are off. The lesson still runs.'));
    const stage = isWebGLAvailable() ? new Stage(viewport, { autoPause: 'render', maxDpr: 1.5, environment: { surface: 'land', grid: false, hazeKm: 60 }, ariaLabel: 'A-10C II attack in 3D' }) : null;
    bag.add(() => stage?.dispose());
    let view: WorldView | null = null, scene: AttackScene | null = null, rig: CameraRig | null = null, tvCam: ShkvalTv | null = null;
    let trail: ImpactTrail | null = null, hudCam: ForwardView | null = null;

    sc = buildTgpScenario(lesson);
    me = sc.me;
    if (stage) {
      view = new WorldView(stage, sc.world, { units: ctx.app.units, layers: { dropLines: false, shadows: false } });
      scene = new AttackScene(stage, sc.world, view, { field: sc.field, shooterId: me.id });
      trail = new ImpactTrail(stage);
      bag.add(() => trail?.dispose());
      tvCam = new ShkvalTv(stage, { hidden: () => [...scene!.tvHidden(), trail!] });
      hudCam = new ForwardView(stage, { hidden: () => [...scene!.tvHidden(), trail!] });
      bag.add(() => hudCam?.dispose());
      bag.add(() => tvCam?.dispose());
      rig = new CameraRig(stage, { source: view, mode: 'chase' });
      stage.onFrame(dt => { if (dt > 0) tick(Math.min(dt, 0.1)); });
      stage.onFrame(() => { ck.draw(tvCam, false, hudCam); trail?.update(sc.world.t, me.alive ? me.pos : null, ccipPoint()); }, { priority: FramePriority.env + 50 });
    } else {
      let last = performance.now(), raf = 0;
      const loop = (now: number) => { tick(Math.min(0.1, (now - last) / 1000)); last = now; ck.draw(null, false); raf = requestAnimationFrame(loop); };
      raf = requestAnimationFrame(loop);
      bag.add(() => cancelAnimationFrame(raf));
    }

    // One key map: the cockpit keys plus the CMS digits (flares).
    bag.add(bindKeys({ ...ck.keys, ...ck.cmsKeys }));

    // ------------------------------------------------------------------ helpers
    /** CCIP ground point of the selected unguided store (the gun), for the impact trail. */
    function ccipPoint() {
      const sel = me.ag!.selected;
      if (!me.alive || ho.master === 'NAV' || !sel || AG_WEAPONS[sel].guidance !== 'ballistic') return null;
      return predictImpact(sc.world, me, sel);
    }
    function setCam(c: Cam): void {
      cam = c;
      lab.el.classList.toggle('strk--tvbig', c === 'tv');
      if (c === 'tv') lab.view.append(ck.tgpBezel.el);
      else if (ck.tgpBezel.el.parentElement !== lab.strip) lab.strip.insertBefore(ck.tgpBezel.el, ck.touchPad);
      camSeg.set(c, false);
      if (!rig) return;
      if (c === 'target') {
        const tgt = lesson === 'gun' || (lesson === 'lgb' && session?.phase === 'apkws') ? sc.trucks : sc.column;
        const p = centreOf(sc.world, tgt) ?? { x: 0, y: sc.groundM, z: 0 };
        rig.setMode('orbit', { focus: { x: p.x, y: p.y, z: p.z }, distance: 1100, instant: true });
        rig.setView({ headingDeg: 200, elevationDeg: 24 }, true);
      } else {
        rig.setMode('orbit', { focus: me.id, distance: 420, instant: true });
        rig.setView({ headingDeg: me.heading * R2D + 24, elevationDeg: 8 }, true);
      }
    }

    // ------------------------------------------------------------------ lesson lifecycle
    function restart(): void {
      result?.destroy(); result = null;
      session?.dispose();
      sc = buildTgpScenario(lesson);
      me = sc.me;
      view?.setWorld(sc.world);
      scene?.setWorld(sc.world);
      scene?.setShooter(me.id);
      evCursor = 0; ended = false; scripted = false;
      ck.resetInputs();
      session = new TgpSession(lesson, sc, ho, (text, tone) => log.push(text, { t: sc.world.t, ...(tone ? { tone } : {}) }));
      const def = LESSONS[lesson];
      steps = checklist({ steps: def.steps.map(s => ({ id: s.id, text: s.text, keys: s.keys })) });
      stepsHost.replaceChildren(steps.el);
      lessonSeg.set(lesson, false);
      lCode.status.textContent = ''; lssCode.status.textContent = '';
      cntl.el.hidden = lesson !== 'laser' && lesson !== 'lgb';
      log.clear();
      log.push(def.goal, { t: 0 });
      if (lesson === 'laser') log.push(`Ranger 2 is lasing a truck on code ${BUDDY_CODE}`, { t: 0 });
      setCam(cam);
      updateUi(true);
    }

    function tick(dt: number): void {
      const w = sc.world;
      if (ended || !session) return;
      w.step(dt);
      ck.step(dt);
      for (const id of session.update(dt)) steps.setDone(id);
      readEvents();
      if (session.complete) complete();
      uiClock += dt;
      if (uiClock > 0.1) { uiClock = 0; updateUi(false); }
    }

    function readEvents(): void {
      const w = sc.world, ev = w.events;
      if (evCursor > ev.length) evCursor = 0;
      for (; evCursor < ev.length; evCursor++) {
        const e = ev[evCursor]!;
        switch (e.type) {
          case 'ag-launch':
            if (e.shooterId === me.id && e.weapon !== 'gau8') log.push(`${AG_WEAPONS[e.weapon].name} away${e.range ? ` at ${(e.range / NM).toFixed(1)} nm` : ''}`, { t: e.t });
            break;
          case 'ag-miss': if (e.weapon !== 'gau8') log.push(`${AG_WEAPONS[e.weapon].name} missed (${e.reason})`, { t: e.t, tone: 'warning' }); break;
          case 'ground-kill': { const u = w.groundUnits.get(e.targetId); log.push(`${u?.name ?? 'Target'} destroyed`, { t: e.t, tone: 'ok' }); break; }
          default: break;
        }
      }
    }

    function complete(): void {
      if (ended || !session) return;
      ended = true;
      const def = LESSONS[lesson];
      if (!scripted) ctx.app.setProgress(progressKey(lesson), true);
      result?.destroy();
      const next = TGP_LESSON_ORDER[TGP_LESSON_ORDER.indexOf(lesson) + 1];
      result = modal({
        id: 'tgp-debrief', title: `${def.title}: complete${scripted ? ' (scripted demo, not saved)' : ''}`, within: lab.view, tone: 'ok', open: true,
        body: h('div', { class: 'strk-debrief' }, h('ul', null, debriefLines(lesson, session.snapshot).map(l => h('li', null, l)))),
        actions: [
          { label: 'Fly again', onClick: () => restart(), id: 'tgp-again' },
          ...(next ? [{ label: `Next: ${LESSONS[next].short}`, primary: true, id: 'tgp-next', onClick: () => { lesson = next; restart(); } }] : []),
        ],
      });
      bag.add(() => result?.destroy());
      updateUi(true);
    }

    function updateUi(force: boolean): void {
      if (!session) return;
      const w = sc.world, ag = me.ag!, t = ag.tgp!;
      const s = session.snapshot;
      const soiName = { hud: 'HUD', tad: 'TAD', tgp: 'TGP', mav: 'MAV' }[ho.soi];
      ro.set('soi', soiName);
      ro.set('spi', { steer: `Steerpoint ${sc.steerpoint.name}`, tasking: 'TAD', tgp: 'TGP', mav: 'MAV' }[ho.spiSource]);
      const c = centreOf(w, sc.column);
      ro.set('rng', c ? `${(Math.hypot(me.pos.x - c.x, me.pos.z - c.z) / NM).toFixed(1)} nm` : '—');
      ro.set('store', ck.storeText());
      ro.set('codes', `${t.laserCode} / ${t.lssCode}`);
      ck.updateLamps();
      const def = LESSONS[lesson];
      const curId = session.current();
      steps.setCurrent(curId);
      const cur = def.steps.find(x => x.id === curId);
      let text = cur ? cur.text : 'Lesson complete.';
      let why = def.goal, tone: Tone | undefined;
      const check = w.canAgLaunch(me.id);
      if (!ended && ho.master !== 'NAV' && ag.selected && ag.selected !== 'gau8') {
        if (check.ok) { why = `${AG_WEAPONS[ag.selected].name}: in range, release.`; tone = 'ok'; }
        else if (check.reason) why = check.reason;
      }
      const guided = [...w.agWeapons.values()].some(x => x.alive && x.shooterId === me.id && (x.type === 'gbu12' || x.type === 'apkws' || x.type === 'agm65l'));
      if (guided) { why = t.laserFiring ? 'Laser weapon in flight: keep the spot on the target until impact.' : 'Laser weapon in flight: fire the laser now (Insert) and hold it to impact.'; tone = t.laserFiring ? 'ok' : 'caution'; }
      if (lesson === 'gun' && !ended && me.pos.y - w.groundHeight(me.pos.x, me.pos.z) < 350 && me.vel.y < -5) { text = 'Pull up: Down arrow.'; why = 'Below about 1100 ft and descending.'; tone = 'warning'; }
      if (s.soi === 'mav' && !ag.mav) { why = 'No AGM-65D / H on this loadout: the MAV page has nothing to lock.'; }
      if (force || text) coach.set(text, why, tone);
    }

    // ------------------------------------------------------------------ start, pre-rolls
    restart();
    if (shotParam) preroll(shotParam);
    else if (params.get('cam') === 'target' || params.get('cam') === 'tv') setCam(cam);

    /** Scripted pilot for screenshots (never saved as progress). */
    function preroll(s: Shot): void {
      const plan = SHOT_PLAN[s];
      scripted = true;
      const pilot: Pilot = {
        session: session!, hotas: ho,
        run(sec, stop = () => false, each) { for (let i = 0; i < sec * 30 && !stop() && !ended; i++) { each?.(); tick(1 / 30); } },
      };
      flyScript(plan.lesson, pilot, plan.until);
      // The lock picture reads better in NARO: China Hat Forward Short with the MAV page as SOI.
      if (s === 'mav-lock') ho.tap('chF');
      pilot.run(plan.extraS);
      if (!params.get('cam')) setCam(plan.cam); else setCam(cam);
      view?.syncNow();
      updateUi(true);
    }
  }

  return { mount, unmount() { bag.dispose(); } };
};

export default factory;
