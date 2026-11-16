/**
 * Learn (#/learn, legacy #/hangar): the selected jet's lesson path. Above the fold: who the jet is, one action
 * that follows progress (Start, Continue, then Fly a sortie) and the path as numbered cards (pathCards.ts, from
 * src/app/lessonPath.ts). Below, in titled sections: the 3D scan-volume hero with the BVR data page, what the jet
 * can and cannot do, its missiles, and what this app simplifies. Attack jets get the path, then their own notes.
 * Query params: ?ac=<AircraftId> selects a jet once (then is removed from the URL);
 * ?shot=lessons|about|band|weapons|notes scrolls to a section (for screenshots).
 */
import './style.css';
import type { Page, PageContext, PageFactory } from '../../app/page';
import { nextText } from '../../app/lessonPath';
import { AIRCRAFT, AIRCRAFT_CAVEATS } from '../../data';
import type { AircraftId, AircraftSpec, JetSpec } from '../../data/types';
import type { Units } from '../../app/format';
import { Stage } from '../../render';
import { button, callout, cleanup, consolePanel, cx, h, kbd, readouts, screenBezel, setText, type Child } from '../../ui';
import { continuePath, pathProgress, type PathProgress } from '../progress/model';
import { mountHero } from './hero3d';
import { fighterSpecOf, pathSection } from './pathCards';
import {
  REFERENCE_TITLE, capFacts, detectSource, detectionScale, fmtR, headlineBind, moduleLabel, primaryRadarMissile, rangeNum,
  refLegend, referenceLine, scaleFrac, weaponCols, weaponFacts, weaponScale, weaponsSummary,
  type ProgressReader, type Scale, type WeaponFacts,
} from './facts';

const factory: PageFactory = (): Page => {
  const bag = cleanup();

  return {
    mount(ctx: PageContext) {
      // ?ac=<id>: select that jet once. Strip it first so later top-bar changes are not undone on remount.
      const want = ctx.params.get('ac');
      if (want !== null) {
        replaceHashParams(p => p.delete('ac'));
        if (want !== ctx.app.jet && want in AIRCRAFT) {
          ctx.app.setAircraft(want as AircraftId);   // the router remounts this page with the new jet
          return;
        }
      }
      const jet = ctx.app.jetSpec;
      const units = ctx.app.units;
      const get: ProgressReader = k => ctx.app.getProgress(k);
      const path = pathProgress(jet.id, get);
      const fighter = fighterSpecOf(jet.id);

      const lead = fighter ? `Written for the ${jet.short}. Radar first: every later lesson leans on the scan.`
        : `Written for the ${jet.short}: its own cockpit first, then close air support. Each page has its own lesson list.`;
      const root = h('div', { class: 'hg', id: 'hangar' },
        headSection(jet, path),
        pathSection(path, fighter, units, get, lead, referenceCard(jet, get)));
      ctx.root.append(root);

      if (fighter) {
        const hero = heroSection(fighter, units);
        const about = h('section', { class: 'hg-about', id: 'hg-about', 'aria-labelledby': 'hg-about-h' },
          h('header', { class: 'hg-sechead' },
            h('h2', { id: 'hg-about-h' }, `The ${fighter.short} in BVR`),
            h('p', null, 'Radar, scan volume and what the jet can and cannot do, as DCS models it.')),
          hero.el,
          rulesBand(fighter, units, () => ctx.navigate('tws')));
        root.append(about, weaponsSection(fighter, units), notesSection(fighter,
          'Radars and missiles here are game mechanics tuned to what DCS shows you: launch-table ranges, pitbull ' +
          'distances, notch and chaff rules, RWR cues. They are not models of the real weapons. The 3D scan volume above ' +
          'is drawn short so the jet and the volume fit in one frame.'));

        // 3D hero (pauses offscreen via the Stage's IntersectionObserver).
        const heroGl = mountHero(hero.canvasHost, fighter, {
          units, reducedMotion: Stage.prefersReducedMotion(),
          onScan: s => setText(hero.scanLive, `BAR ${s.bar}/${s.bars}   AZ ${s.beamAzDeg >= 0 ? '+' : ''}${s.beamAzDeg}°`),
        });
        if (!heroGl.ok) hero.el.classList.add('is-nogl');
        bag.add(() => heroGl.dispose());
      } else {
        root.append(attackAbout(jet), notesSection(jet,
          'Sensors and weapons here are game mechanics tuned to what DCS shows you. They are not models of the real systems.'));
      }

      const shot = ctx.params.get('shot');
      const target = shot ? root.querySelector<HTMLElement>(`#hg-${CSS.escape(shot)}`) : null;
      if (target) target.scrollIntoView({ block: 'start' });
    },
    unmount() { bag.dispose(); },
  };
};
export default factory;

// ============================================================================================ sections

/** Who the jet is, how far the pilot is, and the one action that comes next. */
function headSection(spec: JetSpec, p: PathProgress): HTMLElement {
  const st = p.status;
  const nextStep = st.next.index !== null ? p.steps[st.next.index]! : null;
  const hint = nextStep
    ? `Lesson ${st.next.index! + 1} · ${nextStep.link.title}${nextStep.total > 1 && nextStep.next ? ` · ${nextStep.next.label}` : ''}`
    : p.fly.done ? 'Path complete. Sortie flown.' : 'Path complete. The sortie puts it together.';
  const lamps = h('span', { class: 'hg-meter__lamps', 'aria-hidden': 'true' },
    p.steps.map(s => h('span', { class: cx('hg-meter__lamp', s.complete && 'is-on') })));
  return h('header', { class: 'hg-head' },
    h('div', { class: 'hg-head__id' },
      h('div', { class: 'hg-badges' },
        h('span', { class: 'hg-badge', dataset: { kind: spec.module } }, moduleLabel(spec)),
        h('span', null, spec.developer),
        h('span', { class: 'hg-badges__sep', 'aria-hidden': 'true' }, '·'),
        h('span', { class: 'hg-badges__cockpit' }, spec.cockpit === 'ru' ? 'Soviet-style cockpit' : 'Western cockpit')),
      h('h1', { class: 'hg-name' }, spec.name),
      h('p', { class: 'hg-meter' }, lamps,
        h('span', { class: 'hg-meter__text' }, `${st.doneCount} of ${st.total} lessons done`),
        h('a', { class: 'hg-meter__log', href: '#/progress' }, 'Flight log, all jets'))),
    h('div', { class: 'hg-head__cta' },
      h('a', { class: 'ui-btn ui-btn--primary ui-btn--l hg-next', href: '#/' + continuePath(p), id: 'hg-next' },
        h('span', { class: 'ui-btn__legend' }, nextText(st) + '  →')),
      h('p', { class: 'hg-head__hint' }, hint)));
}

/** Keys and procedures for the jet: the Reference destination, under the path. */
function referenceCard(spec: JetSpec, get: ProgressReader): HTMLElement {
  // The Reference page marks 'reference:<ac>:done' when it is opened.
  const opened = !!get(`reference:${spec.id}:done`);
  const bind = spec.role === 'fighter' ? headlineBind(spec) : null;
  return h('div', { class: 'hg-refrow' },
    h('a', {
      class: cx('hg-lesson', 'hg-lesson--ref'), href: '#/reference', dataset: { state: 'ref', route: 'reference' }, id: 'hg-lesson-reference',
      'aria-label': `Reference: ${REFERENCE_TITLE}. ${opened ? 'Opened' : 'Not opened yet'}.`,
    },
    h('span', { class: 'hg-lesson__num', 'aria-hidden': 'true' }, '+'),
    h('span', { class: 'hg-lesson__route' }, 'Reference'),
    h('span', { class: 'hg-lesson__state' }, h('span', { class: 'hg-lesson__lamp', 'aria-hidden': 'true' }), opened ? 'Opened' : 'Reference'),
    h('span', { class: 'hg-lesson__title' }, REFERENCE_TITLE),
    h('span', { class: 'hg-lesson__line' }, referenceLine(spec)),
    bind && spec.module === 'fc3' ? h('span', { class: 'hg-lesson__foot' }, bind.action, ' ', kbd(bind.keys))
      : bind ? h('span', { class: 'hg-lesson__foot' }, bind.action, h('span', { class: 'hg-hotas' }, bind.keys))
      : null));
}

function heroSection(spec: AircraftSpec, units: Units) {
  const cap = capFacts(spec, units);
  const s = cap.scan;

  // Viewport with a glass overlay that names what the volume is.
  const canvasHost = h('div', { class: 'hg-hero__canvas' });
  const scanLive = h('span', { class: 'hg-ov__live', 'aria-hidden': 'true' }, `BAR 1/${s.bars}`);
  const view = h('div', { class: 'hg-hero__view' },
    canvasHost,
    h('div', { class: 'hg-ov hg-ov--tl' },
      h('div', { class: 'hg-ov__title' }, `${cap.radarName} · ${s.modeLabel}`),
      h('div', { class: 'hg-ov__line' },
        spec.display === 'ru-hud' ? `60° window · ${s.bars} bars · ${s.frameS} s frame` : `±${s.azHalfDeg}° · ${s.bars} bars · ${s.frameS} s frame`),
      scanLive),
    h('div', { class: 'hg-ov hg-ov--br' },
      h('span', { class: 'hg-ov__long' }, `Not to scale: the volume is drawn short. The radar sees a fighter at about ${fmtR(cap.detectHeadOnM, units)} head-on.`),
      h('span', { class: 'hg-ov__short', 'aria-hidden': 'true' }, 'Not to scale')));

  // Capability readout: a black-glass data page.
  const modes = h('div', { class: 'hg-modes', role: 'list', 'aria-label': 'Radar modes as the cockpit labels them' },
    cap.modes.map(m => h('span', {
      role: 'listitem',
      class: cx('hg-mode', m.mode === 'rws' && 'is-on', m.missing && 'is-missing', m.limited && 'is-limited'),
      title: m.missing ? 'This radar has no track-while-scan mode'
        : m.limited ? `${m.label}: tracks one target while scanning, for awareness only. Missiles fire from ${spec.radar.modeLabels.stt ?? 'STT'}. Not modelled in this app.`
        : `${m.label}: ${m.generic}`,
    }, h('b', null, m.label), h('small', null, m.generic))));
  const ro = readouts({
    variant: 'glass',
    rows: [
      { id: 'tracks', label: 'TWS tracks', value: cap.twsTracks, title: 'Track files the radar keeps in TWS' },
      {
        id: 'targets', label: 'Targets at once', value: cap.targetsAtOnce,
        title: spec.radar.tws?.capConfidence === 'unpublished'
          ? `ED gives no cap on AIM-120s in the air; the ${spec.radar.tws.maxTracks} TWS track files are used here`
          : 'Targets your radar can guide missiles at, at the same time',
      },
      { id: 'twsl', label: 'Launch in TWS', value: cap.tws.answer },
      { id: 'gimbal', label: 'Gimbal (crank limit)', value: `±${cap.gimbalDeg}°`, title: 'Antenna azimuth limit: crank to just inside it while you support a shot' },
      { id: 'rwr', label: 'RWR', value: cap.rwrName },
      { id: 'cms', label: 'Chaff / flares', value: `${cap.chaff} / ${cap.flares}` },
    ],
  });
  if (!cap.tws.yes) ro.setTone('twsl', 'hi');
  if (cap.twsTracks === 'none') ro.setTone('tracks', 'dim');

  const ds = detectionScale(units);
  const det = h('div', { class: 'hg-det' },
    h('div', { class: 'hg-det__head' }, h('span', null, 'Detection, fighter target'), h('span', null, detectSource(spec))),
    barRow('Head-on', cap.detectHeadOnM, ds, units, false),
    barRow('Tail', cap.detectTailM, ds, units, true),
    axis(ds));

  const card = screenBezel({
    label: `${cap.radarName} · BVR data`,
    status: spec.short,
    class: 'hg-card',
    content: h('div', { class: 'hg-card__page' },
      modes, ro.el,
      h('p', { class: 'hg-card__rule' }, cap.tws.rule),
      det),
  });

  const el = h('div', { class: 'hg-hero' },
    view,
    h('div', { class: 'hg-hero__side' }, h('p', { class: 'hg-blurb' }, spec.blurb), card.el));
  return { el, canvasHost, scanLive };
}

function barRow(label: string, m: number, s: Scale, units: Units, dim: boolean): HTMLElement {
  return h('div', { class: cx('hg-bar', dim && 'hg-bar--dim') },
    h('span', { class: 'hg-bar__label' }, label),
    h('span', { class: 'hg-bar__track', 'aria-hidden': 'true' },
      h('span', { class: 'hg-bar__fill', style: { width: (scaleFrac(m, s, units) * 100).toFixed(1) + '%' } })),
    h('span', { class: 'hg-bar__val' }, rangeNum(m, units), h('small', null, ' ' + s.unit)));
}

function axis(s: Scale): HTMLElement {
  return h('div', { class: 'hg-axis', 'aria-hidden': 'true' },
    s.ticks.map(t => h('span', { class: 'hg-axis__tick', style: { left: ((t / s.max) * 100).toFixed(2) + '%' } }, String(t))));
}

function rulesBand(spec: AircraftSpec, units: Units, openTws: () => void): HTMLElement {
  const tws = spec.radar.tws;
  const cap = capFacts(spec, units);
  let twsBody: Child;
  if (tws) {
    twsBody = h('p', null, tws.howTo);
  } else {
    const m = primaryRadarMissile(spec);
    const list = cap.modes.filter(x => !x.missing && !x.limited).map(x => `${x.label} (${x.generic})`);
    const modes = list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}` : list.join('');
    twsBody = [
      h('p', null, `The ${spec.radar.name} has ${modes} here. ${cap.tws.rule}`),
      m ? h('p', null, `${m.name}: ${m.guidanceRule}`) : null,
    ];
  }
  return h('div', { class: 'hg-band', id: 'hg-band', role: 'group', 'aria-label': 'What it can and cannot do' },
    h('div', { class: 'hg-band__tws' },
      h('h3', null, tws ? `TWS in the ${spec.short}, as DCS plays it` : `No ${spec.radar.singleTargetTws ? 'multi-target ' : ''}TWS in the ${spec.short}`),
      twsBody,
      button({ label: tws ? 'Fly the TWS lesson' : 'See what TWS would change', variant: 'ghost', onClick: openTws }).el),
    h('div', { class: 'hg-band__list' },
      h('h3', null, 'Strong in BVR'),
      h('ul', { class: 'hg-list hg-list--plus' }, spec.strengths.map(s => h('li', null, s)))),
    h('div', { class: 'hg-band__list' },
      h('h3', null, 'Watch out for'),
      h('ul', { class: 'hg-list hg-list--minus' }, spec.limits.map(s => h('li', null, s)))));
}

/** An attack jet's own notes: the blurb, and its strengths and limits from src/data. */
function attackAbout(spec: JetSpec): HTMLElement {
  return h('section', { class: 'hg-about', id: 'hg-about', 'aria-labelledby': 'hg-about-h' },
    h('header', { class: 'hg-sechead' }, h('h2', { id: 'hg-about-h' }, `The ${spec.short}`)),
    h('div', { class: 'hg-band hg-band--first', id: 'hg-band' },
      h('div', { class: 'hg-band__tws' }, h('p', null, spec.blurb)),
      h('div', { class: 'hg-band__list' },
        h('h3', null, 'Strong in'),
        h('ul', { class: 'hg-list hg-list--plus' }, spec.strengths.map(s => h('li', null, s)))),
      h('div', { class: 'hg-band__list' },
        h('h3', null, 'Watch out for'),
        h('ul', { class: 'hg-list hg-list--minus' }, spec.limits.map(s => h('li', null, s))))));
}

function weaponsSection(spec: AircraftSpec, units: Units): HTMLElement {
  const scale = weaponScale(spec, units);
  const cards = weaponFacts(spec, units).map(w => weaponCard(w, scale, units));
  const grid = h('div', { class: 'hg-wgrid' }, cards);
  // Custom properties need setProperty (h() assigns style keys, which drops '--cols').
  grid.style.setProperty('--cols', String(weaponCols(cards.length)));
  return h('section', { class: 'hg-weapons', id: 'hg-weapons', 'aria-labelledby': 'hg-weapons-h' },
    h('header', { class: 'hg-sechead' },
      h('h2', { id: 'hg-weapons-h' }, `What the ${spec.short} carries`),
      h('p', null, weaponsSummary(spec))),
    grid,
    h('p', { class: 'hg-caption' }, refLegend(units)));
}

function weaponCard(w: WeaponFacts, scale: Scale, units: Units): HTMLElement {
  const ro = readouts({
    rows: [
      { id: 'seeker', label: 'Seeker', value: w.seeker },
      { id: 'mid', label: 'Midcourse', value: w.midcourse },
      { id: 'pit', label: 'Pitbull', value: w.pitbull },
      { id: 'loft', label: 'Lofts', value: w.loft },
      { id: 'load', label: 'Default load', value: w.loadCount ? `×${w.loadCount}` : 'none' },
    ],
  });
  const chart = h('div', { class: 'hg-rng', role: 'img', 'aria-label': `Launch-table ranges: ${w.ranges.map(r => `${r.label} ${rangeNum(r.m, units)} ${scale.unit}`).join(', ')}` },
    w.ranges.map(r => barRow(r.label, r.m, scale, units, r.key !== 'high')),
    axis(scale));
  const panel = consolePanel({
    title: h('span', { class: 'hg-wtitle' }, w.name, w.nato ? h('small', null, w.nato) : null),
    actions: h('span', { class: 'hg-fox', dataset: { fox: String(w.fox) } }, `Fox ${w.fox}`),
    dense: true,
    class: 'hg-wcard',
    children: [
      ro.el,
      chart,
      h('div', { class: 'hg-must' }, h('span', { class: 'ui-placard' }, 'To guide it'), h('p', null, w.rule)),
      h('details', { class: 'hg-more' },
        h('summary', null, `DCS notes (${w.notes.length})`),
        h('ul', null, w.notes.map(n => h('li', null, n)))),
    ],
  });
  return panel.el;
}

function notesSection(spec: JetSpec, lead: string): HTMLElement {
  const cav = AIRCRAFT_CAVEATS[spec.id];
  return h('section', { class: 'hg-notes', id: 'hg-notes', 'aria-label': 'What this app simplifies' },
    callout({
      kind: 'simplified',
      title: 'What this app simplifies',
      body: [
        h('p', null, lead),
        h('details', { class: 'hg-more' },
          h('summary', null, `Values for the ${spec.short} research could not confirm (${cav.length})`),
          h('ul', null, cav.map(c => h('li', null, c)))),
      ],
    }));
}

// ============================================================================================ helpers

/** Edit the query part of the hash route without firing hashchange. */
function replaceHashParams(edit: (p: URLSearchParams) => void) {
  try {
    const raw = location.hash.replace(/^#\/?/, '');
    const [path, q = ''] = raw.split('?');
    const p = new URLSearchParams(q);
    edit(p);
    const qs = p.toString();
    history.replaceState(history.state, '', '#/' + path + (qs ? '?' + qs : ''));
  } catch { /* sandboxed history: harmless */ }
}
