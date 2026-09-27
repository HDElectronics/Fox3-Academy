import { describe, expect, it } from 'vitest';
import { SHIPS } from '../data/ships';
import { landingToWorld, createFlightOpsState } from '../sim/flightOps';
import { FLIGHT_OPS } from '../data/flightOps';
import { Color } from 'three';
import { CarrierMesh, WAKE, deckOutline, landingLocal, landingPaint, lensCell, shipLocal, shipToLanding, wakeStrip } from './flightOps/carrier';
import type { Palette } from './palette';

/** Point in polygon (ship frame a, c). */
function inside(poly: [number, number][], a: number, c: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ai, ci] = poly[i]!, [aj, cj] = poly[j]!;
    if ((ci > c) !== (cj > c) && a < ((aj - ai) * (c - ci)) / (cj - ci) + ai) hit = !hit;
  }
  return hit;
}

describe('carrier mesh helpers (#26)', () => {
  it('maps the landing frame to the ship like the sim does', () => {
    const s = createFlightOpsState('fa18c', 'carrierGroove', FLIGHT_OPS.fa18c);
    const ang = SHIPS.cvn.angledDeckDeg.value;
    for (const [u, v] of [[0, 0], [120, 0], [200, -13], [60, 13]] as const) {
      // Ship heading north at the start: ship-local x = east, z = south, relative to the ramp.
      const w = landingToWorld(s, u, v), l = landingLocal(u, v, ang);
      expect(l.x).toBeCloseTo(w.x - s.ship!.x, 6);
      expect(l.z).toBeCloseTo(w.z - s.ship!.z, 6);
    }
    const back = shipToLanding(100, -20, ang);
    const loc = landingLocal(back.u, back.v, ang), sh = shipLocal(100, -20);
    expect(loc.x).toBeCloseTo(sh.x, 6);
    expect(loc.z).toBeCloseTo(sh.z, 6);
    // The angled deck runs to port (x < 0 going forward).
    expect(landingLocal(200, 0, ang).x).toBeLessThan(0);
  });

  it('keeps the whole landing area on the deck, and draws four wires with the target wire marked', () => {
    for (const id of ['cvn', 'kuznetsov'] as const) {
      const ship = SHIPS[id];
      const poly = deckOutline(id);
      const t = ship.angledDeckDeg.value * Math.PI / 180, hw = ship.landingAreaWidthM / 2;
      for (const [u, v] of [[5, -hw], [5, hw], [ship.landingAreaLengthM, -hw], [ship.landingAreaLengthM, hw]]) {
        const a = u! * Math.cos(t) + v! * Math.sin(t), c = -u! * Math.sin(t) + v! * Math.cos(t);
        expect(inside(poly, a, c), `${id} ${u},${v}`).toBe(true);
      }
      const paint = landingPaint(ship, 3);
      expect(paint.filter(p => p.kind === 'wire' || p.kind === 'target')).toHaveLength(ship.wires.value);
      const target = paint.find(p => p.kind === 'target')!;
      expect(target.u0).toBe(ship.firstWireFromRampM.value + 2 * ship.wireSpacingM.value);
      expect(paint.filter(p => p.kind === 'edge')).toHaveLength(2);
    }
  });

  it('puts the ball on the lens: clamped, red in the low cells, off without a ball', () => {
    const b = { glideDevDeg: 0, lineupDevDeg: 0, luna: null, waveoffLights: false, cutLights: false };
    expect(lensCell(null)).toBeNull();
    expect(lensCell({ ...b, cell: 0 })).toEqual({ cell: 0, red: false });
    expect(lensCell({ ...b, cell: -4 })).toEqual({ cell: -4, red: true });
    expect(lensCell({ ...b, cell: 12 })).toEqual({ cell: 5, red: false });
  });

  it('draws a wake astern that widens and fades, on the sea behind the ship', () => {
    for (const id of ['cvn', 'kuznetsov'] as const) {
      const rows = wakeStrip(id);
      expect(rows[0]!.a).toBeCloseTo(0, 9);
      expect(rows.at(-1)!.a).toBeCloseTo(-WAKE.lengthM, 6);
      expect(rows.at(-1)!.alpha).toBeCloseTo(0, 6);
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i]!.a).toBeLessThan(rows[i - 1]!.a);
        expect(rows[i]!.hw).toBeGreaterThan(rows[i - 1]!.hw);
        expect(rows[i]!.alpha).toBeLessThan(rows[i - 1]!.alpha);
      }
      const palette = new Proxy({}, { get: () => new Color(0.5, 0.5, 0.5) }) as Palette;
      const m = new CarrierMesh(palette, id);
      const wake = m.getObjectByName('flightOps:wake') as import('three').Mesh;
      wake.geometry.computeBoundingBox();
      const bb = wake.geometry.boundingBox!;
      expect(bb.min.z).toBeGreaterThanOrEqual(0);           // astern of the ramp (+z is aft)
      expect(bb.max.y).toBeLessThan(1);                       // on the sea, well below the deck
      m.dispose();
    }
  });
});
