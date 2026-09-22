/** [OWNER: page-reference] Reference page mount/unmount harness: leaks and console errors across all ten jets. */
import '../src/styles/tokens.css';
import '../src/styles/base.css';
import '../src/styles/components.css';
import { AppStore } from '../src/app/store';
import { AIRCRAFT_ORDER } from '../src/data/aircraft';

let live = 0;
for (const target of [window, document] as EventTarget[]) {
  const add = target.addEventListener.bind(target), rem = target.removeEventListener.bind(target);
  target.addEventListener = ((t: string, l: EventListenerOrEventListenerObject, o?: boolean | AddEventListenerOptions) => { live++; add(t, l, o); }) as typeof target.addEventListener;
  target.removeEventListener = ((t: string, l: EventListenerOrEventListenerObject, o?: boolean | EventListenerOptions) => { live--; rem(t, l, o); }) as typeof target.removeEventListener;
}
let observers = 0;
const RO = window.ResizeObserver;
window.ResizeObserver = class extends RO {
  private on = false;
  override observe(t: Element, o?: ResizeObserverOptions) { if (!this.on) { this.on = true; observers++; } super.observe(t, o); }
  override disconnect() { if (this.on) { this.on = false; observers--; } super.disconnect(); }
};
const IO = window.IntersectionObserver;
window.IntersectionObserver = class extends IO {
  private on = false;
  override observe(t: Element) { if (!this.on) { this.on = true; observers++; } super.observe(t); }
  override disconnect() { if (this.on) { this.on = false; observers--; } super.disconnect(); }
};
let errors = 0;
const err = console.error.bind(console);
console.error = (...a: unknown[]) => { errors++; err(...a); };
window.addEventListener('error', () => { errors++; });

const app = new AppStore();
const outlet = document.getElementById('outlet') as HTMLElement;
const { default: factory } = await import('../src/pages/reference/index');
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const ctx = () => ({ root: outlet, app, params: new URLSearchParams(), navigate: (p: string) => console.log('navigate', p) });
const problems: string[] = [];

for (const ac of AIRCRAFT_ORDER) {
  app.setAircraft(ac);
  document.documentElement.dataset.cockpit = app.spec.cockpit;
  const page = factory();
  await page.mount(ctx());
  await wait(200);
  const text = outlet.textContent ?? '';
  if (/NaN|undefined|\[object|Infinity/.test(text)) problems.push(`${ac}: bad text`);
  if (!outlet.querySelector('canvas')) problems.push(`${ac}: no display canvas`);
  const de = document.documentElement;
  if (de.scrollWidth > de.clientWidth + 1) {
    const wide = [...outlet.querySelectorAll<HTMLElement>('*')].filter(el => el.getBoundingClientRect().right > de.clientWidth + 1 && !el.closest('.ui-table-wrap'));
    problems.push(`${ac}: page overflows ${de.scrollWidth}>${de.clientWidth} (${wide.slice(0, 3).map(el => el.className || el.tagName).join(' | ')})`);
  }
  // Filter reaches the procedures.
  const procInput = outlet.querySelector<HTMLInputElement>('#ref-filter');
  if (procInput) {
    procInput.value = 'chaff'; procInput.dispatchEvent(new Event('input'));
    await wait(200);
    const shown = [...outlet.querySelectorAll<HTMLElement>('#ref-procs .ref-step')].filter(li => !li.hidden).length;
    if (!shown) problems.push(`${ac}: no procedure step matches "chaff"`);
    procInput.value = ''; procInput.dispatchEvent(new Event('input'));
    await wait(200);
  }
  // Filter: type, wait for the debounce, then clear with Escape.
  const input = outlet.querySelector<HTMLInputElement>('#ref-filter');
  if (!input) { problems.push(`${ac}: no filter`); continue; }
  input.value = 'notch'; input.dispatchEvent(new Event('input'));
  await wait(200);
  const status = outlet.querySelector('#ref-filter-status')?.textContent ?? '';
  if (!/matching/.test(status)) problems.push(`${ac}: filter status "${status}"`);
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  if (input.value) problems.push(`${ac}: Escape did not clear`);
  // Sort by pitbull twice and open a missile row.
  const sortBtn = [...outlet.querySelectorAll<HTMLButtonElement>('.ref-sort')].find(b => /Pitbull/.test(b.textContent ?? ''));
  sortBtn?.click(); sortBtn?.click();
  outlet.querySelector<HTMLButtonElement>('.ref-disclose')?.click();
  if (!outlet.querySelector('.ref-detail')) problems.push(`${ac}: missile row did not expand`);
  // Unmount while typing (debounce pending) to check the timer is cleared.
  input.value = 'r-77'; input.dispatchEvent(new Event('input'));
  page.unmount();
  outlet.replaceChildren();
}
await wait(400);
console.warn(`REFERENCE CYCLE ${AIRCRAFT_ORDER.length} jets: listenersNet=${live} observersNet=${observers} canvases=${document.querySelectorAll('canvas').length} errors=${errors} problems=${JSON.stringify(problems)}`);
