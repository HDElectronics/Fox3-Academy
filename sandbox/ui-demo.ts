/**
 * UI kit harness. Views: ?view=kit (default: every component), ?view=lab (labLayout, one-screen
 * tool), ?view=doc (docLayout). ?skin=ru|us picks the cockpit paint. ?modal=1 opens the result
 * modal, ?toast=1 shows toasts (for screenshots).
 */
import '../src/styles/tokens.css';
import '../src/styles/base.css';
import '../src/styles/components.css';
import { h, cleanup } from '../src/ui/dom';
import {
  button, toggle, segmented, slider, select, chips, tabs, group, row, placard,
  consolePanel, screenBezel, coachBox, checklist, eventLog, readouts, callout, lamp, modal, toast, dataTable,
  labLayout, docLayout, split, pageHeader, bindKeys, kbd, keyHint,
} from '../src/ui/index';
import { readTheme, alpha, type Theme } from '../src/ui/theme';

const params = new URLSearchParams(location.search);
const skin = params.get('skin') === 'us' ? 'us' : 'ru';
const view = params.get('view') ?? 'kit';
document.documentElement.dataset.cockpit = skin;
const root = document.getElementById('app') as HTMLElement;
const bag = cleanup();

// ---------------------------------------------------------------- mock cockpit displays (canvas)

type Painter = (g: CanvasRenderingContext2D, w: number, hgt: number, th: Theme) => void;
const painters = new Set<() => void>();
function canvasOf(paint: Painter): HTMLCanvasElement {
  const c = h('canvas');
  const draw = () => {
    const r = c.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
    const g = c.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    paint(g, r.width, r.height, readTheme());
  };
  const ro = new ResizeObserver(draw);
  ro.observe(c);
  bag.add(() => ro.disconnect());
  painters.add(draw);
  return c;
}

const radarPaint: Painter = (g, w, ht, th) => {
  g.clearRect(0, 0, w, ht);
  const x0 = 34, y0 = 26, x1 = w - 30, y1 = ht - 26;
  g.strokeStyle = alpha(th.sym, 0.22); g.lineWidth = 1;
  for (let i = 1; i < 4; i++) { const y = y0 + ((y1 - y0) * i) / 4; g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); }
  for (let i = 1; i < 4; i++) { const x = x0 + ((x1 - x0) * i) / 4; g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke(); }
  g.strokeStyle = alpha(th.sym, 0.55); g.strokeRect(x0, y0, x1 - x0, y1 - y0);
  g.font = `11px ${th.fontMono}`; g.fillStyle = th.sym; g.textAlign = 'right';
  ['80', '60', '40', '20'].forEach((t, i) => g.fillText(t, x0 - 5, y0 + ((y1 - y0) * i) / 4 + 10));
  // scan limits + caret
  g.strokeStyle = alpha(th.sym, 0.8); g.setLineDash([4, 4]);
  const sl = x0 + (x1 - x0) * 0.22, sr = x0 + (x1 - x0) * 0.78;
  g.beginPath(); g.moveTo(sl, y0); g.lineTo(sl, y1); g.moveTo(sr, y0); g.lineTo(sr, y1); g.stroke(); g.setLineDash([]);
  g.fillStyle = th.sym; g.beginPath(); const cx = x0 + (x1 - x0) * 0.61; g.moveTo(cx, y1 + 1); g.lineTo(cx - 5, y1 + 9); g.lineTo(cx + 5, y1 + 9); g.fill();
  g.shadowColor = th.sym; g.shadowBlur = 6;
  // bricks
  for (const [bx, by, a] of [[0.35, 0.3, 1], [0.37, 0.31, 0.5], [0.66, 0.55, 0.8]] as const) {
    g.fillStyle = alpha(th.sym, a); g.fillRect(x0 + (x1 - x0) * bx - 4, y0 + (y1 - y0) * by - 3, 8, 6);
  }
  // primary track (designation colour) with aspect stick
  const tx = x0 + (x1 - x0) * 0.48, ty = y0 + (y1 - y0) * 0.42;
  g.strokeStyle = th.symHi; g.fillStyle = th.symHi; g.lineWidth = 2;
  g.beginPath(); g.arc(tx, ty, 6, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx - 10, ty + 16); g.stroke();
  g.shadowBlur = 0;
  g.fillStyle = th.symHi; g.textAlign = 'left'; g.fillText('T1  31', tx + 10, ty - 6);
  // DLZ
  g.strokeStyle = th.sym; g.lineWidth = 1.5;
  const dx = x1 + 12; g.beginPath(); g.moveTo(dx, y0 + (y1 - y0) * 0.35); g.lineTo(dx, y0 + (y1 - y0) * 0.8); g.stroke();
  g.beginPath(); g.moveTo(dx - 5, y0 + (y1 - y0) * 0.35); g.lineTo(dx + 5, y0 + (y1 - y0) * 0.35); g.stroke();
  g.beginPath(); g.moveTo(dx - 5, y0 + (y1 - y0) * 0.6); g.lineTo(dx + 5, y0 + (y1 - y0) * 0.6); g.stroke();
  g.fillStyle = th.symHi; g.beginPath(); const ry = y0 + (y1 - y0) * 0.45; g.moveTo(dx - 3, ry); g.lineTo(dx - 11, ry - 5); g.lineTo(dx - 11, ry + 5); g.fill();
};

const rwrPaint: Painter = (g, w, ht, th) => {
  g.clearRect(0, 0, w, ht);
  const cx = w / 2, cy = ht / 2, r = Math.min(w, ht) / 2 - 10;
  g.strokeStyle = alpha(th.sym, 0.35); g.lineWidth = 1;
  for (const k of [1, 0.66, 0.33]) { g.beginPath(); g.arc(cx, cy, r * k, 0, Math.PI * 2); g.stroke(); }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2; g.beginPath();
    g.moveTo(cx + Math.sin(a) * r * 0.94, cy - Math.cos(a) * r * 0.94); g.lineTo(cx + Math.sin(a) * r, cy - Math.cos(a) * r); g.stroke();
  }
  g.font = `bold 13px ${th.fontMono}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = th.sym; g.shadowBlur = 6;
  const sym = (a: number, k: number, t: string, col: string, diamond = false) => {
    const x = cx + Math.sin(a) * r * k, y = cy - Math.cos(a) * r * k;
    g.fillStyle = col; g.strokeStyle = col; g.fillText(t, x, y);
    if (diamond) { g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y - 14); g.lineTo(x + 14, y); g.lineTo(x, y + 14); g.lineTo(x - 14, y); g.closePath(); g.stroke(); }
  };
  sym(0.5, 0.33, '29', th.sym, true);
  sym(-1.2, 0.66, '27', th.sym);
  sym(2.4, 0.8, 'U', alpha(th.sym, 0.6));
  g.shadowBlur = 0;
  g.fillStyle = th.sym; g.beginPath(); g.moveTo(cx, cy - 6); g.lineTo(cx + 4, cy + 5); g.lineTo(cx - 4, cy + 5); g.fill();
};

const skyPaint: Painter = (g, w, ht, th) => {
  const hz = ht * 0.62;
  const sky = g.createLinearGradient(0, 0, 0, hz);
  sky.addColorStop(0, th.skyTop); sky.addColorStop(1, th.skyHorizon);
  g.fillStyle = sky; g.fillRect(0, 0, w, hz);
  const ground = g.createLinearGradient(0, hz, 0, ht);
  ground.addColorStop(0, th.skyHorizon); ground.addColorStop(0.25, th.earth); ground.addColorStop(1, th.earth);
  g.fillStyle = ground; g.fillRect(0, hz, w, ht - hz);
  // scan volume wedge from own jet
  const ox = w * 0.28, oy = ht * 0.5;
  g.fillStyle = alpha(th.sym, 0.1); g.strokeStyle = alpha(th.sym, 0.55); g.lineWidth = 1;
  g.beginPath(); g.moveTo(ox, oy); g.lineTo(w * 0.92, ht * 0.26); g.lineTo(w * 0.92, ht * 0.58); g.closePath(); g.fill(); g.stroke();
  const jet = (x: number, y: number, col: string, dir: 1 | -1) => {
    g.fillStyle = col; g.beginPath(); g.moveTo(x + 14 * dir, y); g.lineTo(x - 8 * dir, y - 6); g.lineTo(x - 4 * dir, y); g.lineTo(x - 8 * dir, y + 6); g.fill();
    g.strokeStyle = alpha(col, 0.5); g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x, y + 8); g.lineTo(x, hz + (y / ht) * 30); g.stroke(); g.setLineDash([]);
  };
  jet(ox, oy, th.friendly, 1);
  jet(w * 0.7, ht * 0.36, th.hostile, -1);
  jet(w * 0.78, ht * 0.45, th.hostile, -1);
  g.fillStyle = th.missile; g.fillRect(w * 0.45, ht * 0.44, 3, 2);
  g.strokeStyle = alpha(th.missile, 0.7); g.beginPath(); g.moveTo(ox + 10, oy - 2); g.quadraticCurveTo(w * 0.38, ht * 0.4, w * 0.45, ht * 0.44); g.stroke();
};

// ---------------------------------------------------------------- shared demo pieces

function skinSwitch(): HTMLElement {
  return segmented<'ru' | 'us'>({
    id: 'skin', ariaLabel: 'Cockpit paint', size: 's', value: skin,
    options: [{ value: 'ru', label: 'RU', title: 'Soviet turquoise' }, { value: 'us', label: 'US', title: 'Gull grey' }],
    onChange: v => { const p = new URLSearchParams(location.search); p.set('skin', v); location.search = p.toString(); },
  }).el;
}
function viewSwitch(): HTMLElement {
  return segmented<string>({
    id: 'view', ariaLabel: 'Harness view', size: 's', value: view,
    options: [{ value: 'kit', label: 'Kit' }, { value: 'lab', label: 'Lab' }, { value: 'doc', label: 'Doc' }],
    onChange: v => { const p = new URLSearchParams(location.search); p.set('view', v); location.search = p.toString(); },
  }).el;
}
function topbar(): HTMLElement {
  return h('header', { class: 'topbar' },
    h('a', { class: 'brand', href: '#' }, h('span', { class: 'brand-mark' }, 'F3'), h('span', { class: 'brand-name' }, 'Fox Three School')),
    h('nav', { class: 'modnav', 'aria-label': 'Modules' },
      ['Hangar', 'Radar', 'TWS', 'Missiles', 'Defense', 'RWR', 'Sortie', 'Cockpit'].map(l =>
        h('a', { href: '#', 'aria-current': l === 'TWS' ? 'page' : 'false' }, l))),
    h('div', { class: 'topbar-right' }, h('span', { class: 'jet-label' }, 'Harness'), skinSwitch()));
}
/** Harness bar under the top bar: view switch. */
function harnessBar(): HTMLElement {
  return h('div', { class: 'harness-bar' }, placard('View', { tag: 'span' }), viewSwitch());
}

const ru = skin === 'ru';
const MODE_OPTS = ru
  ? [{ value: 'rws', label: 'ОБЗ', sub: 'search', keys: '2' }, { value: 'tws', label: 'СНП', sub: 'TWS', keys: 'RAlt+I' }, { value: 'stt', label: 'АТК', sub: 'lock', keys: 'Enter' }]
  : [{ value: 'rws', label: 'RWS', sub: 'search', keys: '2' }, { value: 'tws', label: 'TWS', sub: 'track', keys: 'RAlt+I' }, { value: 'stt', label: 'STT', sub: 'lock', keys: 'Enter' }];

function radarPanel(log: ReturnType<typeof eventLog>) {
  const mode = segmented<string>({ id: 'mode', label: 'Radar mode', value: 'tws', fill: true, options: MODE_OPTS, onChange: v => log.push('Mode ' + v.toUpperCase(), { t: 42 }) });
  const az = segmented<number>({
    id: 'az', label: 'Scan width', value: 30,
    options: [{ value: 10, label: '±10°', sub: '0.9 s' }, { value: 30, label: '±30°', sub: '2.6 s' }, { value: 60, label: '±60°', sub: '5.2 s', disabled: true, title: 'TWS limits the scan to ±30° in DCS' }],
  });
  const bars = segmented<number>({ id: 'bars', label: 'Bars', value: 4, size: 's', options: [1, 2, 4, 6, 8].map(b => ({ value: b, label: String(b) })) });
  const range = slider({ id: 'range', label: 'Display range', min: 10, max: 160, step: 10, value: 80, unit: ru ? 'km' : 'nm', marks: [10, 40, 80, 120, 160] });
  const elev = slider({ id: 'elev', label: 'Antenna elevation', min: -10, max: 10, step: 0.5, value: 2.5, unit: '°', format: v => (v > 0 ? '+' : '') + v.toFixed(1), hint: 'Covers 7 400 – 12 100 m at 60 km.' });
  const p = consolePanel({
    id: 'radar-panel', title: ru ? 'Radar · N001' : 'Radar · APG-63', actions: button({ label: 'Reset', variant: 'ghost', size: 's' }).el,
    children: [mode.el, row(az.el, bars.el), range.el, elev.el],
  });
  return { p, mode, range, elev };
}

function weaponsPanel(log: ReturnType<typeof eventLog>) {
  const wpn = select({
    id: 'wpn', label: 'Selected weapon', value: ru ? 'r27er' : 'aim120c',
    options: ru
      ? [{ value: 'r27er', label: 'R-27ER  ×4', group: 'Fox 1' }, { value: 'r27et', label: 'R-27ET  ×2', group: 'Fox 2' }, { value: 'r73', label: 'R-73  ×2', group: 'Fox 2' }]
      : [{ value: 'aim120c', label: 'AIM-120C  ×6', group: 'Fox 3' }, { value: 'aim7m', label: 'AIM-7M  ×2', group: 'Fox 1' }, { value: 'aim9m', label: 'AIM-9M  ×2', group: 'Fox 2' }],
  });
  const fire = button({ id: 'fire', label: 'Launch', variant: 'primary', keys: ru ? 'Space' : 'RAlt+Space', onClick: () => log.push('Fox ' + (ru ? '1' : '3') + ', T1', { t: 43, tone: 'hi' }) });
  const shoot = button({ id: 'shoot', label: ru ? 'ПР' : 'Shoot', lamp: true, lit: true, title: 'Launch authorised' });
  const unlock = button({ id: 'unlock', label: 'Unlock', keys: 'Backspace' });
  const ecm = toggle({ id: 'ecm', label: 'ECM', keys: 'E', value: false });
  const audio = toggle({ id: 'audio', label: 'RWR audio', style: 'switch', value: true });
  const master = toggle({ id: 'arm', label: 'Master arm', style: 'switch', states: ['SAFE', 'ARM'], value: false });
  const layers = chips({
    id: 'layers', label: '3D layers', value: ['truth', 'scan'],
    options: [{ value: 'truth', label: 'Truth' }, { value: 'tracks', label: 'Track files' }, { value: 'scan', label: 'Scan volume' }, { value: 'notch', label: 'Notch' }],
  });
  const p = consolePanel({
    id: 'wpn-panel', title: 'Weapons',
    children: [wpn.el, row(fire.el, shoot.el, unlock.el),
      row(button({ id: 'fire-lit', label: 'Fire', variant: 'primary', lamp: true, lit: true, keys: ru ? 'Space' : 'RAlt+Space', title: 'Primary, lit (shoot cue)' }).el,
        button({ id: 'fire-lit2', label: 'Fire', variant: 'primary', lit: true, title: 'Primary, lit, no lamp' }).el),
      row(ecm.el, button({ label: 'Chaff', keys: 'Insert', size: 's' }).el, button({ label: 'Flare', keys: 'Delete', size: 's' }).el),
      row(audio.el, master.el), layers.el],
  });
  return { p, fire, ecm };
}

function lampsPanel() {
  const lamps = [
    lamp({ label: 'LOCK', tone: 'caution', state: 'on' }),
    lamp({ label: 'LAUNCH', tone: 'warning', state: 'flash' }),
    lamp({ label: ru ? 'ПР' : 'SHOOT', tone: 'advisory', state: 'on' }),
    lamp({ label: 'DLINK', tone: 'ok', state: 'off' }),
    lamp({ label: 'MSL', tone: 'hi', state: 'on' }),
  ];
  return consolePanel({ id: 'lamps', title: 'Annunciators', dense: true, children: [h('div', { class: 'ui-row' }, lamps.map(l => l.el))] });
}

function dataPanels() {
  const ro = readouts({
    id: 'own', rows: [
      { id: 'alt', label: 'Altitude', value: ru ? '9 000' : '29,500', unit: ru ? 'm' : 'ft' },
      { id: 'spd', label: 'Speed', value: ru ? '1 020' : '550', unit: ru ? 'km/h' : 'kt' },
      { id: 'mach', label: 'Mach', value: '0.92' },
      { id: 'cm', label: 'Chaff / flares', value: '96 / 96' },
      { id: 'rwr', label: 'Spike', value: '2 o\'clock' },
    ],
  });
  ro.setTone('rwr', 'caution');
  const glass = readouts({
    id: 'msl', variant: 'glass', rows: [
      { id: 'm1', label: 'M1 → T1', value: 'A 12', unit: 's' },
      { id: 'm2', label: 'M2 → T2', value: 'T 31', unit: 's' },
      { id: 'rng', label: 'Range', value: '46.2', unit: ru ? 'km' : 'nm' },
    ],
  });
  glass.setTone('m1', 'hi');
  return consolePanel({ id: 'ownship', title: 'Own ship', children: [ro.el, glass.el] });
}

/** Strip data block: plain readouts on the instrument panel (no nested console panel). */
function stripData(): HTMLElement {
  const own = readouts({ id: 'strip-own', rows: [
    { id: 'alt', label: 'Altitude', value: ru ? '9 000' : '29,500', unit: ru ? 'm' : 'ft' },
    { id: 'spd', label: 'Speed', value: ru ? '1 020' : '550', unit: ru ? 'km/h' : 'kt' },
    { id: 'g', label: 'Load', value: '1.0', unit: 'g' },
    { id: 'cm', label: 'Chaff / flares', value: '96 / 96' },
  ] });
  const msl = readouts({ id: 'strip-msl', variant: 'glass', rows: [
    { id: 'm1', label: 'M1 → T1', value: 'A 12', unit: 's' },
    { id: 'm2', label: 'M2 → T2', value: 'T 31', unit: 's' },
  ] });
  msl.setTone('m1', 'hi');
  return h('div', { class: 'ui-strip-block' }, placard('Own ship', { tag: 'div' }), own.el, placard('Missiles', { tag: 'div' }), msl.el);
}

function coachAndSteps(log: ReturnType<typeof eventLog>) {
  const coach = coachBox({
    id: 'coach',
    text: ru ? 'Bandit at 62 km, hot. Put the cursor on him and press Enter: the radar will lock at 0.85 Rmax.' : 'Two tracks firm. Designate the leader, then the wingman, and fire one AIM-120 at each.',
    why: ru ? 'СНП keeps him unaware until the auto-lock. The lock warning starts then.' : 'TWS gives no lock warning; each missile goes to its own designated track.',
  });
  const steps = checklist({
    id: 'steps', steps: [
      { id: 'search', text: ru ? 'Search in ОБЗ, ППС' : 'Search in RWS, 80 nm', keys: '2' },
      { id: 'tws', text: ru ? 'Switch to СНП' : 'Switch to TWS', keys: 'RAlt+I' },
      { id: 'desig', text: 'Designate the leader', keys: 'Enter' },
      { id: 'fire', text: 'Fire inside Rmax', keys: ru ? 'Space' : 'RAlt+Space', note: ru ? 'Hold the lock until impact: R-27ER is SARH.' : 'Crank 50° after the second shot.' },
    ], done: ['search', 'tws'],
  });
  steps.setCurrent('desig');
  const p = consolePanel({ id: 'lesson', title: 'Lesson', children: [coach.el, steps.el, log.el] });
  return { p, coach, steps };
}

function keysPanel() {
  return consolePanel({
    id: 'keys', title: 'Keys (FC3 defaults)', dense: true, children: [h('div', null,
      keyHint({ label: 'RWS / TWS toggle', keys: 'RAlt+I' }),
      keyHint({ label: 'Designate / lock', keys: 'Enter' }),
      keyHint({ label: 'Drop designations', keys: 'Backspace' }),
      keyHint({ label: 'Scan zone', keys: 'RShift + ; , . /' }),
      keyHint({ label: 'Expected range', keys: 'RCtrl+= / RCtrl+−' }),
      keyHint({ label: 'Remove one designation', keys: 'unbound', note: 'Bind "Unlock TWS Target" yourself.' }),
    )],
  });
}

function radarBezel(label = ru ? 'ИЛС · РЛС' : 'VSD', aspect = '4 / 3') {
  return screenBezel({
    id: 'radar-bezel-' + label.length, label, aspect, status: h('span', null, 'TWS'),
    content: canvasOf(radarPaint),
    corners: { tl: ru ? 'СНП  ППС' : 'TWS  80', tr: '4B  ±30', bl: ru ? 'R-27ER 4' : 'AIM-120C 6', br: ru ? '46 км' : '46 NM' },
  });
}
function rwrBezel(aspect = '1') {
  return screenBezel({ id: 'rwr-bezel', label: ru ? 'СПО-15' : 'TEWS', aspect, content: canvasOf(rwrPaint), corners: { tl: 'ALL', br: 'PRI' } });
}

// ---------------------------------------------------------------- views

function kitView() {
  root.append(topbar(), harnessBar());
  const log = eventLog({ id: 'log', title: 'Event log', max: 30 });
  [['Radar on, search', 12], ['T1 new track', 31], ['T1 firm', 34], ['T2 new track', 36], ['Designated T1 (primary)', 40]].forEach(([t, s]) => log.push(String(t), { t: Number(s) }));
  log.push('Bandit spike, 2 o\'clock', { t: 41, tone: 'caution' });

  const radar = radarPanel(log);
  const wpn = weaponsPanel(log);
  const lesson = coachAndSteps(log);

  const tabDemo = tabs({
    id: 'tabs', ariaLabel: 'Reference', tabs: [
      { id: 'binds', label: 'Bindings', content: h('p', { style: 'margin:0' }, 'Default FC3 keys for the selected jet, named as in the DCS controls menu.') },
      { id: 'proc', label: 'Procedures', content: h('p', { style: 'margin:0' }, 'Step-by-step shots: TWS multi-target, STT, support, defend.') },
      { id: 'gloss', label: 'Glossary', content: h('p', { style: 'margin:0' }, 'Pitbull, notch, crank, F-pole, Rmax, Rne.') },
    ],
  });

  const modalDemo = modal({
    id: 'result', title: 'Splash one', tone: 'ok',
    body: [h('p', null, 'R-27ER hit T1 at 38 km after 41 s. You held the lock through the crank.'),
      readouts({ rows: [{ id: 'a', label: 'Launch range', value: '46.2', unit: 'km' }, { id: 'b', label: 'Time of flight', value: '41', unit: 's' }, { id: 'c', label: 'Closest approach', value: '6', unit: 'm' }] }).el,
      callout({ kind: 'simplified', body: 'Fuzing and warhead are a single proximity radius here.' })],
    actions: [{ label: 'Debrief' }, { label: 'Fly again', primary: true, keys: 'Enter' }],
  });
  bag.add(() => modalDemo.destroy());

  const table = dataTable({
    caption: 'Reference ranges, 10 km / M0.9 head-on',
    columns: [{ key: 'name', label: 'Missile', mono: true }, { key: 'fox', label: 'Type' }, { key: 'hot', label: 'Head-on', num: true }, { key: 'cold', label: 'Cold', num: true }],
    rows: [
      { name: 'R-27ER', fox: 'Fox 1 · SARH', hot: '62 km', cold: '22 km' },
      { name: 'R-77', fox: 'Fox 3 · ARH', hot: '50 km', cold: '18 km' },
      { name: 'AIM-120C', fox: 'Fox 3 · ARH', hot: '65 km', cold: '24 km' },
    ],
    highlight: r => r.name === (ru ? 'R-27ER' : 'AIM-120C'),
  });

  const actions = row(
    button({ id: 'open-modal', label: 'Show result', onClick: () => modalDemo.open() }).el,
    button({ id: 'toast-btn', label: 'Toast', onClick: () => toast('Designated T2', { tone: 'hi' }) }).el,
  );

  const page = h('main', { class: 'kit' },
    pageHeader({
      title: 'Cockpit UI kit',
      meta: ru ? 'Su-27 paint · turquoise · amber lamps' : 'F-15C paint · gull grey · green lamps',
      lede: 'Every control, panel and layout piece the pages build on, in the selected cockpit paint. Keys work: try RAlt+I, Enter, Backspace, RShift+; and RCtrl+=.',
      actions,
    }),
    h('div', { class: 'kit-grid' },
      h('div', { class: 'kit-col' }, radar.p.el, wpn.p.el, lampsPanel().el),
      h('div', { class: 'kit-col' },
        radarBezel().el,
        dataPanels().el,
        consolePanel({ id: 'notes', title: 'Callouts', children: [
          callout({ kind: 'simplified', body: 'Radar returns are one brick per sweep; DCS also models PRF-dependent detection.' }),
          callout({ kind: 'dcs', body: 'Pressing Enter on the PDT or any SDT commands STT on that target. You cannot reorder designations.' }),
          callout({ kind: 'real', body: 'The real F-15C has Velocity Search and Super Search. FC3 does not.' }),
        ] }).el),
      h('div', { class: 'kit-col' }, lesson.p.el, keysPanel().el,
        consolePanel({ id: 'tabs-panel', title: 'Tabs', children: [tabDemo.el] }).el)),
    h('section', { class: 'kit-wide' }, placard('Split: display + display (stacks when its own box is under 480 px)', { tag: 'div' }),
      split({ items: [radarBezel(ru ? 'ИПВ' : 'DDI', '4 / 3').el, rwrBezel('4 / 3').el], columns: '1fr 1fr' })),
    h('section', { class: 'kit-wide' }, placard('Data table on the ground surface', { tag: 'div' }), table));
  root.append(page);

  // Keyboard demo: DCS chords drive the controls.
  bag.add(bindKeys({
    'RAlt+I': () => { const v = radar.mode.value === 'tws' ? 'rws' : 'tws'; radar.mode.set(v, true); },
    'Enter': () => { radar.mode.set('stt', true); lesson.steps.setDone('desig'); lesson.steps.setCurrent('fire'); },
    'Backspace': () => { radar.mode.set('rws', true); log.push('Designations dropped', { t: 44 }); },
    'RShift+; / RShift+.': { down: e => radar.elev.set(radar.elev.value + (e.code === 'Semicolon' ? 0.5 : -0.5)), repeat: true },
    'RCtrl+= / RCtrl+−': e => radar.range.set(radar.range.value + (e.code === 'Equal' ? 10 : -10)),
    'E': () => wpn.ecm.toggle(),
    'Insert': () => toast('Chaff 95', { tone: 'dim' }),
    'Delete': () => toast('Flare 95', { tone: 'dim' }),
  }));

  if (params.get('modal') === '1') modalDemo.open();
  if (params.get('toast') === '1') { toast('Designated T2', { tone: 'hi', ms: 0 }); toast('Missile launch, 11 o\'clock', { tone: 'warning', ms: 0 }); }
}

function labView() {
  root.append(topbar(), harnessBar());
  const log = eventLog({ id: 'lablog', max: 30 });
  [['Radar on, search', 12], ['T1 new track', 31], ['T1 firm', 34], ['T2 new track', 36]].forEach(([t, s]) => log.push(String(t), { t: Number(s) }));
  log.push('Bandit spike, 2 o\'clock', { t: 41, tone: 'caution' });
  const radar = radarPanel(log);
  const lesson = coachAndSteps(log);
  const viewport = h('div', null, canvasOf(skyPaint));
  (viewport.firstElementChild as HTMLElement).classList.add('ui-fill');
  const lay = labLayout({
    id: 'lab',
    header: { title: 'Track while scan', meta: ru ? 'Su-27 · N001 · FC3' : 'F-15C · APG-63 · FC3', lede: ru ? 'СНП: one target, silent until the auto-lock.' : 'TWS: several tracks, several AIM-120s, no lock warning.' },
    viewport,
    strip: [radarBezel().el, rwrBezel().el, stripData()],
    console: [lesson.p.el, radar.p.el, consolePanel({ id: 'lab-notes', title: 'Notes', children: [callout({ kind: 'simplified', body: 'The scan pattern is idealised; bar overlap is ignored.' })] }).el],
  });
  lay.overlay('tr', segmented<string>({ id: 'cam', ariaLabel: 'Camera', size: 's', value: 'tac', options: [{ value: 'tac', label: 'Tactical' }, { value: 'chase', label: 'Chase' }, { value: 'top', label: 'Top' }] }).el);
  lay.overlay('bl', chips({ id: 'lab-layers', ariaLabel: '3D layers', value: ['truth', 'scan'], options: [{ value: 'truth', label: 'Truth' }, { value: 'scan', label: 'Scan volume' }, { value: 'tracks', label: 'Track files' }] }).el);
  root.append(lay.el);
  bag.add(bindKeys({ 'RAlt+I': () => radar.mode.set(radar.mode.value === 'tws' ? 'rws' : 'tws', true) }));
  if (params.get('modal') === '1') {
    const m = modal({ id: 'lab-result', title: 'Missile defeated', tone: 'ok', within: lay.view, body: h('p', null, 'The R-77 lost you in the notch at 14 km. You were beaming for 9 s with 6 chaff.'), actions: [{ label: 'Retry', primary: true, keys: 'Enter' }] });
    m.open();
    bag.add(() => m.destroy());
  }
}

function docView() {
  root.append(topbar(), harnessBar());
  const para = (t: string) => h('p', null, t);
  const doc = docLayout({
    title: 'Cockpit reference',
    meta: ru ? 'Su-27S · FC3 · keyboard defaults' : 'F-15C · FC3 · keyboard defaults',
    lede: 'Default keys, procedures and the numbers that matter for BVR, named as in the DCS controls menu.',
    sections: [
      { id: 'radar', title: 'Radar', content: [para('Radar on with I, search with 2. RAlt+I toggles RWS and TWS. In TWS the scan is limited to ±30°, slewable across ±60°.'),
        h('div', null, keyHint({ label: 'Radar on/off', keys: 'I' }), keyHint({ label: 'RWS / TWS', keys: 'RAlt+I' }), keyHint({ label: 'PRF', keys: 'RShift+I' }), keyHint({ label: 'Scan zone', keys: 'RShift + ; , . /' })),
        callout({ kind: 'dcs', body: 'The manual\'s quick reference says RCtrl+I for TWS; that key is Target Designator To Center.' })] },
      { id: 'tws', title: 'Designating in TWS', content: [para('The first Enter on a contact makes it the PDT. Each further Enter on another contact adds an SDT, up to four. Enter again on the PDT or any SDT commands STT on it.'), para('Backspace drops all designations. You cannot reorder them: undesignate and designate again.')] },
      { id: 'missiles', title: 'Missiles', content: [para('Reference ranges from the research notes. Your real shot depends on altitude, speed and target aspect.'),
        dataTable({ columns: [{ key: 'n', label: 'Missile', mono: true }, { key: 's', label: 'Seeker' }, { key: 'r', label: 'Head-on', num: true }], rows: [{ n: 'R-27ER', s: 'SARH', r: '62 km' }, { n: 'AIM-120C', s: 'ARH', r: '65 km' }, { n: 'AIM-7M', s: 'SARH', r: '45 km' }] })] },
      { id: 'defend', title: 'Defending', content: [para('Beam the missile to put it in the notch: its closure against the ground drops below the seeker\'s Doppler gate. Chaff helps only while you are in the notch.'), callout({ kind: 'simplified', body: 'Chaff effectiveness is one number per missile here.' })] },
      { id: 'sources', title: 'Sources', content: [para('ED F-15C FC3 Flight Manual (2014); Su-27 FC3 manual; community datamines where noted.')] },
    ],
  });
  root.append(doc.el);
  bag.add(() => doc.destroy());
}

const selftest = params.get('selftest') === '1';
if (selftest) root.append(h('p', { class: 'placeholder' }, 'Self-test running; results in the console.'));
else if (view === 'lab') labView();
else if (view === 'doc') docView();
else kitView();

// Harness-only layout for the kit gallery (the kit itself has no page grid).
const style = h('style', null, `
  .kit { padding: 20px 16px 64px; max-width: 1480px; margin: 0 auto; display: grid; grid-template-columns: minmax(0, 1fr); gap: 20px; width: 100%; }
  .harness-bar { display: flex; align-items: center; gap: 10px; padding: 6px 16px; border-bottom: 1px solid var(--s-rule); }
  body:has(.ui-lab) .harness-bar { display: none; }
  .kit-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; align-items: start; }
  .kit-col { display: grid; gap: 8px; min-width: 0; }
  .kit-wide { display: grid; gap: 8px; }
  @media (max-width: 1100px) { .kit-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 700px) { .kit-grid { grid-template-columns: minmax(0, 1fr); } }
`);
document.head.append(style);
addEventListener('pagehide', () => bag.dispose());

// Overflow probe for screenshots: report anything wider than the viewport.
setTimeout(() => {
  const vw = document.documentElement.clientWidth;
  const sw = document.documentElement.scrollWidth;
  if (sw > vw) {
    const wide = [...document.querySelectorAll<HTMLElement>('body *')]
      .filter(e => e.getBoundingClientRect().right > vw + 1)
      .slice(0, 8).map(e => e.tagName.toLowerCase() + '.' + [...e.classList].join('.') + ' r=' + Math.round(e.getBoundingClientRect().right));
    console.error(`OVERFLOW scrollWidth ${sw} > ${vw}: ` + wide.join(' | '));
  } else console.error(`no horizontal overflow (${sw} <= ${vw})`);
}, 1200);

if (selftest) void import('./ui-selftest').then(m => m.runSelfTest());
