import { describe, expect, it } from 'vitest';
import { labTabTarget } from './layout';

describe('lab tab keyboard navigation', () => {
  it('moves with arrow keys and wraps at both ends', () => {
    expect(labTabTarget('ArrowRight', 0, 3)).toBe(1);
    expect(labTabTarget('ArrowDown', 2, 3)).toBe(0);
    expect(labTabTarget('ArrowLeft', 0, 3)).toBe(2);
    expect(labTabTarget('ArrowUp', 2, 3)).toBe(1);
  });

  it('supports Home and End and ignores unrelated or invalid input', () => {
    expect(labTabTarget('Home', 1, 3)).toBe(0);
    expect(labTabTarget('End', 1, 3)).toBe(2);
    expect(labTabTarget('Enter', 1, 3)).toBe(-1);
    expect(labTabTarget('ArrowRight', -1, 3)).toBe(-1);
    expect(labTabTarget('ArrowRight', 0, 0)).toBe(-1);
  });
});
