/** Page contract. Every route in src/pages/<name>/index.ts default-exports a PageFactory. */
import type { AppStore } from './store';

export interface PageContext {
  /** Container the page renders into. It is empty on mount and the page owns everything inside. */
  root: HTMLElement;
  app: AppStore;
  params: URLSearchParams;
  navigate(path: string): void;
}

export interface Page {
  mount(ctx: PageContext): void | Promise<void>;
  /** Must stop loops, remove window/document listeners, dispose three.js resources. */
  unmount(): void;
}

export type PageFactory = () => Page;
