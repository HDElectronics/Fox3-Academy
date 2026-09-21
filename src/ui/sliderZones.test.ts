import { describe, expect, it } from 'vitest';
import { layoutSliderZones, type SliderZones } from './sliderZones';

describe('slider zone layout', () => {
  it('clips bands to a nonzero slider range and ignores reversed or invalid bands', () => {
    const zones: SliderZones = { bands: [
      { from: 0, to: 30, tone: 'hatched' }, { from: 30, to: 120, tone: 'solid' },
      { from: 40, to: 30, tone: 'outline' }, { from: NaN, to: 30, tone: 'solid' },
    ] };
    expect(layoutSliderZones(zones, 20, 100).bands).toEqual([
      { left: 0, width: 12.5, tone: 'hatched' }, { left: 12.5, width: 87.5, tone: 'solid' },
    ]);
  });

  it('keeps a cue while hiding its label near a higher-priority boundary', () => {
    const result = layoutSliderZones({ bands: [], marks: [
      { value: 0, label: 'MIN' }, { value: 94, label: 'CUE', cue: true },
      { value: 100, label: 'MAX', priority: 2 }, { value: 105, label: 'OUT' },
    ] }, 0, 100);
    expect(result.marks.map(m => [m.label, m.showLabel])).toEqual([['MIN', true], ['CUE', false], ['MAX', true]]);
    expect(result.marks[1].cue).toBe(true);
  });

  it('repositions zones after a range change and returns no geometry for an empty range', () => {
    const zones: SliderZones = { bands: [{ from: 20, to: 40, tone: 'solid' }], marks: [{ value: 40, label: 'MAX' }] };
    expect(layoutSliderZones(zones, 0, 80).marks[0].left).toBe(50);
    expect(layoutSliderZones(zones, 0, 160).marks[0].left).toBe(25);
    expect(layoutSliderZones(zones, 20, 20)).toEqual({ bands: [], marks: [] });
  });
});
