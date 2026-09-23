import { describe, expect, it } from 'vitest';
import { fighterParam } from '../../sandbox/fighterParam';
import { AIRCRAFT, FIGHTER_ORDER } from '../../src/data/aircraft';

describe.each([
  ['displays-live', 'jet', 'f15c'],
  ['render world/replay', 'ac', 'f15c'],
  ['render hero', 'ac', 'su27'],
] as const)('%s fighter URL selection', (_view, key, fallback) => {
  it.each(['su25t', 'unknown', 'constructor', ''])('falls back for %s with a usable radar and loadout', raw => {
    const id = fighterParam(new URLSearchParams({ [key]: raw }), key, fallback);
    expect(id).toBe(fallback);
    expect(AIRCRAFT[id].radar).toBeDefined();
    expect(AIRCRAFT[id].loadout.length).toBeGreaterThan(0);
  });
  it('defaults when absent and preserves every fighter', () => {
    expect(fighterParam(new URLSearchParams(), key, fallback)).toBe(fallback);
    for (const id of FIGHTER_ORDER) {
      expect(fighterParam(new URLSearchParams({ [key]: id }), key, fallback)).toBe(id);
    }
  });
});
