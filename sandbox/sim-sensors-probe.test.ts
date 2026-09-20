import { it } from 'vitest';
import { World } from '../src/sim/world';
import { AIRCRAFT, AIRCRAFT_ORDER } from '../src/data/aircraft';
import { detectionRange, paintRange, radarRules, revisitTime, setRadarMode } from '../src/sim/radar';
import { D2R } from '../src/sim/math';

it('per-jet table', () => {
  const rows: string[] = [];
  for (const id of AIRCRAFT_ORDER) {
    const w = new World();
    const me = w.spawnAircraft({ side: 'blue', type: id, controller: 'script', pos: { x: 0, y: 9000, z: 0 }, heading: 0, speed: 250 });
    const su = w.spawnAircraft({ side: 'red', type: 'su27', controller: 'script', pos: { x: 0, y: 9000, z: -50000 }, heading: Math.PI, speed: 250 });
    const f16 = w.spawnAircraft({ side: 'red', type: 'f16c', controller: 'script', pos: { x: 0, y: 9000, z: -50000 }, heading: Math.PI, speed: 250 });
    const rws = `${(me.radar.azHalf / D2R).toFixed(0)}°/${me.radar.bars}b ${me.radar.frameTime.toFixed(1)}s`;
    const ok = setRadarMode(w, me, 'tws');
    const tws = ok ? `${(me.radar.azHalf / D2R).toFixed(0)}°/${me.radar.bars}b ${me.radar.frameTime.toFixed(1)}s rv${revisitTime(me.radar).toFixed(1)}` : 'n/a';
    const r = radarRules(id);
    rows.push(`${id.padEnd(7)} RWS ${rws.padEnd(16)} TWS ${tws.padEnd(24)} det su27 ${(detectionRange(w, me, su) / 1000).toFixed(0)}km f16 ${(detectionRange(w, me, f16) / 1000).toFixed(0)}km paint ${(paintRange(me) / 1000).toFixed(0)}km cap ${r.designationCap} mem ${r.sttMemoryS}`);
  }
  console.log(rows.join('\n'));
});
