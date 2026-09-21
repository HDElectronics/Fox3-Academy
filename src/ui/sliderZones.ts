/** Decorative slider zones use the same numeric domain as the native range input. */
export interface SliderZoneBand {
  from: number;
  to: number;
  tone: 'hatched' | 'solid' | 'outline';
}
export interface SliderZoneMark {
  value: number;
  label: string;
  /** A vertical cue through the band as well as a label. */
  cue?: boolean;
  /** Larger numbers keep their labels first when marks are crowded. Default 0. */
  priority?: number;
}
export interface SliderZones {
  bands: SliderZoneBand[];
  marks?: SliderZoneMark[];
  /** Dashed outline distinguishes a calculated band from an estimate. */
  exact?: boolean;
}

/** Clip bands to the slider domain and keep higher-priority labels clear of neighbouring marks. */
export function layoutSliderZones(zones: SliderZones, min: number, max: number) {
  const valid = Number.isFinite(min) && Number.isFinite(max) && max > min;
  const pct = (v: number) => 100 * (v - min) / (max - min);
  const bands = valid ? zones.bands.flatMap(band => {
    if (!Number.isFinite(band.from) || !Number.isFinite(band.to) || band.to <= band.from) return [];
    const from = Math.max(min, band.from), to = Math.min(max, band.to);
    return to > from ? [{ left: pct(from), width: pct(to) - pct(from), tone: band.tone }] : [];
  }) : [];
  const marks = valid ? (zones.marks ?? []).flatMap(mark =>
    Number.isFinite(mark.value) && mark.value >= min && mark.value <= max
      ? [{ ...mark, left: pct(mark.value), showLabel: false }] : []) : [];
  const occupied: number[] = [];
  for (const mark of [...marks].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))) {
    mark.showLabel = occupied.every(left => Math.abs(left - mark.left) >= 9);
    if (mark.showLabel) occupied.push(mark.left);
  }
  return { bands, marks };
}
