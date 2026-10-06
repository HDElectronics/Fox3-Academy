/** 3D pod view with a separate crisp instrument overlay. Owns and disposes its GPU resources. */
import { Color, DirectionalLight, HemisphereLight, PerspectiveCamera, Scene, Vector3, WebGLRenderer, PCFShadowMap, SRGBColorSpace, ACESFilmicToneMapping } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { readTheme } from '../../ui/theme';
import { h } from '../../ui';
import { AtflirSession, FOVS, TARGETS } from './model';
import { POD_FOV, podAim, setPodCamera } from './camera';
import { AtflirRange } from './range';
import { SensorFilter } from './sensorFilter';

export class PodView {
  readonly el = h('div', { class: 'atflir-screen' });
  private readonly overlay = h('canvas', { class: 'atflir-instruments', 'aria-hidden': 'true' });
  private readonly scene = new Scene();
  private readonly theme = readTheme();
  private readonly renderer: WebGLRenderer;
  private readonly camera = new PerspectiveCamera(38, 1, .001, 5);
  private readonly overview = new PerspectiveCamera(48, 1, .001, 5);
  private readonly orbit: OrbitControls;
  private readonly range: AtflirRange;
  private readonly filter: SensorFilter;
  private readonly observer: ResizeObserver;
  private readonly visibility: IntersectionObserver;
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private session: AtflirSession;
  private aim = new Vector3();
  private fov = POD_FOV[0] as number;
  private nightVision = true;
  private isOverview = false;
  private width = 1;
  private height = 1;
  private dpr = 1;
  private raf = 0;
  private last = 0;
  private visible = true;
  private disposed = false;
  private contextLost = false;
  private readonly onLost = (e: Event) => { e.preventDefault(); this.contextLost = true; this.el.dataset.unavailable = 'true'; };
  private readonly onRestored = () => { this.contextLost = false; delete this.el.dataset.unavailable; this.resize(); };

  constructor(session: AtflirSession) {
    this.session = session; this.aim.copy(podAim(session)); this.fov = POD_FOV[session.fov]!;
    this.renderer = new WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.domElement.className = 'atflir-video';
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.domElement.setAttribute('aria-label', '3D ATFLIR training range. Slew and change FOV with the controls.');
    this.renderer.domElement.addEventListener('webglcontextlost', this.onLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.onRestored);
    this.el.append(this.renderer.domElement, this.overlay,
      h('div', { class: 'atflir-context-error', role: 'status' }, '3D image paused. Waiting for graphics to recover.'));
    this.scene.background = new Color(this.theme.earth);
    this.scene.add(new HemisphereLight(this.theme.skyHorizon, this.theme.earth, 1.4));
    const sun = new DirectionalLight(this.theme.placard, 2.4);
    sun.position.set(-.25, .55, .28); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -.48; sun.shadow.camera.right = .48;
    sun.shadow.camera.top = .48; sun.shadow.camera.bottom = -.48;
    sun.shadow.camera.near = .05; sun.shadow.camera.far = 2;
    sun.shadow.bias = -.00015; sun.shadow.normalBias = .0008;
    this.scene.add(sun, sun.target);
    this.filter = new SensorFilter(this.renderer, this.theme);
    this.range = new AtflirRange(this.theme, () => { if (!this.disposed) this.renderer.shadowMap.needsUpdate = true; });
    this.range.scale.setScalar(.001); this.scene.add(this.range);
    this.renderer.shadowMap.needsUpdate = true;
    this.overview.position.set(.32, .28, .36);
    this.orbit = new OrbitControls(this.overview, this.renderer.domElement);
    this.orbit.target.set(0, 0, 0); this.orbit.enableDamping = true;
    this.orbit.minDistance = .12; this.orbit.maxDistance = 1;
    this.orbit.maxPolarAngle = Math.PI * .46; this.orbit.enabled = false;
    this.orbit.update();
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(this.el);
    this.visibility = new IntersectionObserver(entries => { this.visible = entries.at(-1)?.isIntersecting ?? true; });
    this.visibility.observe(this.el);
    this.update(session, true, false, true);
    const tick = (now: number) => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(tick);
      if (now - this.last < 32 || !this.visible || document.hidden || this.contextLost) return;
      const dt = Math.min(.1, (now - this.last) / 1000); this.last = now;
      this.render(dt, now / 1000);
    };
    this.raf = requestAnimationFrame(tick);
  }

  update(session: AtflirSession, nightVision: boolean, overview: boolean, snap = false): void {
    this.session = session; this.nightVision = nightVision; this.isOverview = overview;
    this.orbit.enabled = overview; this.el.dataset.view = overview ? 'range' : 'pod';
    this.range.setObscured(session.obscured); this.range.setInfrared(session.ir && !overview);
    // Obstruction and channel changes are rare; refresh static shadows only on user actions.
    this.renderer.shadowMap.needsUpdate = true;
    if (snap || this.reducedMotion) { this.aim.copy(podAim(session)); this.fov = POD_FOV[session.fov]!; }
    this.render(snap ? 1 : 0, 0);
  }
  private resize(): void {
    if (this.disposed) return;
    this.width = Math.max(1, this.el.clientWidth); this.height = Math.max(1, this.el.clientHeight);
    this.dpr = Math.min(1.5, devicePixelRatio || 1);
    this.renderer.setPixelRatio(this.dpr); this.renderer.setSize(this.width, this.height, false);
    this.filter.resize(Math.floor(this.width * this.dpr), Math.floor(this.height * this.dpr));
    this.overlay.width = Math.floor(this.width * this.dpr); this.overlay.height = Math.floor(this.height * this.dpr);
    this.camera.aspect = this.width / this.height; this.overview.aspect = this.camera.aspect;
    this.overview.updateProjectionMatrix(); this.render(1, 0);
  }
  private render(dt: number, time: number): void {
    if (this.disposed || this.contextLost) return;
    const s = this.session;
    const a = this.reducedMotion ? 1 : 1 - Math.exp(-dt * 14);
    this.aim.lerp(podAim(s), a); this.fov += (POD_FOV[s.fov]! - this.fov) * a;
    setPodCamera(this.camera, this.aim, this.fov);
    if (this.isOverview) this.orbit.update();
    this.filter.render(this.scene, this.isOverview ? this.overview : this.camera, {
      infrared: s.ir && !this.isOverview, whiteHot: s.whiteHot, nightVision: this.nightVision && !this.isOverview,
      time: this.reducedMotion ? 0 : time,
    });
    this.drawInstruments();
  }
  private drawInstruments(): void {
    const c = this.overlay.getContext('2d'); if (!c) return;
    const w = this.width, h = this.height, s = this.session, t = this.theme;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.clearRect(0, 0, w, h);
    c.strokeStyle = t.sym; c.fillStyle = t.sym;
    c.shadowColor = t.screen; c.shadowBlur = 4; c.lineWidth = 1.25;
    c.font = `14px ${t.fontMono}`; c.textAlign = 'left';
    const text = (v: string, x: number, y: number) => c.fillText(v, x, y);
    if (this.isOverview) {
      text('TRAINING RANGE', 24, 34);
      c.font = `12px ${t.fontMono}`; text('Drag to orbit · scroll to zoom', 24, h - 24);
      for (const truck of TARGETS) {
        const p = new Vector3(truck.x * .001, .007, truck.y * .001).project(this.overview);
        if (p.z > 1 || Math.abs(p.x) > .9 || Math.abs(p.y) > .9) continue;
        const x = (p.x + 1) * w / 2, y = (1 - p.y) * h / 2;
        c.beginPath(); c.arc(x, y, 4, 0, Math.PI * 2); c.stroke();
        c.textAlign = 'center'; text(truck.id === 'assigned' ? 'ASSIGNED TRUCK' : 'OTHER TRUCK', x, y - 13);
      }
      return;
    }
    text(FOVS[s.fov]!, 24, 34); text(s.ir ? `IR  ${s.whiteHot ? 'WHT' : 'BLK'}` : 'TV', 24, 55);
    c.textAlign = 'right'; text(s.focused ? 'TDC ◇' : 'NO TDC', w - 24, 34);
    text('A/G', w - 24, h - 26); c.textAlign = 'left'; text('OPR', 24, h - 26);
    c.textAlign = 'center'; text(s.mode === 'AUTO' && !s.tracked ? 'INR AUTO' : s.mode, w / 2, h - 26);
    const cx = w / 2, cy = h / 2;
    if (s.mode === 'AUTO' && s.tracked) {
      // A ground-referenced gate fitted to the actual 8 m visual, not the old diagram rectangle.
      const truck = TARGETS.find(t => t.id === s.tracked)!;
      const p = new Vector3(truck.x * .001, .0018, truck.y * .001).project(this.camera);
      const x = (p.x + 1) * w / 2, y = (1 - p.y) * h / 2;
      const radius = Math.max(12, Math.min(w * .22, h * .003 / (2 * Math.tan(this.fov * Math.PI / 360) * this.camera.position.distanceTo(this.aim))));
      this.corners(c, x, y, radius * .65, radius, 10);
    } else {
      c.beginPath();
      for (const d of [-1, 1]) { c.moveTo(cx + d * 12, cy); c.lineTo(cx + d * 42, cy); c.moveTo(cx, cy + d * 12); c.lineTo(cx, cy + d * 42); }
      c.stroke();
      if (s.mode === 'SCENE') this.corners(c, cx, cy, 66, 50, 12);
    }
    c.fillRect(cx - 1, cy - 1, 2, 2);
    if (s.fov < 2) this.corners(c, cx, cy, w * .16, h * .16, 9);
  }
  private corners(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, size: number): void {
    c.beginPath();
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      c.moveTo(x + sx * (rx - size), y + sy * ry); c.lineTo(x + sx * rx, y + sy * ry); c.lineTo(x + sx * rx, y + sy * (ry - size));
    }
    c.stroke();
  }
  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    cancelAnimationFrame(this.raf); this.observer.disconnect(); this.visibility.disconnect(); this.orbit.dispose();
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.onRestored);
    this.range.dispose(); this.filter.dispose();
    this.scene.traverse(o => { if (o instanceof DirectionalLight) o.shadow.dispose(); });
    this.scene.clear(); this.renderer.dispose(); this.renderer.forceContextLoss(); this.el.remove();
  }
}
