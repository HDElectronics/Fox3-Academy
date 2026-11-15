/**
 * Shared world shading: one atmosphere (sky gradient, sun glow, altitude-aware aerial perspective), one cloud
 * deck and one procedural land/sea surface, used by the Environment (sky dome, far ground, clouds) and by the
 * attack terrain, so the sky, the haze, the distant ground and the terrain mesh always agree at the horizon.
 *
 * Everything here is a drawing choice for a clean tactical trainer, not geography or weather data. GLSL is plain
 * WebGL2 (it must compile under SwiftShader); identifiers carry a `w` / `atmo` prefix so they never collide with
 * three.js chunks. Scene units are kilometres (1 unit = 1 km).
 */
import { Color, Vector3, Vector4, type MeshStandardMaterial } from 'three';
import type { Palette } from './palette';

type U<T> = { value: T };

/** Uniform objects shared by every world shader of one Stage (same objects, so runtime changes propagate). */
export interface AtmosphereUniforms {
  [name: string]: U<unknown>;
  uSunDir: U<Vector3>;
  uSunGlow: U<Color>;
  uZenith: U<Color>;
  uSkyMid: U<Color>;
  uHorizon: U<Color>;
  uAirHaze: U<Color>;
  /** Sea-level visibility scale (km). */
  uHazeKm: U<number>;
  /** Cloud deck altitude (km), coverage 0..1 (0 = none) and how much its shadow darkens the ground. */
  uCloudAlt: U<number>;
  uCloudCover: U<number>;
  uCloudShadow: U<number>;
  uClock: U<number>;
  /** 0: sea with a coastline (BVR); 1: land with lakes (airfields, SAM ranges). */
  uLandMode: U<number>;
  uFieldA: U<Color>; uFieldB: U<Color>; uFieldC: U<Color>; uFieldD: U<Color>;
  uForest: U<Color>; uScrub: U<Color>; uSoil: U<Color>; uRock: U<Color>; uSand: U<Color>;
  uSeaDeep: U<Color>; uSeaShallow: U<Color>;
}

export function createAtmosphereUniforms(p: Palette, sunDir: Vector3, clock: U<number>, hazeKm = 130): AtmosphereUniforms {
  const c = (x: Color) => ({ value: x.clone() });
  return {
    uSunDir: { value: sunDir },
    uSunGlow: { value: p.sunlight.clone().multiplyScalar(1.0) },
    uZenith: c(p.zenith), uSkyMid: c(p.skyMid), uHorizon: c(p.horizon), uAirHaze: c(p.airHaze),
    uHazeKm: { value: hazeKm },
    uCloudAlt: { value: 2.2 }, uCloudCover: { value: 0 }, uCloudShadow: { value: 0.42 },
    uClock: clock,
    uLandMode: { value: 0 },
    uFieldA: c(p.fieldA), uFieldB: c(p.fieldB), uFieldC: c(p.fieldC), uFieldD: c(p.fieldD),
    uForest: c(p.forest), uScrub: c(p.scrub), uSoil: c(p.soil), uRock: c(p.rock), uSand: c(p.sand),
    uSeaDeep: c(p.seaDeep), uSeaShallow: c(p.seaShallow),
  };
}

/** Hash, value noise and fBm (all 0..1). */
export const W_NOISE = /* glsl */ `
float wHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float wNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), u.x), mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
const mat2 W_ROT = mat2(0.8, 0.6, -0.6, 0.8);
float wFbm3(vec2 p) {
  float s = 0.5 * wNoise(p); p = W_ROT * p * 2.03 + 17.1;
  s += 0.25 * wNoise(p); p = W_ROT * p * 2.01 + 9.2;
  s += 0.125 * wNoise(p);
  return s / 0.875;
}
float wFbm5(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * wNoise(p); p = W_ROT * p * 2.03 + vec2(17.1, 9.2); a *= 0.5; }
  return s / 0.96875;
}`;

/** Atmosphere: sky colour toward a direction, haze colour, altitude-aware aerial perspective. */
export const W_ATMOS = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunGlow;
uniform vec3 uZenith;
uniform vec3 uSkyMid;
uniform vec3 uHorizon;
uniform vec3 uAirHaze;
uniform float uHazeKm;
vec3 atmoGlow(vec3 d) {
  float c = max(dot(d, uSunDir), 0.0);
  return uSunGlow * (pow(c, 5.0) * 0.09 + pow(c, 40.0) * 0.16);
}
/** Colour of the haze seen along unit direction v (camera to point): the horizon band, bluer looking down. */
vec3 atmoHaze(vec3 v) {
  return mix(uHorizon, uAirHaze, smoothstep(0.0, 0.42, -v.y)) + atmoGlow(v);
}
/** Sky toward unit direction d, without the sun disc. Below the horizon it is the haze, so the far ground fades into it. */
vec3 atmoSky(vec3 d) {
  if (d.y < 0.0) return atmoHaze(d);
  float g = sqrt(d.y);
  vec3 col = mix(uHorizon, uSkyMid, smoothstep(0.0, 0.42, g));
  col = mix(col, uZenith, smoothstep(0.38, 1.0, g));
  return col + atmoGlow(d);
}
/** Air mass (km at sea-level density) between two points (km), exponential atmosphere, 8 km scale height. */
float atmoPath(vec3 a, vec3 b) {
  float dist = length(b - a);
  float y0 = max(min(a.y, b.y), 0.0), y1 = max(max(a.y, b.y), 0.0);
  float dy = y1 - y0, e0 = exp(-y0 / 8.0);
  return dist * (dy < 0.02 ? e0 : 8.0 * (e0 - exp(-y1 / 8.0)) / dy);
}
/** Aerial perspective: a blue veil that grows with the air in between, then the horizon haze. */
vec3 atmoApply(vec3 col, vec3 cam, vec3 p) {
  vec3 v = p - cam;
  v /= max(length(v), 1e-6);
  float od = atmoPath(cam, p);
  float air = 1.0 - exp(-od / 28.0);
  col = mix(col, uAirHaze, air * 0.4);
  float fog = 1.0 - exp(-pow(od / uHazeKm, 1.2));
  return mix(col, atmoHaze(v), fog);
}`;

/** Broken cumulus deck: a 2D density field at one altitude, shared by the deck and its ground shadows. */
export const W_CLOUD = /* glsl */ `
uniform float uCloudAlt;
uniform float uCloudCover;
uniform float uCloudShadow;
uniform float uClock;
vec2 wCloudQ(vec2 p) { return p + vec2(uClock * 0.004, uClock * 0.0016); }
/** Cloud groups and cells (no puff detail): enough for shadows, and to skip clear sky early. */
float wCloudBase(vec2 q) { return wFbm5(q * 0.1) * 0.62 + (wFbm3(q * 0.03 + 1.7) - 0.5) * 0.45 + 0.09; }
float wCloudField(vec2 p) { vec2 q = wCloudQ(p); return wCloudBase(q) + wFbm3(q * 0.55 + 7.0) * 0.2; }
float wCloudThr() { return mix(0.7, 0.4, uCloudCover); }
float wCloudAlpha(float n) { float t = wCloudThr(); return smoothstep(t, t + 0.06, n); }
/** 1 = full sun, lower under a cloud (soft: the puff detail is averaged out). */
float wCloudShade(vec3 pos) {
  if (uCloudCover <= 0.0) return 1.0;
  float t = (uCloudAlt - pos.y) / max(uSunDir.y, 0.08);
  if (t <= 0.0) return 1.0;
  float n = wCloudBase(wCloudQ(pos.xz + uSunDir.xz * t)) + 0.1;
  float th = wCloudThr();
  return 1.0 - uCloudShadow * smoothstep(th - 0.03, th + 0.08, n);
}`;

/** Procedural land and sea albedo (p in km, px = pixel footprint in km for anti-aliasing). */
export const W_LAND = /* glsl */ `
uniform float uLandMode;
uniform vec3 uFieldA;
uniform vec3 uFieldB;
uniform vec3 uFieldC;
uniform vec3 uFieldD;
uniform vec3 uForest;
uniform vec3 uScrub;
uniform vec3 uSoil;
uniform vec3 uRock;
uniform vec3 uSand;
uniform vec3 uSeaDeep;
uniform vec3 uSeaShallow;
/** Signed coast value: > 0 land, < 0 water. */
float wCoast(vec2 p) {
  if (uLandMode > 0.5) {
    float lake = wFbm3(p * 0.09 + vec2(31.0, 4.0));
    return 0.66 - lake + 0.5 * exp(-dot(p, p) / 100.0);
  }
  float n = wFbm5(p * 0.0105 + vec2(3.7, 1.3)) - 0.5;
  n += (wFbm3(p * 0.075 + 11.0) - 0.5) * 0.2;
  n += dot(p, vec2(0.0011, -0.0009));
  n -= 0.22 * exp(-dot(p, p) / 1600.0);
  return n - 0.03;
}
vec3 wWaterColour(float c) { return mix(uSeaShallow, uSeaDeep, smoothstep(0.0, 0.05, -c)); }
vec3 wFieldTone(float h) { return h < 0.3 ? uFieldA : (h < 0.58 ? uFieldB : (h < 0.8 ? uFieldC : uFieldD)); }
/**
 * Farmland patchwork with hedges, woods and dry scrub. slopeDeg and hN (0..1 height in the relief) let the
 * terrain push woods and scrub onto slopes and high ground; openG (0..1) keeps a target area open farmland.
 * The flat far ground passes zeros.
 */
vec3 wLand(vec2 p, float px, float slopeDeg, float hN, float openG) {
  float region = wFbm3(p * 0.045 + 5.0);
  float woods = wFbm5(p * 0.3 + 2.0) + (region - 0.5) * 0.6 + slopeDeg * 0.006 + hN * 0.04 - openG * 0.5;
  float fw = max(px * 0.8, 0.006);
  if (px < 0.05) woods += (wNoise(p * 7.0) - 0.5) * 0.05;
  float forest = smoothstep(0.64 - fw, 0.64 + fw, woods);
  vec3 avg = (uFieldA + uFieldB + uFieldC + uFieldD) * 0.25;
  // Seen from far, the patchwork averages out: keep its km-scale light and dark blocks.
  vec3 lOpen = mix(avg, mix(uFieldA, uFieldC, wNoise(p * 0.35 + 4.0)), 0.45) * (0.8 + 0.4 * wFbm3(p * 0.7));
  if (forest < 0.999) {
    float lFar = smoothstep(0.1, 0.42, px);
    if (lFar < 0.999) {
      // Field patchwork: a rotated, gently warped grid; about half the cells split in two.
      vec2 wp = p + (vec2(wNoise(p * 0.5), wNoise(p * 0.5 + 9.3)) - 0.5) * 0.25;
      vec2 q = mat2(0.93, 0.37, -0.37, 0.93) * wp;
      vec2 cs = vec2(0.64, 0.42);
      vec2 g = q / cs;
      vec2 id = floor(g), f = fract(g);
      if (wHash(id + 0.71) > 0.45) { float s = step(0.5, f.x); id = id * 2.0 + vec2(s, 0.0); f.x = fract(f.x * 2.0); cs.x *= 0.5; }
      float h = wHash(id);
      vec3 field = wFieldTone(h) * (0.86 + 0.28 * wHash(id + 3.7));
      // Uneven growth inside each field, rows when close, hedges and tracks along the edges.
      if (px < 0.04) field *= 0.9 + 0.2 * mix(wFbm3(p * 14.0 + h * 40.0), 0.5, smoothstep(0.01, 0.04, px));
      float fine = 1.0 - smoothstep(0.003, 0.01, px);
      if (fine > 0.0) field *= 1.0 - (0.5 + 0.5 * sin((h > 0.5 ? f.x * cs.x : f.y * cs.y) * 520.0)) * 0.08 * fine;
      vec2 e2 = min(f, 1.0 - f) * cs;
      float hedge = (1.0 - smoothstep(0.005, 0.005 + px * 1.2, min(e2.x, e2.y))) * (1.0 - smoothstep(0.02, 0.07, px));
      field = mix(field, uForest, hedge * 0.6);
      lOpen = mix(field, lOpen, lFar);
    }
    float dry = smoothstep(0.6, 0.78, region + hN * 0.12 + slopeDeg * 0.006) * (1.0 - openG);
    if (dry > 0.0) lOpen = mix(lOpen, mix(uScrub, uFieldC, 0.4 * wNoise(p * 2.3)) * (0.9 + 0.2 * wNoise(p * 9.0)), dry * 0.55);
  }
  if (forest <= 0.001) return lOpen;
  // Woods: stands of lighter and darker trees, then crowns when the eye is close enough.
  float stands = wNoise(p * 4.0) * 0.6 + wNoise(p * 11.0) * 0.4;
  float crowns = 0.5;
  if (px < 0.01) crowns = mix(wNoise(p * 60.0) * 0.35 + wNoise(p * 190.0) * 0.65, 0.5, smoothstep(0.002, 0.01, px));
  vec3 trees = uForest * (0.8 + 0.36 * stands) * (0.6 + 0.8 * crowns);
  return mix(lOpen, trees, forest);
}`;

/** Grid lines (spacing in km), anti-aliased, fading out where they would crowd. */
export const W_GRID = /* glsl */ `
uniform vec3 uGridColor;
uniform float uGridKm;
uniform float uGridAlpha;
float wGridLine(vec2 p, float spacing) {
  vec2 q = p / spacing;
  vec2 fw = max(fwidth(q), vec2(1e-5));
  vec2 g = abs(fract(q - 0.5) - 0.5) / fw;
  float l = 1.0 - min(min(g.x, g.y), 1.0);
  return l * clamp(1.0 - max(fw.x, fw.y) * 3.0, 0.0, 1.0);
}`;

export interface SurfacePatch {
  /** 'ground': the Environment's far ground (sea or land, grid). 'terrain': the attack height-field mesh. */
  kind: 'ground' | 'terrain';
  atmosphere: AtmosphereUniforms;
  /** Ground: the km grid uniforms. */
  grid?: { uGridColor: U<Color>; uGridKm: U<number>; uGridAlpha: U<number> };
  /** Terrain: fine albedo and normal detail for pod zoom. Default true. */
  detail?: boolean;
  /** Terrain: cleared pads (x, z, inner, outer radius in km); up to 8. */
  pads?: U<Vector4[]>;
  /** Terrain: relief (m) for height-based tinting. */
  reliefM?: number;
}

export const MAX_PADS = 8;

/** World position of the vertex (km), instance transform included (props are InstancedMeshes). */
const WORLD_POS = /* glsl */ `{
  vec4 wLocal = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  wLocal = instanceMatrix * wLocal;
  #endif
  vWorldPos = (modelMatrix * wLocal).xyz;
}`;

/**
 * Patch a MeshStandardMaterial into a world surface: procedural albedo, water roughness and ripples, fine normal
 * detail, cloud shadows, the km grid (ground) and the shared aerial perspective. Lighting stays three.js
 * (sun, hemisphere, environment map), so the far ground and the terrain mesh are lit exactly alike.
 */
export function patchSurface(material: MeshStandardMaterial, o: SurfacePatch): void {
  const terrain = o.kind === 'terrain';
  const detail = o.detail !== false;
  material.defines = { ...material.defines, [terrain ? 'W_TERRAIN' : 'W_GROUND']: '', ...(detail ? { W_DETAIL: '' } : {}) };
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, o.atmosphere);
    if (o.grid) Object.assign(shader.uniforms, o.grid);
    if (terrain) {
      shader.uniforms.uPads = o.pads ?? { value: Array.from({ length: MAX_PADS }, () => new Vector4(0, 0, -1, -1)) };
      shader.uniforms.uRelief = { value: Math.max(1, o.reliefM ?? 600) };
    }
    shader.vertexShader = /* glsl */ `
varying vec3 vWorldPos;
#ifdef W_TERRAIN
varying vec3 vTerrainN;
varying float vTerrainH;
#endif
` + shader.vertexShader.replace('#include <begin_vertex>', /* glsl */ `#include <begin_vertex>
${WORLD_POS}
#ifdef W_TERRAIN
vTerrainN = normal;
vTerrainH = position.y;
#endif`);
    shader.fragmentShader = /* glsl */ `
varying vec3 vWorldPos;
#ifdef W_TERRAIN
varying vec3 vTerrainN;
varying float vTerrainH;
uniform vec4 uPads[${MAX_PADS}];
uniform float uRelief;
#endif
${W_NOISE}
${W_ATMOS}
${W_CLOUD}
${W_LAND}
#ifdef W_GROUND
${W_GRID}
#endif
/** Gradient of value noise at frequency f (per km), for normal detail. */
vec2 wNoiseGrad(vec2 p, float f) {
  float e = 0.35;
  vec2 q = p * f;
  float n0 = wNoise(q);
  return vec2(wNoise(q + vec2(e, 0.0)) - n0, wNoise(q + vec2(0.0, e)) - n0) / e;
}
` + shader.fragmentShader
      .replace('#include <color_fragment>', /* glsl */ `#include <color_fragment>
vec2 wP = vWorldPos.xz;
// Pixel footprint (km): between the two screen axes, so grazing views low over the ground keep their detail.
float wPx = max(mix(sqrt(length(dFdx(wP)) * length(dFdy(wP))), length(fwidth(wP)), 0.3), 1e-6);
float wWater = 0.0;
vec2 wBump = vec2(0.0);
#ifdef W_GROUND
{
  float wC = wCoast(wP);
  float wCw = max(fwidth(wC), 1e-6);
  wWater = 1.0 - smoothstep(-wCw, wCw, wC);
  vec3 wAlb = uSand;
  if (wWater < 0.999) {
    // Land world: keep open farmland around the origin (the airfield) instead of woods.
    wAlb = wLand(wP, wPx, 0.0, 0.0, uLandMode * exp(-dot(wP, wP) / 12.0));
    wAlb = mix(wAlb, uSand, (1.0 - smoothstep(0.0, 0.002 + 1.5 * wCw, wC)) * 0.6);
  }
  diffuseColor.rgb = mix(wAlb, wWaterColour(wC), wWater);
  // Wind ripples near the eye; far away the roughness carries the glint.
  float wRip = (1.0 - smoothstep(0.004, 0.03, wPx)) * wWater;
  if (wRip > 0.0) wBump = (wNoiseGrad(wP, 38.0) * 0.6 + wNoiseGrad(wP, 13.0) * 0.4) * 0.05 * wRip;
}
#endif
#ifdef W_TERRAIN
{
  vec3 wTN = normalize(vTerrainN);
  float wSlope = degrees(acos(clamp(wTN.y, 0.0, 1.0)));
  float wH = clamp(vTerrainH / uRelief, 0.0, 1.0);
  float wPad = 0.0, wJit = 0.92 + 0.16 * wNoise(wP * 3.0);
  for (int i = 0; i < ${MAX_PADS}; i++) {
    vec4 d = uPads[i];
    if (d.w > 0.0) wPad = max(wPad, 1.0 - smoothstep(d.z, d.w, length(wP - d.xy) * wJit));
  }
  vec3 wAlb = wLand(wP, wPx, wSlope * (1.0 - wPad), wH, wPad);
  wAlb = mix(wAlb, uSoil * (0.86 + 0.28 * wNoise(wP * 32.0)), smoothstep(13.0, 22.0, wSlope) * 0.65);
  wAlb = mix(wAlb, uRock * (0.82 + 0.36 * wNoise(wP * 55.0)), smoothstep(22.0, 34.0, wSlope));
  #ifdef W_DETAIL
  float wNear = 1.0 - smoothstep(0.0015, 0.008, wPx);
  wAlb *= 1.0 + (wNoise(wP * 400.0) - 0.5) * 0.18 * wNear + (wNoise(wP * 55.0) - 0.5) * 0.2 * (1.0 - smoothstep(0.006, 0.03, wPx))
    + (wNoise(wP * 16.0) - 0.5) * 0.14 * (1.0 - smoothstep(0.02, 0.08, wPx));
  wBump = (wNoiseGrad(wP, 26.0) * 0.1 * (1.0 - smoothstep(0.01, 0.05, wPx)) + wNoiseGrad(wP, 140.0) * 0.02 * wNear);
  #endif
  diffuseColor.rgb = wAlb;
}
#endif`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.3, wWater);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
#ifdef W_TERRAIN
{
  // Hill shading: the field's own normal, its slope drawn 1.6x steeper so gentle relief reads from altitude.
  vec3 wN = normalize(vTerrainN);
  wN = normalize(vec3(wN.x * 1.6 - wBump.x, wN.y, wN.z * 1.6 - wBump.y));
  normal = normalize((viewMatrix * vec4(wN, 0.0)).xyz);
}
#else
if (wBump.x != 0.0 || wBump.y != 0.0) normal = normalize(normal + (viewMatrix * vec4(-wBump.x, 0.0, -wBump.y, 0.0)).xyz);
#endif`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
{
  float wShade = wCloudShade(vWorldPos);
  reflectedLight.directDiffuse *= wShade;
  reflectedLight.directSpecular *= wShade;
}`)
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
#ifdef W_GROUND
gl_FragColor.rgb = mix(gl_FragColor.rgb, uGridColor, (wGridLine(wP, uGridKm) * 0.45 + wGridLine(wP, uGridKm * 5.0) * 0.55) * uGridAlpha);
#endif
gl_FragColor.rgb = atmoApply(gl_FragColor.rgb, cameraPosition, vWorldPos);`);
  };
  material.customProgramCacheKey = () => `world-surface-v2:${o.kind}:${detail ? 1 : 0}`;
}

/**
 * Give a plain lit material (runway, props, ship) the shared aerial perspective, so it fades into the haze exactly
 * like the ground around it. `key` must be unique per distinct material setup.
 */
export function patchHaze(material: MeshStandardMaterial, atmosphere: AtmosphereUniforms, key = 'haze'): void {
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, atmosphere);
    shader.vertexShader = 'varying vec3 vWorldPos;\n' + shader.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>\n${WORLD_POS}`);
    shader.fragmentShader = `varying vec3 vWorldPos;\n${W_ATMOS}\n` + shader.fragmentShader.replace('#include <opaque_fragment>',
      '#include <opaque_fragment>\ngl_FragColor.rgb = atmoApply(gl_FragColor.rgb, cameraPosition, vWorldPos);');
  };
  material.customProgramCacheKey = () => `world-haze-v1:${key}`;
}
