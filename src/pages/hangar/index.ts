/**
 * Hangar (#/hangar): the landing page. Pick a jet, see in one screen what it can and cannot do in BVR in
 * DCS (3D hero with its scan volume, capability readout, weapons), then go to a lesson.
 * Query params: ?ac=<AircraftId> selects a jet once (then is removed from the URL);
 * ?shot=band|lessons|weapons|notes scrolls to a section (for screenshots).
 */
import './style.css';
import type { Page, PageContext, PageFactory } from '../../app/page';
import { ROUTES } from '../../app/routes';
import { AIRCRAFT, AIRCRAFT_CAVEATS } from '../../data';
import type { AircraftId, AircraftSpec } from '../../data/types';
import type { Units } from '../../app/format';
import { Stage } from '../../render';
import { button, callout, cleanup, consolePanel, cx, h, kbd, readouts, screenBezel, setText, type Child } from '../../ui';
import { mountHero } from './hero3d';
import {
  LESSON_PATH, LESSON_TITLE, SINGLE_TARGET_TWS, TARGET_CAP_UNCONFIRMED, allTiles, capFacts, detectSource, detectionScale,
  doneElsewhere, fmtR, headlineBind, isDone, lessonLine, moduleLabel, nextLesson, primaryRadarMissile, rangeNum, refLegend,
  scaleFrac, weaponCols, weaponFacts, weaponScale, weaponsSummary,
  type LessonRoute, type ProgressReader, type Scale, type WeaponFacts,
} from './facts';

const routeLabel = (r: LessonRoute) => ROUTES.find(x => x.path === r)?.label ?? r;
const FOCUS_KEY = 'hangarFocus';

const factory: PageFactory = (): Page => {
  const bag = cleanup();

  return {
    mount(ctx: PageContext) {
      // ?ac=<id>: select that jet once. Strip it first so later top-bar changes are not undone on remount.
      const want = ctx.params.get('ac');
      if (want !== null) {
        replaceHashParams(p => p.delete('ac'));
        if (want !== ctx.app.aircraft && want in AIRCRAFT) {
          ctx.app.setAircraft(want as AircraftId);   // the router remounts this page with the new jet
          return;
        }
      }

      const spec = ctx.app.spec;
      const units = ctx.app.units;
      const get: ProgressReader = k => ctx.app.getProgress(k);
      const reduced = Stage.prefersReducedMotion();

      // ---------------------------------------------------------------- fleet strip
      const fleet = fleetStrip(spec.id, id => {
        if (id === spec.id) { hero.el.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' }); return; }
        try { history.replaceState({ ...(history.state ?? {}), [FOCUS_KEY]: id }, ''); } catch { /* ignore */ }
        ctx.app.setAircraft(id);
      });

      // ---------------------------------------------------------------- hero
      const next = nextLesson(spec.id, get);
      const doneCount = LESSON_PATH.filter(r => isDone(r, spec.id, get)).length;
      const hero = heroSection(spec, units, next, doneCount, {
        go: r => ctx.navigate(r),
        toLessons: () => lessons.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' }),
      });

      // ---------------------------------------------------------------- the rest
      const band = rulesBand(spec, units, () => ctx.navigate('tws'));
      const lessons = lessonsSection(spec, units, get, next, r => ctx.navigate(r));
      const weapons = weaponsSection(spec, units);
      const notes = notesSection(spec);

      const root = h('div', { class: 'hg', id: 'hangar' }, fleet.el, hero.el, band, lessons, weapons, notes);
      ctx.root.append(root);

      // Center the selected tile in the strip (it scrolls sideways on phones) and restore focus after a switch.
      fleet.reveal();
      const hs = history.state as Record<string, unknown> | null;
      if (hs && hs[FOCUS_KEY] === spec.id) {
        fleet.focus(spec.id);
        try { const { [FOCUS_KEY]: _drop, ...rest } = hs; history.replaceState(rest, ''); } catch { /* ignore */ }
      }

      // 3D hero (pauses offscreen via the Stage's IntersectionObserver).
      const heroGl = mountHero(hero.canvasHost, spec, {
        units, reducedMotion: reduced,
        onScan: s => setText(hero.scanLive, `BAR ${s.bar}/${s.bars}   AZ ${s.beamAzDeg >= 0 ? '+' : ''}${s.beamAzDeg}°`),
      });
      if (!heroGl.ok) hero.el.classList.add('is-nogl');
      bag.add(() => heroGl.dispose());

      const shot = ctx.params.get('shot');
      const target = shot ? root.querySelector<HTMLElement>(`#hg-${CSS.escape(shot)}`) : null;
      if (target) target.scrollIntoView({ block: 'start' });
    },
    unmount() { bag.dispose(); },
  };
};
export default factory;

// ============================================================================================ sections

function fleetStrip(current: AircraftId, pick: (id: AircraftId) => void) {
  const tiles = new Map<AircraftId, HTMLButtonElement>();
  const row = h('div', { class: 'hg-fleet__row', role: 'group', 'aria-label': 'Aircraft' },
    allTiles().map(t => {
      const b = h('button', {
        type: 'button', class: 'hg-tile', 'aria-pressed': String(t.id === current), title: t.title, dataset: { ac: t.id },
        onclick: () => pick(t.id),
      },
      h('span', { class: 'hg-tile__name' }, t.short),
      h('span', { class: 'hg-tile__mod', dataset: { mod: t.module } }, t.module),
      h('span', { class: 'hg-tile__lamps' }, mini('Fox 3', t.fox3), mini('Multi', t.multi)));
      tiles.set(t.id, b);
      return b;
    }));
  const el = h('section', { class: 'hg-fleet', 'aria-label': 'Pick a jet' },
    h('div', { class: 'hg-fleet__head' },
      h('h2', { class: 'hg-fleet__title' }, 'Hangar · pick your jet'),
      h('p', { class: 'hg-legend' },
        h('span', null, mini('Fox 3', true), ' active radar missile'),
        h('span', null, mini('Multi', true), ' missiles at two or more targets at once'))),
    row);
  return {
    el,
    reveal() {
      const t = tiles.get(current);
      if (t && row.scrollWidth > row.clientWidth) row.scrollLeft = t.offsetLeft - (row.clientWidth - t.offsetWidth) / 2;
    },
    focus(id: AircraftId) { tiles.get(id)?.focus({ preventScroll: true }); },
  };
}

function mini(label: string, on: boolean): HTMLElement {
  return h('span', { class: cx('hg-mini', on && 'is-on') }, label, h('span', { class: 'ui-sr' }, on ? ': yes' : ': no'));
}

interface HeroActions { go(route: string): void; toLessons(): void }

function heroSection(spec: AircraftSpec, units: Units, next: LessonRoute | null, doneCount: number, act: HeroActions) {
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

  // Identity.
  const nextLabel = next ? (doneCount === 0 ? `Start: ${routeLabel(next)}` : `Next: ${routeLabel(next)}`) : 'Fly a sortie';
  const id = h('div', { class: 'hg-id' },
    h('div', { class: 'hg-badges' },
      h('span', { class: 'hg-badge', dataset: { kind: spec.module } }, moduleLabel(spec)),
      h('span', null, spec.developer),
      h('span', { class: 'hg-badges__sep', 'aria-hidden': 'true' }, '·'),
      h('span', { class: 'hg-badges__cockpit' }, spec.cockpit === 'ru' ? 'Soviet-style cockpit' : 'Western cockpit')),
    h('h1', { class: 'hg-name' }, spec.name),
    h('p', { class: 'hg-blurb' }, spec.blurb),
    h('div', { class: 'hg-cta' },
      button({ label: nextLabel + '  →', variant: 'primary', size: 'l', onClick: () => act.go(next ?? 'sortie'), id: 'hg-next' }).el,
      button({
        label: h('span', null, 'Lesson path ', h('span', { class: 'hg-count' }, `${doneCount}/${LESSON_PATH.length}`)),
        variant: 'cap', size: 'l', onClick: act.toLessons, id: 'hg-path-btn',
        ariaLabel: `Lesson path: ${doneCount} of ${LESSON_PATH.length} lessons flown in the ${spec.short}`,
      }).el));

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
        title: TARGET_CAP_UNCONFIRMED[spec.id] ?? 'Targets your radar can guide missiles at, at the same time',
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

  const el = h('section', { class: 'hg-hero', 'aria-label': spec.name },
    view,
    h('div', { class: 'hg-hero__side' }, id, card.el));
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
  return h('section', { class: 'hg-band', id: 'hg-band', 'aria-label': 'What it can and cannot do' },
    h('div', { class: 'hg-band__tws' },
      h('h3', null, tws ? `TWS in the ${spec.short}, as DCS plays it` : `No ${SINGLE_TARGET_TWS[spec.id] ? 'multi-target ' : ''}TWS in the ${spec.short}`),
      twsBody,
      button({ label: tws ? 'Fly the TWS lesson' : 'See what TWS would change', variant: 'ghost', onClick: openTws }).el),
    h('div', { class: 'hg-band__list' },
      h('h3', null, 'Strong in BVR'),
      h('ul', { class: 'hg-list hg-list--plus' }, spec.strengths.map(s => h('li', null, s)))),
    h('div', { class: 'hg-band__list' },
      h('h3', null, 'Watch out for'),
      h('ul', { class: 'hg-list hg-list--minus' }, spec.limits.map(s => h('li', null, s)))));
}

function lessonsSection(spec: AircraftSpec, units: Units, get: ProgressReader, next: LessonRoute | null, go: (r: string) => void): HTMLElement {
  const card = (r: LessonRoute, i: number | null) => {
    const done = r !== 'reference' && isDone(r, spec.id, get);
    const state = r === 'reference' ? 'ref' : done ? 'done' : r === next ? 'next' : 'todo';
    const others = r === 'reference' ? [] : doneElsewhere(r, spec.id, get);
    // The Cockpit page marks 'reference:<ac>:done' when it is opened.
    const refText = isDone('reference', spec.id, get) ? 'Opened' : 'Reference';
    const stateText = state === 'done' ? 'Done' : state === 'next' ? 'Next' : state === 'ref' ? refText : 'Not flown';
    const bind = r === 'reference' ? headlineBind(spec) : null;
    return h('button', {
      type: 'button', class: cx('hg-lesson', r === 'reference' && 'hg-lesson--ref'), dataset: { state, route: r },
      onclick: () => go(r), id: `hg-lesson-${r}`,
      'aria-label': `${routeLabel(r)}: ${LESSON_TITLE[r]}. ${stateText}.`,
    },
    h('span', { class: 'hg-lesson__num', 'aria-hidden': 'true' }, i === null ? '+' : String(i + 1)),
    h('span', { class: 'hg-lesson__route' }, routeLabel(r)),
    h('span', { class: 'hg-lesson__state' }, h('span', { class: 'hg-lesson__lamp', 'aria-hidden': 'true' }), stateText),
    h('span', { class: 'hg-lesson__title' }, LESSON_TITLE[r]),
    h('span', { class: 'hg-lesson__line' }, lessonLine(r, spec, units)),
    bind && spec.module === 'fc3' ? h('span', { class: 'hg-lesson__foot' }, bind.action, ' ', kbd(bind.keys))
      : bind ? h('span', { class: 'hg-lesson__foot' }, bind.action, h('span', { class: 'hg-hotas' }, bind.keys))
      : others.length ? h('span', { class: 'hg-lesson__foot' }, 'Done in ' + others.map(o => AIRCRAFT[o].short).join(', '))
      : null);
  };
  return h('section', { class: 'hg-lessons', id: 'hg-lessons', 'aria-labelledby': 'hg-lessons-h' },
    h('header', { class: 'hg-sechead' },
      h('h2', { id: 'hg-lessons-h' }, 'Lesson path'),
      h('p', null, `Written for the ${spec.short}. Radar first: every later lesson leans on the scan.`)),
    h('ol', { class: 'hg-path' }, LESSON_PATH.map((r, i) => h('li', null, card(r, i)))),
    h('div', { class: 'hg-refrow' }, card('reference', null)));
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

function notesSection(spec: AircraftSpec): HTMLElement {
  const cav = AIRCRAFT_CAVEATS[spec.id];
  return h('section', { class: 'hg-notes', id: 'hg-notes', 'aria-label': 'What this app simplifies' },
    callout({
      kind: 'simplified',
      title: 'What this app simplifies',
      body: [
        h('p', null,
          'Radars and missiles here are game mechanics tuned to what DCS shows you: launch-table ranges, pitbull ' +
          'distances, notch and chaff rules, RWR cues. They are not models of the real weapons. The 3D scan volume above ' +
          'is drawn short so the jet and the volume fit in one frame.'),
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
