/**
 * page-tws harness: mount the TWS page for several jets, press the jet's DCS keys, click, unmount, and check that
 * nothing leaks (window / document listeners). Results print as console.error lines for scripts/shot.sh.
 */
import '../src/styles/tokens.css';
import '../src/styles/base.css';
import '../src/styles/components.css';
import { AppStore } from '../src/app/store';
import { AIRCRAFT } from '../src/data/aircraft';
import type { FighterId } from '../src/data/types';
import factory from '../src/pages/tws/index';
import { resolveBinds } from '../src/pages/tws/binds';
import { parseChord, splitAlternatives } from '../src/ui/keys';

const results: [string, boolean, string?][] = [];
const ok = (name: string, cond: boolean, info = '') => results.push([name, cond, info]);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Count window/document listeners added and removed while the page lives.
const live = new Map<string, number>();
for (const target of [window, document] as EventTarget[]) {
  const add = target.addEventListener.bind(target), rem = target.removeEventListener.bind(target);
  const tag = target === window ? 'window' : 'document';
  target.addEventListener = (type: string, fn: EventListenerOrEventListenerObject | null, o?: boolean | AddEventListenerOptions) => {
    live.set(`${tag}:${type}`, (live.get(`${tag}:${type}`) ?? 0) + 1); add(type, fn, o);
  };
  target.removeEventListener = (type: string, fn: EventListenerOrEventListenerObject | null, o?: boolean | EventListenerOptions) => {
    live.set(`${tag}:${type}`, (live.get(`${tag}:${type}`) ?? 0) - 1); rem(type, fn, o);
  };
}

/** Press a DCS chord string ('RAlt + I') with the right modifier keys held. */
function press(chord: string, holdMs = 0): Promise<void> {
  const c = parseChord(splitAlternatives(chord)[0].trim());
  if (!c) throw new Error('bad chord ' + chord);
  const mods: [string, 'altKey' | 'ctrlKey' | 'shiftKey'][] = [];
  if (c.alt) mods.push([c.alt === 'L' ? 'AltLeft' : 'AltRight', 'altKey']);
  if (c.ctrl) mods.push([c.ctrl === 'L' ? 'ControlLeft' : 'ControlRight', 'ctrlKey']);
  if (c.shift) mods.push([c.shift === 'L' ? 'ShiftLeft' : 'ShiftRight', 'shiftKey']);
  const flags = { altKey: !!c.alt, ctrlKey: !!c.ctrl, shiftKey: !!c.shift };
  for (const [code] of mods) window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, ...flags }));
  window.dispatchEvent(new KeyboardEvent('keydown', { code: c.codes[0], bubbles: true, cancelable: true, ...flags }));
  const up = () => {
    window.dispatchEvent(new KeyboardEvent('keyup', { code: c.codes[0], bubbles: true, cancelable: true, ...flags }));
    for (const [code] of mods) window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true, cancelable: true }));
  };
  if (!holdMs) { up(); return Promise.resolve(); }
  return sleep(holdMs).then(up);
}

const modeChecked = (root: HTMLElement, v: string) => root.querySelector(`#tws-mode-${v}`)?.getAttribute('aria-checked') === 'true';
const coachText = (root: HTMLElement) => root.querySelector('#tws-coach .ui-coach__text')?.textContent ?? '';

async function run(): Promise<void> {
  const app = new AppStore();
  const root = document.getElementById('app') as HTMLElement;
  root.style.cssText = 'display:flex;flex-direction:column;height:900px';
  const jets: FighterId[] = ['su27', 'f15c', 'fa18c', 'f16c', 'mig29s', 'm2000c'];
  for (const ac of jets) {
    app.setAircraft(ac);
    document.documentElement.dataset.cockpit = AIRCRAFT[ac].cockpit;
    const before = new Map(live);
    const page = factory();
    page.mount({ root, app, params: new URLSearchParams(), navigate: () => {} });
    await sleep(200);
    ok(`${ac}: mounted`, !!root.querySelector('#tws-lab') && root.querySelectorAll('.tws-card').length === 4);
    ok(`${ac}: starts in RWS`, modeChecked(root, 'rws'));
    const b = resolveBinds(ac);
    const mode = b.acts.mode;
    if (mode?.keys) {
      await press(mode.keys, mode.holdS ? mode.holdS * 1000 + 250 : 0);
      await sleep(250);
      ok(`${ac}: ${mode.keys}${mode.holdS ? ' (held)' : ''} enters TWS`, modeChecked(root, 'tws'), coachText(root));
    } else if (AIRCRAFT[ac].radar.tws) {
      (root.querySelector('#tws-mode-tws') as HTMLButtonElement | null)?.click();
      await sleep(200);
      ok(`${ac}: TWS by click (${mode?.name ?? 'no key'})`, modeChecked(root, 'tws'));
    } else {
      const btn = root.querySelector('#tws-mode-tws') as HTMLButtonElement | null;
      ok(`${ac}: TWS shown but disabled`, !!btn && btn.disabled && /No TWS/.test(btn.title));
    }
    if (ac === 'mig29s' && mode?.keys) {
      await press(mode.keys); await sleep(200);
      ok('mig29s: second RAlt + I = СНП2', modeChecked(root, 'snp2'));
    }
    // Fire with nothing designated: refused with a reason in the coach.
    const fire = b.acts.fire;
    if (fire?.keys) {
      await press(fire.keys, fire.holdS ? fire.holdS * 1000 + 200 : 0);
      await sleep(200);
      const fireBtn = [...root.querySelectorAll<HTMLButtonElement>('.tws-firerow .ui-btn')][0];
      ok(`${ac}: Fire refused without a target`, !!fireBtn?.disabled, coachText(root));
    }
    // Clicking a card's Notch toggle makes that bandit beam you (log line).
    (root.querySelector('#tws-notch-bandit2') as HTMLButtonElement | null)?.click();
    await sleep(300);
    ok(`${ac}: Notch toggle`, root.querySelector('#tws-notch-bandit2')?.getAttribute('aria-pressed') === 'true'
      && /beam/i.test(root.querySelector('#tws-log')?.textContent ?? ''));
    // Speed 4× and reset.
    (root.querySelector('#tws-speed-4') as HTMLButtonElement | null)?.click();
    await sleep(300);
    const t1 = root.querySelector('.tws-clock__t')?.textContent ?? '';
    [...root.querySelectorAll<HTMLButtonElement>('.tws-clock .ui-btn')].find(x => /reset/i.test(x.textContent ?? ''))?.click();
    await sleep(150);
    ok(`${ac}: reset puts the clock back`, (root.querySelector('.tws-clock__t')?.textContent ?? '') <= t1 && modeChecked(root, 'rws'));
    page.unmount();
    root.replaceChildren();
    await sleep(50);
    // Only listeners still attached count (OrbitControls also calls removeEventListener for ones it never added).
    const leaks = [...live].filter(([k, n]) => n > (before.get(k) ?? 0)).map(([k, n]) => `${k}:+${n - (before.get(k) ?? 0)}`);
    ok(`${ac}: unmount leaves no window/document listeners`, leaks.length === 0, leaks.join(' '));
    ok(`${ac}: unmount removes the WebGL canvas`, !document.querySelector('.r3-stage'));
  }
  const pass = results.filter(r => r[1]).length;
  for (const [name, good, info] of results) if (!good) console.error(`TWS FAIL ${name}${info ? ' :: ' + info : ''}`);
  console.error(`TWS ${pass === results.length ? 'PASS' : 'DONE'} ${pass}/${results.length}`);
}

run().catch(e => console.error('TWS harness crashed', e));
