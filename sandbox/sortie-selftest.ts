/**
 * Sortie page interaction self-test: mounts the real page factory with a real AppStore, drives it with
 * clicks and DCS keys, checks the screen flow brief → fly → debrief and the cleanup, and prints
 * "SORTIE SELFTEST PASS n/n" (or the failures) to the console for scripts/shot.sh.
 *   /sandbox/sortie-selftest.html?ac=f15c
 */
import '../src/styles/tokens.css';
import '../src/styles/base.css';
import '../src/styles/components.css';
import { AppStore } from '../src/app/store';
import type { AircraftId } from '../src/data/types';
import factory from '../src/pages/sortie/index';

const qs = new URLSearchParams(location.search);
// Headless virtual time jumps between timers and rarely delivers animation frames: drive
// requestAnimationFrame from 16 ms timers (harness only) so the page's loop runs as in a browser.
{
  const ids = new Map<number, ReturnType<typeof setTimeout>>();
  let next = 1;
  window.requestAnimationFrame = (cb: FrameRequestCallback) => {
    const id = next++;
    ids.set(id, setTimeout(() => { ids.delete(id); cb(performance.now()); }, 16));
    return id;
  };
  window.cancelAnimationFrame = (id: number) => { const t = ids.get(id); if (t !== undefined) clearTimeout(t); ids.delete(id); };
}
const ac = (qs.get('ac') ?? 'f15c') as AircraftId;
const app = new AppStore();
app.setAircraft(ac);
document.documentElement.dataset.cockpit = app.spec.cockpit;
const outlet = document.getElementById('outlet') as HTMLElement;
const results: string[] = [];
let pass = 0, total = 0;
const T0 = performance.now();
const check = (name: string, ok: boolean, info = '') => { total++; if (ok) pass++; else results.push(`FAIL ${name} ${info}`); if (qs.get('trace')) console.log(`step ${total} ${name} ${ok} @${Math.round(performance.now() - T0)}ms`); };
/** Wait on animation frames (headless virtual time skips straight to timers without drawing frames). */
const wait = (ms: number) => new Promise<void>(r => {
  let n = Math.max(2, Math.round(ms / 16));
  const f = () => (--n <= 0 ? r() : requestAnimationFrame(f));
  requestAnimationFrame(f);
});
const $ = <T extends Element = HTMLElement>(sel: string) => outlet.querySelector<T>(sel);
const key = (code: string, mods: { alt?: 'L' | 'R'; ctrl?: 'L' | 'R'; shift?: 'L' | 'R' } = {}, type: 'keydown' | 'keyup' = 'keydown') => {
  const modCodes: string[] = [];
  if (mods.alt) modCodes.push(mods.alt === 'R' ? 'AltRight' : 'AltLeft');
  if (mods.ctrl) modCodes.push(mods.ctrl === 'R' ? 'ControlRight' : 'ControlLeft');
  if (mods.shift) modCodes.push(mods.shift === 'R' ? 'ShiftRight' : 'ShiftLeft');
  const init = { code, bubbles: true, cancelable: true, altKey: !!mods.alt, ctrlKey: !!mods.ctrl, shiftKey: !!mods.shift };
  if (type === 'keydown') for (const m of modCodes) window.dispatchEvent(new KeyboardEvent('keydown', { ...init, code: m }));
  window.dispatchEvent(new KeyboardEvent(type, init));
  if (type === 'keydown') {
    window.dispatchEvent(new KeyboardEvent('keyup', init));
    for (const m of modCodes) window.dispatchEvent(new KeyboardEvent('keyup', { code: m, bubbles: true }));
  }
};
const cm = () => $('#sortie-own [data-id="cm"] .ui-readout__num')?.textContent ?? '';

async function run(): Promise<void> {
  const page = factory();
  await page.mount({ root: outlet, app, params: new URLSearchParams('range=60'), navigate: () => {} });
  check('brief shows', !!$('#sortie-brief'));
  check('fly button', !!$('#sortie-go'));
  ($('#sortie-scen-1v2') as HTMLButtonElement | null)?.click();
  check('scenario 1v2 selected', $('#sortie-scen-1v2')?.getAttribute('aria-checked') === 'true');
  ($('#sortie-go') as HTMLButtonElement | null)?.click();
  await wait(400);
  check('fly screen shows', !!$('#sortie-fly'), outlet.textContent?.slice(0, 80));
  const clk0 = $('.sortie-clock')?.textContent;
  await wait(1000);
  check('sim clock runs', clk0 !== $('.sortie-clock')?.textContent, `${clk0} -> ${$('.sortie-clock')?.textContent}`);
  check('two bandits in the meta', /2× /.test($('.ui-pagehead__meta')?.textContent ?? ''));
  check('canvas count (3D + radar + rwr + timeline)', outlet.querySelectorAll('canvas').length >= 4, String(outlet.querySelectorAll('canvas').length));

  // RWS -> TWS with the jet's own key (F-15C / Flankers: RAlt + I).
  if (app.spec.radar.tws && ['fc3'].includes(app.spec.module)) {
    key('KeyI', { alt: 'R' });
    await wait(300);
    check('RAlt+I goes TWS', $('#sortie-mode-tws')?.getAttribute('aria-checked') === 'true');
    key('KeyI', { alt: 'R' });
    await wait(300);
    check('RAlt+I back to RWS', $('#sortie-mode-rws')?.getAttribute('aria-checked') === 'true');
  }
  // F-16: TMS Right held 1 s toggles TWS (a tap steps the bug).
  if (ac === 'f16c') {
    const init = { code: 'ArrowRight', bubbles: true, cancelable: true, ctrlKey: true };
    window.dispatchEvent(new KeyboardEvent('keydown', { ...init, code: 'ControlRight' }));
    window.dispatchEvent(new KeyboardEvent('keydown', init));
    await wait(300);
    check('TMS Right tap does not toggle yet', $('#sortie-mode-rws')?.getAttribute('aria-checked') === 'true');
    await wait(1100);
    window.dispatchEvent(new KeyboardEvent('keyup', init));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ControlRight', bubbles: true }));
    await wait(300);
    check('TMS Right held 1 s goes TWS', $('#sortie-mode-tws')?.getAttribute('aria-checked') === 'true');
  }
  // Designate through the UI once contacts are on the scope, then fire if the cue lights.
  if (app.spec.radar.tws) { key('KeyI', { alt: 'R' }); ($('#sortie-mode-tws') as HTMLButtonElement | null)?.click(); }
  ($('#sortie-time-8') as HTMLButtonElement | null)?.click();
  const logText = () => $('#sortie-log')?.textContent ?? '';
  let designated = false;
  for (let i = 0; i < 30 && !designated; i++) {
    await wait(400);
    const des = [...outlet.querySelectorAll<HTMLButtonElement>('.ui-btn')].find(b => /designate/i.test(b.textContent ?? ''));
    des?.click();
    await wait(100);
    designated = /designated|Locked/.test(logText());
    if (!designated && i === 29) console.log('designate log:', logText().slice(0, 200));
  }
  check('designate button designates or locks', designated);
  for (let i = 0; i < 15 && !$('#sortie-fire[data-lit]'); i++) await wait(300);
  if ($('#sortie-fire[data-lit]')) {
    ($('#sortie-fire') as HTMLButtonElement | null)?.click();
    await wait(200);
    check('fire on the cue launches', /Fox \d: M1/.test(logText()), logText().slice(0, 120));
  } else console.log('shoot cue did not light for', ac, ':', $('.sortie-why')?.textContent);
  ($('#sortie-time-2') as HTMLButtonElement | null)?.click();
  // Chaff by click and by key.
  await wait(300);
  const c0 = cm();
  ($('.ui-console .ui-btn[title*="haff"], .ui-console .ui-btn') as HTMLElement | null);
  const chaffBtn = [...outlet.querySelectorAll<HTMLButtonElement>('.ui-btn')].find(b => /^chaff/i.test(b.textContent ?? ''));
  chaffBtn?.click();
  await wait(400);
  const c1 = cm();
  check('chaff click spends a bundle', c0 !== c1 && c1 !== '', `${c0} -> ${c1}`);
  if (app.spec.module === 'fc3') {
    key('Insert');
    await wait(400);
    check('Insert spends a bundle', cm() !== c1, `${c1} -> ${cm()}`);
  }
  // Pause with P, time scale with LCtrl + Z.
  key('KeyP');
  await wait(100);
  check('P pauses', $('#sortie-pause')?.getAttribute('aria-pressed') === 'true');
  key('KeyP');
  key('KeyZ', { ctrl: 'L' });
  await wait(100);
  check('LCtrl+Z speeds up to 4x', $('#sortie-time-4')?.getAttribute('aria-checked') === 'true');
  // Steering: a held Left arrow changes the commanded heading.
  const cmd0 = $('.sortie-cmd')?.textContent ?? '';
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft', bubbles: true, cancelable: true }));
  await wait(600);
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowLeft', bubbles: true, cancelable: true }));
  await wait(300);
  check('Left arrow turns', ($('.sortie-cmd')?.textContent ?? '') !== cmd0, `${cmd0} | ${$('.sortie-cmd')?.textContent}`);
  // Aid toggles.
  ($('#sortie-aid-notch') as HTMLButtonElement | null)?.click();
  await wait(200);
  check('Notch aid latches', $('#sortie-aid-notch')?.getAttribute('aria-pressed') === 'true');
  // Key help opens.
  const det = outlet.querySelector('details.sortie-keys') as HTMLDetailsElement | null;
  if (det) det.open = true;
  check('key help lists launch', /Launch/.test(det?.textContent ?? ''));
  // End -> debrief.
  const endBtn = [...outlet.querySelectorAll<HTMLButtonElement>('.ui-btn')].find(b => /end sortie/i.test(b.textContent ?? ''));
  endBtn?.click();
  await wait(500);
  check('debrief shows', !!$('#sortie-debrief'));
  check('fly screen gone', !$('#sortie-fly'));
  check('coach tab', !!$('#sortie-dtabs-tab-coach'));
  const play = [...outlet.querySelectorAll<HTMLButtonElement>('.sortie-tl__bar .ui-btn')][0];
  const l0 = play?.textContent ?? '';
  key('Space');
  await wait(100);
  check('Space toggles replay', (play?.textContent ?? '') !== l0, `${l0} -> ${play?.textContent}`);
  // Fly again -> fly screen, then unmount cleans everything.
  const again = [...outlet.querySelectorAll<HTMLButtonElement>('.ui-btn')].find(b => /fly again/i.test(b.textContent ?? ''));
  again?.click();
  await wait(400);
  check('fly again', !!$('#sortie-fly'));
  page.unmount();
  await wait(100);
  check('unmount empties the outlet', outlet.children.length === 0, String(outlet.children.length));
  check('no canvases left', document.querySelectorAll('canvas').length === 0, String(document.querySelectorAll('canvas').length));
  const before = document.body.innerHTML.length;
  key('KeyP');
  await wait(50);
  check('keys unbound after unmount', document.body.innerHTML.length === before);
  // Mount / fly / unmount a few more times: nothing may pile up (canvases, key handlers, loops).
  for (let i = 0; i < 3; i++) {
    const p2 = factory();
    await p2.mount({ root: outlet, app, params: new URLSearchParams(i === 1 ? 'shot=fly&t=20' : ''), navigate: () => {} });
    if (i !== 1) { ($('#sortie-go') as HTMLButtonElement | null)?.click(); }
    await wait(300);
    check(`cycle ${i}: fly screen`, !!$('#sortie-fly'));
    p2.unmount();
    await wait(60);
    check(`cycle ${i}: clean`, outlet.children.length === 0 && document.querySelectorAll('canvas').length === 0, `${outlet.children.length} / ${document.querySelectorAll('canvas').length}`);
  }
  const html = document.body.innerHTML.length;
  key('KeyP'); key('Enter');
  await wait(50);
  check('no stale key handlers after cycles', document.body.innerHTML.length === html && outlet.children.length === 0);
  for (const r of results) console.log(r);
  console.log(pass === total ? `SORTIE SELFTEST PASS ${pass}/${total} (${ac})` : `SORTIE SELFTEST ${pass}/${total} (${ac})`);
}
run().catch(e => console.error('SORTIE SELFTEST ERROR', e));
