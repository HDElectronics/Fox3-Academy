import type { EntityId, RecordFrame } from '../sim/types';

/** Floor sample only: never infer a detection, designation or track position from a future frame. */
export function recordedRadarAt(frames: readonly RecordFrame[], t: number, observer: EntityId): { t: number; aircraft: RecordFrame['aircraft'][number] } | null {
  let lo = 0, hi = frames.length - 1;
  if (hi < 0 || t < frames[0].t) return null;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (frames[mid].t <= t) lo = mid; else hi = mid - 1;
  }
  const frame = frames[lo];
  const aircraft = frame.aircraft.find(a => a.id === observer);
  return aircraft?.radarContacts ? { t: frame.t, aircraft } : null;
}
