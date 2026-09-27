import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { radioLineState, radioLog } from './radioLog';

// ---- minimal DOM (tests run in node) ------------------------------------------------------------

class FakeText { nodeType = 3; parentElement: FakeEl | null = null; constructor(public data: string) {} get textContent() { return this.data; } remove() { this.parentElement?.detach(this); } }
class FakeEl {
  nodeType = 1; namespaceURI = 'http://www.w3.org/1999/xhtml'; tagName: string;
  childNodes: (FakeEl | FakeText)[] = []; parentElement: FakeEl | null = null;
  attrs = new Map<string, string>(); dataset: Record<string, string> = {}; style: Record<string, string> = {};
  hidden = false; className = '';
  constructor(tag: string) { this.tagName = tag.toUpperCase(); }
  get children() { return this.childNodes.filter((c): c is FakeEl => c instanceof FakeEl); }
  get lastElementChild() { const c = this.children; return c[c.length - 1] ?? null; }
  get classList() {
    const set = () => new Set(this.className.split(/\s+/).filter(Boolean));
    return {
      contains: (c: string) => set().has(c),
      toggle: (c: string, on?: boolean) => { const s = set(); const v = on ?? !s.has(c); if (v) s.add(c); else s.delete(c); this.className = [...s].join(' '); return v; },
    };
  }
  get textContent(): string { return this.childNodes.map(c => c.textContent).join(''); }
  setAttribute(k: string, v: string) { this.attrs.set(k, String(v)); }
  getAttribute(k: string) { return this.attrs.get(k) ?? null; }
  addEventListener() {}
  appendChild(c: FakeEl | FakeText) { c.parentElement?.detach(c); c.parentElement = this; this.childNodes.push(c); return c; }
  prepend(c: FakeEl | FakeText) { c.parentElement?.detach(c); c.parentElement = this; this.childNodes.unshift(c); }
  replaceChildren(...cs: (FakeEl | FakeText)[]) { for (const c of this.childNodes) c.parentElement = null; this.childNodes = []; for (const c of cs) this.appendChild(c); }
  detach(c: FakeEl | FakeText) { this.childNodes = this.childNodes.filter(x => x !== c); c.parentElement = null; }
  remove() { this.parentElement?.detach(this); }
}

beforeEach(() => {
  vi.stubGlobal('document', { createElement: (t: string) => new FakeEl(t), createTextNode: (s: string) => new FakeText(s) });
});
afterEach(() => vi.unstubAllGlobals());

const lines = (el: HTMLElement) => (el as unknown as FakeEl).children.map(c => c.textContent);

describe('radioLineState', () => {
  it('is on, then fades in the last second, then gone; a clock rewind removes it', () => {
    expect(radioLineState(0, 8)).toBe('on');
    expect(radioLineState(6.9, 8)).toBe('on');
    expect(radioLineState(7.2, 8)).toBe('fading');
    expect(radioLineState(8, 8)).toBe('gone');
    expect(radioLineState(-1, 8)).toBe('gone');
  });
});

describe('radioLog', () => {
  it('shows at most `max` subtitles, newest last, and keeps the full transcript newest first', () => {
    const log = radioLog({ id: 'subs', max: 2, ttlS: 8 });
    expect(log.el.hidden).toBe(true);
    log.push({ from: 'You', text: 'Check-in', t: 1 });
    log.push({ from: 'Axeman 11', text: 'Type 3 in effect', t: 2, unverified: true });
    log.push({ from: 'You', text: 'Ready to copy', t: 3 });
    expect(log.el.hidden).toBe(false);
    expect(log.visible).toBe(2);
    expect(lines(log.el)).toEqual(['Axeman 11: Type 3 in effectsimplified', 'You: Ready to copy']);
    expect(log.size).toBe(3);
    expect(lines(log.historyEl)[0]).toBe('00:03You: Ready to copy');
    expect(lines(log.historyEl)[2]).toBe('00:01You: Check-in');
  });

  it('fades and expires lines on tick(), hides when empty', () => {
    const log = radioLog({ id: 'subs', ttlS: 8 });
    log.push({ from: 'Axeman 11', text: 'Continue', t: 10, tone: 'hi' });
    log.tick(15);
    const line = (log.el as unknown as FakeEl).children[0];
    expect(line.classList.contains('is-hi')).toBe(true);
    expect(line.classList.contains('is-fading')).toBe(false);
    log.tick(17.5);
    expect(line.classList.contains('is-fading')).toBe(true);
    log.tick(18);
    expect(log.visible).toBe(0);
    expect(log.el.hidden).toBe(true);
    expect(log.size).toBe(1); // the transcript keeps it
  });

  it('stamps untimed lines with the last tick time and caps the transcript', () => {
    const log = radioLog({ id: 'subs', historyMax: 2 });
    log.tick(65);
    log.push({ from: 'You', text: 'IP inbound' });
    expect(lines(log.historyEl)[0]).toBe('01:05You: IP inbound');
    log.push({ from: 'You', text: 'In' });
    log.push({ from: 'You', text: 'Off' });
    expect(log.size).toBe(2);
    log.clear();
    expect(log.size).toBe(0);
    expect(log.visible).toBe(0);
  });

  it('destroy() detaches both elements', () => {
    const log = radioLog({ id: 'subs' });
    const host = new FakeEl('div');
    host.appendChild(log.el as unknown as FakeEl); host.appendChild(log.historyEl as unknown as FakeEl);
    log.push({ from: 'You', text: 'Check out', t: 1 });
    log.destroy();
    expect(host.children.length).toBe(0);
    expect(log.visible).toBe(0);
  });
});
