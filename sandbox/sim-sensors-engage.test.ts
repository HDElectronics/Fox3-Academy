import { it } from 'vitest';
import { World } from '../src/sim/world';
import type { AircraftId } from '../src/data/types';
import { buildRadarPicture } from '../src/sim/picture';

function engage(blue: AircraftId, red: AircraftId, secs: number) {
  const w = new World(7);
  const counts: Record<string, number> = {};
  const log: string[] = [];
  w.on(e => {
    const k = e.type + ('what' in e ? ':' + e.what : '') + ('state' in e && e.type === 'rwr' ? ':' + e.state : '');
    counts[k] = (counts[k] ?? 0) + 1;
    if (e.type === 'lock' || e.type === 'launch' || e.type === 'kill' || e.type === 'hit' || e.type === 'miss' || e.type === 'pitbull' || (e.type === 'rwr' && e.state !== 'search') || e.type === 'datalink-lost' || (e.type === 'track' && e.what === 'dropped'))
      log.push(`${e.t.toFixed(1)} ${JSON.stringify(e)}`);
  });
  const b = w.spawnAircraft({ side: 'blue', type: blue, controller: 'ai', skill: 'veteran', pos: { x: 0, y: 9000, z: 0 }, heading: 0, speed: 260 });
  const r = w.spawnAircraft({ side: 'red', type: red, controller: 'ai', skill: 'veteran', pos: { x: 3000, y: 8500, z: -110000 }, heading: Math.PI, speed: 260 });
  let maxPic = 0;
  for (let i = 0; i < secs * 60; i++) {
    w.step(1 / 60);
    if (i % 30 === 0) { const t0 = performance.now(); buildRadarPicture(w, b.id); buildRadarPicture(w, r.id); maxPic = Math.max(maxPic, performance.now() - t0); }
  }
  console.log(`== ${blue} vs ${red}: t=${w.t.toFixed(0)} blue ${b.alive ? 'alive' : 'dead'} ${b.radar.mode}, red ${r.alive ? 'alive' : 'dead'} ${r.radar.mode}; picture ${maxPic.toFixed(2)} ms\n${JSON.stringify(counts)}\n${log.slice(0, 60).join('\n')}`);
}

it('f15c vs su27', () => engage('f15c', 'su27', 260), 60000);
it('fa18c vs j11a', () => engage('fa18c', 'j11a', 260), 60000);
it('f14b vs mig29s', () => engage('f14b', 'mig29s', 260), 60000);
