import { bindA10Rig, A10_HINGES } from './a10Rig';
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


describe('bundled A-10 exterior rig', () => {
  it('keeps the requested envelope and moves gear, flaps and both deceleron halves symmetrically', async () => {
    const data = await readFile(new URL('../assets/models/a10c.glb', import.meta.url));
    const { scene } = await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '');
    try {
      const clean = new Box3().setFromObject(scene, true);
      const size = clean.getSize(new Vector3());
      expect(size.x).toBeCloseTo(17.53, 2); expect(size.z).toBeCloseTo(16.26, 1);
      expect(clean.getCenter(new Vector3()).z).toBeCloseTo(0, 2);
      const canopy = scene.getObjectByName(PropertyBinding.sanitizeNodeName('static.Canopy glass'))!;
      expect(new Box3().setFromObject(canopy, true).max.z).toBeLessThan(-3);
      const rig = bindA10Rig(scene);
      expect(rig).not.toBeNull();
      const part = (name: string) => scene.getObjectByName(PropertyBinding.sanitizeNodeName(name))!;
      const bounds = (name: string) => new Box3().setFromObject(part(name), true);
      const originals = A10_HINGES.map(h => part(h.name).quaternion.clone());
      const flapUp = bounds('flap.port').min.y, top = bounds('deceleron.port.upper').max.y, bottom = bounds('deceleron.port.lower').min.y;
      rig!({ gear: 1, flaps: 1, speedbrake: 1, hook: 0 });
      scene.updateMatrixWorld(true);
      for (const side of ['port', 'starboard', 'nose']) expect(bounds('gear.' + side).min.y).toBeCloseTo(-1.95, 2);
      expect(bounds('flap.port').min.y).toBeLessThan(flapUp - .3);
      expect(bounds('flap.port').min.y).toBeCloseTo(bounds('flap.starboard').min.y);
      expect(bounds('deceleron.port.upper').max.y).toBeGreaterThan(top + .5);
      expect(bounds('deceleron.port.lower').min.y).toBeLessThan(bottom - .5);
      expect(bounds('deceleron.port.upper').max.y).toBeCloseTo(bounds('deceleron.starboard.upper').max.y);
      rig!({ gear: 0, flaps: 0, speedbrake: 0, hook: 0 });
      A10_HINGES.forEach((h, i) => expect(part(h.name).quaternion.angleTo(originals[i]!)).toBeCloseTo(0));
      const restored = new Box3().setFromObject(scene, true);
      expect(restored.min.distanceTo(clean.min)).toBeLessThan(1e-5);
      const broken = scene.clone(true); broken.getObjectByName(PropertyBinding.sanitizeNodeName('flap.port'))!.removeFromParent();
      expect(bindA10Rig(broken)).toBeNull();
    } finally {
      scene.traverse(o => {
        if (!(o instanceof Mesh)) return;
        o.geometry.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
      });
    }
  });

  it('retains 11 labelled pylons and the seven pod opening surfaces in source metadata', async () => {
    async function labels(file: string) {
      const data = await readFile(new URL(`../assets/models/${file}.glb`, import.meta.url));
      const doc = JSON.parse(data.subarray(20, 20 + data.readUInt32LE(12)).toString());
      return doc.scenes[0].extras.partNames as string[];
    }
    expect((await labels('a10c')).filter(n => n.startsWith('Pylon '))).toHaveLength(11);
    expect((await labels('apkws')).filter(n => n.startsWith('Tube opening '))).toHaveLength(7);
  });
});
