/**
 * In-browser checks of the UI kit's DOM behaviour (roving focus, aria states, focus trap, Escape,
 * key filtering). Run: scripts/shot.sh '/sandbox/ui.html?selftest=1' .shots/ui-selftest.png
 * Results print as console errors (captured by shot.sh): "SELFTEST PASS n/n" or each failure.
 */
import { h } from '../src/ui/dom';
import { segmented, tabs, toggle, slider, chips, button } from '../src/ui/controls';
import { modal, eventLog, checklist, toast, coachBox, readouts } from '../src/ui/panels';
import { bindKeys } from '../src/ui/keys';
import { docLayout } from '../src/ui/layout';

export async function runSelfTest(): Promise<void> {
  const results: [string, boolean][] = [];
  const ok = (name: string, cond: boolean) => results.push([name, cond]);
  const box = h('div', { style: 'position:absolute;left:-9999px;top:0;width:800px' });
  document.body.append(box);
  const kd = (target: EventTarget, code: string, init: KeyboardEventInit = {}) => {
    const key = code.startsWith('Key') ? code.slice(3).toLowerCase() : code === 'Enter' ? 'Enter' : code === 'Escape' ? 'Escape' : code === 'Tab' ? 'Tab' : code;
    const e = new KeyboardEvent('keydown', { code, key, bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(e);
    return e;
  };
  const ku = (target: EventTarget, code: string, init: KeyboardEventInit = {}) => target.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true, cancelable: true, ...init }));

  // segmented: arrows move selection, skip disabled, wrap
  let changed: string | null = null;
  const seg = segmented<string>({ id: 'st-seg', ariaLabel: 'Mode', value: 'a', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B', disabled: true }, { value: 'c', label: 'C' }], onChange: v => { changed = v; } });
  box.append(seg.el);
  const radios = [...seg.group.querySelectorAll<HTMLButtonElement>('[role=radio]')];
  radios[0].focus();
  radios[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
  ok('segmented ArrowRight skips disabled', seg.value === 'c' && changed === 'c' && document.activeElement === radios[2]);
  ok('segmented aria-checked + roving tabindex', radios[2].getAttribute('aria-checked') === 'true' && radios[2].tabIndex === 0 && radios[0].tabIndex === -1);
  radios[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
  ok('segmented wraps', seg.value === 'a');
  changed = null; seg.set('c');
  ok('segmented set() does not emit', changed === null && seg.value === 'c');

  // tabs
  const tb = tabs({ id: 'st-tabs', tabs: [{ id: 'x', label: 'X', content: 'x' }, { id: 'y', label: 'Y', content: 'y' }] });
  box.append(tb.el);
  const tabBtns = [...tb.list.querySelectorAll<HTMLButtonElement>('[role=tab]')];
  tabBtns[0].focus();
  tabBtns[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
  ok('tabs ArrowRight selects next', tb.value === 'y' && tb.panels.x.hidden && !tb.panels.y.hidden && tabBtns[1].getAttribute('aria-selected') === 'true');

  // toggles
  let tv: boolean | null = null;
  const tg = toggle({ id: 'st-tg', label: 'ECM', onChange: v => { tv = v; } });
  const sw = toggle({ id: 'st-sw', label: 'Audio', style: 'switch' });
  box.append(tg.el, sw.el);
  tg.el.click(); sw.el.click();
  ok('lamp toggle aria-pressed', tg.el.getAttribute('aria-pressed') === 'true' && tv === true);
  ok('switch aria-checked + state text', sw.el.getAttribute('aria-checked') === 'true' && sw.el.textContent?.includes('ON') === true);

  // slider
  const sl = slider({ id: 'st-sl', label: 'Range', min: 10, max: 160, step: 10, value: 80, unit: 'km' });
  box.append(sl.el);
  sl.set(120);
  ok('slider readout + aria-valuetext', sl.el.querySelector('output')?.textContent === '120km' && sl.input.getAttribute('aria-valuetext') === '120 km');

  // chips
  const ch = chips({ id: 'st-ch', ariaLabel: 'Layers', value: ['a'], options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] });
  box.append(ch.el);
  (ch.el.querySelector('#st-ch-b') as HTMLButtonElement).click();
  ok('chips toggle', ch.has('b') && ch.value.join() === 'a,b');

  // event log cap, checklist, readouts, coach
  const lg = eventLog({ max: 5 });
  for (let i = 0; i < 9; i++) lg.push('e' + i, { t: i });
  ok('event log capped, newest first', lg.size === 5 && lg.el.querySelector('.ui-log__msg')?.textContent === 'e8');
  const cl = checklist({ steps: [{ id: 's1', text: 'one' }, { id: 's2', text: 'two' }] });
  cl.setDone('s1'); cl.setCurrent('s2');
  ok('checklist done + current', cl.isDone('s1') && cl.doneCount === 1 && cl.el.children[1].getAttribute('aria-current') === 'step');
  const ro = readouts({ rows: [{ id: 'r', label: 'R', value: '1' }] });
  ro.set('r', '42', 'km'); ro.setTone('r', 'caution');
  ok('readouts set + tone', ro.row('r')?.textContent?.includes('42km') === true && ro.row('r')?.dataset.tone === 'caution');
  const co = coachBox({ text: 'a' });
  co.set('b', 'why');
  ok('coach updates', co.el.textContent?.includes('b') === true && co.el.getAttribute('aria-live') === 'polite');

  // modal: focus in, trap, Escape, focus return; bindKeys ignored inside modal
  const opener = button({ id: 'st-open', label: 'Open' });
  box.append(opener.el);
  opener.el.focus();
  let closed = 0;
  const md = modal({ id: 'st-modal', title: 'T', body: 'b', actions: [{ label: 'One' }, { label: 'Two', primary: true }], onClose: () => closed++ });
  let fired = 0;
  const unbind = bindKeys({ 'Enter': () => fired++, 'RAlt+I': () => fired++ });
  md.open();
  const btns = [...md.dialog.querySelectorAll<HTMLButtonElement>('button')];
  ok('modal focuses primary action', document.activeElement === btns[btns.length - 1]);
  kd(document.activeElement ?? window, 'Tab');
  ok('modal Tab wraps to first', document.activeElement === btns[0]);
  kd(document.activeElement ?? window, 'Tab', { shiftKey: true });
  ok('modal Shift+Tab wraps to last', document.activeElement === btns[btns.length - 1]);
  kd(document.activeElement ?? window, 'KeyI', { altKey: true });
  ok('bindKeys ignores keys inside a modal', fired === 0);
  kd(document.activeElement ?? window, 'Escape');
  ok('modal Escape closes and restores focus', !md.isOpen && closed === 1 && document.activeElement === opener.el);
  md.destroy();

  // bindKeys: text fields ignored; window chords fire
  const input = h('input', { type: 'text' });
  box.append(input);
  input.focus();
  kd(input, 'KeyI', { altKey: true });
  ok('bindKeys ignores text fields', fired === 0);
  input.blur();
  kd(document.body, 'AltRight', { altKey: true });
  const e = kd(document.body, 'KeyI', { altKey: true });
  ku(document.body, 'KeyI', { altKey: true }); ku(document.body, 'AltRight');
  ok('bindKeys fires RAlt+I and prevents default', fired === 1 && e.defaultPrevented);
  const b2 = button({ id: 'st-b2', label: 'B2' });
  box.append(b2.el);
  b2.el.focus();
  kd(b2.el, 'Enter');
  ok('Enter on a keyboard-focused button stays with the button', fired === 1);
  b2.el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  b2.el.focus();
  const en = kd(b2.el, 'Enter');
  ok('Enter on a clicked button goes to the binding', fired === 2 && en.defaultPrevented);
  unbind();
  kd(document.body, 'KeyI', { altKey: true });
  ok('unbind removes listeners', fired === 2);

  // doc layout contents
  const doc = docLayout({ title: 'D', tocHeader: h('input', { type: 'search', id: 'st-filter' }), sections: [{ id: 'st-a', title: 'A', content: 'a' }, { id: 'st-b', title: 'B', content: 'b' }] });
  ok('doc tocHeader + links map', !!doc.toc?.querySelector('.ui-doc__toc-header #st-filter') && doc.links.get('st-b')?.textContent === 'B' && doc.links.size === 2);
  box.append(doc.el);
  doc.go('st-b');
  ok('doc go() marks current', doc.toc?.querySelectorAll('[aria-current="true"]').length === 1 && doc.toc?.querySelector('[aria-current="true"]')?.textContent === 'B');
  doc.destroy();

  // toast stack removed after dismiss
  const dismiss = toast('x', { ms: 0 });
  const had = !!document.querySelector('.ui-toasts');
  dismiss();
  ok('toast stack created and removed', had && !document.querySelector('.ui-toasts'));

  // segmented setOption: in place, no rebuild, focus kept
  const seg2 = segmented<string>({ id: 'st-seg2', ariaLabel: 'Bars', value: 'b1', options: [{ value: 'b1', label: '1' }, { value: 'b2', label: '2', sub: '2.0 s' }] });
  box.append(seg2.el);
  const s2 = [...seg2.group.querySelectorAll<HTMLButtonElement>('[role=radio]')];
  s2[1].focus();
  seg2.setOption('b2', { sub: '4.1 s', title: 'Frame time 4.1 s' });
  const s2b = [...seg2.group.querySelectorAll<HTMLButtonElement>('[role=radio]')];
  ok('segmented setOption updates in place and keeps focus', s2b[1] === s2[1] && document.activeElement === s2[1] &&
    s2[1].textContent === '24.1 s' && s2[1].title === 'Frame time 4.1 s');
  seg2.setOption('b2', { disabled: true });
  ok('segmented setOption disables', s2[1].disabled && seg2.value === 'b1');
  seg2.setOption('b2', { disabled: false });
  s2[1].focus();
  seg2.setOptions([{ value: 'b1', label: '1' }, { value: 'b2', label: '2' }, { value: 'b4', label: '4' }]);
  const s2c = [...seg2.group.querySelectorAll<HTMLButtonElement>('[role=radio]')];
  ok('segmented setOptions keeps focus on the same value', s2c.length === 3 && document.activeElement === s2c[1]);

  // slider setMarks
  const sm = slider({ id: 'st-sm', label: 'Launch range', min: 0, max: 100, value: 40, marks: [50] });
  box.append(sm.el);
  sm.setMarks([{ value: 10, label: 'RMIN' }, { value: 60, label: 'RNE' }, { value: 90, label: 'RMAX' }, { value: 140, label: 'X' }]);
  const marks = [...sm.el.querySelectorAll<HTMLElement>('.ui-slider__mark')];
  ok('slider setMarks replaces marks and drops out-of-range ones', marks.length === 3 && marks[2].textContent === 'RMAX' && marks[1].style.getPropertyValue('--p') === '60');

  // coach setTitle
  const cb = coachBox({ text: 'x' });
  box.append(cb.el);
  cb.setTitle('A · MISS · OUT OF ENERGY');
  ok('coach setTitle', cb.el.querySelector('.ui-coach__title')?.textContent === 'A · MISS · OUT OF ENERGY');

  // hidden wins over component display rules; lit primary keeps a readable legend
  const hb = button({ label: 'Hidden' });
  const pb = button({ label: 'Fire', variant: 'primary' });
  box.append(hb.el, pb.el);
  hb.el.hidden = true;
  pb.setLit(true);
  const pcs = getComputedStyle(pb.el);
  ok('hidden .ui-btn is not displayed', getComputedStyle(hb.el).display === 'none');
  ok('lit primary legend differs from its cap', pcs.color !== pcs.backgroundColor);

  box.remove();
  const fails = results.filter(r => !r[1]);
  for (const [n] of fails) console.error('SELFTEST FAIL ' + n);
  console.error(`SELFTEST ${fails.length ? 'FAILED' : 'PASS'} ${results.length - fails.length}/${results.length}`);
}
