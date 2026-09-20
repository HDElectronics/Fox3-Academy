/**
 * DCS-style keyboard chords: parse 'RAlt+I', 'RShift + ;', 'Enter', 'RCtrl+−', 'Num5' ...,
 * bind them to handlers with bindKeys(), and show them as <kbd> pieces with kbd().
 *
 * Matching uses KeyboardEvent.code (the physical key, like DCS's DirectInput bindings), so it works
 * on any layout and with macOS Option held (Option+I types 'ˆ' but its code is still 'KeyI').
 * Left/right modifier sides are tracked from keydown/keyup of the modifier keys themselves.
 */
import { h, type Child } from './dom';

export type ModSide = 'L' | 'R' | 'any';
export type ModName = 'ctrl' | 'alt' | 'shift' | 'meta';

export interface Chord {
  /** Normalised DCS-style text, e.g. 'RAlt+I'. */
  text: string;
  /** Required modifiers; null = must NOT be held. */
  ctrl: ModSide | null;
  alt: ModSide | null;
  shift: ModSide | null;
  meta: ModSide | null;
  /** KeyboardEvent.code values that count as the main key. */
  codes: string[];
  /** Display names: modifiers in order, then the main key. */
  mods: string[];
  key: string;
}

/** The subset of KeyboardEvent the matcher reads (lets tests pass plain objects). */
export interface KeyEventLike {
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  getModifierState?(key: string): boolean;
}

// ---- key tables ---------------------------------------------------------------------------------

const MOD_ALIASES: Record<string, { mod: ModName; side: ModSide; name: string }> = {
  lctrl: { mod: 'ctrl', side: 'L', name: 'LCtrl' }, rctrl: { mod: 'ctrl', side: 'R', name: 'RCtrl' },
  ctrl: { mod: 'ctrl', side: 'any', name: 'Ctrl' }, control: { mod: 'ctrl', side: 'any', name: 'Ctrl' },
  lalt: { mod: 'alt', side: 'L', name: 'LAlt' }, ralt: { mod: 'alt', side: 'R', name: 'RAlt' },
  alt: { mod: 'alt', side: 'any', name: 'Alt' }, option: { mod: 'alt', side: 'any', name: 'Alt' },
  lshift: { mod: 'shift', side: 'L', name: 'LShift' }, rshift: { mod: 'shift', side: 'R', name: 'RShift' },
  shift: { mod: 'shift', side: 'any', name: 'Shift' },
  lwin: { mod: 'meta', side: 'L', name: 'LWin' }, rwin: { mod: 'meta', side: 'R', name: 'RWin' },
  win: { mod: 'meta', side: 'any', name: 'Win' }, meta: { mod: 'meta', side: 'any', name: 'Win' },
  cmd: { mod: 'meta', side: 'any', name: 'Win' },
};

const MOD_CODE: Record<ModName, { L: string; R: string }> = {
  ctrl: { L: 'ControlLeft', R: 'ControlRight' },
  alt: { L: 'AltLeft', R: 'AltRight' },
  shift: { L: 'ShiftLeft', R: 'ShiftRight' },
  meta: { L: 'MetaLeft', R: 'MetaRight' },
};
const MOD_OF_CODE: Record<string, ModName> = {};
for (const [m, s] of Object.entries(MOD_CODE) as [ModName, { L: string; R: string }][]) { MOD_OF_CODE[s.L] = m; MOD_OF_CODE[s.R] = m; }

/** Is this e.code a modifier key? */
export const isModifierCode = (code: string) => code in MOD_OF_CODE;

interface KeyDef { codes: string[]; name: string }
const KEYS: Record<string, KeyDef> = {};
const def = (aliases: string[], codes: string[], name: string) => { for (const a of aliases) KEYS[a.toLowerCase()] = { codes, name }; };

for (let i = 0; i < 26; i++) { const c = String.fromCharCode(65 + i); def([c], ['Key' + c], c); }
for (let i = 0; i <= 9; i++) {
  def([String(i)], ['Digit' + i], String(i));
  def(['Num' + i, 'Numpad' + i], ['Numpad' + i], 'Num' + i);
}
for (let i = 1; i <= 24; i++) def(['F' + i], ['F' + i], 'F' + i);
def([';'], ['Semicolon'], ';');
def([','], ['Comma'], ',');
def(['.'], ['Period'], '.');
def(['/'], ['Slash'], '/');
def(['='], ['Equal'], '=');
def(['-', '−', '–'], ['Minus'], '-');
def(['+'], ['Equal', 'NumpadAdd'], '+');
def(['['], ['BracketLeft'], '[');
def([']'], ['BracketRight'], ']');
def(["'"], ['Quote'], "'");
def(['`', '~'], ['Backquote'], '`');
def(['\\'], ['Backslash'], '\\');
def(['Space', 'Spacebar'], ['Space'], 'Space');
def(['Enter', 'Return'], ['Enter', 'NumpadEnter'], 'Enter');
def(['NumEnter', 'NumpadEnter'], ['NumpadEnter'], 'NumEnter');
def(['Backspace', 'Back', 'BS'], ['Backspace'], 'Backspace');
def(['Tab'], ['Tab'], 'Tab');
def(['Esc', 'Escape'], ['Escape'], 'Esc');
def(['Insert', 'Ins'], ['Insert'], 'Insert');
def(['Delete', 'Del'], ['Delete'], 'Delete');
def(['Home'], ['Home'], 'Home');
def(['End'], ['End'], 'End');
def(['PageUp', 'PgUp'], ['PageUp'], 'PageUp');
def(['PageDown', 'PgDn', 'PageDn'], ['PageDown'], 'PageDown');
def(['Up', 'ArrowUp'], ['ArrowUp'], 'Up');
def(['Down', 'ArrowDown'], ['ArrowDown'], 'Down');
def(['Left', 'ArrowLeft'], ['ArrowLeft'], 'Left');
def(['Right', 'ArrowRight'], ['ArrowRight'], 'Right');
def(['Pause'], ['Pause'], 'Pause');
def(['Num.', 'NumDecimal', 'Num,'], ['NumpadDecimal'], 'Num.');
def(['Num+', 'NumPlus'], ['NumpadAdd'], 'Num+');
def(['Num-', 'NumMinus'], ['NumpadSubtract'], 'Num-');
def(['Num*'], ['NumpadMultiply'], 'Num*');
def(['Num/'], ['NumpadDivide'], 'Num/');
// Modifiers used as the main key ('LShift' held for speed, etc.).
def(['LShift'], ['ShiftLeft'], 'LShift'); def(['RShift'], ['ShiftRight'], 'RShift'); def(['Shift'], ['ShiftLeft', 'ShiftRight'], 'Shift');
def(['LCtrl'], ['ControlLeft'], 'LCtrl'); def(['RCtrl'], ['ControlRight'], 'RCtrl'); def(['Ctrl'], ['ControlLeft', 'ControlRight'], 'Ctrl');
def(['LAlt'], ['AltLeft'], 'LAlt'); def(['RAlt'], ['AltRight'], 'RAlt'); def(['Alt'], ['AltLeft', 'AltRight'], 'Alt');
def(['LWin'], ['MetaLeft'], 'LWin'); def(['RWin'], ['MetaRight'], 'RWin');

const MOD_TITLE: Record<string, string> = {
  LAlt: 'Left Alt (Option on a Mac)', RAlt: 'Right Alt (Option on a Mac)', Alt: 'Alt (Option on a Mac)',
  LCtrl: 'Left Ctrl', RCtrl: 'Right Ctrl', Ctrl: 'Ctrl',
  LShift: 'Left Shift', RShift: 'Right Shift', Shift: 'Shift',
  LWin: 'Left Windows key', RWin: 'Right Windows key', Win: 'Windows key',
};

// ---- parsing ------------------------------------------------------------------------------------

/**
 * Parse one chord. Accepts DCS spellings: 'RAlt+I', 'RAlt + I', 'RCtrl+−', 'RCtrl++', 'Num+',
 * 'LShift+Q', 'Enter', ';', bracket-dash notation '[RAlt-I]'. Returns null when it is not a chord
 * ('none', 'unbound', prose).
 */
export function parseChord(input: string): Chord | null {
  let s = input.trim().replace(/[−–]/g, '-');
  if (!s) return null;
  const br = /^\[(.+)\]$/.exec(s);
  if (br && s.length > 2) s = br[1].trim();
  // 'RCtrl-+' / 'RAlt-I': a dash straight after a modifier is a separator.
  s = s.replace(/\b([LR]?(?:Ctrl|Alt|Shift|Win))-(?=.)/gi, '$1+');
  s = s.replace(/\s*\+\s*/g, '+');
  if (/\s/.test(s)) return null;

  let keyPart: string, modPart: string;
  if (s === '+') { keyPart = '+'; modPart = ''; }
  else if (/(^|\+)Num\+$/i.test(s)) { keyPart = s.slice(-4); modPart = s.slice(0, -4).replace(/\+$/, ''); }
  else if (s.endsWith('++')) { keyPart = '+'; modPart = s.slice(0, -2); }
  else {
    const i = s.lastIndexOf('+');
    keyPart = s.slice(i + 1); modPart = i >= 0 ? s.slice(0, i) : '';
  }
  const kd = KEYS[keyPart.toLowerCase()];
  if (!kd) return null;

  const chord: Chord = { text: '', ctrl: null, alt: null, shift: null, meta: null, codes: kd.codes, mods: [], key: kd.name };
  if (modPart) {
    for (const tok of modPart.split('+')) {
      const m = MOD_ALIASES[tok.toLowerCase()];
      if (!m || chord[m.mod] !== null) return null;
      chord[m.mod] = m.side;
      chord.mods.push(m.name);
    }
  }
  chord.text = [...chord.mods, chord.key].join('+');
  return chord;
}

/** Split 'RCtrl+= / RCtrl+−', 'RAlt+, and RAlt+.', 'F6 or F7' into alternatives (text, unparsed). */
export function splitAlternatives(s: string): string[] {
  return s.split(/\s+(?:\/|or|and)\s+/i).map(p => p.trim()).filter(Boolean);
}

/** Parse every alternative in a key string; unparseable parts are dropped. */
export function parseKeyList(s: string): Chord[] {
  const out: Chord[] = [];
  for (const part of splitAlternatives(s)) { const c = parseChord(part); if (c) out.push(c); }
  return out;
}

/** DCS-style display text: 'RAlt + I'. Returns the input unchanged if it is not a chord. */
export function chordText(s: string): string {
  const c = parseChord(s);
  return c ? [...c.mods, c.key].join(' + ') : s;
}

/** Value for aria-keyshortcuts ('Alt+I', 'Control+Minus' style names per ARIA). */
export function ariaShortcut(s: string): string {
  const out: string[] = [];
  for (const c of parseKeyList(s)) {
    const parts: string[] = [];
    if (c.ctrl) parts.push('Control');
    if (c.alt) parts.push('Alt');
    if (c.shift) parts.push('Shift');
    if (c.meta) parts.push('Meta');
    const k = c.key;
    const ariaKey = k === 'Space' ? 'Space' : k === 'Esc' ? 'Escape' : /^(Up|Down|Left|Right)$/.test(k) ? 'Arrow' + k : k;
    parts.push(ariaKey);
    out.push(parts.join('+'));
  }
  return out.join(' ');
}

// ---- matching -----------------------------------------------------------------------------------

/**
 * Does the event match the chord? 0 = no, 1 = yes but a required modifier is held on the other side
 * (LAlt pressed for 'RAlt+I'), 2 = exact. `held` is the set of modifier e.codes currently down.
 * A modifier that must not be held (null) must really be up: 'I' does not fire on Shift+I.
 */
export function matchChord(c: Chord, e: KeyEventLike, held: ReadonlySet<string>): 0 | 1 | 2 {
  if (!c.codes.includes(e.code)) return 0;
  const pressed: Record<ModName, boolean> = { ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey };
  // Windows AltGr = synthetic LCtrl + RAlt: treat it as RAlt alone.
  let altGr = false;
  try { altGr = !!e.getModifierState?.('AltGraph'); } catch { altGr = false; }
  if (altGr) { pressed.alt = true; if (!held.has('ControlRight')) pressed.ctrl = false; }
  // The main key itself may be a modifier ('LShift' bound to "speed up").
  const selfMod = MOD_OF_CODE[e.code];
  if (selfMod) pressed[selfMod] = false;

  let exact = true;
  for (const m of ['ctrl', 'alt', 'shift', 'meta'] as ModName[]) {
    const want = c[m];
    if (m === selfMod) continue;
    if (want === null) { if (pressed[m]) return 0; continue; }
    if (!pressed[m]) return 0;
    if (want === 'any') continue;
    const side = MOD_CODE[m][want], other = MOD_CODE[m][want === 'L' ? 'R' : 'L'];
    const sideHeld = held.has(side) || (altGr && m === 'alt' && want === 'R');
    if (!sideHeld && held.has(other)) exact = false;
  }
  return exact ? 2 : 1;
}

// ---- binding ------------------------------------------------------------------------------------

export interface KeyBinding {
  /** Called on keydown. */
  down?: (e: KeyboardEvent) => void;
  /** Called on keyup of the main key (or with no event when the window loses focus while held). */
  up?: (e?: KeyboardEvent) => void;
  /** Call down() again on auto-repeat while held (default false: one press, one call). */
  repeat?: boolean;
  /** preventDefault() the browser action for this key (default true). */
  preventDefault?: boolean;
  /** Also fire while typing in a text field (default false). */
  inInputs?: boolean;
  /** Also fire while focus is inside an aria-modal dialog (default false). */
  inModal?: boolean;
}
export type KeyHandler = (e: KeyboardEvent) => void;
/** Keys are chord strings; alternatives are allowed ('RCtrl+= / RCtrl+−'). */
export type KeyMap = Record<string, KeyHandler | KeyBinding>;

export interface BindKeysOptions {
  /** Only exact modifier sides fire (default false: LAlt+I also fires 'RAlt+I' unless 'LAlt+I' is bound). */
  strictSides?: boolean;
  /** Checked on every keydown; return false to ignore keys (e.g. while paused). */
  enabled?: () => boolean;
}

const TEXT_INPUT_TYPES = new Set(['', 'text', 'search', 'email', 'password', 'url', 'tel', 'number', 'date', 'time', 'datetime-local', 'month', 'week']);
const ACTIVATE_CODES = new Set(['Enter', 'NumpadEnter', 'Space']);
const NAV_CODES = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']);

function asElement(t: EventTarget | null): Element | null {
  return t && typeof (t as Element).closest === 'function' ? (t as Element) : null;
}

/** True when focus is in something you type into. */
export function isTextField(t: EventTarget | null): boolean {
  const el = asElement(t);
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') return TEXT_INPUT_TYPES.has(((el as HTMLInputElement).type || '').toLowerCase());
  return !!(el as HTMLElement).isContentEditable || !!el.closest('[contenteditable=""], [contenteditable="true"]');
}

const ACTIVATABLE = 'button, a[href], summary, input, [role="button"], [role="tab"], [role="radio"], [role="switch"], [role="checkbox"], [role="menuitem"], [role="option"], [role="link"]';

/**
 * Would the focused control use this key itself? Enter/Space activate a control the user reached
 * with the keyboard, but NOT one they just clicked (mouse users keep their DCS keys: click TWS, then
 * press Enter to designate). Arrows belong to sliders, radio groups, tab lists and selects.
 */
function consumedByControl(el: Element, e: KeyboardEvent, pointerCtl: Element | null): boolean {
  if (e.ctrlKey || e.altKey || e.metaKey) return false;
  if (ACTIVATE_CODES.has(e.code)) {
    const ctl = el.closest(ACTIVATABLE);
    return !!ctl && ctl !== pointerCtl;
  }
  if (NAV_CODES.has(e.code)) {
    return !!el.closest('input[type="range"], select, [role="slider"], [role="radiogroup"], [role="tablist"], [role="listbox"], [role="menu"]');
  }
  return false;
}

/**
 * Bind DCS-style chords to handlers. Returns unbind().
 *   const unbind = bindKeys({
 *     'RAlt+I': () => toggleTws(),
 *     'Enter': () => designate(),
 *     'RCtrl+= / RCtrl+−': e => zoom(e.code === 'Equal' ? 1 : -1),
 *     ';': { down: () => slew(0, 1), up: () => slew(0, 0), repeat: false },
 *   });
 * Ignores keys typed into text fields, keys the focused control uses itself, and keys while focus is
 * inside a modal. Unparseable chords (e.g. 'unbound') are skipped with a console.warn.
 */
export function bindKeys(map: KeyMap, target: EventTarget = window, opts: BindKeysOptions = {}): () => void {
  const entries: { chord: Chord; b: KeyBinding }[] = [];
  for (const [k, v] of Object.entries(map)) {
    const b: KeyBinding = typeof v === 'function' ? { down: v } : v;
    const parts = splitAlternatives(k);
    for (const p of parts) {
      const c = parseChord(p);
      if (c) entries.push({ chord: c, b });
      else console.warn(`bindKeys: "${p}" is not a key chord, skipped`);
    }
  }
  const held = new Set<string>();
  const active = new Map<string, KeyBinding>();
  // The control the user last clicked (focus by pointer). Cleared when focus moves elsewhere.
  let pointerCtl: Element | null = null;
  const onPointer = (ev: Event) => { pointerCtl = asElement(ev.target)?.closest(ACTIVATABLE) ?? null; };
  const onFocusIn = (ev: Event) => {
    const el = asElement(ev.target);
    if (pointerCtl && (!el || !pointerCtl.contains(el))) pointerCtl = null;
  };

  const onDown = (ev: Event) => {
    const e = ev as KeyboardEvent;
    if (isModifierCode(e.code)) held.add(e.code);
    if (e.isComposing || e.defaultPrevented) return;
    if (opts.enabled && !opts.enabled()) return;
    let best: { chord: Chord; b: KeyBinding } | null = null;
    let score = 0;
    for (const en of entries) {
      const s = matchChord(en.chord, e, held);
      if (s > score) { best = en; score = s; if (s === 2) break; }
    }
    if (!best || (score < 2 && opts.strictSides)) return;
    const el = asElement(e.target);
    if (el) {
      if (!best.b.inModal && el.closest('[aria-modal="true"]')) return;
      if (!best.b.inInputs && isTextField(el)) return;
      if (consumedByControl(el, e, pointerCtl)) return;
    }
    if (best.b.preventDefault !== false) e.preventDefault();
    if (e.repeat && !best.b.repeat) return;
    active.set(e.code, best.b);
    best.b.down?.(e);
  };
  const onUp = (ev: Event) => {
    const e = ev as KeyboardEvent;
    if (isModifierCode(e.code)) held.delete(e.code);
    const b = active.get(e.code);
    if (!b) return;
    active.delete(e.code);
    if (b.preventDefault !== false) e.preventDefault();
    b.up?.(e);
  };
  const releaseAll = () => {
    held.clear();
    const list = [...active.values()];
    active.clear();
    for (const b of list) b.up?.();
  };

  target.addEventListener('keydown', onDown);
  target.addEventListener('keyup', onUp);
  const win: EventTarget | null = typeof window !== 'undefined' ? window : null;
  const doc: EventTarget | null = typeof document !== 'undefined' ? document : null;
  win?.addEventListener('blur', releaseAll);
  doc?.addEventListener('pointerdown', onPointer, true);
  doc?.addEventListener('focusin', onFocusIn, true);
  return () => {
    target.removeEventListener('keydown', onDown);
    target.removeEventListener('keyup', onUp);
    win?.removeEventListener('blur', releaseAll);
    doc?.removeEventListener('pointerdown', onPointer, true);
    doc?.removeEventListener('focusin', onFocusIn, true);
    held.clear(); active.clear(); pointerCtl = null;
  };
}

// ---- display ------------------------------------------------------------------------------------

function chordKbd(c: Chord): HTMLElement {
  const parts: Child[] = [];
  c.mods.forEach(m => {
    parts.push(h('kbd', { title: MOD_TITLE[m] ?? m }, m));
    parts.push(h('span', { class: 'ui-keys__plus', 'aria-hidden': 'true' }, '+'));
  });
  parts.push(h('kbd', MOD_TITLE[c.key] ? { title: MOD_TITLE[c.key] } : null, c.key));
  return h('span', { class: 'ui-keys__chord' }, parts);
}

/**
 * Render a DCS key string as <kbd> pieces: 'RAlt+I' → [RAlt] + [I]. Handles alternatives
 * ('RCtrl+= / RCtrl+−'), sequences ('; , . /'), notes in brackets and plain words ('unbound'),
 * which are shown as text.
 */
export function kbd(keys: string, opts: { class?: string } = {}): HTMLSpanElement {
  const out: Child[] = [];
  const alts = keys.split(/(\s+(?:\/|or|and)\s+)/i);
  alts.forEach((part, i) => {
    if (i % 2 === 1) { out.push(h('span', { class: 'ui-keys__sep' }, part.trim())); return; }
    const whole = parseChord(part);
    if (whole) { out.push(chordKbd(whole)); return; }
    // Collapse spaces around '+' so 'RShift + ;' parses, then treat the rest as a sequence of tokens.
    const tokens = part.trim().replace(/\s*\+\s*(?=\S)/g, '+').split(/\s+/).filter(Boolean);
    tokens.forEach((tok, j) => {
      if (j > 0) out.push(' ');
      const c = parseChord(tok);
      if (c) { out.push(chordKbd(c)); return; }
      // 'Num.,' in a list: chord followed by a comma.
      const c2 = tok.length > 1 && tok.endsWith(',') ? parseChord(tok.slice(0, -1)) : null;
      if (c2) out.push(chordKbd(c2), h('span', { class: 'ui-keys__text' }, ','));
      else out.push(h('span', { class: 'ui-keys__text' }, tok));
    });
  });
  return h('span', { class: 'ui-keys' + (opts.class ? ' ' + opts.class : '') }, out);
}

/** A labelled key hint row: "Designate ........ [Enter]". */
export function keyHint(o: { label: Child; keys: string; note?: string; id?: string }): HTMLDivElement {
  return h('div', { class: 'ui-keyhint', id: o.id },
    h('span', { class: 'ui-keyhint__label' }, o.label),
    kbd(o.keys),
    o.note ? h('span', { class: 'ui-keyhint__note' }, o.note) : null);
}
