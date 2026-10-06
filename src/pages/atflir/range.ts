/** Original, metre-scale depot scenery. Thermal contrast is an artistic teaching cue, not sensor physics. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { AssetVisual } from '../../render/assets';
import type { Theme } from '../../ui/theme';

export class AtflirRange extends THREE.Group {
  private readonly geometry = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();
  private readonly textures = new Set<THREE.Texture>();
  private readonly cold: { material: THREE.MeshStandardMaterial; color: THREE.Color; factor: number }[] = [];
  private readonly batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private readonly assets: AssetVisual[] = [];
  private readonly thermal: { material: THREE.MeshStandardMaterial; color: THREE.Color; emissive: THREE.Color; intensity: number }[] = [];
  private readonly obscurer = new THREE.Group();
  private readonly heatColor: THREE.Color;
  private infrared = false;
  private disposed = false;

  constructor(theme: Theme, onReady: () => void) {
    super();
    this.name = 'ATFLIR original depot';
    this.heatColor = new THREE.Color(theme.placard).lerp(new THREE.Color(theme.symHi), .25);
    const mix = (a: string, b: string, t: number) => new THREE.Color(a).lerp(new THREE.Color(b), t);
    const material = (name: string, color: THREE.Color, roughness = .9) => {
      const m = new THREE.MeshStandardMaterial({ color, roughness }); m.name = name; this.materials.add(m); return m;
    };
    const sand = material('desert sand', mix(theme.earth, theme.placard, .35));
    const berm = material('dry earth', mix(theme.earth, theme.panelMuted, .3));
    const concrete = material('concrete apron', mix(theme.panelMuted, theme.placard, .4));
    const road = material('asphalt', mix(theme.panel, theme.panelMuted, .32));
    const steel = material('roof zinc', mix(theme.panelMuted, theme.placard, .58), .65);
    const wall = material('warehouse walls', mix(theme.earth, theme.placard, .7));
    const trim = material('metal framing', mix(theme.panel, theme.panelMuted, .46), .6);
    const dark = material('recesses and rubber', mix(theme.screen, theme.panel, .35));
    const paint = material('worn apron paint', mix(theme.placard, theme.earth, .3));
    const containerMat = material('storage container', mix(theme.earth, theme.panelMuted, .45));
    const foliage = material('desert scrub', mix(theme.earth, theme.symDim, .28));
    const truckBody = material('truck fallback body', mix(theme.earth, theme.panelMuted, .45));
    this.rememberThermal(truckBody);
    sand.map = this.surfaceTexture('sand', 68, 68);
    berm.map = this.surfaceTexture('sand', 3, 2);
    concrete.map = this.surfaceTexture('concrete', 7, 5);
    road.map = this.surfaceTexture('road', 60, 1);
    wall.map = this.surfaceTexture('concrete', 2, 1);
    for (const [m, factor] of [[sand, .28], [berm, .26], [concrete, .32], [road, .28],
      [steel, .52], [wall, .48], [trim, .48], [dark, .65], [paint, .5],
      [containerMat, .42], [foliage, .27]] as const) this.cold.push({ material: m, color: m.color.clone(), factor });

    // Repeated scenery is merged by material to keep the range inexpensive to render.
    this.box(2200, .4, 2200, 0, -.25, 0, sand);
    this.box(380, .18, 260, 0, .02, -2, concrete);
    this.box(2200, .14, 24, 0, .14, 155, road);
    this.box(24, .15, 285, 180, .15, 15, road);
    this.box(28, .15, 90, -140, .15, 105, road);
    for (let x = -1000; x < 1100; x += 28) this.box(11, .02, .45, x, .24, 155, paint);
    for (let z = -85; z < 140; z += 22) this.box(.35, .02, 9, 180, .25, z, paint);
    // Concrete expansion seams and faint tire lanes.
    for (let x = -170; x <= 170; x += 34) this.box(.13, .012, 260, x, .118, -2, trim);
    for (let z = -120; z <= 120; z += 30) this.box(380, .012, .13, 0, .12, z, trim);
    for (const x of [134, 146, -146, -134]) this.box(.35, .02, 36, x, .16, x > 0 ? -70 : 30, paint);
    for (const x of [140, -140]) this.box(12, .02, .35, x, .16, x > 0 ? -88 : 48, paint);

    // Warehouse is the central unmistakable navigation landmark, with a pitched, ribbed roof.
    this.box(82, 12, 48, 0, 6, 0, wall);
    const pitch = Math.atan2(5, 24);
    for (const side of [-1, 1]) {
      this.box(85, .45, Math.hypot(24, 5) + 1.2, 0, 14.5, side * 12, steel, -side * pitch);
      for (let x = -40; x <= 40; x += 4) this.box(.18, .2, Math.hypot(24, 5) + 1.4, x, 14.8, side * 12, trim, -side * pitch);
    }
    this.box(85, .35, .7, 0, 17.05, 0, trim);
    // Closed gable ends, beams, roof lights and ventilation stacks.
    const shape = new THREE.Shape(); shape.moveTo(-24, 0); shape.lineTo(24, 0); shape.lineTo(0, 5); shape.closePath();
    for (const x of [-41.05, 41.05]) {
      const g = new THREE.ShapeGeometry(shape); g.rotateY(x < 0 ? -Math.PI / 2 : Math.PI / 2); g.translate(x, 12, 0); this.batch(g, wall);
    }
    for (const x of [-27, 0, 27]) {
      this.box(10, .2, 4, x, 15.3, -9, dark, pitch);
      this.box(2.5, 1.5, 2.5, x + 5, 17, -3, trim);
    }
    this.box(80, 1.15, 7, 0, .58, 27.5, trim);
    for (const x of [-28, -9, 10, 29]) {
      this.box(12, 7, .2, x, 4.5, 24.15, dark);
      for (let y = 1.3; y < 8; y += .65) this.box(11.8, .08, .08, x, y, 24.3, steel);
      this.box(13, .6, 3, x, 9, 25, steel);
      for (const dx of [-6.5, 6.5]) this.box(.55, 1.4, .6, x + dx, 1.9, 28.5, paint);
    }
    // Office wing, raised water tanks, service pipes and stairs.
    this.box(20, 6, 22, -53, 3, 10, wall);
    this.box(22, .5, 24, -53, 6.2, 10, steel);
    for (const x of [-59, -51]) this.box(4, 2, .16, x, 3.8, 21.08, dark);
    this.box(3, 4.5, .18, -44.5, 2.25, 21.1, trim);
    for (let i = 0; i < 5; i++) this.box(4, .25 + i * .2, 1, -44.5, (.25 + i * .2) / 2, 26 - i, concrete);
    for (const x of [-95, -78]) {
      this.cylinder(5.5, 5.5, 11, x, 5.5, -62, steel, 20);
      this.cylinder(5.7, 5.7, .25, x, 10.9, -62, trim, 20);
      this.box(2, 1, 10, x, .5, -50, trim);
      this.box(16, .25, 16, x, .15, -62, concrete);
    }
    // Container yard stays away from both exercise targets.
    for (const [i, x, z] of [[0, -95, -103], [1, -67, -103], [2, -39, -103], [3, -95, -88]] as const) {
      this.box(12, 3, 5, x, 1.5, z, containerMat);
      if (i < 2) this.box(12, 3, 5, x, 4.55, z, steel);
      for (let dx = -5.5; dx < 6; dx += .8) {
        this.box(.1, i < 2 ? 6 : 3, .16, x + dx, i < 2 ? 3 : 1.5, z + 2.55, trim);
        this.box(.1, .1, 5, x + dx, i < 2 ? 6.1 : 3.05, z, trim);
      }
    }
    for (const [x, z] of [[65, 35], [73, 35], [65, 43], [80, -105]]) {
      this.box(5, 3, 4, x, 1.5, z, containerMat);
      this.box(5.2, .2, 4.2, x, 3.1, z, steel);
      for (const dx of [-1.6, 1.6]) this.box(.2, 3.1, 4.1, x + dx, 1.6, z, trim);
    }
    // Perimeter chain-link impression: visible posts and fine continuous rails.
    for (const z of [-135, 130]) {
      for (let x = -195; x <= 195; x += 10) {
        if (z > 0 && (Math.abs(x - 180) < 18 || Math.abs(x + 140) < 18)) continue;
        this.box(.25, 3.3, .25, x, 1.65, z, trim);
        for (const y of [.6, 1.8, 3]) this.box(10, .06, .07, x + 5, y, z, trim);
      }
    }
    for (const x of [-195, 200]) for (let z = -130; z < 130; z += 10) {
      this.box(.25, 3.3, .25, x, 1.65, z, trim);
      for (const y of [.6, 1.8, 3]) this.box(.07, .06, 10, x, y, z + 5, trim);
    }
    for (const [x, z] of [[-184, -118], [187, -118], [-184, 117], [80, 117]]) {
      this.box(.4, 12, .4, x, 6, z, trim);
      this.box(3, .35, 1.2, x, 12, z, steel);
    }
    // Repeatable landscape, no random state shared with the lesson.
    for (let i = 0; i < 95; i++) {
      const angle = i * 2.39996323;
      const radius = 260 + (i % 9) * 64;
      const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
      if (Math.abs(z - 155) < 23 || (Math.abs(x - 180) < 25 && z < 160)) continue;
      const g = new THREE.IcosahedronGeometry(1, 0);
      g.scale(1.4 + i % 4 * .7, .7 + i % 3 * .5, 1.1 + i % 3 * .6); g.translate(x, .3, z); this.batch(g, foliage);
    }
    for (let i = 0; i < 18; i++) {
      const angle = i * 2.39996323;
      const g = new THREE.IcosahedronGeometry(1, 1);
      g.scale(65 + i % 3 * 20, 5 + i % 4 * 3, 38); g.rotateY(angle);
      g.translate(Math.cos(angle) * (430 + i * 18), -2, Math.sin(angle) * (430 + i * 18)); this.batch(g, berm);
    }
    // Scruffy strips around the perimeter and oil-dark wheel tracks make the yard lived in.
    for (let i = 0; i < 56; i++) {
      const x = -190 + ((i * 71) % 383), z = (i % 2 ? -132 : 128) + Math.sin(i * 4.7) * 2;
      const g = new THREE.IcosahedronGeometry(1, 0);
      g.scale(.6 + i % 3 * .35, .25 + i % 4 * .12, .6); g.translate(x, .25, z); this.batch(g, foliage);
    }
    for (const [x, z, length] of [[137.7, -56, 23], [140.1, -56, 23], [-128, 28.7, 13], [-128, 31.3, 13], [33, 46, 17]] as const) {
      this.box(.19, .013, length, x, .135, z, trim);
    }
    this.flush();
    this.truck(140, -70, -.25, truckBody, dark, steel, onReady);
    this.truck(-140, 30, Math.PI * .5, truckBody, dark, steel, onReady);

    // A physical training screen replaces the previously flat obstruction marker.
    this.obscurer.name = 'scripted target obstruction'; this.obscurer.position.set(140, 0, -70);
    this.add(this.obscurer); this.obscurer.visible = false;
    this.localBox(this.obscurer, 22, .5, 24, 0, 9, 0, containerMat);
    for (const x of [-10, 10]) for (const z of [-11, 11]) this.localBox(this.obscurer, .6, 9, .6, x, 4.5, z, trim);
    for (const z of [-10, 0, 10]) this.localBox(this.obscurer, 22, .35, .45, 0, 9.4, z, steel);
  }

  /** Small repeatable authored textures: surface variation only, no external image resources. */
  private surfaceTexture(kind: 'sand' | 'concrete' | 'road', repeatX: number, repeatY: number): THREE.DataTexture {
    const size = 256, pixels = new Uint8Array(size * size * 4);
    let seed = kind === 'sand' ? 1729 : kind === 'concrete' ? 8147 : 4733;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };
    const spots = Array.from({ length: 22 }, () => ({ x: random() * size, y: random() * size, r: 4 + random() * 27, dark: random() * .22 }));
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const n = random() - .5;
      let value: number;
      if (kind === 'sand') {
        const ripple = Math.sin(x * .18 + Math.sin(y * .035) * 3 + Math.sin(x * .013 + y * .021) * 4);
        const broad = Math.sin(x * .024 + y * .017) * Math.cos(y * .019 - x * .031);
        value = .75 + n * .21 + ripple * .065 + broad * .13;
      } else {
        value = (kind === 'concrete' ? .81 : .73) + n * (kind === 'concrete' ? .12 : .24);
        for (const spot of spots) {
          const distance = Math.hypot(x - spot.x, y - spot.y) / spot.r;
          if (distance < 1) value -= (1 - distance) * spot.dark;
        }
        if (kind === 'concrete') {
          // Hairline repaired cracks, occasional chips, uneven slab edges.
          const crack = 63 + Math.sin(y * .07) * 8 + Math.sin(y * .21) * 2;
          if (y > 38 && y < 213 && Math.abs(x - crack) < .7) value *= .42;
          const diagonal = 205 - y * .31 + Math.sin(y * .1) * 3;
          if (y > 153 && Math.abs(x - diagonal) < .65) value *= .5;
          if (x < 2 || y < 2) value *= .75;
        }
      }
      const channel = Math.round(THREE.MathUtils.clamp(value, .15, 1) * 255), index = (y * size + x) * 4;
      pixels[index] = channel; pixels[index + 1] = channel; pixels[index + 2] = channel; pixels[index + 3] = 255;
    }
    const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
    texture.name = `original ${kind} grain`; texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY); texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true; texture.anisotropy = 4; texture.needsUpdate = true; this.textures.add(texture); return texture;
  }

  private batch(geometry: THREE.BufferGeometry, material: THREE.Material): void {
    const list = this.batches.get(material) ?? []; list.push(geometry); this.batches.set(material, list);
  }
  private box(w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material, rx = 0): void {
    const g = new THREE.BoxGeometry(w, h, d); g.rotateX(rx); g.translate(x, y, z); this.batch(g, material);
  }
  private cylinder(top: number, bottom: number, h: number, x: number, y: number, z: number, material: THREE.Material, segments = 12): void {
    const g = new THREE.CylinderGeometry(top, bottom, h, segments); g.translate(x, y, z); this.batch(g, material);
  }
  private flush(): void {
    for (const [material, parts] of this.batches) {
      // All primitives carry indexed positions, normals and UVs for material batching.
      const geometry = mergeGeometries(parts, false);
      for (const part of parts) part.dispose();
      if (!geometry) continue;
      this.geometry.add(geometry);
      const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = true; mesh.receiveShadow = true; this.add(mesh);
    }
    this.batches.clear();
  }
  private localBox(parent: THREE.Group, w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material): THREE.Mesh {
    const g = new THREE.BoxGeometry(w, h, d); this.geometry.add(g);
    const mesh = new THREE.Mesh(g, material); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  private truck(x: number, z: number, heading: number, body: THREE.MeshStandardMaterial, dark: THREE.Material, steel: THREE.Material, onReady: () => void): void {
    const root = new THREE.Group(); root.position.set(x, .18, z); root.rotation.y = heading; this.add(root);
    const fallback = new THREE.Group(); fallback.name = '8 m truck fallback'; root.add(fallback);
    this.localBox(fallback, 2.5, .6, 8, 0, 1.1, 0, dark);
    this.localBox(fallback, 2.6, 1.8, 2.3, 0, 2.15, -2.6, body);
    this.localBox(fallback, 2.65, 1.7, 5.2, 0, 2.35, 1.05, body);
    this.localBox(fallback, 2.3, .65, .08, 0, 2.45, -3.78, dark);
    this.localBox(fallback, 2.7, .2, .25, 0, .9, -3.875, steel);
    for (const sx of [-1, 1]) for (const wz of [-2.7, 1.5, 2.8]) {
      const g = new THREE.CylinderGeometry(.6, .6, .38, 12); g.rotateZ(Math.PI / 2); this.geometry.add(g);
      const m = new THREE.Mesh(g, dark); m.position.set(sx * 1.25, .6, wz); m.castShadow = true; fallback.add(m);
    }
    const asset = new AssetVisual('truck', { onReady: visual => {
      const bounds = visual.bounds; if (!bounds || this.disposed) return;
      const size = bounds.getSize(new THREE.Vector3()), centre = bounds.getCenter(new THREE.Vector3());
      const scale = 8 / size.z;
      visual.scale.setScalar(scale); visual.position.set(-centre.x * scale, -bounds.min.y * scale, -centre.z * scale);
      visual.content?.traverse(node => {
        if (!(node instanceof THREE.Mesh)) return;
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        for (const m of materials) if (m instanceof THREE.MeshStandardMaterial && !/glass|rubber|dark|recess/i.test(m.name)) this.rememberThermal(m);
      });
      fallback.visible = false; this.applyInfrared(); onReady();
    } });
    root.add(asset); this.assets.push(asset);
  }
  private rememberThermal(material: THREE.MeshStandardMaterial): void {
    if (this.thermal.some(item => item.material === material)) return;
    this.thermal.push({ material, color: material.color.clone(), emissive: material.emissive.clone(), intensity: material.emissiveIntensity });
  }
  setObscured(value: boolean): void { this.obscurer.visible = value; }
  setInfrared(value: boolean): void { if (value === this.infrared) return; this.infrared = value; this.applyInfrared(); }
  private applyInfrared(): void {
    for (const { material, color, factor } of this.cold) material.color.copy(color).multiplyScalar(this.infrared ? factor : 1);
    for (const { material, color, emissive, intensity } of this.thermal) {
      material.color.copy(color); material.emissive.copy(emissive); material.emissiveIntensity = intensity;
      if (this.infrared) {
        material.color.lerp(this.heatColor, .8);
        material.emissive.copy(material.color); material.emissiveIntensity = .38;
      }
    }
  }
  override dispose(): void {
    if (this.disposed) return; this.disposed = true;
    for (const asset of this.assets) asset.dispose();
    for (const geometry of this.geometry) geometry.dispose();
    for (const material of this.materials) material.dispose();
    for (const texture of this.textures) texture.dispose();
    this.textures.clear(); this.cold.length = 0;
    this.thermal.length = 0; this.assets.length = 0; this.geometry.clear(); this.materials.clear(); this.clear(); super.dispose();
  }
}
