import { describe, expect, it, vi } from 'vitest';
import { Box3, Mesh, MeshStandardMaterial, Vector3, Texture } from 'three';
import type { Theme } from '../../ui/theme';
import { AtflirRange } from './range';

const theme = {
  earth: '#81745b', placard: '#e6e0d2', panelMuted: '#898e86', panel: '#292e2a',
  screen: '#07110b', symDim: '#4b7e55', symHi: '#d1ffd5',
} as Theme;

describe('ATFLIR range resources', () => {
  it('builds finite merged scenery and keeps both trucks available without browser assets', () => {
    const error = vi.spyOn(console, 'error');
    const range = new AtflirRange(theme, () => {});
    expect(error).not.toHaveBeenCalled();
    const fallbacks: Mesh[] = [];
    let truckCount = 0;
    range.traverse(node => {
      if (node.name === '8 m truck fallback') {
        truckCount++;
        expect(node.visible).toBe(true);
        // The generic truck dimensions remain metre-scale rather than filling a target marker.
        expect(new Box3().setFromObject(node).getSize(new Vector3()).length()).toBeLessThan(12);
      }
      if (node instanceof Mesh) {
        fallbacks.push(node);
        expect(Array.from(node.geometry.attributes.position.array).every(Number.isFinite)).toBe(true);
      }
    });
    expect(truckCount).toBe(2);
    expect(fallbacks.length).toBeLessThan(50);
    range.dispose(); error.mockRestore();
  });
  it('changes truck contrast reversibly and toggles a real obstruction', () => {
    const range = new AtflirRange(theme, () => {});
    let body: MeshStandardMaterial | undefined;
    range.traverse(node => {
      if (node instanceof Mesh && node.material instanceof MeshStandardMaterial && node.material.name === 'truck fallback body') body = node.material;
    });
    const landscape = range.children.find(node => node instanceof Mesh && node.material instanceof MeshStandardMaterial && node.material.name === 'desert sand') as Mesh;
    const landscapeMaterial = landscape.material as MeshStandardMaterial;
    const landscapeColor = landscapeMaterial.color.clone();
    expect(landscapeMaterial.map).not.toBeNull();
    const color = body!.color.clone(), emissive = body!.emissive.clone();
    range.setInfrared(true);
    expect(body!.color.equals(color)).toBe(false);
    expect(body!.emissiveIntensity).toBe(.38);
    expect(landscapeMaterial.color.r).toBeCloseTo(landscapeColor.r * .28);
    range.setInfrared(false);
    expect(body!.color.equals(color)).toBe(true);
    expect(body!.emissive.equals(emissive)).toBe(true);
    expect(landscapeMaterial.color.equals(landscapeColor)).toBe(true);
    const screen = range.getObjectByName('scripted target obstruction')!;
    expect(screen.visible).toBe(false);
    range.setObscured(true); expect(screen.visible).toBe(true);
    expect(screen.children.length).toBeGreaterThan(0);
    range.dispose();
  });
  it('releases procedural GPU resources once even when disposed twice', () => {
    const range = new AtflirRange(theme, () => {});
    const geometry = new Set<Mesh['geometry']>();
    const materials = new Set<MeshStandardMaterial>();
    const textures = new Set<Texture>();
    range.traverse(node => {
      if (node instanceof Mesh) {
        geometry.add(node.geometry);
        if (node.material instanceof MeshStandardMaterial) {
          materials.add(node.material);
          if (node.material.map) textures.add(node.material.map);
        }
      }
    });
    expect(textures.size).toBe(5);
    const disposals = [...geometry, ...materials, ...textures].map(resource => vi.spyOn(resource, 'dispose'));
    range.dispose(); range.dispose();
    for (const disposal of disposals) expect(disposal).toHaveBeenCalledTimes(1);
    expect(range.children).toHaveLength(0);
  });
});
