/**
 * [OWNER: page-reference] "What the display shows": one still frame of the selected jet's radar
 * format, drawn by the displays kit from a short TWS drill run by the sim, plus a symbol legend.
 * No animation loop: the sim is stepped once off the main mount, then the display is drawn once
 * (it redraws itself on resize).
 */
import { h, type Child } from '../../ui/dom';
import { screenBezel, callout } from '../../ui/panels';
import { RadarDisplay } from '../../ui/displays';
import { World } from '../../sim/world';
import { twsDrill } from '../../sim/scenarios';
import { buildRadarPicture } from '../../sim/picture';
import { radarRules } from '../../sim/radar';
import type { FighterId, DisplayFormat } from '../../data/types';
import type { RefCtx } from './common';

interface Legend { label: string; lines: string[]; simplified?: string }

const RU_HUD: Legend = {
  label: 'ИЛС',
  lines: [
    'Left scale: Rmax, Rtr and Rmin ticks with a caret for his range. ПР when you may fire.',
    'Contacts are rows of dots: more dots for a bigger target, two for a fighter. In СНП the cursor bars snap onto the track you designate.',
    'STT: a circle (a diamond on the MiG-29) with his aspect line; it flashes at 2 Hz once your missile is away.',
    'Legends: ИЗЛ while you radiate, the mode (ОБЗ, СНП or АТК ДВБ), the missile selected and how many are left.',
  ],
  simplified: 'The missile counter on the ИЛС is a trainer addition: DCS shows only the flashing lock mark. Every contact is drawn with two dots, and no PRF legend is drawn.',
};

const LEGENDS: Record<Exclude<DisplayFormat, 'mfd' | 'ru-hud'>, Legend> & Partial<Record<FighterId, Legend>> = {
  'f15-vsd': {
    label: 'VSD',
    lines: [
      'B-scope: range up, azimuth across, the scale top right. The TDC is the pair of bars you slew with ; , . /.',
      'Bricks in LRS. In TWS, tentative tracks are hollow and firm tracks filled, with altitude and an aspect stick.',
      'The PDT is a star; SDTs are hollow with their designation order.',
      'Left: the altitudes the scan covers at the TDC range. Right: the DLZ (Rpi, Rtr, Rmin) with his range caret.',
      'Shoot cue: a flashing star for the AIM-120, a flashing triangle for the AIM-7.',
    ],
    simplified: 'The T tta tti / M tti missile counter is drawn on the VSD here; in DCS it is on the HUD.',
  },
  tid: {
    label: 'TID',
    lines: [
      'Round plan view, aircraft-stabilised: you sit low, heading up.',
      'Tracks are a dot with a half-shape, a velocity vector and the altitude on the left.',
      'The WCS Phoenix order 1–6 sits right of each track; after launch it becomes the TTI, which blinks once the missile is active.',
      'In STT a single strobe replaces the scan limits.',
    ],
    simplified: 'No launch-zone vectors, datalink tracks or jam strobes on this TID.',
  },
  vtb: {
    label: 'VTB',
    lines: [
      'V marks a closing contact, Λ an opening one, with closing Mach beside firm contacts.',
      'The TDC cross shows the altitudes the beam covers at its range; the scan arc shows the beam position.',
      'PSIC data block: Mach, heading, closure, altitude and aspect of the locked target.',
      'Launch zone: the long limits and the short limit with his range; TIR when you may fire.',
      'T nn counts the Super 530D down; amber and flashing if your lock is gone.',
    ],
    simplified: 'The launch-zone scale and the T nn counter are HUD items in DCS, drawn on the VTB here. Contacts show one detection-bar tick; PSID is not modelled.',
  },
  fa18c: {
    label: 'DDI',
    lines: [
      'B-scope: azimuth across, range up. Pushbutton legends round the edge: mode, azimuth, bars, range.',
      'HAFU trackfiles with their threat rank. The L&S carries a star, DT2 a diamond.',
      'Fly-out pyramid on the steering line: seconds to active, then A.',
      'SHOOT is steady inside RMAX and flashes inside RNE.',
    ],
    simplified: 'Threat rank is by range; pushbutton legends are placed plausibly, not checked button by button.',
  },
  f16c: {
    label: 'FCR',
    lines: [
      'B-scope with scan-limit lines and a cursor that shows the altitude band the scan covers at its range.',
      'Search squares; tracks are "tanks" pointing along his track. The bug is circled, the others dashed with their order.',
      'Each AIM-120 puts a tail on its target, flashing once active, and an × for the last 8 s. A nn / T nn for the missile of interest.',
      'DLZ: RPI triangle and the RTR–RMIN box.',
    ],
    simplified: 'Pushbutton legends are placed plausibly, not checked button by button.',
  },
  jf17: {
    label: 'MFCD',
    lines: [
      'B-scope with STBY crossed out while the radar is on, and the * on the sensor of interest.',
      'The HPT is a circle, the SPT a 2. The NEZ is a green bar on the DLZ.',
      'HPT block: range, closure and aspect. After launch: TOA nn, then TTI nn.',
    ],
    simplified: 'The SPT\'s 2 is this trainer\'s mark (research only says it has no circle). Pushbutton legends are placed plausibly, not checked button by button.',
  },
};

function legendFor(ac: FighterId, format: DisplayFormat): Legend {
  if (format === 'ru-hud') {
    if (ac !== 'mig29s') return RU_HUD;
    return { ...RU_HUD, lines: [...RU_HUD.lines, 'СНП2: primary diamond, secondary cross, Ц1 Ц2 with ПР.'] };
  }
  if (format === 'mfd') return LEGENDS[ac] ?? LEGENDS.fa18c ?? RU_HUD;
  return LEGENDS[format];
}

export function displayLabel(ac: FighterId, format: DisplayFormat): string {
  return legendFor(ac, format).label;
}

export interface DisplayFigure { el: HTMLElement; dispose(): void }

/** Build the figure; the frame is computed after mount so the page paints first. */
export function displayFigure(rc: RefCtx): DisplayFigure {
  const { ac, spec, units } = rc;
  const legend = legendFor(ac, spec.display);
  const canvas = h('canvas', { class: 'ref-display__canvas', role: 'img', 'aria-label': `${spec.short} ${legend.label}: a still frame with bandits ahead` });
  const bezel = screenBezel({
    label: `${spec.short} ${legend.label}`, aspect: '1', content: canvas,
    status: spec.radar.tws ? (spec.radar.modeLabels.tws ?? 'TWS') : (spec.radar.modeLabels.rws ?? 'RWS'),
  });
  let radar: RadarDisplay | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const note = h('p', { class: 'ref-display__caption' },
    `A still frame from this trainer's sim: four bandits ahead at about ${units === 'metric' ? '45 km' : '24 nm'}, `
    + (spec.radar.tws ? `your radar in ${spec.radar.modeLabels.tws ?? 'TWS'} with the nearest track designated.` : `your radar in ${spec.radar.modeLabels.rws ?? 'RWS'} (no TWS on the ${spec.short}).`));

  try {
    radar = new RadarDisplay(canvas, { format: spec.display, units, aircraft: ac });
    radar.draw(null);
  } catch (e) {
    console.error(e);
  }

  timer = setTimeout(() => {
    timer = null;
    if (!radar) return;
    try {
      const world = new World(7);
      const drill = twsDrill(world, ac, { units, range: 45_000 });
      const me = world.get(drill.playerId);
      if (!me) return;
      if (spec.radar.tws) world.setRadarMode(me.id, 'tws');
      for (let i = 0; i < 150; i++) world.step(0.1);
      if (spec.radar.tws) {
        const firm = me.radar.tracks.filter(t => t.firm)
          .sort((a, b) => Math.hypot(a.pos.x - me.pos.x, a.pos.z - me.pos.z) - Math.hypot(b.pos.x - me.pos.x, b.pos.z - me.pos.z));
        const cap = Math.min(2, radarRules(ac).designationCap);
        for (const t of firm.slice(0, cap)) if (!me.radar.designated.includes(t.targetId)) world.designate(me.id, t.targetId);
        for (let i = 0; i < 20; i++) world.step(0.1);
      }
      radar.draw(buildRadarPicture(world, me.id, { units }), { ownHeading: me.heading });
      const mode = me.radar.mode;
      bezel.setStatus(spec.radar.modeLabels[mode] ?? mode.toUpperCase());
      const lead = `A still frame from this trainer's sim: four bandits ahead at about ${units === 'metric' ? '45 km' : '24 nm'}. `;
      const n = me.radar.designated.length;
      if (mode === 'stt' && spec.radar.tws?.autoSttAtRmaxFraction != null) {
        note.textContent = lead + `You designated the nearest in ${spec.radar.modeLabels.tws ?? 'СНП'}; he came inside ${Math.round(spec.radar.tws.autoSttAtRmaxFraction * 100)} % of Rmax, so the radar locked him by itself (${spec.radar.modeLabels.stt ?? 'STT'}).`;
      } else if (mode === 'tws') {
        note.textContent = lead + (n > 1 ? `Your radar is in TWS with ${n} tracks designated.` : n === 1 ? 'Your radar is in TWS with the nearest track designated.' : 'Your radar is in TWS.');
      }
    } catch (e) {
      console.error(e);
    }
  }, 30);

  const el = h('div', { class: 'ref-display' }, h('div', { class: 'ref-display__inner' },
    h('div', { class: 'ref-display__fig' }, bezel.el, note),
    h('div', { class: 'ref-display__legend' },
      h('h4', { class: 'ref-display__title' }, `Reading the ${legend.label}`),
      h('ul', null, legend.lines.map(l => h('li', null, l as Child))),
      legend.simplified ? callout({ kind: 'simplified', body: legend.simplified }) : null)));

  return {
    el,
    dispose() {
      if (timer) { clearTimeout(timer); timer = null; }
      radar?.dispose(); radar = null;
    },
  };
}
