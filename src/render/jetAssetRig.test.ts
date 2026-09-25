import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { Box3, Mesh, PropertyBinding, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** Protect the named moving parts through asset regeneration and static-mesh optimization. */
describe('bundled F-14 exterior rig', () => {
  it('retains separate wing pivots and symmetric aft sweep in the shipped GLB', async () => {
    const data = await readFile(new URL('../assets/models/f14b.glb', import.meta.url));
    const { scene } = await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '');
    try {
      const port = scene.getObjectByName(PropertyBinding.sanitizeNodeName('wing.swing.port'));
      const starboard = scene.getObjectByName(PropertyBinding.sanitizeNodeName('wing.swing.starboard'));
      expect(port).toBeDefined(); expect(starboard).toBeDefined();
      if (!port || !starboard) return;
      expect(port.position.x).toBeLessThan(0); expect(starboard.position.x).toBeGreaterThan(0);
      expect(port.position.x).toBeCloseTo(-starboard.position.x);
      expect(port.position.z).toBeCloseTo(starboard.position.z);
      const spread = new Box3().setFromObject(scene, true).getSize(new Vector3());
      const frontSpread = new Box3().setFromObject(port, true).min.z;
      port.rotation.y = 48 * Math.PI / 180; starboard.rotation.y = -48 * Math.PI / 180;
      const swept = new Box3().setFromObject(scene, true).getSize(new Vector3());
      const portBox = new Box3().setFromObject(port, true), rightBox = new Box3().setFromObject(starboard, true);
      expect(spread.x).toBeGreaterThan(19);
      expect(swept.x).toBeLessThan(spread.x * 0.8);
      expect(portBox.min.z).toBeGreaterThan(frontSpread);
      expect(portBox.min.x).toBeCloseTo(-rightBox.max.x, 2);
      expect(portBox.max.z).toBeCloseTo(rightBox.max.z, 2);
    } finally {
      scene.traverse(o => {
        if (!(o instanceof Mesh)) return;
        o.geometry.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
      });
    }
  });
});
