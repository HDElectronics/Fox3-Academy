/** App chrome: brand, aircraft selector, module nav, units toggle. Cockpit skin follows the jet. */
import { AIRCRAFT, AIRCRAFT_ORDER } from '../data/aircraft';
import type { AircraftId } from '../data/types';
import type { RouteDef } from './routes';
import { contextualLinks, DESTINATIONS, destinationFor } from './navigation';
import type { AppStore } from './store';
import { h, $$ } from '../ui/dom';

export function buildShell(root: HTMLElement, app: AppStore) {
  const select = h('select', { id: 'jetSelect', class: 'jet-select', 'aria-label': 'Aircraft' },
    AIRCRAFT_ORDER.map(id => h('option', { value: id }, AIRCRAFT[id].short + (AIRCRAFT[id].module === 'fc3' ? '  ·  FC3' : ''))));
  select.value = app.aircraft;
  select.addEventListener('change', () => app.setAircraft(select.value as AircraftId));

  const unitsBtn = h('button', { class: 'units-btn', id: 'unitsBtn', type: 'button', title: 'Switch units' });
  unitsBtn.addEventListener('click', () => app.setUnits(app.units === 'metric' ? 'imperial' : 'metric'));

  const nav = h('nav', { class: 'modnav', 'aria-label': 'Main navigation' },
    DESTINATIONS.map(r => h('a', { href: '#/' + r.path, dataset: { destination: r.id } }, r.label)));
  const contextNav = h('nav', { class: 'context-nav', 'aria-label': 'Lessons' });

  const bar = h('header', { class: 'topbar' },
    h('a', { class: 'brand', href: '#/learn' }, h('span', { class: 'brand-mark' }, 'F3'), h('span', { class: 'brand-name' }, 'Fox Three School')),
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
    const spec = AIRCRAFT[app.aircraft];
    document.documentElement.dataset.cockpit = spec.cockpit;
    document.documentElement.dataset.aircraft = spec.id;
    select.value = app.aircraft;
    unitsBtn.textContent = app.units === 'metric' ? 'km · m' : 'nm · ft';
  };
  sync();
  app.subscribe(sync);

  const setActive = (route: RouteDef, params = new URLSearchParams(location.hash.split('?')[1] ?? '')) => {
    const destination = destinationFor(route.path, params);
    for (const a of $$('a', nav)) a.setAttribute('aria-current', a.dataset.destination === destination ? 'page' : 'false');
    const links = contextualLinks(destination);
    contextNav.hidden = links.length === 0;
    contextNav.setAttribute('aria-label', destination === 'practice' ? 'Practice labs' : destination === 'reference' ? 'Reference pages' : 'Lessons');
    contextNav.replaceChildren(...links.map(link => {
      const path = link.path.split('?')[0];
      const active = path === route.path || (path === 'learn' && route.path === 'hangar');
      return h('a', { href: '#/' + link.path, 'aria-current': active ? 'page' : 'false' }, link.label);
    }));
    syncHeight();
    document.title = route.path === 'hangar' ? 'Fox Three School' : route.label + ' · Fox Three School';
  };
  return { outlet, setActive };
}
