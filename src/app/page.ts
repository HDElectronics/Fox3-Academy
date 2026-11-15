/** Page contract. Every route in src/pages/<name>/index.ts default-exports a PageFactory. */
import type { AppStore } from './store';

export interface NavigateOptions {
  /** Replace the current history entry instead of adding one (normalising the page's own URL). */
  replace?: boolean;
}

export interface PageContext {
  /** Container the page renders into. It is empty on mount and the page owns everything inside. */
  root: HTMLElement;
  app: AppStore;
  params: URLSearchParams;
  /**
   * Go to 'route?query'. A new query on the same route goes to the page's `update` first (in place), else it
   * remounts the page. `{ replace: true }` rewrites the current history entry, so Back skips it.
   */
  navigate(path: string, opts?: NavigateOptions): void;
}

export interface Page {
  mount(ctx: PageContext): void | Promise<void>;
  /**
   * Optional. The route stayed the same and only the query changed (a lesson picker link, Next in a debrief, browser
   * Back or Forward). Apply the new params in place and return true, or return false to have the router remount
   * the page. Pages without it are remounted on every query change.
   */
  update?(params: URLSearchParams): boolean;
  /** Must stop loops, remove window/document listeners, dispose three.js resources. */
  unmount(): void;
}

export type PageFactory = () => Page;
