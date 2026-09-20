/**
 * Stage: owns the WebGL renderer, the CSS2D label overlay, the scene, the camera and the frame loop.
 * One Stage per 3D viewport. Everything in the scene is in render units (1 unit = 1 km).
 */
import {
  ACESFilmicToneMapping, AgXToneMapping, Material, Mesh, NoToneMapping, Object3D, PerspectiveCamera, Plane,
  Raycaster, Scene, SRGBColorSpace, Texture, Vector2, Vector3, WebGLRenderer,
} from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { readTheme, type Theme } from '../ui/theme';
import { Environment, type EnvironmentOptions } from './environment';
import { paletteFromTheme, type Palette } from './palette';
import { createSharedUniforms, type SharedUniforms } from './shared';
import { M_PER_UNIT, pxPerUnitAt, UNIT_PER_M } from './units';
import './render.css';

export type FrameFn = (dt: number, t: number) => void;

/** Standard frame priorities (lower runs first). Pages step the sim at `sim`. */
export const FramePriority = { sim: 0, view: 100, camera: 200, late: 300, env: 400 } as const;

export interface FrameOptions {
  /** Lower runs first. Default FramePriority.sim (0). */
  priority?: number;
  /** Also run on on-demand renders while the Stage is paused (with dt = 0). Default false. */
  always?: boolean;
}

export interface StageOptions {
  /** Default true. */
  antialias?: boolean;
  /** Device pixel ratio cap. Default 2. */
  maxDpr?: number;
  /** Default 'aces'. */
  toneMapping?: 'aces' | 'agx' | 'none';
  /** Default 1.0. */
  exposure?: number;
  /** Vertical field of view, degrees. Default 50. */
  fov?: number;
  /** Sky, ground, haze and lights. Default true (pass options to customise, false for none). */
  environment?: boolean | EnvironmentOptions;
  /** CSS2D label overlay. Default true. */
  labels?: boolean;
  /**
   * While the viewport is scrolled out of view: `true` (default) pauses the whole loop, including sim
   * steps registered with onFrame; `'render'` keeps every onFrame subscriber running (the sim goes on)
   * and only skips drawing (use it on pages where the fight must continue while the user scrolls to
   * the controls); `false` never pauses.
   */
  autoPause?: boolean | 'render';
  /** Start the loop immediately. Default true. */
  autoStart?: boolean;
  /** Accessible label for the canvas. */
  ariaLabel?: string;
}

interface Sub { fn: FrameFn; priority: number; always: boolean; dead: boolean }

export class WebGLUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('WebGL is not available in this browser.');
    this.name = 'WebGLUnavailableError';
    if (cause) (this as { cause?: unknown }).cause = cause;
  }
}

/** True when a WebGL2 context can be created. */
export function isWebGLAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}

export class Stage {
  readonly container: HTMLElement;
  /** Wrapper element the Stage created inside the container (canvas + label layer). */
  readonly root: HTMLDivElement;
  readonly renderer: WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  /** Root for CSS2DObjects (rendered by the label renderer only; positions in render units). */
  readonly labels = new Scene();
  readonly labelRenderer: CSS2DRenderer | null;
  readonly shared: SharedUniforms = createSharedUniforms();
  readonly theme: Theme;
  readonly palette: Palette;
  readonly env: Environment | null;
  width = 1;
  height = 1;
  dpr = 1;

  private subs: Sub[] = [];
  private resizeSubs = new Set<(w: number, h: number) => void>();
  private disposables = new Set<{ dispose(): void }>();
  private raf = 0;
  private last = 0;
  private time = 0;
  private userPaused = false;
  private offscreen = false;
  /** autoPause: 'render': offscreen skips drawing only, the loop keeps running. */
  private renderOnlyPause = false;
  private lost = false;
  private disposed = false;
  private pendingRender = 0;
  private iterating = false;
  private ro: ResizeObserver | null = null;
  private io: IntersectionObserver | null = null;
  private overlay: HTMLDivElement | null = null;
  private maxDpr: number;
  private cleanup: (() => void)[] = [];
  private readonly _v = new Vector3();
  private readonly _ray = new Raycaster();
  private readonly _ndc = new Vector2();
  private readonly _plane = new Plane(new Vector3(0, 1, 0), 0);

  constructor(container: HTMLElement, opts: StageOptions = {}) {
    this.container = container;
    this.maxDpr = opts.maxDpr ?? 2;
    this.theme = readTheme();
    this.palette = paletteFromTheme(this.theme);

    const root = document.createElement('div');
    root.className = 'r3-stage';
    container.appendChild(root);
    this.root = root;

    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({
        antialias: opts.antialias ?? true,
        logarithmicDepthBuffer: true,
        stencil: true,
        alpha: false,
        powerPreference: 'high-performance',
      });
    } catch (e) {
      root.appendChild(this.message('3D view unavailable: this browser could not start WebGL.'));
      throw new WebGLUnavailableError(e);
    }
    this.renderer = renderer;
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = opts.toneMapping === 'agx' ? AgXToneMapping : opts.toneMapping === 'none' ? NoToneMapping : ACESFilmicToneMapping;
    renderer.toneMappingExposure = opts.exposure ?? 1.0;
    renderer.setClearColor(this.palette.skyHorizon, 1);
    this.canvas = renderer.domElement;
    this.canvas.className = 'r3-canvas';
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', opts.ariaLabel ?? '3D tactical view');
    root.appendChild(this.canvas);

    this.camera = new PerspectiveCamera(opts.fov ?? 50, 1, 0.01, 2000);
    this.camera.position.set(0, 12, 30);
    this.camera.lookAt(0, 9, 0);
    this.scene.add(this.camera);

    if (opts.labels ?? true) {
      this.labelRenderer = new CSS2DRenderer();
      this.labelRenderer.domElement.className = 'r3-labels';
      root.appendChild(this.labelRenderer.domElement);
    } else {
      this.labelRenderer = null;
    }

    this.env = opts.environment === false ? null : new Environment(this, opts.environment === true || opts.environment === undefined ? {} : opts.environment);
    if (this.env) this.track(this.env);

    // Size
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();

    // Device pixel ratio changes (window moved to another screen, browser zoom) without a resize.
    this.watchDpr();

    // Pause when scrolled away
    const autoPause = opts.autoPause ?? true;
    this.renderOnlyPause = autoPause === 'render';
    if (autoPause && typeof IntersectionObserver !== 'undefined') {
      this.io = new IntersectionObserver(entries => {
        const e = entries[entries.length - 1];
        const was = this.offscreen;
        this.offscreen = !e.isIntersecting;
        this.kick();
        // Back on screen with a render-only pause: the loop never stopped, but a paused Stage needs a frame.
        if (was && !this.offscreen && !this.running) this.requestRender();
      });
      this.io.observe(container);
    }

    // Context loss
    const onLost = (e: Event) => {
      e.preventDefault();
      this.lost = true;
      this.stopLoop();
      this.showOverlay('3D view paused: the graphics context was lost. Restoring…');
    };
    const onRestored = () => {
      this.lost = false;
      this.hideOverlay();
      this.resize();
      this.kick();
    };
    this.canvas.addEventListener('webglcontextlost', onLost);
    this.canvas.addEventListener('webglcontextrestored', onRestored);
    this.cleanup.push(() => {
      this.canvas.removeEventListener('webglcontextlost', onLost);
      this.canvas.removeEventListener('webglcontextrestored', onRestored);
    });

    if (opts.autoStart ?? true) this.kick();
    else { this.userPaused = true; this.requestRender(); }
  }

  /** Users who asked the OS for less motion (pages may start paused / skip ambient animation). */
  static prefersReducedMotion(): boolean {
    return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // ---------------------------------------------------------------- loop

  /** Subscribe to the frame loop. dt = real seconds since last frame (≤ 0.1), t = running real time. */
  onFrame(fn: FrameFn, opts: FrameOptions | number = {}): () => void {
    const o = typeof opts === 'number' ? { priority: opts } : opts;
    const sub: Sub = { fn, priority: o.priority ?? FramePriority.sim, always: o.always ?? false, dead: false };
    let i = this.subs.length;
    while (i > 0 && this.subs[i - 1].priority > sub.priority) i--;
    this.subs.splice(i, 0, sub);
    return () => {
      sub.dead = true;
      if (!this.iterating) this.subs = this.subs.filter(s => !s.dead);
    };
  }

  onResize(fn: (w: number, h: number) => void): () => void {
    this.resizeSubs.add(fn);
    return () => this.resizeSubs.delete(fn);
  }

  /** Register something to dispose with the Stage. Returns it. */
  track<T extends { dispose(): void }>(d: T): T {
    this.disposables.add(d);
    return d;
  }
  untrack(d: { dispose(): void }): void { this.disposables.delete(d); }

  get running(): boolean { return this.raf !== 0; }
  get paused(): boolean { return this.userPaused; }
  /** True while the viewport is scrolled out of view (only tracked when autoPause is on). */
  get isOffscreen(): boolean { return this.offscreen; }
  /** Seconds the loop has been running (real time, excludes paused time). */
  get elapsed(): number { return this.time; }

  pause(): void { this.userPaused = true; this.stopLoop(); }
  resume(): void { this.userPaused = false; this.kick(); }

  /** Render one frame soon even while paused (subscribers registered with `always` run with dt = 0). */
  requestRender(): void {
    if (this.disposed || this.pendingRender || this.running) return;
    this.pendingRender = requestAnimationFrame(() => {
      this.pendingRender = 0;
      if (!this.running && !this.lost && !this.disposed) this.tick(0, true);
    });
  }

  /** Run subscribers and render right now (synchronously). */
  renderOnce(): void { if (!this.lost && !this.disposed) this.tick(0, true); }

  private kick(): void {
    if (this.disposed || this.lost || this.userPaused || (this.offscreen && !this.renderOnlyPause) || this.raf) return;
    this.last = performance.now();
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
      this.last = now;
      this.tick(dt, false);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private stopLoop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private tick(dt: number, onDemand: boolean): void {
    this.time += dt;
    this.shared.uClock.value = this.time;
    this.iterating = true;
    let dead = false;
    for (let i = 0; i < this.subs.length; i++) {
      const s = this.subs[i];
      if (s.dead) { dead = true; continue; }
      if (onDemand && !s.always) continue;
      try { s.fn(dt, this.time); } catch (e) { console.error('render: frame subscriber failed', e); }
    }
    this.iterating = false;
    if (dead) this.subs = this.subs.filter(s => !s.dead);
    // Render-only pause: subscribers (sim, views, camera) ran; skip the GPU work while nobody sees it.
    if (this.offscreen && this.renderOnlyPause && !onDemand) return;
    this.draw();
  }

  private draw(): void {
    this.renderer.render(this.scene, this.camera);
    if (this.labelRenderer) this.labelRenderer.render(this.labels, this.camera);
  }

  // ---------------------------------------------------------------- size & geometry helpers

  private watchDpr(): void {
    if (typeof matchMedia === 'undefined') return;
    let mq: MediaQueryList | null = null;
    const onChange = () => { arm(); this.resize(); };
    const arm = () => {
      mq?.removeEventListener('change', onChange);
      mq = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      mq.addEventListener('change', onChange);
    };
    arm();
    this.cleanup.push(() => { mq?.removeEventListener('change', onChange); mq = null; });
  }

  private resize(): void {
    if (this.disposed) return;
    const w = Math.max(1, Math.floor(this.container.clientWidth));
    const h = Math.max(1, Math.floor(this.container.clientHeight));
    const dpr = Math.min(this.maxDpr, window.devicePixelRatio || 1);
    if (w === this.width && h === this.height && dpr === this.dpr) return;
    this.width = w; this.height = h; this.dpr = dpr;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.labelRenderer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.syncShared();
    for (const fn of this.resizeSubs) fn(w, h);
    if (!this.running) this.requestRender();
  }

  /** Call after changing camera.fov yourself. */
  syncShared(): void {
    this.shared.uViewport.value.set(this.width, this.height);
    this.shared.uDpr.value = this.dpr;
    this.shared.uPxScale.value = (2 * Math.tan((this.camera.fov * Math.PI) / 360)) / this.height;
  }

  /** CSS pixels per render unit at `distance` units from the camera. */
  pxPerUnit(distance: number): number {
    return pxPerUnitAt(distance, this.camera.fov, this.height);
  }

  /** Project a render-unit position to client (page) coordinates. Returns false if behind the camera. */
  projectToClient(p: Vector3, out: Vector2): boolean {
    const v = this._v.copy(p).project(this.camera);
    if (v.z > 1 || v.z < -1) return false;
    const r = this.canvas.getBoundingClientRect();
    out.set(r.left + (v.x * 0.5 + 0.5) * r.width, r.top + (-v.y * 0.5 + 0.5) * r.height);
    return true;
  }

  /** Raycaster through a client point. */
  rayFromClient(clientX: number, clientY: number): Raycaster {
    const r = this.canvas.getBoundingClientRect();
    this._ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this._ray.setFromCamera(this._ndc, this.camera);
    return this._ray;
  }

  /** Where a client point hits the horizontal plane at `altitudeM`. Returns sim metres, or null. */
  clientToPlane(clientX: number, clientY: number, altitudeM = 0, out = new Vector3()): Vector3 | null {
    const ray = this.rayFromClient(clientX, clientY);
    this._plane.constant = -altitudeM * UNIT_PER_M;
    const hit = ray.ray.intersectPlane(this._plane, out);
    if (!hit) return null;
    return out.multiplyScalar(M_PER_UNIT);
  }

  /**
   * Click/tap without drag on the canvas (movement < 5 px). Handy for picking alongside orbit controls.
   * Returns an unsubscribe function.
   */
  onTap(fn: (clientX: number, clientY: number, e: PointerEvent) => void): () => void {
    let x = 0, y = 0, t = 0, id = -1;
    const down = (e: PointerEvent) => { x = e.clientX; y = e.clientY; t = performance.now(); id = e.pointerId; };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = -1;
      if (Math.hypot(e.clientX - x, e.clientY - y) < 5 && performance.now() - t < 600) fn(e.clientX, e.clientY, e);
    };
    this.canvas.addEventListener('pointerdown', down);
    this.canvas.addEventListener('pointerup', up);
    const off = () => { this.canvas.removeEventListener('pointerdown', down); this.canvas.removeEventListener('pointerup', up); };
    this.cleanup.push(off);
    return off;
  }

  // ---------------------------------------------------------------- overlay

  private message(text: string): HTMLDivElement {
    const d = document.createElement('div');
    d.className = 'r3-message';
    d.setAttribute('role', 'status');
    d.textContent = text;
    return d;
  }
  private showOverlay(text: string): void {
    this.hideOverlay();
    this.overlay = this.message(text);
    this.root.appendChild(this.overlay);
  }
  private hideOverlay(): void {
    this.overlay?.remove();
    this.overlay = null;
  }

  // ---------------------------------------------------------------- dispose

  /** Stop the loop and free every GPU resource, observer, listener and DOM node the Stage owns. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopLoop();
    if (this.pendingRender) cancelAnimationFrame(this.pendingRender);
    for (const d of [...this.disposables]) { try { d.dispose(); } catch (e) { console.error(e); } }
    this.disposables.clear();
    this.subs = [];
    this.resizeSubs.clear();
    this.ro?.disconnect();
    this.io?.disconnect();
    for (const c of this.cleanup) c();
    this.cleanup = [];
    disposeTree(this.scene);
    this.labels.traverse(o => { const el = (o as { element?: HTMLElement }).element; el?.remove(); });
    this.labels.clear();
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.root.remove();
  }
}

/** Dispose every geometry, material and texture under `root`. */
export function disposeTree(root: Object3D): void {
  const mats = new Set<Material>();
  root.traverse(o => {
    const m = o as Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as Material | Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach(x => mats.add(x)); else if (mat) mats.add(mat);
  });
  for (const m of mats) {
    for (const v of Object.values(m)) if (v instanceof Texture) v.dispose();
    const u = (m as { uniforms?: Record<string, { value: unknown }> }).uniforms;
    if (u) for (const k in u) if (u[k].value instanceof Texture) (u[k].value as Texture).dispose();
    m.dispose();
  }
}
