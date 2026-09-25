/** Saved lesson completion shared by Learn and the fleet progress overview. */
import type { FighterId } from '../data/types';
import { FIGHTER_ORDER } from '../data/aircraft';

export type LessonRoute = 'radar' | 'tws' | 'missiles' | 'defense' | 'rwr' | 'merge' | 'sortie' | 'reference';
export const LESSON_PATH: LessonRoute[] = ['radar', 'tws', 'missiles', 'defense', 'rwr', 'merge', 'sortie'];

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

/** First lesson in the path not done for this jet; null when all are done. */
export function nextLesson(id: FighterId, get: ProgressReader): LessonRoute | null {
  return LESSON_PATH.find(r => !isDone(r, id, get)) ?? null;
}
