/** Hash router: '#/tws?x=1'. Remounts the current page when the aircraft changes. */
import { ROUTES, type RouteDef } from './routes';
import type { Page } from './page';
import type { AppStore } from './store';
import { h } from '../ui/dom';

export class Router {
  private current: { route: RouteDef; page: Page } | null = null;
  private token = 0;
  onChange: (route: RouteDef) => void = () => {};

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
    const route = ROUTES.find(r => r.path === path) ?? ROUTES[0];
    if (!force && this.current?.route === route) return;
    const token = ++this.token;
    if (this.current) {
      try { this.current.page.unmount(); } catch (e) { console.error(e); }
      this.current = null;
    }
    this.outlet.replaceChildren(h('div', { class: 'page-loading' }, 'Loading ' + route.label + '…'));
    this.onChange(route);
    try {
      const mod = await route.load();
      if (token !== this.token) return;
      const page = mod.default();
      this.outlet.replaceChildren();
      this.outlet.dataset.page = route.path;
      this.current = { route, page };
      await page.mount({ root: this.outlet, app: this.app, params: new URLSearchParams(query), navigate: p => this.navigate(p) });
    } catch (e) {
      console.error(e);
      if (token === this.token) this.outlet.replaceChildren(h('div', { class: 'page-error' }, 'This page failed to load: ' + String(e)));
    }
  }
}
