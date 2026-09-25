import { afterEach, describe, expect, it, vi } from 'vitest';
import { AIRCRAFT_ORDER, FIGHTER_ORDER } from '../../data/aircraft';
import { FLIGHT_OPS } from '../../data/flightOps';
import { AppStore } from '../../app/store';
import { LESSON_PATH, progressKeys, type ProgressReader } from '../../app/learningProgress';
import { routeFor } from '../../app/routes';
import { jetAllowed } from '../../app/roleGate';
import { progressKey as flightKey } from '../flight-ops/logic';
import { aarProgressKey } from '../flight-ops/aarLesson';
import { LESSON_ORDER, progressKey as strikeKey } from '../strike/lessons';
import { SORTIE_PROGRESS } from '../strike/sortie';
import { fleetProgress, jetProgress, progressHref, progressTotals, previewProgress } from './model';

const read = (values: Record<string, number | boolean | string> = {}): ProgressReader => key => values[key];
afterEach(() => vi.unstubAllGlobals());

describe('fleet progress', () => {
  it('keeps screenshot fixtures separate from real saved progress', () => {
    expect(previewProgress(null)).toBeNull();
    expect(previewProgress('unknown')).toBeNull();
    expect(progressTotals(fleetProgress(previewProgress('empty')!)).completed).toBe(0);
    const complete = progressTotals(fleetProgress(previewProgress('complete')!));
    expect(complete.completed).toBe(complete.total);
    expect(complete.finished).toBe(AIRCRAFT_ORDER.length);
    const mixed = progressTotals(fleetProgress(previewProgress('mixed')!));
    expect(mixed.completed).toBeGreaterThan(0);
    expect(mixed.completed).toBeLessThan(mixed.total);
  });

  it('shows every jet once, excludes reference visits, and starts with zero completions', () => {
    const jets = fleetProgress(read({ 'reference:su27:done': true, 'sortie:su27:setup': '{}' }));
    expect(jets.map(j => j.id)).toEqual(AIRCRAFT_ORDER);
    expect(progressTotals(jets)).toMatchObject({ completed: 0, started: 0, finished: 0 });
    expect(jets.every(j => j.total > 0 && j.next !== null)).toBe(true);
    expect(jets.flatMap(j => j.goals).some(g => g.id === 'reference')).toBe(false);
  });

  it('counts the same legacy completion flags as Learn without double counting', () => {
    const jet = jetProgress('f15c', read({ 'radar:f15c:done': true, 'radar-lab:f15c:done': true,
      'missile-lab:f15c:done': true, 'rwr-trainer:f15c:done': 'true', 'tws:f15c:done': 'false' }));
    expect(jet.completed).toBe(3);
    expect(jet.next?.id).toBe('tws');
    expect(jet.goals.find(g => g.id === 'tws')?.done).toBe(false);
  });

  it('only includes supported carrier and refuelling lessons for every fighter', () => {
    for (const id of FIGHTER_ORDER) {
      const jet = jetProgress(id, read());
      expect(jet.goals.some(g => g.id === 'flight-carrier')).toBe(!!FLIGHT_OPS[id].carrier);
      expect(jet.goals.some(g => g.id === 'flight-launch')).toBe(!!FLIGHT_OPS[id].launch);
      expect(jet.goals.some(g => g.id === 'flight-aar')).toBe(!!FLIGHT_OPS[id].aar);
      expect(jet.goals.some(g => g.id === 'flight-takeoff')).toBe(true);
    }
  });

  it('reads exact flight-ops keys, without combining carrier passes with runway passes', () => {
    const id = 'su33';
    const values = { [flightKey(id, 'carrier')]: true, [flightKey(id, 'launch')]: true,
      [flightKey(id, 'takeoff')]: true, [aarProgressKey(id)]: true };
    const jet = jetProgress(id, read(values));
    expect(jet.completed).toBe(4);
    expect(jet.goals.find(g => g.id === 'flight-done')?.done).toBe(false);
    expect(jet.goals.find(g => g.id === 'flight-launch')?.href).toContain('start=skiJump');
  });

  it('gives the Su-25T its eight strike lessons and counts its distinct sortie key', () => {
    expect(strikeKey('sortie')).toBe(SORTIE_PROGRESS);
    const jet = jetProgress('su25t', read({ [SORTIE_PROGRESS]: true, 'sortie:su25t:done': true, 'tws:su25t:done': true }));
    expect(jet.goals.map(g => g.id)).toEqual(LESSON_ORDER);
    expect(jet.completed).toBe(1);
    expect(jet.total).toBe(8);
    expect(jet.goals.every(g => g.href.startsWith('#/strike?'))).toBe(true);
  });

  it('links select the matching aircraft and resolve to a supported lesson route', () => {
    for (const jet of fleetProgress(read())) {
      expect(new Set(jet.goals.map(g => g.id)).size).toBe(jet.total);
      for (const goal of jet.goals) {
        const [path, query] = goal.href.slice(2).split('?');
        expect(new URLSearchParams(query).get('ac')).toBe(jet.id);
        expect(routeFor(path!).path).toBe(path);
        expect(jetAllowed(routeFor(path!), jet.id)).toBe(true);
      }
    }
    expect(progressHref('radar?ex=low', 'jf17')).toBe('#/radar?ex=low&ac=jf17');
  });

  it('does not invent a completion from a score and labels RWR and sortie scores in their own units', () => {
    const jet = jetProgress('jf17', read({ 'rwr:jf17:best': 14, 'sortie:jf17:best': 78 }));
    expect(jet.completed).toBe(0);
    expect(jet.scores).toEqual([{ label: 'Best RWR run', value: '14 correct' }, { label: 'Best winning sortie', value: '78/100' }]);
    expect(jetProgress('f15c', read({ 'sortie:f15c:best': Infinity, 'rwr:f15c:best': -1 })).scores).toEqual([]);
  });

  it('reads persisted progress without writing, changing aircraft, or completing another jet', () => {
    const setItem = vi.fn(), removeItem = vi.fn();
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ aircraft: 'su25t', fighter: 'f15c',
      progress: { 'tws:f15c:done': true, [strikeKey('shkval')]: true } }), setItem, removeItem });
    const app = new AppStore();
    const jets = fleetProgress(k => app.getProgress(k));
    expect(jets.find(j => j.id === 'f15c')?.completed).toBe(1);
    expect(jets.find(j => j.id === 'su25t')?.completed).toBe(1);
    expect(jets.find(j => j.id === 'su27')?.completed).toBe(0);
    expect(app.jet).toBe('su25t');
    expect(app.aircraft).toBe('f15c');
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
  });

  it('finishes a jet only when every supported goal is complete, then offers no next goal', () => {
    const id = 'f14b';
    const values: Record<string, boolean> = {};
    for (const route of LESSON_PATH) values[progressKeys(route, id)[0]!] = true;
    for (const kind of ['pattern', 'takeoff', 'carrier', 'launch'] as const) values[flightKey(id, kind)] = true;
    values[aarProgressKey(id)] = true;
    const jet = jetProgress(id, read(values));
    expect(jet.completed).toBe(jet.total);
    expect(jet.next).toBeNull();
    expect(progressTotals([jet])).toMatchObject({ finished: 1, started: 1 });
  });
});
