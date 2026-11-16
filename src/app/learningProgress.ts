/**
 * Saved completion keys for the pages that award one flag per jet (the BVR lessons, Merge & guns, the Sortie)
 * and the Reference visit. The path order lives in lessonPath.ts; per-page goals in src/pages/progress/model.ts.
 */
import type { FighterId } from '../data/types';
import { FIGHTER_ORDER } from '../data/aircraft';

export type LessonRoute = 'radar' | 'tws' | 'missiles' | 'defense' | 'rwr' | 'merge' | 'sortie' | 'reference';
/** Pages that write one '<route>:<aircraft>:done' flag, in path order (the Sortie is the Fly hand-off). */
export const SINGLE_FLAG_ROUTES: readonly LessonRoute[] = ['radar', 'tws', 'missiles', 'defense', 'rwr', 'merge', 'sortie'];

/** Progress keys the lesson pages may write: '<route>:<aircraft>:done' (and the page-folder name as a fallback). */
const ALT_KEY: Partial<Record<LessonRoute, string>> = { radar: 'radar-lab', missiles: 'missile-lab', rwr: 'rwr-trainer' };
export function progressKeys(route: LessonRoute, id: FighterId): string[] {
  const keys = [`${route}:${id}:done`];
  const alt = ALT_KEY[route];
  if (alt) keys.push(`${alt}:${id}:done`);
  return keys;
}
export type ProgressReader = (key: string) => number | boolean | string | undefined;
export function isDone(route: LessonRoute, id: FighterId, get: ProgressReader): boolean {
  return progressKeys(route, id).some(k => {
    const v = get(k);
    return v !== undefined && v !== false && v !== 0 && v !== '' && v !== 'false';
  });
}
/** Other jets that have this lesson done. */
export const doneElsewhere = (route: LessonRoute, id: FighterId, get: ProgressReader): FighterId[] =>
  FIGHTER_ORDER.filter(o => o !== id && isDone(route, o, get));
