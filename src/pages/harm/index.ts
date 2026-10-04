/**
 * [OWNER: page-harm] HARM & SEAD (#/harm, the F/A-18C only). The pilot learns the radars the AGM-88C hunts, watches
 * how a HARM flies, then works the Hornet's HARM as DCS presents it: the stores page, the HARM format (SP, TOO with the
 * class filter and hand-off, PB with the UFC code, WPDSG and the HUD pull-up cues), Pullback, and a live SEAD run.
 * Every press is explained in the "What that did" log. Page-local logic (avionics.ts, sim.ts), drawing (ddi.ts,
 * ew.ts, hud.ts, ufc.ts), 3D (scene3d.ts, gallery3d.ts, models.ts). Facts: docs/research/fa18c-harm.md; trainer
 * rules in HARM_CAVEATS. Progress: harm:<lesson>:fa18c. Practice missions: public/missions.
 *
 * URL params: ?lesson=radars|homing|sp|too|pb|pullback|live, ?shot=radars|homing|sp|too|too-hoff|pb-ufc|pb-cue|
 * pullback|live (scripted pre-rolls for screenshots, never saved as progress), ?cam=chase|harm|site|top.
 */
import './cockpit.css';
import './style.css';
import type { Page, PageContext, PageFactory } from '../../app/page';
import { Stage, isWebGLAvailable } from '../../render';
import {
  h, cleanup, labLayout, consolePanel, segmented, button, coachBox, checklist, eventLog, callout, placard, bindKeys,
  disclosure, modal, screenBezel, type ModalHandle, type Tone,
} from '../../ui';
import { HarmAvionics, type ActionResult } from './avionics';
import { ALIC_TABLE, CLASS_MEANING, HARM_CAVEATS, SYSTEMS, SYSTEM_ORDER } from './data';
import { HarmDdi } from './ddi';
import { EwPage, createRwrLamps } from './ew';
import { HornetHud } from './hud';
import { createUfc } from './ufc';
import { HarmScene } from './scene3d';
import { mountGallery, type GalleryHandle } from './gallery3d';
import { buildBriefing } from './briefing';
import { HarmSim, bearingDeg, wrapDeg, type SimSetup } from './sim';
import {
  FILMS, FILM_ORDER, HARM_LESSON_ORDER, LESSONS, MISSIONS, progressKey, type FilmId, type HarmLessonId, type HarmSnap,
} from './lessons';
import type { HarmClass, Osb, Pullup, SystemId, VehicleId } from './types';

const SHOTS = ['radars', 'homing', 'sp', 'too', 'too-hoff', 'pb-ufc', 'pb-cue', 'pullback', 'live'] as const;
type Shot = typeof SHOTS[number];
type Cam = 'chase' | 'harm' | 'site' | 'top';
const SHOT_LESSON: Record<Shot, HarmLessonId> = {
  radars: 'radars', homing: 'homing', sp: 'sp', too: 'too', 'too-hoff': 'too', 'pb-ufc': 'pb', 'pb-cue': 'pb', pullback: 'pullback', live: 'live',
};
const NM = 1852;
const R2D = 180 / Math.PI;

/** Film setups for the homing lesson. */
function filmSetup(f: FilmId): SimSetup {
  const jet = { x: 0, z: 0, altFt: 25000, headingDeg: 0, speedKt: 450 };
  if (f === 'pb' || f === 'ac') return { jet, sites: [{ id: 'sa11', name: 'SA-11', system: 'sa11', at: { x: 0, z: -(f === 'ac' ? 40 : 30) * NM } }] };
  return { jet, sites: [{ id: 'sa6', name: 'SA-6', system: 'sa6', at: { x: 0, z: -22 * NM } }] };
}

const KEYS: [string, string][] = [
  ['M', 'Master Arm ARM / SAFE'],
  ['1 / 2', 'Master mode A/A / A/G'],
  ['I', 'HARM Sequence: step emitters (SP) or targets (TOO)'],
  ['C', 'Cage/Uncage: hand off (TOO), back to the highest threat (SP)'],
  ['RAlt+Space', 'Weapon release, the DCS key (hold it through a PB pull-up). On Windows the browser cannot have Alt+Space: Windows opens the window menu'],
  ['R (hold)', 'Weapon release in the browser, same as RAlt+Space; or hold the WEAPON RELEASE button'],
  ['RAlt+/', 'Sensor Control right: TDC to the HARM display'],
  ['E', 'Chaff (dispense switch forward)'],
  ['Left / Right arrow', 'Turn (trainer autopilot)'],
  ['Down / Up arrow', 'Nose up / nose down (trainer autopilot)'],
];

const factory: PageFactory = (): Page => {
  const bag = cleanup();

  function mount(ctx: PageContext): void {
    const params = ctx.params;
    const shot = SHOTS.find(s => s === params.get('shot')) ?? null;
    const lessonParam = params.get('lesson') as HarmLessonId | null;
    let lesson: HarmLessonId = shot ? SHOT_LESSON[shot] : lessonParam && HARM_LESSON_ORDER.includes(lessonParam) ? lessonParam : 'radars';
    let cam: Cam = (['chase', 'harm', 'site', 'top'] as const).find(c => c === params.get('cam')) ?? 'chase';
    const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ------------------------------------------------------------------ state
    let sim = new HarmSim({ jet: { x: 0, z: 0, altFt: 25000, headingDeg: 0, speedKt: 450 }, sites: [] });
    let av = new HarmAvionics(sim, []);
    let evCursor = 0, uiClock = 0, stepIdx = 0, timeScale = 1;
    let ended = false, scripted = false;
    let result: ModalHandle | null = null;
    let film: FilmId | null = null, filmT = 0, filmLaunched = false, filmQuiet = false;
    const visited = new Set<SystemId>(), watched = new Set<FilmId>();
    let kills: VehicleId[] = [], misses: string[] = [], lockSeen = false;
    let pullupChosen: Pullup | null = null;
    let system: SystemId = 'sa6';

    // ------------------------------------------------------------------ displays
    const ddiCanvas = h('canvas', { class: 'harm-ddi-canvas', 'aria-label': 'Right DDI: stores page and HARM format. Click a pushbutton.' }) as HTMLCanvasElement;
    const ewCanvas = h('canvas', { class: 'harm-ddi-canvas', 'aria-label': 'Left DDI: EW page. Click HUD (pushbutton 14).' }) as HTMLCanvasElement;
    const hudCanvas = h('canvas', { class: 'harm-hud-canvas', 'aria-label': 'Head-up display' }) as HTMLCanvasElement;
    const ddi = new HarmDdi(ddiCanvas, n => onOsb(n));
    const ew = new EwPage(ewCanvas, n => { if (n === 14) act(av.toggleEwHud(), 'EW page'); });
    const hud = new HornetHud(hudCanvas);
    const lamps = createRwrLamps();
    const ufc = createUfc({ id: 'harm-ufc', onKey: k => act(av.ufcKey(k), `UFC ${k}`) });
    bag.add(() => { ddi.dispose(); ew.dispose(); hud.dispose(); ufc.dispose(); });

    const hudBezel = screenBezel({ label: 'HUD', id: 'harm-hud', content: hudCanvas, aspect: '4 / 3', class: 'harm-hud-bezel' });
    const ewBezel = screenBezel({ label: 'LEFT DDI · EW', id: 'harm-ew', content: ewCanvas, aspect: '1', class: 'harm-ddi-bezel' });
    const ddiBezel = screenBezel({ label: 'RIGHT DDI · STORES', id: 'harm-ddi', content: ddiCanvas, aspect: '1', class: 'harm-ddi-bezel' });

    // Left panel: Master Arm, master mode. HSI: waypoint and WPDSG.
    const armBtn = button({ label: 'MASTER ARM: SAFE', size: 's', onClick: () => act(av.toggleMasterArm(), 'Master Arm') });
    const aaBtn = button({ label: 'A/A', size: 's', onClick: () => act(av.setMaster('AA'), 'A/A') });
    const agBtn = button({ label: 'A/G', size: 's', onClick: () => act(av.setMaster('AG'), 'A/G') });
    // Weapon release, held: RAlt+Space in DCS. Windows keeps Alt+Space for the window menu, so the browser also takes R
    // and this button (trainer substitutes).
    const releaseBtn = button({ label: 'WEAPON RELEASE', variant: 'primary', size: 's', lamp: true, keys: 'R', title: 'Hold to release (RAlt+Space in DCS)' });
    bag.on(releaseBtn.el, 'pointerdown', (e: Event) => { (e as PointerEvent).preventDefault(); release(true); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) bag.on(releaseBtn.el, ev, () => release(false));
    const wpText = h('span', { class: 'harm-hsi__wp', 'aria-live': 'polite' }, '—');
    const hsi = h('div', { class: 'ui-strip-block harm-panel' },
      placard('Stick'), releaseBtn.el,
      placard('RWR lamps'), lamps.el, placard('Left panel'), h('div', { class: 'harm-panel__row' }, armBtn.el), h('div', { class: 'harm-panel__row' }, aaBtn.el, agBtn.el),
      placard('HSI · WYPT'),
      h('div', { class: 'harm-panel__row' },
        button({ label: '◄', size: 's', ariaLabel: 'Previous waypoint', onClick: () => act(av.selectWaypoint(-1), 'HSI') }).el,
        wpText,
        button({ label: '►', size: 's', ariaLabel: 'Next waypoint', onClick: () => act(av.selectWaypoint(1), 'HSI') }).el),
      button({ label: 'WPDSG', size: 's', onClick: () => act(av.wpdsg(), 'HSI WPDSG') }).el,
      callout({ kind: 'simplified', body: 'Click the DDI pushbuttons on the displays; these panels stand in for the cockpit switches.' }));
    const ufcBlock = h('div', { class: 'ui-strip-block harm-ufc-block' }, placard('UFC'), ufc.el);

    // ------------------------------------------------------------------ console
    const lessonSeg = segmented<HarmLessonId>({
      id: 'harm-lesson', label: 'Lesson', fill: true, value: lesson,
      options: HARM_LESSON_ORDER.map(id => ({ value: id, label: LESSONS[id].short, title: LESSONS[id].title })),
      onChange: id => { lesson = id; restart(); },
    });
    const coach = coachBox({ id: 'harm-coach' });
    let steps = checklist({ steps: [] });
    const stepsHost = h('div', null, steps.el);
    const restartBtn = button({ label: 'Restart', size: 's', onClick: () => restart() });
    const speedSeg = segmented<number>({
      id: 'harm-speed', ariaLabel: 'Time', size: 's', value: 1,
      options: [{ value: 1, label: '×1' }, { value: 2, label: '×2' }, { value: 4, label: '×4' }],
      onChange: v => { timeScale = v; },
    });
    const log = eventLog({ id: 'harm-log', max: 40, title: 'What that did', empty: 'Press something: every action is explained here.' });

    // Radar card (lesson "radars").
    const sysSeg = segmented<SystemId>({
      id: 'harm-system', label: 'System', fill: true, value: system,
      options: SYSTEM_ORDER.map(id => ({ value: id, label: SYSTEMS[id].nato.split(' ')[0]!, title: SYSTEMS[id].nato })),
      onChange: id => showSystem(id),
    });
    const card = h('div', { class: 'harm-card' });
    let emitting = true;
    const emitBtn = button({ label: 'Radars: transmitting', size: 's', onClick: () => { emitting = !emitting; gallery?.setEmitting(emitting); emitBtn.el.textContent = emitting ? 'Radars: transmitting' : 'Radars: off'; } });
    const radarPanel = consolePanel({ title: 'The battery', id: 'harm-radar', children: [sysSeg.el, card, h('div', { class: 'harm-row' }, emitBtn.el)] });

    // Film panel (lesson "homing").
    const filmText = h('ol', { class: 'harm-film__text' });
    const filmButtons = FILM_ORDER.map(f => button({ label: FILMS[f].label, size: 's', onClick: () => playFilm(f) }));
    const filmPanel = consolePanel({ title: 'Watch a shot', id: 'harm-film', children: [h('div', { class: 'harm-film__btns' }, filmButtons.map(b => b.el)), filmText] });

    // Missions panel.
    const missionsPanel = consolePanel({
      title: 'Fly it in DCS', id: 'harm-missions',
      children: [
        h('p', { class: 'harm-small' }, 'Two single-player missions for the F/A-18C over the Caucasus: 25000 ft, 450 kt, 4 × AGM-88C, 2 × AIM-9X, centreline tank. Copy them into Saved Games\\DCS\\Missions.'),
        h('ul', { class: 'harm-missions' }, MISSIONS.map(m => h('li', null,
          h('a', { href: `./missions/${m.file}`, download: m.file, class: 'harm-missions__file' }, m.title),
          h('span', { class: 'harm-small' }, m.text)))),
        h('p', { class: 'harm-small' }, 'Route: WP1 fence, WP2 on the SA-6 radar, WP3 between the SA-8 and SA-15, WP4 on the SA-11 Snow Drift, WP5 Kobuleti.'),
        button({ label: 'Open the mission guide', size: 's', onClick: () => { lesson = 'missions'; restart(); } }).el,
      ],
    });
    const kneeboard = disclosure({
      title: 'Kneeboard: emitter codes and classes', id: 'harm-kneeboard',
      content: h('div', null,
        h('table', { class: 'harm-table' },
          h('thead', null, h('tr', null, ['System', 'Radar', 'RWR', 'Class', 'PB code'].map(t => h('th', null, t)))),
          h('tbody', null, ALIC_TABLE.map(r => h('tr', null, h('td', null, r.system), h('td', null, r.radar), h('td', { class: 'harm-mono' }, r.rwr), h('td', { class: 'harm-mono' }, r.cls ?? '—'), h('td', { class: 'harm-mono' }, String(r.alic)))))),
        h('p', { class: 'harm-small' }, 'From the ED F/A-18C guide appendix (p420). Classes: ', (Object.keys(CLASS_MEANING) as HarmClass[]).map(k => `${k} ${CLASS_MEANING[k]}`).join(' · '), '.')),
    });
    const keysBox = disclosure({
      title: 'Keys', id: 'harm-keys',
      content: h('dl', { class: 'harm-keys' }, KEYS.flatMap(([k, t]) => [h('dt', null, h('kbd', null, k)), h('dd', null, t)])),
    });
    const caveats = disclosure({ title: 'Simplified and not verified', id: 'harm-caveats', content: h('ul', { class: 'harm-caveats' }, HARM_CAVEATS.map(c => h('li', null, c))) });
    const camSeg = segmented<Cam>({
      id: 'harm-cam', ariaLabel: 'Camera', size: 's', value: cam,
      options: [{ value: 'chase', label: 'Chase' }, { value: 'harm', label: 'HARM' }, { value: 'site', label: 'Site' }, { value: 'top', label: 'Top' }],
      onChange: c => { cam = c; scene?.setCamera(c); },
    });

    const viewport = h('div', { class: 'harm-viewport' });
    const sceneHost = h('div', { class: 'harm-host' });
    const galleryHost = h('div', { class: 'harm-host' });
    const briefHost = h('div', { class: 'harm-host harm-host--brief' }, buildBriefing());
    viewport.append(sceneHost, galleryHost, briefHost);

    const lab = labLayout({
      id: 'harm-lab', class: 'harm-lab',
      header: {
        title: 'HARM & SEAD',
        lede: 'Know the radars, see how a HARM flies, then work the Hornet\'s HARM: SP, TOO, PB and Pullback. Every press is explained.',
        meta: 'F/A-18C · AGM-88C HARM',
      },
      viewport,
      strip: [hudBezel.el, ewBezel.el, ddiBezel.el, ufcBlock, hsi],
      console: [
        consolePanel({ title: 'Lesson', id: 'harm-lesson-panel', children: [lessonSeg.el, coach.el, stepsHost, h('div', { class: 'harm-row' }, restartBtn.el, speedSeg.el)] }).el,
        radarPanel.el, filmPanel.el, log.el, missionsPanel.el, kneeboard, keysBox, caveats,
      ],
    });
    lab.overlay('tl', camSeg.el);
    ctx.root.append(lab.el);

    // ------------------------------------------------------------------ 3D
    let stage: Stage | null = null;
    let scene: HarmScene | null = null;
    if (isWebGLAvailable()) {
      try {
        stage = new Stage(sceneHost, { autoPause: 'render', maxDpr: 1.5, environment: { surface: 'land', grid: false, hazeKm: 90 }, ariaLabel: 'HARM shot in 3D' });
        scene = new HarmScene(stage);
        stage.onFrame(dt => { if (dt > 0) tick(Math.min(dt, 0.1)); });
      } catch { stage = null; scene = null; }
    }
    if (!stage) {
      sceneHost.append(h('p', { class: 'harm-no3d' }, 'WebGL is not available: the 3D view is off. The cockpit and the lessons still run.'));
      let last = performance.now(), raf = 0;
      const loop = (now: number) => { tick(Math.min(0.1, (now - last) / 1000)); last = now; raf = requestAnimationFrame(loop); };
      raf = requestAnimationFrame(loop);
      bag.add(() => cancelAnimationFrame(raf));
    }
    bag.add(() => { scene?.dispose(); stage?.dispose(); });
    let gallery: GalleryHandle | null = null;
    bag.add(() => gallery?.dispose());

    // ------------------------------------------------------------------ keys (one map)
    const turn = (d: number) => ({ down: () => { sim.jet.turnCmd = d; }, up: () => { if (sim.jet.turnCmd === d) sim.jet.turnCmd = 0; } });
    const pitch = (d: number) => ({ down: () => { sim.jet.pitchCmd = d; }, up: () => { if (sim.jet.pitchCmd === d) sim.jet.pitchCmd = 0; } });
    bag.add(bindKeys({
      'M': () => act(av.toggleMasterArm(), 'Master Arm (M)'),
      '1': () => act(av.setMaster('AA'), 'A/A (1)'),
      '2': () => act(av.setMaster('AG'), 'A/G (2)'),
      'I': () => act(av.sequence(), 'HARM Sequence (I)'),
      'C': () => act(av.cage(), 'Cage/Uncage (C)'),
      'RAlt+/': () => act(av.tdcToHarm(), 'Sensor Control right (RAlt+/)'),
      'RAlt+Space / R': { down: () => release(true), up: () => release(false) },
      'E': () => { if (sim.dropChaff()) log.push('Chaff', { t: sim.t }); },
      'ArrowLeft': turn(-1), 'ArrowRight': turn(1),
      'ArrowDown': pitch(1), 'ArrowUp': pitch(-1),
    }));

    // ------------------------------------------------------------------ helpers
    function act(r: ActionResult, what: string): void {
      log.push(h('span', null, h('b', null, `${what}: `), r.text), { t: sim.t, ...(r.tone ? { tone: r.tone } : r.ok ? {} : { tone: 'caution' as Tone }) });
      updateUi(true);
    }

    /** Weapon release pressed (true) or let go (false), from RAlt+Space, R or the on-screen button. */
    function release(held: boolean): void {
      if (held === av.releaseHeld) return;
      const r = av.setRelease(held);
      releaseBtn.setLit(held);
      if (r) act(r, 'Weapon release');
    }

    function onOsb(n: Osb): void {
      const wasPb = av.mode === 'PB' && av.page === 'HARM';
      act(av.osb(n), `Right DDI pushbutton ${n}`);
      if (wasPb && (n === 1 || n === 2)) pullupChosen = av.pullup;
    }

    function showSystem(id: SystemId): void {
      system = id;
      visited.add(id);
      sysSeg.set(id, false);
      gallery?.show(id);
      const s = SYSTEMS[id];
      card.replaceChildren(
        h('h4', { class: 'harm-card__title' }, `${s.nato} · ${s.name}`),
        h('p', null, s.summary),
        h('ul', { class: 'harm-card__list' }, s.vehicles.map(v => h('li', null, h('b', null, v.name), ` — ${v.role}`, v.radar ? '' : ' (no radar)'))),
        h('table', { class: 'harm-table' },
          h('thead', null, h('tr', null, ['Radar', 'Job', 'RWR', 'Class', 'PB code'].map(t => h('th', null, t)))),
          h('tbody', null, s.radars.map(r => h('tr', null, h('td', null, r.name), h('td', null, r.job), h('td', { class: 'harm-mono' }, r.rwr), h('td', { class: 'harm-mono' }, r.cls ?? '—'), h('td', { class: 'harm-mono' }, String(r.alic)))))),
        callout({ kind: 'note', title: 'HARM target', body: s.harmTarget }),
        h('ul', { class: 'harm-small' }, s.figures.map(f => h('li', null, f))),
        h('p', { class: 'harm-small' }, s.inMissions ? `In the missions: ${s.inMissions}` : 'Not in the practice missions.'),
      );
      updateUi(true);
    }

    function newSim(setup: SimSetup, waypoints: ReturnType<NonNullable<typeof LESSONS['sp']['setup']>>['waypoints'] | null): void {
      sim = new HarmSim(setup);
      const pos = (id: string) => ({ ...sim.sites.find(s => s.id === id)!.vehicles[0]!.pos });
      av = new HarmAvionics(sim, waypoints ? waypoints(pos) : []);
      evCursor = 0; kills = []; misses = []; lockSeen = false; pullupChosen = null;
    }

    function playFilm(f: FilmId): void {
      film = f; filmT = 0; filmLaunched = false; filmQuiet = false;
      newSim(filmSetup(f), null);
      scene?.setCamera(cam === 'chase' ? 'harm' : cam);
      filmText.replaceChildren(...FILMS[f].narration.map(t => h('li', null, t)));
      log.push(h('b', null, FILMS[f].title), { t: 0 });
      filmButtons.forEach((b, i) => b.el.classList.toggle('is-active', FILM_ORDER[i] === f));
    }

    function stepFilm(dt: number): void {
      if (!film) return;
      filmT += dt;
      const j = sim.jet;
      if (film === 'ac' && !filmLaunched) {
        j.pitchCmd = j.pitchRad * R2D < 42 ? 1 : 0;
        if (j.pitchRad * R2D >= 40) { sim.launchPb(sim.sites[0]!.vehicles[0]!.pos, 107, 'AC'); filmLaunched = true; j.pitchCmd = 0; }
        return;
      }
      if (!filmLaunched && filmT > 1.5) {
        filmLaunched = true;
        if (film === 'pb') sim.launchPb(sim.sites[0]!.vehicles[0]!.pos, 107, 'HRM');
        else sim.launchAt(`${sim.sites[0]!.id}:0`);
      }
      if (film === 'shutdown' && filmLaunched && !filmQuiet && filmT > 16) {
        filmQuiet = true;
        sim.sites[0]!.active = false;
      }
      // Turn away after the shot, as a pilot would.
      if (filmLaunched && filmT > 6) j.turnCmd = Math.abs(wrapDeg(j.headingRad * R2D)) < 60 ? -1 : 0;
    }

    // ------------------------------------------------------------------ lesson lifecycle
    function restart(): void {
      result?.destroy(); result = null;
      ended = false; scripted = false; stepIdx = 0; film = null;
      const def = LESSONS[lesson];
      lessonSeg.set(lesson, false);
      steps = checklist({ steps: def.steps.map(s => ({ id: s.id, text: s.text, keys: s.keys })) });
      stepsHost.replaceChildren(steps.el);
      log.clear();
      log.push(def.goal, { t: 0 });
      lab.el.classList.toggle('harm--gallery', def.kind === 'gallery' || def.kind === 'brief');
      lab.el.classList.toggle('harm--film', def.kind === 'film');
      radarPanel.el.hidden = def.kind !== 'gallery';
      filmPanel.el.hidden = def.kind !== 'film';
      sceneHost.hidden = def.kind === 'gallery' || def.kind === 'brief';
      galleryHost.hidden = def.kind !== 'gallery';
      briefHost.hidden = def.kind !== 'brief';
      camSeg.el.hidden = def.kind === 'gallery' || def.kind === 'brief';
      if (def.kind === 'gallery') {
        if (!gallery) gallery = mountGallery(galleryHost, { reducedMotion: reduced, ariaLabel: 'SAM battery in 3D: drag to orbit' });
        newSim({ jet: { x: 0, z: 0, altFt: 25000, headingDeg: 0, speedKt: 450 }, sites: [] }, null);
        showSystem(system);
      } else if (def.kind === 'brief') {
        newSim({ jet: { x: 0, z: 0, altFt: 25000, headingDeg: 0, speedKt: 450 }, sites: [] }, null);
        briefHost.scrollTop = 0;
      } else if (def.kind === 'film') {
        newSim(filmSetup('direct'), null);
        filmText.replaceChildren(h('li', null, 'Pick a shot above to watch it.'));
      } else {
        const s = def.setup!();
        newSim(s.sim, s.waypoints);
      }
      scene?.setCamera(def.kind === 'film' ? 'harm' : cam);
      stage?.requestRender();
      updateUi(true);
    }

    function snapshot(): HarmSnap {
      const j = sim.jet;
      const first = sim.sites[0];
      const away = first ? Math.abs(wrapDeg(bearingDeg(j.pos, first.vehicles[0]!.pos) - j.headingRad * R2D)) > 90 : false;
      return {
        masterArm: av.masterArm, master: av.master, harmSelected: av.harmSelected, page: av.page, mode: av.mode, tdc: av.tdcOnHarm,
        cls: av.cls, ewHud: av.ewHud, hrmOvrd: av.hrmOvrd,
        spCue: av.harmSelected ? av.spCue()?.emitter.radar.rwr ?? null : null,
        tooBox: av.mode === 'TOO' ? av.tooBox()?.emitter.radar.rwr ?? null : null,
        handoff: av.handoffKey ? av.contacts().find(c => c.key === av.handoffKey)?.emitter.radar.rwr ?? null : null,
        ufcOn: av.ufcOn, ufcOption: av.ufcOption, pbCode: av.pbCode, pullupChosen,
        designated: av.designatedPoint()?.name ?? null,
        inRange: av.mode === 'PB' && !!av.pbState()?.inRange,
        launches: av.launches, pullbackShots: av.pullbackShots, kills, lockSeen, jetAlive: j.alive, turnedAway: away,
        visited: [...visited], watched: [...watched],
      };
    }

    function tick(dt: number): void {
      const def = LESSONS[lesson];
      if (def.kind !== 'gallery' && def.kind !== 'brief' && !ended) {
        const sdt = dt * timeScale;
        stepFilm(sdt);
        sim.step(sdt);
        const auto = av.update();
        if (auto) act(auto, 'Weapon release (held)');
        readEvents();
        if (sim.contacts().some(c => c.lockedYou)) lockSeen = true;
      }
      scene?.update(sim.scene());
      drawDisplays();
      uiClock += dt;
      if (uiClock > 0.1) { uiClock = 0; updateUi(false); }
    }

    function readEvents(): void {
      for (; evCursor < sim.events.length; evCursor++) {
        const e = sim.events[evCursor]!;
        const tone: Tone | undefined = e.type === 'harm-kill' ? 'ok' : e.type === 'jet-hit' || e.type === 'sam-launch' ? 'warning'
          : e.type === 'harm-miss' || e.type === 'harm-lost' || e.type === 'radar-quiet' || e.type === 'lock' ? 'caution' : undefined;
        log.push(e.text, { t: e.t, ...(tone ? { tone } : {}) });
        if (e.type === 'harm-kill') kills = [...kills, e.vehicle];
        if (e.type === 'harm-miss') misses = [...misses, e.reason];
        if ((e.type === 'harm-kill' || e.type === 'harm-miss') && film) {
          watched.add(film);
          const f = film;
          setTimeout(() => { if (film === f) log.push('Pick the next shot, or watch it again.', { t: sim.t }); }, 0);
        }
        if (e.type === 'jet-hit') fail();
      }
    }

    function drawDisplays(): void {
      const cur = LESSONS[lesson].steps[stepIdx];
      const hint = !ended ? cur?.hint : undefined;
      ddi.draw(av.formatView(hint?.ddi ?? null));
      ew.draw(av.ewView(hint?.ew ?? null));
      hud.draw(av.hudView());
      ufc.draw(av.ufcView(hint?.ufc ?? null));
      lamps.set(av.ewView().lamps);
    }

    function updateUi(force: boolean): void {
      const def = LESSONS[lesson];
      const snap = snapshot();
      while (!ended && stepIdx < def.steps.length && def.steps[stepIdx]!.check(snap)) { steps.setDone(def.steps[stepIdx]!.id); stepIdx++; }
      steps.setCurrent(def.steps[stepIdx]?.id ?? null);
      if (!ended && def.steps.length && stepIdx >= def.steps.length) complete();
      const cur = def.steps[stepIdx];
      let tone: Tone | null = null;
      let why = cur?.why ?? def.goal;
      const pb = av.pullbackLabel();
      if (!ended && pb === 'HARM') { why = 'Pullback ready: HARM in the HUD. Weapon release now.'; tone = 'warning'; }
      else if (!ended && pb === 'PLBK') { why = 'A radar has locked you. PLBK: Pullback is inhibited (HRM OVRD boxed).'; tone = 'caution'; }
      if (force || cur) coach.set(cur ? cur.text : def.steps.length ? 'Lesson complete.' : 'Read the guide, download a mission, then fly it.', why, tone);
      armBtn.el.textContent = `MASTER ARM: ${av.masterArm ? 'ARM' : 'SAFE'}`;
      armBtn.el.classList.toggle('is-active', av.masterArm);
      aaBtn.el.classList.toggle('is-active', av.master === 'AA');
      agBtn.el.classList.toggle('is-active', av.master === 'AG');
      const wp = av.waypoints[av.wpIdx];
      wpText.textContent = wp ? `${wp.name}${av.designated ? ' · TGT' : ''}` : '—';
      ddiBezel.setLabel(av.page === 'SMS' ? 'RIGHT DDI · STORES' : `RIGHT DDI · HARM ${av.page === 'HARM' ? av.mode : av.page}`);
    }

    function complete(): void {
      if (ended) return;
      ended = true;
      const def = LESSONS[lesson];
      if (!scripted) ctx.app.setProgress(progressKey(lesson), true);
      const next = HARM_LESSON_ORDER[HARM_LESSON_ORDER.indexOf(lesson) + 1];
      const lines = def.kind === 'drill'
        ? [`HARMs fired: ${av.launches}`, `Radars killed: ${kills.length}`, ...(misses.length ? [`Misses: ${misses.map(m => m === 'lost' ? 'radar went quiet' : m === 'no-emitter' ? 'no radar of that code' : 'hit the ground').join(', ')}`] : [])]
        : ['Done. The steps are ticked in the lesson panel.'];
      result = modal({
        id: 'harm-debrief', title: `${def.title}: complete${scripted ? ' (scripted demo, not saved)' : ''}`, within: lab.view, tone: 'ok', open: true,
        body: h('div', null, h('ul', null, lines.map(l => h('li', null, l)))),
        actions: [
          { label: 'Again', onClick: () => restart(), id: 'harm-again' },
          ...(next ? [{ label: `Next: ${LESSONS[next].short}`, primary: true, id: 'harm-next', onClick: () => { lesson = next; restart(); } }] : []),
        ],
      });
      bag.add(() => result?.destroy());
    }

    function fail(): void {
      if (ended) return;
      ended = true;
      result = modal({
        id: 'harm-fail', title: 'You were hit', within: lab.view, tone: 'warning', open: true,
        body: h('div', null, h('p', null, 'Their missile needed the radar until impact. Kill the radar first, or beam the site and drop chaff (E) when you see a launch.')),
        actions: [{ label: 'Try again', primary: true, onClick: () => restart(), id: 'harm-retry' }],
      });
      bag.add(() => result?.destroy());
    }

    // ------------------------------------------------------------------ start, pre-rolls
    restart();
    if (shot) preroll(shot);

    function run(sec: number, stop: () => boolean = () => false): void {
      for (let i = 0; i < sec * 30 && !stop() && !ended; i++) tick(1 / 30);
    }

    /** Scripted pilot for screenshots (never saved as progress). */
    function preroll(s: Shot): void {
      scripted = true;
      const setup = () => { av.toggleMasterArm(); av.setMaster('AG'); av.osb(6); };
      switch (s) {
        case 'radars': showSystem(params.get('sys') as SystemId ?? 'sa11'); break;
        case 'homing': playFilm('pb'); run(25); break;
        case 'sp': setup(); av.toggleEwHud(); run(2); av.setRelease(true); av.setRelease(false); run(14); break;
        case 'too': setup(); av.osb(4); av.tdcToHarm(); run(2); break;
        case 'too-hoff': setup(); av.osb(4); av.tdcToHarm(); av.osb(11); av.osb(9); av.cage(); run(1); break;
        case 'pb-ufc': setup(); av.osb(3); av.osb(14); av.ufcKey('OPT4'); av.ufcKey('1'); av.ufcKey('0'); av.ufcKey('7'); run(1); break;
        case 'pb-cue': setup(); av.osb(3); av.osb(14); av.ufcKey('OPT4'); ['1', '0', '7', 'ENT'].forEach(k => av.ufcKey(k as '1')); av.osb(1); pullupChosen = 'HRM'; av.selectWaypoint(1); av.wpdsg(); run(1); sim.jet.pitchCmd = 1; run(0.6); sim.jet.pitchCmd = 0; break;
        case 'pullback': av.toggleMasterArm(); av.osb(16); run(60, () => av.pullbackLabel() === 'HARM'); run(1); break;
        case 'live': setup(); av.osb(4); av.tdcToHarm(); run(40); break;
      }
      if (!params.get('cam') && s !== 'radars') scene?.setCamera(s === 'homing' ? 'harm' : 'chase');
      updateUi(true);
    }
  }

  return { mount, unmount() { bag.dispose(); } };
};

export default factory;
