/**
 * Displays sandbox: every radar format and RWR driven by a scripted fake scenario (bricks, tracks,
 * designations, locks, missiles, RWR search / lock / launch / active missile).
 *   ?skin=ru          Soviet cockpit tokens
 *   ?t=28             start the 60 s scenario loop at t (default 28, a busy moment)
 *   ?only=f15c        one display (radar: su27 mig29s f15c fa18c f16c jf17 f14b f14g m2000c; rwr: rwr-<id>)
 *   ?pause=1          freeze the scenario (blinking continues)
 */
import '../src/styles/tokens.css';
import '../src/styles/base.css';
import { AIRCRAFT } from '../src/data/aircraft';
import { MISSILES } from '../src/data/missiles';
import { RWRS } from '../src/data/rwr';
import type { AircraftId, DisplayFormat, MissileId, RwrId } from '../src/data/types';
import type { EntityId, MissileGuidance, RadarPicture, RwrContact } from '../src/sim/types';
import { DlzBar, MissileTimeline, RadarDisplay, RwrAudio, RwrDisplay } from '../src/ui/displays';

const qs = new URLSearchParams(location.search);
document.documentElement.dataset.cockpit = qs.get('skin') === 'ru' ? 'ru' : 'us';
const LOOP = 60;
const D2R = Math.PI / 180, NM = 1852, KM = 1000;

// ------------------------------------------------------------------ truth (own ship heads north at 260 m/s, 9,000 m)

interface Tgt { id: string; e0: number; n0: number; hdg: number; v: number; alt: number; friendly: boolean }
const OWN_V = 260, OWN_ALT = 9000;
const tgt = (id: string, rangeKm: number, azDeg: number, hdgDeg: number, v: number, alt: number, friendly = false): Tgt => ({
  id, e0: Math.sin(azDeg * D2R) * rangeKm * KM, n0: Math.cos(azDeg * D2R) * rangeKm * KM, hdg: hdgDeg * D2R, v, alt, friendly,
});
const TGTS: Tgt[] = [
  tgt('b1', 74, -6, 176, 250, 8200),
  tgt('b2', 68, 14, 205, 270, 10400),
  tgt('b3', 86, 34, 262, 230, 6100),
  tgt('b4', 52, -30, 10, 235, 4200),
  tgt('f1', 30, 6, 2, 235, 7000, true),
];

interface Rel { id: string; az: number; range: number; alt: number; relHeading: number; speed: number; aspectDeg: number; closure: number; friendly: boolean }
function relAt(tg: Tgt, t: number): Rel {
  const e = tg.e0 + Math.sin(tg.hdg) * tg.v * t, n = tg.n0 + Math.cos(tg.hdg) * tg.v * t;
  const pe = e, pn = n - OWN_V * t;
  const range = Math.hypot(pe, pn);
  const we = Math.sin(tg.hdg) * tg.v, wn = Math.cos(tg.hdg) * tg.v - OWN_V;
  const closure = -(pe * we + pn * wn) / range;
  const ve = Math.sin(tg.hdg), vn = Math.cos(tg.hdg);
  const aspect = Math.acos(Math.max(-1, Math.min(1, (ve * -pe + vn * -pn) / range))) / D2R;
  return { id: tg.id, az: Math.atan2(pe, pn), range, alt: tg.alt, relHeading: tg.hdg, speed: tg.v, aspectDeg: aspect, closure, friendly: tg.friendly };
}

// ------------------------------------------------------------------ scripted radar per jet

interface Shot { id: string; target: string; t0: number; tta0: number | null; tti0: number; missile: MissileId }
interface Script {
  type: AircraftId;
  format: DisplayFormat;
  title: string;
  rangeScale: number;
  mode(t: number): 'rws' | 'tws' | 'stt';
  designations(t: number): string[];
  lock(t: number): string | null;
  shots: Shot[];
  dlz: { rmax: number; rne: number; rmin: number; rtr?: number; rpi?: number };
  cue: string;
  tidStab?: 'aircraft' | 'ground';
}

const des = (t: number, list: [number, string][]) => list.filter(([at]) => t >= at).map(([, id]) => id);

const SCRIPTS: Record<string, Script> = {
  su27: {
    type: 'su27', format: 'ru-hud', title: 'Su-27 · ИЛС', rangeScale: 100 * KM,
    mode: t => (t < 8 ? 'rws' : t < 18 ? 'tws' : 'stt'), designations: t => (t >= 11 ? ['b1'] : []), lock: t => (t >= 18 ? 'b1' : null),
    shots: [{ id: 'r1', target: 'b1', t0: 24, tta0: null, tti0: 38, missile: 'r27er' }],
    dlz: { rmax: 62 * KM, rne: 26 * KM, rmin: 2.5 * KM }, cue: 'ПР',
  },
  mig29s: {
    type: 'mig29s', format: 'ru-hud', title: 'MiG-29S · СНП2', rangeScale: 100 * KM,
    mode: t => (t < 8 ? 'rws' : 'tws'), designations: t => des(t, [[11, 'b1'], [14, 'b2']]), lock: () => null,
    shots: [{ id: 'm1', target: 'b1', t0: 26, tta0: 16, tti0: 40, missile: 'r77' }, { id: 'm2', target: 'b2', t0: 26, tta0: 14, tti0: 36, missile: 'r77' }],
    dlz: { rmax: 58 * KM, rne: 24 * KM, rmin: 2 * KM }, cue: 'ПР',
  },
  f15c: {
    type: 'f15c', format: 'f15-vsd', title: 'F-15C · VSD', rangeScale: 80 * NM,
    mode: t => (t < 8 ? 'rws' : 'tws'), designations: t => des(t, [[12, 'b1'], [15, 'b2'], [18, 'b3']]), lock: () => null,
    shots: [{ id: 'a1', target: 'b1', t0: 21, tta0: 22, tti0: 48, missile: 'aim120c' }, { id: 'a2', target: 'b2', t0: 25, tta0: 20, tti0: 44, missile: 'aim120c' }],
    dlz: { rmax: 72 * KM, rne: 30 * KM, rmin: 3 * KM, rpi: 60 * KM, rtr: 30 * KM }, cue: '*',
  },
  fa18c: {
    type: 'fa18c', format: 'mfd', title: 'F/A-18C · ATTK RDR', rangeScale: 80 * NM,
    mode: t => (t < 8 ? 'rws' : 'tws'), designations: t => des(t, [[10, 'b2'], [13, 'b1']]), lock: () => null,
    shots: [{ id: 'h1', target: 'b2', t0: 19, tta0: 20, tti0: 44, missile: 'aim120c' }, { id: 'h2', target: 'b1', t0: 24, tta0: 21, tti0: 46, missile: 'aim120c' }],
    dlz: { rmax: 68 * KM, rne: 28 * KM, rmin: 3 * KM }, cue: 'SHOOT',
  },
  f16c: {
    type: 'f16c', format: 'mfd', title: 'F-16C · FCR', rangeScale: 80 * NM,
    mode: t => (t < 8 ? 'rws' : 'tws'), designations: t => des(t, [[12, 'b1'], [16, 'b2']]), lock: () => null,
    shots: [{ id: 'v1', target: 'b1', t0: 12, tta0: 12, tti0: 22, missile: 'aim120c' }, { id: 'v2', target: 'b2', t0: 22, tta0: 22, tti0: 46, missile: 'aim120c' }],
    dlz: { rmax: 66 * KM, rne: 27 * KM, rmin: 3 * KM, rpi: 60 * KM, rtr: 27 * KM }, cue: 'SHOOT',
  },
  jf17: {
    type: 'jf17', format: 'mfd', title: 'JF-17 · RDR', rangeScale: 80 * NM,
    mode: t => (t < 8 ? 'rws' : 'tws'), designations: t => des(t, [[12, 'b1'], [16, 'b2']]), lock: () => null,
    shots: [{ id: 'j1', target: 'b1', t0: 23, tta0: 20, tti0: 45, missile: 'sd10' }],
    dlz: { rmax: 64 * KM, rne: 26 * KM, rmin: 3 * KM }, cue: 'SHOOT',
  },
  f14b: {
    type: 'f14b', format: 'tid', title: 'F-14B · TID A/C STAB', rangeScale: 50 * NM,
    mode: t => (t < 8 ? 'rws' : 'tws'), designations: t => des(t, [[10, 'b1'], [10.5, 'b2'], [11, 'b3'], [11.5, 'b4']]), lock: () => null,
    shots: [
      { id: 'p1', target: 'b1', t0: 18, tta0: 28, tti0: 44, missile: 'aim54c' },
      { id: 'p2', target: 'b2', t0: 21, tta0: 26, tti0: 42, missile: 'aim54c' },
    ],
    dlz: { rmax: 110 * KM, rne: 45 * KM, rmin: 5 * KM }, cue: 'IN RNG', tidStab: 'aircraft',
  },
  f14g: {
    type: 'f14b', format: 'tid', title: 'F-14B · TID GND STAB', rangeScale: 100 * NM,
    mode: t => (t < 8 ? 'rws' : 'tws'), designations: t => des(t, [[10, 'b4'], [10.5, 'b1']]), lock: () => null,
    shots: [{ id: 'q1', target: 'b4', t0: 20, tta0: 8, tti0: 26, missile: 'aim54c' }],
    dlz: { rmax: 110 * KM, rne: 45 * KM, rmin: 5 * KM }, cue: 'IN RNG', tidStab: 'ground',
  },
  m2000c: {
    type: 'm2000c', format: 'vtb', title: 'M-2000C · VTB', rangeScale: 40 * NM,
    mode: t => (t < 15 ? 'rws' : 'stt'), designations: () => [], lock: t => (t >= 15 ? 'b1' : null),
    shots: [{ id: 's1', target: 'b1', t0: 24, tta0: null, tti0: 30, missile: 's530d' }],
    dlz: { rmax: 44 * KM, rne: 20 * KM, rmin: 2 * KM }, cue: 'TIR',
  },
};

class FakeRadar {
  hits = new Map<string, { first: number; last: number; n: number; rel: Rel }>();
  private prevBeam = 0;
  private clicked: string[] | null = null;
  constructor(readonly s: Script) {}

  scan(t: number) {
    const mode = this.s.mode(t);
    const des0 = this.designations(t)[0];
    const d0 = des0 ? TGTS.find(x => x.id === des0) : undefined;
    const azHalf = (mode === 'tws' ? 30 : this.s.format === 'ru-hud' ? 30 : 60) * D2R;
    const azCenter = mode === 'tws' && d0 ? Math.max(-30 * D2R, Math.min(30 * D2R, relAt(d0, t).az)) : 0;
    const bars = mode === 'tws' ? 2 : 4;
    const spacing = AIRCRAFT[this.s.type].radar.barSpacingDeg * D2R;
    const sweepT = (2 * azHalf) / (70 * D2R);
    const frameTime = sweepT * bars;
    const ph = ((t % frameTime) / frameTime) * bars;
    const bar = Math.min(bars - 1, Math.floor(ph));
    const fr = ph - bar;
    const beamAz = azCenter + azHalf * (bar % 2 === 0 ? -1 + 2 * fr : 1 - 2 * fr);
    const elCenter = -1.2 * D2R;
    const beamEl = elCenter + (bar - (bars - 1) / 2) * spacing;
    return { mode, azHalf, azCenter, bars, bar, beamAz, beamEl, elCenter, frameTime, spacing };
  }

  designations(t: number): string[] {
    return this.clicked ?? this.s.designations(t);
  }

  click(id: string): void {
    const cur = this.clicked ?? [];
    this.clicked = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
  }

  step(t: number): void {
    const sc = this.scan(t);
    const lockId = this.s.lock(t);
    for (const tg of TGTS) {
      const r = relAt(tg, t);
      if (r.range > 120 * KM) continue;
      let seen = false;
      if (sc.mode === 'stt') seen = tg.id === lockId;
      else {
        const inside = Math.abs(r.az - sc.azCenter) <= sc.azHalf + 1e-6;
        const crossed = (this.prevBeam - r.az) * (sc.beamAz - r.az) <= 0 && Math.abs(this.prevBeam - sc.beamAz) < 0.5;
        // b4 flies low and cold: in the notch half the time (a coasting track in TWS).
        const notched = tg.id === 'b4' && t % 20 > 12;
        seen = inside && crossed && !notched;
      }
      if (seen) {
        const h = this.hits.get(tg.id);
        if (h) { h.last = t; h.n++; h.rel = r; } else this.hits.set(tg.id, { first: t, last: t, n: 1, rel: r });
      }
    }
    this.prevBeam = sc.beamAz;
    for (const [id, h] of this.hits) if (t - h.last > 14) this.hits.delete(id);
  }

  reset(): void {
    this.hits.clear();
  }

  picture(t: number, launchedCount: number): RadarPicture {
    const s = this.s, spec = AIRCRAFT[s.type];
    const sc = this.scan(t);
    const lockId = s.lock(t);
    const desig = sc.mode === 'tws' ? this.designations(t).filter(id => this.hits.has(id) && (this.hits.get(id)?.n ?? 0) >= 2) : [];
    const labels = new Map([...this.hits.entries()].sort((a, b) => a[1].first - b[1].first).map(([id], i) => [id, `T${i + 1}`]));
    const bricks: RadarPicture['bricks'] = [];
    if (sc.mode === 'rws') {
      for (const [id, h] of this.hits) {
        const age = t - h.last;
        if (age > 6) continue;
        bricks.push({ key: id + ':' + h.n, targetId: id, az: h.rel.az, range: h.rel.range, alt: h.rel.alt, age, fade: 1 - age / 6 });
      }
    }
    const live = s.shots.filter(m => t >= m.t0 && t < m.t0 + m.tti0);
    const mOf = (m: Shot) => {
      const el = t - m.t0;
      const tta = m.tta0 == null ? null : m.tta0 - el;
      const guidance: MissileGuidance = MISSILES[m.missile].seeker === 'sarh' ? 'sarh' : tta != null && tta > 0 ? 'datalink' : 'active';
      return { missileId: m.id, label: m.id.toUpperCase(), guidance, timeToActive: tta != null && tta > 0 ? tta : null, timeToImpact: m.tti0 - el };
    };
    const tracks: RadarPicture['tracks'] = [];
    if (sc.mode !== 'rws') {
      for (const [id, h] of this.hits) {
        if (sc.mode === 'stt' && id !== lockId) continue;
        const r = relAt(TGTS.find(x => x.id === id) as Tgt, t);
        const firm = h.n >= 2;
        const coasting = sc.mode === 'tws' && t - h.last > sc.frameTime * 1.4;
        const di = desig.indexOf(id);
        tracks.push({
          label: labels.get(id) ?? 'T?', targetId: id, az: r.az, range: r.range, alt: r.alt, relHeading: r.relHeading, speed: firm ? r.speed : 0,
          aspectDeg: r.aspectDeg, closure: r.closure, firm, coasting, designation: di === 0 ? 'primary' : di > 0 ? 'secondary' : null,
          designationIndex: di, locked: id === lockId && sc.mode === 'stt', friendly: r.friendly,
          missiles: live.filter(m => m.target === id).map(mOf),
        });
      }
    }
    const primId = sc.mode === 'stt' ? lockId : desig[0] ?? null;
    const primRel = primId ? relAt(TGTS.find(x => x.id === primId) as Tgt, t) : null;
    const cursorRange = primRel ? primRel.range : s.rangeScale * 0.55;
    const halfCov = (sc.bars * sc.spacing) / 2;
    const w = spec.loadout[0];
    const dlz = primRel ? { ...s.dlz, targetRange: primRel.range } : null;
    const shoot = !!dlz && dlz.targetRange <= dlz.rmax && dlz.targetRange >= dlz.rmin;
    return {
      t, ownerId: 'me', aircraftType: s.type, units: spec.units, mode: sc.mode, modeLabel: spec.radar.modeLabels[sc.mode] ?? sc.mode.toUpperCase(),
      rangeScale: s.rangeScale, gimbalAz: spec.radar.gimbalAzDeg * D2R,
      scan: { azCenter: sc.azCenter, azHalf: sc.azHalf, elCenter: sc.elCenter, bars: sc.bars, beamAz: sc.mode === 'stt' && primRel ? primRel.az : sc.beamAz, beamEl: sc.beamEl, bar: sc.bar, frameTime: sc.frameTime },
      altCoverage: { top: OWN_ALT + cursorRange * Math.tan(sc.elCenter + halfCov), bottom: OWN_ALT + cursorRange * Math.tan(sc.elCenter - halfCov), atRange: cursorRange },
      ownAlt: OWN_ALT, ownSpeed: OWN_V, bricks, tracks,
      stt: sc.mode === 'stt' && primRel && lockId ? { targetId: lockId, az: primRel.az, range: primRel.range, alt: primRel.alt, aspectDeg: primRel.aspectDeg, closure: primRel.closure, lost: false } : null,
      weapon: w ? { id: w.missile, name: MISSILES[w.missile].name, count: Math.max(0, w.count - launchedCount) } : null,
      dlz, shootCue: shoot, cueLabel: s.cue, launchBlockedReason: shoot ? '' : 'Out of range',
      missilesInFlight: live.map(m => ({ ...mOf(m), targetLabel: labels.get(m.target) ?? '' })),
      cursor: { az: (primRel ? primRel.az + 9 * D2R : 0) + 0.05 * Math.sin(t * 0.3), range: cursorRange * 0.82 },
    };
  }
}

// ------------------------------------------------------------------ scripted RWR threats

interface Emitter { id: string; type: RwrContact['emitterType']; missileType?: MissileId; b0: number; bRate: number; el: number; states: [number, RwrContact['state']][]; until?: number }
function threatsFor(rwr: RwrId): Emitter[] {
  const ru = rwr === 'spo15';
  const [a, b, c, d] = ru ? (['f15c', 'f16c', 'fa18c', 'f14b'] as const) : (['su27', 'mig29s', 'j11a', 'f16c'] as const);
  return [
    { id: 'e1', type: a, b0: -18, bRate: -0.2, el: 4, states: [[2, 'search'], [16, 'lock'], [22, 'launch']] },
    { id: 'e2', type: b, b0: 36, bRate: 0.15, el: -22, states: [[6, 'search'], [20, 'lock']] },
    { id: 'e3', type: c, b0: 102, bRate: 0.1, el: 2, states: [[0, 'search']] },
    { id: 'e4', type: d, b0: -142, bRate: 0, el: 0, states: [[25, 'search']] },
    { id: 'm1', type: 'missile', missileType: ru ? 'aim120c' : 'r77', b0: 30, bRate: 0.4, el: -6, states: [[26, 'missile']], until: 44 },
    // &sams=1: ground and support emitters (no airborne hat on scopes; ranked after airborne radars).
    ...(qs.get('sams') === '1' ? [
      { id: 's1', type: 'sam-short', b0: 64, bRate: 0, el: -8, states: [[1, 'search'], [24, 'lock']] },
      { id: 's2', type: 'sam-long', b0: -70, bRate: 0, el: -3, states: [[3, 'search']] },
      { id: 'aw', type: 'awacs', b0: 170, bRate: 0, el: 1, states: [[0, 'search']] },
    ] satisfies Emitter[] : []),
  ];
}
function rwrContacts(rwr: RwrId, t: number): RwrContact[] {
  const out: RwrContact[] = [];
  for (const e of threatsFor(rwr)) {
    if (e.until != null && t > e.until) continue;
    const cur = e.states.filter(([at]) => t >= at);
    if (!cur.length) continue;
    const state = cur[cur.length - 1][1];
    const first = e.states[0][0];
    const strength = state === 'missile' ? 0.95 : state === 'launch' ? 0.85 : state === 'lock' ? 0.7 : 0.25 + 0.2 * Math.sin(first);
    out.push({
      emitterId: e.id, emitterType: e.type, missileType: e.missileType, state, bearing: (e.b0 + e.bRate * (t - first)) * D2R,
      elevation: e.el * D2R, strength, firstSeen: first, lastSeen: state === 'search' ? t - (t % 2.4) : t,
    });
  }
  return out;
}

// ------------------------------------------------------------------ page

const root = document.getElementById('root') as HTMLElement;
const only = qs.get('only');
if (only && !only.includes(',')) root.classList.add('only');
// ?w=390: constrain the column to a phone width (headless Chrome clamps its window to >= 500 px).
if (qs.get('w')) { root.style.width = `${Number(qs.get('w'))}px`; root.style.margin = '0'; }
let t = Math.max(0, Math.min(LOOP - 0.01, Number(qs.get('t') ?? 28)));
let paused = qs.get('pause') === '1';
let speed = 1;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

const bar = el('div', 'sb-bar');
bar.append(el('h1', '', 'Displays'));
const mkBtn = (label: string, on: () => void) => { const b = el('button', '', label); b.type = 'button'; b.onclick = on; bar.append(b); return b; };
const skinBtn = mkBtn('Skin: ' + document.documentElement.dataset.cockpit, () => {
  const next = document.documentElement.dataset.cockpit === 'ru' ? 'us' : 'ru';
  document.documentElement.dataset.cockpit = next;
  skinBtn.textContent = 'Skin: ' + next;
  for (const r of radars) r.disp.refreshTheme();
  for (const r of rwrs) r.disp.refreshTheme();
  dlzH.refreshTheme(); dlzV.refreshTheme(); timeline.refreshTheme();
});
const pauseBtn = mkBtn(paused ? 'Play' : 'Pause', () => { paused = !paused; pauseBtn.textContent = paused ? 'Play' : 'Pause'; });
mkBtn('x4', () => { speed = speed === 1 ? 4 : 1; });
const audio = new RwrAudio({ rwr: 'alr56c' });
const audioBtn = mkBtn('Audio off', async () => {
  if (audio.enabled) { audio.stop(); audioBtn.textContent = 'Audio off'; audioBtn.setAttribute('aria-pressed', 'false'); }
  else { await audio.start(); audioBtn.textContent = 'Audio on (ALR-56C)'; audioBtn.setAttribute('aria-pressed', 'true'); }
});
const out = el('span', 'sb-out', '');
bar.append(out);
root.append(bar);

const card = (title: string, sub: string, cls = '') => {
  const c = el('div', 'card');
  const p = el('div', 'placard');
  p.append(el('span', '', title), el('span', '', sub));
  const g = el('div', 'glass ' + cls);
  const cv = el('canvas');
  g.append(cv);
  c.append(p, g);
  return { c, cv };
};

const radars: { key: string; s: Script; fr: FakeRadar; disp: RadarDisplay; perf: number[] }[] = [];
const rwrs: { id: RwrId; disp: RwrDisplay; perf: number[] }[] = [];

const onlyList = only ? only.split(',') : null;
const radarKeys = Object.keys(SCRIPTS).filter(k => !onlyList || onlyList.includes(k));
const rwrIds = (Object.keys(RWRS) as RwrId[]).filter(id => !onlyList || onlyList.includes('rwr-' + id));

if (radarKeys.length) {
  root.append(el('h2', '', 'Radar formats'));
  const grid = el('div', 'grid');
  root.append(grid);
  for (const key of radarKeys) {
    const s = SCRIPTS[key];
    const { c, cv } = card(s.title, s.format);
    grid.append(c);
    const disp = new RadarDisplay(cv, { format: s.format, tidStab: s.tidStab });
    const fr = new FakeRadar(s);
    cv.addEventListener('click', ev => {
      const pick = disp.pickDetail(ev.clientX, ev.clientY);
      const rad = disp.toRadar(ev.clientX, ev.clientY);
      out.textContent = `${key}: ${pick ? pick.kind + ' ' + pick.targetId : 'nothing'}${rad ? ` @ ${(rad.az / D2R).toFixed(0)}° ${(rad.range / 1000).toFixed(0)} km` : ''}`;
      if (pick && pick.kind !== 'brick') fr.click(pick.targetId);
    });
    radars.push({ key, s, fr, disp, perf: [] });
  }
}
if (rwrIds.length) {
  root.append(el('h2', '', 'RWR'));
  const grid = el('div', 'grid rwr');
  root.append(grid);
  for (const id of rwrIds) {
    const spec = RWRS[id];
    const { c, cv } = card(spec.name, spec.aircraft.map(a => AIRCRAFT[a].short).join(' '));
    grid.append(c);
    const disp = new RwrDisplay(cv, { rwr: id, highlight: qs.get('hl') }); // &hl=e2 rings one emitter
    cv.addEventListener('click', ev => { out.textContent = `${id}: ${disp.pickContact(ev.clientX, ev.clientY) ?? 'nothing'}`; });
    rwrs.push({ id, disp, perf: [] });
  }
}
let dlzH: DlzBar, dlzV: DlzBar, timeline: MissileTimeline;
{
  const showHelpers = !onlyList || onlyList.includes('helpers');
  const grid = el('div', 'grid');
  if (showHelpers) root.append(el('h2', '', 'Helpers'), grid);
  const a = card('DlzBar', 'horizontal · F-15C vs T1', 'strip');
  const b = card('MissileTimeline', 'F-14B missiles in flight', 'strip tall');
  const v = card('DlzBar', 'vertical · FC3 wording', 'strip vert');
  grid.append(a.c, b.c, v.c);
  dlzH = new DlzBar(a.cv, { units: 'imperial' });
  dlzV = new DlzBar(v.cv, { units: 'metric', orientation: 'vertical', labels: { rne: 'RTR' } });
  timeline = new MissileTimeline(b.cv);
}

// Pre-roll the fake radars up to the start time so the picture is populated.
function preroll(t1: number): void {
  for (const r of radars) {
    r.fr.reset();
    for (let tt = Math.max(0, t1 - 16); tt <= t1; tt += 1 / 30) r.fr.step(tt);
  }
}
preroll(t);

// ?perf=1: time 120 synchronous draws per display (headless virtual time runs few real frames).
if (qs.get('perf') === '1') {
  const res: string[] = [];
  for (const r of radars) {
    const pic = r.fr.picture(t, 0);
    const t0 = performance.now();
    for (let i = 0; i < 120; i++) { r.disp.draw(pic, { ownHeading: 0.35 }); r.disp.canvas.getContext('2d')?.getImageData(0, 0, 1, 1); }
    res.push(`${r.key} ${((performance.now() - t0) / 120).toFixed(2)}`);
  }
  for (const r of rwrs) {
    const cs = rwrContacts(r.id, t);
    const t0 = performance.now();
    for (let i = 0; i < 120; i++) { r.disp.draw(cs, t); r.disp.canvas.getContext('2d')?.getImageData(0, 0, 1, 1); }
    res.push(`${r.id} ${((performance.now() - t0) / 120).toFixed(2)}`);
  }
  console.log('draw ms/frame: ' + res.join(' | ') + ` | dpr ${devicePixelRatio}`);
}

let last = performance.now();
let frames = 0;
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!paused) {
    const prev = t;
    t += dt * speed;
    if (t >= LOOP) { t -= LOOP; preroll(t); }
    for (const r of radars) for (let tt = prev; tt < t; tt += 1 / 60) r.fr.step(Math.min(tt + 1 / 60, t));
  }
  for (const r of radars) {
    const launched = r.s.shots.filter(m => t >= m.t0).length;
    r.disp.draw(r.fr.picture(t, launched), { ownHeading: 0.35 });
    r.perf.push(r.disp.lastDrawMs);
  }
  for (const r of rwrs) {
    const cs = rwrContacts(r.id, t);
    r.disp.draw(cs, t);
    r.perf.push(r.disp.lastDrawMs);
  }
  audio.update(rwrContacts('alr56c', t), t);
  const f15 = radars.find(r => r.key === 'f15c');
  if (f15) {
    const pic = f15.fr.picture(t, 0);
    dlzH.draw(pic.dlz, { closure: pic.tracks.find(x => x.designation === 'primary')?.closure ?? null, shoot: pic.shootCue });
    dlzV.draw(pic.dlz ? { ...pic.dlz, rtr: undefined, rpi: undefined } : null, { closure: pic.tracks.find(x => x.designation === 'primary')?.closure ?? null });
  } else {
    dlzH.draw({ rmax: 70000, rne: 28000, rmin: 3000, targetRange: 52000 }, { closure: 480, shoot: true });
    dlzV.draw({ rmax: 60000, rne: 25000, rmin: 2500, targetRange: 41000 }, { closure: 400 });
  }
  const f14 = radars.find(r => r.key === 'f14b');
  timeline.draw(f14 ? f14.fr.picture(t, 0).missilesInFlight : [
    { missileId: 'x1', label: 'M1', targetLabel: 'T1', guidance: 'datalink', timeToActive: 9 - (t % 9), timeToImpact: 31 - (t % 9) },
    { missileId: 'x2', label: 'M2', targetLabel: 'T2', guidance: 'inertial', timeToActive: 14, timeToImpact: 38 },
    { missileId: 'x3', label: 'M3', targetLabel: 'T3', guidance: 'active', timeToActive: null, timeToImpact: 6 },
    { missileId: 'x4', label: 'F1', targetLabel: 'T4', guidance: 'sarh', timeToActive: null, timeToImpact: 22 },
  ], t);
  if (!paused || frames % 30 === 0) out.textContent = out.textContent?.includes(':') ? out.textContent : `t ${t.toFixed(1)} s`;
  frames++;
  if (frames === 60) {
    const avg = (a: number[]) => (a.slice(10).reduce((x, y) => x + y, 0) / Math.max(1, a.length - 10)).toFixed(2);
    console.log('draw ms: ' + [...radars.map(r => `${r.key} ${avg(r.perf)}`), ...rwrs.map(r => `${r.id} ${avg(r.perf)}`)].join(' | '));
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
