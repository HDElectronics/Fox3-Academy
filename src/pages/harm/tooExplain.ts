/**
 * [OWNER: page-harm] Animated "How a TOO shot works" for the TOO lesson: a plan view with the HARM's 30° field of view and
 * the TOO format on the DDI. The HARM becomes a sensor and shows radars inside its field of view as numbers, with an
 * arrow for those outside; the TDC goes to the HARM display; CLASS filters; HARM Sequence moves the box; Cage/Uncage
 * hands off (H-OFF, the others vanish, STBY to RDY); release, and the HARM flies at that radar (ED guide p368-372).
 * You pick the class and the radar to hand off. Built on explainer.ts.
 */
import { h, segmented } from '../../ui';
import { createExplainer, svgEl, setAttrs, clamp01, lerp, type Explainer } from './explainer';

type Cls = 'ALL' | 'H1' | 'H2';
interface Em { key: string; rwr: string; name: string; cls: 'H1' | 'H2'; at: [number, number] }
const JET: [number, number] = [210, 235];
/** Plan px, north up. Three radars inside the ±15° field of view, an SA-6 outside to the right. Classes: guide p420. */
const EMS: Em[] = [
  { key: 'sd', rwr: 'SD', name: 'SA-11 Snow Drift', cls: 'H2', at: [175, 70] },
  { key: 'tor', rwr: '15', name: 'SA-15', cls: 'H2', at: [232, 95] },
  { key: 'osa', rwr: '8', name: 'SA-8', cls: 'H1', at: [196, 120] },
  { key: 'sa6', rwr: '6', name: 'SA-6', cls: 'H1', at: [330, 110] },
];
const azDeg = (p: [number, number]) => Math.atan2(p[0] - JET[0], JET[1] - p[1]) * 180 / Math.PI;
const range = (p: [number, number]) => Math.hypot(p[0] - JET[0], p[1] - JET[1]);
const inFov = (e: Em) => Math.abs(azDeg(e.at)) <= 15;
const T = { tdc: 2.6, cls: 4.6, step: 7, hoff: 9.4, fire: 11.2, hit: 15, end: 17 } as const;

/** DDI position of an emitter on the TOO format (T marks at ±15° → x 40..200; nearer radars lower). */
const ddiXY = (e: Em): [number, number] => [120 + azDeg(e.at) / 15 * 80, 230 - range(e.at) * 0.85];

export function createTooExplainer(o: { reducedMotion: boolean; onClose?: () => void }): Explainer {
  let cls: Cls = 'H2';
  let target = 'tor';
  let ex!: Explainer;

  // ---- plan view with the field of view
  const plan = svgEl('svg', { viewBox: '0 0 420 260', class: 'harm-pbx__svg', role: 'img', 'aria-label': 'Plan view with the HARM field of view' });
  const fovLen = 230, a = 15 * Math.PI / 180;
  plan.append(svgEl('rect', { x: 0, y: 0, width: 420, height: 260, class: 'pbx-land' }),
    svgEl('path', { d: `M ${JET[0]} ${JET[1]} L ${JET[0] - Math.sin(a) * fovLen} ${JET[1] - Math.cos(a) * fovLen} L ${JET[0] + Math.sin(a) * fovLen} ${JET[1] - Math.cos(a) * fovLen} Z`, class: 'tox-fov' }),
    svgEl('text', { x: JET[0], y: 14, 'text-anchor': 'middle', class: 'pbx-lbl' }, 'HARM field of view: 30°'));
  const emG = EMS.map(e => {
    const g = svgEl('g', { class: 'pbx-em' });
    g.append(svgEl('rect', { x: e.at[0] - 4, y: e.at[1] - 4, width: 8, height: 8 }), svgEl('text', { x: e.at[0] + 8, y: e.at[1] - 4 }, `${e.rwr} · ${e.cls}`), svgEl('text', { x: e.at[0] + 8, y: e.at[1] + 8, class: 'pbx-sub' }, e.name));
    plan.append(g);
    return g;
  });
  const jet = svgEl('path', { d: `M ${JET[0]} ${JET[1] - 12} L ${JET[0] + 8} ${JET[1] + 6} L ${JET[0]} ${JET[1] + 2} L ${JET[0] - 8} ${JET[1] + 6} Z`, class: 'pbx-jet' });
  const harmTrail = svgEl('path', { class: 'pbx-trail', d: '' });
  const harm = svgEl('circle', { r: 3, class: 'spx-harm', opacity: 0 });
  const flash = svgEl('circle', { r: 0, class: 'pbx-flash', opacity: 0 });
  plan.append(harmTrail, jet, harm, flash);

  // ---- TOO format
  const ddi = svgEl('svg', { viewBox: '0 0 240 250', class: 'harm-pbx__svg', role: 'img', 'aria-label': 'TOO format on the DDI' });
  ddi.append(svgEl('rect', { x: 0, y: 0, width: 240, height: 250, class: 'pbx-sky' }),
    svgEl('path', { d: 'M 112 34 H 128 M 120 34 V 44 M 112 216 H 128 M 120 216 V 206 M 40 117 V 133 M 40 125 H 50 M 200 117 V 133 M 200 125 H 190', class: 'tox-t' }));
  const weapon = svgEl('text', { x: 14, y: 20 }, 'HARM');
  const weaponX = svgEl('line', { x1: 10, y1: 20, x2: 50, y2: 10, class: 'tox-t' });
  const status = svgEl('text', { x: 14, y: 34 }, 'STBY');
  const clsText = svgEl('text', { x: 226, y: 20, 'text-anchor': 'end' }, 'ALL  CLASS');
  const tdc = svgEl('path', { d: 'M 226 34 l 5 5 l -5 5 l -5 -5 Z', class: 'tox-t', opacity: 0 });
  const arrow = svgEl('path', { d: 'M 222 125 l -8 -6 v 12 Z', class: 'tox-arrow' });
  ddi.append(weapon, weaponX, status, clsText, tdc, arrow,
    svgEl('text', { x: 120, y: 240, 'text-anchor': 'middle' }, 'TOO · HRM OVRD'));
  const ddiEm = EMS.filter(inFov).map(e => {
    const [x, y] = ddiXY(e);
    const g = svgEl('g', {});
    const box = svgEl('rect', { x: x - 11, y: y - 12, width: 22, height: 16, class: 'pbx-box', opacity: 0 });
    const hoff = svgEl('text', { x, y: y - 16, 'text-anchor': 'middle', opacity: 0 }, 'H-OFF');
    g.append(box, hoff, svgEl('text', { x, y, 'text-anchor': 'middle', class: 'spx-sym' }, e.rwr));
    ddi.append(g);
    return { g, box, hoff, e };
  });

  // ---- controls
  const targetHost = h('div', null);
  const visible = (c: Cls) => EMS.filter(e => inFov(e) && (c === 'ALL' || e.cls === c));
  const buildTargets = () => {
    const opts = visible(cls).map(e => ({ value: e.key, label: `${e.rwr} ${e.name}` }));
    if (!opts.some(x => x.value === target)) target = opts[0]!.value;
    targetHost.replaceChildren(segmented<string>({ id: 'harm-tox-tgt', label: 'Radar to hand off', size: 's', value: target, options: opts, onChange: v => { target = v; ex.play(); } }).el);
  };
  const clsSeg = segmented<Cls>({
    id: 'harm-tox-cls', label: 'CLASS', size: 's', value: cls,
    options: [{ value: 'ALL', label: 'ALL' }, { value: 'H1', label: 'H1 (older)' }, { value: 'H2', label: 'H2 (newer)' }],
    onChange: c => { cls = c; buildTargets(); ex.play(); },
  });
  buildTargets();

  function draw(t: number) {
    const shownCls: Cls = t < T.cls + 0.9 ? 'ALL' : cls;
    const vis = visible(shownCls);
    const order = vis.map(e => e.key);
    // Priority box: first in the class until HARM Sequence steps it to the chosen radar.
    let boxed = order[0];
    if (t >= T.step) {
      const steps = Math.max(0, order.indexOf(target));
      const k = Math.min(steps, Math.floor((t - T.step) / 0.7) + 1);
      boxed = order[Math.min(k, steps)];
    }
    const handed = t >= T.hoff;
    const fired = t >= T.fire;
    const hit = t >= T.hit;
    const tgt = EMS.find(e => e.key === target)!;
    clsText.textContent = `${shownCls}  CLASS`;
    setAttrs(tdc, { opacity: t >= T.tdc ? 1 : 0 });
    status.textContent = handed && !fired ? 'RDY' : 'STBY';
    setAttrs(weaponX, { opacity: handed && !fired ? 0 : 1 });
    setAttrs(arrow, { opacity: !handed && (shownCls === 'ALL' || shownCls === 'H1') ? 1 : 0 });
    for (const x of ddiEm) {
      const show = vis.includes(x.e) && (!handed || x.e.key === target) && !(hit && x.e.key === target);
      setAttrs(x.g, { opacity: show ? 1 : 0 });
      setAttrs(x.box, { opacity: show && x.e.key === boxed ? 1 : 0 });
      setAttrs(x.hoff, { opacity: show && handed && x.e.key === target ? 1 : 0 });
    }
    EMS.forEach((e, i) => setAttrs(emG[i]!, { class: `pbx-em${!inFov(e) || !vis.includes(e) ? ' is-ignored' : ''}${hit && e.key === target ? ' is-dead' : ''}` }));
    const k = clamp01((t - T.fire) / (T.hit - T.fire));
    const hx = lerp(JET[0], tgt.at[0], k), hy = lerp(JET[1], tgt.at[1], k) - Math.sin(k * Math.PI) * 26;
    setAttrs(harm, { cx: hx, cy: hy, opacity: fired && !hit ? 1 : 0 });
    let d = '';
    if (fired) for (let i = 0; i <= 20; i++) { const kk = k * i / 20; d += `${i ? 'L' : 'M'}${lerp(JET[0], tgt.at[0], kk).toFixed(1)} ${(lerp(JET[1], tgt.at[1], kk) - Math.sin(kk * Math.PI) * 26).toFixed(1)} `; }
    setAttrs(harmTrail, { d });
    const imp = clamp01((t - T.hit) / 0.6);
    setAttrs(flash, { cx: tgt.at[0], cy: tgt.at[1], r: 4 + 14 * imp, opacity: hit ? (1 - imp) * 0.9 : 0 });
    if (!hit) return {};
    const others = visible(cls).filter(e => e.key !== target).map(e => e.rwr);
    return {
      outcome: `You handed off ${tgt.rwr} (${tgt.name}, class ${tgt.cls}) and it is gone.${others.length ? ` ${others.join(' and ')} ${others.length > 1 ? 'were' : 'was'} also in class ${cls}: HARM Sequence picks between them.` : ''} The SA-6 (6) was outside the field of view all along: the arrow on the right told you to turn toward it.`,
    };
  }

  ex = createExplainer({
    title: 'How a TOO shot works',
    intro: 'Plan view with the HARM\'s field of view on the left, the TOO format on the right. Pick the class and the radar to hand off, then watch.',
    controls: [clsSeg.el, targetHost],
    figures: [[plan, 'Plan view (north up, not to scale)'], [ddi, 'TOO format (right DDI)']],
    steps: [
      'TOO: the HARM becomes its own sensor. Radars inside its 30° field of view show as their RWR numbers; arrows point to those outside (p368-369).',
      'Sensor Control toward the HARM display: the TDC (small diamond) is now on it, so I and C act on its targets (p368).',
      'CLASS: pick which kind of radar shows. H1 = older hostile systems, H2 = newer ones (p370-371; classes per radar p420).',
      'HARM Sequence (I) moves the box to the radar you want (p369).',
      'Cage/Uncage (C) hands it off: H-OFF above the box, the others vanish, STBY becomes RDY and the X leaves HARM (p368).',
      'Weapon release: the HARM flies at the handed-off radar.',
    ],
    marks: [0, T.tdc, T.cls, T.step, T.hoff, T.fire],
    end: T.end,
    draw,
    note: 'From the ED guide: TOO format, field of view, arrows, CLASS, HARM Sequence and hand-off (p368-372); classes per radar in the appendix (p420). Positions on the format are drawn for clarity; in the trainer only azimuth limits the field of view.',
    reducedMotion: o.reducedMotion,
    onClose: o.onClose,
  });
  return ex;
}
