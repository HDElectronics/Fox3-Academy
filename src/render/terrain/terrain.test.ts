import { afterEach, describe, expect, it, vi } from 'vitest';
import { BufferGeometry, Color, Group, InstancedMesh, Material, Matrix4, Mesh, Vector3 } from 'three';
import type { Palette } from '../palette';
import { createHeightField, heightAt, lineOfSight, normalAt, slopeAt, TerrainMesh, TerrainProps } from './index';

// Neutral test palette, like the render-kit tests: no DOM or design colour dependency.
const palette = new Proxy({}, { get: () => new Color().setScalar(0.5) }) as Palette;
afterEach(() => vi.restoreAllMocks());

describe('height field', () => {
  it('is deterministic, seed-dependent and bounded by the requested relief', () => {
    const opts = { seed: 17, segments: 32, maxReliefM: 600 };
    const a = createHeightField(opts), b = createHeightField(opts), c = createHeightField({ ...opts, seed: 18 });
    expect(a.heights).toEqual(b.heights);
    expect(a.heights).not.toEqual(c.heights);
    expect(Math.min(...a.heights)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...a.heights)).toBeLessThanOrEqual(600);
    expect(Math.max(...a.heights) - Math.min(...a.heights)).toBeGreaterThan(100);
    expect(a.extentM).toEqual({ x: 40000, z: 40000 });
  });

  it('matches every grid node and bilinearly interpolates a non-square cell', () => {
    const f = createHeightField({ seed: 9, extentM: { x: 800, z: 400 }, segments: 8 });
    for (let z = 0; z <= 8; z++) for (let x = 0; x <= 8; x++)
      expect(heightAt(f, x * 100 - 400, z * 50 - 200)).toBeCloseTo(f.heights[z * 9 + x], 10);
    f.heights[0] = 0; f.heights[1] = 100; f.heights[9] = 200; f.heights[10] = 400;
    expect(heightAt(f, -375, -175)).toBeCloseTo(137.5, 10);
    expect(heightAt(f, -999, -999)).toBe(0);
  });

  it('flattens the entire requested disc and smoothly blends outside its grid margin', () => {
    const f = createHeightField({ extentM: 2000, segments: 100, maxReliefM: 0 });
    f.flatten(13, -7, 200, 100);
    for (let angle = 0; angle < Math.PI * 2; angle += 0.13) {
      for (const radius of [0, 50, 150, 199.99, 200])
        expect(heightAt(f, 13 + Math.cos(angle) * radius, -7 + Math.sin(angle) * radius)).toBeCloseTo(100, 10);
    }
    const collar = f.flattenedAreas[0].outerRadiusM;
    const middle = heightAt(f, 13 + (200 + Math.hypot(20, 20) + collar) / 2, -7);
    expect(middle).toBeGreaterThan(0); expect(middle).toBeLessThan(100);
    expect(heightAt(f, 13 + collar + 40, -7)).toBe(0);
    expect(Math.abs(heightAt(f, 13 + collar, -7) - heightAt(f, 13 + collar - 0.01, -7))).toBeLessThan(0.1);
    f.flatten(13, -7, 20, 75);
    expect(heightAt(f, 13, -7)).toBe(75);
  });

  it('flattens a sub-cell pad and calculates normals and slopes at map edges', () => {
    const f = createHeightField({ extentM: 400, segments: 4 });
    f.flatten(13, 17, 1, 42);
    expect(heightAt(f, 13.5, 17.5)).toBe(42);
    for (let z = 0; z <= 4; z++) for (let x = 0; x <= 4; x++) f.heights[z * 5 + x] = x * 100 * 0.5;
    for (const x of [-200, 0, 200]) {
      expect(slopeAt(f, x, 0)).toBeCloseTo(Math.atan(0.5), 10);
      expect(normalAt(f, x, 0)).toEqual({ x: -0.5 / Math.hypot(0.5, 1), y: 1 / Math.hypot(0.5, 1), z: -0 });
    }
  });

  it('rejects invalid sizes and non-finite coordinates', () => {
    expect(() => createHeightField({ segments: 0 })).toThrow(RangeError);
    expect(() => createHeightField({ extentM: -1 })).toThrow(RangeError);
    expect(() => createHeightField({ maxReliefM: NaN })).toThrow(RangeError);
    const f = createHeightField({ segments: 4 });
    expect(() => heightAt(f, NaN, 0)).toThrow(RangeError);
    expect(() => f.flatten(0, 0, 0, 0)).toThrow(RangeError);
  });
});

describe('terrain line of sight', () => {
  it('clears flat ground, including vertical rays, and rejects ground contact or missing coverage', () => {
    const f = createHeightField({ extentM: 1000, segments: 10, maxReliefM: 0 });
    expect(lineOfSight(f, { x: -500, y: 10, z: 0 }, { x: 500, y: 10, z: 0 })).toBe(true);
    expect(lineOfSight(f, { x: 0, y: 1, z: 0 }, { x: 0, y: 100, z: 0 })).toBe(true);
    expect(lineOfSight(f, { x: 0, y: 0, z: 0 }, { x: 0, y: 100, z: 0 })).toBe(false);
    expect(lineOfSight(f, { x: 501, y: 100, z: 0 }, { x: 0, y: 100, z: 0 })).toBe(false);
    expect(() => lineOfSight(f, { x: 0, y: 1, z: 0 }, { x: 1, y: 1, z: 0 }, 0)).toThrow(RangeError);
  });

  it('cannot skip a ridge even when the requested step exceeds the entire segment', () => {
    const f = createHeightField({ extentM: 1000, segments: 10, maxReliefM: 0 });
    for (let z = 0; z <= 10; z++) f.heights[z * 11 + 5] = 100;
    const from = { x: -450, y: 50, z: 20 }, to = { x: 450, y: 50, z: 20 };
    expect(lineOfSight(f, from, to)).toBe(false);
    expect(lineOfSight(f, to, from, 10000)).toBe(false);
    expect(lineOfSight(f, { ...from, y: 101 }, { ...to, y: 101 }, 50)).toBe(true);
  });

  it('checks the interior extremum of a bilinear saddle, not just cell boundaries', () => {
    const f = createHeightField({ extentM: 2, segments: 2, maxReliefM: 0 });
    f.heights[1] = 100; f.heights[3] = 100;
    const a = { x: -1, z: -1, y: 40 }, b = { x: 0, z: 0, y: 40 };
    expect(heightAt(f, -0.5, -0.5)).toBe(50);
    expect(lineOfSight(f, a, b)).toBe(false);
    expect(lineOfSight(f, { ...a, y: 51 }, { ...b, y: 51 })).toBe(true);
  });
});

describe('terrain rendering resources', () => {
  it('injects surface detail without GLSL ES 3.00 reserved words', () => {
    const terrain = new TerrainMesh(createHeightField({ segments: 16 }), palette, { chunkCells: 8 });
    const material = terrain.chunks[0]!.mesh.material;
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: '#include <begin_vertex>',
      fragmentShader: '#include <color_fragment>',
    };
    material.onBeforeCompile(shader as never, undefined as never);
    // A reserved word used as an identifier makes the whole program fail validation on WebGL2.
    const reserved = ['patch', 'sample', 'input', 'output', 'filter', 'common', 'partition', 'active', 'superp'];
    for (const word of reserved) {
      expect(shader.fragmentShader).not.toMatch(new RegExp(`\\b(float|vec[234]|int)\\s+${word}\\b`));
      expect(shader.vertexShader).not.toMatch(new RegExp(`\\b(float|vec[234]|int)\\s+${word}\\b`));
    }
    terrain.dispose();
  });

  it('selects all three LODs by distance and reuses cached geometry', () => {
    const f = createHeightField({ extentM: 8000, segments: 32 });
    const terrain = new TerrainMesh(f, palette, { chunkCells: 8, lodDistancesM: [500, 2000] });
    const near = terrain.chunks.find(c => c.xM === 0 && c.zM === 0)!;
    const original = near.mesh.geometry;
    expect(near.level).toBe(0);
    expect(new Set(terrain.chunks.map(c => c.level))).toEqual(new Set([0, 1, 2]));
    terrain.setFocus(100000, 100000);
    expect(terrain.chunks.every(c => c.level === 2)).toBe(true);
    expect(near.mesh.geometry.getAttribute('position').count).toBeLessThan(original.getAttribute('position').count);
    terrain.setFocus(0, 0);
    expect(near.mesh.geometry).toBe(original);
    terrain.dispose();
  });

  it('covers partial chunks and produces upward-facing surface triangles', () => {
    const f = createHeightField({ extentM: 1100, segments: 11, maxReliefM: 0 });
    const terrain = new TerrainMesh(f, palette, { chunkCells: 8 });
    expect(terrain.chunks).toHaveLength(4);
    const edge = terrain.chunks[3];
    expect(edge.xM + edge.widthM).toBe(550);
    expect(edge.zM + edge.depthM).toBe(550);
    const g = edge.mesh.geometry, p = g.getAttribute('position'), idx = g.index!;
    const a = new Vector3().fromBufferAttribute(p, idx.getX(0));
    const b = new Vector3().fromBufferAttribute(p, idx.getX(1));
    const c = new Vector3().fromBufferAttribute(p, idx.getX(2));
    expect(b.sub(a).cross(c.sub(a)).y).toBeGreaterThan(0);
    terrain.dispose();
  });

  it('keeps shared-edge normals identical across LODs without skirt lighting seams', () => {
    const f = createHeightField({ extentM: 8000, segments: 32 });
    const terrain = new TerrainMesh(f, palette, { chunkCells: 8, lodDistancesM: [500, 2000] });
    const seen = new Map<string, number[]>();
    let shared = 0;
    for (const chunk of terrain.chunks) {
      const g = chunk.mesh.geometry, positions = g.getAttribute('position'), normals = g.getAttribute('normal');
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
        if (Math.abs(y - heightAt(f, x, z)) > 0.001) continue; // omit skirt bottoms
        const normal = [normals.getX(i), normals.getY(i), normals.getZ(i)];
        const key = `${x},${z}`, previous = seen.get(key);
        if (previous) { expect(normal).toEqual(previous); shared++; }
        else seen.set(key, normal);
        expect(normal[1]).toBeGreaterThan(0);
      }
    }
    expect(shared).toBeGreaterThan(0);
    expect(new Set(terrain.chunks.map(c => c.level)).size).toBe(3);
    terrain.dispose();
  });

  it('disposes active and cached LOD geometries and its material exactly once', () => {
    const terrain = new TerrainMesh(createHeightField({ segments: 16 }), palette, { chunkCells: 8 });
    const geometries = new Set(terrain.chunks.map(c => c.mesh.geometry));
    for (const focus of [0, 3000, 6000, 10000, 20000, 100000]) {
      terrain.setFocus(focus, focus);
      for (const c of terrain.chunks) geometries.add(c.mesh.geometry);
    }
    const geometryDispose = vi.spyOn(BufferGeometry.prototype, 'dispose');
    const materialDispose = vi.spyOn(Material.prototype, 'dispose');
    const parent = new Group().add(terrain);
    terrain.dispose(); terrain.dispose(); terrain.setFocus(0, 0);
    expect(geometryDispose).toHaveBeenCalledTimes(geometries.size);
    expect(new Set(geometryDispose.mock.contexts)).toEqual(geometries);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    expect(parent.children).toHaveLength(0);
    expect(terrain.children).toHaveLength(0);
  });
});

const instanceData = (props: TerrainProps) => {
  const out: { name: string; data: number[] }[] = [];
  props.traverse(o => { if (o instanceof InstancedMesh) out.push({ name: o.name, data: [...o.instanceMatrix.array] }); });
  return out;
};
describe('terrain props', () => {
  it('scatters deterministically with density control and shared instanced geometry', () => {
    const f = createHeightField({ extentM: 4000, segments: 32, maxReliefM: 0 });
    const a = new TerrainProps(f, palette), b = new TerrainProps(f, palette);
    const empty = new TerrainProps(f, palette, { density: 0 });
    expect(instanceData(a)).toEqual(instanceData(b));
    expect(a.counts.tree).toBeGreaterThan(0);
    expect(a.counts.building).toBeGreaterThan(0);
    expect(a.counts.road).toBeGreaterThan(0);
    expect(empty.children).toHaveLength(0);
    const geometries = new Set<BufferGeometry>();
    a.traverse(o => { if (o instanceof Mesh) geometries.add(o.geometry); });
    expect(geometries.size).toBe(5);
    a.dispose(); b.dispose(); empty.dispose();
  });

  it('excludes flatten collars and steep slopes unless explicitly allowed', () => {
    const f = createHeightField({ extentM: 2000, segments: 20, maxReliefM: 0 });
    f.flatten(0, 0, 400, 0);
    const props = new TerrainProps(f, palette, { density: 3 });
    const matrix = new Matrix4(), point = new Vector3();
    props.traverse(o => {
      if (!(o instanceof InstancedMesh)) return;
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, matrix); point.setFromMatrixPosition(matrix);
        expect(Math.hypot(point.x, point.z)).toBeGreaterThan(f.flattenedAreas[0].outerRadiusM);
      }
    });
    props.dispose();
    f.flatten(0, 0, 2000, 0);
    const excluded = new TerrainProps(f, palette), included = new TerrainProps(f, palette, { includeFlattened: true });
    expect(excluded.counts.tree).toBe(0); expect(included.counts.tree).toBeGreaterThan(0);
    excluded.dispose(); included.dispose();
    const steep = createHeightField({ extentM: 2000, segments: 20 });
    for (let z = 0; z <= 20; z++) for (let x = 0; x <= 20; x++) steep.heights[z * 21 + x] = x * 100;
    const none = new TerrainProps(steep, palette);
    expect(none.counts.tree + none.counts.building + none.counts.road).toBe(0);
    none.dispose();
  });

  it('culls distant batches and disposes five shared geometries, materials and every instance buffer once', () => {
    const props = new TerrainProps(createHeightField({ extentM: 4000, segments: 16, maxReliefM: 0 }), palette);
    props.setFocus(100000, 100000);
    expect(props.children.every(c => !c.visible)).toBe(true);
    props.setFocus(0, 0);
    expect(props.children.some(c => c.visible)).toBe(true);
    const geometries = vi.spyOn(BufferGeometry.prototype, 'dispose');
    const materials = vi.spyOn(Material.prototype, 'dispose');
    const instances = vi.spyOn(InstancedMesh.prototype, 'dispose');
    const count = instanceData(props).length;
    const parent = new Group().add(props);
    props.dispose(); props.dispose();
    expect(geometries).toHaveBeenCalledTimes(5);
    expect(materials).toHaveBeenCalledTimes(5);
    expect(instances).toHaveBeenCalledTimes(count);
    expect(parent.children).toHaveLength(0);
  });
});
