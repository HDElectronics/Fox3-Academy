/**
 * Debrief: Tacview-style replay of world.recording (ReplayView), a timeline with event markers
 * (launches, pitbulls, datalink losses, hits, misses, defences, locks) and a coaching lane, per-shot
 * cards (range vs Rmax / Rne at launch, radar mode, aspect, outcome, F-pole, warning), and the
 * coaching list from coach.ts. Saves 'sortie:<ac>:best' and 'sortie:<ac>:done' on a win.
 */
import type { FighterId, RadarModeId } from '../../data/types';
import { AIRCRAFT } from '../../data/aircraft';
import { MISSILES } from '../../data/missiles';
import type { PageContext } from '../../app/page';
import { fmtRange, fmtTime } from '../../app/format';
import type { EntityId, SimEvent } from '../../sim/types';
import { Stage, ReplayView, CameraRig, rosterFromWorld } from '../../render';
import {
  h, setText, setAttr, cleanup, labLayout, consolePanel, segmented, select, button, chips, tabs, callout, placard, bindKeys, cx,
} from '../../ui';
import { coachSortie, describeShot, firstReaction, reasonText, scoreSortie, type CoachInput, type CoachItem, type ShotRecord } from './coach';
import type { FlyOutcome } from './fly';
import { enemyCount } from './setup';
import { AcmiDownload, exportAcmi } from '../../export/acmi';

export interface DebriefOptions {
  ctx: PageContext;
  outcome: FlyOutcome;
  onAgain(): void;
  onBrief(): void;
  /** Screenshot: start the replay at this time (s). */
  startAt?: number;
}

type Cat = 'launch' | 'pitbull' | 'dl' | 'hit' | 'miss' | 'def' | 'lock';
interface Marker { t: number; cat: Cat; tone: string; text: string; focus: EntityId | null }

const CAT_LABEL: Record<Cat, string> = { launch: 'Launch', pitbull: 'Pitbull', dl: 'DL lost', hit: 'Hit', miss: 'Miss', def: 'Defence', lock: 'Lock' };

export function mountDebrief(host: HTMLElement, o: DebriefOptions): { dispose(): void } {
  const bag = cleanup();
  const { ctx, outcome } = o;
  const { world, eng, recorder: rec, result, setup } = outcome;
  const ac: FighterId = ctx.app.aircraft;
  const spec = ctx.app.spec, units = ctx.app.units;
  const inp: CoachInput = rec.input();
  const items = coachSortie(inp);
  const name = (id: EntityId | null | undefined) => (id ? inp.names[id] ?? id : '--');
  const R = (m: number) => fmtRange(m, units, m < (units === 'metric' ? 10000 : 18520) ? 1 : 0);
  const modeLabel = (shooter: EntityId, m: RadarModeId) => {
    const t = world.get(shooter)?.type;
    const jet = t ? AIRCRAFT[t] : undefined;
    const lbl = jet?.role === 'fighter' ? jet.radar.modeLabels[m] : undefined;
    return lbl && lbl !== m.toUpperCase() ? `${m.toUpperCase()} (${lbl})` : m.toUpperCase();
  };

  // ───────────────────────────────────────── result + score, saved on a win
  const sc = scoreSortie(inp, result, setup.skill, setup.scenario);
  const bestKey = `sortie:${ac}:best`;
  const prevBest = ctx.app.getProgress(bestKey);
  let newBest = false;
  // A fight the scripted pilot flew (screenshot states) never counts as yours.
  if (result.outcome === 'win' && !outcome.scripted) {
    if (typeof prevBest !== 'number' || sc.score > prevBest) { ctx.app.setProgress(bestKey, sc.score); newBest = true; }
    ctx.app.setProgress(`sortie:${ac}:done`, true);
  }
  const kills = eng.enemyIds.filter(id => !world.get(id)?.alive).length;
  const mine = inp.shots.filter(s => s.shooterId === inp.playerId);
  const headline = result.outcome === 'win' ? `Won: splash ${kills}` : result.outcome === 'loss' ? 'Shot down' : result.reason === 'time' ? 'Time up' : result.reason === 'bingo' ? 'Everyone winchester' : 'Sortie ended';
  const sub = `${fmtTime(result.t)} · ${mine.length} shot${mine.length === 1 ? '' : 's'}, ${mine.filter(s => s.outcome === 'hit').length} hit · ${kills} of ${eng.enemyIds.length} bandit${eng.enemyIds.length > 1 ? 's' : ''} down`;

  // ───────────────────────────────────────── markers
  const markers: Marker[] = [];
  const who = (s: ShotRecord) => (s.shooterId === inp.playerId ? s.label : `${name(s.shooterId)} ${MISSILES[s.missile].name}`);
  for (const s of inp.shots) {
    const blue = s.side === 'blue';
    markers.push({ t: s.t, cat: 'launch', tone: blue ? 'blue' : 'red', focus: s.id, text: `${who(s)} launched at ${name(s.targetId)}${s.range !== null ? `, ${R(s.range)}` : ''} (${s.radarMode.toUpperCase()})` });
    if (s.pitbullAt !== null) markers.push({ t: s.pitbullAt, cat: 'pitbull', tone: 'dl', focus: s.id, text: `${who(s)} pitbull` });
    if (s.datalinkLost) markers.push({ t: s.datalinkLost.t, cat: 'dl', tone: 'caution', focus: s.id, text: `${who(s)} lost datalink: ${s.datalinkLost.why}` });
    else if (s.seekerLost?.why === 'lost-guidance' && MISSILES[s.missile].seeker === 'sarh') markers.push({ t: s.seekerLost.t, cat: 'dl', tone: 'caution', focus: s.id, text: `${who(s)} lost its lock (Fox 1)` });
    if (s.endT !== null && s.outcome === 'hit') markers.push({ t: s.endT, cat: 'hit', tone: blue ? 'ok' : 'warning', focus: s.targetId, text: `${who(s)} hit ${name(s.targetId)}` });
    else if (s.endT !== null && s.outcome === 'miss' && s.reason !== 'target-dead') markers.push({ t: s.endT, cat: 'miss', tone: 'dim', focus: s.id, text: `${who(s)} missed: ${reasonText(s.reason)}` });
    if (s.targetId === inp.playerId && s.warnedAt !== null) {
      const r = firstReaction(inp, s.id, s.warnedAt, s.endT ?? inp.endT);
      if (r) markers.push({ t: r.t, cat: 'def', tone: 'sym', focus: inp.playerId, text: `You ${r.how === 'beam' ? 'beam' : 'drag'} ${who(s)}` });
    }
  }
  let lastChaff = -99;
  for (const e of inp.events) {
    if (e.type === 'cm' && e.what === 'chaff') {
      if (e.t - lastChaff > 4) markers.push({ t: e.t, cat: 'def', tone: 'sym', focus: e.ownerId, text: `${name(e.ownerId)} chaff` });
      lastChaff = e.t;
    } else if (e.type === 'ai' && /notch|drag|turns cold to drag/i.test(e.text) && eng.enemyIds.includes(e.ownerId)) {
      markers.push({ t: e.t, cat: 'def', tone: 'sym', focus: e.ownerId, text: e.text });
    } else if (e.type === 'lock' && e.what === 'locked' && (e.ownerId === inp.playerId || e.targetId === inp.playerId)) {
      markers.push({ t: e.t, cat: 'lock', tone: 'hi', focus: e.ownerId === inp.playerId ? e.targetId : e.ownerId, text: e.ownerId === inp.playerId ? `You lock ${name(e.targetId)}` : `${name(e.ownerId)} locks you` });
    } else if (e.type === 'lock' && e.what === 'broken' && e.ownerId === inp.playerId) {
      markers.push({ t: e.t, cat: 'dl', tone: 'caution', focus: e.targetId, text: `Your lock on ${name(e.targetId)} broke: ${e.why ?? ''}` });
    }
  }
  markers.sort((a, b) => a.t - b.t);

  // ───────────────────────────────────────── DOM
  const viewEl = h('div', { class: 'sortie-view' });
  const t0 = world.recording[0]?.t ?? 0;
  const t1 = world.recording[world.recording.length - 1]?.t ?? Math.max(1, world.t);
  const span = Math.max(1, t1 - t0);
  const pct = (t: number) => `${(((t - t0) / span) * 100).toFixed(2)}%`;

  let playing = !Stage.prefersReducedMotion();
  let speed = 4;
  let radarView = ctx.params.get('view') === 'radar';
  const perspective = segmented<'truth' | 'radar'>({
    id: 'sortie-rperspective', ariaLabel: 'Replay picture', size: 's', value: radarView ? 'radar' : 'truth',
    options: [{ value: 'truth', label: 'Truth' }, { value: 'radar', label: 'Your radar' }],
    onChange: value => { radarView = value === 'radar'; applyPerspective(); },
  });
  const pictureNote = h('p', { class: 'sortie-note', 'aria-live': 'polite' });
  const playBtn = button({ label: playing ? 'Pause' : 'Play', size: 's', keys: 'Space', onClick: () => setPlaying(!playing) });
  const speedSeg = segmented<number>({
    id: 'sortie-rspeed', ariaLabel: 'Replay speed', size: 's', value: speed,
    options: [1, 2, 4, 8, 16].map(v => ({ value: v, label: `${v}×` })), onChange: v => { speed = v; },
  });
  const timeOut = h('output', { class: 'sortie-tl__time' }, '00:00');
  const scrub = h('input', { type: 'range', class: 'sortie-tl__scrub', min: t0, max: t1, step: 0.25, value: t0, 'aria-label': 'Replay time' }) as HTMLInputElement;
  const playhead = h('div', { class: 'sortie-tl__head', 'aria-hidden': 'true' });
  const laneEv = h('div', { class: 'sortie-tl__lane', role: 'group', 'aria-label': 'Events' });
  const laneCo = h('div', { class: 'sortie-tl__lane sortie-tl__lane--coach', role: 'group', 'aria-label': 'Coaching' });
  const ticks = h('div', { class: 'sortie-tl__ticks', 'aria-hidden': 'true' });
  for (let t = Math.ceil(t0 / 60) * 60; t <= t1; t += 60) ticks.append(h('span', { style: { left: pct(t) } }, fmtTime(t)));
  const markerEls: { el: HTMLElement; cat: Cat }[] = [];
  for (const m of markers) {
    const el = h('button', {
      type: 'button', class: cx('sortie-mk', `sortie-mk--${m.cat}`, `tone-${m.tone}`), style: { left: pct(m.t) },
      title: `${fmtTime(m.t)} ${m.text}`, 'aria-label': `${fmtTime(m.t)}: ${m.text}`,
      onclick: () => jump(m.t, m.focus),
    });
    laneEv.append(el);
    markerEls.push({ el, cat: m.cat });
  }
  for (const it of items) {
    if (it.t === null) continue;
    laneCo.append(h('button', {
      type: 'button', class: cx('sortie-mk', 'sortie-mk--coach', `tone-${it.kind}`), style: { left: pct(it.t) },
      title: `${fmtTime(it.t)} ${it.title}`, 'aria-label': `${fmtTime(it.t)}: ${it.title}`, onclick: () => { jump(it.t ?? t0, it.focus); tabsH.set('coach', true); highlight(it.id); },
    }, it.kind === 'mistake' ? '!' : it.kind === 'good' ? '✓' : 'i'));
  }
  const cats = Object.keys(CAT_LABEL) as Cat[];
  const filter = chips<Cat>({
    id: 'sortie-mkfilter', ariaLabel: 'Marker types', value: cats,
    options: cats.map(c => ({ value: c, label: h('span', { class: 'sortie-chip' }, h('i', { class: `sortie-sw sortie-mk--${c}` }), CAT_LABEL[c]) })),
    onChange: vals => { for (const m of markerEls) m.el.hidden = !vals.includes(m.cat); },
  });
  const timelineEl = h('div', { class: 'sortie-tl' },
    h('div', { class: 'sortie-tl__bar' }, playBtn.el, speedSeg.el, timeOut, h('span', { class: 'sortie-tl__end' }, `/ ${fmtTime(t1)}`)),
    h('div', { class: 'sortie-tl__bar' }, perspective.el), pictureNote,
    h('div', { class: 'sortie-tl__track' },
      h('div', { class: 'sortie-tl__lanes' }, h('span', { class: 'sortie-tl__lanelabel' }, 'Events'), laneEv, h('span', { class: 'sortie-tl__lanelabel' }, 'Coach'), laneCo, ticks, playhead),
      scrub),
    filter.el);

  // Coach list.
  const coachList = h('ol', { class: 'sortie-coachlist' }, items.length ? items.map(it => h('li', { class: cx('sortie-ci', `sortie-ci--${it.kind}`), id: `ci-${it.id}` },
    h('div', { class: 'sortie-ci__head' },
      h('span', { class: 'sortie-ci__lamp', 'aria-hidden': 'true' }),
      h('span', { class: 'sortie-ci__title' }, it.title),
      it.t !== null ? h('button', { type: 'button', class: 'sortie-ci__t', title: 'Show this moment in the replay', onclick: () => jump(it.t ?? t0, it.focus) }, fmtTime(it.t)) : null),
    h('p', { class: 'sortie-ci__text' }, it.text))) : h('li', { class: 'sortie-ci' }, h('p', { class: 'sortie-ci__text' }, 'Nothing to flag: no shots and no threats. Start closer or pick a braver adversary.')));

  // Shots.
  const shotCard = (s: ShotRecord) => {
    const r = describeShot(s, inp, modeLabel);
    return h('li', { class: cx('sortie-shot', `tone-${r.tone}`) },
      h('button', { type: 'button', class: 'sortie-shot__head', onclick: () => jump(s.t, s.id), title: 'Show the launch in the replay' },
        h('span', { class: 'sortie-shot__title' }, r.title), h('span', { class: 'sortie-shot__out' }, r.outcome)),
      h('dl', { class: 'sortie-shot__rows' },
        h('dt', null, 'Launch'), h('dd', null, `${fmtTime(s.t)} · ${r.launch}`),
        h('dt', null, 'Radar'), h('dd', null, r.mode),
        h('dt', null, 'Target'), h('dd', null, r.aspect),
        h('dt', null, 'F-pole'), h('dd', null, r.fPole),
        h('dt', null, 'Warning'), h('dd', null, r.warning),
        h('dt', null, 'Flight'), h('dd', null, r.flight)));
  };
  const group = (title: string, list: ShotRecord[]) => (list.length ? [placard(title), h('ol', { class: 'sortie-shots' }, list.map(shotCard))] : []);
  const yours = inp.shots.filter(s => s.shooterId === inp.playerId);
  const atYou = inp.shots.filter(s => s.targetId === inp.playerId && s.shooterId !== inp.playerId);
  const others = inp.shots.filter(s => s.shooterId !== inp.playerId && s.targetId !== inp.playerId);
  const shotsEl = h('div', { class: 'sortie-shotsbox' },
    inp.shots.length ? null : h('p', { class: 'sortie-note' }, 'No missiles were fired.'),
    ...group('Your shots', yours), ...group('At you', atYou), ...group(setup.scenario === '2v2' ? 'Wingman and bandits' : 'Others', others));

  // Events.
  const evRows = markers.map(m => h('li', null, h('button', { type: 'button', class: cx('sortie-ev', `tone-${m.tone}`), onclick: () => jump(m.t, m.focus) },
    h('span', { class: 'sortie-ev__t' }, fmtTime(m.t)), h('span', null, m.text))));
  const aiRows = inp.events.filter((e): e is Extract<SimEvent, { type: 'ai' }> => e.type === 'ai').map(e =>
    h('li', null, h('button', { type: 'button', class: 'sortie-ev tone-dim', onclick: () => jump(e.t, e.ownerId) }, h('span', { class: 'sortie-ev__t' }, fmtTime(e.t)), h('span', null, e.text))));
  const eventsEl = h('div', null,
    placard('Shots, locks and defences'), h('ol', { class: 'sortie-evlist' }, evRows),
    placard('What the AI was doing'), h('ol', { class: 'sortie-evlist' }, aiRows));

  const tabsH = tabs({
    id: 'sortie-dtabs', fill: true, value: 'coach',
    tabs: [
      { id: 'coach', label: `Coach (${items.length})`, content: coachList },
      { id: 'shots', label: `Shots (${inp.shots.length})`, content: shotsEl },
      { id: 'events', label: 'Events', content: eventsEl },
    ],
  });

  const resultEl = h('div', { class: cx('sortie-result', `sortie-result--${result.outcome}`) },
    h('div', { class: 'sortie-result__head' }, h('span', { class: 'sortie-result__lamp', 'aria-hidden': 'true' }), h('span', { class: 'sortie-result__title' }, headline)),
    h('p', { class: 'sortie-result__sub' }, sub),
    result.outcome === 'win'
      ? h('p', { class: 'sortie-result__score' }, `Score ${sc.score}${outcome.scripted ? ' · scripted pilot, not saved' : newBest ? ' · new best' : typeof prevBest === 'number' ? ` · best ${prevBest}` : ''}`)
      : h('p', { class: 'sortie-result__score' }, result.outcome === 'loss' ? 'No score for a loss.' : 'A draw scores, but only a win is saved.'),
    result.outcome === 'loss' ? null : h('p', { class: 'sortie-result__parts' }, sc.parts.map(p => `${p.label} ${p.value}`).join(' · ') + ` · ${setup.skill} and ${setup.scenario} multiply it`));

  // Camera controls.
  type Cam = 'tactical' | 'chase' | 'top';
  let cam: Cam = 'tactical';
  let focus: EntityId | 'all' = 'all';
  const camSeg = segmented<Cam>({ id: 'sortie-rcam', ariaLabel: 'Camera', size: 's', value: 'tactical', options: [{ value: 'tactical', label: 'Tactical' }, { value: 'chase', label: 'Chase' }, { value: 'top', label: 'Top' }], onChange: v => { cam = v; applyCam(); } });
  const ids = [eng.playerId, ...eng.friendIds, ...eng.enemyIds];
  const focusSel = select<string>({
    id: 'sortie-rfocus', ariaLabel: 'Camera focus', inline: true, value: 'all',
    options: [{ value: 'all', label: 'Whole fight' }, ...ids.map(id => ({ value: id, label: name(id) }))],
    onChange: v => { focus = v; applyCam(); },
  });
  const bigTime = h('div', { class: 'sortie-clock' }, '00:00');

  // Generate only on request; one object URL is retained until a new download or unmount.
  const download = new AcmiDownload();
  bag.add(() => download.dispose());
  const exportNote = h('p', { class: 'sortie-note', 'aria-live': 'polite' }, world.recording.length
    ? 'Tacview export includes whole-fight truth at 0.25 s samples, using a synthetic location and date.'
    : 'No replay samples are available to export.');
  const exportBtn = button({
    id: 'sortie-export-acmi', label: 'Download ACMI', size: 's', disabled: !world.recording.length,
    title: 'Download this sortie for Tacview',
    onClick: () => {
      try {
        const content = exportAcmi(world.recording, { events: rec.events, callsigns: inp.names, title: `Fox3 Academy — ${spec.short} ${setup.scenario} sortie` });
        download.download(content, `fox3-sortie-${ac}.acmi`);
        setText(exportNote, 'ACMI download started. Open it in Tacview. It contains whole-fight truth at a synthetic location and date.');
      } catch (error) {
        download.dispose();
        setText(exportNote, 'The recording could not be exported. Your replay is still available here.');
        console.warn('Debrief: ACMI export failed', error);
      }
    },
  });

  const n = enemyCount(setup.scenario);
  const lab = labLayout({
    id: 'sortie-debrief', class: 'sortie-lab sortie-lab--debrief',
    header: {
      title: 'Debrief',
      meta: `${spec.short} vs ${n > 1 ? '2× ' : ''}${AIRCRAFT[setup.enemy].short} · ${setup.skill} · ${setup.scenario}`,
      actions: h('div', { class: 'sortie-head-actions' },
        button({ label: 'Fly again', size: 's', variant: 'primary', onClick: () => o.onAgain() }).el,
        button({ label: 'New brief', size: 's', onClick: () => o.onBrief() }).el, exportBtn.el),
    },
    viewport: viewEl,
    strip: timelineEl,
    console: [
      consolePanel({ title: 'Result', children: [resultEl, exportNote] }).el,
      consolePanel({ title: 'Debrief', class: 'sortie-dpanel', children: [tabsH.el] }).el,
      callout({ kind: 'simplified', body: 'Your radar shows your recorded sensor estimates, held between 0.25 s samples. Rings are tracks; dashed rings are coasting tracks; squares are echoes. The timeline, result, coaching and shot cards always use whole-fight truth. F-pole is the shooter–target distance when the missile ended. Launch zones use true launch geometry (simplified).' }),
    ],
  });
  lab.overlay('tl', h('div', { class: 'sortie-hud-row' }, camSeg.el, focusSel.el));
  lab.overlay('bl', bigTime);
  host.append(lab.el);
  bag.add(() => lab.el.remove());

  // ───────────────────────────────────────── replay
  let stage: Stage | null = null, replay: ReplayView | null = null, rig: CameraRig | null = null;
  try {
    stage = new Stage(viewEl, { ariaLabel: 'Replay of the engagement' });
    replay = new ReplayView(stage, { frames: world.recording, roster: rosterFromWorld(world), events: rec.events, units });
    rig = new CameraRig(stage, { source: replay, view: { headingDeg: 20, elevationDeg: 30, distance: setup.range } });
  } catch (e) { console.warn('Debrief: 3D view unavailable', e); }
  bag.add(() => stage?.dispose());

  function applyPerspective(): void {
    replay?.setRadarObserver(radarView ? eng.playerId : null);
    focus = radarView ? eng.playerId : 'all';
    focusSel.setOptions(radarView ? [{ value: eng.playerId, label: 'Ownship' }] : [{ value: 'all', label: 'Whole fight' }, ...ids.map(id => ({ value: id, label: name(id) }))], focus);
    focusSel.setDisabled(radarView);
    applyCam();
    syncUi();
  }
  function applyCam(): void {
    if (!rig) return;
    const f = focus === 'all' ? null : focus;
    if (cam === 'tactical') {
      rig.setMode('orbit');
      if (f) rig.focusOn(f, { distance: radarView ? Math.max(60000, setup.range * 1.8) : 22000 }); else rig.frame(ids, { padding: 1.15, headingDeg: 15, elevationDeg: 28 });
    } else if (cam === 'chase') rig.setMode('chase', { focus: f ?? eng.playerId, lookAt: null });
    else rig.setMode('top', { focus: f ?? eng.playerId, distance: Math.max(60000, setup.range * 1.2) });
  }
  function setTime(t: number): void {
    const tt = Math.max(t0, Math.min(t1, t));
    replay?.setTime(tt);
    cur = tt;
    syncUi();
  }
  let cur = t0;
  function syncUi(): void {
    setText(timeOut, fmtTime(cur));
    setText(bigTime, fmtTime(cur));
    if (document.activeElement !== scrub) scrub.value = String(cur);
    playhead.style.left = pct(cur);
    setText(pictureNote, radarView
      ? replay?.radarSampleTime !== null && replay?.radarSampleTime !== undefined
        ? 'Your radar · ownship and recorded estimates only. Timeline and coaching show whole-fight truth.'
        : 'Your radar · sensor recording unavailable at this time. Timeline and coaching show whole-fight truth.'
      : 'Truth · all aircraft and missiles. Switch to Your radar to compare what your sensors knew.');
  }
  function setPlaying(p: boolean): void {
    playing = p;
    playBtn.setLabel(p ? 'Pause' : 'Play');
    if (p && cur >= t1 - 0.01) setTime(t0);
  }
  function jump(t: number, f: EntityId | null): void {
    setTime(t - 2);
    if (f && rig && !radarView) {
      const isMissile = world.missiles.has(f);
      if (cam !== 'tactical') { cam = 'tactical'; camSeg.set('tactical'); rig.setMode('orbit'); }
      rig.focusOn(f, { distance: isMissile ? 6000 : 20000 });
      replay?.select(f);
      if (!isMissile && ids.includes(f)) { focus = f; focusSel.set(f); }
    }
  }
  function highlight(id: string): void {
    const el = coachList.querySelector<HTMLElement>(`#ci-${CSS.escape(id)}`);
    if (!el) return;
    coachList.querySelectorAll('.is-hl').forEach(x => x.classList.remove('is-hl'));
    el.classList.add('is-hl');
    el.scrollIntoView({ block: 'nearest' });
  }
  bag.on(scrub, 'input', () => { cur = Number(scrub.value); replay?.setTime(cur); syncUi(); });

  const firstShot = inp.shots[0]?.t;
  setTime(o.startAt ?? (firstShot !== undefined ? firstShot - 10 : t0));
  applyPerspective();
  if (rig && o.startAt === undefined && !radarView) rig.frame(ids, { padding: 1.15, headingDeg: 15, elevationDeg: 28, instant: true });

  let uiAcc = 0;
  const onFrame = (dt: number) => {
    if (dt <= 0 || !playing) return;
    cur = Math.min(t1, cur + dt * speed);
    replay?.setTime(cur);
    if (cur >= t1) setPlaying(false);
    uiAcc += dt;
    if (uiAcc > 0.07) { uiAcc = 0; syncUi(); }
  };
  if (stage) stage.onFrame(onFrame);
  else {
    let raf = 0, last = performance.now();
    const loop = (now: number) => { onFrame(Math.min(0.1, (now - last) / 1000)); last = now; raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    bag.add(() => cancelAnimationFrame(raf));
  }

  bag.add(bindKeys({
    Space: () => setPlaying(!playing),
    Left: { down: () => setTime(cur - 5), repeat: true },
    Right: { down: () => setTime(cur + 5), repeat: true },
    Home: () => setTime(t0),
  }));
  setAttr(lab.el, 'data-outcome', result.outcome);
  return { dispose: () => bag.dispose() };
}

export type { CoachItem };
