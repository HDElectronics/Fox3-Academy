import { describe, expect, it } from 'vitest';
import { F16_COCKPIT } from '../../data/cockpit';
import { allControls, findControl, mfdButtonPosition, searchControls, sourceUrl } from './model';

describe('cockpit lookup and search', () => {
  it('requires every search term and searches both panel context and the control function', () => {
    const results = searchControls(F16_COCKPIT, '  LEFT   toe BRAKE ');
    expect(results.some(({ control }) => control.id === 'f16-floor-left-toe-brake')).toBe(true);
    expect(results.every(({ control, panel }) => `${panel.label} ${control.label} ${control.summary} ${control.operation} ${control.effect}`.toLowerCase().includes('brake'))).toBe(true);
    expect(searchControls(F16_COCKPIT, 'zzzz-no-such-control')).toEqual([]);
    expect(searchControls(F16_COCKPIT, '   ')).toHaveLength(allControls(F16_COCKPIT).length);
  });
  it('resolves exact control links and rejects unknown IDs without substituting another control', () => {
    const match = findControl(F16_COCKPIT, 'front-left-mfd-osb-12');
    expect(match?.panel.id).toBe('front-left-mfd');
    expect(match?.control.label).toBe('OSB 12');
    expect(findControl(F16_COCKPIT, 'missing')).toBeUndefined();
    expect(findControl(F16_COCKPIT, null)).toBeUndefined();
    expect(sourceUrl(F16_COCKPIT, 122)).toBe(F16_COCKPIT.source.url + '#page=122');
  });
});

describe('MFD bezel positions', () => {
  it('lays out all 20 buttons clockwise with the guide’s corner transitions', () => {
    expect([1, 5, 6, 10, 11, 15, 16, 20].map(mfdButtonPosition)).toEqual([
      { row: 1, column: 2 }, { row: 1, column: 6 }, { row: 2, column: 7 }, { row: 6, column: 7 },
      { row: 7, column: 6 }, { row: 7, column: 2 }, { row: 6, column: 1 }, { row: 2, column: 1 },
    ]);
    const positions = Array.from({ length: 20 }, (_, i) => JSON.stringify(mfdButtonPosition(i + 1)));
    expect(new Set(positions).size).toBe(20);
  });
  it('rejects missing or fractional button numbers', () => {
    for (const number of [0, 21, 1.5, NaN]) expect(() => mfdButtonPosition(number)).toThrow(RangeError);
  });
});
