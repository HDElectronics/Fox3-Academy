import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ click: () => {}, label: '', disabled: false, disconnect: vi.fn(), update: () => {} }));
vi.mock('./controls', () => ({ button: (options: { onClick(): void }) => {
  state.click = options.onClick;
  const attrs = new Map<string, string>();
  return {
    el: { hidden: false, title: '', setAttribute: (k: string, v: string) => attrs.set(k, v), removeAttribute: (k: string) => attrs.delete(k), remove: vi.fn() },
    setLabel: (v: string) => { state.label = v; },
    setDisabled: (v: boolean) => { state.disabled = v; },
  };
} }));
import { mobileAction } from './mobileAction';

function source() {
  return { disabled: false, hidden: false, title: 'Fire selected weapon', click: vi.fn(),
    querySelector: () => ({ textContent: 'Fire AIM-120' }), getAttribute: () => null } as unknown as HTMLButtonElement;
}

afterEach(() => vi.unstubAllGlobals());
describe('mobile actions share the original control state', () => {
  function observer() {
    state.disconnect.mockClear();
    vi.stubGlobal('MutationObserver', class {
      constructor(callback: () => void) { state.update = callback; }
      observe() {}
      disconnect = state.disconnect;
    });
  }
  it('forwards enabled actions but blocks a newly disabled or hidden source before observer delivery', () => {
    observer(); const original = source(); const action = mobileAction(original);
    state.click(); expect(original.click).toHaveBeenCalledTimes(1);
    original.disabled = true; state.click();
    original.disabled = false; original.hidden = true; state.click();
    expect(original.click).toHaveBeenCalledTimes(1);
    action.destroy(); expect(state.disconnect).toHaveBeenCalledOnce();
  });
  it('updates the visible label, disabled state and visibility without copying keyboard hints', () => {
    observer(); const original = source(); const action = mobileAction(original);
    expect(state.label).toBe('Fire AIM-120');
    original.disabled = true; original.hidden = true; state.update();
    expect(state.disabled).toBe(true); expect(action.el.hidden).toBe(true);
    action.destroy();
  });
});
