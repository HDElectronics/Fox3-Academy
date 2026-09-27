/**
 * A-10C II displays sandbox: the HUD, TGP page, TAD and MSG page (src/ui/displays/a10c) in fixed states.
 *   ?t=0.1        view time (blink phase) at start
 *   ?pause=1      freeze the time (blinking stops at ?t)
 *   ?only=hud     one group: hud, tgp, tad, msg (comma separated)
 * The TGP video and the world behind the HUD are procedural stand-ins drawn here.
 */
import '../src/styles/tokens.css';
import '../src/styles/base.css';
import { A10cHud, A10cMsgPage, A10cTadPage, A10cTgpPage, type A10cHudView, type MsgPageView, type TadView, type TgpPageView } from '../src/ui/displays';
import { readTheme } from '../src/ui/theme';

const qs = new URLSearchParams(location.search);
document.documentElement.dataset.cockpit = 'us';
const only = qs.get('only')?.split(',') ?? null;
const paused = qs.get('pause') === '1';
let t = Number(qs.get('t') ?? '0.1') || 0;
const NM = 1852, D = Math.PI / 180;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};
const root = document.getElementById('root')!;
const bar = el('div', 'sb-bar');
bar.append(el('h1', '', 'A-10C II displays'));
root.append(bar);

function card(title: string, sub: string, note = ''): { c: HTMLElement; cv: HTMLCanvasElement; glass: HTMLElement } {
  const c = el('div', 'card');
  const pl = el('div', 'placard');
  pl.append(el('span', '', title), el('span', '', sub));
  const glass = el('div', 'glass');
  const cv = el('canvas');
  glass.append(cv);
  c.append(pl, glass);
  if (note) c.append(el('p', '', note));
  return { c, cv, glass };
}
function group(key: string, title: string): HTMLElement | null {
  if (only && !only.includes(key)) return null;
  const grid = el('div', 'grid');
  root.append(el('h2', '', title), grid);
  return grid;
}

// ------------------------------------------------------------------ procedural pictures

const th = readTheme();
/** Grey pod video: fields, a road and three vehicles near the centre. */
function podVideo(seed: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 640; c.height = 480;
  const x = c.getContext('2d')!;
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  x.fillStyle = '#5a5a5a'; x.fillRect(0, 0, 640, 480);
  for (let i = 0; i < 60; i++) {
    const v = 70 + Math.floor(r() * 60);
    x.fillStyle = `rgb(${v},${v},${v})`;
    x.fillRect(r() * 640 - 60, r() * 480 - 40, 60 + r() * 160, 40 + r() * 120);
  }
  x.strokeStyle = '#a8a8a8'; x.lineWidth = 12;
  x.beginPath(); x.moveTo(0, 330); x.bezierCurveTo(200, 260, 420, 270, 640, 170); x.stroke();
  x.fillStyle = '#1c1c1c';
  for (const [vx, vy] of [[318, 238], [352, 229], [282, 250]]) x.fillRect(vx - 7, vy - 4, 14, 8);
  return c;
}
/** Sky over ground from the theme, horizon rolled a little: the world seen through the HUD. */
function worldView(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 600; c.height = 600;
  const x = c.getContext('2d')!;
  const sky = x.createLinearGradient(0, 0, 0, 300);
  sky.addColorStop(0, th.skyTop); sky.addColorStop(1, th.skyHorizon);
  x.fillStyle = sky; x.fillRect(0, 0, 600, 600);
  x.save(); x.translate(300, 150); x.rotate(-0.1);
  x.fillStyle = th.earth; x.fillRect(-600, 0, 1200, 900);
  x.restore();
  return c;
}
const video = podVideo(7), video2 = podVideo(19), world = worldView();

// ------------------------------------------------------------------ states

const hudBase: A10cHudView = {
  t, heading: 72 * D, pitch: -2 * D, roll: 6 * D, speedKt: 310, altFt: 12400, master: 'NAV', soi: true,
  weapon: null, pipper: null, releaseCue: null, ccrp: null, spi: { az: 4 * D, el: -9 * D }, belowMinAlt: false, laserFiring: false,
};
const HUDS: { title: string; sub: string; note: string; v: Partial<A10cHudView>; overlay?: boolean }[] = [
  { title: 'HUD', sub: 'NAV · SOI', note: 'Asterisk lower left: HUD is SOI. SPI diamond at the steerpoint.', v: {} },
  { title: 'HUD', sub: 'CCIP consent', note: 'Release held: ASL above the pipper, solution cue half way down.', v: { master: 'CCIP', pitch: -15 * D, altFt: 7200, weapon: { id: 'mk82', label: 'MK-82', count: 4 }, pipper: { az: 1 * D, el: -7 * D }, releaseCue: 0.55, spi: { az: 1.2 * D, el: -6.6 * D } } },
  { title: 'HUD', sub: 'CCRP · lasing', note: 'ASL offset by the track error; TTR 4, cue sliding; L flashes.', v: { master: 'CCRP', soi: false, weapon: { id: 'gbu12', label: 'GBU-12', count: 2 }, ccrp: { ttrS: 4, errRad: 1.5 * D }, spi: { az: 1.5 * D, el: -18 * D }, laserFiring: true } },
  { title: 'HUD', sub: 'GUNS · below min', note: 'Gun reticle with an X: below minimum. Overlay over the world.', v: { master: 'GUNS', pitch: -12 * D, altFt: 900, weapon: { id: 'gau8', label: 'GUN', count: 1150 }, pipper: { az: -1 * D, el: -5 * D }, belowMinAlt: true, spi: null }, overlay: true },
];

const tgpBase: TgpPageView = {
  t, on: true, image: video, fov: 'narrow', track: 'point', lss: 'off', lssCode: 1688, laserCode: 1688, laserFiring: false,
  rangeM: 5.3 * NM, rangeSource: 'T', soi: true, isSpi: false, units: 'imperial',
};
const TGPS: { sub: string; note: string; v: Partial<TgpPageView> }[] = [
  { sub: 'STBY', note: 'Pod not on: STBY boxed.', v: { on: false, soi: false } },
  { sub: 'NO VIDEO · NOT SOI', note: 'On without a picture; the other MFCD is SOI.', v: { image: null, soi: false, track: 'none', rangeSource: 'E', rangeM: 7.9 * NM } },
  { sub: 'AREA · WIDE', note: 'Area track, estimate range.', v: { image: video2, fov: 'wide', track: 'area', rangeSource: 'E', rangeM: 8.1 * NM } },
  { sub: 'LSS search', note: 'LSRCH, WSCH, open gate.', v: { fov: 'wide', track: 'none', lss: 'search', rangeSource: 'E', rangeM: 7.2 * NM } },
  { sub: 'LSS detect', note: 'DETECT; OSB 6 now LST.', v: { track: 'none', lss: 'detect' } },
  { sub: 'LTRACK · lasing', note: 'Box on the spot, SPI, L flashes, laser range.', v: { lss: 'track', isSpi: true, laserFiring: true, rangeSource: 'L', rangeM: 4.6 * NM } },
];

const own = { x: 0, z: 0, heading: 35 * D };
const at = (brgDeg: number, nm: number) => ({ x: Math.sin(brgDeg * D) * nm * NM, z: -Math.cos(brgDeg * D) * nm * NM });
const tadBase: TadView = {
  t, own, scaleNm: 20, spi: at(40, 12), steerpoint: { ...at(20, 16), name: 'IP' }, friendlies: [{ ...at(55, 9), label: 'JTAC' }, at(60, 10.5)],
  tasking: { ...at(48, 13), accepted: false }, newTasking: true, cursor: at(48, 13), hooked: 'tasking', soi: true,
};
const TADS: { sub: string; note: string; v: Partial<TadView> }[] = [
  { sub: 'NEW TASKING', note: 'Red triangle and ATTACK flash until WILCO; tasking hooked.', v: {} },
  { sub: 'WILCO · SPI set', note: 'Triangle steady; SPI on the target; JTAC hooked.', v: { newTasking: false, tasking: { ...at(48, 13), accepted: true }, spi: at(48, 13), hooked: 'friendly', cursor: at(55, 9) } },
  { sub: '40 nm · not SOI', note: 'Wider scale, no cursor, no hook.', v: { scaleNm: 40, soi: false, newTasking: false, cursor: null, hooked: null, own: { ...own, heading: 300 * D } } },
];

const LINES: MsgPageView['lines'] = [
  { label: '1', value: 'IP HAWK' }, { label: '2', value: '048 MAG' }, { label: '3', value: '13.2 NM' },
  { label: '4', value: '820 FT MSL' }, { label: '5', value: 'ARMOR 3 BMP' }, { label: '6', value: '37T GG 12345 67890' },
  { label: '7', value: 'LASER 1688' }, { label: '8', value: 'SOUTH 1200 M' }, { label: '9', value: 'EGRESS WEST' },
];
const MSGS: MsgPageView['state'][] = ['new', 'wilco', 'cntco'];

// ------------------------------------------------------------------ build

const draws: ((t: number) => void)[] = [];
const hudGrid = group('hud', 'HUD');
if (hudGrid) for (const h of HUDS) {
  const { c, cv, glass } = card(h.title, h.sub, h.note);
  hudGrid.append(c);
  if (h.overlay) {
    glass.style.background = `linear-gradient(${th.skyTop}, ${th.skyHorizon} 42%, ${th.earth} 42%)`;
  }
  const d = new A10cHud(cv, { overlay: !!h.overlay });
  draws.push(tt => d.draw({ ...hudBase, ...h.v, t: tt }, h.overlay ? null : world));
}
const tgpGrid = group('tgp', 'TGP page (MFCD)');
if (tgpGrid) for (const s of TGPS) {
  const { c, cv } = card('TGP', s.sub, s.note);
  tgpGrid.append(c);
  const d = new A10cTgpPage(cv);
  draws.push(tt => d.draw({ ...tgpBase, ...s.v, t: tt }));
}
const tadGrid = group('tad', 'TAD (MFCD, heading-up, centred)');
if (tadGrid) for (const s of TADS) {
  const { c, cv } = card('TAD', s.sub, s.note);
  tadGrid.append(c);
  const d = new A10cTadPage(cv);
  draws.push(tt => d.draw({ ...tadBase, ...s.v, t: tt }));
}
const msgGrid = group('msg', 'MSG page (digital 9-line)');
if (msgGrid) for (const st of MSGS) {
  const { c, cv } = card('MSG', st.toUpperCase(), st === 'new' ? 'WILCO OSB 19, CNTCO OSB 7.' : `${st.toUpperCase()} sent.`);
  msgGrid.append(c);
  const d = new A10cMsgPage(cv);
  draws.push(() => d.draw({ title: 'CAS 9-LINE', lines: LINES, state: st }));
}

let last = performance.now();
function frame(now: number): void {
  if (!paused) t += Math.min(0.1, (now - last) / 1000);
  last = now;
  for (const f of draws) f(t);
  requestAnimationFrame(frame);
}
for (const f of draws) f(t);
requestAnimationFrame(frame);
