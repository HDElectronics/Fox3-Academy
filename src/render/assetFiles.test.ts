import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { Box3, Mesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assetUrl, type AssetId } from './assetRegistry';
import { AIRCRAFT } from '../data/aircraft';
import { MISSILES } from '../data/missiles';
import { AG_WEAPONS } from '../data/agWeapons';
import { SAMS } from '../data/sams';

interface Record { id: AssetId; category: string; sha256: string }
const records = JSON.parse(await readFile(new URL('../assets/models/manifest.json', import.meta.url), 'utf8')) as Record[];
describe('production exterior files', () => {
  it('covers the app catalogs and generic ground classes with bundled URLs', () => {
    const ids = new Set(records.map(r => r.id));
    const expected = [...Object.keys(AIRCRAFT), 'su25t', ...Object.keys(MISSILES), ...Object.keys(AG_WEAPONS).filter(id => id !== 'gun25t'), ...Object.keys(SAMS), ...Object.keys(SAMS).map(id => id + '-missile'), 'r60', 'tank', 'apc', 'truck', 'bunker', 'building', 'sam-site', 'aaa'];
    expect(ids).toEqual(new Set(expected));
    expect(records.length).toBe(ids.size);
    for (const record of records) expect(assetUrl(record.id)).toBeTruthy();
  });
  for (const record of records) it(`${record.id} loads finite, bounded geometry without external resources`, async () => {
    const data = await readFile(new URL(`../assets/models/${record.id}.glb`, import.meta.url));
    const jsonLength = data.readUInt32LE(12);
    const gltf = JSON.parse(data.subarray(20, 20 + jsonLength).toString()) as { buffers: { uri?: string }[]; images?: unknown[] };
    expect(gltf.buffers.every(b => !b.uri)).toBe(true);
    expect(gltf.images ?? []).toHaveLength(0);
    const { scene } = await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '');
    let meshes = 0, triangles = 0;
    const box = new Box3().setFromObject(scene, true), size = box.getSize(new Vector3());
    expect(size.toArray().every(x => Number.isFinite(x) && x > 0)).toBe(true);
    expect(Math.max(...size.toArray())).toBeLessThan(60);
    if (record.category === 'ground') expect(box.min.y).toBeCloseTo(0, 3);
    scene.traverse(o => {
      if (!(o instanceof Mesh)) return;
      meshes++;
      const positions = o.geometry.getAttribute('position');
      expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
      triangles += (o.geometry.index?.count ?? positions.count) / 3;
      o.geometry.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
    });
    expect(meshes).toBeLessThanOrEqual(18);
    expect(triangles).toBeLessThan(60000);
  });
});
