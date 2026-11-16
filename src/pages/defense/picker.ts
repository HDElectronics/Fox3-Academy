/**
 * The Defense page's lesson picker, shared by the missile drill lab (index.ts) and the SAM drill lab (samLab.ts):
 * the four scored missile drills, then the three SAM sites as a group, and Free practice outside the numbering
 * (?lab=free&drill=free, the Practice link). Each drill is a ?drill= link. Done: a saved best score for the drill
 * ('defense:<jet>:<drill>', 'defense:<sam>:<jet>'), the keys the drills already write.
 */
import type { PageContext } from '../../app/page';
import type { FighterId } from '../../data/types';
import { lessonHref, lessonPicker, type LessonItem, type LessonPickerHandle } from '../../ui/lessonPicker';
import { DRILLS, SCORED_DRILLS, type DrillId } from './drills';
import { SAM_DRILLS, samShort, type SamDrillId } from './samRun';

export type DefenseLessonId = Exclude<DrillId, 'free'> | SamDrillId;
/** Picker order: missile drills 1 to 4, then the SAM sites. */
export const DEFENSE_LESSONS: readonly DefenseLessonId[] = [...(SCORED_DRILLS as Exclude<DrillId, 'free'>[]), ...SAM_DRILLS];
/** Free practice: the Practice row's link, so the top bar shows Practice. */
export const DEFENSE_FREE_PATH = 'defense?lab=free&drill=free';
/** Setup params that belong to one drill and do not travel into another drill's link. */
const DRILL_SETUP = ['threat', 'method', 'alt', 'ridge'];

const isSam = (id: string): id is SamDrillId => (SAM_DRILLS as string[]).includes(id);

/** Saved key of a drill's best score (any truthy value counts as done). */
export const defenseKey = (id: DefenseLessonId, ac: FighterId): string => (isSam(id) ? `defense:${id}:${ac}` : `defense:${ac}:${id}`);

/** Short name: 'Break lock', 'SA-10 site'. */
export function defenseLabel(id: DefenseLessonId | 'free'): string {
  if (id === 'free') return DRILLS.free.title;
  return isSam(id) ? `${samShort(id)} site` : DRILLS[id].cap;
}

/** The drill after this one in the picker, or null after the last. Free practice leads back to the first drill. */
export function nextDefenseLesson(id: DrillId | SamDrillId): DefenseLessonId | null {
  if (id === 'free') return DEFENSE_LESSONS[0]!;
  const i = DEFENSE_LESSONS.indexOf(id);
  return DEFENSE_LESSONS[i + 1] ?? null;
}

/** Link to a drill, keeping the page's other params (camera...) but not another drill's setup or free mode. */
export const defenseHref = (id: DefenseLessonId, params: URLSearchParams): string =>
  lessonHref('defense', params, { drill: id, lab: null }, DRILL_SETUP);

export function defensePicker(ctx: PageContext, value: DefenseLessonId | null, params: () => URLSearchParams): LessonPickerHandle<DefenseLessonId> {
  const ac = ctx.app.aircraft;
  const best = (id: DefenseLessonId) => Number(ctx.app.getProgress(defenseKey(id, ac)) ?? 0) || 0;
  const items = (): LessonItem<DefenseLessonId>[] => DEFENSE_LESSONS.map((id, i) => {
    const b = best(id);
    return {
      id, label: isSam(id) ? samShort(id) : DRILLS[id].cap, title: isSam(id) ? `${samShort(id)} site` : DRILLS[id].title,
      done: !!ctx.app.getProgress(defenseKey(id, ac)), note: b > 0 ? `best ${b}` : undefined, group: i > 0 && isSam(id) && !isSam(DEFENSE_LESSONS[i - 1]!),
    };
  });
  const picker = lessonPicker<DefenseLessonId>({
    id: 'dfn-lessons', topic: 'Defense', noun: 'Drill', header: false, value, items: items(),
    href: id => defenseHref(id, params()),
    free: { label: 'Free practice', href: '#/' + DEFENSE_FREE_PATH, title: 'Any threat, shooter and range; not a scored drill' },
  });
  const off = ctx.app.subscribe((_, what) => { if (what === 'progress') picker.setItems(items()); });
  return { ...picker, get value() { return picker.value; }, destroy() { off(); picker.destroy(); } };
}
