/**
 * "Compute exactly": Rmax and Rne for these exact conditions by flying the game missile model
 * (sim/dlz shotHits) and bisecting on the launch range. Written as a generator that yields after every
 * flight, so the page can run it in setTimeout slices and the UI stays responsive.
 * Same bracket-then-bisect rule as sim/dlz findRange().
 */
import { shotHits, type ShotSetup } from '../../sim/dlz';
import { missileModel } from '../../sim/missileModel';

export interface RangeAnswer { range: number; tof: number }

/** One flight per yield. The generator's return value is the answer (range 0 = nothing hits). */
export function* rangeSearch(
  base: Omit<ShotSetup, 'range' | 'maneuver'>, kind: 'rmax' | 'rne', guess: number, tol = 0.01,
): Generator<number, RangeAnswer, void> {
  const setup: ShotSetup = { ...base, range: 0, maneuver: kind === 'rmax' ? 'none' : 'turn-cold', reactAfter: kind === 'rne' ? 0 : base.reactAfter };
  let flights = 0;
  const floor = Math.max(missileModel(base.missile).rminM * 1.3, 800, 1.2 * Math.abs(base.targetAlt - base.shooterAlt));
  let g0 = Math.max(guess, floor * 1.5);
  let lo = 0, hi = 0, loTof = 0;
  const at = (r: number) => { setup.range = r; flights++; return shotHits(setup); };

  const first = at(g0);
  yield flights;
  if (first.hit) {
    lo = g0; loTof = first.tof; hi = g0 * 1.3;
    for (let i = 0; i < 12; i++) {
      const h = at(hi);
      yield flights;
      if (!h.hit) break;
      lo = hi; loTof = h.tof; hi *= 1.4;
      if (hi > 600000) return { range: lo, tof: loTof };
    }
  } else {
    hi = g0;
    let probe = g0 * 0.7;
    for (let i = 0; i < 16 && probe >= floor * 0.99; i++) {
      const p = at(probe);
      yield flights;
      if (p.hit) { lo = probe; loTof = p.tof; break; }
      hi = probe; probe *= 0.7;
    }
    if (!lo) {
      // hit/miss is not always monotone close in: scan before giving up
      const top = Math.min(hi, g0);
      for (let i = 0; i <= 8 && !lo; i++) {
        const r = floor + (top - floor) * (i / 8);
        const p = at(r);
        yield flights;
        if (p.hit) { lo = r; loTof = p.tof; hi = i < 8 ? floor + (top - floor) * ((i + 1) / 8) : top; }
      }
      if (!lo) return { range: 0, tof: 0 };
    }
  }
  while (hi - lo > Math.max(60, tol * lo)) {
    const mid = (lo + hi) / 2;
    const r = at(mid);
    yield flights;
    if (r.hit) { lo = mid; loTof = r.tof; } else hi = mid;
  }
  g0 = lo;
  return { range: g0, tof: loTof };
}

export interface ChunkRun { cancel(): void; readonly done: boolean }

/**
 * Drive a generator in setTimeout slices of about `budgetMs`. `onStep` gets each yielded value,
 * `onDone` the return value. cancel() stops it (safe after completion).
 */
export function runChunked<Y, R>(
  gen: Generator<Y, R, void>, onStep: (y: Y) => void, onDone: (r: R) => void, budgetMs = 14,
): ChunkRun {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let finished = false;
  const tick = () => {
    timer = null;
    if (finished) return;
    const t0 = performance.now();
    for (;;) {
      const r = gen.next();
      if (r.done) { finished = true; onDone(r.value); return; }
      onStep(r.value);
      if (performance.now() - t0 >= budgetMs) break;
    }
    timer = setTimeout(tick, 0);
  };
  timer = setTimeout(tick, 0);
  return {
    cancel() { finished = true; if (timer !== null) { clearTimeout(timer); timer = null; } },
    get done() { return finished; },
  };
}
