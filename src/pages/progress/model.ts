/** Read existing saved completions without changing or inferring lesson results. */
import { AIRCRAFT_ORDER, isFighter } from '../../data/aircraft';
import type { AircraftId } from '../../data/types';
import { FLIGHT_OPS } from '../../data/flightOps';
import { LESSON_PATH, isDone, type ProgressReader } from '../../app/learningProgress';
import { lessonPath } from '../../app/navigation';
import { LESSONS, LESSON_ORDER, progressKey } from '../strike/lessons';

export interface ProgressGoal { id: string; label: string; href: string; done: boolean }
export interface JetProgress {
  id: AircraftId;
  goals: ProgressGoal[];
  completed: number;
  total: number;
  next: ProgressGoal | null;
  scores: { label: string; value: string }[];
}
const LABELS = { radar: 'Radar', tws: 'Track while scan', missiles: 'Missile lab', defense: 'Missile defense',
  rwr: 'RWR trainer', merge: 'Merge & guns', sortie: 'BVR sortie' } as const;

/** Include aircraft selection in links; the router consumes it once before mounting the lesson. */
export function progressHref(path: string, aircraft: AircraftId): string {
  return '#/' + path + (path.includes('?') ? '&' : '?') + 'ac=' + aircraft;
}

export function jetProgress(id: AircraftId, get: ProgressReader): JetProgress {
  const goals: ProgressGoal[] = [];
  const scores: JetProgress['scores'] = [];
  if (isFighter(id)) {
    for (const route of LESSON_PATH) {
      if (route === 'reference') continue;
      goals.push({ id: route, label: LABELS[route], href: progressHref(lessonPath(route), id), done: isDone(route, id, get) });
    }
    const flight = FLIGHT_OPS[id];
    const add = (key: string, label: string, start: string) => goals.push({ id: 'flight-' + key, label,
      href: progressHref(`flight-ops?mode=fly&start=${start}`, id), done: get(`flight-ops:${id}:${key}`) === true });
    add('done', 'Pattern & landing', 'initial');
    add('takeoff', 'Runway takeoff', 'takeoff');
    if (flight.carrier) add('carrier', 'Carrier landing', 'caseI');
    if (flight.launch) add('launch', 'Carrier launch', flight.launch.kind === 'skiJump' ? 'skiJump' : 'catapult');
    if (flight.aar) add('aar', 'Air-to-air refuelling', 'aarRejoin');
    const rwr = get(`rwr:${id}:best`);
    const sortie = get(`sortie:${id}:best`);
    if (typeof rwr === 'number' && Number.isFinite(rwr) && rwr >= 0) scores.push({ label: 'Best RWR run', value: `${Math.floor(rwr)} correct` });
    if (typeof sortie === 'number' && Number.isFinite(sortie) && sortie >= 0 && sortie <= 100) scores.push({ label: 'Best winning sortie', value: `${Math.round(sortie)}/100` });
  } else {
    for (const lesson of LESSON_ORDER) goals.push({ id: lesson, label: LESSONS[lesson].title,
      href: progressHref(`strike?lesson=${lesson}`, id), done: get(progressKey(lesson)) === true });
  }
  return { id, goals, completed: goals.filter(g => g.done).length, total: goals.length,
    next: goals.find(g => !g.done) ?? null, scores };
}

export function fleetProgress(get: ProgressReader): JetProgress[] {
  return AIRCRAFT_ORDER.map(id => jetProgress(id, get));
}

export function progressTotals(jets: readonly JetProgress[]) {
  return { completed: jets.reduce((n, j) => n + j.completed, 0), total: jets.reduce((n, j) => n + j.total, 0),
    started: jets.filter(j => j.completed > 0).length, finished: jets.filter(j => j.completed === j.total).length };
}

/** Screenshot fixtures are read-only and never enter AppStore/localStorage. */
export function previewProgress(shot: string | null): ProgressReader | null {
  if (shot === 'empty') return () => undefined;
  if (shot === 'complete') return key => key.endsWith(':best') ? undefined : true;
  if (shot !== 'mixed') return null;
  const values: Record<string, number | boolean> = {
    'radar:su27:done': true, 'tws:su27:done': true, 'missiles:su27:done': true,
    'radar:f15c:done': true, 'sortie:f15c:done': true, 'sortie:f15c:best': 86,
    'rwr:f15c:best': 12, 'rwr:f15c:done': true, 'flight-ops:su33:carrier': true,
    'strike:shkval:su25t': true, 'strike:laser:su25t': true,
  };
  return key => values[key];
}
