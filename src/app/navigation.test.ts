import { describe, expect, it } from 'vitest';
import { AIRCRAFT_ORDER, FIGHTER_ORDER } from '../data/aircraft';
import { contextualLinks, destinationFor, LESSON_LINKS, lessonGroups, lessonPath, linkOpensFor, PRACTICE_LINKS, queryIdentity } from './navigation';
import { jetAllowed } from './roleGate';
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
    expect(contextualLinks('fly', 'f15c')).toEqual([]);
  });
  it('opens a guided radar exercise from Learn and free scan from Practice', () => {
    expect(lessonPath('radar')).toBe('radar?ex=low');
    expect(PRACTICE_LINKS.find(link => link.path.startsWith('radar?'))?.path).toBe('radar?lab=free&ex=free');
  });
  it('has no cockpit explorer until a community contribution lands; old links open the hangar', () => {
    expect(routeFor('cockpit').path).toBe('hangar');
    for (const destination of ['learn', 'practice', 'reference'] as const) {
      expect(contextualLinks(destination, 'f15c').some(link => link.path.startsWith('cockpit'))).toBe(false);
    }
  });
  it('makes fleet progress reachable from Learn without a fighter-only gate', () => {
    expect(routeFor('progress').path).toBe('progress');
    expect(destinationFor('progress')).toBe('learn');
    for (const id of AIRCRAFT_ORDER) expect(contextualLinks('learn', id), id).toContainEqual({ path: 'progress', label: 'Progress' });
  });
  it('ignores query ordering but preserves changes of lab, exercise, and repeated values', () => {
    expect(queryIdentity(new URLSearchParams('lab=free&ex=low'))).toBe(queryIdentity(new URLSearchParams('ex=low&lab=free')));
    expect(queryIdentity(new URLSearchParams('lab=free'))).not.toBe(queryIdentity(new URLSearchParams()));
    expect(queryIdentity(new URLSearchParams('x=1&x=2'))).not.toBe(queryIdentity(new URLSearchParams('x=2&x=1')));
  });
});

describe('the selected jet comes first', () => {
  const paths = (id: Parameters<typeof lessonGroups>[0]) => lessonGroups(id).flatMap(g => g.links.map(l => l.path.split('?')[0]));
  it('lists only pages the jet can open, so no Learn link lands on a role gate', () => {
    for (const id of AIRCRAFT_ORDER) {
      for (const link of contextualLinks('learn', id)) expect(jetAllowed(routeFor(link.path.split('?')[0]!), id), `${id} ${link.path}`).toBe(true);
      for (const link of contextualLinks('practice', id).slice(1)) expect(linkOpensFor(link, id), `${id} ${link.path}`).toBe(true);
    }
  });
  it('gives each jet its own list', () => {
    expect(paths('f15c')).toEqual(['radar', 'tws', 'missiles', 'defense', 'rwr', 'merge', 'flight-ops']);
    expect(paths('fa18c')).toEqual(['radar', 'tws', 'missiles', 'defense', 'rwr', 'merge', 'flight-ops', 'harm', 'atflir']);
    expect(paths('su25t')).toEqual(['strike', 'cas']);
    expect(paths('a10c')).toEqual(['tgp', 'cas']);
    for (const id of FIGHTER_ORDER) expect(paths(id).slice(0, 7), id).toEqual(paths('f15c'));
  });
  it('groups BVR, close combat, flying, then the pages of the jet itself under its name', () => {
    expect(lessonGroups('fa18c').map(g => [g.id, g.label])).toEqual([['bvr', 'BVR'], ['close', 'Close combat'], ['flying', 'Flying'], ['jet', 'F/A-18C']]);
    expect(lessonGroups('f15c').map(g => g.id)).toEqual(['bvr', 'close', 'flying']);
    expect(lessonGroups('su25t').map(g => g.label)).toEqual(['Su-25T']);
    // Every lesson link opens for at least one jet.
    for (const link of LESSON_LINKS) expect(AIRCRAFT_ORDER.some(id => linkOpensFor(link, id)), link.path).toBe(true);
  });
  it('drops fighter labs from Practice for the attack jets', () => {
    expect(contextualLinks('practice', 'su25t')).toEqual([{ path: 'practice', label: 'All practice' }]);
    expect(contextualLinks('practice', 'f16c')).toHaveLength(PRACTICE_LINKS.length + 1);
  });
});
