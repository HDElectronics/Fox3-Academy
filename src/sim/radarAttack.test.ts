import { describe, expect, it } from 'vitest';
import { World } from './world';
import * as radar from './radar';

function setup() {
  const world = new World(7);
  world.record = false;
  const fighter = world.spawnAircraft({ id: 'F', side: 'blue', type: 'f15c', controller: 'script', pos: { x: 0, y: 5000, z: 0 }, heading: 0, speed: 200 });
  const attack = world.spawnAircraft({ id: 'A', side: 'red', type: 'su25t', controller: 'script', pos: { x: 0, y: 5000, z: -12000 }, heading: 0, speed: 200 });
  return { world, fighter, attack };
}

describe('attack jets as radar targets and owners', () => {
  it('steps an F-15C scanning a Su-25T for 60 seconds and detects it', () => {
    const { world, fighter, attack } = setup();
    world.setRadarMode('F', 'tws');
    expect(() => world.step(60)).not.toThrow();
    expect(fighter.radar.tracks.some(t => t.targetId === attack.id && t.firm)).toBe(true);
    expect(attack.radar.mode).toBe('off');
  });

  const commands: [string, (w: World) => unknown, unknown][] = [
    ['setRadarMode', w => w.setRadarMode('A', 'rws'), false],
    ['setRadarMode off', w => w.setRadarMode('A', 'off'), false],
    ['setScan', w => w.setScan('A', { bars: 4, azHalf: 1, cursor: { az: 0.1, range: 1000 } }), undefined],
    ['setCursor', w => radar.setCursor(w, w.get('A')!, { az: 0.1, range: 1000 }), undefined],
    ['unlock', w => w.unlock('A'), undefined],
    ['lock', w => w.lock('A', 'F'), false],
    ['canLock', w => w.canLock('A', 'F'), { ok: false, reason: 'No air-to-air radar' }],
    ['designate', w => w.designate('A', 'F'), undefined],
    ['undesignate', w => w.undesignate('A', 'F'), undefined],
    ['cycleDesignation', w => w.cycleDesignation('A'), undefined],
    ['setSnp2', w => w.setSnp2('A', true), false],
    ['stepRadar', w => radar.stepRadar(w, w.get('A')!, 1), undefined],
  ];
  it.each(commands)('%s rejects or ignores an attack owner without changing its radar', (_, command, result) => {
    const { world, attack } = setup();
    const before = structuredClone(attack.radar);
    expect(command(world)).toEqual(result);
    expect(attack.radar).toEqual(before);
  });

  it('radar queries return no detection, track or support for an attack owner', () => {
    const { world, attack, fighter } = setup();
    expect(radar.detectionRange(world, attack, fighter)).toBe(0);
    expect(radar.paintRange(attack)).toBe(0);
    expect(radar.lastPainted(attack, 'F')).toBeNull();
    expect(radar.isNotched(world, attack, fighter)).toBe(false);
    expect(radar.explainDetection(world, attack, fighter)).toMatchObject({ detectable: false, detectRange: 0, reasons: ['No air-to-air radar'] });
    expect(radar.supportedTargets(world, attack).size).toBe(0);
    expect(radar.guidanceSupport(world, attack, 'F')).toEqual({ datalink: false, illuminating: false, estimate: null });
    expect(radar.hasTrack(attack, 'F')).toBe(false);
    expect(radar.snp2Eligibility(world, attack).ok).toBe(false);
    expect(radar.snp2SeparationDeg(attack, 'F', 'other')).toBeNull();
    expect(radar.pickSnp2Second(world, attack, 'F')).toBeNull();
  });
});
