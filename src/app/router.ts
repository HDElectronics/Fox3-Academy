/** Hash router: '#/tws?x=1'. Remounts the current page when the aircraft changes. */
import { routeFor, type RouteDef } from './routes';
import { AIRCRAFT } from '../data/aircraft';
import type { AircraftId } from '../data/types';
import { queryIdentity } from './navigation';
import { jetAllowed, roleGatePanel } from './roleGate';
import type { Page, PageFactory } from './page';
import type { AppStore } from './store';
import { h } from '../ui/dom';

export class Router {
  private current: { route: RouteDef; query: string; page: Page } | null = null;
  private token = 0;
  onChange: (route: RouteDef, params: URLSearchParams) => void = () => {};

  constructor(private outlet: HTMLElement, private app: AppStore) {
    window.addEventListener('hashchange', () => this.resolve());
    app.subscribe((_, what) => { if (what === 'aircraft' || what === 'units') this.resolve(true); });
  }

  navigate(path: string) {
    const target = '#/' + path.replace(/^#?\/?/, '');
    if (location.hash === target) this.resolve(true); else location.hash = target;
  }

  async resolve(force = false) {
    const raw = location.hash.replace(/^#\/?/, '');
    const [path, query = ''] = raw.split('?');
    const route = routeFor(path ?? '');
    const params = new URLSearchParams(query);
    // A deep link may select a jet once. Remove it before store notifications remount the page.
    const aircraft = params.get('ac');
    if (aircraft !== null) {
      params.delete('ac');
      const qs = params.toString();
      history.replaceState(history.state, '', '#/' + path + (qs ? '?' + qs : ''));
      if (Object.hasOwn(AIRCRAFT, aircraft) && aircraft !== this.app.jet) {
        this.app.setAircraft(aircraft as AircraftId);
        return;
      }
    }
    const queryKey = queryIdentity(params);
    if (!force && this.current?.route === route && this.current.query === queryKey) return;
    const token = ++this.token;
    if (this.current) {
      try { this.current.page.unmount(); } catch (e) { console.error(e); }
      this.current = null;
    }
    // The selected jet's role does not fit this route (the Su-25T on a BVR page): offer the jets that do.
    if (!jetAllowed(route, this.app.jet)) {
      this.outlet.dataset.page = route.path;
      this.outlet.replaceChildren(roleGatePanel(route, this.app));
      this.onChange(route, params);
      return;
    }
    this.outlet.replaceChildren(h('div', { class: 'page-loading', role: 'status' }, 'Loading ' + route.label + '…'));
    this.onChange(route, params);
    let mod: { default: PageFactory };
    try {
      mod = await route.load();
    } catch (e) {
      // Usually a network failure or a stale chunk after a redeploy (code-split build only).
      console.error(e);
      if (token === this.token) this.showError(route, 'Could not load ' + route.label + '. Check the connection and retry.');
      return;
    }
    if (token !== this.token) return;
    try {
      const page = mod.default();
      this.outlet.replaceChildren();
      this.outlet.dataset.page = route.path;
      this.current = { route, query: queryKey, page };
      await page.mount({ root: this.outlet, app: this.app, params, navigate: p => this.navigate(p) });
    } catch (e) {
      console.error(e);
      if (token === this.token) this.showError(route, route.label + ' failed to start: ' + String(e));
    }
  }

  private showError(route: RouteDef, message: string) {
    this.outlet.dataset.page = route.path;
    this.outlet.replaceChildren(h('div', { class: 'page-error', role: 'alert' },
      h('p', null, message),
      h('div', { class: 'page-error__actions' },
        h('button', { type: 'button', class: 'ui-btn ui-btn--primary', onclick: () => this.resolve(true) }, 'Retry'),
        h('button', { type: 'button', class: 'ui-btn', onclick: () => location.reload() }, 'Reload app'))));
  }
}
