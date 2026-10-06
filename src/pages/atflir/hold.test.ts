import { describe, it, expect } from 'vitest';
import { cleanup } from '../../ui/dom';
import { bindKeyboardHold } from './hold';
const key = (type: string, code: string, repeat = false) => Object.assign(new Event(type, { cancelable: true }), { code, repeat });
describe('focused weapon hold control', () => {
  it('holds through repeats and releases on keyup without native activation', () => {
    const target = new EventTarget(), clean = cleanup(), values: boolean[] = [];
    bindKeyboardHold(target, held => values.push(held), clean);
    const down = key('keydown', 'Space'); target.dispatchEvent(down);
    target.dispatchEvent(key('keydown', 'Space', true));
    expect(values).toEqual([true]); expect(down.defaultPrevented).toBe(true);
    target.dispatchEvent(key('keyup', 'Space')); expect(values).toEqual([true, false]); clean.dispose();
  });
  it('cancels an Enter hold on blur and removes listeners on unmount', () => {
    const target = new EventTarget(), clean = cleanup(), values: boolean[] = [];
    bindKeyboardHold(target, held => values.push(held), clean);
    target.dispatchEvent(key('keydown', 'Enter')); target.dispatchEvent(new Event('blur'));
    expect(values).toEqual([true, false]); clean.dispose();
    target.dispatchEvent(key('keydown', 'Enter')); expect(values).toEqual([true, false]);
  });
});
