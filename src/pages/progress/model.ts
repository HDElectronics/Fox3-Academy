/**
 * Read existing saved completions without changing or inferring lesson results.
 * The lesson path (order, labels) comes from src/app/lessonPath.ts; this module knows the goals each step's page
 * awards and their saved keys. A step is complete when every goal on its page is. The Learn bar (shell.ts, loaded
 * lazily), the Learn home and the Progress page all read `pathProgress`.
 */
import { JDAM_ORDER, JDAM_LESSONS, jdamKey } from '../jdam/lessons';
import { LESSON_ORDER as ATFLIR_ORDER, LESSONS as ATFLIR_LESSONS, progressKey as atflirKey } from '../atflir/lessons';
import { AIRCRAFT_ORDER, isFighter } from '../../data/aircraft';
import type { AircraftId } from '../../data/types';
import { FLIGHT_OPS } from '../../data/flightOps';
import { isDone, type LessonRoute, type ProgressReader } from '../../app/learningProgress';
import { flyLinkFor, lessonSteps, pathStatus, routeOf, type FlyLink, type LessonLink, type PathStatus } from '../../app/lessonPath';
import { LESSONS, LESSON_ORDER, progressKey } from '../strike/lessons';
import { lessonOrder, lessonsFor, progressKey as casProgressKey } from '../cas/lessons';
import { LESSONS as TGP_LESSONS, TGP_LESSON_ORDER, progressKey as tgpProgressKey } from '../tgp/lessons';
import { LESSONS as HARM_LESSONS, HARM_PROGRESS_ORDER, progressKey as harmProgressKey } from '../harm/lessons';

export interface ProgressGoal {
  id: string;
  label: string;
  /** Hash link that also selects the jet ('#/tws?ac=f15c'). */
  href: string;
  /** Route path and query without the jet ('tws', 'harm?lesson=sp'), for links inside the selected jet. */
  path: string;
  done: boolean;
}
export interface StepProgress {
  link: LessonLink;
  goals: ProgressGoal[];
  done: number;
  total: number;
  complete: boolean;
  /** First goal left on this page; null when complete. */
  next: ProgressGoal | null;
}
export interface PathProgress {
  id: AircraftId;
  steps: StepProgress[];
  /** The Fly hand-off after the last step, and whether its sortie has been flown. */
  fly: FlyLink & { done: boolean };
  /** Position and next step, seen from outside the path (Learn home, Progress). */
  status: PathStatus;
}
export interface JetProgress {
  id: AircraftId;
  goals: ProgressGoal[];
  completed: number;
  total: number;
  next: ProgressGoal | null;
  scores: { label: string; value: string }[];
}
const LABELS: Record<Exclude<LessonRoute, 'reference'>, string> = { radar: 'Radar', tws: 'Track while scan', missiles: 'Missile lab',
  defense: 'Missile defense', rwr: 'RWR trainer', merge: 'Merge & guns', sortie: 'BVR sortie' };

/** Include aircraft selection in links; the router consumes it once before mounting the lesson. */
export function progressHref(path: string, aircraft: AircraftId): string {
  return '#/' + path + (path.includes('?') ? '&' : '?') + 'ac=' + aircraft;
}

const goal = (id: string, label: string, path: string, jet: AircraftId, done: boolean): ProgressGoal =>
  ({ id, label, path, href: progressHref(path, jet), done });

/** The goals a step's page awards for this jet, in the page's own order. */
export function stepGoals(jet: AircraftId, link: LessonLink, get: ProgressReader): ProgressGoal[] {
  const route = routeOf(link.path);
  switch (route) {
    case 'radar': case 'tws': case 'missiles': case 'defense': case 'rwr': case 'merge': {
      if (!isFighter(jet)) return [];
      return [goal(route, LABELS[route], link.path, jet, isDone(route, jet, get))];
    }
    case 'flight-ops': {
      if (!isFighter(jet)) return [];
      const flight = FLIGHT_OPS[jet];
      const out: ProgressGoal[] = [];
      const add = (key: string, label: string, start: string) => out.push(goal('flight-' + key, label,
        `flight-ops?mode=fly&start=${start}`, jet, get(`flight-ops:${jet}:${key}`) === true));
      add('done', 'Pattern & landing', 'initial');
      add('takeoff', 'Runway takeoff', 'takeoff');
      if (flight.carrier) add('carrier', 'Carrier landing', 'caseI');
      if (flight.launch) add('launch', 'Carrier launch', flight.launch.kind === 'skiJump' ? 'skiJump' : 'catapult');
      if (flight.aar) add('aar', 'Air-to-air refuelling', 'aarRejoin');
      return out;
    }
    case 'harm': return HARM_PROGRESS_ORDER.map(l => goal(`harm-${l}`, `HARM: ${HARM_LESSONS[l].title}`, `harm?lesson=${l}`, jet, get(harmProgressKey(l)) === true));
    case 'atflir': return ATFLIR_ORDER.map(l => goal(`atflir-${l}`, `ATFLIR: ${ATFLIR_LESSONS[l].title}`, `atflir?lesson=${l}`, jet, get(atflirKey(l)) === true));
    case 'jdam': return JDAM_ORDER.map(l => goal(`jdam-${l}`, `JDAM: ${JDAM_LESSONS[l].title}`, `jdam?lesson=${l}`, jet, get(jdamKey(l)) === true));
    case 'strike': return LESSON_ORDER.map(l => goal(l, LESSONS[l].title, `strike?lesson=${l}`, jet, get(progressKey(l)) === true));
    case 'tgp': return TGP_LESSON_ORDER.map(l => goal(`tgp-${l}`, TGP_LESSONS[l].title, `tgp?lesson=${l}`, jet, get(tgpProgressKey(l)) === true));
    case 'cas': {
      const casJet = jet === 'a10c' ? 'a10c' : 'su25t';
      const lessons = lessonsFor(casJet);
      return lessonOrder(casJet).map(l => goal(`cas-${l}`, `CAS: ${lessons[l].title}`, `cas?lesson=${l}`, jet, get(casProgressKey(l, jet)) === true));
    }
    default: return [];
  }
}

function stepProgress(jet: AircraftId, link: LessonLink, get: ProgressReader): StepProgress {
  const goals = stepGoals(jet, link, get);
  const done = goals.filter(g => g.done).length;
  return { link, goals, done, total: goals.length, complete: goals.length > 0 && done === goals.length, next: goals.find(g => !g.done) ?? null };
}

/** Fighters fly the BVR sortie ('sortie:<id>:done'); an attack jet's sortie is a lesson on one of its own pages. */
function flyDone(jet: AircraftId, steps: readonly StepProgress[], get: ProgressReader): boolean {
  if (isFighter(jet)) return isDone('sortie', jet, get);
  const fly = flyLinkFor(jet);
  return steps.flatMap(s => s.goals).some(g => g.path === fly.path && g.done);
}

/** The jet's lesson path with each step's goals and completion, the Fly hand-off, and where to continue. */
export function pathProgress(jet: AircraftId, get: ProgressReader): PathProgress {
  const steps = lessonSteps(jet).map(link => stepProgress(jet, link, get));
  const fly = { ...flyLinkFor(jet), done: flyDone(jet, steps, get) };
  return { id: jet, steps, fly, status: pathStatus(steps, null, fly) };
}

/** Where Continue goes: the first goal left on the next step (so it opens the right sub-lesson), else the step. */
export function continuePath(p: PathProgress): string {
  const i = p.status.next.index;
  return i === null ? p.status.next.path : p.steps[i]!.next?.path ?? p.steps[i]!.link.path;
}

/** Every goal the jet can complete, in path order. A fighter's BVR sortie comes last; an attack jet's sortie is a
 * goal of its own page already. */
export function jetProgress(id: AircraftId, get: ProgressReader): JetProgress {
  const path = pathProgress(id, get);
  const goals = path.steps.flatMap(s => s.goals);
  const scores: JetProgress['scores'] = [];
  if (isFighter(id)) {
    goals.push(goal('sortie', LABELS.sortie, 'sortie', id, path.fly.done));
    const rwr = get(`rwr:${id}:best`);
    const sortie = get(`sortie:${id}:best`);
    if (typeof rwr === 'number' && Number.isFinite(rwr) && rwr >= 0) scores.push({ label: 'Best RWR run', value: `${Math.floor(rwr)} correct` });
    if (typeof sortie === 'number' && Number.isFinite(sortie) && sortie >= 0 && sortie <= 100) scores.push({ label: 'Best winning sortie', value: `${Math.round(sortie)}/100` });
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
