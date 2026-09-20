/**
 * [OWNER: page-radar-lab] The reading section under the lab: bars, frame time, altitude coverage maths,
 * the notch, look-down and aspect, then notes for the selected jet. Every number comes from the jet's
 * data, so the text changes with the jet in the top bar.
 */
import { AIRCRAFT, AIRCRAFT_CAVEATS } from '../../data/aircraft';
import type { AircraftId } from '../../data/types';
import { defaultAdversary } from '../../sim/scenarios';
import { M_PER_FT, M_PER_NM, MPS_PER_KT } from '../../sim/math';
import type { Units } from '../../app/format';
import { callout, dataTable, h, kbd } from '../../ui';
import {
  REF_RCS, alt, beamWindowDeg, coverageAt, detectKm, lookDownCaveat, metresPerDegree, patternHalfDeg, rng, scanCombos, seconds,
  twsPatterns,
} from './geometry';
import { JET_NOTES } from './notes';

/** "Simplified here" lines for this page: the sim's radar model plus the jet's scan/detection caveats. */
export function simplifiedLines(ac: AircraftId): string[] {
  const spec = AIRCRAFT[ac];
  const lines = [
    'Detection is a range test with a short probability edge, not a signal-to-noise model: no PRF, jamming, burn-through or terrain masking.',
    spec.radar.notchNeedsLookDown
      ? 'The notch is a flat radial-speed gate from the data, applied only in look-down. No zero-Doppler tail-chase gate, and a notched contact is dropped at once instead of coasting on range and angle.'
      : 'The notch is a flat radial-speed gate from the AI table, applied at any look angle here. No zero-Doppler tail-chase gate, and a notched contact is dropped at once.',
    'The scan is horizon-stabilised and ignores bank. Coverage numbers use a flat earth (range × tan angle).',
    'The 3D view and the side view show the truth. The radar display shows only what the radar has painted.',
  ];
  const ld = lookDownCaveat(ac);
  if (ld) lines.push(ld.replace(/^Simplified: /, ''));
  if (spec.display === 'ru-hud') lines.push('Range-angle aiming: the expected range and the radar cursor share one value here; in the jet they are separate entries.');
  const re = /bar|scan|detect|notch|beam|range scale|elevation|azimuth|gimbal|TWS scan|frame/i;
  // The lab enforces the DCS TWS pattern list where it has one, so the data's "frame-time rule also allows…" note no longer applies.
  const pats = twsPatterns(ac);
  for (const c of AIRCRAFT_CAVEATS[ac]) if (re.test(c) && !(pats && /frame-time rule also allows/i.test(c))) lines.push(c);
  return lines;
}

export function buildExplainer(ac: AircraftId, u: Units): HTMLElement {
  const spec = AIRCRAFT[ac], r = spec.radar;
  const opp = defaultAdversary(ac), oppSpec = AIRCRAFT[opp];
  const combos = scanCombos(ac);
  const barsList = [...r.barOptions].sort((a, b) => a - b);
  const ru = spec.display === 'ru-hud';
  const widest = Math.min(Math.max(...r.azHalfWidthOptionsDeg), r.gimbalAzDeg);
  const defBars = r.barOptions.includes(4) ? 4 : r.barOptions[0];
  const own = u === 'metric' ? 9000 : 30000 * M_PER_FT;
  const half = patternHalfDeg(r, defBars);
  const ranges = u === 'metric' ? [20000, 40000, 80000, 150000] : [10, 20, 40, 80].map(n => n * M_PER_NM);
  const gate = r.notchKts;
  const ruleText = u === 'metric'
    ? `At 1 km, one degree is ${Math.round(metresPerDegree(1000))} m. So 1° ≈ 17 m per km of range: at 50 km a degree is about 870 m.`
    : 'At 1 nm, one degree is about 106 ft. So 1° ≈ 100 ft per nm of range: at 40 nm a degree is about 4,200 ft.';

  const sections: HTMLElement[] = [];
  const sec = (id: string, title: string, ...children: (Node | string | null)[]) =>
    sections.push(h('section', { class: 'rl-ex__sec', id: 'rl-' + id, 'aria-labelledby': 'rl-' + id + '-h' },
      h('h2', { id: 'rl-' + id + '-h' }, title), ...children));

  sec('bars', 'Bars: the radar looks through slots',
    h('p', null, `The antenna sweeps one horizontal slice at a time, a bar, then steps to the next bar and sweeps back. A target is seen only when the beam crosses it on the right bar. The ${r.name} beam is ${r.beamWidthDeg}° wide and its bars are ${r.barSpacingDeg}° apart, so the pattern is only a few degrees tall:`),
    dataTable({
      caption: `${r.name} bar patterns`,
      columns: [
        { key: 'bars', label: 'Bars', num: true },
        { key: 'height', label: 'Pattern height', num: true, cell: (x: { bars: number }) => (2 * patternHalfDeg(r, x.bars)).toFixed(1) + '°' },
        { key: 'cov', label: `Slice at ${rng(ranges[2], u)}`, num: true, cell: (x: { bars: number }) => alt(2 * ranges[2] * Math.tan(patternHalfDeg(r, x.bars) * Math.PI / 180), u) },
      ],
      rows: barsList.map(b => ({ bars: b })),
      highlight: x => x.bars === defBars,
    }),
    r.barOptions.length === 1
      ? h('p', null, `In the ${spec.short} the bar count is not selectable in DCS. You change what the bars cover by tilting the antenna, not by adding bars.`)
      : h('p', null, 'More bars means a taller slice of sky, and a slower frame.'),
  );

  sec('frame', 'Frame time: how long a spot waits',
    h('p', null, `Frame time = bars × scan width ÷ antenna speed. The ${r.name} sweeps at about ${r.scanRateDegPerS}°/s here. A bandit who turns just after the beam passed shows up one frame later. With an odd number of bars the sweep direction alternates every frame, so the worst case is two frames.`),
    dataTable({
      caption: r.tws ? `${spec.short} frame time: width × bars (TWS = allowed in TWS)` : `${spec.short} frame time: width × bars`,
      columns: [
        { key: 'az', label: 'Width', cell: (row: { az: number }) => `±${row.az}°` },
        ...barsList.map(b => ({
          key: 'b' + b, label: ru ? `${b} bars` : `${b}B`, num: true,
          cell: (row: { az: number }) => {
            const c = combos.find(x => x.azHalfDeg === row.az && x.bars === b);
            if (!c) return '';
            return h('span', { class: c.tws && !c.bugOnly ? 'rl-ex__tws' : undefined },
              seconds(c.frame), c.bugOnly ? ' bug' : c.tws ? ' TWS' : '');
          },
        })),
      ],
      rows: [...new Set(combos.map(c => c.azHalfDeg))].map(az => ({ az })),
      highlight: row => row.az === widest,
    }),
    r.tws
      ? h('p', null, twsPatterns(ac)
        ? `In DCS, ${r.modeLabels.tws ?? 'TWS'} offers only ${twsPatterns(ac)?.map(([a, b]) => `±${a}° ${b}B`).join(', ')}: every one refreshes a track in ${r.tws.maxFrameTimeS ?? 3} s or less. Pick a width or bar count in ${r.modeLabels.tws ?? 'TWS'} and the lab selects the matching pattern.`
        : r.tws.maxFrameTimeS
          ? `TWS refuses any pattern slower than ${r.tws.maxFrameTimeS} s per frame, so track files stay fresh.`
          : `TWS limits the window to ±${r.tws.maxAzHalfWidthDeg ?? r.gimbalAzDeg}°.`)
      : h('p', null, `The ${spec.short} has no multi-target TWS in DCS: every frame is a search frame.`),
  );

  sec('coverage', 'Altitude coverage: the number to read',
    h('p', null, 'Every radar display prints two altitudes beside the cursor: the top and bottom of your scan at the cursor range. They come from simple geometry:'),
    h('p', { class: 'rl-ex__formula' }, 'coverage = your altitude + range × tan(scan edge angle)'),
    h('p', null, ruleText + ' The slice grows with range, which is why a bandit you painted far out slides out of the bars as he gets close, above you or below you.'),
    dataTable({
      caption: `Antenna level, ${alt(own, u)}, ${defBars}-bar pattern (±${half.toFixed(1)}°)`,
      columns: [
        { key: 'r', label: 'Cursor range', num: true, cell: (x: { r: number }) => rng(x.r, u) },
        { key: 'top', label: 'Top', num: true, cell: x => alt(coverageAt(own, x.r, half, -half).top, u) },
        { key: 'bot', label: 'Bottom', num: true, cell: x => alt(Math.max(0, coverageAt(own, x.r, half, -half).bottom), u) },
        { key: 'deg', label: '1° is', num: true, cell: x => alt(metresPerDegree(x.r), u) },
      ],
      rows: ranges.map(x => ({ r: x })),
    }),
    h('p', null, 'The drill: put the cursor at the range GCI gives you, read the two numbers, tilt until the bandit\'s altitude sits between them. Then leave the cursor there while you wait a frame or two.'),
  );

  // His ground speed in kt: round numbers in the pilot's units.
  const speeds = u === 'metric' ? [650, 850, 1000].map(k => k / 3.6 / MPS_PER_KT) : [350, 450, 550];
  sec('notch', 'The notch',
    h('p', null, `A pulse-Doppler radar throws away returns that move at about the speed of the ground, or it would drown in clutter. A target flying across your line of sight has almost no radial speed, so it is thrown away too. The ${r.name} gate is ${gate} kt (${Math.round(gate * MPS_PER_KT * 3.6 / 5) * 5} km/h) of radial speed against the ground.`),
    dataTable({
      caption: 'How exactly he must hold the beam',
      columns: [
        { key: 's', label: 'His ground speed', num: true, cell: (x: { s: number }) => u === 'metric' ? `${Math.round(x.s * MPS_PER_KT * 3.6)} km/h` : `${Math.round(x.s)} kt` },
        { key: 'w', label: 'Beam window', num: true, cell: x => `±${beamWindowDeg(gate, x.s).toFixed(1)}°` },
      ],
      rows: speeds.map(s => ({ s })),
    }),
    h('p', null, r.notchNeedsLookDown
      ? `On the ${spec.short} the notch needs look-down: ground clutter behind the target. A beaming bandit above you stays on your scope.`
      : 'On FC3 radars the AI table gives a flat gate; this trainer applies it at any look angle. Whether DCS needs look-down for FC3 radars is not confirmed.'),
    h('p', null, 'Notching hides him from your radar, not your radar from him: the beam still paints him, so his RWR still shows your search. The moment he turns back in, his radial speed clears the gate and he is back on your scope.'),
  );

  const lookRows = [
    { k: 'Hot, look-up', a: 0, d: false },
    { k: 'Hot, look-down', a: 0, d: true },
    { k: 'Beam, look-up', a: 90, d: false },
    { k: 'Cold, look-up', a: 180, d: false },
    { k: 'Cold, look-down', a: 180, d: true },
  ];
  sec('lookdown', 'Look-down and aspect',
    h('p', null, `Detection range depends on where the target points and what is behind it. A hot target shows its nose and closes; a cold one shows its tail. Looking down, the target sits against ground clutter. This trainer gives the ${r.name} ${rng(r.detectKm.headOn * 1000, u)} head-on and ${rng(r.detectKm.tail * 1000, u)} tail-on against a ${r.detectKm.referenceRcsM2 ?? 5} m² fighter${r.detectKm.lookDownFactor < 1 ? `, hot ×${r.detectKm.lookDownHeadOnFactor ?? r.detectKm.lookDownFactor} / cold ×${r.detectKm.lookDownFactor} in look-down` : ', with no look-down penalty, as in the DCS table'}. Where the numbers come from is under Simplified here.`),
    dataTable({
      caption: `${r.name} detection range`,
      columns: [
        { key: 'k', label: 'Target', cell: (x: typeof lookRows[number]) => x.k },
        { key: 'ref', label: '5 m² fighter', num: true, cell: x => rng(detectKm(r, 'f15c', x.a, x.d) * 1000, u) },
        ...(oppSpec.rcsM2 === REF_RCS ? [] : [
          { key: 'opp', label: `${oppSpec.short} (${oppSpec.rcsM2} m²)`, num: true, cell: (x: typeof lookRows[number]) => rng(detectKm(r, opp, x.a, x.d) * 1000, u) },
        ]),
      ],
      rows: lookRows,
    }),
    lookDownCaveat(ac) ? h('p', null, lookDownCaveat(ac)) : null,
    h('p', null, 'Range scales with the fourth root of radar cross-section: a 3 m² fighter is seen at 88 % of the range of a 5 m² one. In the last 20 % of detection range only some looks paint him here, so a faint contact flickers before it holds.'),
  );

  const notes = JET_NOTES[ac];
  sec('jet', `In the ${spec.short}`,
    h('div', { class: 'rl-ex__notes' }, notes.map(n => h('div', { class: 'rl-ex__note ui-surface' },
      h('h3', null, n.title),
      h('p', null, n.text),
      n.keys ? h('div', { class: 'rl-ex__keys' }, kbd(n.keys)) : null))),
  );

  sections.push(callout({ kind: 'simplified', body: h('ul', null, simplifiedLines(ac).map(l => h('li', null, l))) }));

  return h('article', { class: 'rl-ex ui-prose', 'aria-label': 'How the scan works' },
    h('header', { class: 'rl-ex__head' },
      h('p', { class: 'rl-ex__kicker' }, `${spec.short} · ${r.name}`),
      h('h2', { class: 'rl-ex__title' }, 'How the scan works')),
    ...sections);
}
