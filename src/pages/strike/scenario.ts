/**
 * [OWNER: page-strike] Scenario builder for the Shkval & Vikhr page: seeded terrain with a flattened target area,
 * the Su-25T and the targets (tank platoon, a large bunker, an APC, a truck column). Pure sim + height field
 * (no three.js), so tests can fly it.
 */
import { World } from '../../sim/world';
import type { Aircraft, EntityId } from '../../sim/types';
import type { SamId } from '../../data/types';
import { createAttackField, terrainHook } from '../../render/attack/terrainHook';
import type { HeightField } from '../../render/terrain/heightmap';
import type { LessonId } from './lessons';

export const TERRAIN_SEED = 25;
/** Target area centre (m) and flattened radius. */
export const TARGET = { x: 0, z: 0, radiusM: 900 } as const;
/** Tank platoon centre, bunker, truck column. */
export const TANKS_AT = { x: 0, z: 0 } as const;
export const BUNKER_AT = { x: -420, z: -320 } as const;
export const TRUCKS_AT = { x: 340, z: 260 } as const;
/** SEAD lesson: the SA-15 alone, north-north-east of the start. */
export const SEAD_SAM_AT = { x: 6000, z: -12000 } as const;
/** SAM-threat lesson: the SA-15 covering the platoon 6 km behind it, the optional SA-11 further back. */
export const THREAT_SAM_AT = { x: 1500, z: -6000 } as const;
export const THREAT_SA11_AT = { x: -3000, z: -19000 } as const;
const SAM_PADS = [SEAD_SAM_AT, THREAT_SAM_AT, THREAT_SA11_AT].map(p => ({ ...p, radiusM: 350 }));

/** Start range (m) and height above the target (m) per lesson. The Vikhr drill starts at 12–15 km. */
export const START: Record<LessonId, { rangeM: number; aglM: number; speed: number }> = {
  shkval: { rangeM: 12000, aglM: 1500, speed: 130 },
  laser: { rangeM: 11000, aglM: 1500, speed: 130 },
  vikhr: { rangeM: 14500, aglM: 1500, speed: 150 },
  ccip: { rangeM: 6500, aglM: 1100, speed: 170 },
  bombs: { rangeM: 11000, aglM: 1000, speed: 150 },
  sead: { rangeM: 20000, aglM: 3000, speed: 160 },
  threat: { rangeM: 20000, aglM: 1500, speed: 150 },
};

/** Loadout per lesson (SU25T_LOADOUTS ids). */
const LOADOUT: Record<LessonId, string> = { shkval: 'vikhr', laser: 'vikhr', vikhr: 'vikhr', ccip: 'vikhr', bombs: 'unguided', sead: 'sead', threat: 'sead' };

export interface ScenarioOptions {
  /** SAM-threat lesson: add the SA-11 behind the SA-15. */
  sa11?: boolean;
}

export interface Scenario {
  world: World;
  me: Aircraft;
  field: HeightField;
  groundM: number;
  tanks: EntityId[];
  bunker: EntityId;
  trucks: EntityId[];
  /** SAM sites (SA-15 first) and their radar vehicles (ground units linked by samSiteId). */
  sams: EntityId[];
  samUnits: EntityId[];
}

let sharedField: HeightField | null = null;
/** The page's height field (built once: 2 MB, a few ms). */
export function strikeField(): HeightField {
  return (sharedField ??= createAttackField({ seed: TERRAIN_SEED, pads: [{ x: TARGET.x, z: TARGET.z, radiusM: TARGET.radiusM }, ...SAM_PADS] }));
}

export function buildScenario(lesson: LessonId, seed = 7, opts: ScenarioOptions = {}): Scenario {
  const field = strikeField();
  const world = new World(seed);
  world.terrain = terrainHook(field);
  const groundM = world.terrain.heightAt(TARGET.x, TARGET.z);
  world.groundAlt = groundM;
  const st = START[lesson];
  const me = world.spawnAircraft({
    id: 'SU25', side: 'blue', type: 'su25t', controller: 'player', agLoadout: LOADOUT[lesson],
    pos: { x: TARGET.x, y: groundM + st.aglM, z: TARGET.z + st.rangeM }, heading: 0, speed: st.speed,
  });
  me.cmd.heading = 0; me.cmd.altitude = groundM + st.aglM; me.cmd.speed = st.speed; me.cmd.afterburner = false;

  const tanks: EntityId[] = [];
  const tankOffsets = [[-90, 10], [-30, -15], [30, 12], [95, -8]] as const;
  tankOffsets.forEach(([dx, dz], i) => {
    tanks.push(world.spawnGroundUnit({ id: `T${i + 1}`, kind: 'tank', side: 'red', name: `Tank ${i + 1}`, pos: { x: TANKS_AT.x + dx, z: TANKS_AT.z + dz }, heading: Math.PI / 2 }).id);
  });
  const bunker = world.spawnGroundUnit({ id: 'BK', kind: 'bunker', side: 'red', name: 'Bunker', pos: BUNKER_AT, sizeM: 60, heading: 0.4 }).id;
  world.spawnGroundUnit({ id: 'APC', kind: 'apc', side: 'red', name: 'APC', pos: { x: 210, z: -160 }, heading: 2 });
  const trucks: EntityId[] = [];
  for (let i = 0; i < 3; i++) {
    trucks.push(world.spawnGroundUnit({ id: `TR${i + 1}`, kind: 'truck', side: 'red', name: `Truck ${i + 1}`, pos: { x: TRUCKS_AT.x + i * 28, z: TRUCKS_AT.z - i * 30 }, heading: 0.8 }).id);
  }
  const sams: EntityId[] = [], samUnits: EntityId[] = [];
  const addSam = (id: string, type: SamId, at: { x: number; z: number }, name: string) => {
    const y = world.terrain!.heightAt(at.x, at.z);
    // SAM flight ends below world.groundAlt: keep it at or below every pad in use.
    world.groundAlt = Math.min(world.groundAlt, y);
    sams.push(world.spawnSam({ id, side: 'red', type, pos: { x: at.x, y, z: at.z } }).id);
    samUnits.push(world.spawnGroundUnit({ id: `${id}-radar`, kind: 'sam-site', side: 'red', name, pos: at, heading: 0, samSiteId: id }).id);
  };
  if (lesson === 'sead') addSam('SA15', 'sa15', SEAD_SAM_AT, 'SA-15 Tor');
  if (lesson === 'threat') {
    addSam('SA15', 'sa15', THREAT_SAM_AT, 'SA-15 Tor');
    if (opts.sa11) addSam('SA11', 'sa11', THREAT_SA11_AT, 'SA-11 Buk');
  }
  return { world, me, field, groundM, tanks, bunker, trucks, sams, samUnits };
}

/** Centre of the live units in a list (m), or null when all are dead. */
export function centreOf(world: World, ids: readonly EntityId[]): { x: number; y: number; z: number } | null {
  let x = 0, y = 0, z = 0, n = 0;
  for (const id of ids) { const u = world.groundUnits.get(id); if (u?.alive) { x += u.pos.x; y += u.pos.y; z += u.pos.z; n++; } }
  return n ? { x: x / n, y: y / n, z: z / n } : null;
}
