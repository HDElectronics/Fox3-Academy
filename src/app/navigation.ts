/**
 * User-facing destinations and the second-row links. The selected jet comes first: Learn shows the jet's lesson
 * path (lessonPath.ts) and Practice its labs, both limited to pages that jet can open (routes.ts `roles` / `jets`,
 * read through roleGate.ts). Route names stay stable for existing deep links.
 */
import { AIRCRAFT } from '../data/aircraft';
import type { AircraftId, AttackId } from '../data/types';
import { ATTACK_SORTIE, LESSON_LINKS, lessonSteps, linkOpensFor, routeOf } from './lessonPath';
import type { RouteDef } from './routes';

export { ATTACK_SORTIE, LESSON_LINKS, lessonPath, linkOpensFor } from './lessonPath';
export type { LessonGroupId, LessonLink } from './lessonPath';

export type Destination = 'learn' | 'practice' | 'fly' | 'reference';
export interface NavLink { path: string; label: string; description?: string }

export const DESTINATIONS: readonly (NavLink & { id: Destination })[] = [
  { id: 'learn', path: 'learn', label: 'Learn' },
  { id: 'practice', path: 'practice', label: 'Practice' },
  { id: 'fly', path: 'sortie', label: 'Fly' },
  { id: 'reference', path: 'reference', label: 'Reference' },
];

/** The top-bar destinations for a jet: Fly points at the jet's own sortie, and a destination the jet cannot open
 * (Practice, whose labs are all BVR, for an attack jet) is left out, so no top-bar link lands on the role gate. */
export function destinationsFor(jet: AircraftId): (NavLink & { id: Destination })[] {
  const sortie = AIRCRAFT[jet].role === 'attack' ? ATTACK_SORTIE[jet as AttackId] : undefined;
  return DESTINATIONS.map(d => (d.id === 'fly' && sortie ? { ...d, path: sortie } : d)).filter(d => linkOpensFor(d, jet));
}

export const PRACTICE_LINKS: readonly NavLink[] = [
  { path: 'tws?lab=free', label: 'Free TWS lab', description: 'Move the cursor, designate and unlock contacts, then choose when to launch. No lesson sequence.' },
  { path: 'radar?lab=free&ex=free', label: 'Radar practice', description: 'Explore scan volume, elevation and target detection with the radar lab controls.' },
  { path: 'missiles?lab=free', label: 'Missile practice', description: 'Change the launch setup and compare the simulated shot outcome.' },
  { path: 'defense?lab=free&drill=free', label: 'Defense practice', description: 'Choose a defensive setup and practise timing your response to an incoming missile.' },
  { path: 'merge?lab=free', label: 'Free fight', description: 'Merge head-on with a scripted bandit and fight with the gun. Pick how he flies.' },
  { path: 'flight-ops?lab=free&mode=fly', label: 'Fly the pattern', description: 'Fly the overhead break and the approach yourself, then read the graded debrief.' },
];

/** Reference's second row: the kneeboard and the 3D model viewer. Both pages open for every jet. */
export const REFERENCE_LINKS: readonly NavLink[] = [
  { path: 'reference', label: 'Kneeboard' },
  { path: 'models', label: '3D models', description: 'Every 3D model the app ships, at true size, with a side-by-side compare.' },
];

export function destinationFor(path: string, params = new URLSearchParams(), jet?: AircraftId): Destination {
  if (path === 'sortie') return 'fly';
  const sortie = jet && AIRCRAFT[jet].role === 'attack' ? ATTACK_SORTIE[jet as AttackId] : undefined;
  if (sortie && sortie === `${path}?lesson=${params.get('lesson')}`) return 'fly';
  if (REFERENCE_LINKS.some(link => routeOf(link.path) === path)) return 'reference';
  if (path === 'practice' || (params.get('lab') === 'free' && LESSON_LINKS.some(link => routeOf(link.path) === path))) return 'practice';
  return 'learn';
}

/** Second-row links for Practice, Reference and Fly. Learn's second row is the jet's lesson path (lessonSteps). */
export function contextualLinks(destination: Destination, jet: AircraftId): readonly NavLink[] {
  if (destination === 'learn') return lessonSteps(jet);
  if (destination === 'practice') return [{ path: 'practice', label: 'All practice' }, ...PRACTICE_LINKS.filter(link => linkOpensFor(link, jet))];
  if (destination === 'reference') return REFERENCE_LINKS.filter(link => linkOpensFor(link, jet));
  const fly = destinationsFor(jet).find(d => d.id === 'fly');
  return fly ? [{ path: fly.path, label: 'Sortie' }] : [];
}

/** Browser tab title: the page, the jet, the app. A practice lab is named as the Practice row names it. */
export function pageTitle(route: Pick<RouteDef, 'path' | 'label'>, params: URLSearchParams, jet: AircraftId): string {
  const destination = destinationFor(route.path, params, jet);
  const lab = destination === 'practice' ? PRACTICE_LINKS.find(link => routeOf(link.path) === route.path) : undefined;
  const page = route.path === 'hangar' ? 'Learn' : destination === 'fly' ? 'Sortie' : lab?.label ?? route.label;
  return `${page} · ${AIRCRAFT[jet].short} · Fox3 Academy`;
}

/** Order-independent URL identity; repeated query values retain their relative order. */
export function queryIdentity(params: URLSearchParams): string {
  const sorted = new URLSearchParams(params);
  sorted.sort();
  return sorted.toString();
}
