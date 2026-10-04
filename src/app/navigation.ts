/**
 * User-facing destinations and the second-row links. The selected jet comes first: Learn and Practice list only the
 * pages that jet can open (routes.ts `roles` / `jets`, read through roleGate.ts), Learn grouped. Route names stay
 * stable for existing deep links.
 */
import { AIRCRAFT } from '../data/aircraft';
import type { AircraftId } from '../data/types';
import { jetAllowed } from './roleGate';
import { routeFor } from './routes';

export type Destination = 'learn' | 'practice' | 'fly' | 'reference';
export interface NavLink { path: string; label: string; description?: string }
/** Learn bar groups. `jet` holds the pages a jet has beyond the shared fighter set; its label is the jet's name. */
export type LessonGroupId = 'bvr' | 'close' | 'flying' | 'jet';
export interface LessonLink extends NavLink { group: LessonGroupId }
export interface LessonGroup { id: LessonGroupId; label: string; links: LessonLink[] }
const GROUP_LABEL: Record<Exclude<LessonGroupId, 'jet'>, string> = { bvr: 'BVR', close: 'Close combat', flying: 'Flying' };
const GROUP_ORDER: readonly LessonGroupId[] = ['bvr', 'close', 'flying', 'jet'];

export const DESTINATIONS: readonly (NavLink & { id: Destination })[] = [
  { id: 'learn', path: 'learn', label: 'Learn' },
  { id: 'practice', path: 'practice', label: 'Practice' },
  { id: 'fly', path: 'sortie', label: 'Fly' },
  { id: 'reference', path: 'reference', label: 'Reference' },
];

export const LESSON_LINKS: readonly LessonLink[] = [
  { path: 'radar?ex=low', label: 'Radar', group: 'bvr' }, { path: 'tws', label: 'TWS', group: 'bvr' },
  { path: 'missiles', label: 'Missiles', group: 'bvr' }, { path: 'defense', label: 'Defense', group: 'bvr' },
  { path: 'rwr', label: 'RWR', group: 'bvr' },
  { path: 'merge', label: 'Merge & guns', group: 'close' },
  { path: 'flight-ops', label: 'Pattern & landing', group: 'flying' },
  { path: 'harm', label: 'HARM & SEAD', group: 'jet' },
  { path: 'strike', label: 'Shkval & Vikhr', group: 'jet' },
  { path: 'tgp', label: 'Targeting pod & Mavericks', group: 'jet' },
  { path: 'cas', label: 'CAS & JTAC', group: 'jet' },
];

/** True when the link's route accepts the jet (no role gate on arrival). */
export const linkOpensFor = (link: NavLink, jet: AircraftId): boolean => jetAllowed(routeFor(link.path.split('?')[0]!), jet);

/** The jet's lessons, grouped, empty groups dropped. */
export function lessonGroups(jet: AircraftId): LessonGroup[] {
  const links = LESSON_LINKS.filter(link => linkOpensFor(link, jet));
  return GROUP_ORDER.map(id => ({ id, label: id === 'jet' ? AIRCRAFT[jet].short : GROUP_LABEL[id], links: links.filter(l => l.group === id) }))
    .filter(g => g.links.length > 0);
}

export const PRACTICE_LINKS: readonly NavLink[] = [
  { path: 'tws?lab=free', label: 'Free TWS lab', description: 'Move the cursor, designate and unlock contacts, then choose when to launch. No lesson sequence.' },
  { path: 'radar?lab=free&ex=free', label: 'Radar experiment', description: 'Explore scan volume, elevation and target detection with the radar lab controls.' },
  { path: 'missiles?lab=free', label: 'Missile experiment', description: 'Change the launch setup and compare the simulated shot outcome.' },
  { path: 'defense?lab=free&drill=free', label: 'Defense practice', description: 'Choose a defensive setup and practise timing your response to an incoming missile.' },
  { path: 'merge?lab=free', label: 'Free fight', description: 'Merge head-on with a scripted bandit and fight with the gun. Pick how he flies.' },
  { path: 'flight-ops?lab=free&mode=fly', label: 'Fly the pattern', description: 'Fly the overhead break and the approach yourself, then read the graded debrief.' },
];

export function destinationFor(path: string, params = new URLSearchParams()): Destination {
  if (path === 'sortie') return 'fly';
  if (path === 'reference') return 'reference';
  if (path === 'practice' || (params.get('lab') === 'free' && LESSON_LINKS.some(link => link.path.split('?')[0] === path))) return 'practice';
  return 'learn';
}

export function lessonPath(route: string): string {
  return LESSON_LINKS.find(link => link.path.split('?')[0] === route)?.path ?? route;
}

/** Second-row links for a destination and the selected jet: Learn lists only the jet's lessons, Practice its labs. */
export function contextualLinks(destination: Destination, jet: AircraftId): readonly NavLink[] {
  return destination === 'learn' ? [...LEARN_HOME, ...lessonGroups(jet).flatMap(g => g.links)]
    : destination === 'practice' ? [{ path: 'practice', label: 'All practice' }, ...PRACTICE_LINKS.filter(link => linkOpensFor(link, jet))]
      : destination === 'reference' ? [{ path: 'reference', label: 'Kneeboard' }] : [];
}
/** The two Learn links before the lesson groups. */
export const LEARN_HOME: readonly NavLink[] = [{ path: 'learn', label: 'Lesson path' }, { path: 'progress', label: 'Progress' }];

/** Order-independent URL identity; repeated query values retain their relative order. */
export function queryIdentity(params: URLSearchParams): string {
  const sorted = new URLSearchParams(params);
  sorted.sort();
  return sorted.toString();
}
