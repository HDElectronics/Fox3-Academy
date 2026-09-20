/**
 * Fly a whole sortie without a screen, with the scripted pilot: used for the ?shot=debrief screenshot
 * state and the end-to-end test. Same World seed, builder and end rules as the fly screen.
 */
import type { AircraftId } from '../../data/types';
import type { Units } from '../../app/format';
import { buildSortie, sortieEnd, sortieWorld, type SortieSetup } from './setup';
import { SortieRecorder } from './recorder';
import { ScriptedPilot } from './autopilot';
import type { FlyOutcome } from './fly';
import type { SortieResult } from './coach';

export function simulateSortie(ac: AircraftId, setup: SortieSetup, units: Units): FlyOutcome {
  const world = sortieWorld(ac, setup);
  const eng = buildSortie(world, ac, setup, units);
  const recorder = new SortieRecorder(world, eng, ac, units);
  const pilot = new ScriptedPilot(world, eng.playerId, eng.enemyIds);
  let result: SortieResult | null = null;
  let endAt = Infinity;
  while (world.t < endAt) {
    pilot.step();
    world.step(0.25);
    recorder.tick();
    if (!result) {
      result = sortieEnd(world, eng);
      if (result) endAt = result.reason === 'time' ? world.t : world.t + 4;
    }
  }
  recorder.dispose();
  return { world, eng, recorder, result: result ?? { outcome: 'draw', reason: 'ended', t: world.t }, setup, scripted: true };
}
