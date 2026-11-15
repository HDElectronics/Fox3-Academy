/**
 * Environment: a clear high-altitude day. A deep-blue zenith over a bright warm-white horizon band with a sun disc
 * and glow and a few high cirrus streaks; a stylised earth far below (sea with a coastline and sun glint, or land:
 * a field patchwork with woods and lakes) under a faint km grid; a broken cumulus deck that shadows the ground;
 * altitude-aware aerial perspective that fades everything into the horizon colour. One sun (directional) plus a
 * hemisphere fill and a small PMREM of the same sky light every model, so jets have a sky to reflect.
 *
 * Shading lives in atmosphere.ts and is shared with the attack terrain. All values are drawing choices.
 */
import {
  BackSide, BufferGeometry, Color, DirectionalLight, DoubleSide, Float32BufferAttribute, HemisphereLight, Mesh,
  MeshStandardMaterial, PMREMGenerator, Scene, ShaderMaterial, SphereGeometry, Vector3, type WebGLRenderTarget,
} from 'three';
import type { Stage } from './stage';
import { FRAG_END, FRAG_PRELUDE, ORDER, VERT_END, VERT_PRELUDE } from './shared';
import { createAtmosphereUniforms, patchSurface, W_ATMOS, W_CLOUD, W_NOISE, type AtmosphereUniforms } from './atmosphere';

export interface EnvironmentOptions {
  /** 'sea' (default: open water with a coastline) or 'land' (fields, woods and lakes). */
  surface?: 'sea' | 'land';
  /** Faint km grid on the surface. Default true. */
  grid?: boolean;
  /** Grid spacing in km. Default 10 (every fifth line slightly stronger). */
  gridKm?: number;
  /** Broken cumulus deck. Default true (2200 m, coverage 0.3); false for none. */
  clouds?: boolean | CloudOptions;
  /** High cirrus streaks painted on the sky. Default true. */
  cirrus?: boolean;
  /** Sun azimuth, degrees clockwise from north. Default 140. */
  sunAzimuthDeg?: number;
  /** Sun elevation, degrees. Default 40. */
  sunElevationDeg?: number;
  /** Sea-level visibility scale (km) at which haze reaches ~63 %; thinner with altitude. Default 130. */
  hazeKm?: number;
}

export interface CloudOptions {
  /** Cloud-deck altitude in metres. Default 2200. */
  altitudeM?: number;
  /** 0..1, default 0.3. */
  coverage?: number;
  /** How much the deck's shadow darkens the ground, 0..1. Default 0.42. */
  shadow?: number;
}

/** Disc in the xz plane, rings growing geometrically from `inner` to `radius` (km): dense near the eye, cheap far out. */
export function polarDisc(radius: number, inner: number, rings: number, segments: number): BufferGeometry {
  const pos: number[] = [0, 0, 0], nrm: number[] = [0, 1, 0], idx: number[] = [];
  const k = Math.pow(radius / inner, 1 / (rings - 1));
  for (let r = 0; r < rings; r++) {
    const rad = inner * Math.pow(k, r);
    for (let s = 0; s < segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      pos.push(Math.cos(a) * rad, 0, Math.sin(a) * rad);
      nrm.push(0, 1, 0);
    }
  }
  const at = (r: number, s: number) => 1 + r * segments + (s % segments);
  for (let s = 0; s < segments; s++) idx.push(0, at(0, s + 1), at(0, s));
  for (let r = 0; r < rings - 1; r++) for (let s = 0; s < segments; s++) {
    const a = at(r, s), b = at(r, s + 1), c = at(r + 1, s), d = at(r + 1, s + 1);
    idx.push(a, b, c, b, d, c);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

const skyVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const skyFrag = /* glsl */ `
${W_NOISE}
${W_ATMOS}
uniform float uCirrus;
uniform float uSunDisc;
uniform vec3 uEnvGround;
varying vec3 vDir;
float wCirrus(vec3 d) {
  if (d.y < 0.012) return 0.0;
  vec2 q = d.xz / (d.y + 0.06) * 5.0;
  q = mat2(0.87, 0.49, -0.49, 0.87) * q;
  float streak = wFbm5(vec2(q.x * 0.3, q.y * 1.9) + 3.0);
  float mask = wFbm3(q * 0.11 + 9.0);
  return smoothstep(0.52, 0.82, streak) * smoothstep(0.5, 0.72, mask) * smoothstep(0.012, 0.16, d.y);
}
void main() {
  vec3 d = normalize(vDir);
  vec3 col = atmoSky(d);
#ifdef ENV_CAPTURE
  // Lighting capture: the ground below (lit albedo) fading into the haze toward the horizon.
  if (d.y < 0.0) col = mix(uEnvGround, col, pow(1.0 - min(-d.y * 1.4, 1.0), 4.0));
#else
  if (uCirrus > 0.0) {
    float c = wCirrus(d) * uCirrus;
    col = mix(col, uHorizon * 1.04 + atmoGlow(d) * 1.5, c * 0.32);
  }
  float s = dot(d, uSunDir);
  col += uSunGlow * (smoothstep(0.99990, 0.99995, s) * uSunDisc + pow(max(s, 0.0), 900.0) * 0.6);
#endif
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const surfaceVert = /* glsl */ `
${VERT_PRELUDE}
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
  ${VERT_END}
}`;

const cloudFrag = /* glsl */ `
${FRAG_PRELUDE}
${W_NOISE}
${W_ATMOS}
${W_CLOUD}
uniform vec3 uCloudLit;
uniform vec3 uCloudDark;
varying vec3 vWorld;
void main() {
  vec2 p = vWorld.xz;
  float dist = length(cameraPosition - vWorld);
  float fade = smoothstep(0.4, 2.0, dist) * (1.0 - smoothstep(200.0, 290.0, dist));
  vec2 q = wCloudQ(p);
  float cb = wCloudBase(q);
  // Clear sky: the puff detail adds at most 0.2, so skip it early.
  if (fade <= 0.0 || cb + 0.2 < wCloudThr()) discard;
  float n = cb + wFbm3(q * 0.55 + 7.0) * 0.2;
  // Crisper cauliflower edges on the near clouds.
  float cNear = 1.0 - smoothstep(20.0, 45.0, dist);
  if (cNear > 0.0) n += ((wNoise(q * 2.4 + 3.0) - 0.5) * 0.06 + (wNoise(q * 6.5 + 1.0) - 0.5) * 0.035) * cNear;
  float th = wCloudThr();
  float a = smoothstep(th, th + mix(0.06, 0.035, cNear), n) * fade;
  if (a < 0.02) discard;
  // Sun side of each puff brighter, lee side in the blue-grey shade; thick cores read white from above.
  float ns = wCloudField(p + normalize(uSunDir.xz + 1e-4) * 0.7);
  float lit = clamp(0.58 + (n - ns) * 8.0, 0.0, 1.0);
  float thick = smoothstep(th, th + 0.2, n);
  vec3 top = mix(uCloudDark, uCloudLit, clamp(lit * 0.75 + thick * 0.4, 0.0, 1.0));
  vec3 base = mix(uCloudDark, uCloudLit * 0.7, (1.0 - thick) * 0.6 + lit * 0.15);
  vec3 col = cameraPosition.y > vWorld.y ? top : base;
  col = atmoApply(col, cameraPosition, vWorld);
  gl_FragColor = vec4(col, a * 0.94);
  ${FRAG_END}
}`;

export class Environment {
  readonly sunDirection = new Vector3();
  /** Shared world-shader uniforms (sky, haze, clouds, land colours); pass to TerrainMesh so it matches. */
  readonly atmosphere: AtmosphereUniforms;
  readonly sky: Mesh<SphereGeometry, ShaderMaterial>;
  readonly ground: Mesh<BufferGeometry, MeshStandardMaterial>;
  readonly clouds: Mesh<BufferGeometry, ShaderMaterial>;
  readonly sun: DirectionalLight;
  readonly hemi: HemisphereLight;
  private readonly grid: { uGridColor: { value: Color }; uGridKm: { value: number }; uGridAlpha: { value: number } };
  private readonly capture: Scene;
  private readonly captureSky: Mesh<SphereGeometry, ShaderMaterial>;
  private pmrem: PMREMGenerator | null = null;
  private envMap: WebGLRenderTarget | null = null;
  private surface: 'sea' | 'land';
  private off: () => void;
  private stage: Stage;

  constructor(stage: Stage, opts: EnvironmentOptions = {}) {
    this.stage = stage;
    const p = stage.palette;
    const az = ((opts.sunAzimuthDeg ?? 140) * Math.PI) / 180;
    const el = ((opts.sunElevationDeg ?? 40) * Math.PI) / 180;
    this.sunDirection.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
    const atmo = this.atmosphere = createAtmosphereUniforms(p, this.sunDirection, stage.shared.uClock, opts.hazeKm ?? 130);
    this.surface = opts.surface ?? 'sea';
    atmo.uLandMode.value = this.surface === 'land' ? 1 : 0;

    // Sky dome (follows the camera; drawn first, no depth).
    const skyMaterial = (capture: boolean) => new ShaderMaterial({
      uniforms: { ...atmo, uCirrus: { value: opts.cirrus === false ? 0 : 1 }, uSunDisc: { value: 9 }, uEnvGround: { value: new Color() } },
      vertexShader: skyVert, fragmentShader: skyFrag, defines: capture ? { ENV_CAPTURE: '' } : {},
      side: BackSide, depthWrite: false, depthTest: false,
    });
    this.sky = new Mesh(new SphereGeometry(1500, 48, 24), skyMaterial(false));
    this.sky.renderOrder = ORDER.sky;
    this.sky.frustumCulled = false;
    stage.scene.add(this.sky);

    // Surface at altitude 0: lit like every other model, procedural albedo and haze (atmosphere.ts).
    this.grid = {
      uGridColor: { value: p.horizon.clone().lerp(p.missile, 0.5) },
      uGridKm: { value: opts.gridKm ?? 10 },
      uGridAlpha: { value: opts.grid === false ? 0 : GRID_ALPHA },
    };
    const groundMat = new MeshStandardMaterial({ roughness: 0.96, metalness: 0 });
    patchSurface(groundMat, { kind: 'ground', atmosphere: atmo, grid: this.grid });
    this.ground = new Mesh(polarDisc(2000, 0.05, 26, 48), groundMat);
    this.ground.renderOrder = ORDER.ground;
    this.ground.frustumCulled = false;
    stage.scene.add(this.ground);

    // Cumulus deck.
    this.clouds = new Mesh(
      polarDisc(300, 0.05, 20, 48),
      new ShaderMaterial({
        uniforms: {
          ...atmo,
          uCloudLit: { value: p.cloudLit.clone().multiply(p.sunlight).multiplyScalar(1.08) },
          uCloudDark: { value: p.cloudShade.clone() },
        },
        vertexShader: surfaceVert, fragmentShader: cloudFrag,
        transparent: true, depthWrite: false, side: DoubleSide,
      }),
    );
    this.clouds.renderOrder = ORDER.clouds;
    this.clouds.frustumCulled = false;
    this.clouds.visible = false;
    stage.scene.add(this.clouds);
    this.setClouds(opts.clouds ?? true);

    // One sun plus a soft sky fill; the PMREM below adds the sky's light and reflections.
    this.hemi = new HemisphereLight(p.skyMid.clone().lerp(p.horizon, 0.4), p.fieldB.clone().multiplyScalar(0.6), HEMI_INTENSITY);
    this.sun = new DirectionalLight(p.sunlight.clone(), SUN_INTENSITY);
    this.sun.position.copy(this.sunDirection);
    stage.scene.add(this.hemi, this.sun, this.sun.target);

    this.capture = new Scene();
    this.captureSky = new Mesh(new SphereGeometry(50, 32, 16), skyMaterial(true));
    this.capture.add(this.captureSky);
    this.updateEnvMap();

    this.off = stage.onFrame(() => this.update(), { priority: 400, always: true });
  }

  /** Re-capture the sky (and the ground colour below it) into the scene's environment map. */
  private updateEnvMap(): void {
    const p = this.stage.palette;
    const below = this.surface === 'land'
      ? p.fieldB.clone().lerp(p.forest, 0.3)
      : p.seaDeep.clone().lerp(p.fieldB, 0.3);
    (this.captureSky.material.uniforms.uEnvGround.value as Color).copy(below).multiplyScalar(0.9).lerp(p.airHaze, 0.25);
    try {
      this.pmrem ??= new PMREMGenerator(this.stage.renderer);
      const rt = this.pmrem.fromScene(this.capture, 0, 0.1, 100, { size: 64 });
      this.envMap?.dispose();
      this.envMap = rt;
      this.stage.scene.environment = rt.texture;
      this.stage.scene.environmentIntensity = ENV_INTENSITY;
    } catch (e) {
      // No float render targets: models keep the sun and hemisphere light.
      console.warn('render: sky environment map unavailable', e);
    }
  }

  setSurface(s: 'sea' | 'land'): void {
    if (s === this.surface) return;
    this.surface = s;
    this.atmosphere.uLandMode.value = s === 'land' ? 1 : 0;
    this.updateEnvMap();
  }

  setGrid(on: boolean): void { this.grid.uGridAlpha.value = on ? GRID_ALPHA : 0; }

  setClouds(c: boolean | CloudOptions): void {
    const a = this.atmosphere;
    if (!c) { this.clouds.visible = false; a.uCloudCover.value = 0; return; }
    const o = c === true ? {} : c;
    this.clouds.visible = true;
    a.uCloudAlt.value = (o.altitudeM ?? 2200) / 1000;
    a.uCloudCover.value = Math.min(1, Math.max(0, o.coverage ?? 0.3));
    a.uCloudShadow.value = Math.min(1, Math.max(0, o.shadow ?? 0.42));
    this.clouds.position.y = a.uCloudAlt.value;
  }

  /** Follow the camera (called by the Stage every frame). */
  update(): void {
    const cam = this.stage.camera.position;
    this.sky.position.copy(cam);
    this.ground.position.set(cam.x, 0, cam.z);
    this.clouds.position.x = cam.x; this.clouds.position.z = cam.z;
  }

  dispose(): void {
    this.off();
    for (const m of [this.sky, this.ground, this.clouds, this.captureSky]) { m.removeFromParent(); m.geometry.dispose(); m.material.dispose(); }
    if (this.stage.scene.environment === this.envMap?.texture) this.stage.scene.environment = null;
    this.envMap?.dispose(); this.envMap = null;
    this.pmrem?.dispose(); this.pmrem = null;
    this.hemi.removeFromParent(); this.sun.removeFromParent(); this.sun.target.removeFromParent();
    this.sun.dispose(); this.hemi.dispose();
  }
}

const GRID_ALPHA = 0.16;
const SUN_INTENSITY = 3.0;
const HEMI_INTENSITY = 0.35;
const ENV_INTENSITY = 0.9;
