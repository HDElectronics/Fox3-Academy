/**
 * [OWNER: page-strike] Shkval & Vikhr (#/strike, attack jets only: the Su-25T). The pilot works the Shkval TV
 * sight on the IT-23M (slew, ground-stabilise, zoom, target size, lock КС → АС), the laser (ЛД), and fires Vikhrs
 * holding lock and laser to impact, then flies a rocket / gun CCIP pass. Keys from PROCEDURES.su25t (S1).
 * Lessons: shkval, laser, vikhr (scored drill), ccip (scored pass), bombs (CCRP + CCIP, scored), sead (Kh-58 with
 * the L-081 pod, scored), threat (tank platoon under an SA-15, SPO-15 cues, scored), sortie (brief with a loadout,
 * low-level ingress to the IP, pop-up attack, egress; plan-view replay debrief, scored). Progress: strike:<lesson>:su25t.
 *
 * Sortie params (?lesson=sortie): ?shot=brief|ingress|attack|egress|debrief (scripted pre-rolls, never saved as
 * progress), ?loadout=<SU25T_LOADOUTS id>, ?sa11=1.
 *
 * URL params: ?lesson=<id>, ?shot=shkval|locked|vikhr-flight|impact|debrief|ccrp|sead|sead-lock|threat|threat-debrief
 * (pre-roll for screenshots), ?cam=chase|target|tv, ?touch=1 (show the touch pad on a fine pointer),
 * ?sa11=1 (SAM-threat lesson: add the SA-11 behind the SA-15).
 */
import './style.css';
import type { Page, PageContext, PageFactory } from '../../app/page';
import { AG_WEAPONS } from '../../data/agWeapons';
import type { Aircraft, AgMissReason, EntityId } from '../../sim/types';
import { D2R, R2D } from '../../sim/math';
import { LASER_LIMIT_S, shkvalAimPoint } from '../../sim/shkval';
import { ccrpSolution, predictImpact } from '../../sim/agWeapons';
import { samRingM } from '../../sim/sam';
import { Stage, WorldView, CameraRig, isWebGLAvailable, FramePriority } from '../../render';
import { AttackScene, ImpactTrail, ShkvalTv } from '../../render/attack';
import {
  h, cleanup, labLayout, consolePanel, segmented, button, coachBox, checklist, eventLog, readouts,
  callout, placard, bindKeys, disclosure, modal, select, toggle, type ModalHandle, type Tone,
} from '../../ui';
import { readTheme } from '../../ui/theme';
import {
  LESSONS, LESSON_ORDER, MISS_TEXT, STRIKE_CAVEATS, strikeWeaponsResolved, progressKey, scoreBombs, scoreCcip, scoreSead, scoreThreat, scoreVikhr,
  type Debrief, type LessonId, type ShotRecord, type StrikeSnap,
} from './lessons';
import { createSu25tCockpit } from './cockpit';
import { BUNKER_AT, START, TANKS_AT, TRUCKS_AT, buildScenario, centreOf, type Scenario } from './scenario';
import {
  IP_DIST_M, SORTIE_LOADOUTS, SORTIE_PROGRESS, SORTIE_TIME_S, SortieFlight, SortieTracker, navCue, scoreSortie, steerPoint, terrainFollowAlt, type EndReason,
} from './sortie';
import { AREA_VIEW, drawPlan, type MapPlan, type MapScene } from './sortieMap';
import { PLAN } from './sortie';
import { mountSortieDebrief } from './sortieDebrief';

const SHOTS = ['shkval', 'locked', 'vikhr-flight', 'impact', 'debrief', 'ccip', 'ccrp', 'sead', 'sead-lock', 'threat', 'threat-debrief'] as const;
type Shot = typeof SHOTS[number];
type Cam = 'chase' | 'target' | 'tv';
const SHOT_LESSON: Record<Shot, LessonId> = {
  shkval: 'shkval', locked: 'laser', 'vikhr-flight': 'vikhr', impact: 'vikhr', debrief: 'vikhr',
  ccip: 'ccip', ccrp: 'bombs', sead: 'sead', 'sead-lock': 'sead', threat: 'threat', 'threat-debrief': 'threat',
};
const SORTIE_SHOTS = ['brief', 'ingress', 'attack', 'egress', 'debrief'] as const;
type SortieShotParam = typeof SORTIE_SHOTS[number];
/** Sortie terrain following: height above the ground the autopilot holds (m), its limits and the key step. */
const AGL_DEFAULT = 60, AGL_MIN = 50, AGL_MAX = 3000, AGL_STEP = 50;
/** Sortie route and labels on the plan map. */
const SORTIE_PLAN: MapPlan = {
  start: PLAN.start, ip: PLAN.ip, target: PLAN.target,
  labels: [
    { text: 'Column', x: PLAN.target.x, z: PLAN.target.z, dx: 16, dy: 4, view: 'target' },
    { text: 'Bunker', x: PLAN.bunker.x, z: PLAN.bunker.z, dx: 12, dy: -8, view: 'target' },
    { text: 'Target', x: PLAN.target.x, z: PLAN.target.z, dx: 10, dy: 16, view: 'area', tone: 'hostile' },
  ],
};

const factory: PageFactory = (): Page => {
  const bag = cleanup();

  function mount(ctx: PageContext): void {
    const params = ctx.params;
    const lessonParam = params.get('lesson') as LessonId | null;
    const sortieShot = lessonParam === 'sortie' ? SORTIE_SHOTS.find(s => s === params.get('shot')) ?? null : null;
    const shotParam = sortieShot ? null : SHOTS.find(s => s === params.get('shot')) ?? null;
    let lesson: LessonId = shotParam ? SHOT_LESSON[shotParam] : lessonParam && LESSONS[lessonParam] ? lessonParam : 'shkval';
    let cam: Cam = (['chase', 'target', 'tv'] as const).find(c => c === params.get('cam')) ?? 'chase';

    // ------------------------------------------------------------------ state
    let sc!: Scenario;
    let me!: Aircraft;
    let evCursor = 0;
    let bunkerSizeFail = false, laserRunS = 0, lasedLongEnough = false, laserS = 0;
    let shots = new Map<EntityId, ShotRecord>();
    let salvos = 0, bestMissM: number | null = null;
    let done = new Set<string>();
    let ended = false, endAt: number | null = null, dived = false, closestM = Infinity;
    let result: ModalHandle | null = null;
    let uiClock = 0;
    const sa11 = params.get('sa11') === '1';
    // Bombs lesson: CCRP pass then CCIP dive. SEAD / SAM threat: Kh-58 square, exposure, SAM cues.
    let ccrpReleases = 0, ccrpPassesMissed = 0, ccrpMissM: number | null = null, ccipMissM: number | null = null, ccipBombs = 0;
    let bombPhase: 'ccrp' | 'ccip' = 'ccrp', phaseAt: number | null = null;
    let ccrpBombs = new Set<EntityId>();
    let armFired = 0, armLaunchRangeM: number | null = null, ringS = 0, samLaunches = 0, hitsTaken = 0;
    // Sortie: brief, flying, done; loadout; terrain-following height; the tracker and the debrief.
    let sortieState: 'brief' | 'flying' | 'done' = 'brief';
    let loadout = SORTIE_LOADOUTS.find(l => l.id === params.get('loadout'))?.id ?? 'vikhr';
    let sortieSa11 = params.get('sa11') === '1';
    let aglSet = AGL_DEFAULT, scripted = false;
    let tracker: SortieTracker | null = null;
    let sortieDebrief: { dispose(): void } | null = null;
    let sortieFlight: SortieFlight | null = null;
    bag.add(() => { tracker?.dispose(); sortieDebrief?.dispose(); });

    // ------------------------------------------------------------------ DOM
    const viewport = h('div', { class: 'strk-viewport' });
    const ck = createSu25tCockpit({
      bag, world: () => sc.world, me: () => me,
      log: (text, opts) => log.push(text, opts),
      canFire: () => !ended,
      nose: d => nose(d),
      onRelease: out => { salvos++; if (lesson === 'bombs' && out.some(x => x.type === 'fab250')) ccipBombs++; },
      onLockFail: reason => {
        const aim = shkvalAimPoint(sc.world, me);
        if (/size/i.test(reason) && aim && Math.hypot(aim.x - BUNKER_AT.x, aim.z - BUNKER_AT.z) < 90) bunkerSizeFail = true;
      },
    });
    const { tvBezel, hudBezel, rwrBezel, touchPad, keyList, fireBtn, laserBtn, armCursor } = ck;
    const { setMaster, toggleArm, enter, fire, armMarks } = ck;

    const ro = readouts({
      id: 'strk-ro', variant: 'glass',
      rows: [
        { id: 'rng', label: 'Slant range' }, { id: 'laser', label: 'Laser used', title: 'Laser heat, s. S1: the laser switches off at its limit and cools about as long as it was on (simplified)' },
        { id: 'store', label: 'Store' }, { id: 'tgt', label: 'Targets' }, { id: 'sam', label: 'SAM' },
      ],
    });

    const lessonSeg = segmented<LessonId>({
      id: 'strk-lesson', label: 'Lesson', fill: true, value: lesson,
      options: LESSON_ORDER.map(id => ({ value: id, label: LESSONS[id].short, title: LESSONS[id].title })),
      onChange: id => { lesson = id; restart(); },
    });
    const coach = coachBox({ id: 'strk-coach' });
    const sortieHost = h('div', { class: 'strk-sortie', id: 'strk-sortie' });
    const navBox = h('div', { class: 'strk-nav', role: 'status', 'aria-label': 'Steering cue (trainer)' });
    const briefMap = h('canvas', { class: 'strk-brief__map', role: 'img', 'aria-label': 'Sortie map: start, IP, target area and threat rings, north up' });
    const flyOverlayBtn = button({ label: 'Fly the sortie', variant: 'primary', id: 'strk-fly-map', onClick: () => startSortie(false) });
    const briefOverlay = h('div', { class: 'strk-brief' }, briefMap, h('div', { class: 'strk-brief__go' }, flyOverlayBtn.el));
    let steps = checklist({ steps: LESSONS[lesson].steps.map(s => ({ id: s.id, text: s.text, keys: s.keys })) });
    const stepsHost = h('div', null, steps.el);
    const log = eventLog({ id: 'strk-log', max: 30, title: 'Events' });
    const restartBtn = button({ label: 'Restart', size: 's', onClick: () => restart() });
    const endBtn = button({ label: 'End and debrief', size: 's', onClick: () => finish() });

    const controls = consolePanel({ title: 'Controls', id: 'strk-controls', children: ck.controlRows });
    const caveats = disclosure({
      title: 'Simplified and not verified', id: 'strk-caveats',
      content: h('div', null,
        callout({ kind: 'simplified', body: 'The jet flies itself: you steer with trainer keys. Vikhr, rockets and the gun use an arcade model tuned to teach the procedure.' }),
        h('ul', { class: 'strk-caveats' }, STRIKE_CAVEATS.map(c => h('li', null, c)))),
    });

    const camSeg = segmented<Cam>({
      id: 'strk-cam', ariaLabel: 'Camera', size: 's', value: cam,
      options: [{ value: 'chase', label: 'Chase' }, { value: 'target', label: 'Target' }, { value: 'tv', label: 'TV' }],
      onChange: c => setCam(c),
    });

    const lab = labLayout({
      id: 'strk-lab', class: 'strk-lab',
      header: { title: 'Shkval & Vikhr', lede: 'Find, lock and lase with the Shkval. Fire Vikhrs and hold the laser to impact.', meta: 'Su-25T · IT-23M · 9А4172 Vikhr' },
      viewport,
      strip: [tvBezel.el, hudBezel.el, rwrBezel.el, touchPad, h('div', { class: 'ui-strip-block strk-ro' }, placard('Attack'), ro.el)],
      console: [
        consolePanel({ title: 'Lesson', id: 'strk-lesson-panel', children: [lessonSeg.el, coach.el, sortieHost, stepsHost, h('div', { class: 'strk-row' }, restartBtn.el, endBtn.el), log.el] }).el,
        controls.el, keyList, caveats,
      ],
      mobileActions: ck.mobileActions,
    });
    if (params.get('touch') === '1') lab.el.classList.add('strk--touch');
    lab.overlay('tl', camSeg.el);
    lab.overlay('tr', navBox);
    lab.view.append(briefOverlay);
    const briefRo = new ResizeObserver(() => drawBrief());
    briefRo.observe(briefMap);
    bag.add(() => briefRo.disconnect());
    ctx.root.append(lab.el);

    // ------------------------------------------------------------------ 3D
    if (!isWebGLAvailable()) {
      viewport.append(h('p', { class: 'strk-no3d' }, 'WebGL is not available: the 3D view and the Shkval TV picture are off. The lesson still runs.'));
    }
    const stage = isWebGLAvailable() ? new Stage(viewport, { autoPause: 'render', maxDpr: 1.5, environment: { surface: 'land', grid: false, hazeKm: 60 }, ariaLabel: 'Attack run in 3D' }) : null;
    bag.add(() => stage?.dispose());
    let view: WorldView | null = null, scene: AttackScene | null = null, rig: CameraRig | null = null, tvCam: ShkvalTv | null = null, trail: ImpactTrail | null = null;

    sc = buildScenario(lesson);
    me = sc.me;
    const world = () => sc.world;
    if (stage) {
      view = new WorldView(stage, sc.world, { units: 'metric', layers: { dropLines: false, shadows: false } });
      scene = new AttackScene(stage, sc.world, view, { field: sc.field, shooterId: me.id });
      trail = new ImpactTrail(stage);
      bag.add(() => trail?.dispose());
      tvCam = new ShkvalTv(stage, { hidden: () => [...scene!.tvHidden(), trail!] });
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

    // ------------------------------------------------------------------ keys
    bag.add(bindKeys(ck.keys));

    // ------------------------------------------------------------------ actions
    /** Sortie: the arrows set the terrain-following height (Down = higher, like pulling the nose up). Elsewhere the cockpit flies the pitch. */
    function nose(d: -1 | 0 | 1): boolean {
      if (lesson !== 'sortie') return false;
      if (d) aglSet = Math.max(AGL_MIN, Math.min(AGL_MAX, aglSet + d * AGL_STEP));
      return true;
    }

    function setCam(c: Cam): void {
      cam = c;
      lab.el.classList.toggle('strk--tvbig', c === 'tv');
      if (c === 'tv') lab.view.append(tvBezel.el);
      else if (tvBezel.el.parentElement !== lab.strip) lab.strip.prepend(tvBezel.el);
      if (!rig) return;
      if (c === 'target') {
        const site = lesson === 'sead' ? world().samSites.get(sc.sams[0]!) : undefined;
        const p = site ? site.pos : centreOf(world(), sc.tanks) ?? { x: TANKS_AT.x, y: sc.groundM, z: TANKS_AT.z };
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
      tracker?.dispose(); tracker = null; sortieFlight = null;
      sortieDebrief?.dispose(); sortieDebrief = null;
      sc = buildScenario(lesson, 7, { sa11: lesson === 'sortie' ? sortieSa11 : sa11, loadout });
      me = sc.me;
      view?.setWorld(sc.world);
      scene?.setWorld(sc.world);
      scene?.setShooter(me.id);
      evCursor = 0;
      bunkerSizeFail = false; laserRunS = 0; lasedLongEnough = false; laserS = 0;
      shots = new Map(); salvos = 0; bestMissM = null; done = new Set(); ended = false; endAt = null; dived = false; closestM = Infinity;
      ccrpReleases = 0; ccrpPassesMissed = 0; ccrpMissM = null; ccipMissM = null; ccipBombs = 0; bombPhase = 'ccrp'; phaseAt = null;
      ccrpBombs = new Set(); armFired = 0; armLaunchRangeM = null; ringS = 0; samLaunches = 0; hitsTaken = 0;
      rwrBezel.el.hidden = !sc.sams.length;
      sortieState = 'brief'; aglSet = AGL_DEFAULT; scripted = false;
      const isSortie = lesson === 'sortie';
      if (isSortie) { tracker = new SortieTracker(sc.world, sc); sortieFlight = new SortieFlight(tracker); }
      briefOverlay.hidden = !isSortie;
      lab.el.classList.toggle('strk--plan', isSortie);
      navBox.hidden = true;
      sortieHost.replaceChildren();
      if (isSortie) renderBrief();
      ck.resetInputs();
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
      // Bombs: start 5° off the platoon so the director circle has something to show. SEAD: the SA-15 starts
      // outside the ±30° zone, to be found on the SPO-15.
      if (lesson === 'bombs') me.heading = me.cmd.heading = -5 * D2R;
      if (lesson === 'sead') me.heading = me.cmd.heading = -30 * D2R;
      setCam(cam);
      updateUi(true);
    }

    // ------------------------------------------------------------------ sortie: brief, flight, debrief
    function mapScene(): MapScene {
      const w = world();
      const sites: MapScene['sites'] = sc.sams.map(id => {
        const site = w.samSites.get(id)!;
        return { id, unitId: `${id}-radar`, name: site.callsign, x: site.pos.x, z: site.pos.z, ringM: samRingM(site.type), kind: 'sam' as const };
      });
      if (sc.aaa && tracker?.aaa) {
        const u = w.groundUnits.get(sc.aaa)!;
        sites.push({ id: sc.aaa, unitId: sc.aaa, name: 'ZSU-23-4', x: u.pos.x, z: u.pos.z, ringM: tracker.aaa.ringM, kind: 'aaa' });
      }
      const units = [...w.groundUnits.values()].filter(u => u.kind !== 'sam-site' && u.kind !== 'aaa').map(u => ({ id: u.id, kind: u.kind, x: u.pos.x, z: u.pos.z }));
      return { sites, units, plan: SORTIE_PLAN };
    }
    function drawBrief(): void {
      if (briefOverlay.hidden) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(briefMap.clientWidth * dpr)), hh = Math.max(1, Math.round(briefMap.clientHeight * dpr));
      if (briefMap.width !== w || briefMap.height !== hh) { briefMap.width = w; briefMap.height = hh; }
      const g = briefMap.getContext('2d');
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawPlan(g, w / dpr, hh / dpr, readTheme(), mapScene(), AREA_VIEW);
    }
    function renderBrief(): void {
      const ip = steerPoint('ingress'), tgt = steerPoint('attack');
      const toIp = navCue(me, ip);
      const ipToTgt = (Math.atan2(tgt.x - ip.x, -(tgt.z - ip.z)) * R2D + 360) % 360;
      const plan = SORTIE_LOADOUTS.find(l => l.id === loadout)!;
      const brg = (d: number) => `${String(Math.round(d) % 360).padStart(3, '0')}°`;
      const loadSel = select<string>({
        id: 'strk-loadout', label: 'Loadout', value: loadout,
        options: SORTIE_LOADOUTS.map(l => ({ value: l.id, label: l.name })),
        onChange: v => { loadout = v; restart(); },
      });
      const sa11Tog = toggle({ id: 'strk-sa11', label: 'SA-11 Buk (35 km ring)', style: 'switch', value: sortieSa11, onChange: v => { sortieSa11 = v; restart(); } });
      sortieHost.replaceChildren(h('div', { class: 'strk-brief__card' },
        placard('Brief'),
        h('ul', { class: 'strk-brief__list' },
          h('li', null, h('strong', null, 'Target: '), 'armour column (4 tanks, 2 APCs) and a bunker, one area.'),
          h('li', null, h('strong', null, 'Threats: '), `SA-15 Tor 6 km north of the target (12 km ring), ZSU-23-4 beside the column (2.5 km, trainer rule)${sortieSa11 ? ', SA-11 Buk 19 km north (35 km ring)' : ''}. The SPO-15 shows the SAM radars.`),
          h('li', null, h('strong', null, 'Ingress: '), `${brg(toIp.brgDeg)} for ${(toIp.rangeM / 1000).toFixed(0)} km to the IP at 50–100 m. IP to target ${brg(ipToTgt)}, ${(IP_DIST_M / 1000).toFixed(0)} km.`),
          h('li', null, h('strong', null, 'Egress: '), `back out past the IP, low. Time limit ${SORTIE_TIME_S / 60} min.`)),
        loadSel.el,
        h('p', { class: 'strk-brief__plan' }, plan.plan),
        sa11Tog.el,
        callout({ kind: 'simplified', body: 'Trainer steering cue and terrain following: Down raises and Up lowers the height above the ground (nose up / nose down, as in DCS). Flares on Delete (Su-25T binding not verified). The ZSU-23-4 is a simple gun-site rule.' }),
        button({ label: 'Fly the sortie', variant: 'primary', block: true, id: 'strk-fly', onClick: () => startSortie(false) }).el,
      ));
    }
    function startSortie(byScript: boolean): void {
      if (lesson !== 'sortie' || sortieState !== 'brief') return;
      sortieState = 'flying'; scripted = byScript;
      briefOverlay.hidden = true; navBox.hidden = false;
      lab.el.classList.remove('strk--plan');
      sortieHost.replaceChildren();
      log.push(`Loadout: ${SORTIE_LOADOUTS.find(l => l.id === loadout)!.name}. Fly low to the IP.`, { t: world().t });
      updateUi(true);
    }
    /** Terrain following (trainer autopilot): hold the set height above the highest ground over the next 2 km. */
    function followTerrain(): void { me.cmd.altitude = terrainFollowAlt(world(), me, aglSet); }
    function sortieFinish(reason: EndReason): void {
      const w = world();
      if (!tracker || !sortieFlight || sortieState !== 'flying') return;
      sortieState = 'done'; ended = true; endAt = null;
      sortieFlight.finish(reason);
      const summary = tracker.summary(reason, loadout);
      const score = scoreSortie(summary);
      if (score.passed && !scripted) ctx.app.setProgress(SORTIE_PROGRESS, true);
      navBox.hidden = true;
      lab.el.classList.add('strk--plan');
      sortieHost.replaceChildren();
      sortieDebrief?.dispose();
      sortieDebrief = mountSortieDebrief({
        view: lab.view, panel: sortieHost, frames: w.recording, scene: mapScene(), meId: me.id, summary, score, markers: tracker.markers,
        onAgain: () => { restart(); startSortie(false); }, onBrief: () => restart(),
      });
      checkSteps();
      coach.set(`${score.title}: ${score.score} / 100${scripted ? ' (scripted demo, not saved)' : ''}`, 'Scrub the replay, then read the coaching below.', score.passed ? 'ok' : 'caution');
    }
    /** Steering cue over the 3D view (trainer aid, not a DCS display). */
    function updateNav(): void {
      if (!tracker || sortieState !== 'flying') return;
      const w = world();
      const sp = steerPoint(tracker.phase, tracker.egressAt != null);
      const c = navCue(me, sp);
      const agl = me.pos.y - w.groundHeight(me.pos.x, me.pos.z);
      const turn = Math.abs(c.turnDeg) < 2 ? 'on course' : `${c.turnDeg > 0 ? 'right' : 'left'} ${Math.abs(c.turnDeg).toFixed(0)}°`;
      const left = Math.max(0, SORTIE_TIME_S - w.t);
      navBox.replaceChildren(
        h('div', { class: 'strk-nav__row' }, h('span', { class: 'strk-nav__k' }, tracker.phase === 'ingress' ? 'Ingress' : tracker.phase === 'attack' ? 'Attack' : 'Egress'),
          h('span', null, `${sp.name} ${String(Math.round(c.brgDeg) % 360).padStart(3, '0')}° ${(c.rangeM / 1000).toFixed(1)} km`)),
        h('div', { class: 'strk-nav__row' }, h('span', { class: 'strk-nav__k' }, 'Steer'), h('span', { class: Math.abs(c.turnDeg) < 2 ? 'is-ok' : undefined }, turn)),
        h('div', { class: 'strk-nav__row' }, h('span', { class: 'strk-nav__k' }, 'РВ'), h('span', { class: agl < 30 ? 'is-warn' : undefined }, `${Math.round(agl)} m (set ${aglSet})`)),
        h('div', { class: 'strk-nav__row' }, h('span', { class: 'strk-nav__k' }, 'Time'), h('span', null, `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')} left`)),
      );
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
        ccrpActive: ccrpSolution(w, me).active, ccrpHeld: ag.ccrpHeld, ccrpReleases, ccipBombs,
        armDetecting: ag.arm.detecting, emittersInZone: armMarks().filter(m => m.code).length, emitterLocked: !!ag.arm.emitterId,
        pr: w.canAgLaunch(me.id).pr, armFired,
        samsKilled: sc.sams.filter(id => !w.samSites.get(id)?.alive).length,
        tanksKilled: sc.tanks.filter(id => !w.groundUnits.get(id)?.alive).length,
        ...(lesson === 'sortie' ? {
          sortiePhase: sortieState === 'brief' ? 'brief' as const : sortieState === 'done' ? 'done' as const : tracker?.phase,
          ipReached: tracker?.ipAt != null, aglM: me.pos.y - w.groundHeight(me.pos.x, me.pos.z),
        } : {}),
      };
    }

    function tick(dt: number): void {
      const w = world();
      if (lesson === 'sortie' && sortieState === 'done') return;
      if (lesson === 'sortie' && sortieState === 'brief') { uiClock += dt; if (uiClock > 0.5) { uiClock = 0; updateUi(false); } return; }
      if (lesson === 'sortie' && sortieState === 'flying' && me.alive) followTerrain();
      if (lesson === 'sortie') sortieFlight?.step(dt);
      else if (!ended || endAt != null) w.step(dt);
      const sh = me.ag!.shkval;
      if (sh.laserOn) { laserRunS += dt; laserS += dt; if (laserRunS >= 5) lasedLongEnough = true; } else laserRunS = 0;
      ck.step(dt);
      if (!ended && me.alive && insideRing()) ringS += dt;
      readEvents();
      flyLesson();
      checkSteps();
      // Missions end once own weapons and SAMs aimed at the jet are resolved; a time-out or a loss ends at once.
      if (lesson === 'sortie') {
        if (sortieFlight?.readyToFinish()) sortieFinish(sortieFlight.reason);
      } else if (endAt != null && w.t >= endAt && strikeWeaponsResolved(me.id, w.agWeapons.values(), w.samMissiles.values())) { endAt = null; finish(); }
      uiClock += dt;
      if (uiClock > 0.1) { uiClock = 0; updateUi(false); }
    }

    /** Inside the threat ring of a live SAM site. */
    function insideRing(): boolean {
      for (const id of sc.sams) {
        const s = world().samSites.get(id);
        if (s?.alive && me.pos.distanceTo(s.pos) <= samRingM(s.type)) return true;
      }
      return false;
    }
    /** Nearest distance (m, horizontal) from an impact to a unit of the list, dead or alive. */
    function missTo(ids: readonly EntityId[], p: readonly number[]): number | null {
      let best: number | null = null;
      for (const id of ids) {
        const u = world().groundUnits.get(id); if (!u) continue;
        const d = Math.hypot(u.pos.x - p[0]!, u.pos.z - p[2]!);
        if (best == null || d < best) best = d;
      }
      return best;
    }
    /** Bombs lesson: set up the level CCRP leg again, or the CCIP dive on the trucks. */
    function bombLeg(kind: 'ccrp' | 'ccip'): void {
      const w = world();
      const st = START.bombs;
      if (kind === 'ccrp') {
        me.pos.set(TANKS_AT.x + 900, sc.groundM + st.aglM, TANKS_AT.z + st.rangeM);
        me.heading = me.cmd.heading = -5 * D2R; me.cmd.altitude = sc.groundM + st.aglM;
        me.vel.set(Math.sin(me.heading) * st.speed, 0, -Math.cos(me.heading) * st.speed);
        ck.resetInputs();
        log.push('Repositioned for another CCRP leg', { t: w.t });
        return;
      }
      bombPhase = 'ccip';
      if (me.ag!.shkval.laserOn) w.laser(me.id, false);
      if (me.ag!.shkval.on) w.shkvalPower(me.id, false);
      const c = centreOf(w, sc.trucks) ?? { x: TRUCKS_AT.x, y: sc.groundM, z: TRUCKS_AT.z };
      me.pos.set(c.x, sc.groundM + START.ccip.aglM, c.z + START.ccip.rangeM);
      me.heading = me.cmd.heading = 0; me.cmd.altitude = sc.groundM + START.ccip.aglM; me.cmd.speed = START.ccip.speed;
      me.vel.set(0, 0, -START.ccip.speed);
      ck.resetInputs();
      dived = false; closestM = Infinity;
      log.push('CCIP pass: Shkval off. Push the nose down onto the trucks (Up arrow)', { t: w.t });
    }

    function flyLesson(): void {
      const w = world();
      if (lesson === 'bombs') {
        if (ended) return;
        if (bombPhase === 'ccrp') {
          const sol = ccrpSolution(w, me);
          const flying = [...w.agWeapons.values()].some(x => x.alive);
          if (ccrpReleases > 0 && !flying) { phaseAt ??= w.t + 2; if (w.t >= phaseAt) { phaseAt = null; bombLeg('ccip'); } }
          else if (ccrpReleases === 0 && (sol.passed || me.pos.z < TANKS_AT.z - 1500)) {
            ccrpPassesMissed++;
            log.push('Release point passed without a release', { t: w.t, tone: 'caution' });
            bombLeg('ccrp');
          }
          return;
        }
      }
      if (lesson === 'sortie') return;
      if (lesson === 'sead' || lesson === 'threat') {
        if (ended) return;
        const resolved = strikeWeaponsResolved(me.id, w.agWeapons.values(), w.samMissiles.values());
        const win = lesson === 'sead' ? sc.sams.every(id => !w.samSites.get(id)?.alive) : sc.tanks.every(id => !w.groundUnits.get(id)?.alive);
        if (endAt == null && (!me.alive || (win && resolved) || w.t > 300)) endAt = w.t + (me.alive ? 2 : 3);
        return;
      }
      const tgt = lesson === 'ccip' || lesson === 'bombs' ? centreOf(w, sc.trucks) ?? { x: TRUCKS_AT.x, y: sc.groundM, z: TRUCKS_AT.z } : { x: TANKS_AT.x, y: sc.groundM, z: TANKS_AT.z };
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
      // CCIP pass: the pilot flies the dive (Up nose down, Down nose up, Left / Right). The pass ends once the jet
      // is past the trucks or at the time limit; weapons still in flight resolve before the debrief.
      closestM = Math.min(closestM, range);
      if (!dived && range < 1500) dived = true;
      if (endAt == null && ((dived && range > closestM + 300) || w.t > 150)) {
        endAt = w.t + (lesson === 'bombs' ? 12 : 4);
        log.push(dived ? 'Past the target: pass complete' : 'Time up', { t: w.t });
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
            if (e.ccrp) { ccrpReleases++; ccrpBombs.add(e.weaponId); log.push('CCRP: bomb released automatically', { t: e.t, tone: 'ok' }); }
            if (e.weapon === 'kh58') { armFired++; armLaunchRangeM ??= e.range; }
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
            if (lesson === 'bombs' && e.weapon === 'fab250') {
              const d = ccrpBombs.has(e.weaponId) ? missTo(sc.tanks, e.pos) : missTo(sc.trucks, e.pos);
              if (d != null) {
                if (ccrpBombs.has(e.weaponId)) ccrpMissM = ccrpMissM == null ? d : Math.min(ccrpMissM, d);
                else ccipMissM = ccipMissM == null ? d : Math.min(ccipMissM, d);
                log.push(`Bomb impact ${Math.round(d)} m from the nearest target`, { t: e.t, tone: d <= 25 ? 'ok' : 'caution' });
              }
            }
            if (lesson === 'ccip') {
              for (const id of sc.trucks) {
                const u = w.groundUnits.get(id); if (!u) continue;
                const d = Math.hypot(u.pos.x - e.pos[0], u.pos.z - e.pos[2]);
                if (bestMissM == null || d < bestMissM) bestMissM = d;
              }
            }
            break;
          }
          case 'ground-kill': {
            const u = w.groundUnits.get(e.targetId), site = w.samSites.get(e.targetId);
            if (site) log.push(`${site.callsign} site destroyed: it stops emitting`, { t: e.t, tone: 'ok' });
            else log.push(`${u?.name ?? 'Target'} destroyed`, { t: e.t, tone: 'ok' });
            break;
          }
          case 'sam':
            if (e.targetId !== me.id) break;
            if (e.what === 'track') log.push(`SPO-15: ${w.samSites.get(e.siteId)?.callsign ?? 'SAM'} lock`, { t: e.t, tone: 'caution' });
            if (e.what === 'launch') { samLaunches++; log.push(`SPO-15: launch, ${w.samSites.get(e.siteId)?.callsign ?? 'SAM'}. Notch or leave the ring`, { t: e.t, tone: 'warning' }); }
            if (e.what === 'lost') log.push(`SAM track broken (${e.why})`, { t: e.t, tone: 'ok' });
            break;
          case 'hit': if (e.targetId === me.id) { hitsTaken++; log.push('Hit by a SAM', { t: e.t, tone: 'warning' }); } break;
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
      if (lesson === 'sortie') {
        if (sortieState === 'flying') sortieFinish(tracker?.endReason() ?? 'pilot');
        return;
      }
      ended = true;
      const w = world();
      const def = LESSONS[lesson];
      if (!def.scored) return;
      for (const s of shots.values()) if (s.result === 'flying') { s.result = 'miss'; s.reason = 'timeout'; }
      const dead = (ids: readonly EntityId[]) => ids.filter(id => !w.groundUnits.get(id)?.alive).length;
      const samsKilled = sc.sams.filter(id => !w.samSites.get(id)?.alive).length;
      const d: Debrief = lesson === 'vikhr'
        ? scoreVikhr({ shots: [...shots.values()].filter(s => s.weapon === 'vikhr'), tanks: sc.tanks.length, tanksKilled: dead(sc.tanks), laserS })
        : lesson === 'bombs'
          ? scoreBombs({ ccrpAuto: ccrpReleases > 0, ccrpMissM, ccrpPassesMissed, ccipMissM, kills: dead(sc.tanks) + dead(sc.trucks) })
          : lesson === 'sead'
            ? scoreSead({
              killed: samsKilled > 0, fired: armFired, launchRangeM: armLaunchRangeM, ringM: samRingM('sa15'),
              band: { min: AG_WEAPONS.kh58.rangeKm.min * 1000, max: AG_WEAPONS.kh58.rangeKm.max * 1000 }, ringS, shotDown: !me.alive,
            })
            : lesson === 'threat'
              ? scoreThreat({ tanks: sc.tanks.length, tanksKilled: dead(sc.tanks), samsKilled, hitsTaken: Math.max(hitsTaken, me.alive ? 0 : 1), ringS, samLaunches })
              : scoreCcip({ salvos, kills: dead(sc.trucks), bestMissM });
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
    function renderTv(): void {
      ck.draw(tvCam, sc.sams.length > 0);
      trail?.update(world().t, me.alive ? me.pos : null, ccipPoint());
    }
    /** The CCIP ground point of the selected unguided weapon (the HUD pipper), for the impact trail. */
    function ccipPoint() {
      const ag = me.ag!, sel = ag.selected;
      if (!me.alive || ag.master === 'nav' || !sel || ccrpSolution(world(), me).active) return null;
      return predictImpact(world(), me, sel);
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
      ro.set('store', ck.storeText());
      const list = lesson === 'ccip' || (lesson === 'bombs' && bombPhase === 'ccip') ? sc.trucks : sc.tanks;
      const samTxt = sc.sams.map(id => { const s = w.samSites.get(id)!; return `${s.callsign.split(' ')[0]} ${s.alive ? 'up' : 'down'}`; }).join(', ');
      const live = (ids: readonly EntityId[]) => ids.filter(id => w.groundUnits.get(id)?.alive).length;
      ro.set('tgt', lesson === 'sead' ? '—' : lesson === 'sortie'
        ? `${live([...sc.tanks, ...sc.apcs])}/${sc.tanks.length + sc.apcs.length} · bunker ${w.groundUnits.get(sc.bunker)?.alive ? "up" : "down"}`
        : `${live(list)} of ${list.length} ${list === sc.trucks ? 'trucks' : 'tanks'}`);
      ro.set('sam', samTxt || '—');
      ck.updateLamps();
      const cur = def.steps.find(s => !done.has(s.id));
      steps.setCurrent(cur?.id ?? null);
      let tone: Tone | undefined;
      let text = cur ? cur.text : def.scored ? 'Finish the attack; the debrief follows.' : 'Lesson complete.';
      let why = check.reason && ag.master !== 'nav' && sel ? check.reason : def.goal;
      if (check.pr) { tone = 'ok'; why = 'ПР: launch authorised.'; }
      const flying = [...w.agWeapons.values()].some(x => x.alive && x.guided && x.shooterId === me.id && x.type === 'vikhr');
      if (flying) { text = 'Vikhr in flight: hold the lock and the laser until impact.'; tone = 'caution'; why = 'Beam-riding: the missile follows the Shkval line of sight to the end.'; }
      const ccrp = ccrpSolution(w, me);
      if (ccrp.active && lesson === 'bombs' && bombPhase === 'ccrp') {
        why = ag.ccrpHeld
          ? `Release held. ${ccrp.inCircle ? 'Keel in the circle' : `Steer ${ccrp.errDeg! > 0 ? 'right' : 'left'} into the circle`}; ${ccrp.ttrS! > 10 ? 'the arrow starts 10 s before release' : `release in ${Math.max(0, Math.ceil(ccrp.ttrS!))} s`}.`
          : 'CCRP ready: hold Space until the bomb releases itself.';
        tone = ccrp.inCircle ? 'ok' : 'caution';
      }
      const samOnMe = [...w.samMissiles.values()].some(m => m.alive && m.guided && m.targetId === me.id);
      if (samOnMe) { text = `SAM launch: notch it. Put the SAM at 3 or 9 o'clock and descend, or turn out of the ring.`; why = 'Radar guided: the missile needs the site track to impact. Flares do not decoy it.'; tone = 'warning'; }
      else if (insideRing() && !ended) { why = 'Inside the SAM ring: every second counts against you.'; tone = 'caution'; }
      const diving = lesson === 'ccip' || (lesson === 'bombs' && bombPhase === 'ccip');
      if (diving && !ended && !samOnMe && me.pos.y - w.groundHeight(me.pos.x, me.pos.z) < 300 && me.vel.y < -5) {
        text = 'Pull up: Down arrow.'; why = 'Below 300 m and descending. Pull the nose up now.'; tone = 'warning';
      }
      if (lesson === 'sortie') {
        if (sortieState === 'done') return;
        updateNav();
        if (sortieState === 'brief') { text = 'Brief: pick the loadout, read the threats, then fly.'; why = def.goal; tone = undefined; }
        else if (!samOnMe && tracker?.aaa && tracker.aaa.intervals.at(-1)?.to === null) { why = 'Inside the ZSU-23-4 envelope: get out of gun range.'; tone = 'warning'; }
      }
      if (force || text) coach.set(text, why, tone);
    }

    // ------------------------------------------------------------------ start, pre-rolls
    restart();
    if (shotParam) preroll(shotParam);
    if (sortieShot) sortiePreroll(sortieShot);
    if (params.get('cam') === 'target' || params.get('cam') === 'tv') setCam(cam);

    /** Scripted sortie for screenshots: a pilot who flies the plan with Vikhrs (never saved as progress). */
    function sortiePreroll(s: SortieShotParam): void {
      if (s === 'brief' || !tracker) { requestAnimationFrame(() => drawBrief()); return; }
      startSortie(true);
      const w = world(), id = me.id, tr = tracker;
      let egressing = false;
      const steerTo = (p: { x: number; z: number }) => { me.cmd.heading = Math.atan2(p.x - me.pos.x, -(p.z - me.pos.z)); };
      const fly = (sec: number, stop: () => boolean = () => false) => {
        for (let i = 0; i < sec * 30 && !stop() && sortieState === 'flying'; i++) {
          const nearIp = Math.hypot(me.pos.x - steerPoint('ingress').x, me.pos.z - steerPoint('ingress').z) < 1500;
          steerTo(egressing ? steerPoint('egress', nearIp || tgtRange() > IP_DIST_M) : tr.phase === 'ingress' ? steerPoint('ingress') : steerPoint('attack'));
          tick(1 / 30);
        }
      };
      const tgtRange = () => Math.hypot(me.pos.x - steerPoint('attack').x, me.pos.z - steerPoint('attack').z);
      if (s === 'ingress') { fly(40); view?.syncNow(); updateUi(true); return; }
      fly(200, () => tr.phase !== 'ingress');
      aglSet = 600;
      fly(120, () => tgtRange() < 10400);
      setMaster('ag'); w.selectAgWeapon(id, 'vikhr'); w.shkvalPower(id, true); w.shkvalZoom(id, 1); w.shkvalZoom(id, 1);
      const shootAt = (tid: EntityId) => {
        const u = w.groundUnits.get(tid)!;
        if (me.ag!.shkval.lockedUnitId) w.shkvalUnlock(id);
        w.shkvalPointAt(id, u.pos); w.shkvalStabilise(id, true); w.shkvalLock(id);
        if (!me.ag!.shkval.laserOn) w.laser(id, true);
        fly(30, () => w.canAgLaunch(id).pr);
        fire();
      };
      shootAt(sc.tanks[0]!);
      if (s === 'attack') { fly(5); setCam('tv'); view?.syncNow(); updateUi(true); return; }
      fly(40, () => ![...w.agWeapons.values()].some(x => x.alive));
      shootAt(sc.tanks[1]!);
      fly(40, () => ![...w.agWeapons.values()].some(x => x.alive));
      w.laser(id, false); w.shkvalPower(id, false);
      egressing = true; aglSet = AGL_DEFAULT;
      if (s === 'egress') { fly(30); view?.syncNow(); updateUi(true); return; }
      fly(400, () => sortieState !== 'flying');
      view?.syncNow();
    }

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
      } else if (s === 'ccip') {
        // Push over until the pipper reaches the trucks, then let go and hold the dive angle.
        setMaster('ag'); w.selectAgWeapon(id, 's8');
        const trucksAt = () => centreOf(w, sc.trucks) ?? { x: TRUCKS_AT.x, y: sc.groundM, z: TRUCKS_AT.z };
        const toTrucks = () => { const c = trucksAt(); return Math.hypot(c.x - me.pos.x, c.z - me.pos.z); };
        for (let i = 0; i < 1800 && toTrucks() > 4000; i++) tick(1 / 30);
        ck.nose(-1);
        for (let i = 0; i < 300; i++) {
          const p = predictImpact(w, me, 's8'), c = trucksAt();
          if (p && Math.hypot(p.x - me.pos.x, p.z - me.pos.z) <= toTrucks()) break;
          me.cmd.heading = Math.atan2(c.x - me.pos.x, -(c.z - me.pos.z));
          tick(1 / 30);
        }
        ck.nose(0);
        run(1.5);
      } else if (s === 'ccrp') {
        setMaster('ag'); w.selectAgWeapon(id, 'fab250'); w.shkvalPower(id, true);
        w.shkvalPointAt(id, tank.pos); w.shkvalStabilise(id, true); w.shkvalZoom(id, 1); w.laser(id, true);
        fire();
        me.heading = me.cmd.heading = Math.atan2(tank.pos.x - me.pos.x, -(tank.pos.z - me.pos.z)) + 1 * D2R;
        for (let i = 0; i < 3600 && (ccrpSolution(w, me).ttrS ?? 0) > 6; i++) tick(1 / 30);
      } else if (s === 'sead' || s === 'sead-lock') {
        setMaster('ag'); w.selectAgWeapon(id, 'kh58'); toggleArm();
        const site = w.samSites.get(sc.sams[0]!)!;
        me.heading = me.cmd.heading = Math.atan2(site.pos.x - me.pos.x, -(site.pos.z - me.pos.z)) - 8 * D2R;
        run(1);
        const m = armMarks()[0];
        if (m) { armCursor.x = m.xDeg - (s === 'sead' ? 2.5 : 0); armCursor.y = m.yDeg + (s === 'sead' ? 1.5 : 0); }
        if (s === 'sead-lock') { enter(); run(1); }
      } else if (s === 'threat' || s === 'threat-debrief') {
        setMaster('ag');
        if (s === 'threat') {
          w.selectAgWeapon(id, 'vikhr');
          for (let i = 0; i < 9000 && ![...w.samMissiles.values()].some(x => x.alive && w.t - x.launchedAt > 2.5); i++) tick(1 / 30);
          setCam('chase');
        } else {
          w.selectAgWeapon(id, 'kh58'); toggleArm(); run(0.5);
          w.armLock(id);
          fire();
          for (let i = 0; i < 3600 && [...w.agWeapons.values()].some(x => x.alive); i++) tick(1 / 30);
          w.selectAgWeapon(id, 'vikhr'); w.shkvalPower(id, true); w.shkvalZoom(id, 1); w.shkvalZoom(id, 1);
          for (const tid of sc.tanks) {
            const u = w.groundUnits.get(tid)!;
            if (!u.alive || ended) continue;
            if (me.ag!.shkval.lockedUnitId) w.shkvalUnlock(id);
            w.shkvalPointAt(id, u.pos); w.shkvalStabilise(id, true); w.shkvalLock(id); w.laser(id, true);
            for (let i = 0; i < 4000 && !w.canAgLaunch(id).pr; i++) tick(1 / 30);
            fire();
            for (let i = 0; i < 1800 && [...w.agWeapons.values()].some(x => x.alive); i++) tick(1 / 30);
          }
          run(3);
          finish();
        }
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
