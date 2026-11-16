/**
 * The 3D models page's review stage: one model (or two, side by side) at true size on a quiet dark floor with a
 * metric scale grid, soft even light and real shadows, orbit / zoom, camera presets, a turntable and three shadings.
 *
 * Scale: this scene is 1 unit = 1 m (the kit's 1 unit = 1 km would put a 3 m missile inside the camera's near plane);
 * the Stage's camera (near 0.01, far 2000, log depth) covers 1 cm to 2 km. The Stage runs without its sky
 * (`environment: false`) and renders on demand: nothing moves unless the user drags or the turntable is on, so
 * `autoPause: true` is right (no sim must keep stepping offscreen) and the loop only runs for the turntable.
 *
 * Ownership: each AssetVisual is created here and disposed here (it releases the shared template after its last
 * user). Procedural fallbacks borrow the kit's cached geometry and palette materials and are only detached.
 * Grids, brackets, the shadow catcher, the shading overrides and the studio light probe are this file's own.
 */
import {
  BackSide, Box3, BufferAttribute, BufferGeometry, Color, DirectionalLight, Float32BufferAttribute, Group, HemisphereLight,
  LineBasicMaterial, LineSegments, Material, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, PMREMGenerator, RingGeometry,
  Scene, ShadowMaterial, SphereGeometry, Vector3, type Texture,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Stage } from '../../render/stage';
import { Tag, Note } from '../../render/tags';
import { AssetVisual } from '../../render/assets';
import { meshStats, type MeshStats } from '../../render/assetStats';
import { createMissileMesh, getJetModel, jetMaterials } from '../../render/jets';
import type { Palette } from '../../render/palette';
import type { AssetId } from '../../render/assetRegistry';
import type { Units } from '../../app/format';
import { fmtLength, gridLines, gridSpacing, isAircraftId, isMissileId, type Shade, type Source, type ViewId } from './catalogue';
import { frameBounds, pairLayout, placedBounds } from './framing';

export interface SlotSpec { id: string; name: string; source: Source }
export type SlotState = 'loading' | 'ready' | 'failed';
export interface SlotStatus {
  id: string;
  state: SlotState;
  /** What is drawn: the file, or the app's procedural stand-in (asked for, or because the file failed). */
  drawn: Source | null;
  /** The file was asked for but did not load. */
  fileFailed: boolean;
  stats: MeshStats | null;
}
export interface ViewerStatus { phase: 'loading' | 'ready'; slots: SlotStatus[] }

export interface ModelViewerOptions {
  units: Units;
  ariaLabel?: string;
  onStatus?: (status: ViewerStatus) => void;
}

interface Slot {
  spec: SlotSpec;
  holder: Group;
  visual: AssetVisual | null;
  procedural: Group | null;
  /** Procedural meshes and their own materials, restored after a shading override. */
  own: { mesh: Mesh; material: Material | Material[] }[];
  status: SlotStatus;
  tag: Tag | null;
}

/** Build the app's procedural stand-in: JetMesh's airframe (wings at the reference sweep) or createMissileMesh. */
function buildFallback(id: string, palette: Palette): Group | null {
  const g = new Group();
  if (isAircraftId(id)) {
    const model = getJetModel(id);
    const mats = jetMaterials(palette, 'neutral');
    g.add(new Mesh(model.geometry, mats));
    const sw = model.swing;
    if (sw) {
      const a = ((20 - sw.refSweepDeg) * Math.PI) / 180; // JetMesh.setSweep(20): wings spread
      const r = new Mesh(sw.geometry, mats), l = new Mesh(sw.geometry, mats);
      r.position.set(sw.pivot[0], sw.pivot[1], sw.pivot[2]);
      l.position.set(-sw.pivot[0], sw.pivot[1], sw.pivot[2]);
      l.scale.x = -1;
      r.rotation.y = -a;
      l.rotation.y = a;
      g.add(r, l);
    }
  } else if (isMissileId(id)) {
    g.add(createMissileMesh(id, palette));
  } else {
    return null;
  }
  g.traverse(o => { if (o instanceof Mesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

/**
 * A small studio for the light probe, in token and world colours: a dome bright overhead, the floor colour below,
 * and two soft panels (key ahead-left, rim behind-right) for highlights that show curvature.
 */
function studioScene(palette: Palette, floor: Color): Scene {
  const scene = new Scene();
  const dome = new SphereGeometry(10, 24, 12);
  const pos = dome.getAttribute('position');
  const colours = new Float32Array(pos.count * 3);
  const top = palette.sunlight.clone().multiplyScalar(0.75), horizon = palette.horizon.clone().multiplyScalar(0.45);
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 10;
    if (y >= 0) c.copy(horizon).lerp(top, Math.pow(y, 0.7)); else c.copy(horizon).lerp(floor, Math.min(1, -y * 3));
    c.toArray(colours, i * 3);
  }
  dome.setAttribute('color', new BufferAttribute(colours, 3));
  scene.add(new Mesh(dome, new MeshBasicMaterial({ vertexColors: true, side: BackSide })));
  const panel = (x: number, y: number, z: number, w: number, hgt: number, k: number) => {
    const m = new Mesh(new PlaneGeometry(w, hgt), new MeshBasicMaterial({ color: palette.sunlight.clone().multiplyScalar(k), side: BackSide }));
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    scene.add(m);
  };
  panel(-5, 6, -5, 6, 3, 3.2);
  panel(6, 3, 5, 4, 3, 1.6);
  return scene;
}

function disposeScene(scene: Scene): void {
  scene.traverse(o => {
    if (!(o instanceof Mesh)) return;
    o.geometry.dispose();
    (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
  });
}

/**
 * Grid lines in a plane as segments, each line cut into pieces so its colour can fade to the backdrop toward the
 * edge. `fade(u, v)` returns 0 (full colour) .. 1 (backdrop). Plane axes: u along `uAxis`, v along `vAxis`.
 */
function gridGeometry(
  uLines: number[], vRange: [number, number], vLines: number[], uRange: [number, number],
  put: (u: number, v: number, out: Vector3) => void, fade: (u: number, v: number) => number, line: Color, back: Color,
): BufferGeometry {
  const pos: number[] = [], col: number[] = [];
  const p = new Vector3(), c = new Color();
  const pieces = 24;
  const seg = (u0: number, v0: number, u1: number, v1: number) => {
    for (const [u, v] of [[u0, v0], [u1, v1]] as const) {
      put(u, v, p); pos.push(p.x, p.y, p.z);
      c.copy(line).lerp(back, Math.min(1, Math.max(0, fade(u, v)))); col.push(c.r, c.g, c.b);
    }
  };
  for (const u of uLines) for (let i = 0; i < pieces; i++) {
    const a = vRange[0] + ((vRange[1] - vRange[0]) * i) / pieces, b = vRange[0] + ((vRange[1] - vRange[0]) * (i + 1)) / pieces;
    seg(u, a, u, b);
  }
  for (const v of vLines) for (let i = 0; i < pieces; i++) {
    const a = uRange[0] + ((uRange[1] - uRange[0]) * i) / pieces, b = uRange[0] + ((uRange[1] - uRange[0]) * (i + 1)) / pieces;
    seg(a, v, b, v);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  return g;
}

type DimAxis = 'length' | 'width' | 'height';
const _dir = new Vector3();

const smooth = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

export class ModelViewer {
  readonly stage: Stage;
  readonly controls: OrbitControls;
  private readonly root = new Group();
  private readonly palette: Palette;
  private readonly back: Color;
  private readonly key: DirectionalLight;
  private readonly fill: DirectionalLight;
  private readonly hemi: HemisphereLight;
  private readonly shadowPlane: Mesh<PlaneGeometry, ShadowMaterial>;
  private readonly floor: Mesh<RingGeometry, MeshBasicMaterial>;
  private readonly floorGrid = new Group();
  private readonly sideWall = new Group();
  private readonly frontWall = new Group();
  private readonly brackets = new Group();
  private readonly lineMats: { minor: LineBasicMaterial; major: LineBasicMaterial; dim: LineBasicMaterial };
  private readonly clay: MeshStandardMaterial;
  private readonly wire: MeshBasicMaterial;
  private envMap: Texture | null = null;
  private notes: { note: Note; axis: DimAxis }[] = [];
  private slots: Slot[] = [];
  private generation = 0;
  private view: ViewId = 'three-quarter';
  private shade: Shade = 'paint';
  private spinning = false;
  private placed: Box3 | null = null;
  /** The user moved the camera since the last preset (a resize then keeps their view). */
  private userMoved = false;
  private disposed = false;
  private units: Units;
  private readonly onStatus: ((s: ViewerStatus) => void) | undefined;
  private readonly offs: (() => void)[] = [];

  constructor(host: HTMLElement, opts: ModelViewerOptions) {
    this.units = opts.units;
    this.onStatus = opts.onStatus;
    this.stage = new Stage(host, {
      environment: false, autoPause: true, autoStart: false, fov: 30, ariaLabel: opts.ariaLabel ?? '3D model view',
    });
    const stage = this.stage;
    const P = (this.palette = stage.palette);
    this.back = new Color(stage.theme.ground);
    stage.renderer.setClearColor(this.back, 1);
    stage.renderer.shadowMap.enabled = true;
    this.root.name = 'models-root';
    stage.scene.add(this.root);

    // Light: a probe for reflections, a soft sky / floor fill, a key light that casts the planform shadow, a rim.
    this.captureEnvironment();
    const onRestored = () => this.captureEnvironment();
    stage.canvas.addEventListener('webglcontextrestored', onRestored);
    this.offs.push(() => stage.canvas.removeEventListener('webglcontextrestored', onRestored));
    this.hemi = new HemisphereLight(P.sunlight, this.back.clone().lerp(P.earth, 0.5), 0.9);
    this.key = new DirectionalLight(P.sunlight, 1.7);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.radius = 4;
    this.key.shadow.bias = -0.0004;
    this.fill = new DirectionalLight(P.horizon, 0.45);
    this.root.add(this.hemi, this.key, this.key.target, this.fill, this.fill.target);

    // Floor: a disc a shade lighter than the backdrop, fading into it, so the contact shadow has something to fall on.
    const disc = new RingGeometry(0, 1, 72, 12);
    const dp = disc.getAttribute('position'), dc = new Float32Array(dp.count * 3), floorTone = this.back.clone().lerp(P.earth, 0.24), fc = new Color();
    for (let i = 0; i < dp.count; i++) fc.copy(floorTone).lerp(this.back, smooth(0.35, 1, Math.hypot(dp.getX(i), dp.getY(i)))).toArray(dc, i * 3);
    disc.setAttribute('color', new BufferAttribute(dc, 3));
    this.floor = new Mesh(disc, new MeshBasicMaterial({ vertexColors: true, toneMapped: false, depthWrite: false }));
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.renderOrder = -2;
    this.root.add(this.floor);
    this.shadowPlane = new Mesh(new PlaneGeometry(1, 1), new ShadowMaterial({ color: P.screen, opacity: 0.6, depthWrite: false }));
    this.shadowPlane.rotation.x = -Math.PI / 2;
    this.shadowPlane.receiveShadow = true;
    this.shadowPlane.renderOrder = -1;
    this.root.add(this.shadowPlane);

    // Grid colours live in the vertex colours (they fade into the backdrop at the edges).
    const lineMat = () => new LineBasicMaterial({ color: 0xffffff, vertexColors: true, toneMapped: false, depthWrite: false });
    this.lineMats = {
      minor: lineMat(), major: lineMat(),
      dim: new LineBasicMaterial({ color: P.symHi, toneMapped: false, depthTest: false, transparent: true, opacity: 0.85 }),
    };
    this.floorGrid.renderOrder = 1;
    this.brackets.renderOrder = 3;
    this.root.add(this.floorGrid, this.sideWall, this.frontWall, this.brackets);

    // Shading overrides: clay (one matte, flat-shaded grey: the facets and the silhouette, no paint) and wire.
    this.clay = new MeshStandardMaterial({ color: P.missile.clone().multiplyScalar(0.7), roughness: 0.82, metalness: 0, flatShading: true });
    this.wire = new MeshBasicMaterial({ color: P.sym, wireframe: true, toneMapped: false });

    this.controls = new OrbitControls(stage.camera, stage.canvas);
    this.controls.enableDamping = false;
    this.controls.maxPolarAngle = Math.PI / 2;
    this.controls.autoRotateSpeed = 2; // 12° a second, half a minute a turn
    const change = () => stage.requestRender();
    const start = () => { this.userMoved = true; };
    this.controls.addEventListener('change', change);
    this.controls.addEventListener('start', start);
    this.offs.push(() => { this.controls.removeEventListener('change', change); this.controls.removeEventListener('start', start); });

    this.offs.push(stage.onFrame(dt => { if (this.spinning && dt > 0) this.controls.update(dt); this.syncWalls(); }, { always: true }));
    this.offs.push(stage.onResize(() => { if (!this.userMoved) this.frame(); }));
  }

  private captureEnvironment(): void {
    if (this.disposed) return;
    const pmrem = new PMREMGenerator(this.stage.renderer);
    const studio = studioScene(this.palette, this.back);
    try {
      this.envMap?.dispose();
      this.envMap = pmrem.fromScene(studio, 0.03).texture;
      this.stage.scene.environment = this.envMap;
      this.stage.scene.environmentIntensity = 0.55;
    } catch (e) {
      // Without float render targets the models keep the key, fill and sky lights.
      console.warn('Model viewer: no light probe', e);
    } finally {
      disposeScene(studio);
      pmrem.dispose();
    }
  }

  // ------------------------------------------------------------------------------------------------ models

  /** Show one model, or two side by side. Disposes what was shown; a late load of an earlier choice never appears. */
  show(primary: SlotSpec, compare: SlotSpec | null): void {
    if (this.disposed) return;
    const gen = ++this.generation;
    this.clearSlots();
    this.placed = null;
    this.userMoved = false;
    for (const spec of compare ? [primary, compare] : [primary]) this.slots.push(this.makeSlot(spec, gen));
    this.emit();
    this.settle(gen);
  }

  private makeSlot(spec: SlotSpec, gen: number): Slot {
    const holder = new Group();
    holder.name = 'model:' + spec.id;
    holder.visible = false;
    this.root.add(holder);
    const slot: Slot = {
      spec, holder, visual: null, procedural: null, own: [], tag: null,
      status: { id: spec.id, state: 'loading', drawn: null, fileFailed: false, stats: null },
    };
    const useFallback = (fileFailed: boolean) => {
      const g = buildFallback(spec.id, this.palette);
      slot.status.fileFailed = fileFailed;
      if (!g) { slot.status.state = 'failed'; return; }
      slot.procedural = g;
      g.traverse(o => { if (o instanceof Mesh) slot.own.push({ mesh: o, material: o.material }); });
      holder.add(g);
      slot.status.stats = meshStats(g);
      slot.status.state = 'ready';
      slot.status.drawn = 'fallback';
    };
    if (spec.source === 'fallback') {
      useFallback(false);
    } else {
      const visual = new AssetVisual(spec.id as AssetId, {
        onReady: v => {
          if (gen !== this.generation) return;
          slot.status.stats = meshStats(v);
          slot.status.state = 'ready';
          slot.status.drawn = 'file';
          this.settle(gen);
        },
        onFail: () => {
          if (gen !== this.generation) return;
          slot.visual?.dispose();
          slot.visual?.removeFromParent();
          slot.visual = null;
          useFallback(true);
          this.settle(gen);
        },
      });
      slot.visual = visual;
      holder.add(visual);
    }
    return slot;
  }

  /** Once every slot has loaded or failed: place, frame, shade, show, and report. */
  private settle(gen: number): void {
    if (gen !== this.generation || this.disposed) return;
    if (this.slots.some(s => s.status.state === 'loading')) { this.emit(); return; }
    this.layout();
    this.applyShade();
    for (const s of this.slots) s.holder.visible = s.status.state === 'ready';
    this.frame();
    this.emit();
    this.stage.renderOnce();
  }

  private clearSlots(): void {
    for (const s of this.slots) {
      s.visual?.dispose();
      s.visual?.removeFromParent();
      // Procedural geometry and palette materials are the kit's shared caches: detach, never dispose.
      s.procedural?.removeFromParent();
      s.holder.removeFromParent();
      s.tag?.dispose();
    }
    this.slots = [];
    for (const n of this.notes) n.note.dispose();
    this.notes = [];
    this.clearLines(this.brackets);
    this.clearLines(this.floorGrid);
    this.clearLines(this.sideWall);
    this.clearLines(this.frontWall);
  }

  private clearLines(g: Group): void {
    for (const child of [...g.children]) {
      if (child instanceof LineSegments) child.geometry.dispose();
      child.removeFromParent();
    }
  }

  private emit(): void {
    if (this.disposed) return;
    const slots = this.slots.map(s => ({ ...s.status }));
    this.onStatus?.({ phase: slots.some(s => s.state === 'loading') ? 'loading' : 'ready', slots });
  }

  // ------------------------------------------------------------------------------------------------ layout

  private layout(): void {
    const ready = this.slots.filter(s => s.status.state === 'ready' && s.status.stats && !s.status.stats.bounds.isEmpty());
    for (const n of this.notes) n.note.dispose();
    this.notes = [];
    this.clearLines(this.brackets);
    if (!ready.length) { this.placed = null; return; }
    const [a, b] = ready;
    const off = pairLayout(a!.status.stats!.bounds, b?.status.stats?.bounds ?? null, !!b && this.view === 'side');
    a!.holder.position.copy(off.a);
    if (b && off.b) b.holder.position.copy(off.b);
    const parts = ready.map(s => ({ box: s.status.stats!.bounds, offset: s.holder.position }));
    this.placed = placedBounds(parts);
    this.buildStage(this.placed);
    // Frame the brackets too, so their values are never cut off at the edge.
    for (const s of ready) this.placed.union(this.buildBrackets(s.status.stats!.bounds.clone().translate(s.holder.position)));
    // Names in the view when two models share it.
    for (const s of this.slots) { s.tag?.dispose(); s.tag = null; }
    if (ready.length > 1) {
      ready.forEach((s, i) => {
        const box = s.status.stats!.bounds.clone().translate(s.holder.position);
        const tag = new Tag(this.stage.labels, 'site', 'neutral');
        tag.set(s.spec.name, '', s.spec.id + (s.status.drawn === 'fallback' ? ' · fallback' : ''));
        tag.setSelected(i === 0);
        tag.obj.position.set((box.min.x + box.max.x) / 2, box.max.y + box.getSize(new Vector3()).y * 0.15, (box.min.z + box.max.z) / 2);
        s.tag = tag;
      });
    }
  }

  /** Floor grid, the two measuring walls, the shadow catcher and the key light, sized to what is shown. */
  private buildStage(box: Box3): void {
    this.clearLines(this.floorGrid);
    this.clearLines(this.sideWall);
    this.clearLines(this.frontWall);
    const size = box.getSize(new Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const { minor, major } = gridSpacing(maxDim);
    const roundUp = (v: number) => Math.ceil(v / major - 1e-6) * major;
    const half = roundUp(Math.max(Math.abs(box.min.x), Math.abs(box.max.x), Math.abs(box.min.z), Math.abs(box.max.z)) * 1.35 + major);
    const lift = Math.max(0.002, minor * 0.01);
    const P = this.palette;
    /** Lines at u = const (running along v) and v = const (along u) over [-uHalf, uHalf] x [v0, v1]. */
    const lines = (target: Group, put: (u: number, v: number, o: Vector3) => void, uHalf: number, v0: number, v1: number,
      fade: (u: number, v: number) => number) => {
      const u = gridLines(-uHalf, uHalf, minor, major), v = gridLines(v0, v1, minor, major);
      // Quiet lines: the grid is a ruler, not the subject.
      const minorG = gridGeometry(u.minor, [v0, v1], v.minor, [-uHalf, uHalf], put, fade, P.symDim.clone().lerp(this.back, 0.62), this.back);
      const majorG = gridGeometry(u.major, [v0, v1], v.major, [-uHalf, uHalf], put, fade, P.sym.clone().lerp(this.back, 0.68), this.back);
      target.add(new LineSegments(minorG, this.lineMats.minor), new LineSegments(majorG, this.lineMats.major));
    };
    // Floor: x / z lines through the origin, fading out in a circle.
    lines(this.floorGrid, (u, v, o) => o.set(u, lift, v), half, -half, half,
      (u, v) => 0.25 + 0.75 * smooth(0.45, 1, Math.hypot(u, v) / half));
    // Walls for the side and front views: a vertical grid behind the model, from the floor up.
    const top = roundUp(size.y * 1.6 + major);
    const wallFade = (uHalf: number) => (u: number, v: number) => 0.3 + 0.7 * Math.max(smooth(0.6, 1, Math.abs(u) / uHalf), smooth(0.55, 1, v / top));
    lines(this.sideWall, (u, v, o) => o.set(0, v, u), half, 0, top, wallFade(half));
    lines(this.frontWall, (u, v, o) => o.set(u, v, 0), half, 0, top, wallFade(half));
    this.sideWall.userData.reach = { min: box.min.x - major, max: box.max.x + major };
    this.frontWall.userData.reach = { min: box.min.z - major, max: box.max.z + major };

    this.shadowPlane.scale.set(half * 2, half * 2, 1);
    this.floor.scale.set(half, half, 1);
    // Key light high ahead-left, so its shadow draws the planform; the rim from behind-right.
    const c = box.getCenter(new Vector3());
    const r = Math.max(1, size.length() / 2);
    this.key.position.set(c.x - r * 0.9, r * 3.2, c.z - r * 1.1);
    this.key.target.position.copy(c);
    const cam = this.key.shadow.camera;
    cam.left = -r * 1.6; cam.right = r * 1.6; cam.top = r * 1.6; cam.bottom = -r * 1.6;
    cam.near = 0.01; cam.far = r * 8;
    cam.updateProjectionMatrix();
    this.key.shadow.normalBias = r * 0.002;
    this.fill.position.set(c.x + r * 1.5, r * 1.2, c.z + r * 1.8);
    this.fill.target.position.copy(c);
  }

  /** Length, span and height brackets beside one placed model, with their values. Returns the brackets' bounds. */
  private buildBrackets(box: Box3): Box3 {
    const size = box.getSize(new Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const gap = Math.max(0.12, maxDim * 0.07), tick = gap * 0.45, y = box.min.y + Math.max(0.004, maxDim * 0.0015);
    const pts: number[] = [];
    const seg = (a: Vector3, b: Vector3) => pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
    const v = (x: number, yy: number, z: number) => new Vector3(x, yy, z);
    const xL = box.min.x - gap, zF = box.min.z - gap;
    // Length along the left side.
    seg(v(xL, y, box.min.z), v(xL, y, box.max.z));
    seg(v(xL - tick, y, box.min.z), v(xL + tick, y, box.min.z));
    seg(v(xL - tick, y, box.max.z), v(xL + tick, y, box.max.z));
    // Span ahead of the nose.
    seg(v(box.min.x, y, zF), v(box.max.x, y, zF));
    seg(v(box.min.x, y, zF - tick), v(box.min.x, y, zF + tick));
    seg(v(box.max.x, y, zF - tick), v(box.max.x, y, zF + tick));
    // Height at the front left corner.
    seg(v(xL, box.min.y, zF), v(xL, box.max.y, zF));
    seg(v(xL - tick, box.max.y, zF), v(xL + tick, box.max.y, zF));
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pts, 3));
    const lines = new LineSegments(g, this.lineMats.dim);
    lines.renderOrder = 3;
    this.brackets.add(lines);
    const note = (axis: DimAxis, text: string, x: number, yy: number, z: number) => {
      const n = new Note(this.stage.labels, 'r3-center r3-above mdl-dim');
      n.set(text);
      n.obj.position.set(x, yy, z);
      this.notes.push({ note: n, axis });
    };
    const u = this.units;
    note('length', `L ${fmtLength(size.z, u)}`, xL, y, (box.min.z + box.max.z) / 2);
    note('width', `W ${fmtLength(size.x, u)}`, (box.min.x + box.max.x) / 2, y, zF);
    note('height', `H ${fmtLength(size.y, u)}`, xL, box.max.y + tick, zF);
    this.syncNotes();
    return new Box3(new Vector3(xL - tick, box.min.y, zF - tick), box.max.clone());
  }

  /** A bracket seen end on is a dot: hide its value (length in the front view, width in the side view, height from the top). */
  private syncNotes(): void {
    const hidden: DimAxis | null = this.view === 'front' ? 'length' : this.view === 'side' ? 'width' : this.view === 'top' ? 'height' : null;
    for (const n of this.notes) n.note.visible = n.axis !== hidden;
  }

  /** Show the measuring wall the camera faces (side or front), on the far side of the models. */
  private syncWalls(): void {
    const d = _dir.subVectors(this.controls.target, this.stage.camera.position).normalize();
    const level = Math.abs(d.y) < 0.4;
    const side = this.sideWall.userData.reach as { min: number; max: number } | undefined;
    const front = this.frontWall.userData.reach as { min: number; max: number } | undefined;
    this.sideWall.visible = !!side && level && Math.abs(d.x) > 0.9;
    if (side) this.sideWall.position.x = d.x > 0 ? side.max : side.min;
    this.frontWall.visible = !!front && level && Math.abs(d.z) > 0.9;
    if (front) this.frontWall.position.z = d.z > 0 ? front.max : front.min;
  }

  // ------------------------------------------------------------------------------------------------ camera

  /** Put the camera on the current preset, fitted to what is shown. */
  frame(): void {
    if (this.disposed || !this.placed) return;
    const st = this.stage;
    const f = frameBounds(this.placed, this.view, st.viewFov, st.width / Math.max(1, st.height), 1.15);
    st.camera.position.copy(f.position);
    st.camera.up.set(0, 1, 0);
    this.controls.target.copy(f.target);
    const r = this.placed.getSize(new Vector3()).length() / 2;
    this.controls.minDistance = Math.max(0.05, r * 0.4);
    this.controls.maxDistance = Math.max(f.distance * 4, r * 6);
    this.controls.update();
    this.syncWalls();
    st.requestRender();
  }

  setView(view: ViewId): void {
    if (this.disposed) return;
    const relayout = (view === 'side') !== (this.view === 'side') && this.slots.length > 1;
    this.view = view;
    this.userMoved = false;
    if (relayout) this.layout();
    this.syncNotes();
    this.frame();
    if (this.placed) this.stage.renderOnce();
  }

  setShade(shade: Shade): void {
    if (this.disposed || shade === this.shade) return;
    this.shade = shade;
    this.applyShade();
    this.stage.requestRender();
  }

  private applyShade(): void {
    const override = this.shade === 'clay' ? this.clay : this.shade === 'wire' ? this.wire : null;
    for (const s of this.slots) {
      s.visual?.setMaterial(override);
      for (const o of s.own) o.mesh.material = override ?? o.material;
    }
    this.shadowPlane.visible = this.shade !== 'wire';
  }

  setTurntable(on: boolean): void {
    if (this.disposed || on === this.spinning) return;
    this.spinning = on;
    this.controls.autoRotate = on;
    if (on) this.stage.resume(); else this.stage.pause();
  }

  setUnits(units: Units): void { this.units = units; this.layout(); this.stage.requestRender(); }

  // ------------------------------------------------------------------------------------------------ cleanup

  /** Idempotent: every model released, every own resource freed, the Stage (loop, observers, context) disposed. */
  dispose(): void {
    if (this.disposed) return;
    this.generation++;
    this.clearSlots();
    this.disposed = true;
    for (const off of this.offs.splice(0)) off();
    this.controls.dispose();
    this.shadowPlane.geometry.dispose();
    this.shadowPlane.material.dispose();
    this.floor.geometry.dispose();
    this.floor.material.dispose();
    for (const m of Object.values(this.lineMats)) m.dispose();
    this.clay.dispose();
    this.wire.dispose();
    this.stage.scene.environment = null;
    this.envMap?.dispose();
    this.envMap = null;
    this.key.shadow.dispose();
    this.root.removeFromParent();
    this.stage.dispose();
  }
}
