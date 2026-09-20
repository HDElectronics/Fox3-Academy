import { it } from 'vitest';
import { World } from '../src/sim/world';
import { AIRCRAFT_ORDER } from '../src/data/aircraft';
import { setRadarMode, stepRadar } from '../src/sim/radar';
import { updateRwr } from '../src/sim/rwr';
import { buildRadarPicture } from '../src/sim/picture';
import { createMissile } from '../src/sim/missile';

it('perf: 10 jets, 20 missiles', () => {
  const w = new World(3);
  const jets = AIRCRAFT_ORDER.map((t, i) => w.spawnAircraft({ side: i % 2 ? 'red' : 'blue', type: t, controller: 'script', pos: { x: (i % 5) * 4000, y: 8000 + i * 200, z: i % 2 ? -60000 : 0 }, heading: i % 2 ? Math.PI : 0, speed: 250 }));
  for (const j of jets) setRadarMode(w, j, 'tws');
  for (let k = 0; k < 20; k++) { const s = jets[k % 10]; const m = createMissile(w, s, 'aim120c', jets[(k + 1) % 10].id); w.missiles.set(m.id, m); }
  const h = 1 / 60;
  const t0 = performance.now();
  for (let i = 0; i < 3600; i++) {
    w.t += h;
    for (const a of w.aircraft.values()) a.pos.addScaledVector(a.vel, h);
    for (const a of w.aircraft.values()) stepRadar(w, a, h);
    updateRwr(w, h);
  }
  const dt = performance.now() - t0;
  const t1 = performance.now();
  for (let i = 0; i < 600; i++) buildRadarPicture(w, jets[i % 10].id);
  const dp = performance.now() - t1;
  console.log(`radar+rwr per tick ${(dt / 3600 * 1000).toFixed(1)} µs; picture ${(dp / 600 * 1000).toFixed(1)} µs; tracks ${jets.map(j => j.radar.tracks.length).join(',')}; rwr ${jets.map(j => j.rwr.length).join(',')}`);
});
