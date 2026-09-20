/** [OWNER: page-radar-lab] Behaviour checks for the Radar Lab: keys, clicks, exercise switching, clean unmount. */
import '../src/styles/tokens.css';
import '../src/styles/base.css';
import '../src/styles/components.css';
import { AppStore } from '../src/app/store';
import type { AircraftId } from '../src/data/types';
import factory from '../src/pages/radar-lab/index';

const q = new URLSearchParams(location.search);
const results: string[] = [];
const check = (name: string, ok: boolean, extra = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' (' + extra + ')' : ''}`); };
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const key = (code: string, mods: { shift?: boolean; ctrl?: boolean; alt?: boolean; side?: 'L' | 'R' } = {}) => {
  const side = mods.side ?? 'R';
  const modCodes: string[] = [];
  if (mods.shift) modCodes.push('Shift' + (side === 'R' ? 'Right' : 'Left'));
  if (mods.ctrl) modCodes.push('Control' + (side === 'R' ? 'Right' : 'Left'));
  if (mods.alt) modCodes.push('Alt' + (side === 'R' ? 'Right' : 'Left'));
  const base = { shiftKey: !!mods.shift, ctrlKey: !!mods.ctrl, altKey: !!mods.alt, metaKey: false, bubbles: true };
  for (const c of modCodes) window.dispatchEvent(new KeyboardEvent('keydown', { ...base, code: c }));
  window.dispatchEvent(new KeyboardEvent('keydown', { ...base, code }));
  window.dispatchEvent(new KeyboardEvent('keyup', { ...base, code }));
  for (const c of modCodes) window.dispatchEvent(new KeyboardEvent('keyup', { ...base, code: c, shiftKey: false, ctrlKey: false, altKey: false }));
};
const val = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.value ?? '';
const checked = (id: string) => document.getElementById(id)?.getAttribute('aria-checked') === 'true';

async function run(): Promise<void> {
  const ac = (q.get('ac') ?? 'f15c') as AircraftId;
  const app = new AppStore();
  app.setAircraft(ac);
  const root = document.getElementById('app') as HTMLElement;
  root.style.cssText = 'display:flex;flex-direction:column;min-height:100vh';
  const outlet = document.createElement('main');
  outlet.className = 'outlet';
  root.append(outlet);
  const mountOnce = () => { const p = factory(); p.mount({ root: outlet, app, params: new URLSearchParams(), navigate: () => {} }); return p; };

  let page = mountOnce();
  await wait(400);
  const spec = app.spec;
  const el0 = Number(val('rl-el'));
  if (spec.display === 'ru-hud') { key('Semicolon', { shift: true }); key('Semicolon', { shift: true }); }
  else if (ac === 'fa18c' || ac === 'f16c') { key('Equal'); key('Equal'); }
  else { key('Semicolon', { shift: true }); key('Semicolon', { shift: true }); }
  await wait(100);
  const el1 = Number(val('rl-el'));
  check('antenna up key raises elevation', el1 > el0, `${el0} -> ${el1}`);

  const cur0 = Number(val('rl-cursor'));
  key('Semicolon'); key('Semicolon'); key('Semicolon');
  await wait(100);
  check('cursor key moves the cursor out', Number(val('rl-cursor')) > cur0, `${cur0} -> ${val('rl-cursor')}`);

  if (spec.radar.tws) {
    const k = ac === 'f16c' ? null : 'KeyI';
    if (k) { key(k, { alt: true }); await wait(100); check('RAlt+I toggles TWS', checked('rl-mode-tws')); key(k, { alt: true }); await wait(100); check('RAlt+I back to search', checked('rl-mode-rws')); }
  }
  if (spec.radar.azHalfWidthOptionsDeg.length > 1 && spec.display !== 'ru-hud') {
    (document.getElementById('rl-width-' + Math.min(...spec.radar.azHalfWidthOptionsDeg.filter(a => !(ac === 'f16c' && a === 25)))) as HTMLButtonElement).click();
    await wait(100);
    check('width click narrows the scan', document.getElementById('rl-width-' + Math.min(...spec.radar.azHalfWidthOptionsDeg.filter(a => !(ac === 'f16c' && a === 25))))?.getAttribute('aria-checked') === 'true');
  }
  if (spec.display === 'ru-hud') {
    key('Slash', { shift: true });
    await wait(100);
    check('RShift+/ moves the scan zone right', checked('rl-zone-30'));
  }
  (document.getElementById('rl-ex-low') as HTMLButtonElement).click();
  await wait(200);
  check('exercise 1 selected', checked('rl-ex-low') && /GCI/.test(document.getElementById('rl-coach')?.textContent ?? ''));
  (document.getElementById('rl-ex-notch') as HTMLButtonElement).click();
  await wait(200);
  check('notch buttons shown for exercise 3', !(document.querySelector('.rl-notchrow') as HTMLElement).hidden);
  const beam = document.getElementById('rl-beam') as HTMLButtonElement;
  check('Beam waits for the first paint', beam.disabled && /first paint/.test(beam.title), beam.title);
  key('Pause');
  await wait(50);
  check('Pause key pauses', checked('rl-time-0'));
  key('KeyZ', { shift: true, side: 'L' });
  await wait(50);
  check('LShift+Z back to 1x', checked('rl-time-1'));
  (document.getElementById('rl-why-next') as HTMLButtonElement).click();
  await wait(200);
  check('Next target fills the Why panel', !(document.querySelector('.rl-why__body') as HTMLElement).hidden);

  // Clean unmount, several cycles: no canvases, no page nodes left, keys inert.
  for (let i = 0; i < 4; i++) { page.unmount(); page = mountOnce(); await wait(150); }
  page.unmount();
  await wait(100);
  check('unmount removes every node', outlet.childElementCount === 0, String(outlet.childElementCount));
  check('no canvases left', document.querySelectorAll('canvas').length === 0, String(document.querySelectorAll('canvas').length));
  key('Pause');
  check('keys inert after unmount', !document.getElementById('rl-time-0'));

  for (const r of results) console.log('RADARLAB ' + r);
  console.log(`RADARLAB ${results.every(r => r.startsWith('PASS')) ? 'ALL PASS' : 'SOME FAILED'} ${results.filter(r => r.startsWith('PASS')).length}/${results.length}`);
}
run().catch(e => console.error('RADARLAB ERROR', e));
