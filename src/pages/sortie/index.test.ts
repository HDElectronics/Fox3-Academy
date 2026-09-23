import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import factory from './index';
import { AppStore } from '../../app/store';
import { mountBrief } from './brief';
import { briefFacts, buildSortie, defaultSetup } from './setup';
import { World } from '../../sim/world';
import { cruiseFor } from '../../sim/scenarios';

vi.mock('../../ui', () => ({ h: () => ({ replaceChildren: vi.fn(), remove: vi.fn() }) }));
vi.mock('./brief', () => ({ mountBrief: vi.fn(() => ({ dispose: vi.fn() })) }));
vi.mock('./fly', () => ({ mountFly: vi.fn() }));
vi.mock('./debrief', () => ({ mountDebrief: vi.fn() }));

describe('Sortie opponent URL', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ aircraft: 'f15c' }) });
    vi.stubGlobal('window', { scrollTo: vi.fn() });
  });
  afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

  it.each(['su25t', 'unknown', 'constructor'])('falls back to a fighter for enemy=%s and renders the brief', async enemy => {
    const page = factory();
    const root = { append: vi.fn() } as unknown as HTMLElement;
    try {
      await page.mount({ root, app: new AppStore(), params: new URLSearchParams({ enemy }), navigate: vi.fn() });
      expect(root.append).toHaveBeenCalledTimes(1);
      expect(mountBrief).toHaveBeenCalledTimes(1);
      const setup = vi.mocked(mountBrief).mock.calls[0]![1].setup;
      expect(setup.enemy).toBe(defaultSetup('f15c').enemy);
      expect(() => briefFacts('f15c', setup, 'imperial')).not.toThrow();
      expect(() => buildSortie(new World(1), 'f15c', setup, 'imperial')).not.toThrow();
    } finally { page.unmount(); }
  });

  it('accepts a fighter URL override with its cruise altitude', async () => {
    const page = factory();
    try {
      await page.mount({ root: { append: vi.fn() } as unknown as HTMLElement, app: new AppStore(),
        params: new URLSearchParams('enemy=m2000c'), navigate: vi.fn() });
      expect(vi.mocked(mountBrief).mock.calls[0]![1].setup).toMatchObject({
        enemy: 'm2000c', enemyAlt: cruiseFor('m2000c').alt,
      });
    } finally { page.unmount(); }
  });
});
