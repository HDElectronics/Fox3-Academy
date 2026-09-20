import { describe, expect, it } from 'vitest';
import { World } from './world';
import { buildRadarPicture, cueLabelFor } from './picture';

describe('verified cockpit launch cues', () => {
  it('does not invent textual shoot cues for the Viper or classic Tomcat', () => {
    expect(cueLabelFor('f16c', 'aim120c')).toBe('');
    expect(cueLabelFor('f14b', 'aim54c')).toBe('');
    expect(cueLabelFor('fa18c', 'aim120c')).toBe('SHOOT');
    expect(cueLabelFor('jf17', 'sd10')).toBe('SHOOT');
  });
  for (const [type, missile] of [['f16c', 'aim120c'], ['f14b', 'aim54c']] as const) {
    it(`${type} still offers a valid launch without a textual cockpit cue`, () => {
      const w = new World();
      const shooter = w.spawnAircraft({ type, side: 'blue', controller: 'script', pos: { x: 0, y: 9000, z: 0 }, heading: 0, speed: 280 });
      const target = w.spawnAircraft({ type: 'su27', side: 'red', controller: 'script', pos: { x: 0, y: 9000, z: -20000 }, heading: Math.PI, speed: 250 });
      shooter.selectedWeapon = missile;
      expect(w.lock(shooter.id, target.id)).toBe(true);
      const picture = buildRadarPicture(w, shooter.id);
      expect(picture?.shootCue).toBe(true);
      expect(picture?.cueLabel).toBe('');
    });
  }
});
