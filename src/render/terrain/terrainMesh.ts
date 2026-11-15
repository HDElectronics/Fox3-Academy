import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, Vector3, Vector4 } from 'three';
import type { Palette } from '../palette';
import { createAtmosphereUniforms, MAX_PADS, patchSurface, type AtmosphereUniforms } from '../atmosphere';
import { heightAt, normalAt, type HeightField } from './heightmap';

export interface TerrainMeshOptions {
  /** Grid cells per chunk, default 64; positive multiple of 4. */
  chunkCells?: number;
  /** Distances from focus to the nearest chunk edge; default [3000, 10000] metres. */
  lodDistancesM?: readonly [number, number];
  /** Fine albedo and normal detail visible at pod magnification; default true. */
  detail?: boolean;
  /**
   * The Stage's world-shader uniforms (`stage.env.atmosphere`) so the terrain shares the sky's haze, sun, cloud
   * shadows and land colours. Without it the terrain makes its own (default sun, no clouds).
   */
  atmosphere?: AtmosphereUniforms;
}
export interface TerrainChunk {
  readonly xM: number;
  readonly zM: number;
  readonly widthM: number;
  readonly depthM: number;
  readonly mesh: Mesh<BufferGeometry, MeshStandardMaterial>;
  /** 0 = full grid, 1 = every second node, 2 = every fourth node. */
  readonly level: number;
}
interface Chunk extends TerrainChunk {
  level: number;
  ix: number; iz: number; nx: number; nz: number;
  geometries: Map<number, BufferGeometry>;
}

/** Built in metres. Add under a Group scaled by 0.001 when using Stage's kilometre scene. */
export class TerrainMesh extends Group {
  readonly field: HeightField;
  readonly chunks: readonly TerrainChunk[];
  private readonly tiles: Chunk[] = [];
  private readonly material: MeshStandardMaterial;
  private readonly distances: readonly [number, number];
  private readonly skirtDepth: number;
  private disposed = false;

  constructor(field: HeightField, palette: Palette, opts: TerrainMeshOptions = {}) {
    super();
    this.name = 'terrain';
    this.field = field;
    const size = opts.chunkCells ?? 64;
    const distances = opts.lodDistancesM ?? [3000, 10000];
    if (!Number.isInteger(size) || size < 4 || size % 4 !== 0 ||
      !distances.every(Number.isFinite) || distances[0] < 0 || distances[1] <= distances[0])
      throw new RangeError('Terrain chunks require a positive multiple of 4 and increasing LOD distances');
    this.distances = [...distances];
    let low = Infinity, high = -Infinity;
    for (const h of field.heights) { low = Math.min(low, h); high = Math.max(high, h); }
    this.skirtDepth = Math.max(1, high - low + 1);
    // Albedo is procedural (atmosphere.ts): fields, woods and scrub by slope and height, rock on steep ground,
    // cleared ground on flattened pads, fine detail for the pod, the Stage's haze. Visual only: heights untouched.
    this.material = new MeshStandardMaterial({ roughness: 0.97, metalness: 0 });
    const atmosphere = opts.atmosphere ?? createAtmosphereUniforms(palette, new Vector3(0.49, 0.64, 0.59).normalize(), { value: 0 });
    const pads = [...field.flattenedAreas].sort((a, b) => b.radiusM - a.radiusM).slice(0, MAX_PADS)
      .map(a => new Vector4(a.x / 1000, a.z / 1000, (a.radiusM * 1.05) / 1000, (a.outerRadiusM * 1.3) / 1000));
    while (pads.length < MAX_PADS) pads.push(new Vector4(0, 0, -1, -1));
    patchSurface(this.material, { kind: 'terrain', atmosphere, detail: opts.detail !== false, pads: { value: pads }, reliefM: field.maxReliefM });
    for (let iz = 0; iz < field.segments; iz += size) for (let ix = 0; ix < field.segments; ix += size) {
      const nx = Math.min(size, field.segments - ix), nz = Math.min(size, field.segments - iz);
      // No unused placeholder geometries: build only the initial selected LOD.
      const chunk = {
        ix, iz, nx, nz, xM: ix * field.cellXM - field.extentM.x / 2,
        zM: iz * field.cellZM - field.extentM.z / 2, widthM: nx * field.cellXM,
        depthM: nz * field.cellZM, level: -1, geometries: new Map<number, BufferGeometry>(),
      };
      const level = this.levelAt(chunk, 0, 0);
      const geometry = this.buildGeometry(chunk, level);
      chunk.geometries.set(level, geometry);
      const tile: Chunk = { ...chunk, level, mesh: new Mesh(geometry, this.material) };
      tile.mesh.name = `terrain:${ix},${iz}`;
      this.tiles.push(tile);
      this.add(tile.mesh);
    }
    this.chunks = this.tiles;
  }
  private levelAt(c: Pick<TerrainChunk, 'xM' | 'zM' | 'widthM' | 'depthM'>, x: number, z: number): number {
    const dx = Math.max(c.xM - x, 0, x - c.xM - c.widthM);
    const dz = Math.max(c.zM - z, 0, z - c.zM - c.depthM);
    const distance = Math.hypot(dx, dz);
    return distance <= this.distances[0] ? 0 : distance <= this.distances[1] ? 1 : 2;
  }

  /** Focus may be the TV pod's ground aim point, independent of the camera position. */
  setFocus(x: number, z: number): void {
    if (this.disposed) return;
    if (!Number.isFinite(x) || !Number.isFinite(z)) throw new RangeError('Terrain focus must be finite');
    for (const c of this.tiles) {
      const level = this.levelAt(c, x, z);
      if (level === c.level) continue;
      let geometry = c.geometries.get(level);
      if (!geometry) { geometry = this.buildGeometry(c, level); c.geometries.set(level, geometry); }
      c.mesh.geometry = geometry;
      c.level = level;
    }
  }

  private buildGeometry(c: { ix: number; iz: number; nx: number; nz: number }, level: number): BufferGeometry {
    const f = this.field, stride = 2 ** level;
    const xs: number[] = [], zs: number[] = [];
    for (let x = 0; x < c.nx; x += stride) xs.push(c.ix + x);
    for (let z = 0; z < c.nz; z += stride) zs.push(c.iz + z);
    xs.push(c.ix + c.nx); zs.push(c.iz + c.nz);
    const positions: number[] = [], normals: number[] = [], indices: number[] = [];
    for (const iz of zs) for (const ix of xs) {
      const x = ix * f.cellXM - f.extentM.x / 2, z = iz * f.cellZM - f.extentM.z / 2;
      const h = heightAt(f, x, z);
      positions.push(x, h, z);
      const normal = normalAt(f, x, z);
      normals.push(normal.x, normal.y, normal.z);
    }
    const w = xs.length, d = zs.length;
    for (let z = 0; z < d - 1; z++) for (let x = 0; x < w - 1; x++) {
      const a = z * w + x, b = a + 1, cc = a + w, dd = cc + 1;
      indices.push(a, cc, b, b, cc, dd);
    }
    // Perimeter skirts cover T-junctions between unequal resolutions, including partial edge chunks.
    const edge: number[] = [];
    for (let x = 0; x < w; x++) edge.push(x);
    for (let z = 1; z < d; z++) edge.push(z * w + w - 1);
    for (let x = w - 2; x >= 0; x--) edge.push((d - 1) * w + x);
    for (let z = d - 2; z > 0; z--) edge.push(z * w);
    const base = positions.length / 3;
    for (const i of edge) {
      positions.push(positions[i * 3], positions[i * 3 + 1] - this.skirtDepth, positions[i * 3 + 2]);
      normals.push(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]);
    }
    for (let i = 0; i < edge.length; i++) {
      const j = (i + 1) % edge.length;
      indices.push(edge[i], edge[j], base + i, edge[j], base + j, base + i);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    // Field normals are identical on shared edges at every LOD. Skirts must not tilt the surface
    // normals or each chunk would acquire a visible dark border.
    geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    return geometry;
  }

  /** Idempotent. Frees every cached LOD, shared material, and detaches this group. */
  override dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const c of this.tiles) {
      for (const geometry of c.geometries.values()) geometry.dispose();
      c.geometries.clear();
      c.mesh.dispose();
    }
    this.material.dispose();
    this.clear();
    this.tiles.length = 0;
    this.removeFromParent();
    super.dispose();
  }
}
