/**
 * [OWNER: page-tgp] Scenario builder for the Targeting pod & Mavericks page (A-10C II): the shared attack terrain
 * (strike field), the jet with a pod loadout, a vehicle column on the flattened pad, a truck group beside it, a
 * friendly unit that lases the trucks for the LSS lesson, and the steerpoint (the default SPI). Pure sim + height
 * field (no three.js), so tests can fly it. Every distance, height and speed here is a trainer value.
 */
import { World } from '../../sim/world';
import type { Aircraft, AttackState, EntityId, GroundMark } from '../../sim/types';
import type { AgWeaponId } from '../../data/types';
import { AG_WEAPONS } from '../../data/agWeapons';
import { terrainHook } from '../../render/attack/terrainHook';
import type { HeightField } from '../../render/terrain/heightmap';
import { strikeField, TRUCKS_AT } from '../strike/scenario';

export type TgpLessonId = 'soi' | 'pod' | 'laser' | 'mav' | 'lgb' | 'gun';
export const TGP_LESSON_ORDER: TgpLessonId[] = ['soi', 'pod', 'laser', 'mav', 'lgb', 'gun'];

export interface XZ { x: number; z: number }

/** Vehicle column: four tanks and two APCs nose to tail on the pad, heading north-west. */
export const COLUMN_AT = { x: 0, z: 0, headingRad: -Math.PI / 4, gapM: 45 } as const;
/** Truck group (light targets for APKWS and the gun), beside the column. */
export { TRUCKS_AT };
/** Steerpoint (the default SPI): 700 m south-west of the column, so the pod has to be slewed onto it. */
export const STEERPOINT: XZ & { name: string } = { name: 'WP1', x: -500, z: 500 };
/** Friendly unit that lases the trucks in the LSS lesson, and its code (trainer scenario). */
export const BUDDY_AT: XZ = { x: 700, z: 650 };
export const BUDDY_CODE = 1511;

/** Start per lesson: range south of the column (m), height above the pad (m), speed (m/s). */
export const START: Record<TgpLessonId, { rangeM: number; aglM: number; speed: number; loadout: string }> = {
  soi: { rangeM: 14000, aglM: 2400, speed: 110, loadout: 'pgm' },
  pod: { rangeM: 14000, aglM: 2400, speed: 110, loadout: 'pgm' },
  laser: { rangeM: 14000, aglM: 2400, speed: 110, loadout: 'pgm' },
  // ED Maverick lesson: about 200 KIAS, lock at about 7.5 nm (research a10c.md §6-7).
  mav: { rangeM: 16500, aglM: 2600, speed: 105, loadout: 'maverick' },
  lgb: { rangeM: 13000, aglM: 3000, speed: 115, loadout: 'pgm' },
  gun: { rangeM: 6500, aglM: 1100, speed: 140, loadout: 'pgm' },
};

export interface TgpScenario {
  lesson: TgpLessonId;
  world: World;
  me: Aircraft;
  field: HeightField;
  groundM: number;
  /** Column vehicles (tanks first), the trucks, the friendly lasing unit (laser lesson) and its spot. */
  column: EntityId[];
  trucks: EntityId[];
  buddy: EntityId | null;
  buddySpot: EntityId | null;
  steerpoint: XZ & { name: string };
  /** Every red vehicle (the lesson targets). */
  targets: EntityId[];
}

/**
 * Add a store to a spawned jet (trainer loadout mix: the laser-weapons lesson carries the AGM-65L beside the
 * GBU-12 and APKWS of the PGM loadout). Keeps stations, the store count and the default laser code in step.
 */
export function addStore(ag: AttackState, weapon: AgWeaponId, station: number, count: number): void {
  ag.stations.push({ station, weapon, count });
  ag.stores[weapon] = (ag.stores[weapon] ?? 0) + count;
  const code = AG_WEAPONS[weapon].defaultLaserCode;
  if (code != null && ag.laserCodes[weapon] == null) ag.laserCodes[weapon] = code;
}

export function buildTgpScenario(lesson: TgpLessonId, seed = 13): TgpScenario {
  const field = strikeField();
  const world = new World(seed);
  world.terrain = terrainHook(field);
  const groundM = world.terrain.heightAt(COLUMN_AT.x, COLUMN_AT.z);
  world.groundAlt = groundM;
  const st = START[lesson];
  const aimAt = lesson === 'gun' ? TRUCKS_AT : COLUMN_AT;
  const y = groundM + st.aglM;
  const me = world.spawnAircraft({
    id: 'HOG', side: 'blue', type: 'a10c', controller: 'player', agLoadout: st.loadout,
    pos: { x: aimAt.x, y, z: aimAt.z + st.rangeM }, heading: 0, speed: st.speed,
  });
  me.cmd.heading = 0; me.cmd.altitude = y; me.cmd.speed = st.speed; me.cmd.afterburner = false;
  const ag = me.ag!;
  if (lesson === 'lgb') addStore(ag, 'agm65l', 9, 1);
  // Every lesson starts with no profile selected: the pilot picks it (the MAV page reads SENSOR until then).
  world.selectAgWeapon(me.id, null);
  // Trainer start state: the pod on and timed out in A-G, looking at the steerpoint.
  world.tgpPower(me.id, true);
  world.tgpPointAt(me.id, STEERPOINT);

  const column: EntityId[] = [];
  const hx = Math.sin(COLUMN_AT.headingRad), hz = -Math.cos(COLUMN_AT.headingRad);
  for (let i = 0; i < 6; i++) {
    const k = (2.5 - i) * COLUMN_AT.gapM;
    const pos = { x: COLUMN_AT.x + hx * k, z: COLUMN_AT.z + hz * k };
    const tank = i < 4;
    column.push(world.spawnGroundUnit({
      id: tank ? `T${i + 1}` : `APC${i - 3}`, kind: tank ? 'tank' : 'apc', side: 'red', name: tank ? `Tank ${i + 1}` : `APC ${i - 3}`,
      pos, heading: COLUMN_AT.headingRad,
    }).id);
  }
  const trucks: EntityId[] = [];
  for (let i = 0; i < 3; i++) {
    trucks.push(world.spawnGroundUnit({ id: `TR${i + 1}`, kind: 'truck', side: 'red', name: `Truck ${i + 1}`, pos: { x: TRUCKS_AT.x + i * 28, z: TRUCKS_AT.z - i * 30 }, heading: 0.8 }).id);
  }
  let buddy: EntityId | null = null, buddySpot: EntityId | null = null;
  if (lesson === 'laser') {
    buddy = world.spawnGroundUnit({ id: 'R2', kind: 'apc', side: 'blue', name: 'Ranger 2', pos: BUDDY_AT, heading: -0.8 }).id;
    const truck = world.groundUnits.get(trucks[1]!)!;
    buddySpot = world.spawnMark({ type: 'laser', side: 'blue', ownerId: buddy, pos: truck.pos, code: BUDDY_CODE, followUnitId: truck.id }).id;
  }
  return { lesson, world, me, field, groundM, column, trucks, buddy, buddySpot, steerpoint: STEERPOINT, targets: [...column, ...trucks] };
}

/** Centre of the live units in a list, or null when all are dead. */
export function centreOf(world: World, ids: readonly EntityId[]): { x: number; y: number; z: number } | null {
  let x = 0, y = 0, z = 0, n = 0;
  for (const id of ids) { const u = world.groundUnits.get(id); if (u?.alive) { x += u.pos.x; y += u.pos.y; z += u.pos.z; n++; } }
  return n ? { x: x / n, y: y / n, z: z / n } : null;
}

/** The buddy's laser spot, while it is on. */
export function buddyMark(sc: TgpScenario): GroundMark | null {
  const m = sc.buddySpot ? sc.world.marks.get(sc.buddySpot) : undefined;
  return m?.alive ? m : null;
}
