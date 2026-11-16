import { describe, expect, it } from 'vitest';
import { labTabTarget, sectionInView } from './layout';

describe('doc layout: the section in view', () => {
  // Three sections; the sticky chrome ends 76 px from the top (top bar 52 + 16 margin + 8 tolerance).
  const at = (scroll: number) => [
    { id: 'a', top: 300 - scroll },
    { id: 'b', top: 1500 - scroll },
    { id: 'c', top: 2600 - scroll },
  ];
  const mid = { height: 900, atEnd: false };

  it('is the first section above the first heading (page header in view)', () => {
    expect(sectionInView(at(0), 76, mid)).toBe('a');
  });
  it('is the last section whose top has passed under the sticky chrome', () => {
    expect(sectionInView(at(1000), 76, mid)).toBe('a');
    expect(sectionInView(at(1424), 76, mid)).toBe('b');   // a jump lands b's top exactly on the line
    expect(sectionInView(at(2000), 76, mid)).toBe('b');
    expect(sectionInView(at(2524), 76, mid)).toBe('c');
  });
  it('gives a short last section its turn at the end of the page', () => {
    expect(sectionInView(at(2000), 76, { height: 900, atEnd: true })).toBe('c');
    // Not while its heading is still below the window.
    expect(sectionInView(at(1600), 76, { height: 900, atEnd: true })).toBe('b');
  });
  it('follows the shown sections only, and has none to show when all are filtered away', () => {
    expect(sectionInView([{ id: 'c', top: 900 }], 76, mid)).toBe('c');
    expect(sectionInView([], 76, mid)).toBeNull();
  });
  it('honours a taller sticky chrome (narrow window: wrapped top bar and the contents row)', () => {
    const probe = 94 + 44 + 12 + 8;
    expect(sectionInView([{ id: 'a', top: -400 }, { id: 'b', top: 150 }], probe, mid)).toBe('b');
    expect(sectionInView([{ id: 'a', top: -400 }, { id: 'b', top: 170 }], probe, mid)).toBe('a');
  });
});

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
