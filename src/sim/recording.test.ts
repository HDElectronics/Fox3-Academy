import { expect, it } from 'vitest';
import { Vector3 } from 'three';
import { World } from './world';

it('records independent sensor estimates rather than replacing them with target truth', () => {
  const world = new World();
  const own = world.spawnAircraft({ type: 'f15c', side: 'blue', controller: 'script', pos: { x: 0, y: 9000, z: 0 }, heading: 0, speed: 250 });
  const target = world.spawnAircraft({ type: 'su27', side: 'red', controller: 'script', pos: { x: 4000, y: 9000, z: -50000 }, heading: 0, speed: 250 });
  // Freeze the sensor state so this tests the recording contract independently of scan timing.
  own.alive = false;
  own.radar.bricks.push({ targetId: target.id, t: 0, pos: new Vector3(10, 8000, -30000), az: 0, el: 0, range: 30000, closure: 0 });
  own.radar.tracks.push({ targetId: target.id, label: 'T1', pos: new Vector3(20, 8000, -31000), vel: new Vector3(0, 0, -200), firstHit: 0, lastHit: 0, hits: 3, firm: true, coasting: true });
  own.radar.designated.push(target.id);
  world.step(0.3);
  const recorded = world.recording[0].aircraft.find(a => a.id === own.id)!;
  expect(recorded.radarContacts?.bricks[0].pos).toEqual([10, 8000, -30000]);
  expect(recorded.radarContacts?.tracks[0]).toMatchObject({ pos: [20, 8000, -31000], vel: [0, 0, -200], firm: true, coasting: true });
  own.radar.bricks[0].pos.set(1, 2, 3);
  own.radar.tracks[0].pos.set(4, 5, 6);
  own.radar.tracks[0].vel.set(7, 8, 9);
  own.radar.tracks[0].coasting = false;
  own.radar.designated.length = 0;
  world.step(0.3);
  expect(recorded.radarContacts?.bricks[0].pos).toEqual([10, 8000, -30000]);
  expect(recorded.radarContacts?.tracks[0]).toMatchObject({ pos: [20, 8000, -31000], vel: [0, 0, -200], coasting: true });
  expect(recorded.designated).toEqual([target.id]);
  expect(world.recording.at(-1)?.aircraft[0].radarContacts?.tracks[0].pos).toEqual([4, 5, 6]);
});

it('records empty sensor arrays and respects disabled recording', () => {
  const world = new World();
  world.spawnAircraft({ type: 'f15c', side: 'blue', controller: 'script', pos: { x: 0, y: 9000, z: 0 }, heading: 0, speed: 250 });
  world.record = false;
  world.step(0.5);
  expect(world.recording).toEqual([]);
  world.record = true;
  world.step(0.3);
  expect(world.recording[0].aircraft[0].radarContacts).toEqual({ bricks: [], tracks: [] });
});
