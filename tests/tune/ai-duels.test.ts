/**
 * AI-vs-AI duel matrix (sim-ai realism sweep). The fast suite below always runs (about a second) and checks
 * that the fights look like DCS BVR: both sides commit, first shots at sensible fractions of Rmax, SARH
 * shooters hold STT, ARH shooters crank and pump, defenders notch / drag with chaff, fights resolve, no stuck
 * states, NaN or immortal missiles, and a tactical AI kills a target that just flies straight.
 *
 * Print a Tacview-style summary of every fight:
 *   DUELS=1 npx vitest run tests/tune/ai-duels.test.ts --disableConsoleIntercept
 *   DUELS=1 VERBOSE=1 MATCH=su27-f15c npx vitest run tests/tune/ai-duels.test.ts --disableConsoleIntercept
 *   DUELS=1 SEEDS=3 DUEL_SECONDS=600 npx vitest run tests/tune/ai-duels.test.ts --disableConsoleIntercept
 */
import { describe, expect, it } from 'vitest';
import type { AiSkill, SimEvent } from '../../src/sim/types';
import type { FighterId } from '../../src/data/types';
import { MISSILES } from '../../src/data/missiles';
import { World } from '../../src/sim/world';
import { configureAi } from '../../src/sim/ai';
import { cruiseFor } from '../../src/sim/scenarios';
import { missileModel } from '../../src/sim/missileModel';
import { formatDuel, runDuel, type DuelResult } from './duelHarness';

const ENABLED = process.env.DUELS === '1';
const VERBOSE = process.env.VERBOSE === '1';
const MATCH = process.env.MATCH ?? '';
const SEEDS = Number(process.env.SEEDS ?? 1);
const SECONDS = Number(process.env.DUEL_SECONDS ?? 360);

const MATRIX: [FighterId, FighterId][] = [
  ['su27', 'f15c'], ['f15c', 'su27'], ['j11a', 'f16c'], ['fa18c', 'mig29s'], ['f14b', 'su27'], ['m2000c', 'mig29s'], ['jf17', 'j11a'],
  ['su33', 'fa18c'], ['mig29s', 'f16c'], ['f16c', 'j11a'],
];
const SKILLS: AiSkill[] = ['regular', 'ace'];

describe.runIf(ENABLED)('AI duel matrix (printout)', () => {
  it('prints every duel', () => {
    const all: DuelResult[] = [];
    for (const [b, r] of MATRIX) {
      if (MATCH && `${b}-${r}` !== MATCH) continue;
      for (const skill of SKILLS) {
        for (let seed = 1; seed <= SEEDS; seed++) {
          const res = runDuel(b, r, skill, { seed, seconds: SECONDS });
          all.push(res);
          console.log(formatDuel(res, VERBOSE));
        }
      }
    }
    if (!MATCH || MATCH === 'passive') {
      for (const [b, r] of MATRIX) {
        const res = runDuel(b, r, 'regular', { bluePassive: true, seed: 1 });
        all.push(res);
        console.log(formatDuel(res, VERBOSE));
      }
    }
    const tally = new Map<string, number>();
    for (const r of all) tally.set(r.outcome, (tally.get(r.outcome) ?? 0) + 1);
    console.log('\noutcomes:', [...tally].map(([k, v]) => `${k} ${v}`).join(', '));
    expect(all.every(r => !r.nan)).toBe(true);
  }, 1_200_000);
});

describe('AI duels look like DCS BVR', () => {
  const duels: DuelResult[] = [];
  for (const [b, r] of MATRIX) for (const skill of SKILLS) duels.push(runDuel(b, r, skill, { seed: 1, seconds: skill === 'ace' ? 360 : 600 }));
  const why = (d: DuelResult) => formatDuel(d);

  it('never produces NaN, immortal missiles or stuck AI states', () => {
    for (const d of duels) {
      expect(d.nan, why(d)).toBe(false);
      expect(d.longMissile, why(d)).toEqual([]);
      expect(d.stuck, why(d)).toEqual([]);
    }
  });

  it('both sides detect and commit, and the first shot comes at a sensible fraction of Rmax', () => {
    for (const d of duels) {
      expect(d.commitT.blue, why(d)).not.toBeNull();
      expect(d.commitT.red, why(d)).not.toBeNull();
      expect(d.shots.length, why(d)).toBeGreaterThan(0);
      const first = d.shots[0];
      expect(first.frac, why(d)).toBeLessThanOrEqual(1.02);
      // regulars open near max range, aces wait for Rne + 20 % of the gap
      expect(first.frac, why(d)).toBeGreaterThan(d.skill === 'regular' ? 0.6 : 0.3);
    }
  });

  it('SARH shooters hold STT, ARH shooters crank and pump', () => {
    const shots = duels.flatMap(d => d.shots);
    const sarh = shots.filter(s => s.sttHeld !== null);
    expect(sarh.length).toBeGreaterThan(3);
    expect(sarh.reduce((a, s) => a + (s.sttHeld ?? 0), 0) / sarh.length).toBeGreaterThan(0.75);
    const arh = shots.filter(s => MISSILES[s.missile].seeker === 'arh' && s.end !== null && s.end - s.t > 15);
    expect(arh.length).toBeGreaterThan(10);
    expect(arh.filter(s => s.maxOff >= 20).length / arh.length).toBeGreaterThan(0.6);
    const pumps = arh.filter(s => s.pumped !== null);
    expect(pumps.filter(s => s.pumped).length / pumps.length).toBeGreaterThan(0.6);
  });

  it('defenders notch or drag and use chaff', () => {
    for (const d of duels) {
      const radarShots = d.shots.filter(s => MISSILES[s.missile].seeker !== 'ir').length;
      if (radarShots < 2) continue;
      expect(d.defends.length, why(d)).toBeGreaterThan(0);
      expect(d.defends.some(x => /notches|drag/.test(x.text)), why(d)).toBe(true);
      expect(d.chaff.blue + d.chaff.red, why(d)).toBeGreaterThan(0);
    }
  });

  it('fights resolve: aces inside 6 minutes, regulars (who shoot long and notch well) inside 10', () => {
    for (const d of duels) {
      expect(d.outcome, why(d)).not.toBe('unresolved');
      if (d.skill === 'ace') expect(d.endT, why(d)).toBeLessThan(360);
    }
  });

  it('a tactical AI kills a target that flies straight and level', () => {
    for (const [b, r] of MATRIX) {
      const d = runDuel(b, r, 'regular', { bluePassive: true, seed: 1, seconds: 300 });
      expect(d.outcome, why(d)).toBe('red wins');
      expect(d.endT, why(d)).toBeLessThan(240);
    }
  });

  it('2v2: shooters die, targets die and locks switch with missiles in the air, without breaking the sim', () => {
    const w = new World(7);
    w.record = false;
    const bc = cruiseFor('f15c'), rc = cruiseFor('su27');
    const ids: string[] = [];
    for (const [i, x] of [[0, -4000], [1, 4000]] as const) {
      ids.push(w.spawnAircraft({ id: `b${i}`, side: 'blue', type: 'f15c', controller: 'ai', skill: 'veteran', pos: { x, y: bc.alt, z: 0 }, heading: 0, speed: bc.speed }).id);
      ids.push(w.spawnAircraft({ id: `r${i}`, side: 'red', type: 'su27', controller: 'ai', skill: 'veteran', pos: { x, y: rc.alt, z: -100_000 }, heading: Math.PI, speed: rc.speed }).id);
    }
    for (const id of ids) configureAi(w, id, { gci: true });
    const ev: SimEvent[] = [];
    w.on(e => ev.push(e));
    for (let t = 0; t < 600; t += 0.1) {
      w.step(0.1);
      for (const a of w.aircraft.values()) expect([a.pos.x, a.pos.y, a.pos.z, a.heading].every(Number.isFinite)).toBe(true);
      for (const m of w.missiles.values()) {
        expect([m.pos.x, m.pos.y, m.pos.z].every(Number.isFinite)).toBe(true);
        if (m.alive) expect(w.t - m.launchedAt).toBeLessThanOrEqual(missileModel(m.type).maxTimeS + 0.5);
      }
    }
    expect(ev.filter(e => e.type === 'launch').length).toBeGreaterThan(3);
    expect(ev.some(e => e.type === 'kill')).toBe(true);
    // every missile that was fired has ended with a result once the fight is over
    for (const m of w.missiles.values()) if (!m.alive) expect(m.result).not.toBeNull();
    // AI calls carry the structured fields where known
    const shots = ev.filter((e): e is Extract<SimEvent, { type: 'ai' }> => e.type === 'ai' && / fires /.test(e.text));
    expect(shots.length).toBeGreaterThan(0);
    for (const s of shots) {
      expect(s.missileId).toBeTruthy();
      expect(s.missile).toBeTruthy();
      expect(s.targetId).toBeTruthy();
      expect(s.range).toBeGreaterThan(0);
    }
    const defends = ev.filter((e): e is Extract<SimEvent, { type: 'ai' }> => e.type === 'ai' && e.state === 'defend');
    expect(defends.some(e => e.missileId || e.targetId)).toBe(true);
  });
});

describe('previously long regular matchups', () => {
  for (const blue of ['fa18c', 'm2000c'] as const) {
    it(`${blue} vs MiG-29S converges across five deterministic seeds without weakening defenses`, () => {
      for (let seed = 1; seed <= 5; seed++) {
        const d = runDuel(blue, 'mig29s', 'regular', { seed, seconds: 600 });
        const evidence = formatDuel(d);
        expect(d.outcome, evidence).not.toBe('unresolved');
        expect(d.stuck, evidence).toEqual([]);
        expect(d.nan, evidence).toBe(false);
        expect(d.longMissile, evidence).toEqual([]);
      }
    });
  }
});
