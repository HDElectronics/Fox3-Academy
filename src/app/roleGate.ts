/**
 * Route role gate. Each route lists the jet roles it teaches (RouteDef.roles, default fighter only). The
 * picker offers only jets whose role the current route accepts; when the stored jet does not fit (the Su-25T on
 * a BVR page), the router shows this panel instead of mounting the page, with one button per fighter.
 */
import { AIRCRAFT, AIRCRAFT_ORDER, FIGHTER_ORDER } from '../data/aircraft';
import type { AircraftId, AircraftRole } from '../data/types';
import type { RouteDef } from './routes';
import type { AppStore } from './store';
import { h } from '../ui/dom';

const DEFAULT_ROLES: readonly AircraftRole[] = ['fighter'];

export function routeRoles(route: Pick<RouteDef, 'roles'>): readonly AircraftRole[] {
  return route.roles ?? DEFAULT_ROLES;
}

export function jetAllowed(route: Pick<RouteDef, 'roles'>, id: AircraftId): boolean {
  return routeRoles(route).includes(AIRCRAFT[id].role);
}

/** Picker options on a route: the jets it accepts, plus the current jet so the picker never lies. */
export function pickerJets(route: Pick<RouteDef, 'roles'>, current: AircraftId): AircraftId[] {
  return AIRCRAFT_ORDER.filter(id => id === current || jetAllowed(route, id));
}

/** Panel shown in place of a page that does not accept the selected jet. */
export function roleGatePanel(route: RouteDef, app: AppStore): HTMLElement {
  const jet = app.jetSpec;
  const lead = jet.role === 'attack'
    ? `The ${jet.short} has no air-to-air radar. Pick a fighter.`
    : `${route.label} is for attack jets. Pick one.`;
  const detail = jet.role === 'attack'
    ? `${route.label} teaches radar and missile work. ${jet.short} air-to-ground lessons are not built yet.`
    : `The ${jet.short} is a fighter.`;
  const choices = jet.role === 'attack' ? FIGHTER_ORDER : AIRCRAFT_ORDER.filter(id => jetAllowed(route, id));
  return h('div', { class: 'role-gate' },
    h('section', { class: 'ui-console', id: 'role-gate', 'aria-labelledby': 'role-gate-title' },
      h('header', { class: 'ui-console__head' }, h('h3', { class: 'ui-console__title', id: 'role-gate-title' }, route.label)),
      h('div', { class: 'ui-console__body' },
        h('p', { class: 'role-gate__lead' }, lead),
        h('p', null, detail),
        h('div', { class: 'role-gate__jets' }, choices.map(id => h('button', {
          type: 'button', class: 'ui-btn ui-btn--primary', id: `role-gate-${id}`, onclick: () => app.setAircraft(id),
        }, AIRCRAFT[id].short))))));
}
