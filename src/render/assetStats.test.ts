import { describe, expect, it } from 'vitest';
import { BoxGeometry, BufferAttribute, BufferGeometry, Group, LineSegments, Mesh, MeshBasicMaterial } from 'three';
import { meshStats } from './assetStats';
import { bundledAssetIds, assetUrl } from './assetRegistry';

describe('meshStats', () => {
  it('measures every vertex in the root frame, ignoring the root and parent transforms', () => {
    const parent = new Group();
    parent.scale.setScalar(0.001);
    parent.position.set(100, 5, 0);
    const root = new Group();
    root.rotation.y = 1.1;
    parent.add(root);
    const box = new Mesh(new BoxGeometry(2, 1, 8), new MeshBasicMaterial());
    const wing = new Group();
    wing.position.set(3, 0, 0);
    wing.rotation.z = Math.PI / 2; // a 2 x 1 x 8 box turned on its side: 1 wide, 2 tall, 8 long
    wing.add(new Mesh(new BoxGeometry(2, 1, 8), new MeshBasicMaterial()));
    root.add(box, wing);
    const s = meshStats(root);
    expect(s.bounds.min.x).toBeCloseTo(-1, 6);
    expect(s.bounds.max.x).toBeCloseTo(3.5, 6);
    expect(s.size.y).toBeCloseTo(2, 6);
    expect(s.size.z).toBeCloseTo(8, 6);
    expect(s.meshes).toBe(2);
    expect(s.triangles).toBe(24);
    expect(s.vertices).toBe(48);
  });
  it('counts non-indexed triangles, skips lines and reports an empty object as zero size', () => {
    const tri = new BufferGeometry();
    tri.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1]), 3));
    const root = new Group();
    root.add(new Mesh(tri, new MeshBasicMaterial()), new LineSegments(new BoxGeometry(50, 50, 50)));
    const s = meshStats(root);
    expect(s.triangles).toBe(2);
    expect(s.size.x).toBeCloseTo(1, 6);
    expect(meshStats(new Group()).size.toArray()).toEqual([0, 0, 0]);
  });
});

describe('bundledAssetIds', () => {
  it('lists each bundled file once, sorted, with a URL', () => {
    const ids = bundledAssetIds();
    expect(ids.length).toBeGreaterThan(50);
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(assetUrl(id), id).toBeTruthy();
    // Aliases resolve to a file but are not files themselves.
    expect(ids).toContain('agm65');
    expect(ids).not.toContain('agm65d');
  });
});
