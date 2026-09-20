/**
 * Offline tuner (sim-physics). Fits the per-missile correction factors (missileModel.ts TUNED) so that the
 * full 3-D game flight reproduces ED's reference launch ranges (data/missiles.ts `ref`) for the reference
 * geometry: 10 km head-on, 10 km vs a fleeing target, 1 km head-on; shooter and target at 900 km/h.
 *
 *   TUNE=1 FIT=1 npx vitest run tests/tune/model-fit.test.ts     # refit and rewrite the TUNED block
 *   TUNE=1 npx vitest run tests/tune/dlz-tables.test.ts          # then regenerate the DLZ tables
 *
 * Only runs when both TUNE=1 and FIT=1 are set.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { MissileId } from '../../src/data/types';
import { MISSILES } from '../../src/data/missiles';
import { LOFT_FLAT_SHARE, midHeadOnKm, setTuneOverride, tuneCorrection, type TuneCorrection } from '../../src/sim/missileModel';
import { measureHeadOn, measureReference } from './reference';

const MODEL_FILE = fileURLToPath(new URL('../../src/sim/missileModel.ts', import.meta.url));
const ENABLED = process.env.TUNE === '1' && process.env.FIT === '1';

const clampRatio = (r: number) => Math.min(1.35, Math.max(0.75, r));
const clampCorr = (c: number) => Math.min(2.5, Math.max(0.35, c));
/** Upper bound of the loft scale (beyond the base shape the range gets too sensitive to launch speed). */
const LOFT_MAX = 1.0;

describe.runIf(ENABLED)('missile model fit', () => {
  it('fits every missile to its reference ranges', () => {
    const only = process.env.MISSILES ? (process.env.MISSILES.split(',') as MissileId[]) : null;
    const ids = (Object.keys(MISSILES) as MissileId[]).filter(id => !only || only.includes(id));
    const fitted: Partial<Record<MissileId, TuneCorrection>> = {};
    for (const id of ids) {
      const spec = MISSILES[id];
      const ref = spec.ref;
      const corr: TuneCorrection = { ...tuneCorrection(id) };
      if (spec.lofts) { corr.a = LOFT_FLAT_SHARE; corr.loft = corr.loft ?? 1; } else delete corr.loft;
      const measure = (c: TuneCorrection) => { setTuneOverride(id, c); return measureReference(id, 1 / 30); };
      const headOnAt = (c: TuneCorrection) => { setTuneOverride(id, c); return measureHeadOn(id, 1 / 30); };
      let best = { err: Infinity, corr: { ...corr } };
      let prev: { a: number; b: number; c: number; m: number } | null = null;
      let stuck = 0, bumps = 0;
      for (let iter = 0; iter < 14; iter++) {
        let loftSaturated = false;
        if (spec.lofts) {
          // loft strength for the 10 km head-on shot (range grows with loft)
          let lo = 0, hi = LOFT_MAX;
          if (headOnAt({ ...corr, loft: hi }) < ref.highHeadOnKm) { corr.loft = hi; loftSaturated = true; }
          else if (headOnAt({ ...corr, loft: lo }) > ref.highHeadOnKm) corr.loft = lo;
          else {
            for (let k = 0; k < 12; k++) {
              const mid = (lo + hi) / 2;
              if (headOnAt({ ...corr, loft: mid }) < ref.highHeadOnKm) lo = mid; else hi = mid;
            }
            corr.loft = (lo + hi) / 2;
          }
        }
        const got = measure(corr);
        const mid = midHeadOnKm(id);
        const ra = ref.highHeadOnKm / Math.max(0.1, got.a), rb = ref.highColdKm / Math.max(0.1, got.b), rc = ref.lowHeadOnKm / Math.max(0.1, got.c);
        const rm = mid / Math.max(0.1, got.m);
        // the 5 km point is a secondary goal: it counts half in the error
        const err = Math.max(Math.abs(ra - 1), Math.abs(rb - 1), Math.abs(rc - 1), Math.abs(rm - 1) / 2);
        console.log(`${id.padEnd(8)} it${iter} a ${got.a.toFixed(1)}/${ref.highHeadOnKm} b ${got.b.toFixed(1)}/${ref.highColdKm} c ${got.c.toFixed(1)}/${ref.lowHeadOnKm} m ${got.m.toFixed(1)}/${mid}  err ${(err * 100).toFixed(1)}%  corr a ${corr.a.toFixed(3)} b ${corr.b.toFixed(3)} c ${corr.c.toFixed(3)} m ${(corr.m ?? 1).toFixed(3)}${corr.loft !== undefined ? ` loft ${corr.loft.toFixed(3)}` : ''} peak ${(corr.peak ?? 1).toFixed(3)}`);
        if (err < best.err) best = { err, corr: { ...corr } };
        if (err < 0.015) break;
        // saturated (flight time / speed limits): moving the goals no longer changes anything
        const saturated = !!prev && Math.abs(prev.a - got.a) + Math.abs(prev.b - got.b) + Math.abs(prev.c - got.c) + Math.abs(prev.m - got.m) < 0.05;
        prev = got;
        if ((saturated || loftSaturated) && (ra > 1.02 || rb > 1.02) && bumps < 5) {
          // short of a head-on / tail reference within the flight time: a faster missile
          corr.peak = Math.min(1.6, Math.max(0.8, (corr.peak ?? 1) * Math.pow(clampRatio(Math.max(ra, rb)), 0.85)));
          if (!spec.lofts) corr.a = 1;
          bumps++; stuck = 0;
          continue;
        }
        if (saturated) { if (++stuck >= 2) break; } else stuck = 0;
        // damped fixed-point step in range space
        if (!spec.lofts) corr.a = clampCorr(corr.a * Math.pow(clampRatio(ra), 0.85));
        corr.b = clampCorr(corr.b * Math.pow(clampRatio(rb), 0.85));
        corr.c = clampCorr(corr.c * Math.pow(clampRatio(rc), 0.85));
        corr.m = clampCorr((corr.m ?? 1) * Math.pow(clampRatio(rm), 0.85));
      }
      fitted[id] = best.corr;
      setTuneOverride(id, best.corr);
    }
    // Write the TUNED block (keep entries of missiles not refitted this run).
    const src = readFileSync(MODEL_FILE, 'utf8');
    const start = src.indexOf('// @tuned-start');
    const end = src.indexOf('// @tuned-end');
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const all: Partial<Record<MissileId, TuneCorrection>> = {};
    for (const id of Object.keys(MISSILES) as MissileId[]) {
      const c = fitted[id] ?? tuneCorrection(id);
      if (c.a !== 1 || c.b !== 1 || c.c !== 1 || (c.m ?? 1) !== 1 || c.loft !== undefined || (c.peak ?? 1) !== 1) all[id] = c;
    }
    const f = (x: number) => x.toFixed(4);
    const lines = (Object.keys(all) as MissileId[]).map(id => {
      const c = all[id];
      return c ? `  ${id}: { a: ${f(c.a)}, b: ${f(c.b)}, c: ${f(c.c)}${(c.m ?? 1) !== 1 ? `, m: ${f(c.m ?? 1)}` : ''}${c.loft !== undefined ? `, loft: ${f(c.loft)}` : ''}${(c.peak ?? 1) !== 1 ? `, peak: ${f(c.peak ?? 1)}` : ''} },` : '';
    });
    const block = `// @tuned-start (written by tests/tune/model-fit.test.ts; do not edit by hand)\n`
      + `export const TUNED: Partial<Record<MissileId, TuneCorrection>> = {\n${lines.join('\n')}\n};\n`;
    writeFileSync(MODEL_FILE, src.slice(0, start) + block + src.slice(end));
  }, 3_600_000);
});
