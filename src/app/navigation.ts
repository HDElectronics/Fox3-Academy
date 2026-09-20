/** User-facing destinations; route names stay stable for existing deep links. */
export type Destination = 'learn' | 'practice' | 'fly' | 'reference';
export interface NavLink { path: string; label: string; description?: string }

export const DESTINATIONS: readonly (NavLink & { id: Destination })[] = [
  { id: 'learn', path: 'learn', label: 'Learn' },
  { id: 'practice', path: 'practice', label: 'Practice' },
  { id: 'fly', path: 'sortie', label: 'Fly' },
  { id: 'reference', path: 'reference', label: 'Reference' },
];

export const LESSON_LINKS: readonly NavLink[] = [
  { path: 'radar?ex=low', label: 'Radar' }, { path: 'tws', label: 'TWS' },
  { path: 'missiles', label: 'Missiles' }, { path: 'defense', label: 'Defense' },
  { path: 'rwr', label: 'RWR' },
];

export const PRACTICE_LINKS: readonly NavLink[] = [
  { path: 'tws?lab=free', label: 'Free TWS lab', description: 'Move the cursor, designate and unlock contacts, then choose when to launch. No lesson sequence.' },
  { path: 'radar?lab=free&ex=free', label: 'Radar experiment', description: 'Explore scan volume, elevation and target detection with the radar lab controls.' },
  { path: 'missiles?lab=free', label: 'Missile experiment', description: 'Change the launch setup and compare the simulated shot outcome.' },
  { path: 'defense?lab=free&drill=free', label: 'Defense practice', description: 'Choose a defensive setup and practise timing your response to an incoming missile.' },
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

export function contextualLinks(destination: Destination): readonly NavLink[] {
  return destination === 'learn' ? [{ path: 'learn', label: 'Lesson path' }, ...LESSON_LINKS]
    : destination === 'practice' ? [{ path: 'practice', label: 'All practice' }, ...PRACTICE_LINKS] : [];
}

/** Order-independent URL identity; repeated query values retain their relative order. */
export function queryIdentity(params: URLSearchParams): string {
  const sorted = new URLSearchParams(params);
  sorted.sort();
  return sorted.toString();
}
