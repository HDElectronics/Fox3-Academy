/**
 * [OWNER: page-cas] Scenario builder for the CAS & JTAC page: the Strike terrain (shared height field), the jet
 * (Su-25T, or the A-10C II with a targeting-pod loadout),
 * the JTAC (a blue ground unit with line of sight to the target), friendly vehicles near it, the briefed target
 * group, red decoys that are not the target, the IP, the allowed final attack headings and the egress point.
 * Pure sim + height field (no three.js), so tests can fly it. Every distance here is a trainer value.
 */
import { World } from '../../sim/world';
import type { Aircraft, EntityId } from '../../sim/types';
import type { AttackId } from '../../data/types';
import { terrainHook } from '../../render/attack/terrainHook';
import type { HeightField } from '../../render/terrain/heightmap';
import { strikeField, THREAT_SAM_AT, SORTIE_AAA_AT } from '../strike/scenario';

export type CasLessonId = 'nine-line' | 'talk-on' | 'geometry' | 'danger-close' | 'sortie' | 'jtac-laser' | 'digital';

/** Jets the CAS page flies. */
export type CasJet = AttackId;

export interface XZ { x: number; z: number }

/** Target group centre: the flattened pad of the shared attack field, so the JTAC always has line of sight. */
export const CAS_TARGET: XZ = { x: 0, z: 0 };
/** Final attack heading window (deg true): about 90° off the JTAC-to-target line, away from the friendlies. */
export const ATTACK_HDG: readonly [number, number] = [20, 70];
/** IP 10 km before the target on the 045 run-in. */
export const IP: XZ & { name: string } = { name: 'ASH', x: -7071, z: 7071 };
/** Egress point to the west. */
export const EGRESS: XZ & { name: string } = { name: 'PINE', x: -9000, z: -1000 };
/** Holding point for check-in, 8 km behind the IP. */
export const CONTROL_POINT: XZ & { name: string } = { name: 'OAK', x: -12728, z: 12728 };
/** JTAC 800 m south-east of the target (as in the ED example brief), with friendlies around it. */
export const JTAC_AT: XZ = { x: 570, z: 560 };
/** Friendly line centre: 900 m south-east normally, 300 m in the danger-close lesson (trainer values). */
const FRIENDLIES_AT: Record<'normal' | 'close', XZ> = { normal: { x: 640, z: 640 }, close: { x: 220, z: 200 } };
/** Decoys: red vehicles that are not the briefed target. */
const DECOYS: readonly (XZ & { kind: 'truck' | 'apc'; name: string })[] = [
  { x: 340, z: -300, kind: 'truck', name: 'Truck 1' },
  { x: 380, z: -330, kind: 'truck', name: 'Truck 2' },
  { x: -420, z: -260, kind: 'apc', name: 'APC' },
];

/** Where the jet starts per lesson, as a point on the run-in (m before the target along 045) and a height AGL. */
const START: Record<CasLessonId, { from: XZ | 'hold'; aglM: number; speed: number }> = {
  'nine-line': { from: 'hold', aglM: 2000, speed: 140 },
  // Inside 10 nm after IP inbound, so the smoke is down and the Shkval search can start.
  'talk-on': { from: { x: -6000, z: 6000 }, aglM: 1500, speed: 140 },
  geometry: { from: { x: -9500, z: 9500 }, aglM: 1500, speed: 150 },
  'danger-close': { from: { x: -6000, z: 6000 }, aglM: 1500, speed: 140 },
  sortie: { from: 'hold', aglM: 2000, speed: 150 },
  // A-10C II lessons. JTAC laser: about 12 km out, inside the AGM-65L and GBU-12 trainer bands once the spot is found.
  'jtac-laser': { from: { x: -8500, z: 8500 }, aglM: 2000, speed: 130 },
  // Digital 9-line: from the IP, with time for the tasking, the SPI and the pod before the bomb band.
  digital: { from: { x: -10600, z: 10600 }, aglM: 2200, speed: 125 },
};

/** A-10C II loadout per lesson (A10C_LOADOUTS): AGM-65L and GBU-12 for the JTAC laser, GBU-12 and APKWS otherwise. */
const A10C_LOADOUT: Record<CasLessonId, string> = {
  'nine-line': 'pgm', 'talk-on': 'pgm', geometry: 'pgm', 'danger-close': 'pgm', sortie: 'laser', 'jtac-laser': 'laser', digital: 'pgm',
};

export interface CasScenarioOptions {
  /** Sortie: add the SA-15 and the ZSU-23-4 of the Strike sortie (default true in the sortie). */
  threats?: boolean;
  /** The jet (default the Su-25T). */
  jet?: CasJet;
}

export interface CasScenario {
  lesson: CasLessonId;
  jet: CasJet;
  world: World;
  me: Aircraft;
  field: HeightField;
  groundM: number;
  jtac: EntityId;
  /** The briefed target group (the JTAC's target). */
  targets: EntityId[];
  /** Red vehicles that are not the target. */
  decoys: EntityId[];
  /** Blue vehicles near the JTAC (the JTAC itself not included). */
  friendlies: EntityId[];
  target: XZ;
  ip: XZ & { name: string };
  egress: XZ & { name: string };
  controlPoint: XZ & { name: string };
  attackHdgDeg: readonly [number, number];
  sams: EntityId[];
  aaa: EntityId | null;
}

/** Bearing (deg true, 0–360) from a to b. North is −z. */
export function bearingDeg(a: XZ, b: XZ): number {
  return ((Math.atan2(b.x - a.x, -(b.z - a.z)) * 180) / Math.PI + 360) % 360;
}

export function distM(a: XZ, b: XZ): number { return Math.hypot(b.x - a.x, b.z - a.z); }

export function buildCasScenario(lesson: CasLessonId, seed = 11, opts: CasScenarioOptions = {}): CasScenario {
  const field = strikeField();
  const world = new World(seed);
  world.terrain = terrainHook(field);
  const groundM = world.terrain.heightAt(CAS_TARGET.x, CAS_TARGET.z);
  world.groundAlt = groundM;

  const st = START[lesson];
  const at = st.from === 'hold' ? CONTROL_POINT : st.from;
  const heading = (bearingDeg(at, st.from === 'hold' ? IP : CAS_TARGET) * Math.PI) / 180;
  const y = world.terrain.heightAt(at.x, at.z) + st.aglM;
  const jet: CasJet = opts.jet ?? 'su25t';
  const me = world.spawnAircraft({
    id: jet === 'a10c' ? 'HOG' : 'SU25', side: 'blue', type: jet, controller: 'player', agLoadout: jet === 'a10c' ? A10C_LOADOUT[lesson] : 'vikhr',
    pos: { x: at.x, y, z: at.z }, heading, speed: st.speed,
  });
  me.cmd.heading = heading; me.cmd.altitude = y; me.cmd.speed = st.speed; me.cmd.afterburner = false;

  const targets: EntityId[] = [];
  const tankOffsets = [[-40, 20], [0, -10], [45, 15]] as const;
  tankOffsets.forEach(([dx, dz], i) => {
    targets.push(world.spawnGroundUnit({ id: `T${i + 1}`, kind: 'tank', side: 'red', name: `Tank ${i + 1}`, pos: { x: CAS_TARGET.x + dx, z: CAS_TARGET.z + dz }, heading: 2.2 }).id);
  });
  const decoys = DECOYS.map((d, i) => world.spawnGroundUnit({ id: `D${i + 1}`, kind: d.kind, side: 'red', name: d.name, pos: d, heading: 0.9 }).id);
  const jtac = world.spawnGroundUnit({ id: 'JTAC', kind: 'apc', side: 'blue', name: 'JTAC', pos: JTAC_AT, heading: -0.8 }).id;
  const fc = FRIENDLIES_AT[lesson === 'danger-close' ? 'close' : 'normal'];
  // Friendly line along the 045 run-in, so a correct attack heading never overflies it.
  const friendlies = [-1, 0, 1].map(k => world.spawnGroundUnit({
    id: `F${k + 2}`, kind: k === 0 ? 'tank' : 'apc', side: 'blue', name: `Friendly ${k + 2}`,
    pos: { x: fc.x + k * 60, z: fc.z - k * 60 }, heading: -0.8,
  }).id);

  const sams: EntityId[] = [];
  let aaa: EntityId | null = null;
  if (lesson === 'sortie' && opts.threats !== false) {
    const sy = world.terrain.heightAt(THREAT_SAM_AT.x, THREAT_SAM_AT.z);
    world.groundAlt = Math.min(world.groundAlt, sy);
    sams.push(world.spawnSam({ id: 'SA15', side: 'red', type: 'sa15', pos: { x: THREAT_SAM_AT.x, y: sy, z: THREAT_SAM_AT.z } }).id);
    world.spawnGroundUnit({ id: 'SA15-radar', kind: 'sam-site', side: 'red', name: 'SA-15 Tor', pos: THREAT_SAM_AT, heading: 0, samSiteId: 'SA15' });
    aaa = world.spawnGroundUnit({ id: 'ZSU', kind: 'aaa', side: 'red', name: 'ZSU-23-4', pos: SORTIE_AAA_AT, heading: 2.4 }).id;
  }
  return {
    lesson, jet, world, me, field, groundM, jtac, targets, decoys, friendlies, target: CAS_TARGET, ip: IP, egress: EGRESS,
    controlPoint: CONTROL_POINT, attackHdgDeg: ATTACK_HDG, sams, aaa,
  };
}
