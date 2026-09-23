/**
 * [OWNER: page-strike] Su-25T sortie debrief. Over the 3D view: a plan-view truth replay of World.recording
 * (play, speed, area / target zoom) above a timeline with event markers and lanes for laser-on intervals, time
 * inside SAM rings and the gun envelope; click or drag to seek. In the console: score and stars, per-weapon results
 * with miss reasons, each guided launch with its gimbal margin, laser bursts, ring times, events (click to seek)
 * and the coaching lines.
 */
import { fmtTime } from '../../app/format';
import type { EntityId } from '../../sim/types';
import { AG_WEAPONS } from '../../data/agWeapons';
import { h, cleanup, segmented, button, placard, dataTable } from '../../ui';
import { readTheme, alpha, type Theme } from '../../ui/theme';
import { weaponRows, type Interval, type Marker, type SortieScore, type SortieShot, type SortieSummary } from './sortie';
import { AREA_VIEW, TARGET_VIEW, drawPlan, frameTimes, type MapScene, type MapView } from './sortieMap';
import type { RecordFrame } from '../../sim/types';

export interface SortieDebriefOptions {
  /** Overlay host (the lab viewport) and the console host for the results. */
  view: HTMLElement;
  panel: HTMLElement;
  frames: RecordFrame[];
  scene: MapScene;
  meId: EntityId;
  summary: SortieSummary;
  score: SortieScore;
  markers: Marker[];
  onAgain(): void;
  onBrief(): void;
  /** Start the replay here (s); default the first launch minus 5 s. */
  startAt?: number;
}

const LANES: { id: 'laser' | 'ring' | 'gun'; label: string }[] = [
  { id: 'laser', label: 'ЛД' }, { id: 'ring', label: 'SAM ring' }, { id: 'gun', label: 'Gun' },
];
const SPEEDS = [1, 4, 16] as const;

export function mountSortieDebrief(o: SortieDebriefOptions): { dispose(): void } {
  const bag = cleanup();
  const th: Theme = readTheme();
  const s = o.summary, sc = o.score;
  const times = frameTimes(o.frames);
  const endT = Math.max(s.t, times[times.length - 1] ?? 0);
  const firstLaunch = s.shots[0]?.t;
  let t = Math.max(0, Math.min(endT, o.startAt ?? (firstLaunch != null ? firstLaunch - 5 : 0)));
  let playing = false, speed: typeof SPEEDS[number] = 4, view: MapView = AREA_VIEW;

  // ───────────────────────────── replay overlay
  const map = h('canvas', { class: 'strk-sdb__map', role: 'img', 'aria-label': 'Sortie replay, plan view, north up' });
  const tl = h('canvas', { class: 'strk-sdb__tl', role: 'slider', tabindex: '0', 'aria-label': 'Replay time', 'aria-valuemin': '0', 'aria-valuemax': String(Math.round(endT)) });
  const clock = h('span', { class: 'strk-sdb__clock' });
  const playBtn = button({ label: 'Play', size: 's', onClick: () => { if (t >= endT) t = 0; playing = !playing; playBtn.setLabel(playing ? 'Pause' : 'Play'); loop(); } });
  const speedSeg = segmented<string>({ id: 'strk-sdb-speed', ariaLabel: 'Replay speed', size: 's', value: `${speed}`, options: SPEEDS.map(x => ({ value: `${x}`, label: `${x}×` })), onChange: v => { speed = Number(v) as typeof speed; } });
  const viewSeg = segmented<string>({ id: 'strk-sdb-view', ariaLabel: 'Map zoom', size: 's', value: 'area', options: [{ value: 'area', label: 'Area' }, { value: 'target', label: 'Target' }], onChange: v => { view = v === 'target' ? TARGET_VIEW : AREA_VIEW; draw(); } });
  const overlay = h('section', { class: 'strk-sdb', 'aria-label': 'Sortie replay' },
    h('div', { class: 'strk-sdb__bar' }, h('span', { class: 'strk-sdb__title' }, 'Replay · truth'), playBtn.el, speedSeg.el, viewSeg.el, clock),
    h('div', { class: 'strk-sdb__mapbox' }, map),
    tl);
  o.view.append(overlay);
  bag.add(() => overlay.remove());

  const fit = (c: HTMLCanvasElement) => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(c.clientWidth * dpr)), hh = Math.max(1, Math.round(c.clientHeight * dpr));
    if (c.width !== w || c.height !== hh) { c.width = w; c.height = hh; }
    return dpr;
  };

  function draw(): void {
    const dm = fit(map), ctx = map.getContext('2d');
    if (ctx) {
      ctx.setTransform(dm, 0, 0, dm, 0, 0);
      drawPlan(ctx, map.width / dm, map.height / dm, th, o.scene, view, { frames: o.frames, times, t, meId: o.meId });
    }
    drawTimeline();
    clock.textContent = `${fmtTime(t)} / ${fmtTime(endT)}`;
    tl.setAttribute('aria-valuenow', String(Math.round(t)));
    tl.setAttribute('aria-valuetext', fmtTime(t));
  }

  const LABEL_W = 70, MARK_H = 16, LANE_H = 14;
  function drawTimeline(): void {
    const dm = fit(tl), ctx = tl.getContext('2d');
    if (!ctx) return;
    const w = tl.width / dm, hh = tl.height / dm;
    ctx.setTransform(dm, 0, 0, dm, 0, 0);
    ctx.fillStyle = th.panel2 || th.screen; ctx.fillRect(0, 0, w, hh);
    const X = (x: number) => LABEL_W + (w - LABEL_W - 8) * (endT > 0 ? x / endT : 0);
    ctx.font = `11px ${th.fontMono}`; ctx.textBaseline = 'middle';
    const lane = (i: number) => MARK_H + 4 + i * (LANE_H + 4);
    const bars = (row: number, list: readonly Interval[], col: string) => {
      ctx.fillStyle = col;
      for (const iv of list) { const a = X(iv.from), b = X(iv.to ?? endT); ctx.fillRect(a, lane(row), Math.max(2, b - a), LANE_H); }
    };
    LANES.forEach((l, i) => { ctx.fillStyle = th.panelMuted; ctx.textAlign = 'left'; ctx.fillText(l.label, 6, lane(i) + LANE_H / 2); });
    bars(0, s.laserIntervals, th.caution);
    bars(1, s.rings.flatMap(r => r.intervals), alpha(th.hostile, 0.85));
    bars(2, gunIntervals, alpha(th.warning, 0.85));
    ctx.fillStyle = th.panelMuted; ctx.fillText('Events', 6, MARK_H / 2 + 2);
    for (const m of o.markers) {
      ctx.fillStyle = toneCol(m.tone);
      const x = X(m.t);
      ctx.fillRect(x - 1, 3, 3, MARK_H - 3);
    }
    // playhead
    ctx.strokeStyle = th.panelInk; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(t), 0); ctx.lineTo(X(t), hh); ctx.stroke();
  }
  const toneCol = (tone: Marker['tone']) => (tone === 'ok' ? th.ok : tone === 'caution' ? th.caution : tone === 'warning' ? th.warning : th.panelMuted);
  const gunIntervals = s.aaaIntervals;

  const seekFromX = (clientX: number) => {
    const r = tl.getBoundingClientRect();
    const f = (clientX - r.left - LABEL_W) / Math.max(1, r.width - LABEL_W - 8);
    t = Math.max(0, Math.min(endT, f * endT));
    draw();
  };
  let dragging = false;
  bag.on(tl, 'pointerdown', (e: Event) => { dragging = true; seekFromX((e as PointerEvent).clientX); });
  bag.on(window, 'pointermove', (e: Event) => { if (dragging) seekFromX((e as PointerEvent).clientX); });
  bag.on(window, 'pointerup', () => { dragging = false; });
  bag.on(tl, 'keydown', (e: Event) => {
    const k = (e as KeyboardEvent).key;
    if (k === 'ArrowRight' || k === 'ArrowLeft') { e.preventDefault(); t = Math.max(0, Math.min(endT, t + (k === 'ArrowRight' ? 5 : -5))); draw(); }
  });

  let raf = 0, last = 0;
  function loop(): void {
    cancelAnimationFrame(raf);
    if (!playing) { draw(); return; }
    last = performance.now();
    const step = (now: number) => {
      t = Math.min(endT, t + ((now - last) / 1000) * speed); last = now;
      draw();
      if (t >= endT) { playing = false; playBtn.setLabel('Play'); return; }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }
  bag.add(() => cancelAnimationFrame(raf));
  const ro = new ResizeObserver(() => draw());
  ro.observe(map); ro.observe(tl);
  bag.add(() => ro.disconnect());

  // ───────────────────────────── results in the console
  const seek = (x: number) => { t = Math.max(0, Math.min(endT, x)); playing = false; playBtn.setLabel('Play'); draw(); };
  const stars = '★'.repeat(sc.stars) + '☆'.repeat(3 - sc.stars);
  const guided = s.shots.filter(x => x.guided && x.weapon !== 'gun25t');
  const result = (x: SortieShot) => (x.result === 'hit' ? 'Hit' : x.reason && x.reason !== 'hit' ? `Miss: ${x.reason}` : 'Miss');
  const deg = (v: number | null) => (v == null ? '—' : `${v.toFixed(0)}°`);
  const rows = weaponRows(s.shots);
  const panel = h('div', { class: 'strk-sdb-res' },
    h('p', { class: 'strk-debrief__stars', 'aria-label': `${sc.stars} of 3 stars` }, stars),
    h('p', { class: 'strk-sdb-res__score' }, h('strong', null, sc.title), ` · score ${sc.score} / 100`),
    h('ul', { class: 'strk-sdb-res__lines' }, sc.lines.map(l => h('li', null, l))),
    placard('Weapons'),
    rows.length ? dataTable({
      caption: 'Results per weapon',
      columns: [
        { key: 'label', label: 'Store' },
        { key: 'fired', label: 'Fired', num: true },
        { key: 'hits', label: 'Hit', num: true },
        { key: 'misses', label: 'Misses', cell: r => Object.entries(r.misses).map(([k, n]) => `${n} ${k}`).join(', ') || '—' },
      ],
      rows,
    }) : h('p', { class: 'strk-sdb-res__none' }, 'Nothing fired.'),
    guided.length ? h('div', null, placard('Guided launches'), dataTable({
      caption: 'Gimbal margin: Shkval ±35° / +15..−85°, Kh-58 ±30°',
      columns: [
        { key: 't', label: 'Time', mono: true, cell: x => h('button', { type: 'button', class: 'strk-sdb-res__seek', onclick: () => seek(x.t - 2) }, fmtTime(x.t)) },
        { key: 'weapon', label: 'Store', cell: x => AG_WEAPONS[x.weapon].hudLabel },
        { key: 'rangeM', label: 'Range', num: true, cell: x => (x.rangeM != null ? `${(x.rangeM / 1000).toFixed(1)} km` : '—') },
        { key: 'launchMarginDeg', label: 'Margin', num: true, cell: x => deg(x.launchMarginDeg) },
        { key: 'minMarginDeg', label: 'Min', num: true, cell: x => deg(x.minMarginDeg) },
        { key: 'result', label: 'Result', cell: x => result(x) },
      ],
      rows: guided,
    })) : null,
    placard('Laser and threats'),
    h('ul', { class: 'strk-sdb-res__lines' },
      h('li', null, s.laserIntervals.length ? `ЛД: ${s.laserIntervals.map(i => `${fmtTime(i.from)}–${fmtTime(i.to ?? s.t)}`).join(', ')}` : 'ЛД never on'),
      s.rings.map(r => h('li', null, `${r.name} ring (${(r.ringM / 1000).toFixed(0)} km): ${Math.round(r.s)} s inside`)),
      h('li', null, `ZSU-23-4 envelope: ${Math.round(s.aaaS)} s (trainer rule, not verified)`),
      h('li', null, `Ingress below 150 m: ${Math.round(s.lowFrac * 100)} %${s.ipReached ? '' : ', IP not flown'}`)),
    sc.coaching.length ? h('div', null, placard('Coaching'), h('ul', { class: 'strk-sdb-res__lines' }, sc.coaching.map(l => h('li', null, l)))) : null,
    placard('Events'),
    h('ol', { class: 'strk-sdb-res__events' }, o.markers.map(m => h('li', null,
      h('button', { type: 'button', class: `strk-sdb-res__seek is-${m.tone}`, onclick: () => seek(m.t - 2) }, fmtTime(m.t)), ` ${m.text}`))),
    h('div', { class: 'strk-row' },
      button({ label: 'Fly again', id: 'strk-sdb-again', onClick: () => o.onAgain() }).el,
      button({ label: 'Brief', variant: 'primary', id: 'strk-sdb-brief', onClick: () => o.onBrief() }).el),
  );
  o.panel.append(panel);
  bag.add(() => panel.remove());
  draw();
  return { dispose: () => bag.dispose() };
}
