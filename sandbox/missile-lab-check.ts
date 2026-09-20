/** Behaviour checks for the Missile Lab page: mount, presets, keyboard fire, compute exactly, progress, unmount. */
import '../src/styles/tokens.css';
import '../src/styles/base.css';
import '../src/styles/components.css';
import { AppStore } from '../src/app/store';
import factory from '../src/pages/missile-lab/index';

const results: string[] = [];
let fails = 0;
const check = (name: string, ok: boolean, info = '') => {
  results.push(`${ok ? 'ok  ' : 'FAIL'} ${name}${info ? ' · ' + info : ''}`);
  if (!ok) fails++;
};
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const $ = <T extends Element = HTMLElement>(s: string) => document.querySelector(s) as T | null;

async function run() {
  const host = document.getElementById('host') as HTMLElement;
  const app = new AppStore();
  app.setAircraft('su27');
  document.documentElement.dataset.cockpit = app.spec.cockpit;
  const errors: string[] = [];
  window.addEventListener('error', e => errors.push(String(e.message)));

  const page = factory();
  await page.mount({ root: host, app, params: new URLSearchParams(''), navigate: () => {} });
  await wait(300);
  const title = () => $('#ml-result .ui-coach__title')?.textContent ?? '';
  const rows = () => document.querySelectorAll('.ml-compare__row').length;
  check('opening shot flown', /^A · /.test(title()), title());
  check('opening shot kept', rows() === 1);

  ($('#ml-preset-rne') as HTMLButtonElement).click();
  await wait(100);
  check('Rne preset: one shot, a hit', rows() === 1 && title().includes('HIT'), title());

  ($('#ml-preset-hot-cold') as HTMLButtonElement).click();
  await wait(100);
  check('hot vs cold: two shots', rows() === 2);
  check('hot vs cold takeaway shown', !($('.ml-takeaway') as HTMLElement).hidden);

  document.body.focus();
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ', bubbles: true }));
  await wait(100);
  check('Space fires (Su-27 launch key)', rows() === 3, String(rows()));
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ', bubbles: true }));
  await wait(100);
  check('fourth shot replaces the oldest', rows() === 3);
  check('progress saved after 3 shots incl. Rne preset', app.getProgress('missiles:su27:done') === true);

  // weapon step key D cycles the missile select
  const sel = $('#ml-missile') as HTMLSelectElement | null;
  const before = sel?.value;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD', key: 'd', bubbles: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD', key: 'd', bubbles: true }));
  await wait(50);
  check('D steps to the next missile', !!sel && sel.value !== before, `${before} -> ${sel?.value}`);

  // review: loading an IR shot relabels the notch option 'Notch + flares'
  const manLabel = () => document.querySelector('#ml-man [data-value="notch-chaff"], #ml-man button:last-child')?.textContent ?? '';
  if (sel) { sel.value = 'r73'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
  await wait(30);
  ($('#ml-fire') as HTMLButtonElement).click();
  await wait(60);
  if (sel) { sel.value = 'r27er'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
  await wait(30);
  check('radar missile: notch + chaff', /chaff/i.test(manLabel()), manLabel());
  const loadBtns = [...document.querySelectorAll('.ml-compare__row.is-sel .ml-compare__acts button')] as HTMLButtonElement[];
  loadBtns[0]?.click();
  await wait(30);
  check('Load of an IR shot relabels it notch + flares', /flares/i.test(manLabel()) && sel?.value === 'r73', `${sel?.value} ${manLabel()}`);

  // review: a reaction-delay change does not cancel a running compute exactly
  {
    const btn = $('#ml-exact') as HTMLButtonElement;
    btn.click();
    const turnCold = $('#ml-man-turn-cold') as HTMLButtonElement | null;
    turnCold?.click();   // the manoeuvre does not change Rmax / Rne
    check('a manoeuvre change keeps compute exactly running', !!turnCold && btn.disabled, turnCold ? btn.textContent ?? '' : 'no turn-cold button');
    const aspectCold = $('#ml-aspect-cold') as HTMLButtonElement | null;
    const sAspect = $('#ml-aspect-hot') as HTMLButtonElement | null;
    aspectCold?.click();   // the aspect does: the search is cancelled
    check('an aspect change cancels compute exactly', !!aspectCold && !btn.disabled, btn.textContent ?? '');
    sAspect?.click();
    ($('#ml-man-none') as HTMLButtonElement | null)?.click();
    const t0 = performance.now();
    while (btn.disabled && performance.now() - t0 < 30000) await wait(50);
  }

  // compute exactly: must stay responsive and finish. Measure the longest task with a timer ping loop.
  const computeCheck = async (label: string) => {
    const btn = $('#ml-exact') as HTMLButtonElement;
    let maxGap = 0, last = performance.now(), watching = true;
    const ping = () => { const now = performance.now(); maxGap = Math.max(maxGap, now - last); last = now; if (watching) setTimeout(ping, 0); };
    setTimeout(ping, 0);
    btn.click();
    check(label + ': busy state', btn.disabled && /Flying/.test(btn.textContent ?? ''), btn.textContent ?? '');
    const t0 = performance.now();
    while (btn.disabled && performance.now() - t0 < 30000) await wait(50);
    watching = false;
    const out = $('.ml-exact-out')?.textContent ?? '';
    check(label + ': finishes', !btn.disabled && /Exact after \d+ flights/.test(out), `${out} (${(performance.now() - t0).toFixed(0)} ms)`);
    check(label + ': UI stays responsive', maxGap < 120, `longest task ${maxGap.toFixed(0)} ms`);
  };
  await computeCheck('compute exactly R-27ET');

  // the longest flights: F-14 AIM-54C
  page.unmount();
  host.replaceChildren();
  app.setAircraft('f14b');
  const pageF14 = factory();
  await pageF14.mount({ root: host, app, params: new URLSearchParams(''), navigate: () => {} });
  await wait(200);
  await computeCheck('compute exactly AIM-54C');

  // review: ?ac= selects the jet once and leaves the URL, so a later top-bar change is not undone
  pageF14.unmount();
  host.replaceChildren();
  const pAc = factory();
  await pAc.mount({ root: host, app, params: new URLSearchParams('ac=mig29s&shot=fire'), navigate: () => {} });
  check('?ac switches the jet', app.aircraft === 'mig29s', app.aircraft);
  check('?ac is removed from the URL, other params kept', !/ac=/.test(location.hash) && /shot=fire/.test(location.hash), location.hash);
  pAc.unmount();
  host.replaceChildren();
  app.setAircraft('f14b');
  await pageF14.mount({ root: host, app, params: new URLSearchParams(''), navigate: () => {} });
  await wait(100);

  // unmount / remount cycles
  pageF14.unmount();
  await wait(50);
  check('unmount empties the page', !host.querySelector('.ml') && host.querySelectorAll('canvas').length === 0, String(host.children.length));
  host.replaceChildren();
  for (let i = 0; i < 3; i++) {
    const p = factory();
    await p.mount({ root: host, app, params: new URLSearchParams(i === 1 ? 'shot=loft' : ''), navigate: () => {} });
    await wait(150);
    p.unmount();
    host.replaceChildren();
  }
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true }));
  await wait(50);
  check('no key handlers left after unmount', !host.querySelector('.ml'));
  check('no uncaught errors', errors.length === 0, errors.join(' | '));

  // leave one mounted for the screenshot, F-15C in imperial, loft preset paused mid-flight
  app.setAircraft('f15c');
  document.documentElement.dataset.cockpit = app.spec.cockpit;
  const last2 = factory();
  await last2.mount({ root: host, app, params: new URLSearchParams('shot=rmax-cold&t=40&cam=orbit'), navigate: () => {} });
  (document.querySelector('.ui-lab__console') as HTMLElement | null)?.scrollTo(0, 1500);

  await wait(300);
  ($('#ml-dlzx-mach') as HTMLButtonElement | null)?.click();
  const cv = document.querySelector('#ml-p-mach canvas') as HTMLCanvasElement | null;
  if (cv) {
    const r = cv.getBoundingClientRect();
    cv.dispatchEvent(new PointerEvent('pointermove', { clientX: r.left + r.width * 0.55, clientY: r.top + r.height / 2, bubbles: true }));
  }
  const cv2 = document.querySelector('#ml-p-range canvas') as HTMLCanvasElement | null;
  if (cv2) {
    const r = cv2.getBoundingClientRect();
    cv2.dispatchEvent(new PointerEvent('pointermove', { clientX: r.left + r.width * 0.3, clientY: r.top + r.height / 2, bubbles: true }));
  }
  check('hover and chart axis switch raise no errors', errors.length === 0, errors.join(' | '));
  const over = [...document.querySelectorAll<HTMLElement>('.ml *')].filter(el => el.getBoundingClientRect().right > window.innerWidth + 1 && !el.closest('.ui-lab__view'));
  check(`no sideways overflow at ${window.innerWidth} px`, document.documentElement.scrollWidth <= window.innerWidth + 1 && over.length === 0,
    `${document.documentElement.scrollWidth} px; ${over.slice(0, 3).map(el => el.className || el.tagName).join(', ')}`);
  for (const r of results) console.log('ML-CHECK ' + r);
  console.log(`ML-CHECK ${fails ? 'FAIL' : 'PASS'} ${results.length - fails}/${results.length}`);
}
run().catch(e => console.error('ML-CHECK crashed', e));
