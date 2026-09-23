/** Hangar mount/unmount harness: counts canvases, RAF activity and window listeners across cycles. */
import '../src/styles/tokens.css';
import '../src/styles/base.css';
import '../src/styles/components.css';
import { AppStore } from '../src/app/store';
import type { FighterId } from '../src/data/types';

const q = new URLSearchParams(location.search);
if (q.get('reduced') === '1') {
  const real = window.matchMedia.bind(window);
  window.matchMedia = (s: string) => (s.includes('reduced-motion') ? ({ matches: true, media: s, addEventListener() {}, removeEventListener() {} } as unknown as MediaQueryList) : real(s));
}
// Count window listeners the page adds and removes.
let live = 0;
const add = window.addEventListener.bind(window), rem = window.removeEventListener.bind(window);
window.addEventListener = ((t: string, l: EventListenerOrEventListenerObject, o?: boolean | AddEventListenerOptions) => { live++; add(t, l, o); }) as typeof window.addEventListener;
window.removeEventListener = ((t: string, l: EventListenerOrEventListenerObject, o?: boolean | EventListenerOptions) => { live--; rem(t, l, o); }) as typeof window.removeEventListener;
let rafs = 0;
const raf = window.requestAnimationFrame.bind(window);
window.requestAnimationFrame = (cb: FrameRequestCallback) => { rafs++; return raf(cb); };

const app = new AppStore();
const ac = q.get('ac') as FighterId | null;
if (ac) app.setAircraft(ac);
document.documentElement.dataset.cockpit = app.spec.cockpit;
const outlet = document.getElementById('outlet') as HTMLElement;
const { default: factory } = await import('../src/pages/hangar/index');
const n = Number(q.get('n') ?? 6);
const ctx = () => ({ root: outlet, app, params: new URLSearchParams(), navigate: (p: string) => console.log('navigate', p) });
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
for (let i = 0; i < n; i++) {
  const page = factory();
  await page.mount(ctx());
  await wait(150);
  page.unmount();
  outlet.replaceChildren();
}
const r0 = rafs; await wait(400);
console.warn(`HANGAR CYCLE after ${n} cycles: canvases=${document.querySelectorAll('canvas').length} windowListenersNet=${live} rafWhileUnmounted=${rafs - r0}`);
const page = factory();
await page.mount(ctx());
await wait(600);
const r1 = rafs; await wait(500);
console.warn(`HANGAR MOUNTED: canvases=${document.querySelectorAll('canvas').length} rafPer500ms=${rafs - r1} reduced=${q.get('reduced') === '1'}`);
