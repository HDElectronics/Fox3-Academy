/**
 * [OWNER: page-reference] Radar section for the selected jet: modes with cockpit labels, scan
 * patterns and frame times, TWS rules, detection and notch numbers in the user's units, and what
 * the display shows.
 */
import { h, type Child } from '../../ui/dom';
import { callout } from '../../ui/panels';
import { AIRCRAFT_CAVEATS } from '../../data';
import type { AircraftSpec, RadarModeId } from '../../data/types';
import { radarRules } from '../../sim/radar';
import { beamWindowDeg, capUnpublished, fox3Of, matches, rangeText, rangeUnit, rangeNum, scanMatrix, speedText, twsPatternText, twsPatternsOf } from './model';
import { hl, lessonLink, tag, type RefCtx } from './common';
import { displayFigure, type DisplayFigure } from './displayFigure';

const BEAM_GS_KTS = 450;

function modeWhat(spec: AircraftSpec, mode: RadarModeId): string {
  const r = spec.radar, tws = r.tws;
  switch (mode) {
    case 'rws':
      switch (spec.id) {
        case 'fa18c': return 'Search with Latent TWS: trackfiles you can designate (L&S, DT2), but no SHOOT cue and no AIM-120 launch until you go TWS or STT.';
        case 'f16c': return 'Search. TMS Up on a hit bugs it and enters SAM, which keeps searching around it; you can fire AIM-120s from SAM.';
        case 'jf17': return 'Search. Bugging a contact enters SAM (ASM or NAM), which tracks it while the scan goes on.';
        case 'f14b': return 'Search with range. The TID shows momentary tracks that last about 2 s, no track files; lock with PD STT to shoot.';
        default: return 'Search. Raw hits with range and no track files; put the cursor on a hit and lock it (STT) to shoot.';
      }
    case 'tws':
      if (!tws) return '';
      if (tws.autoSttAtRmaxFraction != null) {
        return `Designate one track (the cursor snaps to it). The radar locks it by itself at ${Math.round(tws.autoSttAtRmaxFraction * 100)} % of Rmax, so the shot leaves from STT. Needs PRF ППС or ЗПС.`
          + (tws.maxSimultaneousTargets > 1 ? ' СНП2: two targets within 8° for two R-77s.' : '');
      }
      return `Search plus up to ${tws.maxTracks} track files with heading and speed. `
        + (!tws.launchFromTws ? 'No launch from TWS.'
          : capUnpublished(spec) ? 'Fox 3 shots at several targets with no lock warning (ED publishes no cap).'
          : `Fox 3 shots at up to ${tws.maxSimultaneousTargets} targets with no lock warning.`);
    case 'stt':
      return 'Lock on one target. He gets a lock warning; SARH missiles need it to impact.'
        + (r.sttArhLaunchWarning ? ' A Phoenix fired from here is semi-active to impact and gives him a launch warning at once.' : '');
    case 'vs':
      return spec.id === 'f14b'
        ? 'Pulse-Doppler search: the longest detection, but it measures closure only, so no range and no TID tracks.'
        : 'Velocity search: closure against azimuth, no range. Finds hot targets far out; beam targets vanish.';
    case 'acm': return 'Close-combat auto-lock: the radar locks the first target it finds in a small pattern near the nose.';
    default: return '';
  }
}

const MODE_NAME: Partial<Record<RadarModeId, string>> = { rws: 'RWS', tws: 'TWS', stt: 'STT', vs: 'Velocity search', acm: 'ACM' };

/** A label / value list the quick filter can narrow (the value text is searched and highlighted). */
function facts(rows: [string, string][], rc: RefCtx, what: string): HTMLElement {
  const items = rows.map(([k, v]) => {
    const dd = h('dd', null, v);
    return { k, v, dd, el: h('div', { class: 'ref-fact' }, h('dt', null, k), dd) };
  });
  const empty = h('p', { class: 'ref-empty', hidden: true }, `No ${what} match the filter.`);
  rc.filterable({
    section: 'ref-radar',
    apply(tokens) {
      let n = 0;
      for (const it of items) {
        const ok = matches(it.k + ' ' + it.v, tokens);
        it.el.hidden = !ok; if (ok) n++;
        it.dd.replaceChildren(...hl(it.v, tokens));
      }
      empty.hidden = n > 0;
      return n;
    },
  });
  return h('div', null, h('dl', { class: 'ref-facts' }, items.map(i => i.el)), empty);
}

export function radarSection(rc: RefCtx): { el: HTMLElement; figure: DisplayFigure } {
  const { spec, units, ac } = rc;
  const r = spec.radar, tws = r.tws;
  const rules = radarRules(ac);

  // ---- modes (filterable table)
  const modes = r.modes.filter(m => m !== 'off');
  const modeRows = modes.map(m => ({ mode: m, label: r.modeLabels[m] ?? MODE_NAME[m] ?? m, what: modeWhat(spec, m) }));
  if (!tws) modeRows.splice(1, 0, { mode: 'tws', label: '—', what: `Not on the ${spec.short}. PSID (single-target track while scan) exists in the jet but is not modelled here; you fight from PSIC.` });
  const trs = modeRows.map(m => {
    const name = h('td', { class: 'is-mono' }, MODE_NAME[m.mode] ?? m.mode);
    const label = h('td', { class: 'is-mono ref-cockpit' }, m.label);
    const what = h('td', null, m.what);
    const tr = h('tr', null, name, label, what);
    return { tr, name, label, what, hay: [MODE_NAME[m.mode] ?? '', m.label, m.what].join(' '), m };
  });
  const emptyTr = h('tr', { class: 'ref-empty-row', hidden: true }, h('td', { colspan: '3' }, 'No radar modes match the filter.'));
  const modesTable = h('div', { class: 'ui-table-wrap', role: 'region', 'aria-label': 'Radar modes', tabindex: '0' },
    h('table', { class: 'ui-table ref-table ref-modes' },
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Mode'), h('th', { scope: 'col' }, 'Cockpit label'), h('th', { scope: 'col' }, 'What it does'))),
      h('tbody', null, trs.map(t => t.tr), emptyTr)));
  rc.filterable({
    section: 'ref-radar',
    apply(tokens) {
      let n = 0;
      for (const t of trs) {
        const ok = matches(t.hay, tokens);
        t.tr.hidden = !ok; if (ok) n++;
        t.label.replaceChildren(...hl(t.m.label, tokens));
        t.what.replaceChildren(...hl(t.m.what, tokens));
      }
      emptyTr.hidden = n > 0;
      return n;
    },
  });

  // ---- scan patterns
  const m = scanMatrix(spec, rules.bugScan);
  const fc3Bars = spec.module === 'fc3';
  const scanTable = h('div', { class: 'ui-table-wrap ref-fit', role: 'region', 'aria-label': 'Scan patterns and frame times', tabindex: '0' },
    h('table', { class: 'ui-table ref-table ref-scan' },
      h('caption', null, 'Frame time per pattern'),
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Bars'), m.az.map(a => h('th', { scope: 'col', class: 'is-num' }, rules.azPositionsDeg ? `${a * 2}° wide` : `±${a}°`)))),
      h('tbody', null, m.bars.map((b, bi) => h('tr', null,
        h('th', { scope: 'row', class: 'is-mono' }, `${b}${fc3Bars ? ' (fixed)' : ''}`),
        // Every cell keeps a slot for the TWS tag so the frame times line up in their columns.
        m.cells[bi].map(c => h('td', { class: 'is-num' }, `${c.frameS.toFixed(1)} s`,
          c.tws ? tag('TWS', 'jet') : tws ? h('span', { class: 'ref-tag ref-tag--ghost', 'aria-hidden': 'true' }, 'TWS') : null)))))));

  const scanNotes: Child[] = [];
  if (rules.azPositionsDeg) scanNotes.push(h('li', null, `The scan is always ${m.az[0] * 2}° wide. You move it between three positions: ${rules.azPositionsDeg.map(p => (p === 0 ? 'centre' : `${p > 0 ? '+' : '−'}${Math.abs(p)}°`)).join(', ')} (RShift + , and RShift + /). In СНП it centres on the tracked target.`));
  if (fc3Bars) scanNotes.push(h('li', null, 'Bars are not selectable in FC3 and ED does not document how many there are. 4 bars are assumed here, so a full-width frame takes about 5 s, the datamine scan period.'));
  if (rules.bugScan) scanNotes.push(h('li', null, `Bug scan: ±${rules.bugScan.azHalfDeg}° ${rules.bugScan.bars}-bar exists only in TWS with a bugged or cursor target; it is not offered in RWS.`));
  const dcsPatterns = twsPatternsOf(ac);
  if (tws && dcsPatterns) {
    scanNotes.push(h('li', null, tag('TWS', 'jet'), ' marks the only patterns DCS offers in TWS on the ', spec.short, '. ',
      ac === 'f14b' ? 'The AWG-9 refreshes every track every 2 s this way; entering TWS from a wider scan keeps the bars and narrows the azimuth.'
        : ac === 'jf17' ? 'Sources differ slightly on this list.'
        : 'Wider patterns need fewer bars.',
      ' Simplified here: the lessons accept any pattern that fits the TWS limits of the sim.'));
  } else if (tws) {
    scanNotes.push(h('li', null, tag('TWS', 'jet'), ' marks the patterns TWS accepts. ',
      tws.maxFrameTimeS != null ? `TWS refuses any pattern slower than ${tws.maxFrameTimeS} s so every track is refreshed in time.` : 'Wider or slower patterns are refused in TWS.'));
  }

  // ---- TWS rules
  const twsBlock: Child[] = [];
  if (tws) {
    twsBlock.push(facts([
      ['Track files', String(tws.maxTracks)],
      ['Fire from TWS', tws.launchFromTws ? 'Yes: no lock warning for him until pitbull' : 'No: the shot leaves from STT'],
      ['Targets at once', tws.autoSttAtRmaxFraction != null && tws.maxSimultaneousTargets > 1 ? `${tws.maxSimultaneousTargets} (СНП2, R-77 only)`
        : capUnpublished(spec) ? `No published cap (the trainer uses the ${tws.maxTracks} track files)`
        : String(tws.maxSimultaneousTargets)],
      ['Auto lock', tws.autoSttAtRmaxFraction != null ? `STT at ${Math.round(tws.autoSttAtRmaxFraction * 100)} % of Rmax` : 'None: you choose when to lock'],
      ['Scan limit in TWS', dcsPatterns ? twsPatternText(dcsPatterns) : [
        tws.maxAzHalfWidthDeg != null ? `±${tws.maxAzHalfWidthDeg}°` : null,
        tws.maxBars != null ? `≤ ${tws.maxBars} bars` : null,
        tws.maxFrameTimeS != null ? `frame ≤ ${tws.maxFrameTimeS} s` : null,
      ].filter(Boolean).join(', ') || 'None'],
      ...(fox3Of(spec).length ? [['Fox 3 from STT', r.sttArhLaunchWarning
        ? 'He gets a launch warning at once (the Phoenix is semi-active from PD-STT)'
        : 'He sees your lock. Whether DCS also flashes a launch warning before pitbull is unconfirmed; here it comes at pitbull'] as [string, string]] : []),
    ], rc, 'TWS rules'));
    twsBlock.push(callout({ kind: 'dcs', title: `Designating in the ${spec.short}`, body: tws.howTo }));
  } else {
    const psid = ac === 'm2000c'
      ? 'Its only track-while-scan is PSID: one target tracked while a 1-bar scan runs on, and the Super 530D cannot be guided from it (pull the trigger in PSID and the radar goes PSIC first). This trainer leaves PSID out. '
      : '';
    twsBlock.push(callout({ kind: 'dcs', title: 'No multi-target TWS', body: `${psid}Search in ${r.modeLabels.rws ?? 'RWS'} and lock with ${r.modeLabels.stt ?? 'STT'}: one target at a time, and he sees your lock from the moment you take it.` }));
  }

  // ---- detection and notch
  const d = r.detectKm;
  const beam = beamWindowDeg(r.notchKts, BEAM_GS_KTS);
  const detection = facts([
    ['Head-on', `${rangeText(d.headOn, units)} against a fighter`],
    ['Tail-on', rangeText(d.tail, units)],
    ['Look-down', d.lookDownFactor < 1 ? `× ${d.lookDownFactor}: ${rangeText(d.tail * d.lookDownFactor, units)} tail-on with the ground behind him` : 'No loss in the DCS table'],
    ['Gimbal', `±${r.gimbalAzDeg}° azimuth, ±${r.gimbalElDeg}° elevation`],
    ['Notch gate', `${speedText(r.notchKts, units)} radial speed${r.notchNeedsLookDown ? ', only with ground behind the target' : ', at any look angle (simplified here)'}`],
    ['Beam window', `±${beam.toFixed(1)}° off the exact beam at ${speedText(BEAM_GS_KTS, units)} ground speed`],
    ['Range scales', `${r.rangeScalesKm.map(k => rangeNum(k, units)).join(' / ')} ${rangeUnit(units)}`],
  ], rc, 'radar numbers');

  const figure = displayFigure(rc);
  const caveats = AIRCRAFT_CAVEATS[ac];

  const el = h('div', { class: 'ref-radar' },
    h('p', null, `The ${spec.short} carries the ${r.name}. Labels below are what the cockpit shows; numbers are in ${units === 'metric' ? 'km and km/h' : 'nm and knots'} (switch in the top bar).`),
    h('h3', null, 'Modes'),
    modesTable,
    h('h3', null, 'Scan patterns'),
    scanTable,
    scanNotes.length ? h('ul', { class: 'ref-notes' }, scanNotes) : null,
    h('h3', null, 'TWS rules'),
    twsBlock,
    h('h3', null, 'Detection and notch'),
    detection,
    h('p', { class: 'ref-small' }, `Detection is against a fighter-size target (3 to 5 m² in the DCS tables); smaller jets are seen later. The notch gate is how slow his speed along your line of sight must be before the radar throws him out with the ground clutter. To notch you, he must hold within about ±${beam.toFixed(0)}° of your beam.`),
    h('h3', null, 'What the display shows'),
    figure.el,
    h('div', { class: 'ref-links' }, lessonLink('Radar lab: scan volume in 3D', 'radar'), lessonLink('TWS lesson', 'tws')),
    h('details', { class: 'ref-caveats' },
      h('summary', null, `Simplified here: ${caveats.length} ${spec.short} values research could not confirm`),
      callout({ kind: 'simplified', body: h('ul', null, caveats.map(c => h('li', null, c))) })));

  return { el, figure };
}
