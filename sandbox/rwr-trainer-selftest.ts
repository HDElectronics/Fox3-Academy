/**
 * [OWNER: page-rwr-trainer] In-browser behaviour checks for the RWR trainer page: keyboard and click
 * paths in Learn and Quiz, mode switching, timer, and clean unmount (listeners, animation loop, DOM).
 * Needs real time (headless virtual time barely runs requestAnimationFrame): open
 * /sandbox/rwr-trainer.html in a browser, or drive headless Chrome over CDP and read window.__rwrtResult.
 */
import '../src/styles/tokens.css';
import '../src/styles/base.css';
import '../src/styles/components.css';
import { AppStore } from '../src/app/store';
import factory from '../src/pages/rwr-trainer/index';

const results: [string, boolean][] = [];
const ok = (name: string, cond: boolean) => results.push([name, !!cond]);
/** Wait by animation frames, so headless virtual time renders frames while we wait. */
const sleep = (ms: number) => new Promise<void>(r => {
  const end = performance.now() + ms;
  const tick = () => (performance.now() >= end ? r() : raf0(tick));
  raf0(tick);
});
/** Plain timer wait (no frames requested by us): used to check that the page requests none either. */
const idle = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// Count window keydown listeners and animation-frame requests.
let keyListeners = 0;
const addL = window.addEventListener.bind(window);
const remL = window.removeEventListener.bind(window);
window.addEventListener = ((type: string, fn: EventListenerOrEventListenerObject, o?: boolean | AddEventListenerOptions) => {
  if (type === 'keydown') keyListeners++;
  addL(type, fn, o);
}) as typeof window.addEventListener;
window.removeEventListener = ((type: string, fn: EventListenerOrEventListenerObject, o?: boolean | EventListenerOptions) => {
  if (type === 'keydown') keyListeners--;
  remL(type, fn, o);
}) as typeof window.removeEventListener;
let rafCalls = 0;
const raf0 = window.requestAnimationFrame.bind(window);
let rafRuns = 0;
window.requestAnimationFrame = (cb: FrameRequestCallback) => { rafCalls++; return raf0(t => { rafRuns++; cb(t); }); };

const key = (code: string, init: KeyboardEventInit = {}) => {
  const k = code.startsWith('Key') ? code.slice(3).toLowerCase() : code.startsWith('Digit') ? code.slice(5) : code;
  window.dispatchEvent(new KeyboardEvent('keydown', { code, key: k, bubbles: true, cancelable: true, ...init }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code, key: k, bubbles: true, cancelable: true, ...init }));
};
const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T | null;

function mount(app: AppStore, params: string) {
  const root = document.createElement('div');
  root.style.cssText = 'width:1440px;height:900px;display:flex;flex-direction:column';
  document.getElementById('app')?.append(root);
  const page = factory();
  void page.mount({ root, app, params: new URLSearchParams(params), navigate: () => {} });
  return { root, page };
}

async function run() {
  const app = new AppStore();
  app.setAircraft('su27');
  const baseKeys = keyListeners;

  // ---------------------------------------------------------------- Learn (SPO-15)
  let { root, page } = mount(app, 'mode=learn');
  await sleep(300);
  const chips = () => root.querySelectorAll('.rwrt-chip').length;
  ok('learn: demo preset has 3 threats', chips() === 3);
  ok('learn: anatomy lists the 7 SPO-15 parts', root.querySelectorAll('.rwrt-part').length === 7);
  const cv = $<HTMLCanvasElement>('.rwrt-rwr__canvas', root);
  const px = cv?.getContext('2d')?.getImageData(0, 0, cv.width, cv.height).data;
  let lit = 0;
  if (px) for (let i = 0; i < px.length; i += 4) if (px[i] + px[i + 1] > 300) lit++;
  ok('learn: RWR canvas is drawn', lit > 200);
  key('KeyN');
  ok('learn: N adds a threat', chips() === 4);
  key('Digit2');
  ok('learn: 2 sets Lock', $('#rwrt-state-lock', root)?.getAttribute('aria-checked') === 'true');
  const typeSel = $<HTMLSelectElement>('#rwrt-type select, select#rwrt-type', root);
  if (typeSel) { typeSel.value = 'su27'; typeSel.dispatchEvent(new Event('change', { bubbles: true })); }
  key('Digit4');
  ok('learn: Su-27 cannot go Missile active', $('#rwrt-state-active', root)?.getAttribute('aria-checked') !== 'true'
    && /no Fox 3/.test($('#rwrt-learn-coach', root)?.textContent ?? '') && ($('#rwrt-state-active', root) as HTMLButtonElement | null)?.disabled === true);
  const brgBefore = $<HTMLInputElement>('#rwrt-brg input, input#rwrt-brg', root)?.value;
  key('ArrowRight');
  ok('learn: Right arrow turns the threat', $<HTMLInputElement>('#rwrt-brg input, input#rwrt-brg', root)?.value !== brgBefore);
  key('Delete');
  ok('learn: Delete removes it', chips() === 3);
  key('ShiftRight', { shiftKey: true, location: 2 });
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftRight', key: 'Shift', shiftKey: true, location: 2, bubbles: true }));
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', key: 'R', shiftKey: true, bubbles: true, cancelable: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyR', key: 'R', shiftKey: true, bubbles: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftRight', key: 'Shift', location: 2, bubbles: true }));
  ok('learn: RShift+R toggles RWR mode', $('#rwrt-rwrmode-lock', root)?.getAttribute('aria-checked') === 'true');
  // Tap the primary lamp (T1 lock at 30 deg right) to select T1.
  ($<HTMLButtonElement>('.rwrt-chip:nth-child(2)', root))?.click();
  await sleep(100);
  if (cv) {
    const r = cv.getBoundingClientRect();
    const s = Math.min(r.width, r.height), ox = r.left + (r.width - s) / 2, oy = r.top + (r.height - s) / 2;
    const a = (30 * 0.88 * Math.PI) / 180;
    cv.dispatchEvent(new MouseEvent('click', { clientX: ox + (50 + Math.sin(a) * 40) * s / 100, clientY: oy + (60 - Math.cos(a) * 40) * s / 100, bubbles: true }));
  }
  ok('learn: tapping the yellow lamp selects its threat', $('.rwrt-chip.is-on', root)?.textContent?.startsWith('T1') === true);
  ($<HTMLButtonElement>('#rwrt-preset-busy', root))?.click();
  ok('learn: Busy sky preset', chips() === 5);

  // ---------------------------------------------------------------- Quiz
  ($<HTMLButtonElement>('#rwrt-mode-quiz', root))?.click();
  await sleep(300);
  ok('quiz: mode switch shows a question', ($('#rwrt-q-prompt', root)?.textContent ?? '').length > 5);
  ok('quiz: learn keys unbound after switch', keyListeners === baseKeys + 1);
  ok('quiz: answers offered', root.querySelectorAll('.rwrt-answers button').length >= 2);
  key('Digit1');
  await sleep(50);
  ok('quiz: key 1 answers and debriefs', $('#rwrt-debrief', root)?.hidden === false);
  // Status shows the advice ('Notch left 60°') or 'Revealed' once the answer is in.
  ok('quiz: truth revealed', !['', 'Hidden'].includes($('#rwrt-truth .ui-bezel__status', root)?.textContent ?? ''));
  const score = Number($('[data-id="score"] .ui-readout__num', root)?.textContent);
  const misses = Number(($('[data-id="misses"] .ui-readout__num', root)?.textContent ?? '0').split('/')[0]);
  ok('quiz: one answer counted', score + misses === 1);
  key('Enter');
  await sleep(50);
  ok('quiz: Enter goes to the next question', ($('.rwrt-q__count', root)?.textContent ?? '') === 'Q 2' && $('#rwrt-debrief', root)?.hidden === true);
  // Answer by click.
  ($<HTMLButtonElement>('.rwrt-answers button:not(:disabled)', root))?.click();
  ok('quiz: click answers', $('#rwrt-debrief', root)?.hidden === false);
  ($<HTMLButtonElement>('#rwrt-audio', root))?.click();
  await sleep(100);
  page.unmount();
  await idle(50);
  const rafAfter = rafCalls;
  await sleep(300);
  ok('unmount: DOM removed', root.children.length === 0);
  ok('unmount: key listeners removed', keyListeners === baseKeys);
  ok('unmount: animation loop stopped', rafCalls === rafAfter);
  root.remove();

  // ---------------------------------------------------------------- mount/unmount cycles, every RWR
  for (const ac of ['f15c', 'fa18c', 'f16c', 'jf17', 'm2000c', 'f14b', 'mig29s'] as const) {
    app.setAircraft(ac);
    for (const mode of ['learn', 'quiz']) {
      ({ root, page } = mount(app, `mode=${mode}`));
      await sleep(120);
      page.unmount();
      root.remove();
    }
  }
  const rafCycle = rafCalls;
  await sleep(300);
  ok('frames: the page loop really ran', rafRuns > 20);
  ok('cycles: no loop left running', rafCalls === rafCycle);
  ok('cycles: no key listener left', keyListeners === baseKeys);

  // ---------------------------------------------------------------- timer
  app.setAircraft('f15c');
  ({ root, page } = mount(app, 'mode=quiz&timer=1&diff=hard&seed=4'));
  await sleep(1500);
  const timerText = $('.rwrt-q__timer', root)?.textContent ?? '';
  await sleep(9_000);
  const deb = $('#rwrt-debrief', root)?.textContent ?? '';
  ok('timer: counts down', /^\d+ s$/.test(timerText));
  ok('timer: runs out and counts a miss', /Time\./.test(deb));
  page.unmount();
  root.remove();

  const failed = results.filter(r => !r[1]);
  for (const [n] of failed) console.error('RWRT FAIL:', n);
  const line = `RWRT SELFTEST ${failed.length ? 'FAIL' : 'PASS'} ${results.length - failed.length}/${results.length}`;
  console.error(line);
  (window as unknown as { __rwrtResult?: string }).__rwrtResult = [line, ...failed.map(f => 'FAIL: ' + f[0])].join('\n');
}

run().catch(e => console.error('RWRT SELFTEST ERROR', e));
