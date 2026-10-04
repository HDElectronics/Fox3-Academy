/**
 * [OWNER: page-harm] Animated "How an SP shot works" for the SP and Pullback lessons. A plan view around the jet and
 * the EW page: the HARM cues itself to the highest radar threat, HARM Sequence steps it, RSET / Cage/Uncage brings it
 * back, release with no range, the next HARM cues itself (ED guide p364-367). Scenarios: normal SP, Pullback (a lock
 * readies a HARM against that radar, p365-367; their missile then loses guidance when the radar dies, Fox3 SAM notes),
 * and a radar that goes quiet (the HARM loses guidance and likely misses, p367). Built on explainer.ts.
 */
import { segmented } from '../../ui';
import { createExplainer, svgEl, setAttrs, clamp01, lerp, type Explainer } from './explainer';

type Scenario = 'sp' | 'pullback' | 'quiet';
interface Em { key: string; rwr: string; name: string; at: [number, number]; lock: boolean }
const JET: [number, number] = [210, 235];
/** Emitters around the jet (plan px, north up): an SA-11 search radar, an SA-6 that locks you, an SA-8 searching. */
const EMS: Em[] = [
  { key: 'sd', rwr: 'SD', name: 'SA-11 Snow Drift', at: [120, 70], lock: false },
  { key: 'sa6', rwr: '6', name: 'SA-6 Straight Flush', at: [250, 60], lock: true },
  { key: 'sa8', rwr: '8', name: 'SA-8', at: [330, 120], lock: false },
];
const az = (p: [number, number]) => Math.atan2(p[0] - JET[0], JET[1] - p[1]);
const EW_C: [number, number] = [120, 128];

const SCRIPT: Record<Scenario, { steps: string[]; marks: number[]; end: number }> = {
  sp: {
    steps: [
      'Select HARM on the stores page: it opens in SP and cues itself to the highest radar threat, boxed on the EW page and the HUD (p362, p365). The SA-6 has locked you: it comes first.',
      'HARM Sequence (I) steps the cue to the other threats (p365).',
      'RSET or Cage/Uncage (C) puts it back on the highest threat (p364-365).',
      'Weapon release. SP shows no range (p367): judge it yourself, for example with a waypoint on the site.',
      'The HARM already hears the radar, so it flies straight at it (p367).',
      'Hit. The next HARM cues itself to the highest threat left (p365).',
    ],
    marks: [0, 2.6, 5.2, 6.6, 7.6, 12.2], end: 15,
  },
  pullback: {
    steps: [
      'HRM OVRD unboxed on the stores page: Pullback armed. Boxed, the default, would only show PLBK (p363, p367).',
      'The SA-6 locks you: AI lamp. A lock is a critical threat, so a HARM is readied against that radar and HARM shows in the HUD (p365-366).',
      'Pickle at once. It works in any master mode; in A/A the trigger still fires your air-to-air missile (p366-367).',
      'The SA-6 launches: CW lamp. Your HARM is already on its way to the radar guiding that missile.',
      'Radar dead: their missile loses its guidance and goes ballistic (the site\'s radar must hold you to impact: Fox3 SAM notes). Turn away anyway.',
    ],
    marks: [0, 2.4, 5, 6.8, 11.6], end: 15,
  },
  quiet: {
    steps: [
      'SP cues the HARM to the SA-6 and you fire (p365).',
      'The HARM flies at the transmitting radar.',
      'The crew switches the radar off: the 6 disappears from the EW page.',
      'With nothing to listen to, the HARM loses guidance and will likely miss (p367). DCS AI does this itself ("Evasion of ARM").',
      'Wait for the radar to come back on, then shoot again.',
    ],
    marks: [0, 2.2, 6.4, 7.6, 12.2], end: 15,
  },
};

export function createSpExplainer(o: { reducedMotion: boolean; onClose?: () => void; scenario?: Scenario }): Explainer {
  let scenario: Scenario = o.scenario ?? 'sp';
  let ex!: Explainer;

  // ---- plan view
  const plan = svgEl('svg', { viewBox: '0 0 420 260', class: 'harm-pbx__svg', role: 'img', 'aria-label': 'Plan view around the jet' });
  plan.append(svgEl('rect', { x: 0, y: 0, width: 420, height: 260, class: 'pbx-land' }));
  const beams = EMS.map(() => svgEl('line', { class: 'spx-beam' }));
  const emG = EMS.map(e => {
    const g = svgEl('g', { class: 'pbx-em' });
    g.append(svgEl('rect', { x: e.at[0] - 4, y: e.at[1] - 4, width: 8, height: 8 }), svgEl('text', { x: e.at[0] + 8, y: e.at[1] - 4 }, e.rwr), svgEl('text', { x: e.at[0] + 8, y: e.at[1] + 8, class: 'pbx-sub' }, e.name));
    return g;
  });
  const jet = svgEl('path', { d: `M ${JET[0]} ${JET[1] - 12} L ${JET[0] + 8} ${JET[1] + 6} L ${JET[0]} ${JET[1] + 2} L ${JET[0] - 8} ${JET[1] + 6} Z`, class: 'pbx-jet' });
  const harmTrail = svgEl('path', { class: 'pbx-trail', d: '' });
  const harm = svgEl('circle', { r: 3, class: 'spx-harm', opacity: 0 });
  const sam = svgEl('circle', { r: 2.6, class: 'spx-sam', opacity: 0 });
  const samTrail = svgEl('path', { class: 'spx-samtrail', d: '' });
  const flash = svgEl('circle', { r: 0, class: 'pbx-flash', opacity: 0 });
  const hud = svgEl('g', { class: 'pbx-ufc' });
  const hudText = svgEl('text', { x: 14, y: 26 }, '');
  hud.append(svgEl('rect', { x: 6, y: 10, width: 120, height: 24, rx: 3 }), hudText);
  plan.append(...beams, ...emG, harmTrail, samTrail, jet, harm, sam, flash, hud);

  // ---- EW page
  const ew = svgEl('svg', { viewBox: '0 0 240 250', class: 'harm-pbx__svg', role: 'img', 'aria-label': 'EW page' });
  ew.append(svgEl('rect', { x: 0, y: 0, width: 240, height: 250, class: 'pbx-sky' }),
    svgEl('circle', { cx: EW_C[0], cy: EW_C[1], r: 90, class: 'spx-ring' }), svgEl('circle', { cx: EW_C[0], cy: EW_C[1], r: 50, class: 'spx-ring spx-ring--in' }),
    svgEl('path', { d: `M ${EW_C[0] - 5} ${EW_C[1]} H ${EW_C[0] + 5} M ${EW_C[0]} ${EW_C[1] - 5} V ${EW_C[1] + 5}`, class: 'spx-ring' }),
    svgEl('text', { x: 120, y: 244, 'text-anchor': 'middle', class: 'pbx-sub' }, 'inner ring: locked you'));
  const lamps = ['AI', 'CW'].map((l, i) => {
    const g = svgEl('g', { class: 'spx-lamp' });
    g.append(svgEl('rect', { x: 8 + i * 34, y: 8, width: 28, height: 16, rx: 2 }), svgEl('text', { x: 22 + i * 34, y: 20, 'text-anchor': 'middle' }, l));
    ew.append(g);
    return g;
  });
  const ewSym = EMS.map(e => {
    const g = svgEl('g', {});
    const t = svgEl('text', { 'text-anchor': 'middle', class: 'spx-sym' }, e.rwr);
    const box = svgEl('rect', { width: 22, height: 16, class: 'pbx-box', opacity: 0 });
    g.append(box, t);
    ew.append(g);
    return { g, t, box, e };
  });

  const seg = segmented<Scenario>({
    id: 'harm-spx-scn', label: 'Scenario', size: 's', value: scenario,
    options: [{ value: 'sp', label: 'SP: cue and step' }, { value: 'pullback', label: 'Pullback' }, { value: 'quiet', label: 'Radar goes quiet' }],
    onChange: s => { scenario = s; rebuild(); },
  });

  function rebuild(): void {
    const old = ex;
    ex = build();
    old.el.replaceWith(ex.el);
    old.dispose();
    ex.play();
  }

  function draw(t: number) {
    const sc = scenario;
    // Which emitter is cued: SP steps through them; pullback and quiet stay on the SA-6.
    let cued = 'sa6';
    if (sc === 'sp') cued = t < 3.4 ? 'sa6' : t < 4.4 ? 'sd' : t < 5.4 ? 'sa8' : 'sa6';
    const fireT = sc === 'sp' ? 6.6 : sc === 'pullback' ? 5 : 1.6;
    const hitT = sc === 'sp' ? 12.2 : sc === 'pullback' ? 11.6 : 99;
    const quietT = sc === 'quiet' ? 6.4 : 99;
    const lockOn = sc === 'pullback' ? t >= 2.4 : true;
    const samT = sc === 'pullback' ? 6.8 : 99;
    const dead = t >= hitT;
    if (sc === 'sp' && t >= hitT) cued = 'sa8';
    // beams and symbols
    EMS.forEach((e, i) => {
      const off = e.key === 'sa6' && (dead || t >= quietT);
      const locked = e.lock && lockOn && !off;
      setAttrs(beams[i]!, { x1: e.at[0], y1: e.at[1], x2: JET[0], y2: JET[1], class: `spx-beam${locked ? ' is-lock' : ''}`, opacity: off ? 0 : 1 });
      setAttrs(emG[i]!, { class: `pbx-em${e.key === 'sa6' && dead ? ' is-dead' : off ? ' is-ignored' : ''}` });
      const s = ewSym[i]!;
      const r = locked ? 50 : 90;
      const a = az(e.at);
      const x = EW_C[0] + Math.sin(a) * r, y = EW_C[1] - Math.cos(a) * r;
      setAttrs(s.t, { x, y: y + 4 });
      setAttrs(s.box, { x: x - 11, y: y - 8, opacity: e.key === cued && !off && t < (sc === 'quiet' ? quietT : 99) ? 1 : 0 });
      setAttrs(s.g, { opacity: off ? 0 : 1 });
    });
    setAttrs(lamps[0]!, { class: `spx-lamp${lockOn && !dead && t < quietT ? ' is-on' : ''}` });
    setAttrs(lamps[1]!, { class: `spx-lamp${t >= samT && !dead ? ' is-on' : ''}` });
    // HUD line
    hudText.textContent = sc === 'pullback' ? (t < 2.4 ? 'HRM OVRD unboxed' : t < fireT ? 'HUD: HARM  (pickle)' : 'Magnum') : t < fireT ? `HARM · SP · cued ${EMS.find(e => e.key === cued)!.rwr}` : 'Magnum';
    // HARM flight
    const target = EMS[1]!.at;
    const k = clamp01((t - fireT) / ((hitT === 99 ? 12.2 : hitT) - fireT));
    const lost = t >= quietT;
    let hx: number, hy: number;
    if (!lost) { hx = lerp(JET[0], target[0], k); hy = lerp(JET[1], target[1], k) - Math.sin(k * Math.PI) * 30; }
    else {
      const kq = clamp01((quietT - fireT) / (12.2 - fireT));
      const qx = lerp(JET[0], target[0], kq), qy = lerp(JET[1], target[1], kq) - Math.sin(kq * Math.PI) * 30;
      const dt = t - quietT;
      hx = qx + dt * 4; hy = qy - dt * 6 + dt * dt * 1.6;
    }
    setAttrs(harm, { cx: hx, cy: hy, opacity: t >= fireT && t < (hitT === 99 ? 13.5 : hitT) ? 1 : 0, class: `spx-harm${lost ? ' is-lost' : ''}` });
    let d = '';
    if (t >= fireT) {
      const n = 24;
      for (let i = 0; i <= n; i++) {
        const tt = fireT + (Math.min(t, hitT === 99 ? 13.5 : hitT) - fireT) * (i / n);
        let x: number, y: number;
        if (tt < quietT) { const kk = clamp01((tt - fireT) / (12.2 - fireT)); x = lerp(JET[0], target[0], kk); y = lerp(JET[1], target[1], kk) - Math.sin(kk * Math.PI) * 30; }
        else { const kq = clamp01((quietT - fireT) / (12.2 - fireT)); const dt = tt - quietT; x = lerp(JET[0], target[0], kq) + dt * 4; y = lerp(JET[1], target[1], kq) - Math.sin(kq * Math.PI) * 30 - dt * 6 + dt * dt * 1.6; }
        d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)} `;
      }
    }
    setAttrs(harmTrail, { d, class: `pbx-trail${lost ? ' is-lost' : ''}` });
    const imp = clamp01((t - hitT) / 0.6);
    setAttrs(flash, { cx: target[0], cy: target[1], r: 4 + 14 * imp, opacity: dead ? (1 - imp) * 0.9 : 0 });
    // Their missile (pullback): guided until the radar dies, then ballistic.
    if (t >= samT) {
      const guided = t < hitT;
      const ks = clamp01((Math.min(t, hitT) - samT) / 7.5);
      let sx = lerp(target[0], JET[0], ks * 0.75), sy = lerp(target[1], JET[1], ks * 0.75);
      if (!guided) { const dt = t - hitT; sx += dt * 6; sy += dt * 2 + dt * dt * 3; }
      setAttrs(sam, { cx: sx, cy: sy, opacity: t < hitT + 2.5 ? 1 : 0, class: `spx-sam${guided ? '' : ' is-lost'}` });
      setAttrs(samTrail, { d: `M ${target[0]} ${target[1]} L ${sx.toFixed(1)} ${sy.toFixed(1)}`, opacity: t < hitT + 2.5 ? 1 : 0.3 });
    } else { setAttrs(sam, { opacity: 0 }); setAttrs(samTrail, { d: '' }); }
    const outcome = sc === 'sp' ? (t >= hitT ? 'SA-6 radar dead. The next HARM cued itself to the highest threat left: here the SA-8 (8) over the Snow Drift (SD), a search radar. You never saw a range in SP.' : undefined)
      : sc === 'pullback' ? (t >= hitT ? 'Pullback worked: your HARM killed the radar that locked you, and their missile lost its guidance. HRM OVRD boxed would have shown PLBK and done nothing.' : undefined)
        : t >= 7.6 ? 'Radar quiet: the HARM lost guidance and falls short. Watch the EW page: when the 6 comes back, shoot again.' : undefined;
    return outcome ? { outcome, miss: sc === 'quiet' } : {};
  }

  function build(): Explainer {
    const s = SCRIPT[scenario];
    return createExplainer({
      title: 'How an SP shot works',
      intro: 'Plan view around your jet on the left, the EW page on the right. Pick a scenario and watch.',
      controls: [seg.el],
      figures: [[plan, 'Plan view (north up, not to scale)'], [ew, 'EW page (simplified: two rings)']],
      steps: s.steps, marks: s.marks, end: s.end,
      draw,
      note: 'From the ED guide: SP cueing, HARM Sequence, RSET and Cage/Uncage (p364-365); no range in SP and a radar that turns off makes the HARM miss (p367); Pullback, HRM OVRD and PLBK (p363, p365-367). Their missile needing the radar to impact is the trainer\'s SAM rule (docs/research/sam-threats.md). The EW page is simplified to two rings.',
      reducedMotion: o.reducedMotion,
      onClose: o.onClose,
    });
  }

  ex = build();
  // The page holds this wrapper: it follows the scenario rebuilds.
  const host = document.createElement('div');
  host.append(ex.el);
  const swap = () => { if (ex.el.parentElement !== host) host.replaceChildren(ex.el); };
  return {
    el: host,
    play() { swap(); ex.play(); },
    stop() { ex.stop(); },
    seek(t) { swap(); ex.seek(t); },
    dispose() { ex.dispose(); },
  };
}
