import { describe, expect, it } from 'vitest';
import { ariaShortcut, bindKeys, chordText, matchChord, parseChord, parseKeyList, splitAlternatives, type KeyEventLike } from './keys';

const ev = (code: string, mods: Partial<Omit<KeyEventLike, 'code'>> = {}): KeyEventLike => ({
  code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods,
});

describe('parseChord', () => {
  it('parses DCS chords with and without spaces', () => {
    for (const s of ['RAlt+I', 'RAlt + I', 'ralt+i', '[RAlt-I]']) {
      const c = parseChord(s);
      expect(c, s).not.toBeNull();
      expect(c!.alt).toBe('R');
      expect(c!.codes).toEqual(['KeyI']);
      expect(c!.text).toBe('RAlt+I');
    }
  });
  it('knows punctuation, named keys and the numpad', () => {
    expect(parseChord(';')!.codes).toEqual(['Semicolon']);
    expect(parseChord(',')!.codes).toEqual(['Comma']);
    expect(parseChord('/')!.codes).toEqual(['Slash']);
    expect(parseChord('RShift+.')!.codes).toEqual(['Period']);
    expect(parseChord('Enter')!.codes).toContain('Enter');
    expect(parseChord('Backspace')!.codes).toEqual(['Backspace']);
    expect(parseChord('Space')!.codes).toEqual(['Space']);
    expect(parseChord('Insert')!.codes).toEqual(['Insert']);
    expect(parseChord('Del')!.codes).toEqual(['Delete']);
    expect(parseChord('RCtrl+Up')!.codes).toEqual(['ArrowUp']);
    expect(parseChord('RAlt+F5')!.codes).toEqual(['F5']);
    expect(parseChord('Num5')!.codes).toEqual(['Numpad5']);
    expect(parseChord('Num.')!.codes).toEqual(['NumpadDecimal']);
    expect(parseChord('LCtrl+1')!.codes).toEqual(['Digit1']);
  });
  it('handles minus, unicode minus and plus forms', () => {
    expect(parseChord('RCtrl+-')!.codes).toEqual(['Minus']);
    expect(parseChord('RCtrl+−')!.codes).toEqual(['Minus']);
    expect(parseChord('RCtrl--')!.codes).toEqual(['Minus']);
    expect(parseChord('RCtrl++')!.codes).toEqual(['Equal', 'NumpadAdd']);
    expect(parseChord('RCtrl + +')!.ctrl).toBe('R');
    expect(parseChord('Num+')!.codes).toEqual(['NumpadAdd']);
    expect(parseChord('RAlt+Num+')!.alt).toBe('R');
    expect(parseChord('+')!.codes).toEqual(['Equal', 'NumpadAdd']);
    expect(parseChord('=')!.codes).toEqual(['Equal']);
  });
  it('treats a lone modifier as the main key', () => {
    const c = parseChord('LShift')!;
    expect(c.codes).toEqual(['ShiftLeft']);
    expect(c.shift).toBeNull();
  });
  it('rejects prose and unknown keys', () => {
    for (const s of ['unbound', 'none', '(no default found)', 'RAlt+', 'Hyper+I', 'RAlt+RAlt+I', '']) expect(parseChord(s), s).toBeNull();
  });
});

describe('alternatives', () => {
  it('splits on / or and', () => {
    expect(splitAlternatives('RCtrl+= / RCtrl+−')).toEqual(['RCtrl+=', 'RCtrl+−']);
    expect(splitAlternatives('RAlt+, and RAlt+.')).toEqual(['RAlt+,', 'RAlt+.']);
    expect(splitAlternatives('F6 or F7')).toEqual(['F6', 'F7']);
    expect(splitAlternatives('RShift+/')).toEqual(['RShift+/']);
    expect(parseKeyList('RAlt+F5 / F6 / F7 / F8').map(c => c.text)).toEqual(['RAlt+F5', 'F6', 'F7', 'F8']);
  });
  it('formats DCS text and aria shortcuts', () => {
    expect(chordText('ralt+i')).toBe('RAlt + I');
    expect(chordText('unbound')).toBe('unbound');
    expect(ariaShortcut('RAlt+I')).toBe('Alt+I');
    expect(ariaShortcut('RCtrl+Up / Enter')).toBe('Control+ArrowUp Enter');
  });
});

describe('matchChord', () => {
  const ralti = parseChord('RAlt+I')!;
  it('matches exact side as 2, other side as 1, missing modifier as 0', () => {
    expect(matchChord(ralti, ev('KeyI', { altKey: true }), new Set(['AltRight']))).toBe(2);
    expect(matchChord(ralti, ev('KeyI', { altKey: true }), new Set(['AltLeft']))).toBe(1);
    expect(matchChord(ralti, ev('KeyI', { altKey: true }), new Set())).toBe(2); // side unknown: accept
    expect(matchChord(ralti, ev('KeyI'), new Set())).toBe(0);
    expect(matchChord(ralti, ev('KeyO', { altKey: true }), new Set(['AltRight']))).toBe(0);
  });
  it('requires unlisted modifiers to be up', () => {
    const i = parseChord('I')!;
    expect(matchChord(i, ev('KeyI'), new Set())).toBe(2);
    expect(matchChord(i, ev('KeyI', { shiftKey: true }), new Set(['ShiftRight']))).toBe(0);
    expect(matchChord(i, ev('KeyI', { metaKey: true }), new Set(['MetaLeft']))).toBe(0);
    expect(matchChord(ralti, ev('KeyI', { altKey: true, ctrlKey: true }), new Set(['AltRight', 'ControlLeft']))).toBe(0);
  });
  it('treats Windows AltGr (synthetic LCtrl + RAlt) as RAlt', () => {
    const e = { ...ev('KeyI', { altKey: true, ctrlKey: true }), getModifierState: (k: string) => k === 'AltGraph' };
    expect(matchChord(ralti, e, new Set(['ControlLeft', 'AltRight']))).toBe(2);
  });
  it('matches a modifier used as the main key', () => {
    const ls = parseChord('LShift')!;
    expect(matchChord(ls, ev('ShiftLeft', { shiftKey: true }), new Set(['ShiftLeft']))).toBe(2);
    expect(matchChord(ls, ev('ShiftRight', { shiftKey: true }), new Set(['ShiftRight']))).toBe(0);
  });
});

/** Minimal keyboard event for a plain EventTarget (node has no KeyboardEvent). */
function key(type: 'keydown' | 'keyup', code: string, mods: Partial<Omit<KeyEventLike, 'code'>> & { repeat?: boolean } = {}) {
  const e = new Event(type, { cancelable: true });
  Object.assign(e, { code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, repeat: false, isComposing: false, ...mods });
  return e;
}

describe('bindKeys', () => {
  it('dispatches chords, prefers the exact side, handles up/repeat, and unbinds', () => {
    const t = new EventTarget();
    const log: string[] = [];
    const unbind = bindKeys({
      'RAlt+I': () => log.push('tws'),
      'LAlt+I': () => log.push('left'),
      'Enter': () => log.push('enter'),
      'RCtrl+= / RCtrl+−': e => log.push('zoom ' + e.code),
      ';': { down: () => log.push('slew'), up: () => log.push('stop'), repeat: true },
      'Space': { down: () => log.push('fire') },
    }, t);

    t.dispatchEvent(key('keydown', 'AltRight', { altKey: true }));
    const d = key('keydown', 'KeyI', { altKey: true });
    t.dispatchEvent(d);
    expect(d.defaultPrevented).toBe(true);
    t.dispatchEvent(key('keyup', 'KeyI', { altKey: true }));
    t.dispatchEvent(key('keyup', 'AltRight'));
    t.dispatchEvent(key('keydown', 'AltLeft', { altKey: true }));
    t.dispatchEvent(key('keydown', 'KeyI', { altKey: true }));
    t.dispatchEvent(key('keyup', 'AltLeft'));
    t.dispatchEvent(key('keydown', 'Enter'));
    t.dispatchEvent(key('keydown', 'ControlRight', { ctrlKey: true }));
    t.dispatchEvent(key('keydown', 'Minus', { ctrlKey: true }));
    t.dispatchEvent(key('keyup', 'ControlRight'));
    t.dispatchEvent(key('keydown', 'Semicolon'));
    t.dispatchEvent(key('keydown', 'Semicolon', { repeat: true }));
    t.dispatchEvent(key('keyup', 'Semicolon'));
    t.dispatchEvent(key('keydown', 'Space'));
    t.dispatchEvent(key('keydown', 'Space', { repeat: true }));
    expect(log).toEqual(['tws', 'left', 'enter', 'zoom Minus', 'slew', 'slew', 'stop', 'fire']);

    unbind();
    t.dispatchEvent(key('keydown', 'Enter'));
    expect(log.length).toBe(8);
  });

  it('honours strictSides and enabled()', () => {
    const t = new EventTarget();
    const log: string[] = [];
    let on = true;
    const unbind = bindKeys({ 'RAlt+I': () => log.push('tws') }, t, { strictSides: true, enabled: () => on });
    t.dispatchEvent(key('keydown', 'AltLeft', { altKey: true }));
    t.dispatchEvent(key('keydown', 'KeyI', { altKey: true }));
    t.dispatchEvent(key('keyup', 'AltLeft'));
    expect(log).toEqual([]);
    t.dispatchEvent(key('keydown', 'AltRight', { altKey: true }));
    t.dispatchEvent(key('keydown', 'KeyI', { altKey: true }));
    on = false;
    t.dispatchEvent(key('keydown', 'KeyI', { altKey: true }));
    expect(log).toEqual(['tws']);
    unbind();
  });

  it('skips unparseable chords with a warning instead of throwing', () => {
    const t = new EventTarget();
    const warn = console.warn;
    const warned: string[] = [];
    console.warn = (m: string) => { warned.push(m); };
    try {
      const unbind = bindKeys({ 'unbound': () => {}, 'I': () => {} }, t);
      unbind();
    } finally { console.warn = warn; }
    expect(warned.length).toBe(1);
  });
});
