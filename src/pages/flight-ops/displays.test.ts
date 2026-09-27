import { describe, expect, it } from 'vitest';
import { SHIPS } from '../../data/ships';
import { createFlightOpsState, shipToWorld } from '../../sim/flightOps';
import { hudHeightM, tapeLabels } from './displays';

describe('HUD height', () => {
  it('reads height above the runway on the airfield', () => {
    const s = createFlightOpsState('fa18c', 'takeoff');
    s.pos.y = 120;
    expect(hudHeightM(s)).toBe(120);
  });

  it('reads 0 on the deck at a catapult and ski-jump start, and height above the deck over it', () => {
    for (const [ac, start] of [['fa18c', 'catapult'], ['su33', 'skiJump']] as const) {
      const s = createFlightOpsState(ac, start);
      expect(s.pos.y, start).toBeCloseTo(SHIPS[s.ship!.id].deckHeightM, 6);
      expect(hudHeightM(s), start).toBeCloseTo(0, 6);
    }
    const s = createFlightOpsState('fa18c', 'carrierGroove');
    const p = shipToWorld(s, 80, -10);
    s.pos = { x: p.x, y: SHIPS.cvn.deckHeightM + 3, z: p.z };
    expect(hudHeightM(s)).toBeCloseTo(3, 6);
  });

  it('reads height above the sea off the deck', () => {
    const s = createFlightOpsState('fa18c', 'carrierGroove');
    expect(hudHeightM(s)).toBe(s.pos.y);
    const p = shipToWorld(s, -300, 0);
    s.pos = { x: p.x, y: 40, z: p.z };
    expect(hudHeightM(s)).toBe(40);
  });
});

describe('takeoff tape labels', () => {
  it('keeps labels left of the tape clear of the speed box, and beside it inside the box band', () => {
    const out = tapeLabels([{ label: 'PULL', y: 20 }, { label: 'VR', y: 60 }], 40, 90, 12);
    expect(out).toEqual([{ label: 'PULL', y: 20, side: 'left' }, { label: 'VR', y: 60, side: 'right' }]);
  });

  it('pushes labels beside the box apart at rotation', () => {
    const out = tapeLabels([{ label: 'PULL', y: 62 }, { label: 'VR', y: 60 }], 40, 90, 12);
    expect(out.every(l => l.side === 'right')).toBe(true);
    const [p, v] = out;
    expect(Math.abs(p!.y - v!.y)).toBeGreaterThanOrEqual(12 - 1e-9);
    expect(p!.y).toBeGreaterThan(v!.y);
  });
});
