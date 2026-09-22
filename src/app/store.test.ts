import { afterEach, describe, expect, it } from 'vitest';
import { AppStore } from './store';

const KEY = 'fox3academy:v1';
const LEGACY_KEY = 'fox3school:v1';

/** Minimal localStorage stand-in: the test environment is node, so there is no DOM. */
function fakeStorage(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v); },
    removeItem: (k: string) => { data.delete(k); },
    has: (k: string) => data.has(k),
    read: (k: string) => JSON.parse(data.get(k) ?? 'null'),
  };
}

function install(seed: Record<string, string> = {}) {
  const store = fakeStorage(seed);
  (globalThis as { localStorage?: unknown }).localStorage = store;
  return store;
}

afterEach(() => { delete (globalThis as { localStorage?: unknown }).localStorage; });

describe('saved state across the Fox3 Academy rename', () => {
  const saved = JSON.stringify({ aircraft: 'f15c', units: 'imperial', unitsOverride: true, progress: { 'tws:f15c:done': true } });

  it('reads progress saved under the old key', () => {
    install({ [LEGACY_KEY]: saved });
    const app = new AppStore();
    expect(app.aircraft).toBe('f15c');
    expect(app.units).toBe('imperial');
    expect(app.getProgress('tws:f15c:done')).toBe(true);
  });

  it('moves that state to the new key on the next save', () => {
    const storage = install({ [LEGACY_KEY]: saved });
    new AppStore().setProgress('radar:f15c:done', true);
    expect(storage.has(LEGACY_KEY)).toBe(false);
    expect(storage.read(KEY).progress).toEqual({ 'tws:f15c:done': true, 'radar:f15c:done': true });
  });

  it('prefers the new key when both exist', () => {
    install({ [LEGACY_KEY]: saved, [KEY]: JSON.stringify({ aircraft: 'su27' }) });
    expect(new AppStore().aircraft).toBe('su27');
  });

  it('falls back to defaults when nothing is stored', () => {
    install();
    expect(new AppStore().aircraft).toBe('su27');
  });
});
