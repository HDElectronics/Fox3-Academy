/** App chrome: brand, aircraft selector, module nav, units toggle. Cockpit skin follows the jet; the second row lists the jet's pages. */
import { AIRCRAFT } from '../data/aircraft';
import type { AircraftId } from '../data/types';
import { routeFor, type RouteDef } from './routes';
import { pickerJets } from './roleGate';
import { contextualLinks, DESTINATIONS, destinationFor, LEARN_HOME, lessonGroups, type NavLink } from './navigation';
import type { AppStore } from './store';
import { h, $$ } from '../ui/dom';

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
  const contextNav = h('nav', { class: 'context-nav', 'aria-label': 'Lessons' });

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
  // Chrome is mounted for the application's lifetime. Both rows can wrap or change with context.
  const chromeSize = new ResizeObserver(syncHeight);
  chromeSize.observe(bar);
  chromeSize.observe(contextNav);

  const sync = () => {
    const spec = app.jetSpec;
    document.documentElement.dataset.cockpit = spec.cockpit;
    document.documentElement.dataset.aircraft = spec.id;
    fillPicker();
    unitsBtn.textContent = app.units === 'metric' ? 'km · m' : 'nm · ft';
  };
  sync();

  let params = new URLSearchParams(location.hash.split('?')[1] ?? '');
  const linkEl = (link: NavLink) => {
    const path = link.path.split('?')[0];
    const active = path === route.path || (path === 'learn' && route.path === 'hangar');
    return h('a', { href: '#/' + link.path, 'aria-current': active ? 'page' : 'false' }, link.label);
  };
  // Second row: the selected jet's pages for the destination. Learn groups them (BVR, Close combat, Flying, the jet's own).
  const renderContext = () => {
    const destination = destinationFor(route.path, params);
    for (const a of $$('a', nav)) a.setAttribute('aria-current', a.dataset.destination === destination ? 'page' : 'false');
    const links = contextualLinks(destination, app.jet);
    contextNav.hidden = links.length === 0;
    contextNav.setAttribute('aria-label', destination === 'practice' ? 'Practice labs' : destination === 'reference' ? 'Reference pages' : `Lessons for the ${app.jetSpec.short}`);
    if (destination === 'learn') {
      contextNav.replaceChildren(...LEARN_HOME.map(linkEl), ...lessonGroups(app.jet).map(g =>
        h('div', { class: 'context-nav__group', role: 'group', 'aria-label': g.label, dataset: { group: g.id } },
          h('span', { class: 'context-nav__label', 'aria-hidden': 'true' }, g.label), ...g.links.map(linkEl))));
    } else contextNav.replaceChildren(...links.map(linkEl));
    syncHeight();
  };
  app.subscribe((_, what) => { sync(); if (what === 'aircraft') renderContext(); });

  const setActive = (next: RouteDef, nextParams = new URLSearchParams(location.hash.split('?')[1] ?? '')) => {
    route = next;
    params = nextParams;
    fillPicker();
    renderContext();
    document.title = route.path === 'hangar' ? 'Fox3 Academy' : route.label + ' · Fox3 Academy';
  };
  return { outlet, setActive };
}
