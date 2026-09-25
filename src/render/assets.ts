/**
 * Optional asynchronous exterior visuals. Geometry and textures are shared while in use;
 * each instance owns its recolorable materials. Consumers own their procedural fallback.
 */
import { Box3, Color, Group, Material, Mesh, Texture } from 'three';
import type { BufferGeometry } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assetUrl, type AssetId } from './assetRegistry';
export type { AssetId } from './assetRegistry';

interface Entry {
  users: number;
  scene: Group | null;
  bounds: Box3 | null;
  settled: boolean;
  load: Promise<Group | null>;
}
const cache = new Map<AssetId, Entry>();
const loader = new GLTFLoader();

function materials(mesh: Mesh): Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

/** Dispose a template once, including resources referenced by more than one mesh. */
function disposeTemplate(scene: Group): void {
  const geometries = new Set<BufferGeometry>();
  const mats = new Set<Material>();
  const textures = new Set<Texture>();
  scene.traverse(node => {
    if (!(node instanceof Mesh)) return;
    geometries.add(node.geometry);
    for (const material of materials(node)) mats.add(material);
  });
  for (const material of mats) {
    for (const value of Object.values(material)) {
      if (value instanceof Texture) textures.add(value);
    }
  }
  for (const geometry of geometries) geometry.dispose();
  for (const material of mats) material.dispose();
  for (const texture of textures) texture.dispose();
}

function release(id: AssetId, entry: Entry): void {
  entry.users--;
  if (entry.users !== 0 || !entry.settled) return;
  if (cache.get(id) === entry) cache.delete(id);
  if (entry.scene) disposeTemplate(entry.scene);
  entry.scene = null;
}

function acquire(id: AssetId, url: string): Entry {
  let entry = cache.get(id);
  if (entry) { entry.users++; return entry; }
  entry = { users: 1, scene: null, bounds: null, settled: false, load: Promise.resolve(null) };
  cache.set(id, entry);
  const current = entry;
  // The deferred call also turns synchronous loader errors into a failed optional visual.
  current.load = Promise.resolve().then(() => loader.loadAsync(url)).then(gltf => {
    current.settled = true;
    if (current.users === 0) {
      if (cache.get(id) === current) cache.delete(id);
      disposeTemplate(gltf.scene);
      return null;
    }
    current.scene = gltf.scene;
    current.bounds = new Box3().setFromObject(gltf.scene);
    return gltf.scene;
  }).catch(() => {
    current.settled = true;
    // A new instance can retry; existing consumers keep their fallback without throwing.
    if (cache.get(id) === current) cache.delete(id);
    return null;
  });
  return current;
}

type ColoredMaterial = Material & { color: Color; emissive?: Color };
function colored(material: Material): material is ColoredMaterial {
  return 'color' in material && material.color instanceof Color;
}

/** Keep windows, recesses, navigation lights and surface detailing legible after tinting. */
function tintable(material: ColoredMaterial): boolean {
  if (/canopy|glass|recess|nozzle|exhaust|lens|navigation|seam|stencil|rubber|dark|joint|band/i.test(material.name)) return false;
  if (Math.max(material.color.r, material.color.g, material.color.b) < 0.08) return false;
  if (material.emissive && Math.max(material.emissive.r, material.emissive.g, material.emissive.b) > 0.001) return false;
  return true;
}

export interface AssetVisualOptions {
  /** Called only after attachment, and never after disposal. */
  onReady?: (visual: AssetVisual) => void;
}

export class AssetVisual extends Group {
  private entry: Entry | null = null;
  private disposed = false;
  private loaded: Group | null = null;
  private tint: Color | null = null;
  private overrideMaterial: Material | null = null;
  private ownMaterials = new Map<Material, Material>();
  private bindings: { mesh: Mesh; material: Material | Material[] }[] = [];

  constructor(readonly assetId: AssetId, options: AssetVisualOptions = {}) {
    super();
    this.name = 'asset:' + assetId;
    const url = assetUrl(assetId);
    // Node-side render/model tests must remain offline. Browsers load only bundled URLs.
    if (typeof window === 'undefined' || !url) return;
    this.entry = acquire(assetId, url);
    void this.entry.load.then(template => {
      if (this.disposed || !template) return;
      const scene = template.clone(true);
      scene.traverse(node => {
        if (!(node instanceof Mesh)) return;
        const cloneMaterial = (original: Material): Material => {
          let copy = this.ownMaterials.get(original);
          if (!copy) { copy = original.clone(); this.ownMaterials.set(original, copy); }
          return copy;
        };
        node.material = Array.isArray(node.material)
          ? node.material.map(cloneMaterial) : cloneMaterial(node.material);
        this.bindings.push({ mesh: node, material: node.material });
        node.castShadow = true;
        node.receiveShadow = true;
      });
      this.loaded = scene;
      this.applyTint();
      this.applyMaterial();
      this.add(scene);
      // Callback failures must not become unhandled loader rejections.
      try { options.onReady?.(this); } catch (error) { console.warn('Asset visual ready callback failed', error); }
    });
  }

  get ready(): boolean { return this.loaded !== null; }
  get content(): Group | null { return this.loaded; }
  /** Authored metre bounds, independent of this wrapper's scale, pose or parents. */
  get bounds(): Box3 | null { return this.ready ? this.entry?.bounds?.clone() ?? null : null; }

  /** Tactical palette tint, or null for the authored exterior colours. */
  setTint(color: Color | null): void {
    if (this.disposed) return;
    this.tint = color?.clone() ?? null;
    this.applyTint();
  }

  /** Borrow a ghost/dead material; null restores the instance's normal tinted materials. */
  setMaterial(material: Material | null): void {
    if (this.disposed) return;
    this.overrideMaterial = material;
    this.applyMaterial();
  }

  private applyTint(): void {
    for (const [original, copy] of this.ownMaterials) {
      if (!colored(original) || !colored(copy)) continue;
      copy.color.copy(original.color);
      if (this.tint && tintable(original)) copy.color.lerp(this.tint, 0.65);
    }
  }

  private applyMaterial(): void {
    for (const binding of this.bindings) binding.mesh.material = this.overrideMaterial ?? binding.material;
  }

  /** Idempotent. Never disposes a borrowed override or another instance's shared resources. */
  override dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.loaded) this.remove(this.loaded);
    this.loaded = null;
    this.bindings.length = 0;
    for (const material of this.ownMaterials.values()) material.dispose();
    this.ownMaterials.clear();
    this.overrideMaterial = null;
    this.tint = null;
    if (this.entry) release(this.assetId, this.entry);
    this.entry = null;
    super.dispose();
  }
}
