/**
 * Environment: a hazy high-altitude day. Ultramarine zenith fading to pale haze at the horizon, a sun
 * glow, a desaturated sea or land surface at altitude 0 with a faint 10 km grid and distance haze,
 * an optional sparse cloud layer, and the lights for flat-shaded models. Colours come from tokens.
 */
import {
  BackSide, Color, DirectionalLight, HemisphereLight, Mesh, PlaneGeometry, ShaderMaterial, SphereGeometry, Vector3,
} from 'three';
import type { Stage } from './stage';
import { FRAG_END, FRAG_PRELUDE, ORDER, VERT_END, VERT_PRELUDE } from './shared';

export interface EnvironmentOptions {
  /** 'sea' (default) or muted 'land'. */
  surface?: 'sea' | 'land';
  /** Faint km grid on the surface. Default true. */
  grid?: boolean;
  /** Grid spacing in km. Default 10 (every fifth line slightly stronger). */
  gridKm?: number;
  /** Sparse cloud layer. Default false. */
  clouds?: boolean | CloudOptions;
  /** Sun azimuth, degrees clockwise from north. Default 140. */
  sunAzimuthDeg?: number;
  /** Sun elevation, degrees. Default 48. */
  sunElevationDeg?: number;
  /** Sea-level visibility scale (km) at which haze reaches ~63 %; thinner with altitude. Default 130. */
  hazeKm?: number;
}

export interface CloudOptions {
  /** Cloud-layer altitude in metres. Default 2400. */
  altitudeM?: number;
  /** 0..1, default 0.32. */
  coverage?: number;
}

const NOISE = /* glsl */ `
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; }
  return s;
}`;

const skyVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
}`;

const skyFrag = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uHaze;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uBelow;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col;
  if (h >= 0.0) {
    float k = pow(clamp(h, 0.0, 1.0), 0.42);
    col = mix(uHorizon, uTop, smoothstep(0.0, 1.0, k));
    col = mix(col, uHaze, exp(-h * 22.0) * 0.55);
  } else {
    col = mix(uHaze, uBelow, clamp(-h * 3.0, 0.0, 1.0));
  }
  float s = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (smoothstep(0.99965, 0.99985, s) * 0.9 + pow(s, 90.0) * 0.28 + pow(s, 9.0) * 0.07);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const groundVert = /* glsl */ `
${VERT_PRELUDE}
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
  ${VERT_END}
}`;

const groundFrag = /* glsl */ `
${FRAG_PRELUDE}
uniform vec3 uGround;
uniform vec3 uHaze;
uniform vec3 uGrid;
uniform vec3 uCam;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uHazeKm;
uniform float uGridKm;
uniform float uGridAlpha;
uniform float uSea;
varying vec3 vWorld;
${NOISE}
float gridLine(vec2 p, float spacing) {
  vec2 q = p / spacing;
  vec2 fw = max(fwidth(q), vec2(1e-5));
  vec2 g = abs(fract(q - 0.5) - 0.5) / fw;
  float l = 1.0 - min(min(g.x, g.y), 1.0);
  float lod = clamp(1.0 - max(fw.x, fw.y) * 3.0, 0.0, 1.0); // fade out when lines crowd (moire)
  return l * lod;
}
void main() {
  vec2 p = vWorld.xz;
  vec3 col = uGround;
  if (uSea > 0.5) {
    float n = fbm(p * 0.018) * 0.6 + fbm(p * 0.11) * 0.4;
    col *= 0.9 + 0.2 * n;
  } else {
    float n = fbm(p * 0.012);
    float m = fbm(p * 0.07 + 3.0);
    col *= 0.78 + 0.34 * n;
    col = mix(col, col * vec3(1.05, 1.02, 0.9), smoothstep(0.45, 0.7, m) * 0.5);
  }
  vec3 toCam = uCam - vWorld;
  float dist = length(toCam);
  vec3 v = toCam / max(dist, 1e-4);
  // Sun glint / diffuse brightening toward the sun.
  vec3 hv = normalize(v + uSunDir);
  float spec = pow(max(hv.y, 0.0), uSea > 0.5 ? 180.0 : 30.0);
  col += uSunColor * spec * (uSea > 0.5 ? 0.22 : 0.06);
  float grid = gridLine(p, uGridKm) * 0.45 + gridLine(p, uGridKm * 5.0) * 0.55;
  col = mix(col, uGrid, grid * uGridAlpha);
  // Haze thins with altitude (scale height ~8 km): integrate density along the ray to the surface.
  float hc = max(uCam.y, 0.001);
  float od = dist * (8.0 / hc) * (1.0 - exp(-hc / 8.0));
  float fog = 1.0 - exp(-pow(od / uHazeKm, 1.15));
  // Thicker haze near the horizon (grazing view).
  fog = max(fog, smoothstep(0.12, 0.0, v.y) * 0.55 * min(1.0, dist / 40.0));
  col = mix(col, uHaze, clamp(fog, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
  ${FRAG_END}
}`;

const cloudVert = groundVert;
const cloudFrag = /* glsl */ `
${FRAG_PRELUDE}
uniform vec3 uCam;
uniform vec3 uTopColor;
uniform vec3 uBaseColor;
uniform vec3 uHaze;
uniform float uCoverage;
uniform float uHazeKm;
uniform float uClock;
varying vec3 vWorld;
${NOISE}
void main() {
  vec2 p = vWorld.xz + vec2(uClock * 0.004, uClock * 0.002);
  float n = fbm(p * 0.09) * 0.65 + fbm(p * 0.33 + 7.0) * 0.35;
  float thr = 1.0 - uCoverage;
  float a = smoothstep(thr, thr + 0.16, n);
  vec3 toCam = uCam - vWorld;
  float dist = length(toCam);
  a *= 1.0 - smoothstep(180.0, 280.0, dist);
  if (a < 0.1) discard;
  float lit = smoothstep(thr, thr + 0.35, n);
  vec3 col = uCam.y > vWorld.y ? mix(uBaseColor, uTopColor, 0.55 + 0.45 * lit) : mix(uBaseColor * 0.86, uBaseColor, lit);
  float hc = max(uCam.y, vWorld.y + 0.001);
  float h0 = min(uCam.y, vWorld.y);
  float od = dist * exp(-h0 / 8.0) * (8.0 / max(hc - h0, 0.001)) * (1.0 - exp(-max(hc - h0, 0.001) / 8.0));
  float fog = 1.0 - exp(-pow(od / uHazeKm, 1.15));
  col = mix(col, uHaze, fog * 0.9);
  gl_FragColor = vec4(col, a * 0.92);
  ${FRAG_END}
}`;

export class Environment {
  readonly sunDirection = new Vector3();
  readonly sky: Mesh<SphereGeometry, ShaderMaterial>;
  readonly ground: Mesh<PlaneGeometry, ShaderMaterial>;
  readonly clouds: Mesh<PlaneGeometry, ShaderMaterial>;
  readonly sun: DirectionalLight;
  readonly hemi: HemisphereLight;
  private off: () => void;
  private stage: Stage;

  constructor(stage: Stage, opts: EnvironmentOptions = {}) {
    this.stage = stage;
    const p = stage.palette;
    const az = ((opts.sunAzimuthDeg ?? 140) * Math.PI) / 180;
    const el = ((opts.sunElevationDeg ?? 48) * Math.PI) / 180;
    this.sunDirection.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();

    // Sky dome (follows the camera; drawn first, no depth).
    this.sky = new Mesh(
      new SphereGeometry(1500, 48, 24),
      new ShaderMaterial({
        uniforms: {
          uTop: { value: p.skyTop.clone() },
          uHorizon: { value: p.skyHorizon.clone().lerp(p.skyTop, 0.12) },
          uHaze: { value: p.haze.clone() },
          uBelow: { value: p.haze.clone().lerp(p.earth, 0.25) },
          uSunDir: { value: this.sunDirection },
          uSunColor: { value: p.sun.clone() },
        },
        vertexShader: skyVert, fragmentShader: skyFrag,
        side: BackSide, depthWrite: false, depthTest: false, toneMapped: false,
      }),
    );
    this.sky.renderOrder = ORDER.sky;
    this.sky.frustumCulled = false;
    stage.scene.add(this.sky);

    // Surface at altitude 0.
    const surface = opts.surface ?? 'sea';
    this.ground = new Mesh(
      new PlaneGeometry(4000, 4000, 1, 1).rotateX(-Math.PI / 2),
      new ShaderMaterial({
        uniforms: {
          uGround: { value: (surface === 'sea' ? p.sea : p.earth).clone() },
          uHaze: { value: p.haze.clone() },
          uGrid: { value: p.skyHorizon.clone().lerp(p.missile, 0.4) },
          uCam: { value: new Vector3() },
          uSunDir: { value: this.sunDirection },
          uSunColor: { value: p.sun.clone() },
          uHazeKm: { value: opts.hazeKm ?? 130 },
          uGridKm: { value: opts.gridKm ?? 10 },
          uGridAlpha: { value: opts.grid === false ? 0 : 0.13 },
          uSea: { value: surface === 'sea' ? 1 : 0 },
        },
        vertexShader: groundVert, fragmentShader: groundFrag, toneMapped: false,
      }),
    );
    this.ground.renderOrder = ORDER.ground;
    this.ground.frustumCulled = false;
    stage.scene.add(this.ground);

    // Clouds.
    this.clouds = new Mesh(
      new PlaneGeometry(600, 600, 1, 1).rotateX(-Math.PI / 2),
      new ShaderMaterial({
        uniforms: {
          uCam: { value: new Vector3() },
          uTopColor: { value: p.missile.clone().lerp(p.sun, 0.3) },
          uBaseColor: { value: p.skyHorizon.clone().lerp(p.smoke, 0.4) },
          uHaze: { value: p.haze.clone() },
          uCoverage: { value: 0.32 },
          uHazeKm: { value: opts.hazeKm ?? 130 },
          uClock: stage.shared.uClock,
        },
        vertexShader: cloudVert, fragmentShader: cloudFrag,
        transparent: true, depthWrite: true, side: 2 /* DoubleSide */, toneMapped: false,
      }),
    );
    this.clouds.renderOrder = ORDER.clouds;
    this.clouds.frustumCulled = false;
    this.clouds.visible = false;
    stage.scene.add(this.clouds);
    this.setClouds(opts.clouds ?? false);

    // Lights for flat-shaded models.
    this.hemi = new HemisphereLight(p.skyHorizon.clone().lerp(p.skyTop, 0.35), p.earth.clone(), 1.35);
    this.sun = new DirectionalLight(p.sun.clone(), 2.3);
    this.sun.position.copy(this.sunDirection);
    stage.scene.add(this.hemi, this.sun, this.sun.target);

    this.off = stage.onFrame(() => this.update(), { priority: 400, always: true });
  }

  setSurface(s: 'sea' | 'land'): void {
    const p = this.stage.palette;
    const u = this.ground.material.uniforms;
    (u.uGround.value as Color).copy(s === 'sea' ? p.sea : p.earth);
    u.uSea.value = s === 'sea' ? 1 : 0;
  }

  setGrid(on: boolean): void { this.ground.material.uniforms.uGridAlpha.value = on ? 0.13 : 0; }

  setClouds(c: boolean | CloudOptions): void {
    if (!c) { this.clouds.visible = false; return; }
    const o = c === true ? {} : c;
    this.clouds.visible = true;
    this.clouds.position.y = (o.altitudeM ?? 2400) / 1000;
    this.clouds.material.uniforms.uCoverage.value = Math.min(1, Math.max(0, o.coverage ?? 0.32));
  }

  /** Follow the camera (called by the Stage every frame). */
  update(): void {
    const cam = this.stage.camera.position;
    this.sky.position.copy(cam);
    this.ground.position.set(cam.x, 0, cam.z);
    (this.ground.material.uniforms.uCam.value as Vector3).copy(cam);
    this.clouds.position.x = cam.x; this.clouds.position.z = cam.z;
    (this.clouds.material.uniforms.uCam.value as Vector3).copy(cam);
  }

  dispose(): void {
    this.off();
    for (const m of [this.sky, this.ground, this.clouds]) { m.removeFromParent(); m.geometry.dispose(); m.material.dispose(); }
    this.hemi.removeFromParent(); this.sun.removeFromParent(); this.sun.target.removeFromParent();
    this.sun.dispose(); this.hemi.dispose();
  }
}
