/**
 * Tuning report (sim-physics): achieved vs reference launch ranges for every missile, from full flights of
 * the game model (findRange / simulateShot) and from the fast table lookup (dlzFor). Prints a markdown
 * table (paste into docs/api/sim-physics.md). Only runs with TUNE=1:
 *
 *   TUNE=1 npx vitest run tests/tune/ranges-report.test.ts --disableConsoleIntercept
 */
import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import type { MissileId } from '../../src/data/types';
import { MISSILES } from '../../src/data/missiles';
import { dlzFor, findRange } from '../../src/sim/dlz';
import { midHeadOnKm, missileModel, REF_HIGH_ALT, REF_LOW_ALT, REF_MID_ALT, REF_SPEED } from '../../src/sim/missileModel';
import { dirFrom } from '../../src/sim/math';
import { soundSpeed } from '../../src/sim/atmosphere';
import { measureReference, refBase } from './reference';

const ENABLED = process.env.TUNE === '1';

function lookup(id: MissileId, alt: number, aspectDeg: number) {
  const sp = new Vector3(0, alt, 0), tp = new Vector3(0, alt, -30000);
  return dlzFor(sp, dirFrom(0).multiplyScalar(REF_SPEED), tp, dirFrom(Math.PI + aspectDeg * Math.PI / 180).multiplyScalar(REF_SPEED), id);
}

const pct = (got: number, ref: number) => `${got >= ref ? '+' : ''}${((got / ref - 1) * 100).toFixed(0)}%`;

describe.runIf(ENABLED)('range report', () => {
  it('prints achieved vs reference ranges', () => {
    const rows: string[] = [
      '| Missile | 10 km head-on ref / sim / DLZ | 10 km fleeing ref / sim / DLZ | 1 km head-on ref / sim / DLZ | 5 km head-on ref / sim | Rne 10 km hot (sim) | peak Mach | flight time |',
      '|---|---|---|---|---|---|---|---|',
    ];
    let worst = 0;
    for (const id of Object.keys(MISSILES) as MissileId[]) {
      const ref = MISSILES[id].ref;
      const got = measureReference(id, 1 / 60);
      const rne = findRange(refBase(id, REF_HIGH_ALT, 0), 'rne', { dt: 1 / 60 }).range / 1000;
      const dA = lookup(id, REF_HIGH_ALT, 0).rmax / 1000, dB = lookup(id, REF_HIGH_ALT, 180).rmax / 1000, dC = lookup(id, REF_LOW_ALT, 0).rmax / 1000;
      const mid = midHeadOnKm(id);
      const model = missileModel(id);
      worst = Math.max(worst, Math.abs(got.a / ref.highHeadOnKm - 1), Math.abs(got.b / ref.highColdKm - 1), Math.abs(got.c / ref.lowHeadOnKm - 1));
      rows.push(`| ${MISSILES[id].name} | ${ref.highHeadOnKm} / ${got.a.toFixed(1)} (${pct(got.a, ref.highHeadOnKm)}) / ${dA.toFixed(1)} `
        + `| ${ref.highColdKm} / ${got.b.toFixed(1)} (${pct(got.b, ref.highColdKm)}) / ${dB.toFixed(1)} `
        + `| ${ref.lowHeadOnKm} / ${got.c.toFixed(1)} (${pct(got.c, ref.lowHeadOnKm)}) / ${dC.toFixed(1)} `
        + `| ${mid} / ${got.m.toFixed(1)} (${pct(got.m, mid)}) | ${rne.toFixed(1)} `
        + `| ${(model.peakSpeedRef / soundSpeed(REF_HIGH_ALT)).toFixed(1)} | ${model.maxTimeS.toFixed(0)} s |`);
    }
    console.log(`\nReference geometry: shooter and target at ${REF_SPEED} m/s (900 km/h), same altitude (${REF_HIGH_ALT / 1000} / ${REF_MID_ALT / 1000} / ${REF_LOW_ALT / 1000} km). sim = full 60 Hz flight, DLZ = dlzFor table lookup.\n`);
    console.log(rows.join('\n'));
    console.log(`\nworst error on the three data references: ${(worst * 100).toFixed(1)}%`);
    expect(worst).toBeLessThan(0.15);
  }, 600_000);
});
