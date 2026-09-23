import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial } from 'three';
import type { Palette } from '../palette';
import { heightAt, normalAt, type HeightField } from './heightmap';

export interface TerrainMeshOptions {
  /** Grid cells per chunk, default 64; positive multiple of 4. */
  chunkCells?: number;
  /** Distances from focus to the nearest chunk edge; default [3000, 10000] metres. */
  lodDistancesM?: readonly [number, number];
  /** Procedural surface mottling visible at pod magnification; default true. */
  detail?: boolean;
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
    this.material = new MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
    if (opts.detail !== false) {
      // All pigment comes from the palette. Noise changes the mixture, never the geometry/LOS.
      this.material.onBeforeCompile = shader => {
        shader.uniforms.terrainEarth = { value: palette.earth.clone() };
        shader.uniforms.terrainRock = { value: palette.smoke.clone().lerp(palette.earth, 0.35) };
        shader.vertexShader = 'varying vec2 terrainXZ;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nterrainXZ = position.xz;');
        shader.fragmentShader = /* glsl */ `
          varying vec2 terrainXZ;
          uniform vec3 terrainEarth;
          uniform vec3 terrainRock;
          float terrainHash(vec2 p) {
            vec3 q = fract(vec3(p.xyx) * 0.1031);
            q += dot(q, q.yzx + 33.33);
            return fract((q.x + q.y) * q.z);
          }
          float terrainNoise(vec2 p) {
            vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
            float n = mix(mix(terrainHash(i), terrainHash(i + vec2(1, 0)), u.x),
              mix(terrainHash(i + vec2(0, 1)), terrainHash(i + vec2(1, 1)), u.x), u.y);
            return mix(n, 0.5, smoothstep(0.25, 1.0, max(fwidth(p.x), fwidth(p.y))));
          }
        ` + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', /* glsl */ `
          #include <color_fragment>
          float terrainPatch = terrainNoise(terrainXZ / 95.0);
          float grain = terrainNoise(terrainXZ / 2.5);
          float scrub = terrainNoise(terrainXZ / 18.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, terrainEarth, terrainPatch * 0.22);
          diffuseColor.rgb = mix(diffuseColor.rgb, terrainRock, (grain * 0.10 + scrub * 0.12));
        `);
      };
      this.material.customProgramCacheKey = () => 'terrain-surface-v1';
    }
    this.palette = palette;
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
  private readonly palette: Palette;

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
    const positions: number[] = [], colors: number[] = [], normals: number[] = [], indices: number[] = [];
    const low = this.palette.earth.clone().lerp(this.palette.ok, 0.12);
    const high = this.palette.earth.clone().lerp(this.palette.smoke, 0.32);
    const rock = this.palette.smoke.clone().lerp(this.palette.dark, 0.4);
    const color = low.clone();
    for (const iz of zs) for (const ix of xs) {
      const x = ix * f.cellXM - f.extentM.x / 2, z = iz * f.cellZM - f.extentM.z / 2;
      const h = heightAt(f, x, z);
      positions.push(x, h, z);
      const normal = normalAt(f, x, z);
      normals.push(normal.x, normal.y, normal.z);
      color.copy(low).lerp(high, Math.max(0, Math.min(1, h / Math.max(1, f.maxReliefM))));
      color.lerp(rock, Math.min(1, Math.max(0, (Math.acos(Math.min(1, normal.y)) - 0.18) / 0.45)));
      colors.push(color.r, color.g, color.b);
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
      colors.push(colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2]);
      normals.push(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]);
    }
    for (let i = 0; i < edge.length; i++) {
      const j = (i + 1) % edge.length;
      indices.push(edge[i], edge[j], base + i, edge[j], base + j, base + i);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
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
