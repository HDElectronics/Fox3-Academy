/**
 * App chrome: brand, top-bar destinations, aircraft selector, units toggle. Cockpit skin follows the jet.
 * The second row is always one line. On Learn it is the jet's lesson path (lessonPath.ts): numbered steps, done
 * marks, the current step, and at its right end the position ('Lesson 2/7') and the Next step, which lights up
 * once the current lesson is complete; the last step hands off to Fly. On Practice it lists the labs, on Reference
 * and Fly the page itself; there the right end offers the way back into the path.
 * A page with several lessons (a lesson picker, src/ui/lessonPicker.ts) adds which one is open beside the position:
 * 'LESSON 8/10 · HARM 3/9'. The picker publishes it; the shell reads only that UI module, never page code.
 */
import { AIRCRAFT } from '../data/aircraft';
import type { AircraftId } from '../data/types';
import { routeFor, type RouteDef } from './routes';
import { pickerJets } from './roleGate';
import { contextualLinks, DESTINATIONS, destinationFor, destinationsFor, pageTitle, type NavLink } from './navigation';
import { flyLinkFor, lessonSteps, nextText, pathStatus, routeOf, type PathStatus, type StepState } from './lessonPath';
import type { AppStore } from './store';
import { h, $$ } from '../ui/dom';
import { clearLessonPosition, lessonPosition, positionText, watchLessonPosition, type LessonPosition } from '../ui/lessonPicker';

type ProgressModel = typeof import('../pages/progress/model');

export function buildShell(root: HTMLElement, app: AppStore) {
  const select = h('select', { id: 'jetSelect', class: 'jet-select', 'aria-label': 'Aircraft' });
  // The picker lists the jets the current route accepts (fighters on BVR pages), plus the selected jet.
  let route = routeFor(location.hash.replace(/^#\/?/, '').split('?')[0] ?? '');
  const fillPicker = () => {
    select.replaceChildren(...pickerJets(route, app.jet).map(id =>
      h('option', { value: id }, AIRCRAFT[id].short + (AIRCRAFT[id].module === 'fc3' ? '  ·  FC3' : ''))));
    select.value = app.jet;
  };
  fillPicker();
  select.addEventListener('change', () => app.setAircraft(select.value as AircraftId));

  const unitsBtn = h('button', { class: 'units-btn', id: 'unitsBtn', type: 'button', title: 'Switch units' });
  unitsBtn.addEventListener('click', () => app.setUnits(app.units === 'metric' ? 'imperial' : 'metric'));

  const nav = h('nav', { class: 'modnav', 'aria-label': 'Main navigation' },
    DESTINATIONS.map(r => h('a', { href: '#/' + r.path, dataset: { destination: r.id } }, r.label)));
  const track = h('div', { class: 'context-nav__track' });
  const status = h('div', { class: 'context-nav__status' });
  const contextNav = h('nav', { class: 'context-nav', 'aria-label': 'Lessons' }, track, status);

  const bar = h('header', { class: 'topbar' },
    h('a', { class: 'brand', href: '#/learn' }, h('span', { class: 'brand-mark' }, 'F3A'), h('span', { class: 'brand-name' }, 'Fox3 Academy')),
    nav,
    h('div', { class: 'topbar-right' },
      h('label', { class: 'jet-label', for: 'jetSelect' }, 'Jet'), select, unitsBtn),
  );
  const outlet = h('main', { class: 'outlet', id: 'outlet' });
  root.replaceChildren(bar, contextNav, outlet);
  const syncHeight = () => {
    const height = bar.getBoundingClientRect().height + (contextNav.hidden ? 0 : contextNav.getBoundingClientRect().height);
    document.documentElement.style.setProperty('--shell-h', `${Math.ceil(height)}px`);
  };
  // The steps scroll sideways when they do not fit (narrow windows); fade the edge that hides more.
  const syncOverflow = () => {
    const max = track.scrollWidth - track.clientWidth;
    track.dataset.overflow = max <= 1 ? 'none' : track.scrollLeft <= 1 ? 'end' : track.scrollLeft >= max - 1 ? 'start' : 'both';
  };
  track.addEventListener('scroll', syncOverflow, { passive: true });
  // Chrome is mounted for the application's lifetime. The top bar can wrap; the second row stays one line.
  const chromeSize = new ResizeObserver(() => { syncHeight(); syncOverflow(); });
  chromeSize.observe(bar);
  chromeSize.observe(contextNav);
  // Ultra-wide windows centre the lab: the bars' content lines up with it (base.css reads --chrome-inset). Without a
  // lab on the page the CSS falls back to the default lab's width.
  let labEl: Element | null = null;
  const syncInset = () => {
    const r = labEl?.getBoundingClientRect();
    if (r && r.width > 0) document.documentElement.style.setProperty('--chrome-inset', `${Math.max(0, Math.round(r.left))}px`);
    else document.documentElement.style.removeProperty('--chrome-inset');
  };
  const labSize = new ResizeObserver(syncInset);
  new MutationObserver(() => {
    const next = outlet.querySelector('.ui-lab');
    if (next === labEl) return;
    if (labEl) labSize.unobserve(labEl);
    labEl = next;
    if (labEl) labSize.observe(labEl);
    syncInset();
  }).observe(outlet, { childList: true });
  window.addEventListener('resize', syncInset, { passive: true });

  const sync = () => {
    const spec = app.jetSpec;
    document.documentElement.dataset.cockpit = spec.cockpit;
    document.documentElement.dataset.aircraft = spec.id;
    fillPicker();
    unitsBtn.textContent = app.units === 'metric' ? 'km · m' : 'nm · ft';
  };
  sync();

  // Completion per step needs every page's goals (src/pages/progress/model.ts), which pulls in page modules.
  // Load it after the first paint; until then the path shows without done marks (same size, no shift).
  let model: ProgressModel | null = null;
  import('../pages/progress/model').then(m => { model = m; renderContext(); }, err => console.error(err));

  let params = new URLSearchParams(location.hash.split('?')[1] ?? '');

  const renderContext = () => {
    const jet = app.jet;
    const destination = destinationFor(route.path, params, jet);
    // Top bar for this jet: Fly may point at the jet's own sortie; a destination it cannot open is hidden.
    const dests = destinationsFor(jet);
    for (const a of $$('a', nav)) {
      const d = dests.find(x => x.id === a.dataset.destination);
      a.hidden = !d;
      if (d) a.setAttribute('href', '#/' + d.path);
      // 'page' when the link opens this very page, 'true' when the page sits inside that destination.
      const here = d && d.id === destination;
      if (here) a.setAttribute('aria-current', isHere(d.path) ? 'page' : 'true'); else a.removeAttribute('aria-current');
    }

    const progress = model?.pathProgress(jet, k => app.getProgress(k)) ?? null;
    const steps: readonly StepState[] = progress?.steps ?? lessonSteps(jet).map(link => ({ link, complete: false }));
    const fly = flyLinkFor(jet);
    const at = pathStatus(steps, destination === 'learn' ? route.path : null, fly);
    // Next and Continue open the first lesson left on that page (HARM, CAS...), else the page.
    const nextPath = at.next.index !== null && progress ? progress.steps[at.next.index]!.next?.path ?? at.next.path : at.next.path;

    // A re-render (progress saved, jet changed) must not drop keyboard focus that sits in the row.
    const active = document.activeElement instanceof HTMLElement && contextNav.contains(document.activeElement) ? document.activeElement : null;
    const refocus = !active ? null : active.classList.contains('pathnext') ? '.pathnext'
      : `a[href="${CSS.escape(active.getAttribute('href') ?? '')}"]`;

    contextNav.dataset.destination = destination;
    contextNav.setAttribute('aria-label', destination === 'learn' ? `Lesson path for the ${AIRCRAFT[jet].short}`
      : destination === 'practice' ? 'Practice labs' : destination === 'reference' ? 'Reference' : 'Fly');
    if (destination === 'learn') {
      track.replaceChildren(pathList(steps, at));
      status.replaceChildren(...learnStatus(at, nextPath, lessonPosition()));
    } else {
      const links = contextualLinks(destination, jet);
      track.replaceChildren(h('ul', { class: 'context-nav__links' }, links.map(link => h('li', null, linkEl(link)))));
      status.replaceChildren(...awayStatus(at, nextPath));
    }
    contextNav.hidden = steps.length === 0 && destination === 'learn';
    // Keep the current step in view when the steps scroll sideways.
    const cur = track.querySelector<HTMLElement>('[aria-current="page"]')?.closest('li');
    if (cur && track.scrollWidth > track.clientWidth) track.scrollLeft = cur.offsetLeft - (track.clientWidth - cur.offsetWidth) / 2;
    if (refocus) contextNav.querySelector<HTMLElement>(refocus)?.focus({ preventScroll: true });
    syncOverflow();
    syncHeight();
  };

  const isHere = (path: string) => {
    const p = routeOf(path);
    return p === route.path || (p === 'learn' && route.path === 'hangar');
  };
  const linkEl = (link: NavLink) =>
    h('a', { href: '#/' + link.path, 'aria-current': isHere(link.path) ? 'page' : undefined }, link.label);

  app.subscribe((_, what) => { sync(); if (what === 'aircraft' || what === 'progress') renderContext(); });
  // The open sub-lesson of the page (its lesson picker) changes the position text only.
  watchLessonPosition(() => renderContext());

  const setActive = (next: RouteDef, nextParams = new URLSearchParams(location.hash.split('?')[1] ?? '')) => {
    // Another page: drop the old page's lesson position (its picker should have withdrawn it on unmount).
    if (next.path !== route.path) clearLessonPosition();
    route = next;
    params = nextParams;
    fillPicker();
    renderContext();
    document.title = pageTitle(route, params, app.jet);
  };
  return { outlet, setActive };
}

/** The numbered steps. Done steps light their number; the current step is the pressed cap. */
function pathList(steps: readonly StepState[], at: PathStatus): HTMLElement {
  return h('ol', { class: 'pathbar' }, steps.map((s, i) => {
    const state = i === at.current ? 'current' : s.complete ? 'done' : 'todo';
    const groupStart = i > 0 && steps[i - 1]!.link.group !== s.link.group;
    return h('li', { class: groupStart ? 'pathbar__item is-group-start' : 'pathbar__item' },
      h('a', {
        class: 'pathbar__step', href: '#/' + s.link.path, title: s.link.title,
        dataset: { state, done: String(s.complete), next: String(at.next.index === i) },
        'aria-current': i === at.current ? 'page' : undefined,
      },
      h('span', { class: 'pathbar__num', 'aria-hidden': 'true' }, String(i + 1)),
      h('span', { class: 'pathbar__label' }, s.link.label),
      s.complete ? h('span', { class: 'ui-sr' }, ', done') : null));
  }));
}

/** Position readout in a small glass window: 'LESSON 2/7' on a step, 'DONE 3/7' elsewhere. */
function position(caption: string, n: number, total: number, spoken: string, sub = false): HTMLElement {
  return h('span', { class: sub ? 'pathpos pathpos--sub' : 'pathpos' },
    h('span', { class: 'pathpos__cap', 'aria-hidden': 'true' }, caption),
    h('span', { class: 'pathpos__glass', 'aria-hidden': 'true' }, h('b', null, String(n)), '/' + total),
    h('span', { class: 'ui-sr' }, spoken));
}

function nextLink(text: string, path: string, ready: boolean, describe?: string): HTMLElement {
  return h('a', { class: 'pathnext', href: '#/' + path, dataset: { ready: String(ready) }, title: describe },
    h('span', { class: 'pathnext__text' }, text), h('span', { class: 'pathnext__arrow', 'aria-hidden': 'true' }, '→'));
}

function learnStatus(at: PathStatus, nextPath: string, sub: LessonPosition | null): HTMLElement[] {
  if (at.current === null) {
    // Learn home and Progress carry their own Continue; the bar only says how far the pilot is.
    return [position('Done', at.doneCount, at.total, `${at.doneCount} of ${at.total} lessons done`)];
  }
  const spoken = `Lesson ${at.current + 1} of ${at.total}`;
  return [
    position('Lesson', at.current + 1, at.total, spoken),
    // Which of the page's own lessons is open: 'HARM 3/9' (not in free practice).
    sub && sub.index !== null ? position(sub.topic, sub.index + 1, sub.total, `${sub.topic}: ${positionText(sub)}`, true) : null,
    nextLink(nextText(at), nextPath, at.ready, at.ready ? 'This lesson is done' : undefined),
  ].filter((x): x is HTMLElement => x !== null);
}

function awayStatus(at: PathStatus, nextPath: string): HTMLElement[] {
  const pos = position('Lessons', at.doneCount, at.total, `${at.doneCount} of ${at.total} lessons done`);
  if (at.complete) return [pos, nextLink('Lesson path', 'learn', false)];
  return [pos, nextLink(nextText(at), nextPath, false)];
}
