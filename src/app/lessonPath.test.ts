import { describe, expect, it } from 'vitest';
import { AIRCRAFT_ORDER, FIGHTER_ORDER } from '../data/aircraft';
import { destinationFor, destinationsFor } from './navigation';
import {
  LESSON_LINKS, flyLinkFor, lessonSteps, linkOpensFor, nextText, nextVerb, pathStatus, routeOf, stepIndexOf, type StepState,
} from './lessonPath';
import { routeFor } from './routes';

const routes = (id: Parameters<typeof lessonSteps>[0]) => lessonSteps(id).map(l => routeOf(l.path));
const states = (id: Parameters<typeof lessonSteps>[0], done: number[] = []): StepState[] =>
  lessonSteps(id).map((link, i) => ({ link, complete: done.includes(i) }));

describe('lesson path per jet', () => {
  it('gives every fighter the BVR steps, close combat, then the pattern', () => {
    const shared = ['radar', 'tws', 'missiles', 'defense', 'rwr', 'merge', 'flight-ops'];
    for (const id of FIGHTER_ORDER) expect(routes(id).slice(0, 7), id).toEqual(shared);
    expect(routes('f15c')).toEqual(shared);
  });
  it('adds the Hornet\'s own pages after the shared path', () => {
    expect(routes('fa18c')).toEqual(['radar', 'tws', 'missiles', 'defense', 'rwr', 'merge', 'flight-ops', 'harm', 'atflir', 'jdam']);
  });
  it('starts the attack jets in their own cockpit, then CAS', () => {
    expect(routes('su25t')).toEqual(['strike', 'cas']);
    expect(routes('a10c')).toEqual(['tgp', 'cas']);
  });
  it('only lists pages the jet can open, with a label and a title each', () => {
    for (const id of AIRCRAFT_ORDER) {
      expect(lessonSteps(id).length, id).toBeGreaterThan(0);
      for (const link of lessonSteps(id)) {
        expect(linkOpensFor(link, id), `${id} ${link.path}`).toBe(true);
        expect(routeFor(routeOf(link.path)).path).toBe(routeOf(link.path));
        expect(link.label.length && link.title.length).toBeGreaterThan(0);
      }
    }
    expect(new Set(LESSON_LINKS.map(l => routeOf(l.path))).size).toBe(LESSON_LINKS.length);
  });
  it('keeps steps of one topic together, so the bar\'s dividers fall between topics', () => {
    for (const id of AIRCRAFT_ORDER) {
      const groups = lessonSteps(id).map(l => l.group);
      const runs = groups.filter((g, i) => i === 0 || g !== groups[i - 1]);
      expect(new Set(runs).size, id).toBe(runs.length);
    }
  });
  it('hands off to the jet\'s Fly destination', () => {
    for (const id of AIRCRAFT_ORDER) {
      const fly = flyLinkFor(id);
      expect(destinationsFor(id).find(d => d.id === 'fly')?.path, id).toBe(fly.path);
      const [path, query] = fly.path.split('?');
      expect(destinationFor(path!, new URLSearchParams(query), id), id).toBe('fly');
    }
  });
});

describe('position and next step', () => {
  const fly = flyLinkFor('f15c');
  it('finds a step by its route, ignoring the default query', () => {
    expect(stepIndexOf(lessonSteps('f15c'), 'radar')).toBe(0);
    expect(stepIndexOf(lessonSteps('f15c'), 'harm')).toBeNull();
    expect(stepIndexOf(lessonSteps('f15c'), null)).toBeNull();
  });
  it('on a step: shows its number and the following step, lit once the step is done', () => {
    const open = pathStatus(states('f15c'), 'tws', fly);
    expect(open).toMatchObject({ current: 1, total: 7, doneCount: 0, ready: false, complete: false });
    expect(open.next).toMatchObject({ kind: 'step', index: 2, label: 'Missiles', path: 'missiles' });
    expect(nextText(open)).toBe('Next: Missiles');
    const done = pathStatus(states('f15c', [1]), 'tws', fly);
    expect(done.ready).toBe(true);
    expect(done.next.index).toBe(2);
  });
  it('stays sequential: Next after step 2 is step 3 even when 3 is already done', () => {
    expect(pathStatus(states('f15c', [2]), 'tws', fly).next.index).toBe(2);
  });
  it('hands the last step to Fly', () => {
    const last = pathStatus(states('f15c', [6]), 'flight-ops', fly);
    expect(last.next).toEqual({ kind: 'fly', index: null, label: 'Sortie', path: 'sortie' });
    expect(last.ready).toBe(true);
    expect(nextText(last)).toBe('Next: Fly a sortie');
    const hornet = pathStatus(states('fa18c'), 'jdam', flyLinkFor('fa18c'));
    expect(hornet).toMatchObject({ current: 9, total: 10 });
    expect(hornet.next.kind).toBe('fly');
    const hog = pathStatus(states('a10c'), 'cas', flyLinkFor('a10c'));
    expect(hog.next.path).toBe('cas?lesson=sortie');
  });
  it('off the path: Start, then Continue with the first step left, then Fly', () => {
    const start = pathStatus(states('su27'), null, fly);
    expect(start).toMatchObject({ current: null, doneCount: 0, ready: false });
    expect(nextText(start)).toBe('Start: Radar');
    const mid = pathStatus(states('su27', [0, 1, 3]), null, fly);
    expect(nextVerb(mid)).toBe('Continue');
    expect(mid.next).toMatchObject({ index: 2, label: 'Missiles' });
    const all = pathStatus(states('su27', [0, 1, 2, 3, 4, 5, 6]), null, fly);
    expect(all.complete).toBe(true);
    expect(all.next.kind).toBe('fly');
    expect(nextText(all)).toBe('Fly a sortie');
  });
  it('treats a page outside this jet\'s path as off the path', () => {
    expect(pathStatus(states('su27'), 'harm', fly).current).toBeNull();
    expect(pathStatus(states('su27'), 'progress', fly).current).toBeNull();
  });
});
