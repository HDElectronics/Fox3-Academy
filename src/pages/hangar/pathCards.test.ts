import { describe, expect, it } from 'vitest';
import { AIRCRAFT, AIRCRAFT_ORDER } from '../../data/aircraft';
import { lessonSteps } from '../../app/lessonPath';
import { pathProgress } from '../progress/model';
import { fighterSpecOf, flyCard, ownTitle, pathCards } from './pathCards';

const none = () => undefined;
const cards = (jet: Parameters<typeof pathProgress>[0], get: (k: string) => boolean | undefined = none) =>
  pathCards(pathProgress(jet, get), fighterSpecOf(jet), 'imperial', get);

describe('Learn home path cards', () => {
  it('numbers one card per lesson-path step, in the order of the Learn bar', () => {
    for (const id of AIRCRAFT_ORDER) {
      const c = cards(id);
      expect(c.map(x => x.label), id).toEqual(lessonSteps(id).map(l => l.label));
      expect(c.map(x => x.num), id).toEqual(c.map((_, i) => i + 1));
      for (const x of c) expect(x.line.length, `${id} ${x.route}`).toBeGreaterThan(10);
    }
  });
  it('lights the first step left as next and the done ones as done', () => {
    const c = cards('su27', k => (k === 'radar:su27:done' || k === 'missiles:su27:done' ? true : undefined));
    expect(c.map(x => x.state)).toEqual(['done', 'next', 'done', 'todo', 'todo', 'todo', 'todo']);
    expect(c[1]!.stateText).toBe('Next');
    expect(c[3]!.stateText).toBe('Not flown');
  });
  it('counts lessons on pages that have several and opens the first one left', () => {
    const hornet = cards('fa18c');
    const harm = hornet.find(x => x.route === 'harm')!;
    expect(harm.stateText).toMatch(/^0 of \d+$/);
    expect(harm.path).toMatch(/^harm\?lesson=/);
    expect(harm.foot).toMatch(/^Next: HARM: /);
    const pattern = hornet.find(x => x.route === 'flight-ops')!;
    expect(pattern.foot).toMatch(/^\d+ lessons on this page$/);
    const hog = cards('a10c');
    expect(hog.map(x => x.route)).toEqual(['tgp', 'cas']);
    expect(hog[0]!.state).toBe('next');
  });
  it('drops the jet prefix from route titles used as card lines', () => {
    expect(ownTitle('Su-25T: find, lock and lase')).toBe('Find, lock and lase');
    expect(ownTitle('Fly the overhead break')).toBe('Fly the overhead break');
  });
  it('shortens "done in" lists to a count past three jets', () => {
    const everywhere = (k: string) => (k.startsWith('radar:') ? true : undefined);
    expect(cards('f15c', everywhere)[0]!.foot).toBe('Done in 9 other jets');
    expect(cards('f15c', k => (k === 'radar:su27:done' ? true : undefined))[0]!.foot).toBe('Done in Su-27');
  });
  it('ends with the Fly card, lit once the path is complete', () => {
    const fresh = flyCard(pathProgress('f15c', none), AIRCRAFT.f15c, 'imperial');
    expect(fresh).toMatchObject({ path: 'sortie', next: false, flown: false });
    const su25t = flyCard(pathProgress('su25t', none), null, 'metric');
    expect(su25t.path).toBe('strike?lesson=sortie');
    expect(su25t.line.length).toBeGreaterThan(10);
    const all = (k: string) => (/^(strike|cas):/.test(k) ? true : undefined);
    expect(flyCard(pathProgress('su25t', all), null, 'metric')).toMatchObject({ next: true, flown: true });
  });
});
