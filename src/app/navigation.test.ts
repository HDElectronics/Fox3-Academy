import { describe, expect, it } from 'vitest';
import { AIRCRAFT_ORDER, FIGHTER_ORDER } from '../data/aircraft';
import { ATTACK_SORTIE, contextualLinks, destinationFor, destinationsFor, LESSON_LINKS, lessonPath, linkOpensFor, pageTitle, PRACTICE_LINKS, queryIdentity } from './navigation';
import { lessonSteps } from './lessonPath';
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
  it('keeps fleet progress inside Learn but off the lesson row, for every role', () => {
    expect(routeFor('progress').path).toBe('progress');
    expect(destinationFor('progress')).toBe('learn');
    for (const id of AIRCRAFT_ORDER) {
      expect(jetAllowed(routeFor('progress'), id), id).toBe(true);
      expect(contextualLinks('learn', id).some(link => link.path === 'progress'), id).toBe(false);
    }
  });
  it('ignores query ordering but preserves changes of lab, exercise, and repeated values', () => {
    expect(queryIdentity(new URLSearchParams('lab=free&ex=low'))).toBe(queryIdentity(new URLSearchParams('ex=low&lab=free')));
    expect(queryIdentity(new URLSearchParams('lab=free'))).not.toBe(queryIdentity(new URLSearchParams()));
    expect(queryIdentity(new URLSearchParams('x=1&x=2'))).not.toBe(queryIdentity(new URLSearchParams('x=2&x=1')));
  });
});

describe('the second row for each destination', () => {
  it('is the lesson path on Learn, the labs on Practice, the page itself on Reference and Fly', () => {
    expect(contextualLinks('learn', 'f15c')).toEqual(lessonSteps('f15c'));
    expect(contextualLinks('practice', 'f15c')[0]).toEqual({ path: 'practice', label: 'All practice' });
    expect(contextualLinks('reference', 'su27')).toEqual([{ path: 'reference', label: 'Kneeboard' }]);
    expect(contextualLinks('fly', 'f15c')).toEqual([{ path: 'sortie', label: 'Sortie' }]);
    expect(contextualLinks('fly', 'a10c')).toEqual([{ path: 'cas?lesson=sortie', label: 'Sortie' }]);
  });
  it('lists only pages the jet can open, so no row link lands on a role gate', () => {
    for (const id of AIRCRAFT_ORDER) {
      // Practice is no top-bar destination for an attack jet; its hub is only a deep link there.
      for (const destination of destinationsFor(id).map(d => d.id)) {
        for (const link of contextualLinks(destination, id)) expect(linkOpensFor(link, id), `${id} ${destination} ${link.path}`).toBe(true);
      }
    }
  });
  it('drops fighter labs from Practice for the attack jets', () => {
    expect(contextualLinks('practice', 'su25t')).toEqual([{ path: 'practice', label: 'All practice' }]);
    expect(contextualLinks('practice', 'f16c')).toHaveLength(PRACTICE_LINKS.length + 1);
  });
  it('names practice labs the way their pages title them', () => {
    expect(PRACTICE_LINKS.map(l => l.label)).toEqual(['Free TWS lab', 'Radar practice', 'Missile practice', 'Defense practice', 'Free fight', 'Fly the pattern']);
  });
  it('keeps every lesson link reachable by at least one jet', () => {
    for (const link of LESSON_LINKS) expect(AIRCRAFT_ORDER.some(id => linkOpensFor(link, id)), link.path).toBe(true);
  });
});

describe('top-bar destinations for every jet', () => {
  it('never sends a jet to the role gate', () => {
    for (const id of AIRCRAFT_ORDER) {
      for (const d of destinationsFor(id)) expect(linkOpensFor(d, id), `${id} ${d.id} ${d.path}`).toBe(true);
    }
  });
  it('keeps all four destinations and the BVR sortie for fighters', () => {
    for (const id of FIGHTER_ORDER) {
      expect(destinationsFor(id).map(d => d.id)).toEqual(['learn', 'practice', 'fly', 'reference']);
      expect(destinationsFor(id).find(d => d.id === 'fly')?.path).toBe('sortie');
    }
  });
  it('flies an attack jet to its own sortie lesson and hides the BVR practice labs', () => {
    expect(destinationsFor('su25t').map(d => [d.id, d.path])).toEqual([['learn', 'learn'], ['fly', 'strike?lesson=sortie'], ['reference', 'reference']]);
    expect(destinationsFor('a10c').find(d => d.id === 'fly')?.path).toBe('cas?lesson=sortie');
    expect(destinationsFor('a10c').some(d => d.id === 'practice')).toBe(false);
  });
  it('lights Fly on the jet\'s own sortie lesson only', () => {
    for (const [jet, path] of Object.entries(ATTACK_SORTIE) as [keyof typeof ATTACK_SORTIE, string][]) {
      const [route, query] = path.split('?');
      expect(destinationFor(route!, new URLSearchParams(query), jet)).toBe('fly');
      expect(destinationFor(route!, new URLSearchParams('lesson=nine-line'), jet)).toBe('learn');
    }
    // The Su-25T also flies the CAS sortie lesson, but Fly points at its Shkval & Vikhr sortie.
    expect(destinationFor('cas', new URLSearchParams('lesson=sortie'), 'su25t')).toBe('learn');
  });
  it('opens the reference kneeboard for the attack jets', () => {
    for (const id of AIRCRAFT_ORDER) expect(jetAllowed(routeFor('reference'), id), id).toBe(true);
  });
});

describe('browser tab titles', () => {
  const title = (path: string, query = '', jet: Parameters<typeof pageTitle>[2] = 'su27') => pageTitle(routeFor(path), new URLSearchParams(query), jet);
  it('names the page, the jet and the app', () => {
    expect(title('hangar')).toBe('Learn · Su-27 · Fox3 Academy');
    expect(title('tws')).toBe('TWS · Su-27 · Fox3 Academy');
    expect(title('flight-ops', '', 'fa18c')).toBe('Pattern & landing · F/A-18C · Fox3 Academy');
    expect(title('reference', '', 'a10c')).toBe('Reference · A-10C II · Fox3 Academy');
  });
  it('names practice labs as Practice does and sorties as Fly does', () => {
    expect(title('tws', 'lab=free')).toBe('Free TWS lab · Su-27 · Fox3 Academy');
    expect(title('radar', 'lab=free&ex=free', 'f15c')).toBe('Radar practice · F-15C · Fox3 Academy');
    expect(title('sortie', '', 'f15c')).toBe('Sortie · F-15C · Fox3 Academy');
    expect(title('strike', 'lesson=sortie', 'su25t')).toBe('Sortie · Su-25T · Fox3 Academy');
    expect(title('strike', 'lesson=shkval', 'su25t')).toBe('Shkval & Vikhr · Su-25T · Fox3 Academy');
  });
});
