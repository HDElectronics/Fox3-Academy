/**
 * [OWNER: page-harm] Animated "Cage/Uncage: what a hand-off is". Two figures: who knows the target (your displays on
 * one side, the HARM on its station on the other, with the SMS STBY/RDY legend) and the display you work. TOO: the box
 * is only the jet's choice until Cage/Uncage hands it off to the missile (H-OFF, the others vanish, STBY to RDY, the X
 * goes); a second press cancels (ED guide p361, p368-369). SP: targeting is automatic, so Cage/Uncage just goes back
 * to the highest threat, like RSET (p365, p368). PB: no hand-off, the UFC code and the designated waypoint do the job
 * (p373-375). Built on explainer.ts.
 */
import { segmented } from '../../ui';
import { createExplainer, svgEl, setAttrs, clamp01, lerp, type Explainer } from './explainer';

type CageMode = 'too' | 'sp' | 'pb';

/** Emitters on the display (TOO format / EW page), display px. */
const TOO_EMS = [
  { key: '8', at: [78, 150] as [number, number] },
  { key: '15', at: [138, 120] as [number, number] },
  { key: 'SD', at: [176, 82] as [number, number] },
];
const EW_C: [number, number] = [120, 128];
const SP_EMS = [
  { key: '6', a: 0.35, r: 50 },
  { key: 'SD', a: -0.9, r: 90 },
  { key: '8', a: 1.4, r: 90 },
];

const SCRIPT: Record<CageMode, { steps: string[]; marks: number[]; end: number }> = {
  too: {
    steps: [
      'TOO, TDC on the HARM display. The box sits on the first target. That box is only your jet\'s choice: the missile has been told nothing, so the stores page shows HARM with an X and STBY (p361, p369).',
      'HARM Sequence (I) moves the box to 15. Still only on your display: the HARM is still STBY.',
      'Cage/Uncage (C): the jet hands the boxed radar off to the missile. H-OFF above the box, the other targets vanish, STBY becomes RDY and the X goes (p368-369).',
      'A second press of Cage/Uncage cancels the hand-off (RSET does too): every target is back, STBY again (p368-369).',
      'Press it again to hand 15 back off. RDY.',
      'Weapon release. Only a handed-off HARM leaves: it flies at the radar it was given (p368).',
    ],
    marks: [0, 2.6, 5, 8.4, 11, 13], end: 17,
  },
  sp: {
    steps: [
      'SP: targeting is automatic. The HARM is cued to the highest threat by itself, the 6 that locked you (inner ring), so there is nothing to hand off (p365, p368).',
      'HARM Sequence (I) steps the cue to the other threats; the missile follows the box (p365).',
      'Cage/Uncage (C) in SP is not a hand-off: it puts the cue back on the highest threat, the same as RSET (p365).',
    ],
    marks: [0, 2.4, 5.6], end: 8,
  },
  pb: {
    steps: [
      'PB: you tell the HARM what to listen for with the UFC code (TGT, 107 = Snow Drift) and where with the designated waypoint (p373-375, appendix p420).',
      'That is the whole hand-off: the guide\'s PB procedure has no Cage/Uncage step. Release on the HUD cues (p374-375).',
    ],
    marks: [0, 3.4], end: 7,
  },
};

export function createCageExplainer(o: { reducedMotion: boolean; onClose?: () => void; mode?: CageMode }): Explainer {
  let mode: CageMode = o.mode ?? 'too';
  let ex!: Explainer;

  // ---- figure 1: who knows the target
  const chain = svgEl('svg', { viewBox: '0 0 420 200', class: 'harm-pbx__svg', role: 'img', 'aria-label': 'Your displays and the HARM on its station' });
  chain.append(svgEl('rect', { x: 0, y: 0, width: 420, height: 200, class: 'pbx-sky' }));
  const jetBox = svgEl('g', { class: 'pbx-ufc' });
  const jetText = svgEl('text', { x: 85, y: 92, 'text-anchor': 'middle' }, '');
  jetBox.append(svgEl('rect', { x: 20, y: 44, width: 130, height: 70, rx: 4 }),
    svgEl('text', { x: 85, y: 64, 'text-anchor': 'middle', class: 'pbx-sub' }, 'Your display'), jetText);
  const harmBox = svgEl('g', { class: 'pbx-ufc' });
  const harmText = svgEl('text', { x: 335, y: 92, 'text-anchor': 'middle' }, '');
  harmBox.append(svgEl('rect', { x: 270, y: 44, width: 130, height: 70, rx: 4 }),
    svgEl('text', { x: 335, y: 64, 'text-anchor': 'middle', class: 'pbx-sub' }, 'HARM on station 8'), harmText);
  const wire = svgEl('line', { x1: 150, y1: 79, x2: 270, y2: 79, class: 'cgx-wire' });
  const wireLbl = svgEl('text', { x: 210, y: 70, 'text-anchor': 'middle', class: 'pbx-sub' }, '');
  const packet = svgEl('circle', { r: 5, class: 'cgx-packet', opacity: 0 });
  // SMS wingform legend for that station.
  const sms = svgEl('g', {});
  const smsName = svgEl('text', { x: 300, y: 158 }, 'HARM');
  const smsX = svgEl('line', { x1: 296, y1: 160, x2: 340, y2: 145, class: 'tox-t' });
  const smsStat = svgEl('text', { x: 300, y: 178 }, 'STBY');
  sms.append(svgEl('text', { x: 290, y: 158, 'text-anchor': 'end', class: 'pbx-sub' }, 'Stores page:'), smsName, smsX, smsStat);
  const missile = svgEl('path', { d: 'M 0 0 h 34 l 8 4 l -8 4 h -34 l -4 -6 v 4 Z', class: 'cgx-missile' });
  const missileG = svgEl('g', {});
  missileG.append(missile);
  chain.append(wire, wireLbl, jetBox, harmBox, packet, sms, missileG);

  // ---- figure 2: the display you work (one per mode)
  const disp = svgEl('svg', { viewBox: '0 0 240 250', class: 'harm-pbx__svg', role: 'img', 'aria-label': 'The display you work' });
  disp.append(svgEl('rect', { x: 0, y: 0, width: 240, height: 250, class: 'pbx-sky' }));
  const dispTitle = svgEl('text', { x: 120, y: 240, 'text-anchor': 'middle' }, '');
  disp.append(dispTitle);
  // TOO format
  const tooG = svgEl('g', {});
  tooG.append(svgEl('path', { d: 'M 112 34 H 128 M 120 34 V 44 M 112 216 H 128 M 120 216 V 206 M 40 117 V 133 M 40 125 H 50 M 200 117 V 133 M 200 125 H 190', class: 'tox-t' }),
    svgEl('path', { d: 'M 226 34 l 5 5 l -5 5 l -5 -5 Z', class: 'tox-t' }));
  const tooSym = TOO_EMS.map(e => {
    const g = svgEl('g', {});
    const box = svgEl('rect', { x: e.at[0] - 12, y: e.at[1] - 12, width: 24, height: 16, class: 'pbx-box', opacity: 0 });
    const hoff = svgEl('text', { x: e.at[0], y: e.at[1] - 16, 'text-anchor': 'middle', opacity: 0 }, 'H-OFF');
    g.append(box, hoff, svgEl('text', { x: e.at[0], y: e.at[1], 'text-anchor': 'middle', class: 'spx-sym' }, e.key));
    tooG.append(g);
    return { g, box, hoff, key: e.key };
  });
  // EW page (SP)
  const ewG = svgEl('g', {});
  ewG.append(svgEl('circle', { cx: EW_C[0], cy: EW_C[1], r: 90, class: 'spx-ring' }), svgEl('circle', { cx: EW_C[0], cy: EW_C[1], r: 50, class: 'spx-ring spx-ring--in' }));
  const ewSym = SP_EMS.map(e => {
    const x = EW_C[0] + Math.sin(e.a) * e.r, y = EW_C[1] - Math.cos(e.a) * e.r;
    const box = svgEl('rect', { x: x - 11, y: y - 8, width: 22, height: 16, class: 'pbx-box', opacity: 0 });
    ewG.append(box, svgEl('text', { x, y: y + 4, 'text-anchor': 'middle', class: 'spx-sym' }, e.key));
    return { box, key: e.key };
  });
  // UFC (PB)
  const ufcG = svgEl('g', { class: 'pbx-ufc' });
  ufcG.append(svgEl('rect', { x: 30, y: 70, width: 180, height: 44, rx: 4 }), svgEl('text', { x: 120, y: 98, 'text-anchor': 'middle' }, 'TGT  107'),
    svgEl('rect', { x: 30, y: 130, width: 180, height: 44, rx: 4 }), svgEl('text', { x: 120, y: 158, 'text-anchor': 'middle' }, 'WPDSG  WP4'));
  disp.append(tooG, ewG, ufcG);

  const seg = segmented<CageMode>({
    id: 'harm-cgx-mode', label: 'Mode', size: 's', value: mode,
    options: [{ value: 'too', label: 'TOO: the real hand-off' }, { value: 'sp', label: 'SP' }, { value: 'pb', label: 'PB' }],
    onChange: m => { mode = m; rebuild(); },
  });

  function rebuild(): void {
    const old = ex;
    ex = build();
    old.el.replaceWith(ex.el);
    old.dispose();
    ex.play();
  }

  /** Packet from the display to the missile between t0 and t0 + 0.8 s (cancel runs it back). */
  function sendPacket(t: number, t0: number, back = false): boolean {
    const k = clamp01((t - t0) / 0.8);
    const on = t >= t0 && t < t0 + 0.8;
    const x = back ? lerp(270, 150, k) : lerp(150, 270, k);
    setAttrs(packet, { cx: x, cy: 79, opacity: on ? 1 : 0 });
    return on;
  }

  function draw(t: number) {
    tooG.setAttribute('opacity', mode === 'too' ? '1' : '0');
    ewG.setAttribute('opacity', mode === 'sp' ? '1' : '0');
    ufcG.setAttribute('opacity', mode === 'pb' ? '1' : '0');
    setAttrs(missileG, { transform: 'translate(300 128)', opacity: 1 });
    // The guide ties STBY/RDY to the TOO hand-off (p361); the SP and PB legends are not shown here.
    setAttrs(sms, { opacity: mode === 'too' ? 1 : 0 });

    if (mode === 'too') {
      dispTitle.textContent = 'TOO format (right DDI)';
      // Hand-off state over time: C at 5, cancel at 8.4, again at 11, release at 13.
      const hoff = (t >= 5.8 && t < 8.4) || t >= 11.8;
      const boxed = t < 3.2 ? '8' : '15';
      const fired = t >= 13;
      for (const s of tooSym) {
        const show = !hoff || s.key === boxed;
        setAttrs(s.g, { opacity: show && !(fired && s.key !== boxed) ? 1 : 0 });
        setAttrs(s.box, { opacity: s.key === boxed ? 1 : 0 });
        setAttrs(s.hoff, { opacity: hoff && s.key === boxed ? 1 : 0 });
      }
      const moving = sendPacket(t, 5) || sendPacket(t, 11) || sendPacket(t, 8.4, true);
      jetText.textContent = `box on ${boxed}`;
      harmText.textContent = fired ? 'away: 15' : hoff ? 'target: 15' : 'no target';
      wireLbl.textContent = moving ? (t >= 8.4 && t < 9.2 ? 'cancel (C)' : 'hand-off (C)') : hoff ? 'handed off' : '';
      setAttrs(wire, { class: `cgx-wire${hoff ? ' is-on' : ''}` });
      smsStat.textContent = fired ? 'next HARM: STBY' : hoff ? 'RDY' : 'STBY';
      setAttrs(smsX, { opacity: hoff && !fired ? 0 : 1 });
      const k = clamp01((t - 13) / 2.5);
      setAttrs(missileG, { transform: `translate(${lerp(300, 440, k * k)} ${lerp(128, 110, k)})`, opacity: k >= 1 ? 0 : 1 });
      return t >= 13.5 ? { outcome: 'The box is your choice; the hand-off gives it to the missile. No H-OFF, no RDY, no shot: if weapon release does nothing in TOO, press Cage/Uncage.' } : {};
    }

    if (mode === 'sp') {
      dispTitle.textContent = 'EW page (left DDI)';
      const cued = t < 3 ? '6' : t < 4.2 ? 'SD' : t < 5.6 ? '8' : '6';
      for (const s of ewSym) setAttrs(s.box, { opacity: s.key === cued ? 1 : 0 });
      sendPacket(t, 99);
      jetText.textContent = `cue on ${cued}`;
      harmText.textContent = `cued: ${cued}`;
      wireLbl.textContent = t >= 5.6 && t < 6.6 ? 'C = back to highest threat' : 'automatic';
      setAttrs(wire, { class: 'cgx-wire is-on' });
      return t >= 5.8 ? { outcome: 'In SP the HARM follows the cue by itself. Cage/Uncage there is a shortcut back to the highest threat, not a hand-off.' } : {};
    }

    dispTitle.textContent = 'UFC and HSI';
    sendPacket(t, 1.2);
    jetText.textContent = '107 at WP4';
    harmText.textContent = t >= 2 ? 'listen for 107 at WP4' : 'no target';
    wireLbl.textContent = t >= 1.2 && t < 2 ? 'code + WPDSG' : t >= 2 ? 'programmed' : '';
    setAttrs(wire, { class: `cgx-wire${t >= 2 ? ' is-on' : ''}` });
    return t >= 3.4 ? { outcome: 'PB has no hand-off: the code says which radar, the waypoint says where. Cage/Uncage is a TOO tool.' } : {};
  }

  function build(): Explainer {
    const s = SCRIPT[mode];
    return createExplainer({
      title: 'Cage/Uncage: what a hand-off is',
      intro: 'Cage/Uncage (C) is the throttle button that also uncages a Sidewinder\'s seeker. With the HARM selected, it decides whether the missile has been given a target. Left: your display and the HARM on its station. Right: the display you work.',
      controls: [seg.el],
      figures: [[chain, 'Who knows the target'], [disp, 'The display you work']],
      steps: s.steps, marks: s.marks, end: s.end,
      draw,
      note: 'From the ED guide: STBY until a target is handed off (H-OFF), then RDY (p361); TOO hand-off, the second press cancels, the others vanish, the X goes (p368-369); RSET cancels a hand-off (p369); SP is automatic and Cage/Uncage re-selects the highest threat (p365, p368); PB procedure (p373-375). The Sidewinder use of the button: docs/research/hornet-viper.md. The two boxes on the left are a teaching drawing, not a cockpit display.',
      reducedMotion: o.reducedMotion,
      onClose: o.onClose,
    });
  }

  ex = build();
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
