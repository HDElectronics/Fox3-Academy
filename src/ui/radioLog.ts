/**
 * Radio subtitles: the last few calls ("Axeman 11: Type 3 in effect", "You: Ready to copy") over the
 * 3D view, like the DCS subtitle lines, plus a full transcript list for a console panel.
 *
 *   const radio = radioLog({ id: 'cas-subs' });
 *   lab.overlay('bl', radio.el); console.append(radio.historyEl);
 *   radio.push({ from: 'Axeman 11', text: 'Continue', t: world.time, unverified: !call.verified });
 *   // every frame (or at ~10 Hz): radio.tick(world.time);
 *
 * No timers: fading and expiry are driven by the page's tick(t) in sim seconds, so a paused sim keeps
 * its subtitles and nothing outlives destroy().
 */
import { h, cx } from './dom';
import type { Tone } from './panels';

export interface RadioLogOptions {
  id: string;
  /** Subtitle lines shown at once (default 3). */
  max?: number;
  /** Seconds a subtitle stays on screen (default 8). The last second fades. */
  ttlS?: number;
  /** Transcript length kept in historyEl (default 100). */
  historyMax?: number;
  /** Accessible name of the transcript (default 'Radio transcript'). */
  historyLabel?: string;
}

export interface RadioMessage {
  /** Speaker: a callsign ('Axeman 11') or 'You'. */
  from: string;
  text: string;
  /** Sim seconds; default: the last tick() time. */
  t?: number;
  tone?: Tone;
  /** Wording not verified against the game: the line carries a "simplified" tag. */
  unverified?: boolean;
}

export interface RadioLogHandle {
  /** Subtitle overlay (hidden when no line is showing). */
  el: HTMLDivElement;
  /** Full transcript, newest first; put it in a console panel if you want one. */
  historyEl: HTMLOListElement;
  push(msg: RadioMessage): void;
  /** Advance the clock (sim seconds): fades and removes old subtitles. */
  tick(nowS: number): void;
  clear(): void;
  /** Subtitle lines on screen now. */
  readonly visible: number;
  /** Lines in the transcript. */
  readonly size: number;
  destroy(): void;
}

/**
 * Subtitle state for a line of age `ageS`: 'on', 'fading' (last `fadeS`) or 'gone'.
 * A negative age (the sim clock went back, e.g. a restarted scenario) also counts as gone.
 */
export function radioLineState(ageS: number, ttlS: number, fadeS = Math.min(1, ttlS / 3)): 'on' | 'fading' | 'gone' {
  if (ageS >= ttlS || ageS < 0) return 'gone';
  return ageS >= ttlS - fadeS ? 'fading' : 'on';
}

const mmss = (s: number) => {
  const t = Math.max(0, Math.floor(s));
  return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
};

function line(tag: 'div' | 'li', cls: string, m: RadioMessage, t?: number): HTMLElement {
  return h(tag, { class: cx(cls, m.tone && 'is-' + m.tone) },
    t !== undefined ? h('span', { class: 'ui-radio-log__t' }, mmss(t)) : null,
    h('span', { class: 'ui-radio-log__from' }, m.from + ':'),
    ' ',
    h('span', { class: 'ui-radio-log__text' }, m.text),
    m.unverified ? h('span', { class: 'ui-radio-log__nv' }, 'simplified') : null);
}

export function radioLog(o: RadioLogOptions): RadioLogHandle {
  const max = Math.max(1, o.max ?? 3);
  const ttl = o.ttlS ?? 8;
  const historyMax = o.historyMax ?? 100;
  let now = 0;
  let subs: { t: number; el: HTMLElement }[] = [];

  // The subtitles are the one live region; the transcript repeats them, so it stays quiet.
  const el = h('div', { class: 'ui-radio-log', id: o.id, role: 'log', 'aria-live': 'polite', 'aria-label': 'Radio calls' });
  el.hidden = true;
  const historyEl = h('ol', { class: 'ui-radio-log__history', id: o.id + '-history', 'aria-label': o.historyLabel ?? 'Radio transcript' });

  function update() {
    const keep: typeof subs = [];
    for (const s of subs) {
      const st = radioLineState(now - s.t, ttl);
      if (st === 'gone') { s.el.remove(); continue; }
      s.el.classList.toggle('is-fading', st === 'fading');
      keep.push(s);
    }
    subs = keep;
    el.hidden = subs.length === 0;
  }

  return {
    el, historyEl,
    push(m) {
      const t = m.t ?? now;
      if (t > now) now = t;
      const sub = line('div', 'ui-radio-log__line', m);
      el.appendChild(sub);
      subs.push({ t, el: sub });
      while (subs.length > max) subs.shift()!.el.remove();
      historyEl.prepend(line('li', 'ui-radio-log__row', m, t));
      while (historyEl.children.length > historyMax) historyEl.lastElementChild?.remove();
      update();
    },
    tick(nowS) { now = nowS; update(); },
    clear() {
      for (const s of subs) s.el.remove();
      subs = [];
      historyEl.replaceChildren();
      el.hidden = true;
    },
    get visible() { return subs.length; },
    get size() { return historyEl.children.length; },
    destroy() {
      subs = [];
      el.remove(); historyEl.remove();
    },
  };
}
