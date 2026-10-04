/**
 * [OWNER: page-harm] Animated "How a PB shot works" for the PB lesson: the UFC code, WPDSG, the pull-up (HRM or A/C),
 * the flight to the point with the receiver off, the receiver coming on near the point, and which radar the code picks
 * at the site you choose (an SA-11 battery with an SA-15 beside it, an SA-10 battery, an SA-6 battery with an SA-8
 * beside it), or a miss when no radar of that code is there. Steps follow ED's guide p373-375 and the code table p420;
 * which radar is picked when several share a code, and how far from the point the HARM listens, are trainer rules
 * (HARM_CAVEATS). Built on explainer.ts.
 */
import { h, segmented } from '../../ui';
import { createExplainer, svgEl, setAttrs, clamp01, ease, bezier, type Explainer } from './explainer';
import type { Pullup } from './types';

const T = { ufc: 2.6, wp: 4.6, release: 7, seeker: 11.4, terminal: 13.6, end: 16.2, hold: 17.5 } as const;
const POINT: [number, number] = [130, 120];

export type PbSiteId = 'sa11' | 'sa10' | 'sa6';
interface Emitter { key: string; code: number; rwr: string; name: string; job: string; after: string; top: [number, number] }
interface Site { id: PbSiteId; label: string; emitters: Emitter[]; others: { name: string; top: [number, number] }[]; absent: { code: number; name: string } }

/** The sites the explainer can put at the designated point (top view px; WP4 at POINT). Codes: ED guide p420. */
export const PB_SITES: Record<PbSiteId, Site> = {
  sa11: {
    id: 'sa11', label: 'SA-11 battery',
    emitters: [
      { key: 'sd', code: 107, rwr: 'SD', name: 'Snow Drift', job: 'the battery\'s search radar', after: 'The battery has lost its search radar; each launcher\'s Fire Dome can still find and lock you.', top: [130, 120] },
      { key: 'fdA', code: 115, rwr: '11', name: 'Fire Dome', job: 'the tracking radar on a launcher', after: 'That launcher is blind; the other launcher and the Snow Drift still work.', top: [98, 146] },
      { key: 'fdB', code: 115, rwr: '11', name: 'Fire Dome', job: 'the tracking radar on a launcher', after: 'That launcher is blind; the other launcher and the Snow Drift still work.', top: [168, 150] },
      { key: 'tor', code: 119, rwr: '15', name: 'SA-15', job: 'a separate SA-15 parked beside the battery', after: 'The code chose the target, not the waypoint: the SA-11 is untouched.', top: [204, 70] },
    ],
    others: [{ name: 'CP', top: [150, 86] }],
    absent: { code: 108, name: 'SA-6 Straight Flush' },
  },
  sa10: {
    id: 'sa10', label: 'SA-10 battery',
    emitters: [
      { key: 'bb', code: 104, rwr: 'BB', name: 'Big Bird', job: 'the long-range surveillance radar', after: 'The battery has lost its long-range search; the Flap Lid can still find, track and guide.', top: [74, 146] },
      { key: 'cs', code: 103, rwr: 'CS', name: 'Clam Shell', job: 'a second search radar (TAR, target acquisition, in the guide\'s table)', after: 'The battery has lost one search radar; the Big Bird and the Flap Lid still work.', top: [178, 156] },
      { key: 'fl', code: 110, rwr: '10', name: 'Flap Lid', job: 'the tracking and guidance radar', after: 'Without it the launchers cannot guide their missiles: the battery can see you but cannot shoot.', top: [118, 70] },
    ],
    others: [{ name: '5P85', top: [56, 92] }, { name: '5P85', top: [206, 100] }],
    absent: { code: 107, name: 'SA-11 Snow Drift' },
  },
  sa6: {
    id: 'sa6', label: 'SA-6 + SA-8',
    emitters: [
      { key: 'sf', code: 108, rwr: '6', name: 'Straight Flush', job: 'the SA-6\'s search and track radar', after: 'The 2P25 launchers have no radar of their own: the whole SA-6 battery is blind.', top: [130, 120] },
      { key: 'osa', code: 117, rwr: '8', name: 'SA-8', job: 'an SA-8 beside the battery, with its own radar', after: 'The SA-6 battery next to it is untouched: the code chose the target.', top: [198, 78] },
    ],
    others: [{ name: '2P25', top: [102, 100] }, { name: '2P25', top: [160, 98] }, { name: '2P25', top: [128, 156] }],
    absent: { code: 115, name: 'SA-11 Fire Dome' },
  },
};

const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
/** Side-view x of a top-view point (the side view looks along the line of flight). */
const sideX = (p: [number, number]) => 380 + (p[0] - POINT[0]) * 0.35;

/** Which radar a code picks at a site (nearest to the point when several share it), and the outcome text. */
export function pbOutcome(code: number, siteId: PbSiteId = 'sa11'): { text: string; hit: Emitter | null } {
  const site = PB_SITES[siteId];
  const matches = site.emitters.filter(e => e.code === code).sort((a, b) => dist(a.top, POINT) - dist(b.top, POINT));
  const hit = matches[0] ?? null;
  if (!hit) {
    const name = code === site.absent.code ? site.absent.name : `code ${code}`;
    return { hit: null, text: `Code ${code} is the ${name}. There is none at this point: the HARM hears no radar of that code and falls near the point. A miss: it never homes on a radar it was not told about.` };
  }
  const others = [...new Set(site.emitters.filter(e => e.code !== code).map(e => `${e.name} (${e.code})`))];
  const shared = matches.length > 1 ? ` ${matches.length} radars share code ${code}: the trainer takes the one nearest the point.` : '';
  return { hit, text: `Code ${code} is the ${hit.name}, ${hit.job}. The HARM homes on it.${shared} ${others.join(', ')}: other codes, ignored. ${hit.after}` };
}

export function createPbExplainer(o: { reducedMotion: boolean; onClose?: () => void }): Explainer {
  let siteId: PbSiteId = 'sa11';
  let code = 107;
  let pullup: Pullup = 'HRM';
  // Assigned below; the control handlers only run after that.
  let ex!: Explainer;

  // ---- side view
  const side = svgEl('svg', { viewBox: '0 0 420 230', class: 'harm-pbx__svg', role: 'img', 'aria-label': 'Side view of the PB shot' });
  side.append(svgEl('rect', { x: 0, y: 0, width: 420, height: 230, class: 'pbx-sky' }), svgEl('rect', { x: 0, y: 200, width: 420, height: 30, class: 'pbx-ground' }));
  const rangeHrm = svgEl('g', { class: 'pbx-range' });
  rangeHrm.append(svgEl('line', { x1: 118, y1: 224, x2: 380, y2: 224 }), svgEl('text', { x: 124, y: 220 }, 'HRM pull-up range'));
  const rangeAc = svgEl('g', { class: 'pbx-range' });
  rangeAc.append(svgEl('line', { x1: 70, y1: 212, x2: 380, y2: 212 }), svgEl('text', { x: 76, y: 208 }, 'A/C pull-up range: further'));
  const sideRadars = svgEl('g', {});
  const trail = svgEl('path', { class: 'pbx-trail', d: '' });
  const cone = svgEl('path', { class: 'pbx-cone', d: '' });
  const harm = svgEl('g', {});
  harm.append(svgEl('path', { d: 'M -7 0 L 6 0 M 6 0 L 2 -2 M 6 0 L 2 2', class: 'pbx-harm' }));
  const jet = svgEl('g', {});
  jet.append(svgEl('path', { d: 'M -12 0 L 10 0 L 4 -3 L -6 -3 Z M -10 0 L -14 -6 L -8 -1 Z', class: 'pbx-jet' }));
  const wp = svgEl('g', { class: 'pbx-wp', opacity: 0 });
  wp.append(svgEl('path', { d: 'M 380 172 l 6 6 l -6 6 l -6 -6 Z' }), svgEl('text', { x: 380, y: 166, 'text-anchor': 'middle' }, 'WP4 · TGT'));
  const flash = svgEl('circle', { cx: 0, cy: 0, r: 0, class: 'pbx-flash', opacity: 0 });
  const ufcBox = svgEl('g', { class: 'pbx-ufc' });
  const ufcText = svgEl('text', { x: 14, y: 26 }, '');
  ufcBox.append(svgEl('rect', { x: 6, y: 10, width: 96, height: 24, rx: 3 }), ufcText);
  const recv = svgEl('text', { x: 210, y: 20, 'text-anchor': 'middle', class: 'pbx-recv' }, '');
  side.append(rangeAc, rangeHrm, sideRadars, wp, trail, cone, jet, harm, flash, ufcBox, recv);

  // ---- top view
  const top = svgEl('svg', { viewBox: '0 0 260 230', class: 'harm-pbx__svg', role: 'img', 'aria-label': 'Top view of the site at the designated point' });
  top.append(svgEl('rect', { x: 0, y: 0, width: 260, height: 230, class: 'pbx-land' }));
  const search = svgEl('circle', { cx: POINT[0], cy: POINT[1], r: 0, class: 'pbx-search', opacity: 0 });
  const searchLbl = svgEl('text', { x: POINT[0], y: POINT[1] + 106, 'text-anchor': 'middle', class: 'pbx-lbl', opacity: 0 }, 'listening near the point');
  const topWp = svgEl('path', { d: `M ${POINT[0]} ${POINT[1] - 14} l 7 7 l -7 7 l -7 -7 Z`, class: 'pbx-wp-top', opacity: 0 });
  const vehicles = svgEl('g', {});
  const topHarm = svgEl('path', { class: 'pbx-trail', d: '' });
  const topFlash = svgEl('circle', { cx: 0, cy: 0, r: 0, class: 'pbx-flash', opacity: 0 });
  top.append(search, searchLbl, vehicles, topWp, topHarm, topFlash);
  let topEm: { g: SVGGElement; ring: SVGCircleElement; box: SVGRectElement; e: Emitter }[] = [];
  let sideEm: { r: SVGRectElement; e: Emitter }[] = [];

  function buildSite(): void {
    const site = PB_SITES[siteId];
    vehicles.replaceChildren(...site.others.map(v => {
      const g = svgEl('g', { class: 'pbx-veh' });
      const right = v.top[0] > 200;
      g.append(svgEl('rect', { x: v.top[0] - 4, y: v.top[1] - 4, width: 8, height: 8 }), svgEl('text', { x: v.top[0] + (right ? -7 : 7), y: v.top[1] + 3, class: 'pbx-sub', 'text-anchor': right ? 'end' : 'start' }, `${v.name} · no radar`));
      return g;
    }));
    topEm = site.emitters.map(e => {
      const g = svgEl('g', { class: 'pbx-veh pbx-em' });
      const ring = svgEl('circle', { cx: e.top[0], cy: e.top[1], r: 9, class: 'pbx-ring', opacity: 0 });
      const box = svgEl('rect', { x: e.top[0] - 11, y: e.top[1] - 11, width: 22, height: 22, class: 'pbx-box', opacity: 0 });
      const right = e.top[0] > 200, lx = e.top[0] + (right ? -13 : 13), anchor = right ? 'end' : 'start';
      g.append(ring, box, svgEl('rect', { x: e.top[0] - 4, y: e.top[1] - 4, width: 8, height: 8 }),
        svgEl('text', { x: lx, y: e.top[1] - 2, 'text-anchor': anchor }, `${e.rwr} · ${e.code}`), svgEl('text', { x: lx, y: e.top[1] + 9, class: 'pbx-sub', 'text-anchor': anchor }, e.name));
      vehicles.append(g);
      return { g, ring, box, e };
    });
    sideEm = site.emitters.map(e => ({ r: svgEl('rect', { x: sideX(e.top) - 3, y: 194, width: 6, height: 6, class: 'pbx-radar' }), e }));
    sideRadars.replaceChildren(...sideEm.map(x => x.r));
  }

  // ---- controls
  const codeHost = h('div', null);
  const codeOptions = () => {
    const site = PB_SITES[siteId];
    const seen = new Set<number>();
    const opts = site.emitters.filter(e => !seen.has(e.code) && !!seen.add(e.code)).map(e => ({ value: e.code, label: `${e.code} ${e.name}` }));
    return [...opts, { value: site.absent.code, label: `${site.absent.code} (not here)` }];
  };
  const buildCodes = () => {
    const seg = segmented<number>({ id: 'harm-pbx-code', label: 'Code on the UFC (TGT)', size: 's', value: code, options: codeOptions(), onChange: c => { code = c; ex.play(); } });
    codeHost.replaceChildren(seg.el);
  };
  const siteSeg = segmented<PbSiteId>({
    id: 'harm-pbx-site', label: 'Site at the waypoint', size: 's', value: siteId,
    options: (Object.keys(PB_SITES) as PbSiteId[]).map(id => ({ value: id, label: PB_SITES[id].label })),
    onChange: id => { siteId = id; code = PB_SITES[id].emitters[0]!.code; buildSite(); buildCodes(); ex.play(); },
  });
  const pullSeg = segmented<Pullup>({ id: 'harm-pbx-pull', label: 'Pull-up', size: 's', value: pullup, options: [{ value: 'HRM', label: 'HRM (HARM climbs)' }, { value: 'AC', label: 'A/C (you climb)' }], onChange: p => { pullup = p; ex.play(); } });
  buildSite();
  buildCodes();

  function draw(t: number) {
    const ac = pullup === 'AC';
    const r = pbOutcome(code, siteId);
    const start: [number, number] = ac ? [26, 120] : [86, 92];
    const rel: [number, number] = ac ? [70, 74] : [118, 92];
    const end: [number, number] = r.hit ? [sideX(r.hit.top), 194] : [386, 199];
    const path: [number, number][] = ac ? [rel, [rel[0] + 70, rel[1] - 70], [300, 6], end] : [rel, [rel[0] + 40, rel[1] - 50], [290, 10], end];
    const digits = String(code);
    const nTyped = Math.min(3, Math.floor(clamp01(t / (T.ufc - 0.4)) * 3.999));
    ufcText.textContent = `:TGT ${digits.slice(0, nTyped)}${t >= T.ufc - 0.4 ? '  ENT' : ''}`;
    setAttrs(ufcBox, { opacity: t < T.release ? 1 : 0.35 });
    const wpOn = clamp01((t - T.ufc) / 0.8);
    setAttrs(wp, { opacity: wpOn });
    setAttrs(topWp, { opacity: wpOn });
    setAttrs(rangeHrm, { opacity: ac ? 0.35 : 1 });
    setAttrs(rangeAc, { opacity: ac ? 1 : 0.35 });
    const k = clamp01((t - T.wp) / (T.release - T.wp));
    const jx = start[0] + (rel[0] - start[0]) * ease(k) + (t > T.release ? (t - T.release) * 14 : 0);
    const jy = t > T.release ? rel[1] + (t - T.release) * (ac ? 6 : 0) : start[1] + (rel[1] - start[1]) * ease(k);
    const pitch = ac && t > T.wp && t < T.release + 1.5 ? -45 * clamp01(k * 1.4) : 0;
    setAttrs(jet, { transform: `translate(${jx.toFixed(1)} ${jy.toFixed(1)}) rotate(${pitch})` });
    const f = clamp01((t - T.release) / (T.end - T.release));
    const s = f < 0.75 ? ease(f / 0.75) * 0.82 : 0.82 + (f - 0.75) / 0.25 * 0.18;
    const flying = t >= T.release && t < T.end;
    const [hx, hy] = bezier(path, s);
    const [px, py] = bezier(path, Math.max(0, s - 0.01));
    setAttrs(harm, { opacity: flying ? 1 : 0, transform: `translate(${hx.toFixed(1)} ${hy.toFixed(1)}) rotate(${(Math.atan2(hy - py, hx - px) * 180 / Math.PI).toFixed(1)})` });
    let d = '';
    if (t >= T.release) for (let i = 0; i <= 30; i++) { const [x, y] = bezier(path, (i / 30) * s); d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)} `; }
    setAttrs(trail, { d });
    const on = t >= T.seeker;
    recv.textContent = t < T.release ? '' : on ? `Receiver ON: listening for code ${code}` : 'Receiver OFF: flying to the point';
    setAttrs(recv, { class: `pbx-recv${on ? ' is-on' : ''}` });
    setAttrs(cone, { d: on && flying ? `M ${hx} ${hy} L ${hx + 46} ${hy + 70} L ${hx - 10} ${hy + 80} Z` : '' });
    const imp = clamp01((t - T.end) / 0.6);
    setAttrs(flash, { cx: end[0], cy: end[1], r: 4 + 16 * imp, opacity: t >= T.end ? (1 - imp) * 0.9 : 0 });
    for (const x of sideEm) setAttrs(x.r, { class: `pbx-radar${t >= T.end && r.hit === x.e ? ' is-dead' : ''}` });
    const sOn = clamp01((t - T.seeker) / 0.8);
    setAttrs(search, { r: 95 * sOn, opacity: on ? 0.9 : 0 });
    setAttrs(searchLbl, { opacity: on ? 1 : 0 });
    for (const x of topEm) {
      const match = x.e.code === code;
      const chosen = r.hit === x.e;
      const pulse = on && match ? 0.5 + 0.5 * Math.sin(t * 6) : 0;
      setAttrs(x.ring, { opacity: pulse, r: 9 + 4 * pulse });
      setAttrs(x.box, { opacity: t >= T.terminal && chosen ? 1 : 0 });
      setAttrs(x.g, { class: `pbx-veh pbx-em${on && !match ? ' is-ignored' : ''}${t >= T.end && chosen ? ' is-dead' : ''}` });
    }
    const topEnd: [number, number] = r.hit ? r.hit.top : [POINT[0] + 14, POINT[1] + 22];
    const ft = clamp01((t - T.release) / (T.terminal - T.release));
    const tt = clamp01((t - T.terminal) / (T.end - T.terminal));
    const mid: [number, number] = [POINT[0] - 30 * (1 - ft), POINT[1]];
    let td = '';
    if (t >= T.release) {
      td = `M 0 ${POINT[1]} L ${(POINT[0] - 30) * ft} ${POINT[1]}`;
      if (t >= T.terminal) td += ` L ${mid[0] + (topEnd[0] - mid[0]) * tt} ${mid[1] + (topEnd[1] - mid[1]) * tt}`;
    }
    setAttrs(topHarm, { d: td });
    setAttrs(topFlash, { cx: topEnd[0], cy: topEnd[1], r: 4 + 14 * imp, opacity: t >= T.end ? (1 - imp) * 0.9 : 0 });
    return t >= T.terminal ? { outcome: r.text, miss: !r.hit } : {};
  }

  ex = createExplainer({
    title: 'How a PB shot works',
    intro: 'Pick the site at the waypoint, a code and a pull-up, then watch. Side view on the left (not to scale), the site from above on the right.',
    controls: [siteSeg.el, codeHost, pullSeg.el],
    figures: [[side, 'Side view'], [top, 'At the designated point, from above']],
    steps: [
      'UFC, window 4 TGT, type the code, ENT: you tell the HARM what radar type to look for (guide p374; codes p420).',
      'HSI, WPDSG on the waypoint over the site: you tell it where to go (p122, p374).',
      'Hold release and fly the cue. HRM pull-up: the HARM climbs by itself, so you launch closer. A/C pull-up: you climb about 45° first and the HARM reaches further (p374-375).',
      'Receiver off: the HARM flies to the point, not to a radar. It cannot see anything yet (p373).',
      'Near the point the receiver comes on and listens for that one code (p373).',
      'It homes on the radar with the code, or finds none and misses.',
    ],
    marks: [0, T.ufc, T.wp, T.release, T.seeker, T.terminal],
    end: T.hold,
    draw,
    note: 'From the ED guide: PB flies to the location, then turns on the receiver and homes (p373); the code is the ALIC ID from the appendix (p420); HRM vs A/C pull-up (p374-375). Trainer rules, not in the guide: how far from the point it listens, and the nearest radar wins when two share a code. What each radar does for its battery: DCS encyclopedia (research note S2).',
    reducedMotion: o.reducedMotion,
    onClose: o.onClose,
  });
  return ex;
}
