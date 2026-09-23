import { describe, expect, it } from 'vitest';
import { contextualLinks, destinationFor, lessonPath, PRACTICE_LINKS, queryIdentity } from './navigation';
import { routeFor } from './routes';

describe('navigation destinations', () => {
  it('keeps old deep links and the Learn alias pointing to the same page', () => {
    expect(routeFor('learn')).toBe(routeFor('hangar'));
    for (const path of ['radar', 'tws', 'missiles', 'defense', 'rwr', 'sortie', 'reference']) expect(routeFor(path).path).toBe(path);
    expect(routeFor('missing').path).toBe('hangar');
  });
  it('distinguishes lessons from practice without changing Fly or Reference', () => {
    expect(destinationFor('tws')).toBe('learn');
    for (const link of PRACTICE_LINKS) {
      const [path, query] = link.path.split('?');
      expect(destinationFor(path!, new URLSearchParams(query))).toBe('practice');
      expect(routeFor(path!).path).toBe(path);
    }
    expect(destinationFor('sortie', new URLSearchParams('lab=free'))).toBe('fly');
    expect(destinationFor('reference')).toBe('reference');
    expect(contextualLinks('fly')).toEqual([]);
  });
  it('opens a guided radar exercise from Learn and free scan from Practice', () => {
    expect(lessonPath('radar')).toBe('radar?ex=low');
    expect(PRACTICE_LINKS.find(link => link.path.startsWith('radar?'))?.path).toBe('radar?lab=free&ex=free');
  });
  it('has no cockpit explorer until a community contribution lands; old links open the hangar', () => {
    expect(routeFor('cockpit').path).toBe('hangar');
    for (const destination of ['learn', 'practice', 'reference'] as const) {
      expect(contextualLinks(destination).some(link => link.path.startsWith('cockpit'))).toBe(false);
    }
  });
  it('ignores query ordering but preserves changes of lab, exercise, and repeated values', () => {
    expect(queryIdentity(new URLSearchParams('lab=free&ex=low'))).toBe(queryIdentity(new URLSearchParams('ex=low&lab=free')));
    expect(queryIdentity(new URLSearchParams('lab=free'))).not.toBe(queryIdentity(new URLSearchParams()));
    expect(queryIdentity(new URLSearchParams('x=1&x=2'))).not.toBe(queryIdentity(new URLSearchParams('x=2&x=1')));
  });
});
