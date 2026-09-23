import {
  BoxGeometry, BufferGeometry, ConeGeometry, CylinderGeometry, Group, InstancedMesh,
  Matrix4, MeshStandardMaterial, Object3D, PlaneGeometry,
} from 'three';
import type { Palette } from '../palette';
import { heightAt, slopeAt, terrainRandom, type HeightField } from './heightmap';

export interface TerrainPropsOptions {
  seed?: number;
  /** Multiplier: 1 attempts 8 tree clumps and 1 building/road per square km. Default 1. */
  density?: number;
  /** Hard cap on scatter attempts (default 20000); each clump contains three trees. */
  maxSites?: number;
  /** Include flatten discs and their transition collars; default false. */
  includeFlattened?: boolean;
  /** Default 0.2 radians (about 11 degrees). */
  maxSlopeRad?: number;
  /** Spatial batching in metres, default 2500. */
  chunkSizeM?: number;
  /** Distance from focus to chunk edge, default 3000; Infinity shows all props. */
  viewDistanceM?: number;
}
type Kind = 'trunk' | 'tree' | 'building' | 'roof' | 'road';
interface Batch { xM: number; zM: number; group: Group; matrices: Map<Kind, Matrix4[]> }

/** Decorative scenery only: no collision, target identity or LOS occlusion. Authored in metres. */
export class TerrainProps extends Group {
  readonly counts: Readonly<Record<Kind, number>>;
  private readonly batches: Batch[] = [];
  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: MeshStandardMaterial[] = [];
  private readonly instances: InstancedMesh[] = [];
  private readonly chunkSize: number;
  private readonly viewDistance: number;
  private disposed = false;

  constructor(field: HeightField, palette: Palette, opts: TerrainPropsOptions = {}) {
    super();
    this.name = 'terrain:props';
    const density = opts.density ?? 1, cap = opts.maxSites ?? 20000, maxSlope = opts.maxSlopeRad ?? 0.2;
    this.chunkSize = opts.chunkSizeM ?? 2500;
    this.viewDistance = opts.viewDistanceM ?? 3000;
    const seed = opts.seed ?? field.seed;
    if (![density, cap, maxSlope, this.chunkSize, seed].every(Number.isFinite) || density < 0 ||
      cap < 0 || !Number.isInteger(cap) || maxSlope < 0 || maxSlope > Math.PI / 2 || this.chunkSize <= 0 ||
      Number.isNaN(this.viewDistance) || this.viewDistance < 0)
      throw new RangeError('Invalid terrain scatter options');
    const counts: Record<Kind, number> = { trunk: 0, tree: 0, building: 0, roof: 0, road: 0 };
    this.counts = counts;
    const rand = terrainRandom(seed ^ 0x1a57ca7), transform = new Object3D();
    const hx = field.extentM.x / 2, hz = field.extentM.z / 2;
    const batchMap = new Map<string, Batch>();
    const allowed = (x: number, z: number, radius: number) => {
      if (Math.abs(x) + radius > hx || Math.abs(z) + radius > hz) return false;
      if (!opts.includeFlattened && field.flattenedAreas.some(a => Math.hypot(x - a.x, z - a.z) <= a.outerRadiusM + radius)) return false;
      return [[0, 0], [-radius, 0], [radius, 0], [0, -radius], [0, radius]]
        .every(([dx, dz]) => slopeAt(field, x + dx, z + dz) <= maxSlope);
    };
    const place = (kind: Kind, x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw: number, pitch = 0) => {
      const bx = Math.floor((x + hx) / this.chunkSize), bz = Math.floor((z + hz) / this.chunkSize), key = `${bx},${bz}`;
      let batch = batchMap.get(key);
      if (!batch) {
        batch = { xM: bx * this.chunkSize - hx, zM: bz * this.chunkSize - hz, group: new Group(), matrices: new Map() };
        batch.group.name = `terrain:props:${key}`;
        batchMap.set(key, batch); this.batches.push(batch); this.add(batch.group);
      }
      transform.position.set(x, y, z);
      transform.rotation.set(pitch, yaw, 0, 'YXZ');
      transform.scale.set(sx, sy, sz); transform.updateMatrix();
      let matrices = batch.matrices.get(kind);
      if (!matrices) { matrices = []; batch.matrices.set(kind, matrices); }
      matrices.push(transform.matrix.clone()); counts[kind]++;
    };
    const sites = Math.min(cap, Math.floor(field.extentM.x * field.extentM.z / 1e6 * 9 * density));
    for (let i = 0; i < sites; i++) {
      const x = (rand() * 2 - 1) * hx, z = (rand() * 2 - 1) * hz;
      const building = rand() < 1 / 9, yaw = rand() * Math.PI * 2;
      if (!allowed(x, z, building ? 20 : 22)) continue;
      if (!building) {
        for (let t = 0; t < 3; t++) {
          const tx = x + (rand() - 0.5) * 24, tz = z + (rand() - 0.5) * 24;
          const h = 7 + rand() * 7, r = 2 + rand() * 2;
          if (!allowed(tx, tz, r)) continue;
          const y = heightAt(field, tx, tz);
          place('trunk', tx, y - 1, tz, 0.35, h * 0.5 + 1, 0.35, yaw);
          place('tree', tx, y + h * 0.25, tz, r, h * 0.75, r, yaw);
        }
      } else {
        const w = 8 + rand() * 8, d = 10 + rand() * 12, h = 4 + rand() * 5;
        // Sink the foundation slightly; low slope sites keep it seated without flattening the field.
        const y = Math.min(heightAt(field, x, z), heightAt(field, x - w / 2, z), heightAt(field, x + w / 2, z)) - 1;
        place('building', x, y, z, w, h + 1, d, yaw);
        place('roof', x, y + h + 1, z, w * 0.75, 3, d * 0.75, yaw);
        // Short access road: connected flat strips following terrain, kept outside the building footprint.
        const forwardX = Math.sin(yaw), forwardZ = Math.cos(yaw), rightX = Math.cos(yaw), rightZ = -Math.sin(yaw);
        for (let s = -12; s < 12; s++) {
          const along = s * 5, offset = w / 2 + 8;
          const ax = x + rightX * offset + forwardX * along, az = z + rightZ * offset + forwardZ * along;
          const bx = ax + forwardX * 5, bz = az + forwardZ * 5;
          const mx = (ax + bx) / 2, mz = (az + bz) / 2;
          if (!allowed(mx, mz, 4)) continue;
          const ay = heightAt(field, ax, az), by = heightAt(field, bx, bz);
          place('road', mx, (ay + by) / 2 + 0.18, mz, 5, 1, Math.hypot(5, by - ay), yaw, -Math.atan2(by - ay, 5));
        }
      }
    }
    if (sites === 0) return;
    const geometry: Record<Kind, BufferGeometry> = {
      trunk: new CylinderGeometry(1, 1, 1, 5).translate(0, 0.5, 0),
      tree: new ConeGeometry(1, 1, 5).translate(0, 0.5, 0),
      building: new BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
      roof: new ConeGeometry(1, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0),
      road: new PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    };
    const colors = {
      trunk: palette.dark.clone().lerp(palette.earth, 0.6),
      tree: palette.earth.clone().lerp(palette.ok, 0.25).lerp(palette.dark, 0.2),
      building: palette.smoke.clone().lerp(palette.earth, 0.35),
      roof: palette.earth.clone().lerp(palette.dark, 0.45),
      road: palette.dark.clone().lerp(palette.smoke, 0.18),
    };
    for (const kind of Object.keys(geometry) as Kind[]) {
      const material = new MeshStandardMaterial({ color: colors[kind], roughness: 1, flatShading: true,
        ...(kind === 'road' ? { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 } : {}) });
      this.geometries.push(geometry[kind]); this.materials.push(material);
      for (const batch of this.batches) {
        const matrices = batch.matrices.get(kind);
        if (!matrices?.length) continue;
        const mesh = new InstancedMesh(geometry[kind], material, matrices.length);
        mesh.name = `terrain:${kind}`;
        matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        batch.group.add(mesh); this.instances.push(mesh);
      }
    }
    // Instance data is on the meshes; do not retain duplicate matrices after construction.
    for (const batch of this.batches) batch.matrices.clear();
    this.setFocus(0, 0);
  }

  /** Match the terrain focus to retain props around a distant pod target. Whole batches are culled. */
  setFocus(x: number, z: number): void {
    if (this.disposed) return;
    if (!Number.isFinite(x) || !Number.isFinite(z)) throw new RangeError('Prop focus must be finite');
    for (const b of this.batches) {
      const dx = Math.max(b.xM - x, 0, x - b.xM - this.chunkSize);
      const dz = Math.max(b.zM - z, 0, z - b.zM - this.chunkSize);
      b.group.visible = Math.hypot(dx, dz) <= this.viewDistance;
    }
  }

  override dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const mesh of this.instances) mesh.dispose();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.instances.length = this.geometries.length = this.materials.length = 0;
    for (const batch of this.batches) batch.group.clear();
    this.batches.length = 0;
    this.clear(); this.removeFromParent();
    super.dispose();
  }
}
